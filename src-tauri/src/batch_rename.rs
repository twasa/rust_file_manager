use crate::models::{
    normalize_path_str, BatchRenameExecutionResult, BatchRenamePreviewItem, BatchRenameRule,
};
use chrono::Local;
use regex::RegexBuilder;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

fn to_title_case(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut capitalize_next = true;
    for c in s.chars() {
        if c.is_whitespace() || c == '_' || c == '-' || c == '.' {
            result.push(c);
            capitalize_next = true;
        } else if capitalize_next {
            for upper in c.to_uppercase() {
                result.push(upper);
            }
            capitalize_next = false;
        } else {
            for lower in c.to_lowercase() {
                result.push(lower);
            }
        }
    }
    result
}

/// 計算批次重新命名預覽，並偵測名稱衝突或非法字元
pub fn preview_batch_rename(
    paths: &[String],
    rule: &BatchRenameRule,
) -> Result<Vec<BatchRenamePreviewItem>, String> {
    let compiled_regex = if !rule.find_text.is_empty() {
        let pattern = if rule.use_regex {
            rule.find_text.clone()
        } else {
            regex::escape(&rule.find_text)
        };
        Some(
            RegexBuilder::new(&pattern)
                .case_insensitive(!rule.case_sensitive)
                .build()
                .map_err(|e| format!("正規表示式語法錯誤: {}", e))?,
        )
    } else {
        None
    };

    let today_str = Local::now().format("%Y%m%d").to_string();
    let mut items = Vec::with_capacity(paths.len());
    let mut target_paths_seen = HashSet::new();
    let original_paths_set: HashSet<String> = paths
        .iter()
        .map(|p| normalize_path_str(Path::new(p)).to_lowercase())
        .collect();

    for (idx, raw_path) in paths.iter().enumerate() {
        let path = PathBuf::from(raw_path);
        let parent = path
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        let original_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| raw_path.clone());
        let is_dir = path.is_dir();

        let (stem, ext) = if is_dir {
            (original_name.clone(), String::new())
        } else {
            let s = path
                .file_stem()
                .map(|st| st.to_string_lossy().to_string())
                .unwrap_or_else(|| original_name.clone());
            let e = path
                .extension()
                .map(|ex| ex.to_string_lossy().to_string())
                .unwrap_or_default();
            (s, e)
        };

        let mut working_stem = stem.clone();

        // 1. 尋找與取代（支援 $1, $2 擷取群組以及 {date}, {name}, {ext} 變數）
        if let Some(re) = &compiled_regex {
            let expanded_replace = rule
                .replace_text
                .replace("{date}", &today_str)
                .replace("{name}", &stem)
                .replace("{ext}", &ext);
            working_stem = re
                .replace_all(&working_stem, expanded_replace.as_str())
                .to_string();
        }

        // 2. 大小寫轉換
        working_stem = match rule.case_transform.as_str() {
            "lower" => working_stem.to_lowercase(),
            "upper" => working_stem.to_uppercase(),
            "title" => to_title_case(&working_stem),
            _ => working_stem,
        };

        // 3. 前綴與後綴（同樣支援 {date} 變數）
        let prefix = rule.prefix.replace("{date}", &today_str);
        let suffix = rule.suffix.replace("{date}", &today_str);
        working_stem = format!("{}{}{}", prefix, working_stem, suffix);

        // 4. 流水號序列
        if rule.sequence_enabled {
            let step = rule.sequence_step.max(1);
            let num = rule.sequence_start + idx * step;
            let pad = rule.sequence_padding.min(12);
            let formatted_num = format!("{:0width$}", num, width = pad);

            working_stem = match rule.sequence_position.as_str() {
                "prefix" => format!("{}_{}", formatted_num, working_stem),
                "replace_name" => {
                    if prefix.is_empty() && suffix.is_empty() {
                        formatted_num
                    } else {
                        format!("{}{}{}", prefix, formatted_num, suffix)
                    }
                }
                _ => format!("{}_{}", working_stem, formatted_num),
            };
        }

        // 5. 副檔名處理
        let final_ext = if is_dir {
            String::new()
        } else if !rule.extension_override.trim().is_empty() {
            rule.extension_override
                .trim()
                .trim_start_matches('.')
                .to_string()
        } else {
            ext
        };

        let new_name = if final_ext.is_empty() {
            working_stem
        } else {
            format!("{}.{}", working_stem, final_ext)
        };

        let new_path_buf = parent.join(&new_name);
        let new_path_str = normalize_path_str(&new_path_buf);
        let orig_path_str = normalize_path_str(&path);
        let changed = new_name != original_name;

        // 檢查名稱合法性與衝突
        let mut error = None;
        let mut has_conflict = false;

        if new_name.trim().is_empty() {
            error = Some("新檔名不可為空".to_string());
            has_conflict = true;
        } else if new_name.contains('/') || new_name.contains('\\') || new_name.contains(':') {
            error = Some("檔名包含非法路徑字元".to_string());
            has_conflict = true;
        } else {
            let key_lower = new_path_str.to_lowercase();
            if !target_paths_seen.insert(key_lower.clone()) {
                error = Some("批次清單中出現重複的目標檔名".to_string());
                has_conflict = true;
            } else if changed
                && new_path_buf.exists()
                && !original_paths_set.contains(&key_lower)
            {
                error = Some("磁碟上已存在同名檔案".to_string());
                has_conflict = true;
            }
        }

        items.push(BatchRenamePreviewItem {
            original_path: orig_path_str,
            original_name,
            new_name,
            new_path: new_path_str,
            changed,
            has_conflict,
            error,
        });
    }

    Ok(items)
}

/// 兩階段安全批次重新命名（先更名為唯一暫存名稱，再更名為目標名稱，避免連號互撞並支援完整復原）
pub fn execute_batch_rename(
    paths: &[String],
    rule: &BatchRenameRule,
) -> Result<BatchRenameExecutionResult, String> {
    let previews = preview_batch_rename(paths, rule)?;

    for item in &previews {
        if item.has_conflict {
            return Err(format!(
                "取消執行：檔案「{}」->「{}」發生衝突 ({})",
                item.original_name,
                item.new_name,
                item.error.clone().unwrap_or_default()
            ));
        }
    }

    let mut stage1_done: Vec<(PathBuf, PathBuf, PathBuf)> = Vec::new(); // (orig, temp, final)
    let mut skipped_count = 0usize;
    let mut errors = Vec::new();

    // 第一階段：更名為暫存檔名
    for item in &previews {
        if !item.changed {
            skipped_count += 1;
            continue;
        }
        let orig_pb = PathBuf::from(&item.original_path);
        let final_pb = PathBuf::from(&item.new_path);
        let parent = orig_pb
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        let temp_pb = parent.join(format!(".rfm_tmp_{}", Uuid::new_v4()));

        match fs::rename(&orig_pb, &temp_pb) {
            Ok(()) => stage1_done.push((orig_pb, temp_pb, final_pb)),
            Err(e) => {
                errors.push(format!("無法重新命名 {}: {}", item.original_name, e));
                // 發生錯誤時將第一階段已變更的檔案還原
                for (o, t, _) in stage1_done.iter().rev() {
                    let _ = fs::rename(t, o);
                }
                return Ok(BatchRenameExecutionResult {
                    success_count: 0,
                    skipped_count,
                    errors,
                    undo_pairs: Vec::new(),
                });
            }
        }
    }

    // 第二階段：從暫存檔名更名為最終目標檔名
    let mut success_count = 0usize;
    let mut undo_pairs = Vec::new();

    for (orig_pb, temp_pb, final_pb) in &stage1_done {
        match fs::rename(temp_pb, final_pb) {
            Ok(()) => {
                success_count += 1;
                undo_pairs.push((
                    normalize_path_str(final_pb),
                    normalize_path_str(orig_pb),
                ));
            }
            Err(e) => {
                errors.push(format!("第二階段重新命名失敗 ({}): {}", final_pb.display(), e));
                let _ = fs::rename(temp_pb, orig_pb);
            }
        }
    }

    Ok(BatchRenameExecutionResult {
        success_count,
        skipped_count,
        errors,
        undo_pairs,
    })
}

/// 復原上一次批次重新命名
pub fn undo_batch_rename(undo_pairs: &[(String, String)]) -> Result<usize, String> {
    let mut stage1 = Vec::new();
    for (current_path, old_path) in undo_pairs {
        let cur = PathBuf::from(current_path);
        let old = PathBuf::from(old_path);
        if !cur.exists() {
            continue;
        }
        let parent = cur
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| PathBuf::from("."));
        let temp = parent.join(format!(".rfm_undo_{}", Uuid::new_v4()));
        fs::rename(&cur, &temp).map_err(|e| format!("復原第一階段失敗: {}", e))?;
        stage1.push((temp, old));
    }

    let mut restored = 0usize;
    for (temp, old) in stage1 {
        fs::rename(&temp, &old).map_err(|e| format!("復原第二階段失敗: {}", e))?;
        restored += 1;
    }
    Ok(restored)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_batch_rename_preview_and_execute_two_phase() {
        let temp_root = env::temp_dir().join(format!("rfm_test_{}", Uuid::new_v4()));
        fs::create_dir_all(&temp_root).unwrap();

        let f1 = temp_root.join("photo_a.jpg");
        let f2 = temp_root.join("photo_b.jpg");
        fs::write(&f1, b"img1").unwrap();
        fs::write(&f2, b"img2").unwrap();

        let paths = vec![
            normalize_path_str(&f1),
            normalize_path_str(&f2),
        ];

        let rule = BatchRenameRule {
            find_text: "photo_".to_string(),
            replace_text: "trip_".to_string(),
            use_regex: false,
            case_sensitive: false,
            prefix: "2026_".to_string(),
            suffix: "".to_string(),
            case_transform: "upper".to_string(),
            sequence_enabled: true,
            sequence_start: 1,
            sequence_step: 1,
            sequence_padding: 3,
            sequence_position: "suffix".to_string(),
            extension_override: "png".to_string(),
        };

        let preview = preview_batch_rename(&paths, &rule).unwrap();
        assert_eq!(preview.len(), 2);
        assert_eq!(preview[0].new_name, "2026_TRIP_A_001.png");
        assert_eq!(preview[1].new_name, "2026_TRIP_B_002.png");
        assert!(!preview[0].has_conflict);

        let exec_res = execute_batch_rename(&paths, &rule).unwrap();
        assert_eq!(exec_res.success_count, 2);
        assert!(temp_root.join("2026_TRIP_A_001.png").exists());
        assert!(temp_root.join("2026_TRIP_B_002.png").exists());

        // 測試 Undo 復原
        let restored = undo_batch_rename(&exec_res.undo_pairs).unwrap();
        assert_eq!(restored, 2);
        assert!(f1.exists());
        assert!(f2.exists());

        let _ = fs::remove_dir_all(&temp_root);
    }
}
