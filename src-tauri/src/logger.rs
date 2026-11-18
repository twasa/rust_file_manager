use crate::models::normalize_path_str;
use chrono::Utc;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::Arc;

const MAX_LOG_FILE_BYTES: u64 = 5 * 1024 * 1024; // 單一檔案上限 5 MB，超過自動輪替 (Rotation)

/// 日誌輸出格式（預設為 JSON Lines `.jsonl`，便於 Loki / ELK / Datadog / jq 收集與查詢）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LogFormat {
    Json,
    Text,
}

impl Default for LogFormat {
    fn default() -> Self {
        LogFormat::Json
    }
}

/// 單筆結構化日誌記錄
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredLogRecord {
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub event: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<Value>,
    pub pid: u32,
    pub os: String,
}

pub struct AppLogger {
    format: Mutex<LogFormat>,
    write_lock: Mutex<()>,
    log_path: PathBuf,
}

impl AppLogger {
    pub fn new() -> Arc<Self> {
        let log_dir = resolve_log_directory();
        let _ = fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("rfm.jsonl");

        let logger = Arc::new(Self {
            format: Mutex::new(LogFormat::Json),
            write_lock: Mutex::new(()),
            log_path,
        });

        logger.log(
            "INFO",
            "backend::startup",
            "app_initialized",
            "Rust File Manager 日誌系統已啟動 (預設格式: JSON Lines)",
            Some(json!({
                "version": env!("CARGO_PKG_VERSION"),
                "os": std::env::consts::OS,
                "arch": std::env::consts::ARCH
            })),
        );

        logger
    }

    pub fn install_panic_hook(logger: Arc<Self>) {
        let prev_hook = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |panic_info| {
            let location = panic_info
                .location()
                .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
                .unwrap_or_else(|| "unknown".to_string());

            let payload = if let Some(s) = panic_info.payload().downcast_ref::<&str>() {
                (*s).to_string()
            } else if let Some(s) = panic_info.payload().downcast_ref::<String>() {
                s.clone()
            } else {
                "Unknown panic payload".to_string()
            };

            logger.log(
                "PANIC",
                "backend::panic",
                "unhandled_panic",
                &format!("應用程式發生未預期 Panic: {}", payload),
                Some(json!({
                    "location": location,
                    "thread": std::thread::current().name().unwrap_or("unnamed")
                })),
            );
            prev_hook(panic_info);
        }));
    }

    pub fn set_format(&self, fmt: LogFormat) {
        *self.format.lock() = fmt;
        self.log(
            "INFO",
            "backend::logger",
            "log_format_changed",
            &format!("日誌輸出格式已切換為 {:?}", fmt),
            None,
        );
    }

    pub fn get_format(&self) -> LogFormat {
        *self.format.lock()
    }

    pub fn get_log_path_str(&self) -> String {
        normalize_path_str(&self.log_path)
    }

    pub fn log(
        &self,
        level: &str,
        target: &str,
        event: &str,
        message: &str,
        context: Option<Value>,
    ) {
        let record = StructuredLogRecord {
            timestamp: Utc::now().to_rfc3339(),
            level: level.to_ascii_uppercase(),
            target: target.to_string(),
            event: event.to_string(),
            message: message.to_string(),
            context,
            pid: std::process::id(),
            os: std::env::consts::OS.to_string(),
        };

        let _guard = self.write_lock.lock();
        self.rotate_if_needed();

        if let Some(parent) = self.log_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
        {
            let fmt = *self.format.lock();
            match fmt {
                LogFormat::Json => {
                    if let Ok(json_line) = serde_json::to_string(&record) {
                        let _ = writeln!(file, "{}", json_line);
                    }
                }
                LogFormat::Text => {
                    let ctx_str = record
                        .context
                        .as_ref()
                        .map(|c| format!(" | context={}", c))
                        .unwrap_or_default();
                    let _ = writeln!(
                        file,
                        "{} [{:<5}] [{}] ({}) {}{}",
                        record.timestamp,
                        record.level,
                        record.target,
                        record.event,
                        record.message,
                        ctx_str
                    );
                }
            }
        }
    }

    fn rotate_if_needed(&self) {
        if let Ok(meta) = fs::metadata(&self.log_path) {
            if meta.len() >= MAX_LOG_FILE_BYTES {
                let backup = self.log_path.with_extension("jsonl.1");
                let _ = fs::rename(&self.log_path, backup);
            }
        }
    }

    /// 讀取最近 N 筆日誌記錄（自動相容解析 JSON Lines 或純文字行）
    pub fn read_recent_logs(&self, limit: usize) -> Vec<StructuredLogRecord> {
        let _guard = self.write_lock.lock();
        if !self.log_path.exists() {
            return Vec::new();
        }
        let file = match fs::File::open(&self.log_path) {
            Ok(f) => f,
            Err(_) => return Vec::new(),
        };
        let reader = BufReader::new(file);
        let mut records = Vec::new();

        for line in reader.lines().map_while(Result::ok) {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            if let Ok(rec) = serde_json::from_str::<StructuredLogRecord>(trimmed) {
                records.push(rec);
            } else {
                records.push(StructuredLogRecord {
                    timestamp: Utc::now().to_rfc3339(),
                    level: "INFO".to_string(),
                    target: "raw_text".to_string(),
                    event: "legacy_line".to_string(),
                    message: trimmed.to_string(),
                    context: None,
                    pid: std::process::id(),
                    os: std::env::consts::OS.to_string(),
                });
            }
        }

        let max_items = limit.clamp(1, 1000);
        if records.len() > max_items {
            records.split_off(records.len() - max_items)
        } else {
            records
        }
    }

    pub fn clear_logs(&self) -> Result<(), String> {
        let _guard = self.write_lock.lock();
        if self.log_path.exists() {
            fs::write(&self.log_path, "").map_err(|e| format!("清除日誌失敗: {}", e))?;
        }
        Ok(())
    }
}

fn resolve_log_directory() -> PathBuf {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            if exe_dir.join("rfm-settings.json").exists() {
                return exe_dir.join("logs");
            }
        }
    }
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("rust-file-manager").join("logs")
}

/// 驗證設定檔 JSON 結構並在發現異常欄位時回傳診斷警告清單
pub fn diagnose_config_value(val: &Value) -> Vec<String> {
    let mut warnings = Vec::new();
    let cfg = val.get("settings").unwrap_or(val);

    if !cfg.is_object() {
        warnings.push("根節點或 settings 欄位不是有效的 JSON Object".to_string());
        return warnings;
    }

    if let Some(strategy) = cfg.get("conflictStrategy").and_then(|v| v.as_str()) {
        if !["ask", "overwrite", "skip", "rename"].contains(&strategy) {
            warnings.push(format!(
                "未知的 conflictStrategy 值「{}」，將自動回退為預設值 'ask'",
                strategy
            ));
        }
    }

    if let Some(font) = cfg.get("fontSettings") {
        if let Some(size) = font.get("fontSizePx").and_then(|v| v.as_u64()) {
            if !(8..=48).contains(&size) {
                warnings.push(format!("fontSizePx ({}) 超出合理範圍 (8~48)", size));
            }
        }
    }

    if let Some(kbs) = cfg.get("keybindings") {
        if !kbs.is_array() {
            warnings.push("keybindings 欄位格式錯誤 (應為 Array)".to_string());
        }
    }

    warnings
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_structured_json_logger_and_config_diagnosis() {
        let bad_json = json!({
            "settings": {
                "conflictStrategy": "invalid_mode",
                "fontSettings": { "fontSizePx": 999 },
                "keybindings": "not_an_array"
            }
        });
        let warnings = diagnose_config_value(&bad_json);
        assert_eq!(warnings.len(), 3);
    }
}
