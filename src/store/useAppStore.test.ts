import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useAppStore,
  enableConfigAutoSave,
  disableConfigAutoSave,
  isConfigAutoSaveEnabled,
  saveSettingsToFile,
  flushAutoSave,
} from "./useAppStore";
import type { FileEntry } from "../types";

describe("useAppStore delete confirmation and settings", () => {
  beforeEach(() => {
    disableConfigAutoSave();
    useAppStore.getState().resetAllSettings();
  });

  afterEach(() => {
    disableConfigAutoSave();
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

  it("can explicitly save settings to file and return target path", async () => {
    useAppStore.getState().setConflictStrategy("overwrite");
    const path = await saveSettingsToFile("custom/settings.json");
    expect(path).toBe("custom/settings.json");
  });

  it("enables and disables config auto-save state", () => {
    expect(isConfigAutoSaveEnabled()).toBe(false);
    enableConfigAutoSave();
    expect(isConfigAutoSaveEnabled()).toBe(true);
    disableConfigAutoSave();
    expect(isConfigAutoSaveEnabled()).toBe(false);
  });

  it("triggers auto-save debounce and flush when settings change", async () => {
    enableConfigAutoSave();

    // 修改字型設定
    useAppStore.getState().updateFontSettings({ uiFontSizePx: 18 });
    const saved = await flushAutoSave();
    expect(saved).toBeDefined();

    const json = useAppStore.getState().exportConfigJson();
    const parsed = JSON.parse(json);
    expect(parsed.settings.fontSettings.uiFontSizePx).toBe(18);
  });

  it("manages preview panel width and plugins config properly", () => {
    const store = useAppStore.getState();
    expect(store.previewPanelWidth).toBe(360);

    // 測試寬度夾緊 (260 ~ 800)
    store.setPreviewPanelWidth(200);
    expect(useAppStore.getState().previewPanelWidth).toBe(260);

    store.setPreviewPanelWidth(900);
    expect(useAppStore.getState().previewPanelWidth).toBe(800);

    store.setPreviewPanelWidth(450);
    expect(useAppStore.getState().previewPanelWidth).toBe(450);

    // 測試插件開關與匯出/匯入
    store.setPluginEnabled("builtin.image", false);
    expect(useAppStore.getState().pluginsConfig["builtin.image"]).toBe(false);

    const exported = useAppStore.getState().exportConfigJson();
    const parsed = JSON.parse(exported);
    expect(parsed.settings.previewPanelWidth).toBe(450);
    expect(parsed.settings.pluginsConfig["builtin.image"]).toBe(false);

    // 測試預設 5MB 預覽大小上限與修改
    expect(store.maxPreviewSizeBytes).toBe(5 * 1024 * 1024);
    store.setMaxPreviewSizeBytes(10 * 1024 * 1024);
    expect(useAppStore.getState().maxPreviewSizeBytes).toBe(10 * 1024 * 1024);

    // 匯入新設定
    useAppStore.getState().importConfigJson(
      JSON.stringify({
        settings: {
          previewPanelWidth: 520,
          maxPreviewSizeBytes: 20 * 1024 * 1024,
          pluginsConfig: { "builtin.media": false },
        },
      })
    );
    expect(useAppStore.getState().previewPanelWidth).toBe(520);
    expect(useAppStore.getState().maxPreviewSizeBytes).toBe(20 * 1024 * 1024);
    expect(useAppStore.getState().pluginsConfig["builtin.media"]).toBe(false);
  });

  it("caps tab history at 50 during continuous navigation", () => {
    const store = useAppStore.getState();
    const activeTab = store.panes.left.tabs[0];
    expect(activeTab).toBeDefined();

    // 進行 60 次導航
    for (let i = 1; i <= 60; i++) {
      useAppStore.getState().navigateTab("left", `/dir/path_${i}`);
    }

    const updatedTab = useAppStore.getState().panes.left.tabs[0];
    expect(updatedTab.history.length).toBe(50);
    expect(updatedTab.history[updatedTab.history.length - 1]).toBe("/dir/path_60");
    expect(updatedTab.historyIndex).toBe(49);
    // 第一筆應該是第 11 個路徑 (60 - 50 + 1)
    expect(updatedTab.history[0]).toBe("/dir/path_11");
  });

  it("clears specific tab history and all tabs history properly", () => {
    // 導航數次
    useAppStore.getState().navigateTab("left", "/dir/a");
    useAppStore.getState().navigateTab("left", "/dir/b");
    useAppStore.getState().navigateTab("left", "/dir/c");

    let leftTab = useAppStore.getState().panes.left.tabs[0];
    expect(leftTab.history.length).toBeGreaterThan(1);

    // 清除單一分頁
    useAppStore.getState().clearTabHistory("left", leftTab.id);
    leftTab = useAppStore.getState().panes.left.tabs[0];
    expect(leftTab.history).toEqual(["/dir/c"]);
    expect(leftTab.historyIndex).toBe(0);

    // 再次導航
    useAppStore.getState().navigateTab("left", "/dir/d");
    expect(useAppStore.getState().panes.left.tabs[0].history.length).toBe(2);

    // 清除所有分頁
    useAppStore.getState().clearAllTabHistory();
    leftTab = useAppStore.getState().panes.left.tabs[0];
    expect(leftTab.history).toEqual(["/dir/d"]);
    expect(leftTab.historyIndex).toBe(0);
  });

  it("sanitizes excessive history when importing config", () => {
    const hugeHistory = Array.from({ length: 120 }, (_, i) => `/legacy/path_${i}`);
    useAppStore.getState().importConfigJson(
      JSON.stringify({
        settings: {
          panes: {
            left: {
              activeTabId: "tab_1",
              tabs: [
                {
                  id: "tab_1",
                  title: "Legacy",
                  path: "/legacy/path_119",
                  history: hugeHistory,
                  historyIndex: 119,
                },
              ],
            },
            right: {
              activeTabId: "tab_2",
              tabs: [
                {
                  id: "tab_2",
                  title: "Legacy 2",
                  path: "/root",
                  history: ["/root"],
                  historyIndex: 0,
                },
              ],
            },
          },
        },
      })
    );

    const importedTab = useAppStore.getState().panes.left.tabs[0];
    expect(importedTab.history.length).toBe(50);
    expect(importedTab.history[49]).toBe("/legacy/path_119");
    expect(importedTab.historyIndex).toBe(49);
  });
});
