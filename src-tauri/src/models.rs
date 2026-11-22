use serde::{Deserialize, Serialize};
use std::path::Path;

/// 檔案類型分類（用於前端快速圖示顯示與右鍵選單判斷）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntryKind {
    Directory,
    Symlink,
    Image,
    Video,
    Audio,
    Archive,
    Code,
    Document,
    Executable,
    File,
}

impl EntryKind {
    pub fn from_extension(ext: &str, is_dir: bool, is_symlink: bool) -> Self {
        if is_dir {
            return EntryKind::Directory;
        }
        if is_symlink {
            return EntryKind::Symlink;
        }
        match ext.to_ascii_lowercase().as_str() {
            "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "tiff" | "avif" => {
                EntryKind::Image
            }
            "mp4" | "mkv" | "webm" | "avi" | "mov" | "wmv" | "flv" | "m4v" => {
                EntryKind::Video
            }
            "mp3" | "wav" | "flac" | "ogg" | "m4a" | "aac" | "opus" | "wma" => EntryKind::Audio,
            "zip" | "tar" | "gz" | "tgz" | "7z" | "rar" | "bz2" | "xz" | "zst" | "iso" => {
                EntryKind::Archive
            }
            "rs" | "ts" | "tsx" | "js" | "jsx" | "py" | "go" | "c" | "cpp" | "h" | "hpp"
            | "java" | "cs" | "json" | "yaml" | "yml" | "toml" | "xml" | "html" | "css"
            | "scss" | "sh" | "ps1" | "zsh" | "bash" | "sql" | "vue" | "svelte" | "dockerfile" => {
                EntryKind::Code
            }
            "md" | "txt" | "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "csv"
            | "rtf" | "log" | "ini" | "conf" | "cfg" => EntryKind::Document,
            "exe" | "msi" | "bat" | "cmd" | "app" | "dmg" | "deb" | "rpm" | "appimage" | "bin"
            | "run" => EntryKind::Executable,
            _ => EntryKind::File,
        }
    }
}

/// 單一檔案或目錄項目資訊
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub is_hidden: bool,
    pub is_readonly: bool,
    pub size: u64,
    pub modified_ms: u64,
    pub created_ms: u64,
    pub extension: String,
    pub kind: EntryKind,
}

/// 詳細檔案/目錄屬性資訊（用於右鍵「詳細資訊 / 內容」）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDetailedInfo {
    pub name: String,
    pub path: String,
    pub parent_path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
    pub is_hidden: bool,
    pub is_readonly: bool,
    pub size: u64,
    pub modified_ms: u64,
    pub created_ms: u64,
    pub accessed_ms: u64,
    pub extension: String,
    pub kind: EntryKind,
    pub type_description: String,
}

/// 目錄或多檔案統計資訊
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirStats {
    pub total_files: usize,
    pub total_dirs: usize,
    pub total_bytes: u64,
}

/// 目錄讀取結果（包含是否命中快取、讀取耗時毫秒數）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryListing {
    pub path: String,
    pub parent_path: Option<String>,
    pub entries: Vec<FileEntry>,
    pub total_files: usize,
    pub total_dirs: usize,
    pub total_size: u64,
    pub from_cache: bool,
    pub elapsed_ms: u64,
}

/// 磁碟機 / 掛載點與系統常用目錄資訊
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeInfo {
    pub name: String,
    pub mount_point: String,
    pub file_system: String,
    pub total_space: u64,
    pub available_space: u64,
    pub is_removable: bool,
}

/// 使用者常用特殊目錄
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecialLocation {
    pub id: String,
    pub label: String,
    pub path: String,
    pub icon: String,
}

/// 系統磁碟與常用目錄集合
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemLocations {
    pub os_platform: String,
    pub home_dir: String,
    pub volumes: Vec<VolumeInfo>,
    pub special_locations: Vec<SpecialLocation>,
}

/// 任務佇列操作類型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferJobType {
    Copy,
    Move,
    Delete,
    Trash,
}

/// 任務衝突處理策略
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictStrategy {
    Ask,
    Overwrite,
    Skip,
    Rename,
}

/// 傳入佇列前的同名衝突檢查項目
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferConflictItem {
    pub source_path: String,
    pub target_path: String,
    pub name: String,
    pub is_dir: bool,
    pub source_size: u64,
    pub target_size: u64,
    pub source_modified_ms: u64,
    pub target_modified_ms: u64,
}

/// 任務佇列狀態
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Queued,
    Scanning,
    Running,
    Paused,
    Completed,
    Cancelled,
    Failed,
}

/// 檔案搬移/複製/刪除佇列任務狀態快照
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferJobSnapshot {
    pub id: String,
    pub job_type: TransferJobType,
    pub sources: Vec<String>,
    pub destination: Option<String>,
    pub conflict_strategy: ConflictStrategy,
    pub status: JobStatus,
    pub total_bytes: u64,
    pub processed_bytes: u64,
    pub total_files: usize,
    pub processed_files: usize,
    pub skipped_files: usize,
    pub overwritten_files: usize,
    pub renamed_files: usize,
    pub current_file: String,
    pub speed_bytes_per_sec: u64,
    pub created_at_ms: u64,
    pub error_message: Option<String>,
}

/// 佇列任務紀錄保留策略設定
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueRetentionPolicy {
    pub keep_history: bool,
    pub retention_days: u32,
    pub max_events: usize,
}

impl Default for QueueRetentionPolicy {
    fn default() -> Self {
        Self {
            keep_history: true,
            retention_days: 7,
            max_events: 50,
        }
    }
}

/// 批次重新命名規則設定
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRenameRule {
    /// 尋找字串或 Regex
    pub find_text: String,
    /// 取代為字串
    pub replace_text: String,
    /// 是否使用正規表示式 (Regex)
    pub use_regex: bool,
    /// 是否區分大小寫
    pub case_sensitive: bool,
    /// 前綴文字
    pub prefix: String,
    /// 後綴文字（加在副檔名之前）
    pub suffix: String,
    /// 大小寫轉換: "none" | "lower" | "upper" | "title"
    pub case_transform: String,
    /// 是否啟用流水號編號
    pub sequence_enabled: bool,
    /// 流水號起始值
    pub sequence_start: usize,
    /// 流水號遞增步長
    pub sequence_step: usize,
    /// 流水號補零位數 (例如 3 代表 001)
    pub sequence_padding: usize,
    /// 流水號位置: "prefix" | "suffix" | "replace_name"
    pub sequence_position: String,
    /// 覆寫副檔名（若為空字串則維持原副檔名）
    pub extension_override: String,
}

/// 批次重新命名預覽單筆結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRenamePreviewItem {
    pub original_path: String,
    pub original_name: String,
    pub new_name: String,
    pub new_path: String,
    pub changed: bool,
    pub has_conflict: bool,
    pub error: Option<String>,
}

/// 批次重新命名執行結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchRenameExecutionResult {
    pub success_count: usize,
    pub skipped_count: usize,
    pub errors: Vec<String>,
    pub undo_pairs: Vec<(String, String)>, // (new_path, old_path)
}

/// 檔案雜湊與詳細屬性資訊
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChecksumResult {
    pub path: String,
    pub size: u64,
    pub md5: String,
    pub sha256: String,
    pub crc32: String,
    pub elapsed_ms: u64,
}

/// 檔案內容預覽結果
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreviewData {
    pub path: String,
    pub name: String,
    pub kind: EntryKind,
    pub size: u64,
    pub modified_ms: u64,
    pub is_binary: bool,
    pub text_preview: Option<String>,
    pub total_lines: Option<usize>,
    pub dir_item_count: Option<usize>,
}

/// 將路徑正規化為跨平台通用正斜線格式
pub fn normalize_path_str(path: &Path) -> String {
    let raw = path.to_string_lossy().to_string();
    // 移除 Windows verbatim 前綴 `\\?\`
    let cleaned = raw.strip_prefix(r"\\?\").unwrap_or(&raw);
    cleaned.replace('\\', "/")
}
