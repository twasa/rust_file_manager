use crate::fs_ops::FsCacheState;
use crate::models::{
    normalize_path_str, ConflictStrategy, JobStatus, QueueRetentionPolicy, TransferJobSnapshot,
    TransferJobType,
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

#[derive(Default, Clone, Copy)]
struct TransferCounters {
    processed_files: usize,
    processed_bytes: u64,
    skipped_files: usize,
    overwritten_files: usize,
    renamed_files: usize,
}

enum TargetResolution {
    Clean(PathBuf),
    Skipped,
    Overwritten(PathBuf),
    Renamed(PathBuf),
}

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
    retention: Mutex<QueueRetentionPolicy>,
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
            retention: Mutex::new(QueueRetentionPolicy::default()),
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
            skipped_files: 0,
            overwritten_files: 0,
            renamed_files: 0,
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

    pub fn set_retention_policy(&self, policy: QueueRetentionPolicy) -> Vec<TransferJobSnapshot> {
        *self.retention.lock() = policy;
        self.apply_retention_prune();
        self.emit_update();
        self.list_jobs()
    }

    pub fn apply_retention_prune(&self) {
        let policy = *self.retention.lock();
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        let max_age_ms = (policy.retention_days.max(1) as u64) * 24 * 60 * 60 * 1000;
        let max_events = policy.max_events.max(1);

        let mut guard = self.jobs.lock();
        let mut finished_seen = 0usize;
        let mut removed_ids = Vec::new();

        guard.retain(|j| {
            let is_finished = matches!(
                j.status,
                JobStatus::Completed | JobStatus::Cancelled | JobStatus::Failed
            );
            if !is_finished {
                return true;
            }
            if !policy.keep_history {
                removed_ids.push(j.id.clone());
                return false;
            }
            if now_ms.saturating_sub(j.created_at_ms) > max_age_ms {
                removed_ids.push(j.id.clone());
                return false;
            }
            finished_seen += 1;
            if finished_seen > max_events {
                removed_ids.push(j.id.clone());
                return false;
            }
            true
        });

        drop(guard);
        if !removed_ids.is_empty() {
            let mut ctrl_guard = self.controls.lock();
            for id in removed_ids {
                ctrl_guard.remove(&id);
            }
        }
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

    fn sync_counters(&self, job_id: &str, c: &TransferCounters, current_file: String, speed: u64) {
        self.update_job(job_id, |j| {
            j.processed_files = c.processed_files;
            j.processed_bytes = c.processed_bytes;
            j.skipped_files = c.skipped_files;
            j.overwritten_files = c.overwritten_files;
            j.renamed_files = c.renamed_files;
            j.speed_bytes_per_sec = speed;
            j.current_file = current_file;
        });
        self.emit_update();
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
        let mut counters = TransferCounters::default();

        let result = match snapshot.job_type {
            TransferJobType::Trash => {
                self.execute_trash(job_id, &snapshot.sources, &ctrl, &mut counters)
            }
            TransferJobType::Delete => {
                self.execute_delete(job_id, &snapshot.sources, &ctrl, &mut counters, start_time)
            }
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
                    &mut counters,
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
                    let speed = (counters.processed_bytes as f64 / elapsed_secs) as u64;
                    let summary = build_completion_summary(&counters);

                    self.update_job(job_id, |j| {
                        j.status = JobStatus::Completed;
                        j.processed_bytes = j.total_bytes;
                        j.processed_files = j.total_files;
                        j.skipped_files = counters.skipped_files;
                        j.overwritten_files = counters.overwritten_files;
                        j.renamed_files = counters.renamed_files;
                        j.speed_bytes_per_sec = speed;
                        j.current_file = summary;
                    });
                    self.emit_update();

                    if !self.retention.lock().keep_history {
                        let mgr = self.jobs.clone();
                        let ctrls = self.controls.clone();
                        let jid = job_id.to_string();
                        std::thread::sleep(Duration::from_millis(800));
                        mgr.lock().retain(|j| j.id != jid);
                        ctrls.lock().remove(&jid);
                        self.emit_update();
                    } else {
                        self.apply_retention_prune();
                        self.emit_update();
                    }
                }
            }
            Err(err) => {
                self.fail_job(job_id, err);
                self.apply_retention_prune();
                self.emit_update();
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
        counters: &mut TransferCounters,
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

            if let Err(e) = trash::delete(&p) {
                return Err(format!("無法移至資源回收桶 ({}): {}", name, e));
            }
            counters.processed_files += 1;
            self.sync_counters(job_id, counters, format!("已移至回收桶: {}", name), 0);
        }
        Ok(())
    }

    fn execute_delete(
        &self,
        job_id: &str,
        sources: &[String],
        ctrl: &JobControl,
        counters: &mut TransferCounters,
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
                counters.processed_files += 1;
                counters.processed_bytes += len;
            } else if p.is_dir() {
                fs::remove_dir_all(&p).map_err(|e| format!("刪除目錄失敗 ({}): {}", src, e))?;
                counters.processed_files += 1;
            }
            let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
            let speed = (counters.processed_bytes as f64 / elapsed) as u64;
            self.sync_counters(job_id, counters, normalize_path_str(&p), speed);
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
        counters: &mut TransferCounters,
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
            let resolution = resolve_target_path(dest_dir.join(file_name), strategy, &src_path)?;

            let target_path = match resolution {
                TargetResolution::Skipped => {
                    // 計算被略過的檔案數與位元組數（若為資料夾則統計其下所有檔案）
                    if src_path.is_file() {
                        counters.processed_files += 1;
                        counters.skipped_files += 1;
                        counters.processed_bytes +=
                            fs::metadata(&src_path).map(|m| m.len()).unwrap_or(0);
                    } else if src_path.is_dir() {
                        for entry in WalkDir::new(&src_path).into_iter().filter_map(|e| e.ok()) {
                            if entry.file_type().is_file() {
                                counters.processed_files += 1;
                                counters.skipped_files += 1;
                                counters.processed_bytes +=
                                    entry.metadata().map(|m| m.len()).unwrap_or(0);
                            }
                        }
                    }
                    self.sync_counters(
                        job_id,
                        counters,
                        format!("已略過同名項目: {}", file_name.to_string_lossy()),
                        0,
                    );
                    continue;
                }
                TargetResolution::Overwritten(t) => {
                    if src_path.is_file() {
                        counters.overwritten_files += 1;
                    }
                    t
                }
                TargetResolution::Renamed(t) => {
                    counters.renamed_files += 1;
                    t
                }
                TargetResolution::Clean(t) => t,
            };

            // 防止將目錄複製或搬移到自己的子目錄中
            if src_path.is_dir() && target_path.starts_with(&src_path) && target_path != src_path {
                return Err("無法將目錄複製或搬移至其自身的子目錄內".to_string());
            }

            // 如果是同磁碟區的 Move 且目標未衝突，可嘗試 O(1) 原地 rename
            if is_move && !same_file_path(&src_path, &target_path) && fs::rename(&src_path, &target_path).is_ok() {
                let len = fs::metadata(&target_path).map(|m| m.len()).unwrap_or(0);
                counters.processed_files += 1;
                counters.processed_bytes += len;
                self.sync_counters(job_id, counters, normalize_path_str(&target_path), 0);
                continue;
            }

            if src_path.is_file() {
                // 若來源與目標是同一個檔案（例如在同一個資料夾內選「直接覆寫」並按 Ctrl+C -> Ctrl+V），
                // 絕對不可執行 File::create(target_path)，否則會把來源檔案截斷為 0 bytes！
                if same_file_path(&src_path, &target_path) {
                    let len = fs::metadata(&src_path).map(|m| m.len()).unwrap_or(0);
                    counters.processed_files += 1;
                    counters.processed_bytes += len;
                    self.sync_counters(
                        job_id,
                        counters,
                        format!("同路徑原地保留: {}", file_name.to_string_lossy()),
                        0,
                    );
                    continue;
                }

                self.copy_file_chunked(
                    job_id,
                    &src_path,
                    &target_path,
                    ctrl,
                    counters,
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
                    counters,
                    start_time,
                )?;
                if is_move
                    && !ctrl.cancelled.load(Ordering::SeqCst)
                    && counters.skipped_files == 0
                    && !same_file_path(&src_path, &target_path)
                {
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
        counters: &mut TransferCounters,
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
                match resolve_target_path(target, strategy, path)? {
                    TargetResolution::Skipped => {
                        counters.processed_files += 1;
                        counters.skipped_files += 1;
                        counters.processed_bytes +=
                            entry.metadata().map(|m| m.len()).unwrap_or(0);
                        let fname = path
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                        self.sync_counters(job_id, counters, format!("已略過: {}", fname), 0);
                    }
                    TargetResolution::Overwritten(resolved_target) => {
                        counters.overwritten_files += 1;
                        if !same_file_path(path, &resolved_target) {
                            self.copy_file_chunked(
                                job_id,
                                path,
                                &resolved_target,
                                ctrl,
                                counters,
                                start_time,
                            )?;
                        } else {
                            counters.processed_files += 1;
                        }
                    }
                    TargetResolution::Renamed(resolved_target) => {
                        counters.renamed_files += 1;
                        self.copy_file_chunked(
                            job_id,
                            path,
                            &resolved_target,
                            ctrl,
                            counters,
                            start_time,
                        )?;
                    }
                    TargetResolution::Clean(resolved_target) => {
                        self.copy_file_chunked(
                            job_id,
                            path,
                            &resolved_target,
                            ctrl,
                            counters,
                            start_time,
                        )?;
                    }
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
        counters: &mut TransferCounters,
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
            counters.processed_bytes += read_bytes as u64;

            if last_emit.elapsed() >= Duration::from_millis(80) {
                let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
                let speed = (counters.processed_bytes as f64 / elapsed) as u64;
                let cur_name = dst_file
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default();
                self.sync_counters(job_id, counters, cur_name, speed);
                last_emit = Instant::now();
            }
        }

        writer.flush().map_err(|e| e.to_string())?;
        counters.processed_files += 1;

        let elapsed = start_time.elapsed().as_secs_f64().max(0.001);
        let speed = (counters.processed_bytes as f64 / elapsed) as u64;
        let cur_name = dst_file
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();

        self.sync_counters(job_id, counters, cur_name, speed);

        Ok(())
    }
}

/// 跨平台不分大小寫路徑比對（確認來源與目標是否指向完全相同的位置）
fn same_file_path(a: &Path, b: &Path) -> bool {
    let na = normalize_path_str(a);
    let nb = normalize_path_str(b);
    #[cfg(target_os = "windows")]
    {
        na.eq_ignore_ascii_case(&nb)
    }
    #[cfg(not(target_os = "windows"))]
    {
        na == nb
    }
}

/// 產生人類易讀的任務完成結算摘要（明確區分實際處理、略過、覆寫、重新命名數量）
fn build_completion_summary(c: &TransferCounters) -> String {
    let actual_copied = c
        .processed_files
        .saturating_sub(c.skipped_files);
    let mut parts = Vec::new();
    if actual_copied > 0 {
        parts.push(format!("實際處理 {} 項", actual_copied));
    }
    if c.skipped_files > 0 {
        parts.push(format!("略過同名 {} 項", c.skipped_files));
    }
    if c.overwritten_files > 0 {
        parts.push(format!("覆寫 {} 項", c.overwritten_files));
    }
    if c.renamed_files > 0 {
        parts.push(format!("自動改名 {} 項", c.renamed_files));
    }
    if parts.is_empty() {
        "任務完成".to_string()
    } else {
        format!("完成 ({})", parts.join(" / "))
    }
}

/// 根據衝突策略決定實際目標路徑與處理方式
fn resolve_target_path(
    candidate: PathBuf,
    strategy: ConflictStrategy,
    src_path: &Path,
) -> Result<TargetResolution, String> {
    let same_path = same_file_path(&candidate, src_path);
    if !candidate.exists() && !same_path {
        return Ok(TargetResolution::Clean(candidate));
    }

    match strategy {
        // 當使用者選擇「略過同名檔案 (Skip)」時，無論是否為同目錄貼上，只要目標已存在一律略過！
        ConflictStrategy::Skip => Ok(TargetResolution::Skipped),
        // 當使用者選擇「直接覆寫 (Overwrite)」時，明確標記為 Overwritten
        ConflictStrategy::Overwrite => Ok(TargetResolution::Overwritten(candidate)),
        // 當使用者選擇「自動重新命名保留兩者 (Rename)」(或未在前端攔截的 Ask 預設回退為安全 Rename) 時，產生 _1, _2 副本
        ConflictStrategy::Rename | ConflictStrategy::Ask => {
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
                    return Ok(TargetResolution::Renamed(next_path));
                }
            }
            Err("自動重新命名超過上限 (9999)".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_conflict_strategy_skip_and_rename_on_same_dir() {
        let temp_dir = env::temp_dir().join(format!("rfm_conflict_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();
        let file_a = temp_dir.join("demo.txt");
        fs::write(&file_a, b"hello").unwrap();

        // 1. 測試在同目錄貼上且策略為 Skip 時，必須回傳 Skipped（而不是變成 Rename）
        let res_skip = resolve_target_path(file_a.clone(), ConflictStrategy::Skip, &file_a).unwrap();
        assert!(matches!(res_skip, TargetResolution::Skipped));

        // 2. 測試在同目錄貼上且策略為 Rename 時，應回傳 Renamed(demo_1.txt)
        let res_rename = resolve_target_path(file_a.clone(), ConflictStrategy::Rename, &file_a).unwrap();
        match res_rename {
            TargetResolution::Renamed(p) => {
                assert_eq!(p.file_name().unwrap().to_string_lossy(), "demo_1.txt");
            }
            _ => panic!("Expected TargetResolution::Renamed"),
        }

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
