use crate::logger::resolve_app_directory;
use crate::models::normalize_path_str;
use crate::system_ops::{extract_archive_to_dir, validate_safe_entry_name};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};

/// 外掛宣告清單 (plugin.json 結構)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PluginManifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    #[serde(default = "default_category")]
    pub category: String,
    pub author: Option<String>,
    #[serde(default)]
    pub extensions: Vec<String>,
    #[serde(default = "default_main")]
    pub main: String,
    pub icon: Option<String>,
    pub styles: Option<String>,
}

fn default_category() -> String {
    "viewer".to_string()
}

fn default_main() -> String {
    "index.js".to_string()
}

/// 已安裝外掛完整資訊 (包含實體磁碟路徑與狀態)
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub category: String,
    pub author: Option<String>,
    pub extensions: Vec<String>,
    pub dir_path: String,
    pub main_file: String,
    pub main_file_path: String,
    pub style_file_path: Option<String>,
    pub is_builtin: bool,
}

/// 取得應用程式外掛根目錄 (`plugins/`)
pub fn resolve_plugins_directory() -> PathBuf {
    resolve_app_directory().join("plugins")
}

/// 確保外掛根目錄存在
pub fn ensure_plugins_directory() -> Result<PathBuf, String> {
    let p = resolve_plugins_directory();
    if !p.exists() {
        fs::create_dir_all(&p).map_err(|e| format!("無法建立外掛目錄「{}」: {}", p.display(), e))?;
    }
    Ok(p)
}

/// 驗證外掛 ID 是否符合安全規格（只允許小寫英數字、點與減號，避免路徑穿越）
pub fn validate_plugin_id(id: &str) -> Result<String, String> {
    let validated = validate_safe_entry_name(id)?;
    if validated.is_empty() {
        return Err("外掛 ID 不可為空".to_string());
    }
    // 檢查字元合法性
    if !validated
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_')
    {
        return Err("外掛 ID 僅允許英數字、底線、減號與點號 (如 rfm.preview.pdf)".to_string());
    }
    Ok(validated)
}

/// 掃描已安裝的所有外部外掛清單
pub fn list_installed_plugins_in_dir(plugins_dir: &Path) -> Result<Vec<InstalledPluginInfo>, String> {
    if !plugins_dir.exists() || !plugins_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut result = Vec::new();
    let entries = fs::read_dir(plugins_dir).map_err(|e| format!("讀取外掛目錄失敗: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let manifest_path = path.join("plugin.json");
        if !manifest_path.is_file() {
            continue;
        }

        if let Ok(content) = fs::read_to_string(&manifest_path) {
            if let Ok(manifest) = serde_json::from_str::<PluginManifest>(&content) {
                let main_file = if manifest.main.trim().is_empty() {
                    "index.js".to_string()
                } else {
                    manifest.main
                };
                let main_file_path = path.join(&main_file);
                let style_file_path = manifest
                    .styles
                    .as_ref()
                    .map(|s| normalize_path_str(&path.join(s)));

                let is_builtin = manifest.id.starts_with("builtin.") || manifest.id.starts_with("rfm.builtin.");

                result.push(InstalledPluginInfo {
                    id: manifest.id,
                    name: manifest.name,
                    version: manifest.version,
                    description: manifest.description,
                    category: manifest.category,
                    author: manifest.author,
                    extensions: manifest.extensions,
                    dir_path: normalize_path_str(&path),
                    main_file,
                    main_file_path: normalize_path_str(&main_file_path),
                    style_file_path,
                    is_builtin,
                });
            }
        }
    }

    // 依外掛 ID 排序保持穩定性
    result.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(result)
}

/// 列出當前環境中所有已安裝的外掛（支援使用者目錄與系統內建外掛目錄合併載入）
pub fn list_installed_plugins() -> Result<Vec<InstalledPluginInfo>, String> {
    let user_dir = ensure_plugins_directory()?;
    let mut plugins = list_installed_plugins_in_dir(&user_dir)?;

    // 若為系統安裝版且 exe 同目錄存在 plugins/（如隨 MSI 安裝的內建外掛），一併掃描載入
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let sys_plugins_dir = exe_dir.join("plugins");
            if sys_plugins_dir.exists() && sys_plugins_dir != user_dir {
                if let Ok(sys_plugins) = list_installed_plugins_in_dir(&sys_plugins_dir) {
                    for p in sys_plugins {
                        if !plugins.iter().any(|existing| existing.id == p.id) {
                            plugins.push(p);
                        }
                    }
                }
            }
        }
    }

    plugins.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(plugins)
}

/// 安裝外掛套件包（支援 `.rfmp` 或 `.zip` 壓縮包）
pub fn install_plugin_package_into_dir(
    archive_path: &str,
    target_plugins_dir: &Path,
) -> Result<InstalledPluginInfo, String> {
    let archive = PathBuf::from(archive_path);
    if !archive.is_file() {
        return Err("外掛安裝包檔案不存在".to_string());
    }

    // 建立臨時解壓縮目錄
    let temp_extract_id = format!("rfm_plugin_tmp_{}", uuid::Uuid::new_v4());
    let temp_extract_dir = target_plugins_dir.join(&temp_extract_id);
    fs::create_dir_all(&temp_extract_dir)
        .map_err(|e| format!("建立臨時安裝目錄失敗: {}", e))?;

    // 執行帶 Zip Slip 安全防禦的解壓縮
    let extract_res = extract_archive_to_dir(
        archive_path,
        Some(temp_extract_dir.to_string_lossy().to_string()),
    );

    if let Err(err) = extract_res {
        let _ = fs::remove_dir_all(&temp_extract_dir);
        return Err(format!("解壓縮外掛安裝包失敗: {}", err));
    }

    // 搜尋解壓後的目錄中是否存在 plugin.json（支援根目錄或單層子目錄封裝）
    let mut manifest_path = temp_extract_dir.join("plugin.json");
    let mut plugin_src_dir = temp_extract_dir.clone();

    if !manifest_path.is_file() {
        // 嘗試在第一層子目錄尋找
        if let Ok(entries) = fs::read_dir(&temp_extract_dir) {
            for entry in entries.flatten() {
                let sub = entry.path();
                if sub.is_dir() {
                    let sub_manifest = sub.join("plugin.json");
                    if sub_manifest.is_file() {
                        manifest_path = sub_manifest;
                        plugin_src_dir = sub;
                        break;
                    }
                }
            }
        }
    }

    if !manifest_path.is_file() {
        let _ = fs::remove_dir_all(&temp_extract_dir);
        return Err("外掛包內未找到有效的 plugin.json 宣告清單".to_string());
    }

    let manifest_content = fs::read_to_string(&manifest_path)
        .map_err(|e| {
            let _ = fs::remove_dir_all(&temp_extract_dir);
            format!("無法讀取 plugin.json: {}", e)
        })?;

    let manifest: PluginManifest = serde_json::from_str(&manifest_content)
        .map_err(|e| {
            let _ = fs::remove_dir_all(&temp_extract_dir);
            format!("plugin.json 格式解析錯誤: {}", e)
        })?;

    let safe_id = validate_plugin_id(&manifest.id).map_err(|e| {
        let _ = fs::remove_dir_all(&temp_extract_dir);
        e
    })?;

    let final_dest = target_plugins_dir.join(&safe_id);

    // 如果該外掛已存在，先安全清理舊版
    if final_dest.exists() {
        let _ = fs::remove_dir_all(&final_dest);
    }

    // 將外掛內容複製或搬移至最終 plugins/<id> 目錄
    if plugin_src_dir == temp_extract_dir {
        // 直接重新命名/搬移
        if let Err(e) = fs::rename(&temp_extract_dir, &final_dest) {
            // 若跨磁區搬移失敗則使用複製
            copy_dir_recursive(&temp_extract_dir, &final_dest).map_err(|ce| {
                let _ = fs::remove_dir_all(&temp_extract_dir);
                format!("安裝外掛目錄失敗: {} (複製備援: {})", e, ce)
            })?;
            let _ = fs::remove_dir_all(&temp_extract_dir);
        }
    } else {
        // 將子目錄搬移至目標
        if let Err(e) = fs::rename(&plugin_src_dir, &final_dest) {
            copy_dir_recursive(&plugin_src_dir, &final_dest).map_err(|ce| {
                let _ = fs::remove_dir_all(&temp_extract_dir);
                format!("安裝外掛目錄失敗: {} (複製備援: {})", e, ce)
            })?;
        }
        let _ = fs::remove_dir_all(&temp_extract_dir);
    }

    let main_file = if manifest.main.trim().is_empty() {
        "index.js".to_string()
    } else {
        manifest.main
    };
    let main_file_path = final_dest.join(&main_file);
    let style_file_path = manifest
        .styles
        .as_ref()
        .map(|s| normalize_path_str(&final_dest.join(s)));

    Ok(InstalledPluginInfo {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        category: manifest.category,
        author: manifest.author,
        extensions: manifest.extensions,
        dir_path: normalize_path_str(&final_dest),
        main_file,
        main_file_path: normalize_path_str(&main_file_path),
        style_file_path,
        is_builtin: false,
    })
}

/// 安裝外掛（預設安裝到應用程式外掛目錄）
pub fn install_plugin_package(archive_path: &str) -> Result<InstalledPluginInfo, String> {
    let dir = ensure_plugins_directory()?;
    install_plugin_package_into_dir(archive_path, &dir)
}

/// 解除安裝外掛（刪除 `plugins/<id>` 目錄）
pub fn uninstall_plugin_from_dir(plugin_id: &str, plugins_dir: &Path) -> Result<bool, String> {
    let safe_id = validate_plugin_id(plugin_id)?;
    let target = plugins_dir.join(&safe_id);
    if !target.exists() {
        return Err(format!("找不到外掛「{}」之安裝目錄", plugin_id));
    }
    fs::remove_dir_all(&target).map_err(|e| format!("刪除外掛目錄失敗: {}", e))?;
    Ok(true)
}

/// 解除安裝指定 ID 的外掛
pub fn uninstall_plugin(plugin_id: &str) -> Result<bool, String> {
    let dir = ensure_plugins_directory()?;
    uninstall_plugin_from_dir(plugin_id, &dir)
}

/// 讀取外掛內部文字資源（如 `index.js`, `style.css`），防止路徑穿越
pub fn read_plugin_file_content(plugin_id: &str, rel_path: &str) -> Result<String, String> {
    let dir = ensure_plugins_directory()?;
    let safe_id = validate_plugin_id(plugin_id)?;
    let plugin_dir = dir.join(&safe_id);
    if !plugin_dir.exists() || !plugin_dir.is_dir() {
        return Err(format!("外掛「{}」目錄不存在", plugin_id));
    }

    // 檢查 rel_path 不得有穿越
    let normalized = rel_path.replace('\\', "/");
    let path = Path::new(&normalized);
    for comp in path.components() {
        match comp {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("非法檔案路徑（路徑穿越防護）".to_string());
            }
            _ => {}
        }
    }

    let target_file = plugin_dir.join(path);
    if !target_file.is_file() {
        return Err(format!("外掛檔案「{}」不存在", rel_path));
    }

    fs::read_to_string(&target_file).map_err(|e| format!("讀取外掛檔案內容失敗: {}", e))
}

/// 遞迴複製目錄內容
fn copy_dir_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    fs::create_dir_all(dst)?;
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_plugin_id() {
        assert!(validate_plugin_id("rfm.preview.pdf").is_ok());
        assert!(validate_plugin_id("image_viewer-v2").is_ok());
        assert!(validate_plugin_id("../evil").is_err());
        assert!(validate_plugin_id("bad/slash").is_err());
        assert!(validate_plugin_id("").is_err());
    }

    #[test]
    fn test_manifest_deserialization() {
        let json_str = r#"{
            "id": "rfm.preview.pdf",
            "name": "PDF 文件預覽器",
            "version": "1.0.0",
            "description": "支援 PDF 文件多頁瀏覽與縮放",
            "category": "viewer",
            "extensions": [".pdf"],
            "main": "index.js",
            "styles": "style.css",
            "author": "William Wang"
        }"#;

        let manifest: PluginManifest = serde_json::from_str(json_str).expect("parse manifest");
        assert_eq!(manifest.id, "rfm.preview.pdf");
        assert_eq!(manifest.extensions, vec![".pdf"]);
        assert_eq!(manifest.main, "index.js");
        assert_eq!(manifest.styles, Some("style.css".to_string()));
    }

    #[test]
    fn test_list_and_uninstall_plugins_in_dir() {
        let temp_dir = std::env::temp_dir().join(format!("rfm_test_plugins_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        // 建立測試外掛子目錄
        let p1 = temp_dir.join("test.plugin");
        fs::create_dir_all(&p1).unwrap();
        fs::write(
            p1.join("plugin.json"),
            r#"{"id":"test.plugin","name":"Test","version":"0.1.0","description":"desc","extensions":[".test"]}"#,
        )
        .unwrap();
        fs::write(p1.join("index.js"), "console.log('test');").unwrap();

        let list = list_installed_plugins_in_dir(&temp_dir).expect("list");
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "test.plugin");
        assert_eq!(list[0].main_file, "index.js");

        let uninstall_res = uninstall_plugin_from_dir("test.plugin", &temp_dir);
        assert!(uninstall_res.is_ok());
        assert!(!p1.exists());

        let list_after = list_installed_plugins_in_dir(&temp_dir).expect("list after");
        assert_eq!(list_after.len(), 0);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_read_plugin_file_content_and_traversal_guard() {
        let temp_dir = std::env::temp_dir().join(format!("rfm_test_read_{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&temp_dir).unwrap();

        let p1 = temp_dir.join("rfm.preview.pdf");
        fs::create_dir_all(&p1).unwrap();
        fs::write(
            p1.join("plugin.json"),
            r#"{"id":"rfm.preview.pdf","name":"PDF","version":"1.0.0","description":"PDF","extensions":[".pdf"]}"#,
        )
        .unwrap();
        fs::write(p1.join("index.js"), "console.log('pdf');").unwrap();

        let list = list_installed_plugins_in_dir(&temp_dir).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "rfm.preview.pdf");

        // 驗證安全防禦拒絕非法 ID 與路徑穿越
        assert!(validate_plugin_id("../evil").is_err());
        assert!(validate_plugin_id("bad/id").is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
