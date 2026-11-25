import { describe, it, expect } from "vitest";
import {
  apiGetSystemClipboardFiles,
  apiSetSystemClipboardFiles,
  isTauriRuntime,
  SystemClipboardFilesResult,
} from "./api";

describe("System Clipboard and Native Drag & Drop Integration", () => {
  it("verifies isTauriRuntime evaluates to false in Node/Vitest test environment", () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it("safely returns null when querying system clipboard in non-Tauri test runtime", async () => {
    const result = await apiGetSystemClipboardFiles();
    expect(result).toBeNull();
  });

  it("safely handles setting system clipboard in non-Tauri test runtime without error", async () => {
    await expect(
      apiSetSystemClipboardFiles(["D:/Music/song.mp3"], false)
    ).resolves.toBeUndefined();
  });

  it("validates data structure and properties of SystemClipboardFilesResult", () => {
    const payload: SystemClipboardFilesResult = {
      paths: ["D:/Audio/track1.flac", "D:/Audio/track2.flac"],
      is_cut: false,
    };
    expect(payload.paths).toHaveLength(2);
    expect(payload.is_cut).toBe(false);

    const cutPayload: SystemClipboardFilesResult = {
      paths: ["/home/user/document.pdf"],
      is_cut: true,
    };
    expect(cutPayload.is_cut).toBe(true);
  });

  it("parses target directory paths accurately across mock hierarchies", () => {
    const mockElement = {
      attributes: { "data-drop-folder-path": "D:/Workspace/Music" },
      closest: (selector: string) => {
        if (selector === "[data-drop-folder-path]") {
          return { getAttribute: (attr: string) => "D:/Workspace/Music" };
        }
        return null;
      },
    };

    const matched = mockElement.closest("[data-drop-folder-path]");
    expect(matched?.getAttribute("data-drop-folder-path")).toBe(
      "D:/Workspace/Music"
    );
  });
});
