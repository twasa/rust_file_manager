import type { FileEntry } from "../types";

/**
 * 尋找符合打字跳轉 (Type-to-Select) 的檔案索引
 * @param entries 目前顯示的檔案清單 (processedEntries)
 * @param query 使用者連續輸入的字串
 * @param currentIndex 目前選取的檔案索引 (-1 表示無選取)
 * @param isSingleKeyRepeat 是否為連續重複按同一個單一字元 (如連續按 'p')
 */
export function findTypeAheadMatchIndex(
  entries: FileEntry[],
  query: string,
  currentIndex: number,
  isSingleKeyRepeat: boolean
): number {
  if (entries.length === 0 || !query) return -1;
  const lowerQuery = query.toLowerCase();

  // 若為連續按同一個字元（如連續按 'a'、'a'、'a'）
  if (isSingleKeyRepeat) {
    const char = lowerQuery.charAt(0);
    // 找出所有前綴匹配此字元的檔案索引
    const matchingIndices: number[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].name.toLowerCase().startsWith(char)) {
        matchingIndices.push(i);
      }
    }
    if (matchingIndices.length === 0) return -1;

    // 尋找下一個匹配項（循環）
    const foundPos = matchingIndices.indexOf(currentIndex);
    if (foundPos !== -1 && foundPos + 1 < matchingIndices.length) {
      return matchingIndices[foundPos + 1];
    }
    return matchingIndices[0];
  }

  // 多字元前綴匹配（如 "doc", "proj"）
  // 優先從當前選取項開始往下搜尋
  const startIdx = currentIndex >= 0 ? currentIndex : 0;
  for (let i = 0; i < entries.length; i++) {
    const idx = (startIdx + i) % entries.length;
    if (entries[idx].name.toLowerCase().startsWith(lowerQuery)) {
      return idx;
    }
  }

  return -1;
}

/**
 * 判斷按鍵事件是否應被當作打字跳轉字元
 */
export function isTypeAheadKey(e: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
}): boolean {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  // 僅接受長度為 1 的可列印字元（排除 Enter, Tab, Arrow 等）
  return e.key.length === 1 && e.key !== " ";
}
