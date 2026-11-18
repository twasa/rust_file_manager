import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "./useAppStore";
import type { FileEntry } from "../types";

describe("useAppStore delete confirmation and settings", () => {
  beforeEach(() => {
    useAppStore.getState().resetAllSettings();
  });

  it("defaults confirmDelete to true and pendingDeletePrompt to null", () => {
    const state = useAppStore.getState();
    expect(state.confirmDelete).toBe(true);
    expect(state.pendingDeletePrompt).toBeNull();
  });

  it("can toggle confirmDelete", () => {
    useAppStore.getState().setConfirmDelete(false);
    expect(useAppStore.getState().confirmDelete).toBe(false);

    useAppStore.getState().setConfirmDelete(true);
    expect(useAppStore.getState().confirmDelete).toBe(true);
  });

  it("can set and clear pendingDeletePrompt", () => {
    const mockFile: FileEntry = {
      name: "test.txt",
      path: "/mock/test.txt",
      isDir: false,
      isSymlink: false,
      isHidden: false,
      isReadonly: false,
      size: 1024,
      modifiedMs: Date.now(),
      createdMs: Date.now(),
      extension: "txt",
      kind: "file",
    };

    useAppStore.getState().setPendingDeletePrompt({
      jobType: "trash",
      items: [mockFile],
    });

    const activePrompt = useAppStore.getState().pendingDeletePrompt;
    expect(activePrompt).not.toBeNull();
    expect(activePrompt?.jobType).toBe("trash");
    expect(activePrompt?.items.length).toBe(1);
    expect(activePrompt?.items[0].name).toBe("test.txt");

    useAppStore.getState().setPendingDeletePrompt(null);
    expect(useAppStore.getState().pendingDeletePrompt).toBeNull();
  });

  it("exports and imports confirmDelete properly in config JSON", () => {
    useAppStore.getState().setConfirmDelete(false);
    const jsonStr = useAppStore.getState().exportConfigJson();
    const parsed = JSON.parse(jsonStr);

    expect(parsed.settings.confirmDelete).toBe(false);

    useAppStore.getState().resetAllSettings();
    expect(useAppStore.getState().confirmDelete).toBe(true);

    useAppStore.getState().importConfigJson(jsonStr);
    expect(useAppStore.getState().confirmDelete).toBe(false);
  });
});
