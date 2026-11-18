import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ConflictStrategy,
  DragPayload,
  FontSettings,
  KeybindingItem,
  PaneId,
  ShortcutActionId,
  SortDirection,
  SortField,
  TabItem,
  TransferJobSnapshot,
  ViewMode,
} from "../types";

export const TAB_COLORS = [
  { id: "none", label: "預設無色", hex: "transparent" },
  { id: "blue", label: "海洋藍", hex: "#3b82f6" },
  { id: "emerald", label: "翡翠綠", hex: "#10b981" },
  { id: "amber", label: "琥珀橘", hex: "#f59e0b" },
  { id: "rose", label: "珊瑚紅", hex: "#f43f5e" },
  { id: "purple", label: "極光紫", hex: "#a855f7" },
  { id: "cyan", label: "青色", hex: "#06b6d4" },
];

export const AVAILABLE_FONTS = [
  { label: "系統預設無襯線 (System UI)", value: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft JhengHei', sans-serif" },
  { label: "微軟正黑體 (Microsoft JhengHei)", value: "'Microsoft JhengHei', 'PingFang TC', 'Noto Sans TC', sans-serif" },
  { label: "Inter / 現代幾何字體", value: "'Inter', 'Segoe UI', system-ui, sans-serif" },
  { label: "JetBrains Mono / 開發者等寬", value: "'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace" },
  { label: "Cascadia Code / 終端機等寬", value: "'Cascadia Code', 'Fira Code', 'Consolas', monospace" },
  { label: "Consolas / 經典等寬", value: "'Consolas', 'Courier New', monospace" },
];

export const DEFAULT_KEYBINDINGS: KeybindingItem[] = [
  {
    id: "rename_selected",
    label: "重新命名 (單筆原地 / 多筆批次)",
    description: "MS Windows 標準：單選時觸發原地改名，多選時直接開啟批次重新命名工具",
    keyCombo: "F2",
    defaultCombo: "F2",
  },
  {
    id: "batch_rename",
    label: "開啟批次重新命名視窗",
    description: "開啟進階 Regex / 流水號 / 大小寫批次改名對話框",
    keyCombo: "Ctrl+Shift+R",
    defaultCombo: "Ctrl+Shift+R",
  },
  {
    id: "copy_selected",
    label: "複製選取項目",
    description: "將選取檔案或目錄放入內部剪貼簿 (複製模式)",
    keyCombo: "Ctrl+C",
    defaultCombo: "Ctrl+C",
  },
  {
    id: "cut_selected",
    label: "剪下選取項目",
    description: "將選取檔案或目錄放入內部剪貼簿 (搬移模式)",
    keyCombo: "Ctrl+X",
    defaultCombo: "Ctrl+X",
  },
  {
    id: "paste_items",
    label: "貼上項目 (進入非同步傳輸佇列)",
    description: "將剪貼簿中的項目透過背景 Queue 複製或搬移至目前目錄",
    keyCombo: "Ctrl+V",
    defaultCombo: "Ctrl+V",
  },
  {
    id: "trash_selected",
    label: "移至資源回收桶",
    description: "將選取項目安全移至系統資源回收桶 (Trash)",
    keyCombo: "Delete",
    defaultCombo: "Delete",
  },
  {
    id: "delete_permanent",
    label: "永久刪除選取項目",
    description: "略過資源回收桶，透過佇列永久刪除選取項目",
    keyCombo: "Shift+Delete",
    defaultCombo: "Shift+Delete",
  },
  {
    id: "new_tab",
    label: "新增分頁",
    description: "在目前啟用的面板複製開啟新分頁",
    keyCombo: "Ctrl+T",
    defaultCombo: "Ctrl+T",
  },
  {
    id: "close_tab",
    label: "關閉目前分頁",
    description: "關閉目前分頁（已鎖定分頁會受保護不被關閉）",
    keyCombo: "Ctrl+W",
    defaultCombo: "Ctrl+W",
  },
  {
    id: "lock_tab",
    label: "鎖定 / 解鎖目前分頁",
    description: "切換分頁防關閉與目錄鎖定保護狀態",
    keyCombo: "Ctrl+L",
    defaultCombo: "Ctrl+L",
  },
  {
    id: "refresh",
    label: "重新整理目前目錄 (強制刷新快取)",
    description: "強制略過 LRU 快取並重新掃描磁碟目錄",
    keyCombo: "F5",
    defaultCombo: "F5",
  },
  {
    id: "new_folder",
    label: "建立新資料夾",
    description: "在目前目錄下快速建立新資料夾",
    keyCombo: "Ctrl+Shift+N",
    defaultCombo: "Ctrl+Shift+N",
  },
  {
    id: "select_all",
    label: "全選目前目錄項目",
    description: "選取目前篩選檢視下的所有檔案與資料夾",
    keyCombo: "Ctrl+A",
    defaultCombo: "Ctrl+A",
  },
  {
    id: "focus_search",
    label: "聚焦快速過濾搜尋框",
    description: "立即跳至頂部即時檔案名稱過濾輸入框",
    keyCombo: "Ctrl+F",
    defaultCombo: "Ctrl+F",
  },
  {
    id: "go_up",
    label: "返回上一層目錄",
    description: "導覽至目前路徑的父目錄",
    keyCombo: "Backspace",
    defaultCombo: "Backspace",
  },
  {
    id: "toggle_dual_pane",
    label: "切換單欄 / 雙欄並排模式 (Dual-Pane)",
    description: "開啟或關閉左右雙欄指揮官檢視模式",
    keyCombo: "F6",
    defaultCombo: "F6",
  },
  {
    id: "toggle_hidden",
    label: "顯示 / 隱藏系統隱藏檔",
    description: "切換是否顯示以點開頭或具隱藏屬性的檔案",
    keyCombo: "Ctrl+H",
    defaultCombo: "Ctrl+H",
  },
  {
    id: "open_terminal",
    label: "在目前目錄開啟終端機",
    description: "啟動系統原生終端機 (PowerShell 7 / Terminal)",
    keyCombo: "Ctrl+`",
    defaultCombo: "Ctrl+`",
  },
];

function getBaseName(p: string): string {
  const cleaned = p.replace(/\/+$/, "");
  if (!cleaned) return "/";
  const parts = cleaned.split("/");
  return parts[parts.length - 1] || cleaned;
}

export function createNewTab(path: string, color = "none"): TabItem {
  const normalized = path.replace(/\\/g, "/");
  return {
    id: `tab_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: getBaseName(normalized),
    path: normalized,
    history: [normalized],
    historyIndex: 0,
    color,
    locked: false,
    sortField: "name",
    sortDirection: "asc",
    viewMode: "details",
    filterQuery: "",
    selectedPaths: [],
    lastSelectedPath: null,
  };
}

interface PaneState {
  tabs: TabItem[];
  activeTabId: string;
}

interface ClipboardData {
  mode: "copy" | "cut";
  paths: string[];
}

interface AppStoreState {
  activePane: PaneId;
  dualPaneEnabled: boolean;
  showHiddenFiles: boolean;
  showPreviewPanel: boolean;
  showQueueDrawer: boolean;
  conflictStrategy: ConflictStrategy;
  bookmarks: { label: string; path: string }[];
  fontSettings: FontSettings;
  keybindings: KeybindingItem[];
  panes: Record<PaneId, PaneState>;
  clipboard: ClipboardData | null;
  dragPayload: DragPayload | null;
  transferJobs: TransferJobSnapshot[];
  lastUndoRenamePairs: [string, string][];
  refreshVersion: number;

  // Actions
  setActivePane: (pane: PaneId) => void;
  setDualPaneEnabled: (enabled: boolean) => void;
  setShowHiddenFiles: (show: boolean) => void;
  setShowPreviewPanel: (show: boolean) => void;
  setShowQueueDrawer: (show: boolean) => void;
  setConflictStrategy: (strategy: ConflictStrategy) => void;
  updateFontSettings: (partial: Partial<FontSettings>) => void;
  updateKeybinding: (id: ShortcutActionId, newCombo: string) => void;
  resetKeybindings: () => void;
  addBookmark: (label: string, path: string) => void;
  removeBookmark: (path: string) => void;

  // Tab & Navigation actions
  initDefaultPaths: (defaultPath: string) => void;
  addTab: (pane: PaneId, path?: string, color?: string) => void;
  closeTab: (pane: PaneId, tabId: string) => void;
  closeOtherTabs: (pane: PaneId, keepTabId: string) => void;
  duplicateTab: (pane: PaneId, tabId: string) => void;
  setActiveTab: (pane: PaneId, tabId: string) => void;
  toggleTabLock: (pane: PaneId, tabId: string) => void;
  setTabColor: (pane: PaneId, tabId: string, color: string) => void;
  renameTabCustomTitle: (pane: PaneId, tabId: string, title: string) => void;
  reorderTabs: (pane: PaneId, fromIndex: number, toIndex: number) => void;
  navigateTab: (pane: PaneId, path: string) => void;
  goBack: (pane: PaneId) => void;
  goForward: (pane: PaneId) => void;
  setTabSort: (pane: PaneId, field: SortField, direction?: SortDirection) => void;
  setTabViewMode: (pane: PaneId, mode: ViewMode) => void;
  setTabFilterQuery: (pane: PaneId, query: string) => void;
  setTabSelection: (pane: PaneId, selectedPaths: string[], lastSelectedPath?: string | null) => void;

  // Clipboard & Drag & Queue
  setClipboard: (data: ClipboardData | null) => void;
  setDragPayload: (payload: DragPayload | null) => void;
  setTransferJobs: (jobs: TransferJobSnapshot[]) => void;
  setLastUndoRenamePairs: (pairs: [string, string][]) => void;
  triggerRefresh: () => void;
}

const initialLeftTab = createNewTab("D:/devops_workspace", "#3b82f6");
const initialRightTab = createNewTab("D:/devops_workspace/private", "#10b981");

export const useAppStore = create<AppStoreState>()(
  persist(
    (set, get) => ({
      activePane: "left",
      dualPaneEnabled: false,
      showHiddenFiles: false,
      showPreviewPanel: true,
      showQueueDrawer: false,
      conflictStrategy: "rename",
      bookmarks: [
        { label: "DevOps 工作區", path: "D:/devops_workspace" },
        { label: "個人專案區 (Private)", path: "D:/devops_workspace/private" },
      ],
      fontSettings: {
        fontFamily: AVAILABLE_FONTS[0].value,
        fontSizePx: 14,
        rowHeightPx: 34,
      },
      keybindings: DEFAULT_KEYBINDINGS,
      panes: {
        left: {
          tabs: [initialLeftTab],
          activeTabId: initialLeftTab.id,
        },
        right: {
          tabs: [initialRightTab],
          activeTabId: initialRightTab.id,
        },
      },
      clipboard: null,
      dragPayload: null,
      transferJobs: [],
      lastUndoRenamePairs: [],
      refreshVersion: 0,

      setActivePane: (pane) => set({ activePane: pane }),
      setDualPaneEnabled: (enabled) =>
        set((state) => ({
          dualPaneEnabled: enabled,
          activePane: enabled ? state.activePane : "left",
        })),
      setShowHiddenFiles: (show) => set({ showHiddenFiles: show }),
      setShowPreviewPanel: (show) => set({ showPreviewPanel: show }),
      setShowQueueDrawer: (show) => set({ showQueueDrawer: show }),
      setConflictStrategy: (strategy) => set({ conflictStrategy: strategy }),

      updateFontSettings: (partial) =>
        set((state) => {
          const next = { ...state.fontSettings, ...partial };
          if (partial.fontSizePx && !partial.rowHeightPx) {
            next.rowHeightPx = Math.max(28, Math.round(partial.fontSizePx * 2.35));
          }
          return { fontSettings: next };
        }),

      updateKeybinding: (id, newCombo) =>
        set((state) => ({
          keybindings: state.keybindings.map((kb) =>
            kb.id === id ? { ...kb, keyCombo: newCombo } : kb
          ),
        })),

      resetKeybindings: () => set({ keybindings: DEFAULT_KEYBINDINGS }),

      addBookmark: (label, path) =>
        set((state) => {
          const norm = path.replace(/\\/g, "/");
          if (state.bookmarks.some((b) => b.path === norm)) return state;
          return { bookmarks: [...state.bookmarks, { label, path: norm }] };
        }),

      removeBookmark: (path) =>
        set((state) => ({
          bookmarks: state.bookmarks.filter((b) => b.path !== path),
        })),

      initDefaultPaths: (defaultPath) =>
        set((state) => {
          const norm = defaultPath.replace(/\\/g, "/");
          const updatePane = (p: PaneState): PaneState => ({
            ...p,
            tabs: p.tabs.map((t) =>
              !t.path || t.path === "."
                ? { ...t, path: norm, title: getBaseName(norm), history: [norm], historyIndex: 0 }
                : t
            ),
          });
          return {
            panes: {
              left: updatePane(state.panes.left),
              right: updatePane(state.panes.right),
            },
          };
        }),

      addTab: (pane, path, color = "none") =>
        set((state) => {
          const paneState = state.panes[pane];
          const currentActive =
            paneState.tabs.find((t) => t.id === paneState.activeTabId) ||
            paneState.tabs[0];
          const targetPath = path || currentActive?.path || "D:/";
          const newTab = createNewTab(targetPath, color);
          return {
            activePane: pane,
            panes: {
              ...state.panes,
              [pane]: {
                tabs: [...paneState.tabs, newTab],
                activeTabId: newTab.id,
              },
            },
          };
        }),

      closeTab: (pane, tabId) =>
        set((state) => {
          const paneState = state.panes[pane];
          const target = paneState.tabs.find((t) => t.id === tabId);
          // 已鎖定分頁禁止關閉！
          if (!target || target.locked) return state;
          if (paneState.tabs.length <= 1) return state;

          const idx = paneState.tabs.findIndex((t) => t.id === tabId);
          const remaining = paneState.tabs.filter((t) => t.id !== tabId);
          let nextActiveId = paneState.activeTabId;
          if (paneState.activeTabId === tabId) {
            const nextIdx = Math.min(idx, remaining.length - 1);
            nextActiveId = remaining[nextIdx].id;
          }
          return {
            panes: {
              ...state.panes,
              [pane]: {
                tabs: remaining,
                activeTabId: nextActiveId,
              },
            },
          };
        }),

      closeOtherTabs: (pane, keepTabId) =>
        set((state) => {
          const paneState = state.panes[pane];
          const remaining = paneState.tabs.filter(
            (t) => t.id === keepTabId || t.locked
          );
          return {
            panes: {
              ...state.panes,
              [pane]: {
                tabs: remaining,
                activeTabId: keepTabId,
              },
            },
          };
        }),

      duplicateTab: (pane, tabId) =>
        set((state) => {
          const paneState = state.panes[pane];
          const src = paneState.tabs.find((t) => t.id === tabId);
          if (!src) return state;
          const dup = createNewTab(src.path, src.color);
          dup.sortField = src.sortField;
          dup.sortDirection = src.sortDirection;
          dup.viewMode = src.viewMode;
          return {
            panes: {
              ...state.panes,
              [pane]: {
                tabs: [...paneState.tabs, dup],
                activeTabId: dup.id,
              },
            },
          };
        }),

      setActiveTab: (pane, tabId) =>
        set((state) => ({
          activePane: pane,
          panes: {
            ...state.panes,
            [pane]: {
              ...state.panes[pane],
              activeTabId: tabId,
            },
          },
        })),

      toggleTabLock: (pane, tabId) =>
        set((state) => ({
          panes: {
            ...state.panes,
            [pane]: {
              ...state.panes[pane],
              tabs: state.panes[pane].tabs.map((t) =>
                t.id === tabId ? { ...t, locked: !t.locked } : t
              ),
            },
          },
        })),

      setTabColor: (pane, tabId, color) =>
        set((state) => ({
          panes: {
            ...state.panes,
            [pane]: {
              ...state.panes[pane],
              tabs: state.panes[pane].tabs.map((t) =>
                t.id === tabId ? { ...t, color } : t
              ),
            },
          },
        })),

      renameTabCustomTitle: (pane, tabId, title) =>
        set((state) => ({
          panes: {
            ...state.panes,
            [pane]: {
              ...state.panes[pane],
              tabs: state.panes[pane].tabs.map((t) =>
                t.id === tabId ? { ...t, title: title.trim() || getBaseName(t.path) } : t
              ),
            },
          },
        })),

      reorderTabs: (pane, fromIndex, toIndex) =>
        set((state) => {
          const tabs = [...state.panes[pane].tabs];
          if (
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= tabs.length ||
            toIndex >= tabs.length
          ) {
            return state;
          }
          const [moved] = tabs.splice(fromIndex, 1);
          tabs.splice(toIndex, 0, moved);
          return {
            panes: {
              ...state.panes,
              [pane]: {
                ...state.panes[pane],
                tabs,
              },
            },
          };
        }),

      navigateTab: (pane, rawPath) =>
        set((state) => {
          const path = rawPath.replace(/\\/g, "/");
          const paneState = state.panes[pane];
          return {
            activePane: pane,
            panes: {
              ...state.panes,
              [pane]: {
                ...paneState,
                tabs: paneState.tabs.map((t) => {
                  if (t.id !== paneState.activeTabId) return t;
                  const slicedHistory = t.history.slice(0, t.historyIndex + 1);
                  const nextHistory =
                    slicedHistory[slicedHistory.length - 1] === path
                      ? slicedHistory
                      : [...slicedHistory, path];
                  return {
                    ...t,
                    path,
                    title: getBaseName(path),
                    history: nextHistory,
                    historyIndex: nextHistory.length - 1,
                    filterQuery: "",
                    selectedPaths: [],
                    lastSelectedPath: null,
                  };
                }),
              },
            },
          };
        }),

      goBack: (pane) =>
        set((state) => {
          const paneState = state.panes[pane];
          return {
            panes: {
              ...state.panes,
              [pane]: {
                ...paneState,
                tabs: paneState.tabs.map((t) => {
                  if (t.id !== paneState.activeTabId || t.historyIndex <= 0)
                    return t;
                  const nextIndex = t.historyIndex - 1;
                  const nextPath = t.history[nextIndex];
                  return {
                    ...t,
                    path: nextPath,
                    title: getBaseName(nextPath),
                    historyIndex: nextIndex,
                    selectedPaths: [],
                    lastSelectedPath: null,
                  };
                }),
              },
            },
          };
        }),

      goForward: (pane) =>
        set((state) => {
          const paneState = state.panes[pane];
          return {
            panes: {
              ...state.panes,
              [pane]: {
                ...paneState,
                tabs: paneState.tabs.map((t) => {
                  if (
                    t.id !== paneState.activeTabId ||
                    t.historyIndex >= t.history.length - 1
                  )
                    return t;
                  const nextIndex = t.historyIndex + 1;
                  const nextPath = t.history[nextIndex];
                  return {
                    ...t,
                    path: nextPath,
                    title: getBaseName(nextPath),
                    historyIndex: nextIndex,
                    selectedPaths: [],
                    lastSelectedPath: null,
                  };
                }),
              },
            },
          };
        }),

      setTabSort: (pane, field, direction) =>
        set((state) => {
          const paneState = state.panes[pane];
          return {
            panes: {
              ...state.panes,
              [pane]: {
                ...paneState,
                tabs: paneState.tabs.map((t) => {
                  if (t.id !== paneState.activeTabId) return t;
                  const nextDir: SortDirection =
                    direction ||
                    (t.sortField === field && t.sortDirection === "asc"
                      ? "desc"
                      : "asc");
                  return {
                    ...t,
                    sortField: field,
                    sortDirection: nextDir,
                  };
                }),
              },
            },
          };
        }),

      setTabViewMode: (pane, mode) =>
        set((state) => {
          const paneState = state.panes[pane];
          return {
            panes: {
              ...state.panes,
              [pane]: {
                ...paneState,
                tabs: paneState.tabs.map((t) =>
                  t.id === paneState.activeTabId ? { ...t, viewMode: mode } : t
                ),
              },
            },
          };
        }),

      setTabFilterQuery: (pane, query) =>
        set((state) => {
          const paneState = state.panes[pane];
          return {
            panes: {
              ...state.panes,
              [pane]: {
                ...paneState,
                tabs: paneState.tabs.map((t) =>
                  t.id === paneState.activeTabId ? { ...t, filterQuery: query } : t
                ),
              },
            },
          };
        }),

      setTabSelection: (pane, selectedPaths, lastSelectedPath = null) =>
        set((state) => {
          const paneState = state.panes[pane];
          return {
            activePane: pane,
            panes: {
              ...state.panes,
              [pane]: {
                ...paneState,
                tabs: paneState.tabs.map((t) =>
                  t.id === paneState.activeTabId
                    ? {
                        ...t,
                        selectedPaths,
                        lastSelectedPath:
                          lastSelectedPath !== undefined
                            ? lastSelectedPath
                            : t.lastSelectedPath,
                      }
                    : t
                ),
              },
            },
          };
        }),

      setClipboard: (data) => set({ clipboard: data }),
      setDragPayload: (payload) => set({ dragPayload: payload }),
      setTransferJobs: (jobs) => set({ transferJobs: jobs }),
      setLastUndoRenamePairs: (pairs) => set({ lastUndoRenamePairs: pairs }),
      triggerRefresh: () =>
        set((state) => ({ refreshVersion: state.refreshVersion + 1 })),
    }),
    {
      name: "rust_file_manager_settings_v1",
      partialize: (state) => ({
        dualPaneEnabled: state.dualPaneEnabled,
        showHiddenFiles: state.showHiddenFiles,
        showPreviewPanel: state.showPreviewPanel,
        conflictStrategy: state.conflictStrategy,
        bookmarks: state.bookmarks,
        fontSettings: state.fontSettings,
        keybindings: state.keybindings,
        panes: state.panes,
      }),
    }
  )
);
