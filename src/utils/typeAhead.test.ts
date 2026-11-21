import { describe, it, expect } from "vitest";
import { findTypeAheadMatchIndex, isTypeAheadKey } from "./typeAhead";
import type { FileEntry } from "../types";

const createMockEntry = (name: string, isDir = false): FileEntry => ({
  name,
  path: `/root/${name}`,
  isDir,
  isSymlink: false,
  isHidden: false,
  isReadonly: false,
  size: 1024,
  modifiedMs: Date.now(),
  createdMs: Date.now(),
  extension: name.split(".").pop() || "",
  kind: isDir ? "directory" : "file",
});

describe("typeAhead utility", () => {
  const entries: FileEntry[] = [
    createMockEntry("apple.txt"),
    createMockEntry("archive.zip"),
    createMockEntry("banana.png"),
    createMockEntry("document.pdf"),
    createMockEntry("downloads", true),
    createMockEntry("package.json"),
    createMockEntry("photo.jpg"),
    createMockEntry("project", true),
  ];

  it("finds prefix match accurately", () => {
    // "doc" should match document.pdf (index 3)
    expect(findTypeAheadMatchIndex(entries, "doc", -1, false)).toBe(3);

    // "pro" should match project (index 7)
    expect(findTypeAheadMatchIndex(entries, "pro", -1, false)).toBe(7);

    // case-insensitive match: "APP" -> apple.txt (index 0)
    expect(findTypeAheadMatchIndex(entries, "APP", -1, false)).toBe(0);

    // non-existent prefix returns -1
    expect(findTypeAheadMatchIndex(entries, "xyz", -1, false)).toBe(-1);
  });

  it("cycles through matches when single character is repeated", () => {
    // all 'a' matches are: apple.txt (0), archive.zip (1)
    // starting with nothing selected (-1), first match is 0
    const first = findTypeAheadMatchIndex(entries, "a", -1, true);
    expect(first).toBe(0);

    // pressing 'a' again when 0 is selected -> next match 1
    const second = findTypeAheadMatchIndex(entries, "a", 0, true);
    expect(second).toBe(1);

    // pressing 'a' again when 1 is selected -> wraps back to 0
    const third = findTypeAheadMatchIndex(entries, "a", 1, true);
    expect(third).toBe(0);

    // all 'p' matches are: package.json (5), photo.jpg (6), project (7)
    expect(findTypeAheadMatchIndex(entries, "p", 5, true)).toBe(6);
    expect(findTypeAheadMatchIndex(entries, "p", 6, true)).toBe(7);
    expect(findTypeAheadMatchIndex(entries, "p", 7, true)).toBe(5);
  });

  it("filters keys using isTypeAheadKey", () => {
    expect(isTypeAheadKey({ key: "a" })).toBe(true);
    expect(isTypeAheadKey({ key: "1" })).toBe(true);
    expect(isTypeAheadKey({ key: "中" })).toBe(true);

    // control keys
    expect(isTypeAheadKey({ key: "Enter" })).toBe(false);
    expect(isTypeAheadKey({ key: "Escape" })).toBe(false);
    expect(isTypeAheadKey({ key: " " })).toBe(false);

    // combinations
    expect(isTypeAheadKey({ key: "c", ctrlKey: true })).toBe(false);
    expect(isTypeAheadKey({ key: "v", metaKey: true })).toBe(false);
    expect(isTypeAheadKey({ key: "a", altKey: true })).toBe(false);
  });
});
