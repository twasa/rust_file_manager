use crate::models::{
    normalize_path_str, DirectoryListing, EntryKind, FileEntry, FilePreviewData, SpecialLocation,
    SystemLocations, VolumeInfo,
};
use lru::LruCache;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::Mutex;
use rayon::prelude::*;
use std::fs;
use std::io::Read;
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use sysinfo::Disks;

const CACHE_TTL_MS: u128 = 12_000; // 12 秒智慧快取，搭配檔案變更監聽即時失效

#[derive(Clone)]
struct CachedDir {
    listing: DirectoryListing,
    cached_at: Instant,
}

pub struct FsCacheState {
    cache: Mutex<LruCache<String, CachedDir>>,
    _watcher: Mutex<Option<RecommendedWatcher>>,
}

impl FsCacheState {
    pub fn new(capacity: usize) -> Arc<Self> {
        let cap = NonZeroUsize::new(capacity.max(16)).unwrap();
        let state = Arc::new(Self {
            cache: Mutex::new(LruCache::new(cap)),
            _watcher: Mutex::new(None),
        });

        let state_clone = Arc::clone(&state);
        if let Ok(watcher) = RecommendedWatcher::new(
            move |res: Result<notify::Event, notify::Error>| {
                if let Ok(event) = res {
                    for p in event.paths {
                        if let Some(parent) = p.parent() {
                            state_clone.invalidate_path(parent);
                        }
                        state_clone.invalidate_path(&p);
                    }
                }
            },
            Config::default(),
        ) {
            *state._watcher.lock() = Some(watcher);
        }

        state
    }

    pub fn invalidate_path(&self, path: &Path) {
        let key = normalize_path_str(path);
        let mut guard = self.cache.lock();
        guard.pop(&key);
        // 同時處理結尾有無斜線的變體
        let trimmed = key.trim_end_matches('/').to_string();
        guard.pop(&trimmed);
        guard.pop(&format!("{}/", trimmed));
    }

    pub fn clear_all(&self) {
        self.cache.lock().clear();
    }

    pub fn watch_dir(&self, path: &Path) {
        if let Some(watcher) = self._watcher.lock().as_mut() {
            let _ = watcher.watch(path, RecursiveMode::NonRecursive);
        }
    }

    pub fn get(&self, key: &str) -> Option<DirectoryListing> {
        let mut guard = self.cache.lock();
        if let Some(item) = guard.get(key) {
            if item.cached_at.elapsed().as_millis() <= CACHE_TTL_MS {
                let mut listing = item.listing.clone();
                listing.from_cache = true;
                listing.elapsed_ms = 0;
                return Some(listing);
            }
        }
        guard.pop(key);
        None
    }

    pub fn put(&self, key: String, listing: DirectoryListing) {
        let mut guard = self.cache.lock();
        guard.put(
            key,
            CachedDir {
                listing,
                cached_at: Instant::now(),
            },
        );
    }
}

fn system_time_to_ms(t: Result<SystemTime, std::io::Error>) -> u64 {
    t.ok()
        .and_then(|st| st.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_hidden_entry(name: &str, metadata: &fs::Metadata) -> bool {
    if name.starts_with('.') && name.len() > 1 {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;
        if (metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN) != 0 {
            return true;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = metadata;
    }
    false
}

/// 高效能目錄讀取（支援 Rayon 多執行緒平行解析 Metadata 與 LRU 快取）
pub fn read_directory_cached(
    cache_state: &FsCacheState,
    raw_path: &str,
    force_refresh: bool,
) -> Result<DirectoryListing, String> {
    let start = Instant::now();
    let target_path = if raw_path.trim().is_empty() || raw_path == "~" {
        dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
    } else {
        PathBuf::from(raw_path)
    };

    if !target_path.exists() {
        return Err(format!("路徑不存在: {}", raw_path));
    }
    if !target_path.is_dir() {
        return Err(format!("目標路徑不是目錄: {}", raw_path));
    }

    let canonical = target_path
        .canonicalize()
        .unwrap_or_else(|_| target_path.clone());
    // 若 canonicalize 將虛擬磁碟或網路磁碟轉為無效或不同的根路徑，回退使用原始路徑
    let effective_path = if canonical.exists() {
        canonical
    } else {
        target_path
    };
    let norm_key = normalize_path_str(&effective_path);

    if !force_refresh {
        if let Some(cached) = cache_state.get(&norm_key) {
            return Ok(cached);
        }
    }

    let read_dir = fs::read_dir(&effective_path)
        .map_err(|e| format!("無法讀取目錄 ({}): {}", norm_key, e))?;
    let raw_entries: Vec<fs::DirEntry> = read_dir.filter_map(|e| e.ok()).collect();

    // 使用 Rayon 平行轉換百萬/萬級目錄項目
    let mut entries: Vec<FileEntry> = raw_entries
        .into_par_iter()
        .filter_map(|entry| {
            let file_name = entry.file_name().to_string_lossy().to_string();
            let entry_path = entry.path();
            let symlink_meta = fs::symlink_metadata(&entry_path).ok()?;
            let is_symlink = symlink_meta.file_type().is_symlink();

            // 若為 symlink，嘗試取得目標 metadata 判定是否為目錄
            let meta = if is_symlink {
                fs::metadata(&entry_path).unwrap_or(symlink_meta)
            } else {
                symlink_meta
            };

            let is_dir = meta.is_dir();
            let size = if is_dir { 0 } else { meta.len() };
            let modified_ms = system_time_to_ms(meta.modified());
            let created_ms = system_time_to_ms(meta.created());
            let is_hidden = is_hidden_entry(&file_name, &meta);
            let is_readonly = meta.permissions().readonly();

            let extension = if is_dir {
                String::new()
            } else {
                entry_path
                    .extension()
                    .map(|ext| ext.to_string_lossy().to_string())
                    .unwrap_or_default()
            };

            let kind = EntryKind::from_extension(&extension, is_dir, is_symlink);

            Some(FileEntry {
                name: file_name,
                path: normalize_path_str(&entry_path),
                is_dir,
                is_symlink,
                is_hidden,
                is_readonly,
                size,
                modified_ms,
                created_ms,
                extension,
                kind,
            })
        })
        .collect();

    // 預設排序：目錄優先，接著依名稱不分大小寫自然排序
    entries.par_sort_unstable_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    let mut total_files = 0usize;
    let mut total_dirs = 0usize;
    let mut total_size = 0u64;
    for item in &entries {
        if item.is_dir {
            total_dirs += 1;
        } else {
            total_files += 1;
            total_size = total_size.saturating_add(item.size);
        }
    }

    let parent_path = effective_path
        .parent()
        .map(normalize_path_str)
        .filter(|p| !p.is_empty() && p != &norm_key);
    let elapsed_ms = start.elapsed().as_millis() as u64;

    let listing = DirectoryListing {
        path: norm_key.clone(),
        parent_path,
        entries,
        total_files,
        total_dirs,
        total_size,
        from_cache: false,
        elapsed_ms,
    };

    cache_state.put(norm_key, listing.clone());
    cache_state.watch_dir(&effective_path);

    Ok(listing)
}

#[cfg(target_os = "windows")]
fn enumerate_windows_logical_volumes(existing: &[VolumeInfo]) -> Vec<VolumeInfo> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;

    #[link(name = "kernel32")]
    extern "system" {
        fn GetLogicalDrives() -> u32;
        fn GetDriveTypeW(lpRootPathName: *const u16) -> u32;
        fn GetVolumeInformationW(
            lpRootPathName: *const u16,
            lpVolumeNameBuffer: *mut u16,
            nVolumeNameSize: u32,
            lpVolumeSerialNumber: *mut u32,
            lpMaximumComponentLength: *mut u32,
            lpFileSystemFlags: *mut u32,
            lpFileSystemNameBuffer: *mut u16,
            nFileSystemNameSize: u32,
        ) -> i32;
        fn GetDiskFreeSpaceExW(
            lpDirectoryName: *const u16,
            lpFreeBytesAvailableToCaller: *mut u64,
            lpTotalNumberOfBytes: *mut u64,
            lpTotalNumberOfFreeBytes: *mut u64,
        ) -> i32;
    }

    const DRIVE_REMOVABLE: u32 = 2;
    const DRIVE_RAMDISK: u32 = 6;

    let mut result = existing.to_vec();
    let mask = unsafe { GetLogicalDrives() };

    for i in 0..26u8 {
        if (mask & (1 << i)) == 0 {
            continue;
        }
        let letter = (b'A' + i) as char;
        let mount_slash = format!("{}:/", letter);

        // 若 sysinfo 已經列出該磁碟代號則跳過
        if result
            .iter()
            .any(|v| v.mount_point.eq_ignore_ascii_case(&mount_slash))
        {
            continue;
        }

        let root_win = format!("{}:\\", letter);
        let root_wide: Vec<u16> = OsStr::new(&root_win)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        let drive_type = unsafe { GetDriveTypeW(root_wide.as_ptr()) };
        if drive_type <= 1 {
            continue;
        }

        let mut vol_name_buf = [0u16; 261];
        let mut fs_name_buf = [0u16; 261];
        let vol_ok = unsafe {
            GetVolumeInformationW(
                root_wide.as_ptr(),
                vol_name_buf.as_mut_ptr(),
                vol_name_buf.len() as u32,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                fs_name_buf.as_mut_ptr(),
                fs_name_buf.len() as u32,
            )
        };

        // 若磁碟未就緒 (例如空光碟機或未掛載插槽) 則略過
        if vol_ok == 0 {
            continue;
        }

        let vol_label = String::from_utf16_lossy(
            &vol_name_buf[..vol_name_buf
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(0)],
        );
        let fs_name = String::from_utf16_lossy(
            &fs_name_buf[..fs_name_buf
                .iter()
                .position(|&c| c == 0)
                .unwrap_or(0)],
        );

        let mut free_avail = 0u64;
        let mut total_bytes = 0u64;
        let mut total_free = 0u64;
        unsafe {
            GetDiskFreeSpaceExW(
                root_wide.as_ptr(),
                &mut free_avail,
                &mut total_bytes,
                &mut total_free,
            );
        }

        let display_name = if vol_label.trim().is_empty() {
            format!("本機磁碟 ({}:)", letter)
        } else {
            format!("{} ({}:)", vol_label.trim(), letter)
        };

        result.push(VolumeInfo {
            name: display_name,
            mount_point: mount_slash,
            file_system: fs_name,
            total_space: total_bytes,
            available_space: free_avail,
            is_removable: drive_type == DRIVE_REMOVABLE || drive_type == DRIVE_RAMDISK,
        });
    }

    result.sort_by(|a, b| a.mount_point.cmp(&b.mount_point));
    result
}

/// 取得跨平台磁碟區與使用者常用目錄
pub fn get_system_locations() -> SystemLocations {
    let disks = Disks::new_with_refreshed_list();
    let mut volumes = Vec::new();

    for disk in disks.list() {
        let mount = normalize_path_str(disk.mount_point());
        let name = disk.name().to_string_lossy().to_string();
        let display_name = if name.trim().is_empty() {
            mount.clone()
        } else {
            format!("{} ({})", name, mount.trim_end_matches('/'))
        };

        volumes.push(VolumeInfo {
            name: display_name,
            mount_point: mount,
            file_system: disk.file_system().to_string_lossy().to_string(),
            total_space: disk.total_space(),
            available_space: disk.available_space(),
            is_removable: disk.is_removable(),
        });
    }

    #[cfg(target_os = "windows")]
    {
        volumes = enumerate_windows_logical_volumes(&volumes);
    }

    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("/"));
    let home_str = normalize_path_str(&home);

    let mut special_locations = Vec::new();
    let candidates = [
        ("home", "家目錄 (Home)", Some(home.clone()), "home"),
        ("desktop", "桌面 (Desktop)", dirs::desktop_dir(), "monitor"),
        ("documents", "文件 (Documents)", dirs::document_dir(), "file-text"),
        ("downloads", "下載 (Downloads)", dirs::download_dir(), "download"),
        ("pictures", "圖片 (Pictures)", dirs::picture_dir(), "image"),
        ("music", "音樂 (Music)", dirs::audio_dir(), "music"),
        ("videos", "影片 (Videos)", dirs::video_dir(), "film"),
    ];

    for (id, label, dir_opt, icon) in candidates {
        if let Some(p) = dir_opt {
            if p.exists() {
                special_locations.push(SpecialLocation {
                    id: id.to_string(),
                    label: label.to_string(),
                    path: normalize_path_str(&p),
                    icon: icon.to_string(),
                });
            }
        }
    }

    // 額外加入目前工作區捷徑（若存在）
    if let Ok(cwd) = std::env::current_dir() {
        special_locations.push(SpecialLocation {
            id: "workspace".to_string(),
            label: "工作區 (Workspace)".to_string(),
            path: normalize_path_str(&cwd),
            icon: "folder-git".to_string(),
        });
    }

    SystemLocations {
        os_platform: std::env::consts::OS.to_string(),
        home_dir: home_str,
        volumes,
        special_locations,
    }
}

/// 讀取檔案安全預覽（文字前 64KB 或目錄統計）
pub fn read_file_preview(raw_path: &str) -> Result<FilePreviewData, String> {
    let path = PathBuf::from(raw_path);
    if !path.exists() {
        return Err("檔案或目錄不存在".to_string());
    }

    let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| raw_path.to_string());
    let is_dir = meta.is_dir();
    let is_symlink = fs::symlink_metadata(&path)
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false);
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();
    let kind = EntryKind::from_extension(&ext, is_dir, is_symlink);
    let modified_ms = system_time_to_ms(meta.modified());

    if is_dir {
        let count = fs::read_dir(&path)
            .map(|rd| rd.filter_map(|e| e.ok()).count())
            .ok();
        return Ok(FilePreviewData {
            path: normalize_path_str(&path),
            name,
            kind,
            size: 0,
            modified_ms,
            is_binary: false,
            text_preview: None,
            total_lines: None,
            dir_item_count: count,
        });
    }

    let size = meta.len();
    // 讀取最多 32 KB 預覽
    let max_bytes = 32 * 1024;
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut buffer = vec![0u8; (size as usize).min(max_bytes)];
    let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
    buffer.truncate(n);

    // 檢查前 1024 bytes 是否包含 Null byte 判定是否為二進位檔
    let sample_len = buffer.len().min(1024);
    let is_binary = buffer[..sample_len].contains(&0);

    let (text_preview, total_lines) = if !is_binary {
        let text = String::from_utf8_lossy(&buffer).to_string();
        let lines = text.lines().count();
        (Some(text), Some(lines))
    } else {
        (None, None)
    };

    Ok(FilePreviewData {
        path: normalize_path_str(&path),
        name,
        kind,
        size,
        modified_ms,
        is_binary,
        text_preview,
        total_lines,
        dir_item_count: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_system_locations_includes_logical_drives() {
        let locs = get_system_locations();
        assert!(!locs.volumes.is_empty());
        for v in &locs.volumes {
            println!("Detected Volume: {} -> {} ({}) total={} free={}", v.name, v.mount_point, v.file_system, v.total_space, v.available_space);
        }
        #[cfg(target_os = "windows")]
        {
            if Path::new("R:/").exists() {
                assert!(
                    locs.volumes.iter().any(|v| v.mount_point.eq_ignore_ascii_case("R:/")),
                    "R:/ RamDisk should be detected in volumes list"
                );
                let cache = FsCacheState::new(16);
                let listing = read_directory_cached(&cache, "R:/", true)
                    .expect("Should be able to read R:/ RamDisk directory");
                println!("R:/ entries count = {}, path = {}", listing.entries.len(), listing.path);
            }
        }
    }
}

