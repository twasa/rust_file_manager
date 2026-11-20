/**
 * 判斷是否為應被攔截的瀏覽器原生熱鍵
 * （如 Ctrl+R / Cmd+R 重新整理網頁、Ctrl+P / Cmd+P 列印、Ctrl+S / Cmd+S 另存網頁）
 * 注意：Ctrl+Shift+R 為應用程式批次重新命名快捷鍵，不應被攔截。
 */
export function isBrowserHotkeySuppressed(e: {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  key: string;
}): boolean {
  const isCtrlOrCmd = Boolean(e.ctrlKey || e.metaKey);
  if (!isCtrlOrCmd || e.altKey) return false;
  const k = e.key.toLowerCase();
  if (k === "p" || k === "s") return true;
  if (k === "r" && !e.shiftKey) return true;
  return false;
}

/**
 * 攔截 WebView 原生右鍵上下文選單，避免網頁原生選單干擾桌面體驗
 */
export function preventDefaultContextMenu(e: { preventDefault: () => void }): void {
  e.preventDefault();
}
