use crate::fs_ops::FsCacheState;
use crate::models::{
    normalize_path_str, ConflictStrategy, JobStatus, TransferJobSnapshot, TransferJobType,
};
use parking_lot::Mutex;
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;
use uuid::Uuid;
use walkdir::WalkDir;

const CHUNK_BUFFER_SIZE: usize = 2 * 1024 * 1024; // 2 MB 緩衝區，避免大型檔案阻塞記憶體或 I/O

pub struct JobControl {
    pub paused: AtomicBool,
    pub cancelled: AtomicBool,
}

impl JobControl {
    pub fn new() -> Self {
        Self {
            paused: AtomicBool::new(false),
            cancelled: AtomicBool::new(false),
        }
    }
}

pub struct QueueManager {
    jobs: Arc<Mutex<Vec<TransferJobSnapshot>>>,
    controls: Arc<Mutex<HashMap<String, Arc<JobControl>>>>,
    sender: mpsc::UnboundedSender<String>,
    cache_state: Arc<FsCacheState>,
    app_handle: Mutex<Option<AppHandle>>,
}

impl QueueManager {
    pub fn new(cache_state: Arc<FsCacheState>) -> Arc<Self> {
        let (tx, mut rx) = mpsc::unbounded_channel::<String>();
        let jobs = Arc::new(Mutex::new(Vec::new()));
        let controls = Arc::new(Mutex::new(HashMap::new()));

        let manager = Arc::new(Self {
            jobs,
            controls,
            sender: tx,
            cache_state,
            app_handle: Mutex::new(None),
        });

        let manager_worker = Arc::clone(&manager);
        // 啟動背景非同步佇列 Worker（依序或受控執行佇列中的檔案任務）
        tauri::async_runtime::spawn(async move {
            while let Some(job_id) = rx.recv().await {
                let mgr = Arc::clone(&manager_worker);
                let _ = tokio::task::spawn_blocking(move || {
                    mgr.process_job(&job_id);
                })
                .await;
            }
        });

        manager
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        *self.app_handle.lock() = Some(handle);
    }

    fn emit_update(&self) {
        if let Some(app) = self.app_handle.lock().as_ref() {
            let snapshots = self.list_jobs();
            let _ = app.emit("queue://updated", snapshots);
        }
    }

    pub fn enqueue_job(
        &self,
        job_type: TransferJobType,
        sources: Vec<String>,
        destination: Option<String>,
        conflict_strategy: ConflictStrategy,
    ) -> TransferJobSnapshot {
        let id = Uuid::new_v4().to_string();
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let snapshot = TransferJobSnapshot {
            id: id.clone(),
            job_type,
            sources,
            destination,
            conflict_strategy,
            status: JobStatus::Queued,
            total_bytes: 0,
            processed_bytes: 0,
            total_files: 0,
            processed_files: 0,
            current_file: "等待佇列排程...".to_string(),
            speed_bytes_per_sec: 0,
            created_at_ms: now_ms,
            error_message: None,
        };

        self.jobs.lock().insert(0, snapshot.clone());
        self.controls
            .lock()
            .insert(id.clone(), Arc::new(JobControl::new()));
        let _ = self.sender.send(id);
        self.emit_update();

        snapshot
    }

    pub fn list_jobs(&self) -> Vec<TransferJobSnapshot> {
        self.jobs.lock().clone()
    }

    pub fn control_job(&self, job_id: &str, action: &str) -> Result<Vec<TransferJobSnapshot>, String> {
        let ctrl_opt = self.controls.lock().get(job_id).cloned();
        match action {
            "pause" => {
                if let Some(ctrl) = ctrl_opt {
                    ctrl.paused.store(true, Ordering::SeqCst);
                }
                self.update_job(job_id, |j| {
                    if j.status == JobStatus::Running || j.status == JobStatus::Scanning {
                        j.status = JobStatus::Paused;
                    }
                });
            }
            "resume" => {
                if let Some(ctrl) = ctrl_opt {
                    ctrl.paused.store(false, Ordering::SeqCst);
                }
                self.update_job(job_id, |j| {
                    if j.status == JobStatus::Paused {
                        j.status = JobStatus::Running;
                    }
                });
            }
            "cancel" => {
                if let Some(ctrl) = ctrl_opt {
                    ctrl.cancelled.store(true, Ordering::SeqCst);
                    ctrl.paused.store(false, Ordering::SeqCst);
                }
                self.update_job(job_id, |j| {
                    if j.status != JobStatus::Completed && j.status != JobStatus::Failed {
                        j.status = JobStatus::Cancelled;
                        j.current_file = "已取消".to_string();
                    }
                });
            }
            "remove" => {
                self.jobs.lock().retain(|j| j.id != job_id);
                self.controls.lock().remove(job_id);
            }
            "clear_completed" => {
                self.jobs.lock().retain(|j| {
                    !matches!(
                        j.status,
                        JobStatus::Completed | JobStatus::Cancelled | JobStatus::Failed
                    )
                });
            }
            _ => return Err(format!("不支援的佇列控制指令: {}", action)),
        }
        self.emit_update();
        Ok(self.list_jobs())
    }

    fn update_job<F>(&self, job_id: &str, updater: F)
    where
        F: FnOnce(&mut TransferJobSnapshot),
    {
        let mut guard = self.jobs.lock();
        if let Some(job) = guard.iter_mut().find(|j| j.id == job_id) {
            updater(job);
        }
    }

    fn check_pause_or_cancel(&self, ctrl: &JobControl) -> bool {
        while ctrl.paused.load(Ordering::SeqCst) {
            if ctrl.cancelled.load(Ordering::SeqCst) {
                return true;
            }
            std::thread::sleep(Duration::from_millis(120));
        }
        ctrl.cancelled.load(Ordering::SeqCst)
    }

    fn process_job(&self, job_id: &str) {
        let snapshot_opt = self
            .jobs
            .lock()
            .iter()
            .find(|j| j.id == job_id)
            .cloned();
        let ctrl_opt = self.controls.lock().get(job_id).cloned();

        let (snapshot, ctrl) = match (snapshot_opt, ctrl_opt) {
            (Some(s), Some(c)) => (s, c),
            _ => return,
        };

        if ctrl.cancelled.load(Ordering::SeqCst) {
            return;
        }

        // 1. 掃描階段：統計總檔案數與總位元組
        self.update_job(job_id, |j| {
            j.status = JobStatus::Scanning;
            j.current_file = "正在掃描來源檔案結構與大小...".to_string();
        });
        self.emit_update();

        let mut total_bytes = 0u64;
        let mut total_files = 0usize;

        for src in &snapshot.sources {
            if self.check_pause_or_cancel(&ctrl) {
                return;
            }
            let p = PathBuf::from(src);
            if p.is_file() {
                total_files += 1;
                total_bytes += fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
            } else if p.is_dir() {
                for entry in WalkDir::new(&p).into_iter().filter_map(|e| e.ok()) {
                    if entry.file_type().is_file() {
                        total_files += 1;
                        total_bytes += entry.metadata().map(|m| m.len()).unwrap_or(0);
                    }
                }
            }
        }

        self.update_job(job_id, |j| {
            j.status = JobStatus::Running;
            j.total_bytes = total_bytes;
            j.total_files = total_files.max(1);
        });
        self.emit_update();

        let start_time = Instant::now();
        let mut processed_bytes = 0u64;
        let mut processed_files = 0usize;

        let result = match snapshot.job_type {
            TransferJobType::Trash => self.execute_trash(
                job_id,
                &snapshot.sources,
                &ctrl,
                &mut processed_files,
            ),
            TransferJobType::Delete => self.execute_delete(
                job_id,
                &snapshot.sources,
                &ctrl,
                &mut processed_files,
                &mut processed_bytes,
                start_time,
            ),
            TransferJobType::Copy | TransferJobType::Move => {
                let dest_dir = match &snapshot.destination {
                    Some(d) => PathBuf::from(d),
                    None => {
                        self.fail_job(job_id, "缺少目標目錄路徑".to_string());
                        return;
                    }
                };
                self.execute_copy_or_move(
                    job_id,
                    snapshot.job_type == TransferJobType::Move,
                    &snapshot.sources,
                    &dest_dir,
                    snapshot.conflict_strategy,
                    &ctrl,
                    &mut processed_files,
                    &mut processed_bytes,
                    start_time,
                )
            }
        };

        // 清除受影響目錄之快取
        for src in &snapshot.sources {
            if let Some(parent) = Path::new(src).parent() {
                self.cache_state.invalidate_path(parent);
            }
        }
        if let Some(dest) = &snapshot.destination {
            self.cache_state.invalidate_path(Path::new(dest));
        }

        match result {
            Ok(()) => {
                if !ctrl.cancelled.load(Ordering::SeqCst) {
                    let elapsed_secs = start_time.elapsed().as_secs_f64().max(0.001);
                    let speed = (processed_bytes as f64 / elapsed_secs) as u64;
                    self.update_job(job_id, |j| {
                        j.status = JobStatus::Completed;
                        j.processed_bytes = j.total_bytes;
                        j.processed_files = j.total_files;
                        j.speed_bytes_per_sec = speed;
                        j.current_file = "任務完成".to_string();
                    });
                    self.emit_update();
                }
            }
            Err(err) => {
                self.fail_job(job_id, err);
            }
        }
    }

    fn fail_job(&self, job_id: &str, err: String) {
        self.update_job(job_id, |j| {
            j.status = JobStatus::Failed;
            j.error_message = Some(err.clone());
            j.current_file = format!("錯誤: {}", err);
        });
        self.emit_update();
    }

    fn execute_trash(
        &self,
        job_id: &str,
        sources: &[String],
        ctrl: &JobControl,
        processed_files: &mut usize,
    ) -> Result<(), String> {
        for src in sources {
            if self.check_pause_or_cancel(ctrl) {
                return Ok(());
            }
            let p = PathBuf::from(src);
            let name = p
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| src.clone());

            self.update_job(job_id, |j| {
                j.current_file = format!("移至資源回收桶: {}", name);
            });
            self.emit_update();

            // 優先移至系統資源回收桶，若環境無桌面回收桶則安全回退刪除
            if let Err(e) = trash::delete(&p) {
                return Err(format!("無法移至資源回收桶 ({}): {}", name, e));
            }
            *processed_files += 1;
            self.update_job(job_id, |j| {
                j.processed_files = *processed_files;
            });
            self.emit_update();
        }
        Ok(())
    }

    fn execute_delete(
        &self,
        job_id: &str,
        sources: &[String],
        ctrl: &JobControl,
        processed_files: &mut usize,
        processed_bytes: &mut u64,
        start_time: Instant,
    ) -> Result<(), String> {
        for src in sources {
            if self.check_pause_or_cancel(ctrl) {
                return Ok(());
            }
            let p = PathBuf::from(src);
            if !p.exists() {
                continue;
            }
            if p.is_file() || p.is_symlink() {
                let len = fs::metadata(&p).map(|m| m.len()).unwrap_or(0);
                fs::remove_file(&p).map_err(|e| format!("刪除檔案失敗 ({}): {}", src, e))?;
                *processed_files += 1;
                *processed_bytes += len;
            } else if p.is_dir() {
                fs::remove_dir_all(&p).map_err(|e| format!("刪除目錄失敗 ({}): {}", src, e))?;
                *processed_files += 1;
            }
            let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
            let speed = (*processed_bytes as f64 / elapsed) as u64;
            self.update_job(job_id, |j| {
                j.processed_files = *processed_files;
                j.processed_bytes = *processed_bytes;
                j.speed_bytes_per_sec = speed;
                j.current_file = normalize_path_str(&p);
            });
            self.emit_update();
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn execute_copy_or_move(
        &self,
        job_id: &str,
        is_move: bool,
        sources: &[String],
        dest_dir: &Path,
        strategy: ConflictStrategy,
        ctrl: &JobControl,
        processed_files: &mut usize,
        processed_bytes: &mut u64,
        start_time: Instant,
    ) -> Result<(), String> {
        if !dest_dir.exists() {
            fs::create_dir_all(dest_dir)
                .map_err(|e| format!("無法建立目標目錄 ({}): {}", dest_dir.display(), e))?;
        }

        for src_str in sources {
            if self.check_pause_or_cancel(ctrl) {
                return Ok(());
            }
            let src_path = PathBuf::from(src_str);
            if !src_path.exists() {
                return Err(format!("來源不存在: {}", src_str));
            }

            let file_name = src_path
                .file_name()
                .ok_or_else(|| format!("無效的來源名稱: {}", src_str))?;
            let target_path = resolve_target_path(dest_dir.join(file_name), strategy, &src_path)?;
            let target_path = match target_path {
                Some(t) => t,
                None => {
                    // Skip
                    *processed_files += 1;
                    continue;
                }
            };

            // 防止將目錄複製或搬移到自己的子目錄中
            if src_path.is_dir() && target_path.starts_with(&src_path) && target_path != src_path {
                return Err("無法將目錄複製或搬移至其自身的子目錄內".to_string());
            }

            // 如果是同磁碟區的 Move 且目標未衝突，可嘗試 O(1) 原地 rename
            if is_move && src_path != target_path && fs::rename(&src_path, &target_path).is_ok() {
                let len = fs::metadata(&target_path).map(|m| m.len()).unwrap_or(0);
                *processed_files += 1;
                *processed_bytes += len;
                self.update_job(job_id, |j| {
                    j.processed_files = *processed_files;
                    j.processed_bytes = *processed_bytes;
                    j.current_file = normalize_path_str(&target_path);
                });
                self.emit_update();
                continue;
            }

            if src_path.is_file() {
                self.copy_file_chunked(
                    job_id,
                    &src_path,
                    &target_path,
                    ctrl,
                    processed_files,
                    processed_bytes,
                    start_time,
                )?;
                if is_move && !ctrl.cancelled.load(Ordering::SeqCst) {
                    let _ = fs::remove_file(&src_path);
                }
            } else if src_path.is_dir() {
                self.copy_dir_recursive(
                    job_id,
                    &src_path,
                    &target_path,
                    strategy,
                    ctrl,
                    processed_files,
                    processed_bytes,
                    start_time,
                )?;
                if is_move && !ctrl.cancelled.load(Ordering::SeqCst) {
                    let _ = fs::remove_dir_all(&src_path);
                }
            }
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn copy_dir_recursive(
        &self,
        job_id: &str,
        src_dir: &Path,
        dst_dir: &Path,
        strategy: ConflictStrategy,
        ctrl: &JobControl,
        processed_files: &mut usize,
        processed_bytes: &mut u64,
        start_time: Instant,
    ) -> Result<(), String> {
        fs::create_dir_all(dst_dir).map_err(|e| e.to_string())?;
        for entry in WalkDir::new(src_dir).into_iter().filter_map(|e| e.ok()) {
            if self.check_pause_or_cancel(ctrl) {
                return Ok(());
            }
            let path = entry.path();
            let rel = path.strip_prefix(src_dir).map_err(|e| e.to_string())?;
            if rel.as_os_str().is_empty() {
                continue;
            }
            let target = dst_dir.join(rel);
            if entry.file_type().is_dir() {
                fs::create_dir_all(&target).map_err(|e| e.to_string())?;
            } else if entry.file_type().is_file() {
                if let Some(resolved_target) = resolve_target_path(target, strategy, path)? {
                    self.copy_file_chunked(
                        job_id,
                        path,
                        &resolved_target,
                        ctrl,
                        processed_files,
                        processed_bytes,
                        start_time,
                    )?;
                } else {
                    *processed_files += 1;
                }
            }
        }
        Ok(())
    }

    #[allow(clippy::too_many_arguments)]
    fn copy_file_chunked(
        &self,
        job_id: &str,
        src_file: &Path,
        dst_file: &Path,
        ctrl: &JobControl,
        processed_files: &mut usize,
        processed_bytes: &mut u64,
        start_time: Instant,
    ) -> Result<(), String> {
        if let Some(parent) = dst_file.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }

        let mut reader = fs::File::open(src_file)
            .map_err(|e| format!("無法開啟來源檔案 ({}): {}", src_file.display(), e))?;
        let mut writer = fs::File::create(dst_file)
            .map_err(|e| format!("無法建立目標檔案 ({}): {}", dst_file.display(), e))?;

        let mut buffer = vec![0u8; CHUNK_BUFFER_SIZE];
        let mut last_emit = Instant::now();

        loop {
            if self.check_pause_or_cancel(ctrl) {
                drop(writer);
                let _ = fs::remove_file(dst_file);
                return Ok(());
            }

            let read_bytes = reader.read(&mut buffer).map_err(|e| e.to_string())?;
            if read_bytes == 0 {
                break;
            }
            writer
                .write_all(&buffer[..read_bytes])
                .map_err(|e| e.to_string())?;
            *processed_bytes += read_bytes as u64;

            if last_emit.elapsed() >= Duration::from_millis(80) {
                let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
                let speed = (*processed_bytes as f64 / elapsed) as u64;
                let cur_name = src_file
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                self.update_job(job_id, |j| {
                    j.processed_bytes = *processed_bytes;
                    j.speed_bytes_per_sec = speed;
                    j.current_file = cur_name;
                });
                self.emit_update();
                last_emit = Instant::now();
            }
        }

        writer.flush().map_err(|e| e.to_string())?;
        *processed_files += 1;

        let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
        let speed = (*processed_bytes as f64 / elapsed) as u64;
        let cur_name = src_file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        self.update_job(job_id, |j| {
            j.processed_files = *processed_files;
            j.processed_bytes = *processed_bytes;
            j.speed_bytes_per_sec = speed;
            j.current_file = cur_name;
        });
        self.emit_update();

        Ok(())
    }
}

/// 根據衝突策略決定實際目標路徑
fn resolve_target_path(
    candidate: PathBuf,
    strategy: ConflictStrategy,
    src_path: &Path,
) -> Result<Option<PathBuf>, String> {
    // 若來源與目標完全相同（例如在同目錄複製貼上），自動走 Rename 產生副本
    let same_path = candidate == src_path;
    if !candidate.exists() && !same_path {
        return Ok(Some(candidate));
    }

    match strategy {
        ConflictStrategy::Skip if !same_path => Ok(None),
        ConflictStrategy::Overwrite if !same_path => Ok(Some(candidate)),
        ConflictStrategy::Rename | _ => {
            let parent = candidate
                .parent()
                .ok_or_else(|| "無效的目標父目錄".to_string())?;
            let stem = candidate
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "file".to_string());
            let ext = candidate
                .extension()
                .map(|e| format!(".{}", e.to_string_lossy()))
                .unwrap_or_default();

            for i in 1..=9999 {
                let new_name = if candidate.is_dir() {
                    format!("{}_{}", candidate.file_name().unwrap().to_string_lossy(), i)
                } else {
                    format!("{}_{}{}", stem, i, ext)
                };
                let next_path = parent.join(new_name);
                if !next_path.exists() {
                    return Ok(Some(next_path));
                }
            }
            Err("自動重新命名超過上限 (9999)".to_string())
        }
    }
}
