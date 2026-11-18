use crate::models::{normalize_path_str, FileChecksumResult};
use crc32fast::Hasher as Crc32Hasher;
use md5::Md5;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::process::Command;
use std::time::Instant;

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

/// 跨平台壓縮或解壓縮檔案（使用系統內建 `tar` 或 PowerShell Archive，支援 `.zip` / `.tar.gz`）
pub fn extract_archive_to_dir(archive_path: &str, dest_dir: Option<String>) -> Result<String, String> {
    let archive = PathBuf::from(archive_path);
    if !archive.is_file() {
        return Err("壓縮檔不存在".to_string());
    }

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

    // Windows 10/11、macOS 與 Linux 現代系統皆內建 bsdtar / GNU tar，可直接解壓縮 .zip, .tar, .tar.gz, .7z
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
