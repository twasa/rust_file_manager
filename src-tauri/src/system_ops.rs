use crate::models::{normalize_path_str, FileChecksumResult};
use crc32fast::Hasher as Crc32Hasher;
use md5::Md5;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::Instant;

/// 驗證單一檔案或目錄名稱是否安全（禁止路徑穿越 `..`、斜線、控制字元與 Windows 保留設備名）
pub fn validate_safe_entry_name(name: &str) -> Result<String, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("名稱不可為空".to_string());
    }
    if trimmed == "." || trimmed == ".." {
        return Err("名稱不可為 '.' 或 '..'".to_string());
    }
    if trimmed.contains('/')
        || trimmed.contains('\\')
        || trimmed.contains(':')
        || trimmed.contains('\0')
    {
        return Err("名稱包含非法路徑或控制字元".to_string());
    }

    // 檢查 Windows 保留設備名稱 (CON, PRN, AUX, NUL, COM1..9, LPT1..9)
    let stem_upper = trimmed
        .split('.')
        .next()
        .unwrap_or("")
        .to_ascii_uppercase();
    const RESERVED_NAMES: &[&str] = &[
        "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];
    if RESERVED_NAMES.contains(&stem_upper.as_str()) {
        return Err(format!("「{}」為作業系統保留設備名稱，無法使用", trimmed));
    }

    Ok(trimmed.to_string())
}

/// 檢查壓縮檔內部清單是否包含 Zip Slip 路徑穿越攻擊（如 `../../evil` 或絕對路徑 `/etc/passwd`、`C:\`）
pub fn validate_archive_entries_list(entries_output: &str) -> Result<(), String> {
    for raw_line in entries_output.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        // 檢查是否以斜線、反斜線開頭，或包含磁碟機代號 ':'
        if line.starts_with('/') || line.starts_with('\\') || line.contains(':') {
            return Err(format!(
                "安全攔截 (Zip Slip 防護)：壓縮檔內含絕對路徑項目「{}」",
                line
            ));
        }

        let normalized = line.replace('\\', "/");
        let path = Path::new(&normalized);
        for comp in path.components() {
            match comp {
                Component::ParentDir => {
                    return Err(format!(
                        "安全攔截 (Zip Slip 防護)：壓縮檔內含上層路徑穿越項目「{}」",
                        line
                    ));
                }
                Component::RootDir | Component::Prefix(_) => {
                    return Err(format!(
                        "安全攔截 (Zip Slip 防護)：壓縮檔內含根目錄項目「{}」",
                        line
                    ));
                }
                _ => {}
            }
        }
    }
    Ok(())
}

/// 計算檔案的 MD5、SHA-256 與 CRC32 雜湊值（用於右鍵選單「計算檔案校驗雜湊」）
pub fn compute_file_checksums(raw_path: &str) -> Result<FileChecksumResult, String> {
    let start = Instant::now();
    let path = PathBuf::from(raw_path);
    if !path.is_file() {
        return Err("只能對檔案計算雜湊校驗值".to_string());
    }

    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;

    let mut md5_hasher = Md5::new();
    let mut sha256_hasher = Sha256::new();
    let mut crc32_hasher = Crc32Hasher::new();

    let mut buf = vec![0u8; 512 * 1024];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        md5_hasher.update(&buf[..n]);
        sha256_hasher.update(&buf[..n]);
        crc32_hasher.update(&buf[..n]);
    }

    let md5_hex = format!("{:x}", md5_hasher.finalize());
    let sha256_hex = format!("{:x}", sha256_hasher.finalize());
    let crc32_hex = format!("{:08x}", crc32_hasher.finalize());

    Ok(FileChecksumResult {
        path: normalize_path_str(&path),
        size: meta.len(),
        md5: md5_hex,
        sha256: sha256_hex,
        crc32: crc32_hex,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}

/// 跨平台使用系統預設程式開啟檔案或目錄
pub fn open_with_system_default(raw_path: &str) -> Result<(), String> {
    open::that(raw_path).map_err(|e| format!("無法使用預設程式開啟 ({}): {}", raw_path, e))
}

/// 跨平台在指定目錄開啟終端機 (Windows PowerShell 7 / wt, macOS Terminal, Linux x-terminal-emulator)
pub fn open_terminal_in_dir(raw_path: &str) -> Result<(), String> {
    let path = PathBuf::from(raw_path);
    let target_dir = if path.is_dir() {
        path
    } else {
        path.parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."))
    };

    #[cfg(target_os = "windows")]
    {
        // 優先嘗試開啟 Windows Terminal (wt.exe) 指向 pwsh，否則直接啟動 pwsh 或 powershell
        if Command::new("wt.exe")
            .args(["-d", &target_dir.to_string_lossy()])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        if Command::new("pwsh.exe")
            .current_dir(&target_dir)
            .spawn()
            .is_ok()
        {
            return Ok(());
        }
        Command::new("powershell.exe")
            .current_dir(&target_dir)
            .spawn()
            .map_err(|e| format!("無法啟動終端機: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-a", "Terminal", &target_dir.to_string_lossy()])
            .spawn()
            .map_err(|e| format!("無法啟動 macOS Terminal: {}", e))?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let terminals = [
            "x-terminal-emulator",
            "gnome-terminal",
            "konsole",
            "xfce4-terminal",
            "alacritty",
            "kitty",
            "xterm",
        ];
        for term in terminals {
            if Command::new(term).current_dir(&target_dir).spawn().is_ok() {
                return Ok(());
            }
        }
        Err("找不到可用的 Linux 終端機模擬器".to_string())
    }
}

/// 在原生系統檔案總管 (Explorer / Finder / Nautilus) 中顯示並標示該項目
pub fn reveal_in_os_shell(raw_path: &str) -> Result<(), String> {
    let path = PathBuf::from(raw_path);
    if !path.exists() {
        return Err("目標路徑不存在".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let win_path = path.to_string_lossy().replace('/', "\\");
        Command::new("explorer.exe")
            .arg(format!("/select,{}", win_path))
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        let dir = if path.is_dir() {
            path
        } else {
            path.parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_else(|| PathBuf::from("."))
        };
        open::that(dir).map_err(|e| e.to_string())
    }
}

/// 跨平台壓縮或解壓縮檔案（內建預檢防範 Zip Slip 路徑穿越攻擊）
pub fn extract_archive_to_dir(archive_path: &str, dest_dir: Option<String>) -> Result<String, String> {
    let archive = PathBuf::from(archive_path);
    if !archive.is_file() {
        return Err("壓縮檔不存在".to_string());
    }

    // 1. 解壓縮前先執行 `tar -tf` 檢視內部項目清單，防範 Zip Slip (如 `../../evil`)
    let list_output = Command::new("tar")
        .args(["-tf", &archive.to_string_lossy()])
        .output()
        .map_err(|e| format!("無法檢查壓縮檔內容結構: {}", e))?;

    if !list_output.status.success() {
        return Err("無法讀取壓縮檔目錄清單，檔案可能損壞或格式不受支援".to_string());
    }

    let entries_str = String::from_utf8_lossy(&list_output.stdout);
    validate_archive_entries_list(&entries_str)?;

    let parent = archive
        .parent()
        .ok_or_else(|| "無法取得壓縮檔父目錄".to_string())?;
    let stem = archive
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "extracted".to_string());

    let out_dir = match dest_dir {
        Some(d) if !d.trim().is_empty() => PathBuf::from(d),
        _ => parent.join(stem),
    };

    fs::create_dir_all(&out_dir).map_err(|e| format!("建立解壓縮目標目錄失敗: {}", e))?;

    // 2. 驗證通過後才實際執行解壓縮
    let status = Command::new("tar")
        .args([
            "-xf",
            &archive.to_string_lossy(),
            "-C",
            &out_dir.to_string_lossy(),
        ])
        .status()
        .map_err(|e| format!("執行解壓縮程式失敗: {}", e))?;

    if !status.success() {
        return Err("解壓縮過程返回非零狀態碼，請確認壓縮檔格式是否受支援".to_string());
    }

    Ok(normalize_path_str(&out_dir))
}

/// 將選取的多個檔案或目錄壓縮為 `.zip` 壓縮檔
pub fn compress_items_to_zip(sources: &[String], output_zip_path: &str) -> Result<String, String> {
    if sources.is_empty() {
        return Err("未選取任何要壓縮的項目".to_string());
    }
    let out_pb = PathBuf::from(output_zip_path);
    let first_parent = PathBuf::from(&sources[0])
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."));

    let mut cmd = Command::new("tar");
    cmd.current_dir(&first_parent)
        .arg("-a")
        .arg("-cf")
        .arg(&out_pb);

    for src in sources {
        let p = PathBuf::from(src);
        if let Some(name) = p.file_name() {
            cmd.arg(name);
        }
    }

    let status = cmd
        .status()
        .map_err(|e| format!("呼叫系統壓縮工具失敗: {}", e))?;

    if !status.success() {
        return Err("建立壓縮檔失敗".to_string());
    }

    Ok(normalize_path_str(&out_pb))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_zip_slip_path_traversal_prevention() {
        // 合法的壓縮檔路徑清單
        let safe_list = "folder/\nfolder/sub/file.txt\nREADME.md\n";
        assert!(validate_archive_entries_list(safe_list).is_ok());

        // 含 `../` 的 Zip Slip 路徑穿越
        let traversal_unix = "folder/\n../../etc/cron.d/backdoor\n";
        assert!(validate_archive_entries_list(traversal_unix).is_err());

        // 含 `..\` 的 Windows Zip Slip 路徑穿越
        let traversal_win = "normal.txt\n..\\..\\Windows\\System32\\evil.dll\n";
        assert!(validate_archive_entries_list(traversal_win).is_err());

        // 含絕對路徑或磁碟代號
        assert!(validate_archive_entries_list("/etc/passwd\n").is_err());
        assert!(validate_archive_entries_list("C:\\Windows\\win.ini\n").is_err());
    }

    #[test]
    fn test_validate_safe_entry_name() {
        assert!(validate_safe_entry_name("project_2026.txt").is_ok());
        assert!(validate_safe_entry_name("..").is_err());
        assert!(validate_safe_entry_name("../secret").is_err());
        assert!(validate_safe_entry_name("sub\\file.txt").is_err());
        assert!(validate_safe_entry_name("CON.txt").is_err());
        assert!(validate_safe_entry_name("nul").is_err());
    }
}
