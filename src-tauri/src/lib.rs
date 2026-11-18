pub mod batch_rename;
pub mod fs_ops;
pub mod models;
pub mod queue;
pub mod system_ops;

use batch_rename::{execute_batch_rename, preview_batch_rename, undo_batch_rename};
use fs_ops::{get_system_locations, read_directory_cached, read_file_preview, FsCacheState};
use models::{
    normalize_path_str, BatchRenameExecutionResult, BatchRenamePreviewItem, BatchRenameRule,
    ConflictStrategy, DirectoryListing, FileChecksumResult, FilePreviewData, SystemLocations,
    TransferJobSnapshot, TransferJobType,
};
use queue::QueueManager;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use system_ops::{
    compress_items_to_zip, compute_file_checksums, extract_archive_to_dir, open_terminal_in_dir,
    open_with_system_default, reveal_in_os_shell,
};
use tauri::{Manager, State};

pub struct AppState {
    pub cache: Arc<FsCacheState>,
    pub queue: Arc<QueueManager>,
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
async fn cmd_read_file_preview(path: String) -> Result<FilePreviewData, String> {
    tokio::task::spawn_blocking(move || read_file_preview(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cmd_create_directory(
    state: State<'_, AppState>,
    parent_path: String,
    dir_name: String,
) -> Result<String, String> {
    let trimmed = dir_name.trim();
    if trimmed.is_empty() {
        return Err("目錄名稱不可為空".to_string());
    }
    let parent = PathBuf::from(&parent_path);
    let target = parent.join(trimmed);
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
    let trimmed = file_name.trim();
    if trimmed.is_empty() {
        return Err("檔案名稱不可為空".to_string());
    }
    let parent = PathBuf::from(&parent_path);
    let target = parent.join(trimmed);
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
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("新名稱不可為空".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("名稱不可包含斜線字元".to_string());
    }
    let src = PathBuf::from(&path);
    if !src.exists() {
        return Err("原始項目不存在".to_string());
    }
    let parent = src
        .parent()
        .ok_or_else(|| "無法取得父目錄".to_string())?;
    let dst = parent.join(trimmed);
    if dst != src && dst.exists() && dst.to_string_lossy().to_lowercase() != src.to_string_lossy().to_lowercase() {
        return Err("目標名稱已存在".to_string());
    }
    fs::rename(&src, &dst).map_err(|e| format!("重新命名失敗: {}", e))?;
    state.cache.invalidate_path(parent);
    Ok(normalize_path_str(&dst))
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cache = FsCacheState::new(128);
    let queue = QueueManager::new(Arc::clone(&cache));

    tauri::Builder::default()
        .manage(AppState {
            cache: Arc::clone(&cache),
            queue: Arc::clone(&queue),
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
            cmd_create_directory,
            cmd_create_file,
            cmd_rename_item,
            cmd_enqueue_transfer,
            cmd_list_transfer_jobs,
            cmd_control_transfer_job,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
