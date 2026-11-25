pub mod batch_rename;
pub mod clipboard_ops;
pub mod fs_ops;
pub mod logger;
pub mod models;
pub mod queue;
pub mod system_ops;

use batch_rename::{execute_batch_rename, preview_batch_rename, undo_batch_rename};
use clipboard_ops::{get_system_clipboard_files, set_system_clipboard_files, ClipboardFilesResult};
use fs_ops::{
    calculate_dir_stats, calculate_multi_item_stats, get_item_detailed_info, get_system_locations,
    read_directory_cached, read_file_chunk, read_file_preview, FsCacheState,
};
use logger::{
    diagnose_config_value, resolve_app_directory, resolve_log_directory, AppLogger, LogFormat,
    LogLevel, StructuredLogRecord,
};
use models::{
    normalize_path_str, BatchRenameExecutionResult, BatchRenamePreviewItem, BatchRenameRule,
    ConflictStrategy, DirStats, DirectoryListing, FileChecksumResult, FileChunkData,
    FilePreviewData, ItemDetailedInfo, QueueRetentionPolicy, SystemLocations,
    TransferConflictItem, TransferJobSnapshot, TransferJobType,
};
use queue::QueueManager;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use system_ops::{
    compress_items_to_zip, compute_file_checksums, extract_archive_to_dir, open_terminal_in_dir,
    open_with_system_default, reveal_in_os_shell, validate_safe_entry_name,
};
use tauri::{Manager, State};

pub struct AppState {
    pub cache: Arc<FsCacheState>,
    pub queue: Arc<QueueManager>,
    pub logger: Arc<AppLogger>,
}

#[tauri::command]
async fn cmd_get_system_locations() -> Result<SystemLocations, String> {
    tokio::task::spawn_blocking(get_system_locations)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_read_directory(
    state: State<'_, AppState>,
    path: String,
    force_refresh: Option<bool>,
) -> Result<DirectoryListing, String> {
    let cache = Arc::clone(&state.cache);
    let force = force_refresh.unwrap_or(false);
    tokio::task::spawn_blocking(move || read_directory_cached(&cache, &path, force))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_read_file_preview(
    path: String,
    max_bytes: Option<usize>,
) -> Result<FilePreviewData, String> {
    tokio::task::spawn_blocking(move || read_file_preview(&path, max_bytes))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_read_file_chunk(
    path: String,
    offset: u64,
    length: usize,
) -> Result<FileChunkData, String> {
    tokio::task::spawn_blocking(move || read_file_chunk(&path, offset, length))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_get_item_detailed_info(path: String) -> Result<ItemDetailedInfo, String> {
    tokio::task::spawn_blocking(move || get_item_detailed_info(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_calculate_dir_stats(path: String) -> Result<DirStats, String> {
    tokio::task::spawn_blocking(move || calculate_dir_stats(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_calculate_multi_item_stats(paths: Vec<String>) -> Result<DirStats, String> {
    tokio::task::spawn_blocking(move || calculate_multi_item_stats(paths))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cmd_create_directory(
    state: State<'_, AppState>,
    parent_path: String,
    dir_name: String,
) -> Result<String, String> {
    let safe_name = validate_safe_entry_name(&dir_name)?;
    let parent = PathBuf::from(&parent_path);
    let target = parent.join(&safe_name);
    if target.exists() {
        return Err("已存在同名目錄或檔案".to_string());
    }
    fs::create_dir_all(&target).map_err(|e| format!("建立目錄失敗: {}", e))?;
    state.cache.invalidate_path(&parent);
    Ok(normalize_path_str(&target))
}

#[tauri::command]
fn cmd_create_file(
    state: State<'_, AppState>,
    parent_path: String,
    file_name: String,
) -> Result<String, String> {
    let safe_name = validate_safe_entry_name(&file_name)?;
    let parent = PathBuf::from(&parent_path);
    let target = parent.join(&safe_name);
    if target.exists() {
        return Err("已存在同名檔案或目錄".to_string());
    }
    fs::File::create(&target).map_err(|e| format!("建立檔案失敗: {}", e))?;
    state.cache.invalidate_path(&parent);
    Ok(normalize_path_str(&target))
}

#[tauri::command]
fn cmd_rename_item(
    state: State<'_, AppState>,
    path: String,
    new_name: String,
) -> Result<String, String> {
    let safe_name = validate_safe_entry_name(&new_name)?;
    let src = PathBuf::from(&path);
    if !src.exists() {
        return Err("原始項目不存在".to_string());
    }
    let parent = src
        .parent()
        .ok_or_else(|| "無法取得父目錄".to_string())?;
    let dst = parent.join(&safe_name);
    if dst != src && dst.exists() && dst.to_string_lossy().to_lowercase() != src.to_string_lossy().to_lowercase() {
        return Err("目標名稱已存在".to_string());
    }
    fs::rename(&src, &dst).map_err(|e| format!("重新命名失敗: {}", e))?;
    state.cache.invalidate_path(parent);
    Ok(normalize_path_str(&dst))
}

#[tauri::command]
fn cmd_check_transfer_conflicts(
    sources: Vec<String>,
    destination: String,
) -> Result<Vec<TransferConflictItem>, String> {
    let dest_dir = PathBuf::from(&destination);
    if !dest_dir.exists() {
        return Ok(Vec::new());
    }
    let mut conflicts = Vec::new();
    for src_str in sources {
        let src_path = PathBuf::from(&src_str);
        if !src_path.exists() {
            continue;
        }
        if let Some(fname) = src_path.file_name() {
            let candidate = dest_dir.join(fname);
            if candidate.exists() {
                let src_meta = fs::metadata(&src_path).ok();
                let dst_meta = fs::metadata(&candidate).ok();
                let to_ms = |m: Option<&fs::Metadata>| -> u64 {
                    m.and_then(|meta| meta.modified().ok())
                        .and_then(|st| st.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_millis() as u64)
                        .unwrap_or(0)
                };
                conflicts.push(TransferConflictItem {
                    source_path: normalize_path_str(&src_path),
                    target_path: normalize_path_str(&candidate),
                    name: fname.to_string_lossy().to_string(),
                    is_dir: src_path.is_dir(),
                    source_size: src_meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    target_size: dst_meta.as_ref().map(|m| m.len()).unwrap_or(0),
                    source_modified_ms: to_ms(src_meta.as_ref()),
                    target_modified_ms: to_ms(dst_meta.as_ref()),
                });
            }
        }
    }
    Ok(conflicts)
}

#[tauri::command]
fn cmd_enqueue_transfer(
    state: State<'_, AppState>,
    job_type: TransferJobType,
    sources: Vec<String>,
    destination: Option<String>,
    conflict_strategy: Option<ConflictStrategy>,
) -> Result<TransferJobSnapshot, String> {
    if sources.is_empty() {
        return Err("來源清單為空".to_string());
    }
    let strategy = conflict_strategy.unwrap_or(ConflictStrategy::Rename);
    Ok(state
        .queue
        .enqueue_job(job_type, sources, destination, strategy))
}

#[tauri::command]
fn cmd_list_transfer_jobs(state: State<'_, AppState>) -> Vec<TransferJobSnapshot> {
    state.queue.list_jobs()
}

#[tauri::command]
fn cmd_control_transfer_job(
    state: State<'_, AppState>,
    job_id: String,
    action: String,
) -> Result<Vec<TransferJobSnapshot>, String> {
    state.queue.control_job(&job_id, &action)
}

#[tauri::command]
fn cmd_set_queue_retention(
    state: State<'_, AppState>,
    policy: QueueRetentionPolicy,
) -> Vec<TransferJobSnapshot> {
    state.queue.set_retention_policy(policy)
}

#[tauri::command]
fn cmd_preview_batch_rename(
    paths: Vec<String>,
    rule: BatchRenameRule,
) -> Result<Vec<BatchRenamePreviewItem>, String> {
    preview_batch_rename(&paths, &rule)
}

#[tauri::command]
fn cmd_execute_batch_rename(
    state: State<'_, AppState>,
    paths: Vec<String>,
    rule: BatchRenameRule,
) -> Result<BatchRenameExecutionResult, String> {
    let res = execute_batch_rename(&paths, &rule)?;
    if let Some(first) = paths.first() {
        if let Some(parent) = Path::new(first).parent() {
            state.cache.invalidate_path(parent);
        }
    }
    Ok(res)
}

#[tauri::command]
fn cmd_undo_batch_rename(
    state: State<'_, AppState>,
    undo_pairs: Vec<(String, String)>,
) -> Result<usize, String> {
    let count = undo_batch_rename(&undo_pairs)?;
    if let Some((first_cur, _)) = undo_pairs.first() {
        if let Some(parent) = Path::new(first_cur).parent() {
            state.cache.invalidate_path(parent);
        }
    }
    Ok(count)
}

#[tauri::command]
async fn cmd_compute_checksum(path: String) -> Result<FileChecksumResult, String> {
    tokio::task::spawn_blocking(move || compute_file_checksums(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cmd_open_item(path: String) -> Result<(), String> {
    open_with_system_default(&path)
}

#[tauri::command]
fn cmd_open_terminal(path: String) -> Result<(), String> {
    open_terminal_in_dir(&path)
}

#[tauri::command]
fn cmd_reveal_in_shell(path: String) -> Result<(), String> {
    reveal_in_os_shell(&path)
}

#[tauri::command]
async fn cmd_extract_archive(
    state: State<'_, AppState>,
    archive_path: String,
    dest_dir: Option<String>,
) -> Result<String, String> {
    let cache = Arc::clone(&state.cache);
    let archive_clone = archive_path.clone();
    let out = tokio::task::spawn_blocking(move || extract_archive_to_dir(&archive_clone, dest_dir))
        .await
        .map_err(|e| e.to_string())??;
    if let Some(parent) = Path::new(&archive_path).parent() {
        cache.invalidate_path(parent);
    }
    Ok(out)
}

#[tauri::command]
async fn cmd_compress_to_zip(
    state: State<'_, AppState>,
    sources: Vec<String>,
    output_zip_path: String,
) -> Result<String, String> {
    let cache = Arc::clone(&state.cache);
    let out_clone = output_zip_path.clone();
    let res = tokio::task::spawn_blocking(move || compress_items_to_zip(&sources, &out_clone))
        .await
        .map_err(|e| e.to_string())??;
    if let Some(parent) = Path::new(&output_zip_path).parent() {
        cache.invalidate_path(parent);
    }
    Ok(res)
}

#[tauri::command]
fn cmd_clear_cache(state: State<'_, AppState>) {
    state.cache.clear_all();
}

/// 取得跨平台預設設定檔路徑（優先存放於執行檔同目錄 settings.json，保持免安裝可攜性）
pub fn resolve_default_config_file() -> PathBuf {
    let app_dir = resolve_app_directory();
    let legacy_cfg = app_dir.join("rfm-settings.json");
    if legacy_cfg.exists() {
        legacy_cfg
    } else {
        app_dir.join("settings.json")
    }
}

/// 初次執行時若 logs 目錄或設定檔不存在，自動建立預設目錄與 settings.json
pub fn ensure_default_config_and_logs(logger: &AppLogger) -> PathBuf {
    let log_dir = resolve_log_directory();
    if !log_dir.exists() {
        let _ = fs::create_dir_all(&log_dir);
    }

    let config_path = resolve_default_config_file();
    if !config_path.exists() {
        if let Some(parent) = config_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let default_config = json!({
            "app": "rust-file-manager",
            "schemaVersion": 1,
            "exportedAt": chrono::Utc::now().to_rfc3339(),
            "settings": {
                "dualPaneEnabled": false,
                "showHiddenFiles": false,
                "showPreviewPanel": false,
                "confirmDelete": true,
                "conflictStrategy": "ask",
                "queueRetention": {
                    "retainEvents": true,
                    "maxDays": 30,
                    "maxEntries": 200
                },
                "logFormat": "json",
                "logLevel": "error",
                "fontSettings": {
                    "fontFamily": "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                    "fontSizePx": 13,
                    "uiFontSizePx": 13,
                    "rowHeightPx": 32
                },
                "bookmarks": []
            }
        });
        if let Ok(pretty) = serde_json::to_string_pretty(&default_config) {
            let _ = fs::write(&config_path, pretty);
        }
    } else if let Ok(content) = fs::read_to_string(&config_path) {
        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) {
            let cfg = parsed.get("settings").unwrap_or(&parsed);
            if let Some(lvl_str) = cfg.get("logLevel").and_then(|v| v.as_str()) {
                logger.set_level(LogLevel::parse_str(lvl_str));
            }
            if let Some(fmt_str) = cfg.get("logFormat").and_then(|v| v.as_str()) {
                if fmt_str.eq_ignore_ascii_case("text") {
                    logger.set_format(LogFormat::Text);
                } else {
                    logger.set_format(LogFormat::Json);
                }
            }
        }
    }
    config_path
}

#[tauri::command]
fn cmd_get_default_config_path() -> String {
    normalize_path_str(&resolve_default_config_file())
}

#[tauri::command]
fn cmd_save_config_file(
    state: State<'_, AppState>,
    target_path: Option<String>,
    content: String,
) -> Result<String, String> {
    if content.len() > 5 * 1024 * 1024 {
        state.logger.log(
            "ERROR",
            "backend::config",
            "config_save_oversize",
            "設定檔內容超過 5 MB 安全上限",
            Some(json!({ "sizeBytes": content.len() })),
        );
        return Err("設定檔內容超過 5 MB 安全上限".to_string());
    }
    let path = match target_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => resolve_default_config_file(),
    };
    if path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()).as_deref() != Some("json") {
        state.logger.log(
            "WARN",
            "backend::config",
            "config_save_invalid_ext",
            "拒絕寫入非 .json 副檔名之設定檔",
            Some(json!({ "path": normalize_path_str(&path) })),
        );
        return Err("基於安全限制，設定檔副檔名必須為 .json".to_string());
    }
    // 驗證是否為合法 JSON
    let parsed: serde_json::Value = serde_json::from_str(&content).map_err(|e| {
        state.logger.log(
            "ERROR",
            "backend::config",
            "config_save_invalid_json",
            &format!("設定檔 JSON 格式無效: {}", e),
            Some(json!({ "line": e.line(), "column": e.column() })),
        );
        format!("設定檔 JSON 格式無效 (第 {} 行第 {} 列): {}", e.line(), e.column(), e)
    })?;
    let pretty =
        serde_json::to_string_pretty(&parsed).map_err(|e| format!("格式化 JSON 失敗: {}", e))?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("無法建立設定檔目錄: {}", e))?;
    }
    fs::write(&path, pretty).map_err(|e| {
        state.logger.log(
            "ERROR",
            "backend::config",
            "config_save_io_error",
            &format!("寫入設定檔失敗: {}", e),
            Some(json!({ "path": normalize_path_str(&path) })),
        );
        format!("寫入設定檔失敗 ({}): {}", path.display(), e)
    })?;

    let saved = normalize_path_str(&path);
    state.logger.log(
        "INFO",
        "backend::config",
        "config_saved",
        "已成功儲存設定檔",
        Some(json!({ "path": saved })),
    );
    Ok(saved)
}

#[tauri::command]
fn cmd_load_config_file(
    state: State<'_, AppState>,
    source_path: Option<String>,
) -> Result<String, String> {
    let path = match source_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => resolve_default_config_file(),
    };
    if !path.exists() {
        return Err(format!("設定檔不存在: {}", normalize_path_str(&path)));
    }
    if path.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()).as_deref() != Some("json") {
        return Err("基於安全限制，僅允許載入 .json 副檔名之設定檔".to_string());
    }
    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err("設定檔大小超過 5 MB 安全上限，拒絕載入".to_string());
    }
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("讀取設定檔失敗 ({}): {}", path.display(), e))?;

    // 驗證 JSON 語法，若損毀則記錄詳細行號並自動建立 .corrupted.bak 備份
    let parsed: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            let bak_path = path.with_extension("json.corrupted.bak");
            let _ = fs::copy(&path, &bak_path);
            let err_msg = format!(
                "設定檔 JSON 語法損毀 (第 {} 行, 第 {} 列): {} (已自動備份至 {})",
                e.line(),
                e.column(),
                e,
                normalize_path_str(&bak_path)
            );
            state.logger.log(
                "ERROR",
                "backend::config",
                "config_load_corrupted_json",
                &err_msg,
                Some(json!({
                    "path": normalize_path_str(&path),
                    "backupPath": normalize_path_str(&bak_path),
                    "line": e.line(),
                    "column": e.column()
                })),
            );
            return Err(err_msg);
        }
    };

    // 深度診斷欄位結構並記錄警告
    let warnings = diagnose_config_value(&parsed);
    if !warnings.is_empty() {
        state.logger.log(
            "WARN",
            "backend::config",
            "config_schema_warnings",
            "載入的設定檔包含非標準或異常欄位值，部分設定將回退預設值",
            Some(json!({
                "path": normalize_path_str(&path),
                "warnings": warnings
            })),
        );
    } else {
        state.logger.log(
            "INFO",
            "backend::config",
            "config_loaded",
            "已成功驗證並載入設定檔",
            Some(json!({ "path": normalize_path_str(&path) })),
        );
    }

    Ok(raw)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct ImportConfigResult {
    pub path: String,
    pub content: String,
}

#[tauri::command]
fn cmd_export_config_with_dialog(
    state: State<'_, AppState>,
    content: String,
    default_filename: Option<String>,
) -> Result<Option<String>, String> {
    let filename = default_filename.unwrap_or_else(|| {
        let tag = chrono::Utc::now().format("%Y%m%d").to_string();
        format!("rfm-settings-{}.json", tag)
    });

    let mut dialog = rfd::FileDialog::new()
        .set_title("匯出設定檔備份")
        .add_filter("JSON 設定檔 (*.json)", &["json"])
        .set_file_name(&filename);

    if let Some(desktop) = dirs::desktop_dir() {
        dialog = dialog.set_directory(&desktop);
    }

    let file_path = match dialog.save_file() {
        Some(p) => p,
        None => return Ok(None),
    };

    let target_path_str = normalize_path_str(&file_path);
    cmd_save_config_file(state, Some(target_path_str), content).map(Some)
}

#[tauri::command]
fn cmd_import_config_with_dialog(
    state: State<'_, AppState>,
) -> Result<Option<ImportConfigResult>, String> {
    let mut dialog = rfd::FileDialog::new()
        .set_title("選擇要匯入的設定檔 (.json)")
        .add_filter("JSON 設定檔 (*.json)", &["json"]);

    if let Some(desktop) = dirs::desktop_dir() {
        dialog = dialog.set_directory(&desktop);
    }

    let file_path = match dialog.pick_file() {
        Some(p) => p,
        None => return Ok(None),
    };

    let path_str = normalize_path_str(&file_path);
    let content = cmd_load_config_file(state, Some(path_str.clone()))?;

    Ok(Some(ImportConfigResult {
        path: path_str,
        content,
    }))
}

#[tauri::command]
fn cmd_get_log_file_path(state: State<'_, AppState>) -> String {
    state.logger.get_log_path_str()
}

#[tauri::command]
fn cmd_read_logs(state: State<'_, AppState>, limit: Option<usize>) -> Vec<StructuredLogRecord> {
    state.logger.read_recent_logs(limit.unwrap_or(200))
}

#[tauri::command]
fn cmd_clear_logs(state: State<'_, AppState>) -> Result<(), String> {
    state.logger.clear_logs()?;
    state.logger.log(
        "INFO",
        "backend::logger",
        "logs_cleared",
        "使用者已手動清空歷史日誌檔",
        None,
    );
    Ok(())
}

#[tauri::command]
fn cmd_set_log_format(state: State<'_, AppState>, format: LogFormat) {
    state.logger.set_format(format);
}

#[tauri::command]
fn cmd_get_log_level(state: State<'_, AppState>) -> String {
    state.logger.get_level().as_str().to_lowercase()
}

#[tauri::command]
fn cmd_set_log_level(state: State<'_, AppState>, level: String) {
    let lvl = LogLevel::parse_str(&level);
    state.logger.set_level(lvl);
    state.logger.log(
        "INFO",
        "backend::logger",
        "log_level_changed",
        &format!("日誌記錄等級已切換為 {:?}", lvl),
        None,
    );
}

#[tauri::command]
fn cmd_write_frontend_log(
    state: State<'_, AppState>,
    level: String,
    target: String,
    event: String,
    message: String,
    context: Option<Value>,
) {
    state
        .logger
        .log(&level, &target, &event, &message, context);
}

#[tauri::command]
async fn cmd_get_system_clipboard_files() -> Result<Option<ClipboardFilesResult>, String> {
    tokio::task::spawn_blocking(get_system_clipboard_files)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn cmd_set_system_clipboard_files(paths: Vec<String>, is_cut: bool) -> Result<(), String> {
    tokio::task::spawn_blocking(move || set_system_clipboard_files(paths, is_cut))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let logger = AppLogger::new();
    AppLogger::install_panic_hook(Arc::clone(&logger));
    ensure_default_config_and_logs(&logger);
    let cache = FsCacheState::new(128);
    let queue = QueueManager::new(Arc::clone(&cache));

    tauri::Builder::default()
        .plugin(tauri_plugin_drag::init())
        .manage(AppState {
            cache: Arc::clone(&cache),
            queue: Arc::clone(&queue),
            logger: Arc::clone(&logger),
        })
        .setup(move |app| {
            let state = app.state::<AppState>();
            state.queue.set_app_handle(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            cmd_get_system_locations,
            cmd_read_directory,
            cmd_read_file_preview,
            cmd_read_file_chunk,
            cmd_get_item_detailed_info,
            cmd_calculate_dir_stats,
            cmd_calculate_multi_item_stats,
            cmd_create_directory,
            cmd_create_file,
            cmd_rename_item,
            cmd_check_transfer_conflicts,
            cmd_enqueue_transfer,
            cmd_list_transfer_jobs,
            cmd_control_transfer_job,
            cmd_set_queue_retention,
            cmd_preview_batch_rename,
            cmd_execute_batch_rename,
            cmd_undo_batch_rename,
            cmd_compute_checksum,
            cmd_open_item,
            cmd_open_terminal,
            cmd_reveal_in_shell,
            cmd_extract_archive,
            cmd_compress_to_zip,
            cmd_clear_cache,
            cmd_get_default_config_path,
            cmd_save_config_file,
            cmd_load_config_file,
            cmd_export_config_with_dialog,
            cmd_import_config_with_dialog,
            cmd_get_log_file_path,
            cmd_read_logs,
            cmd_clear_logs,
            cmd_set_log_format,
            cmd_get_log_level,
            cmd_set_log_level,
            cmd_write_frontend_log,
            cmd_get_system_clipboard_files,
            cmd_set_system_clipboard_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_resolve_default_config_path_filename() {
        let p = resolve_default_config_file();
        let fname = p.file_name().and_then(|s| s.to_str()).unwrap_or("");
        assert!(fname == "settings.json" || fname == "rfm-settings.json");
    }

    #[test]
    fn test_ensure_default_config_and_logs_creation() {
        let temp_dir = std::env::temp_dir().join(format!("rfm_test_{}", uuid::Uuid::new_v4()));
        let _ = fs::create_dir_all(&temp_dir);

        let _logger = AppLogger::new();
        let cfg_path = temp_dir.join("settings.json");
        assert!(!cfg_path.exists());

        let default_config = json!({
            "app": "rust-file-manager",
            "schemaVersion": 1,
            "settings": {
                "confirmDelete": true,
                "logLevel": "error"
            }
        });
        fs::write(&cfg_path, serde_json::to_string(&default_config).unwrap()).unwrap();
        assert!(cfg_path.exists());

        let content = fs::read_to_string(&cfg_path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert_eq!(
            parsed.get("settings").and_then(|s| s.get("logLevel")).and_then(|v| v.as_str()),
            Some("error")
        );
        assert_eq!(
            parsed.get("settings").and_then(|s| s.get("confirmDelete")).and_then(|v| v.as_bool()),
            Some(true)
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
