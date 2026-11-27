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
    useAppStore.getState().resetToFactoryDefaults();
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

  it("resets state completely to pure factory defaults including tabs and clear localStorage", () => {
    // 模擬操作產生多個歷史與非預設設定
    useAppStore.getState().navigateTab("left", "/dir/custom1");
    useAppStore.getState().navigateTab("left", "/dir/custom2");
    useAppStore.getState().setDualPaneEnabled(true);
    useAppStore.getState().setShowHiddenFiles(true);
    expect(useAppStore.getState().panes.left.tabs[0].history.length).toBe(3);
    expect(useAppStore.getState().dualPaneEnabled).toBe(true);

    // 執行徹底出廠重置
    useAppStore.getState().resetToFactoryDefaults("/factory/home");

    const state = useAppStore.getState();
    expect(state.dualPaneEnabled).toBe(false);
    expect(state.showHiddenFiles).toBe(false);
    expect(state.panes.left.tabs.length).toBe(1);
    expect(state.panes.left.tabs[0].path).toBe("/factory/home");
    expect(state.panes.left.tabs[0].history).toEqual(["/factory/home"]);
    expect(state.panes.left.tabs[0].historyIndex).toBe(0);
    expect(state.panes.right.tabs[0].history).toEqual(["/factory/home"]);
  });

  it("falls back to pure factory default panes when imported config lacks panes", () => {
    // 模擬已存在的髒歷史
    useAppStore.getState().navigateTab("left", "/dirty/path1");
    useAppStore.getState().navigateTab("left", "/dirty/path2");

    // 匯入完全缺少 panes 欄位的極簡設定檔（如 Rust 後端預設或手動 JSON）
    useAppStore.getState().importConfigJson(
      JSON.stringify({
        settings: {
          confirmDelete: false,
          conflictStrategy: "skip",
        },
      })
    );

    const state = useAppStore.getState();
    expect(state.confirmDelete).toBe(false);
    expect(state.conflictStrategy).toBe("skip");
    // 驗證 panes 自動重置為出廠乾淨狀態，絕不保留髒歷史
    expect(state.panes.left.tabs[0].history.length).toBe(1);
    expect(state.panes.left.tabs[0].historyIndex).toBe(0);
  });

  it("manages bookmarks properly and preserves all paths including devops_workspace", () => {
    const store = useAppStore.getState();
    expect(store.bookmarks).toEqual([]);

    // 新增書籤 (含反斜線自動正規化)
    store.addBookmark("Tools", "D:\\tools");
    store.addBookmark("DevOps", "D:/devops_workspace");
    store.addBookmark("Private", "D:\\devops_workspace\\private");

    let bookmarks = useAppStore.getState().bookmarks;
    expect(bookmarks.length).toBe(3);
    expect(bookmarks[0]).toEqual({ label: "Tools", path: "D:/tools" });
    expect(bookmarks[1]).toEqual({ label: "DevOps", path: "D:/devops_workspace" });
    expect(bookmarks[2]).toEqual({ label: "Private", path: "D:/devops_workspace/private" });

    // 重複新增應略過
    store.addBookmark("Duplicate", "D:\\tools");
    expect(useAppStore.getState().bookmarks.length).toBe(3);

    // 匯出設定驗證
    const exportedJson = useAppStore.getState().exportConfigJson();
    const parsed = JSON.parse(exportedJson);
    expect(parsed.settings.bookmarks.length).toBe(3);

    // 重設狀態後重新匯入
    useAppStore.getState().resetToFactoryDefaults();
    expect(useAppStore.getState().bookmarks).toEqual([]);

    useAppStore.getState().importConfigJson(exportedJson);
    bookmarks = useAppStore.getState().bookmarks;
    expect(bookmarks.length).toBe(3);
    expect(bookmarks.some((b) => b.path === "D:/devops_workspace")).toBe(true);
    expect(bookmarks.some((b) => b.path === "D:/devops_workspace/private")).toBe(true);
    expect(bookmarks.some((b) => b.path === "D:/tools")).toBe(true);

    // 移除書籤 (支援反斜線與正斜線移除)
    useAppStore.getState().removeBookmark("D:\\devops_workspace\\private");
    expect(useAppStore.getState().bookmarks.length).toBe(2);
    expect(useAppStore.getState().bookmarks.some((b) => b.path === "D:/devops_workspace/private")).toBe(false);

    // 匯入包含髒資料的書籤陣列防禦測試
    useAppStore.getState().importConfigJson(
      JSON.stringify({
        settings: {
          bookmarks: [
            { label: "Valid", path: "E:/data" },
            null,
            { label: 123, path: "invalid" },
            { path: "missing_label" },
            "just_a_string",
          ],
        },
      })
    );
    expect(useAppStore.getState().bookmarks).toEqual([{ label: "Valid", path: "E:/data" }]);
  });
});
