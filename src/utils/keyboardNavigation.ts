import type { FileEntry } from "../types";

export type NavigationKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "Home"
  | "End"
  | "PageUp"
  | "PageDown";

export interface KeyboardNavigationOptions {
  key: string;
  isShift: boolean;
  entries: FileEntry[];
  currentSelectedPath?: string | null;
  anchorPath?: string | null;
  viewMode?: "details" | "grid";
  gridColumns?: number;
  pageSize?: number;
}

export interface KeyboardNavigationResult {
  nextIndex: number;
  nextPath: string;
  selectedPaths: string[];
  anchorPath: string;
}

/**
 * 判斷是否為支援的鍵盤導覽按鍵 (上下左右方向鍵、Home、End、PageUp、PageDown)
 */
export function isKeyboardNavigationKey(key: string): boolean {
  return (
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "Home" ||
    key === "End" ||
    key === "PageUp" ||
    key === "PageDown"
  );
}

/**
 * 計算鍵盤方向鍵/導航鍵對檔案選取與焦點游標的移動結果
 */
export function computeKeyboardNavigation({
  key,
  isShift,
  entries,
  currentSelectedPath,
  anchorPath,
  viewMode = "details",
  gridColumns = 1,
  pageSize = 10,
}: KeyboardNavigationOptions): KeyboardNavigationResult | null {
  if (!entries || entries.length === 0) return null;
  if (!isKeyboardNavigationKey(key)) return null;

  // 清單模式下左右鍵不進行項目移動，交由系統或維持預設
  if (viewMode !== "grid" && (key === "ArrowLeft" || key === "ArrowRight")) {
    return null;
  }

  const total = entries.length;

  // 尋找當前游標焦點索引
  let currentIdx = -1;
  if (currentSelectedPath) {
    currentIdx = entries.findIndex((e) => e.path === currentSelectedPath);
  }

  // 尋找當前錨點索引 (用於 Shift 範圍多選)
  let anchorIdx = -1;
  if (anchorPath) {
    anchorIdx = entries.findIndex((e) => e.path === anchorPath);
  }

  // 若當前尚未選取任何項目 (currentIdx === -1)
  if (currentIdx === -1) {
    let targetIdx = 0;
    if (key === "End") {
      targetIdx = total - 1;
    } else {
      targetIdx = 0;
    }

    const targetEntry = entries[targetIdx];
    return {
      nextIndex: targetIdx,
      nextPath: targetEntry.path,
      selectedPaths: [targetEntry.path],
      anchorPath: targetEntry.path,
    };
  }

  // 計算步進量 (在網格檢視下上下鍵以每欄數量為步進單位)
  const step = viewMode === "grid" ? Math.max(1, gridColumns) : 1;
  const pageStep = Math.max(1, pageSize);

  let nextIdx = currentIdx;

  switch (key) {
    case "ArrowUp":
      nextIdx = Math.max(0, currentIdx - step);
      break;
    case "ArrowDown":
      nextIdx = Math.min(total - 1, currentIdx + step);
      break;
    case "ArrowLeft":
      if (viewMode === "grid") {
        nextIdx = Math.max(0, currentIdx - 1);
      }
      break;
    case "ArrowRight":
      if (viewMode === "grid") {
        nextIdx = Math.min(total - 1, currentIdx + 1);
      }
      break;
    case "Home":
      nextIdx = 0;
      break;
    case "End":
      nextIdx = total - 1;
      break;
    case "PageUp":
      nextIdx = Math.max(0, currentIdx - pageStep);
      break;
    case "PageDown":
      nextIdx = Math.min(total - 1, currentIdx + pageStep);
      break;
    default:
      return null;
  }

  const nextEntry = entries[nextIdx];

  // Shift 連續選取範圍擴展/縮減
  if (isShift) {
    const effectiveAnchorIdx =
      anchorIdx >= 0 && anchorIdx < total ? anchorIdx : currentIdx;
    const start = Math.min(effectiveAnchorIdx, nextIdx);
    const end = Math.max(effectiveAnchorIdx, nextIdx);
    const selectedPaths = entries.slice(start, end + 1).map((e) => e.path);

    return {
      nextIndex: nextIdx,
      nextPath: nextEntry.path,
      selectedPaths,
      anchorPath: entries[effectiveAnchorIdx].path,
    };
  }

  // 單一游標移動
  return {
    nextIndex: nextIdx,
    nextPath: nextEntry.path,
    selectedPaths: [nextEntry.path],
    anchorPath: nextEntry.path,
  };
}
