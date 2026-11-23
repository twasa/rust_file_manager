import { describe, it, expect } from "vitest";
import {
  isKeyboardNavigationKey,
  computeKeyboardNavigation,
} from "./keyboardNavigation";
import type { FileEntry } from "../types";

const mockEntries: FileEntry[] = [
  {
    name: "alpha.txt",
    path: "/home/user/alpha.txt",
    isDir: false,
    isSymlink: false,
    size: 1024,
    modifiedMs: 1700000000000,
    createdMs: 1700000000000,
    extension: "txt",
    kind: "document",
    isHidden: false,
    isReadonly: false,
  },
  {
    name: "beta.md",
    path: "/home/user/beta.md",
    isDir: false,
    isSymlink: false,
    size: 2048,
    modifiedMs: 1700000001000,
    createdMs: 1700000001000,
    extension: "md",
    kind: "document",
    isHidden: false,
    isReadonly: false,
  },
  {
    name: "gamma.png",
    path: "/home/user/gamma.png",
    isDir: false,
    isSymlink: false,
    size: 4096,
    modifiedMs: 1700000002000,
    createdMs: 1700000002000,
    extension: "png",
    kind: "image",
    isHidden: false,
    isReadonly: false,
  },
  {
    name: "delta.zip",
    path: "/home/user/delta.zip",
    isDir: false,
    isSymlink: false,
    size: 8192,
    modifiedMs: 1700000003000,
    createdMs: 1700000003000,
    extension: "zip",
    kind: "archive",
    isHidden: false,
    isReadonly: false,
  },
  {
    name: "epsilon.rs",
    path: "/home/user/epsilon.rs",
    isDir: false,
    isSymlink: false,
    size: 16384,
    modifiedMs: 1700000004000,
    createdMs: 1700000004000,
    extension: "rs",
    kind: "code",
    isHidden: false,
    isReadonly: false,
  },
];

describe("keyboardNavigation", () => {
  it("identifies supported navigation keys correctly", () => {
    expect(isKeyboardNavigationKey("ArrowUp")).toBe(true);
    expect(isKeyboardNavigationKey("ArrowDown")).toBe(true);
    expect(isKeyboardNavigationKey("ArrowLeft")).toBe(true);
    expect(isKeyboardNavigationKey("ArrowRight")).toBe(true);
    expect(isKeyboardNavigationKey("Home")).toBe(true);
    expect(isKeyboardNavigationKey("End")).toBe(true);
    expect(isKeyboardNavigationKey("PageUp")).toBe(true);
    expect(isKeyboardNavigationKey("PageDown")).toBe(true);

    expect(isKeyboardNavigationKey("Enter")).toBe(false);
    expect(isKeyboardNavigationKey("Escape")).toBe(false);
    expect(isKeyboardNavigationKey("a")).toBe(false);
    expect(isKeyboardNavigationKey("Tab")).toBe(false);
  });

  it("returns null for empty entries list", () => {
    const res = computeKeyboardNavigation({
      key: "ArrowDown",
      isShift: false,
      entries: [],
      currentSelectedPath: null,
    });
    expect(res).toBeNull();
  });

  it("selects first item on ArrowDown when nothing is selected", () => {
    const res = computeKeyboardNavigation({
      key: "ArrowDown",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: null,
    });
    expect(res).not.toBeNull();
    expect(res?.nextIndex).toBe(0);
    expect(res?.nextPath).toBe(mockEntries[0].path);
    expect(res?.selectedPaths).toEqual([mockEntries[0].path]);
    expect(res?.anchorPath).toBe(mockEntries[0].path);
  });

  it("selects last item on End when nothing is selected", () => {
    const res = computeKeyboardNavigation({
      key: "End",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: null,
    });
    expect(res).not.toBeNull();
    expect(res?.nextIndex).toBe(4);
    expect(res?.nextPath).toBe(mockEntries[4].path);
    expect(res?.selectedPaths).toEqual([mockEntries[4].path]);
  });

  it("moves cursor down by 1 in details list mode", () => {
    const res = computeKeyboardNavigation({
      key: "ArrowDown",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[1].path,
      viewMode: "details",
    });
    expect(res?.nextIndex).toBe(2);
    expect(res?.nextPath).toBe(mockEntries[2].path);
    expect(res?.selectedPaths).toEqual([mockEntries[2].path]);
  });

  it("moves cursor up by 1 in details list mode", () => {
    const res = computeKeyboardNavigation({
      key: "ArrowUp",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[2].path,
      viewMode: "details",
    });
    expect(res?.nextIndex).toBe(1);
    expect(res?.nextPath).toBe(mockEntries[1].path);
    expect(res?.selectedPaths).toEqual([mockEntries[1].path]);
  });

  it("clamps at boundaries and prevents out of bounds", () => {
    // Clamps at 0 when moving up from index 0
    const topRes = computeKeyboardNavigation({
      key: "ArrowUp",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[0].path,
      viewMode: "details",
    });
    expect(topRes?.nextIndex).toBe(0);
    expect(topRes?.nextPath).toBe(mockEntries[0].path);

    // Clamps at last index when moving down from last item
    const bottomRes = computeKeyboardNavigation({
      key: "ArrowDown",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[4].path,
      viewMode: "details",
    });
    expect(bottomRes?.nextIndex).toBe(4);
    expect(bottomRes?.nextPath).toBe(mockEntries[4].path);
  });

  it("expands and shrinks selection range with Shift key", () => {
    // Start at index 1 and press Shift + ArrowDown
    const step1 = computeKeyboardNavigation({
      key: "ArrowDown",
      isShift: true,
      entries: mockEntries,
      currentSelectedPath: mockEntries[1].path,
      anchorPath: mockEntries[1].path,
      viewMode: "details",
    });
    expect(step1?.nextIndex).toBe(2);
    expect(step1?.anchorPath).toBe(mockEntries[1].path);
    expect(step1?.selectedPaths).toEqual([
      mockEntries[1].path,
      mockEntries[2].path,
    ]);

    // Press Shift + ArrowDown again from index 2 with anchor remaining at index 1
    const step2 = computeKeyboardNavigation({
      key: "ArrowDown",
      isShift: true,
      entries: mockEntries,
      currentSelectedPath: mockEntries[2].path,
      anchorPath: step1?.anchorPath,
      viewMode: "details",
    });
    expect(step2?.nextIndex).toBe(3);
    expect(step2?.anchorPath).toBe(mockEntries[1].path);
    expect(step2?.selectedPaths).toEqual([
      mockEntries[1].path,
      mockEntries[2].path,
      mockEntries[3].path,
    ]);

    // Press Shift + ArrowUp to shrink selection back towards anchor
    const step3 = computeKeyboardNavigation({
      key: "ArrowUp",
      isShift: true,
      entries: mockEntries,
      currentSelectedPath: mockEntries[3].path,
      anchorPath: step2?.anchorPath,
      viewMode: "details",
    });
    expect(step3?.nextIndex).toBe(2);
    expect(step3?.anchorPath).toBe(mockEntries[1].path);
    expect(step3?.selectedPaths).toEqual([
      mockEntries[1].path,
      mockEntries[2].path,
    ]);

    // Press Shift + ArrowUp past anchor to index 0
    const step4 = computeKeyboardNavigation({
      key: "ArrowUp",
      isShift: true,
      entries: mockEntries,
      currentSelectedPath: mockEntries[1].path,
      anchorPath: mockEntries[1].path,
      viewMode: "details",
    });
    expect(step4?.nextIndex).toBe(0);
    expect(step4?.anchorPath).toBe(mockEntries[1].path);
    expect(step4?.selectedPaths).toEqual([
      mockEntries[0].path,
      mockEntries[1].path,
    ]);
  });

  it("handles Home and End correctly", () => {
    const homeRes = computeKeyboardNavigation({
      key: "Home",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[3].path,
    });
    expect(homeRes?.nextIndex).toBe(0);
    expect(homeRes?.nextPath).toBe(mockEntries[0].path);

    const endRes = computeKeyboardNavigation({
      key: "End",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[1].path,
    });
    expect(endRes?.nextIndex).toBe(4);
    expect(endRes?.nextPath).toBe(mockEntries[4].path);
  });

  it("handles PageUp and PageDown with given pageSize", () => {
    const downRes = computeKeyboardNavigation({
      key: "PageDown",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[0].path,
      pageSize: 3,
    });
    expect(downRes?.nextIndex).toBe(3);

    const upRes = computeKeyboardNavigation({
      key: "PageUp",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[4].path,
      pageSize: 2,
    });
    expect(upRes?.nextIndex).toBe(2);
  });

  it("ignores horizontal arrows in details view mode", () => {
    const leftRes = computeKeyboardNavigation({
      key: "ArrowLeft",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[2].path,
      viewMode: "details",
    });
    expect(leftRes).toBeNull();

    const rightRes = computeKeyboardNavigation({
      key: "ArrowRight",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[2].path,
      viewMode: "details",
    });
    expect(rightRes).toBeNull();
  });

  it("supports grid view multi-column navigation", () => {
    // 3 columns:
    // 0: alpha, 1: beta,  2: gamma
    // 3: delta, 4: epsilon
    const downRes = computeKeyboardNavigation({
      key: "ArrowDown",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[1].path,
      viewMode: "grid",
      gridColumns: 3,
    });
    expect(downRes?.nextIndex).toBe(4); // 1 + 3 = 4

    const upRes = computeKeyboardNavigation({
      key: "ArrowUp",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[4].path,
      viewMode: "grid",
      gridColumns: 3,
    });
    expect(upRes?.nextIndex).toBe(1); // 4 - 3 = 1

    const rightRes = computeKeyboardNavigation({
      key: "ArrowRight",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[1].path,
      viewMode: "grid",
      gridColumns: 3,
    });
    expect(rightRes?.nextIndex).toBe(2); // 1 + 1 = 2

    const leftRes = computeKeyboardNavigation({
      key: "ArrowLeft",
      isShift: false,
      entries: mockEntries,
      currentSelectedPath: mockEntries[2].path,
      viewMode: "grid",
      gridColumns: 3,
    });
    expect(leftRes?.nextIndex).toBe(1); // 2 - 1 = 1
  });
});
