export interface MarqueeBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * 計算拖曳框選的矩形座標與尺寸（相對於捲動容器內容頂部與左側）
 */
export function calculateMarqueeBox(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number
): MarqueeBox {
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  return { left, top, width, height };
}

/**
 * 在虛擬滾動詳細列表模式下，以 O(1) 高效幾何演算法計算框選相交的檔案索引區間
 * @param marqueeBox 框選矩形
 * @param rowHeight 每列列高 (px)
 * @param totalCount 檔案清單總筆數
 */
export function getDetailsIntersectedIndices(
  marqueeBox: MarqueeBox,
  rowHeight: number,
  totalCount: number
): number[] {
  if (totalCount === 0 || rowHeight <= 0) return [];
  if (marqueeBox.width < 3 && marqueeBox.height < 3) return [];

  const top = marqueeBox.top;
  const bottom = marqueeBox.top + marqueeBox.height;

  const startIdx = Math.max(0, Math.floor(top / rowHeight));
  const endIdx = Math.min(totalCount - 1, Math.floor(bottom / rowHeight));

  if (startIdx > endIdx) return [];

  const indices: number[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    indices.push(i);
  }
  return indices;
}

export type MarqueeModifierMode = "replace" | "toggle" | "union";

/**
 * 依據輔助鍵 (Ctrl / Shift) 計算框選後的最終選取路徑清單
 * @param initialSelectedPaths 框選開始前的選取路徑
 * @param intersectedPaths 本次框選碰觸到的路徑
 * @param mode 模式：replace (無鍵), toggle (Ctrl), union (Shift)
 */
export function computeMarqueeSelection(
  initialSelectedPaths: string[],
  intersectedPaths: string[],
  mode: MarqueeModifierMode
): string[] {
  const intersectedSet = new Set(intersectedPaths);

  if (mode === "replace") {
    return intersectedPaths;
  }

  if (mode === "union") {
    const combined = new Set([...initialSelectedPaths, ...intersectedPaths]);
    return Array.from(combined);
  }

  // mode === "toggle" (Ctrl/Cmd)
  const result: string[] = [];
  const initialSet = new Set(initialSelectedPaths);

  // 原有項目中，如果沒被框選到則保留；若被框選到則反轉 (剔除)
  for (const path of initialSelectedPaths) {
    if (!intersectedSet.has(path)) {
      result.push(path);
    }
  }

  // 被框選到的項目中，如果原本沒有則加入
  for (const path of intersectedPaths) {
    if (!initialSet.has(path)) {
      result.push(path);
    }
  }

  return result;
}
