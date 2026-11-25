use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ClipboardFilesResult {
    pub paths: Vec<String>,
    pub is_cut: bool,
}

#[cfg(target_os = "windows")]
mod platform {
    use super::ClipboardFilesResult;
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::{HANDLE, HGLOBAL, POINT};
    use windows_sys::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, GetClipboardData, OpenClipboard, RegisterClipboardFormatW,
        SetClipboardData,
    };
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GHND};
    use windows_sys::Win32::UI::Shell::{DragQueryFileW, DROPFILES, HDROP};

    const CF_HDROP: u32 = 15;
    const DROPEFFECT_COPY: u32 = 1;
    const DROPEFFECT_MOVE: u32 = 2;

    pub fn get_system_clipboard_files() -> Result<Option<ClipboardFilesResult>, String> {
        unsafe {
            if OpenClipboard(std::ptr::null_mut()) == 0 {
                return Err("無法開啟系統剪貼簿 (OpenClipboard failed)".to_string());
            }

            let handle = GetClipboardData(CF_HDROP);
            if handle.is_null() {
                CloseClipboard();
                return Ok(None);
            }

            let hdrop = handle as HDROP;
            let file_count = DragQueryFileW(hdrop, 0xFFFFFFFF, std::ptr::null_mut(), 0);
            let mut paths = Vec::with_capacity(file_count as usize);

            for i in 0..file_count {
                let required_len = DragQueryFileW(hdrop, i, std::ptr::null_mut(), 0);
                if required_len > 0 {
                    let mut buf: Vec<u16> = vec![0u16; (required_len + 1) as usize];
                    let copied = DragQueryFileW(hdrop, i, buf.as_mut_ptr(), required_len + 1);
                    if copied > 0 {
                        let path_str = String::from_utf16_lossy(&buf[..copied as usize]);
                        let normalized = path_str.replace('\\', "/");
                        paths.push(normalized);
                    }
                }
            }

            // 檢查 Preferred DropEffect 判定是複製 (1) 還是剪下 (2)
            let mut is_cut = false;
            let format_name: Vec<u16> = "Preferred DropEffect\0".encode_utf16().collect();
            let drop_effect_format = RegisterClipboardFormatW(format_name.as_ptr());
            if drop_effect_format != 0 {
                let effect_handle = GetClipboardData(drop_effect_format);
                if !effect_handle.is_null() {
                    let ptr = GlobalLock(effect_handle as HGLOBAL) as *const u32;
                    if !ptr.is_null() {
                        let effect = *ptr;
                        if effect == DROPEFFECT_MOVE {
                            is_cut = true;
                        }
                        GlobalUnlock(effect_handle as HGLOBAL);
                    }
                }
            }

            CloseClipboard();

            if paths.is_empty() {
                Ok(None)
            } else {
                Ok(Some(ClipboardFilesResult { paths, is_cut }))
            }
        }
    }

    pub fn set_system_clipboard_files(paths: Vec<String>, is_cut: bool) -> Result<(), String> {
        if paths.is_empty() {
            return Ok(());
        }

        // 轉換為寬字元並驗證實體檔案路徑
        let mut wide_chars: Vec<u16> = Vec::new();
        for p in &paths {
            // Windows 原生路徑建議採用反斜線
            let native_path = p.replace('/', "\\");
            let encoded: Vec<u16> = OsStr::new(&native_path)
                .encode_wide()
                .chain(std::iter::once(0))
                .collect();
            wide_chars.extend(encoded);
        }
        // DROPFILES 清單最後需額外以一組 \0 結尾
        wide_chars.push(0);

        let dropfiles_size = std::mem::size_of::<DROPFILES>();
        let total_bytes = dropfiles_size + wide_chars.len() * std::mem::size_of::<u16>();

        unsafe {
            let h_dropfiles = GlobalAlloc(GHND, total_bytes);
            if h_dropfiles.is_null() {
                return Err("無法配置全域記憶體以存放 DROPFILES".to_string());
            }

            let p_mem = GlobalLock(h_dropfiles);
            if p_mem.is_null() {
                return Err("無法鎖定 DROPFILES 全域記憶體".to_string());
            }

            let p_drop = p_mem as *mut DROPFILES;
            (*p_drop).pFiles = dropfiles_size as u32;
            (*p_drop).pt = POINT { x: 0, y: 0 };
            (*p_drop).fNC = 0;
            (*p_drop).fWide = 1; // 使用寬字元 (Unicode / UTF-16)

            let p_dest_files = (p_mem as *mut u8).add(dropfiles_size) as *mut u16;
            std::ptr::copy_nonoverlapping(wide_chars.as_ptr(), p_dest_files, wide_chars.len());
            GlobalUnlock(h_dropfiles);

            // 配置 Preferred DropEffect 記憶體 (4 bytes)
            let h_effect = GlobalAlloc(GHND, std::mem::size_of::<u32>());
            if !h_effect.is_null() {
                let p_effect_mem = GlobalLock(h_effect) as *mut u32;
                if !p_effect_mem.is_null() {
                    *p_effect_mem = if is_cut {
                        DROPEFFECT_MOVE
                    } else {
                        DROPEFFECT_COPY
                    };
                    GlobalUnlock(h_effect);
                }
            }

            if OpenClipboard(std::ptr::null_mut()) == 0 {
                return Err("無法開啟系統剪貼簿以寫入檔案清單".to_string());
            }

            EmptyClipboard();
            SetClipboardData(CF_HDROP, h_dropfiles as HANDLE);

            if !h_effect.is_null() {
                let format_name: Vec<u16> = "Preferred DropEffect\0".encode_utf16().collect();
                let drop_effect_format = RegisterClipboardFormatW(format_name.as_ptr());
                if drop_effect_format != 0 {
                    SetClipboardData(drop_effect_format, h_effect as HANDLE);
                }
            }

            CloseClipboard();
            Ok(())
        }
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::ClipboardFilesResult;
    use std::process::Command;

    pub fn get_system_clipboard_files() -> Result<Option<ClipboardFilesResult>, String> {
        // macOS 透過 osascript 讀取剪貼簿中的檔案路徑 (POSIX path)
        let output = Command::new("osascript")
            .arg("-e")
            .arg(
                "try
                    set fileList to clipboard as «class furl»
                    return POSIX path of fileList
                on error
                    try
                        set fileList to (the clipboard as list)
                        set pathList to {}
                        repeat with anItem in fileList
                            set end of pathList to POSIX path of (anItem as «class furl»)
                        end repeat
                        return pathList as string
                    on error
                        return \"\"
                    end try
                end try",
            )
            .output()
            .map_err(|e| e.to_string())?;

        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if text.is_empty() {
            return Ok(None);
        }

        let paths: Vec<String> = text
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();

        if paths.is_empty() {
            Ok(None)
        } else {
            Ok(Some(ClipboardFilesResult {
                paths,
                is_cut: false,
            }))
        }
    }

    pub fn set_system_clipboard_files(paths: Vec<String>, _is_cut: bool) -> Result<(), String> {
        if paths.is_empty() {
            return Ok(());
        }
        let posix_items: Vec<String> = paths
            .iter()
            .map(|p| format!("(POSIX file \"{}\")", p.replace('"', "\\\"")))
            .collect();
        let script = format!(
            "set the clipboard to {{{}}}",
            posix_items.join(", ")
        );
        let _ = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::ClipboardFilesResult;
    use std::process::Command;

    pub fn get_system_clipboard_files() -> Result<Option<ClipboardFilesResult>, String> {
        // Linux 依序嘗試 xclip, wl-paste 讀取 text/uri-list
        let output = if let Ok(out) = Command::new("wl-paste")
            .args(["-t", "text/uri-list"])
            .output()
        {
            out
        } else if let Ok(out) = Command::new("xclip")
            .args(["-selection", "clipboard", "-t", "text/uri-list", "-o"])
            .output()
        {
            out
        } else {
            return Ok(None);
        };

        let content = String::from_utf8_lossy(&output.stdout);
        let mut paths = Vec::new();
        for line in content.lines() {
            let line = line.trim();
            if let Some(stripped) = line.strip_prefix("file://") {
                paths.push(stripped.to_string());
            }
        }

        if paths.is_empty() {
            Ok(None)
        } else {
            Ok(Some(ClipboardFilesResult {
                paths,
                is_cut: false,
            }))
        }
    }

    pub fn set_system_clipboard_files(paths: Vec<String>, _is_cut: bool) -> Result<(), String> {
        if paths.is_empty() {
            return Ok(());
        }
        let mut uris = String::new();
        for p in paths {
            uris.push_str(&format!("file://{}\r\n", p));
        }

        // 嘗試寫入 xclip 或 wl-copy
        let _ = Command::new("wl-copy")
            .args(["-t", "text/uri-list"])
            .arg(&uris)
            .output();
        Ok(())
    }
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
mod platform {
    use super::ClipboardFilesResult;

    pub fn get_system_clipboard_files() -> Result<Option<ClipboardFilesResult>, String> {
        Ok(None)
    }

    pub fn set_system_clipboard_files(_paths: Vec<String>, _is_cut: bool) -> Result<(), String> {
        Ok(())
    }
}

pub fn get_system_clipboard_files() -> Result<Option<ClipboardFilesResult>, String> {
    platform::get_system_clipboard_files()
}

pub fn set_system_clipboard_files(paths: Vec<String>, is_cut: bool) -> Result<(), String> {
    platform::set_system_clipboard_files(paths, is_cut)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_clipboard_files_result_serde() {
        let res = ClipboardFilesResult {
            paths: vec!["D:/Music/song.mp3".to_string(), "D:/Docs/note.txt".to_string()],
            is_cut: true,
        };
        let serialized = serde_json::to_string(&res).expect("serialization ok");
        let deserialized: ClipboardFilesResult =
            serde_json::from_str(&serialized).expect("deserialization ok");
        assert_eq!(res, deserialized);
        assert!(deserialized.is_cut);
        assert_eq!(deserialized.paths.len(), 2);
    }
}
