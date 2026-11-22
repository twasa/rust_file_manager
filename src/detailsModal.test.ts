import { describe, it, expect } from "vitest";
import {
  apiGetItemDetailedInfo,
  apiCalculateDirStats,
  apiCalculateMultiItemStats,
} from "./api";
import { DEFAULT_KEYBINDINGS } from "./store/useAppStore";
import { formatBytes, formatDateTime } from "./utils/formatters";

describe("File & Directory Details (Properties) feature tests", () => {
  it("includes open_details shortcut in DEFAULT_KEYBINDINGS with Alt+Enter", () => {
    const detailsBinding = DEFAULT_KEYBINDINGS.find(
      (k) => k.id === "open_details"
    );
    expect(detailsBinding).toBeDefined();
    expect(detailsBinding?.keyCombo).toBe("Alt+Enter");
    expect(detailsBinding?.defaultCombo).toBe("Alt+Enter");
  });

  it("apiGetItemDetailedInfo returns mock object in non-tauri web environment", async () => {
    const info = await apiGetItemDetailedInfo("D:/devops_workspace/sample.txt");
    expect(info.name).toBe("sample.txt");
    expect(info.extension).toBe("txt");
    expect(info.path).toBe("D:/devops_workspace/sample.txt");
    expect(info.isDir).toBe(false);
    expect(info.size).toBe(1024);
  });

  it("apiCalculateDirStats returns zeroed counts in non-tauri web environment", async () => {
    const stats = await apiCalculateDirStats("D:/devops_workspace");
    expect(stats.totalFiles).toBe(0);
    expect(stats.totalDirs).toBe(0);
    expect(stats.totalBytes).toBe(0);
  });

  it("apiCalculateMultiItemStats returns selected count in non-tauri web environment", async () => {
    const stats = await apiCalculateMultiItemStats([
      "D:/file1.txt",
      "D:/file2.png",
      "D:/dir1",
    ]);
    expect(stats.totalFiles).toBe(3);
    expect(stats.totalDirs).toBe(0);
  });

  it("formats file details size and timestamp correctly", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1 MB");

    const sampleMs = 1732300000000;
    const formattedDate = formatDateTime(sampleMs);
    expect(formattedDate.length).toBeGreaterThan(0);
  });
});
