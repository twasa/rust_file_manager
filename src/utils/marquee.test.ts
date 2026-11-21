import { describe, it, expect } from "vitest";
import {
  calculateMarqueeBox,
  getDetailsIntersectedIndices,
  computeMarqueeSelection,
} from "./marquee";

describe("marquee selection utility", () => {
  it("calculates marquee box coordinates correctly in any direction", () => {
    // Drag down-right
    expect(calculateMarqueeBox(10, 20, 100, 150)).toEqual({
      left: 10,
      top: 20,
      width: 90,
      height: 130,
    });

    // Drag up-left
    expect(calculateMarqueeBox(100, 150, 10, 20)).toEqual({
      left: 10,
      top: 20,
      width: 90,
      height: 130,
    });
  });

  it("calculates intersected row indices in Details view with O(1) geometry", () => {
    const rowHeight = 36;
    const totalCount = 10;

    // Small click (width < 3, height < 3) should return empty
    expect(
      getDetailsIntersectedIndices(
        { left: 0, top: 10, width: 2, height: 2 },
        rowHeight,
        totalCount
      )
    ).toEqual([]);

    // Marquee covering top=10 to top+height=80 (rows 0, 1, 2)
    // row 0: 0-36
    // row 1: 36-72
    // row 2: 72-108
    const intersected = getDetailsIntersectedIndices(
      { left: 0, top: 10, width: 200, height: 70 },
      rowHeight,
      totalCount
    );
    expect(intersected).toEqual([0, 1, 2]);

    // Marquee covering rows 3 to 5
    // 3 * 36 = 108, 5 * 36 + 35 = 215
    const intersectedMid = getDetailsIntersectedIndices(
      { left: 0, top: 110, width: 200, height: 90 },
      rowHeight,
      totalCount
    );
    expect(intersectedMid).toEqual([3, 4, 5]);

    // Marquee dragged past total count bounds
    const intersectedPastEnd = getDetailsIntersectedIndices(
      { left: 0, top: 300, width: 200, height: 500 },
      rowHeight,
      totalCount
    );
    expect(intersectedPastEnd).toEqual([8, 9]);
  });

  it("computes selection modifiers properly (replace, union, toggle)", () => {
    const initial = ["/a", "/b"];
    const intersected = ["/b", "/c"];

    // Replace mode (normal drag): only intersected items
    expect(computeMarqueeSelection(initial, intersected, "replace")).toEqual([
      "/b",
      "/c",
    ]);

    // Union mode (Shift drag): preserves initial and adds intersected
    expect(computeMarqueeSelection(initial, intersected, "union")).toEqual([
      "/a",
      "/b",
      "/c",
    ]);

    // Toggle mode (Ctrl/Cmd drag): inverts selection for intersected items
    // /a is not in intersected -> kept
    // /b is in both initial and intersected -> inverted (removed)
    // /c is in intersected but not initial -> inverted (added)
    expect(computeMarqueeSelection(initial, intersected, "toggle")).toEqual([
      "/a",
      "/c",
    ]);
  });
});
