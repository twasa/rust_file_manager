import React, { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Columns,
  Eye,
  EyeOff,
  PanelRight,
  Settings,
  Type,
  Wand2,
  Activity,
  RotateCcw,
  Terminal,
  Copy,
  Scissors,
  ClipboardPaste,
  Trash2,
  FolderKanban,
} from "lucide-react";
import {
  apiCheckTransferConflicts,
  apiCompressToZip,
  apiComputeChecksum,
  apiCreateDirectory,
  apiCreateFile,
  apiEnqueueTransfer,
  apiExtractArchive,
  apiGetSystemLocations,
  apiListTransferJobs,
  apiOpenItem,
  apiOpenTerminal,
  apiRevealInShell,
  apiSetLogFormat,
  apiSetQueueRetention,
  apiUndoBatchRename,
  apiWriteFrontendLog,
} from "./api";
import { useAppStore } from "./store/useAppStore";
import { keyboardEventToCombo } from "./utils/formatters";
import { Sidebar } from "./components/Sidebar";
import { FilePane } from "./components/FilePane";
import { PreviewPanel } from "./components/PreviewPanel";
import { QueueDrawer } from "./components/QueueDrawer";
import { ContextMenu, ContextMenuState } from "./components/ContextMenu";
import { BatchRenameModal } from "./components/BatchRenameModal";
import { SettingsModal } from "./components/SettingsModal";
import { ConflictDialogModal } from "./components/ConflictDialogModal";
import type {
  FileEntry,
  PaneId,
  ShortcutActionId,
  SystemLocations,
  TransferJobSnapshot,
} from "./types";

export const App: React.FC = () => {
  const activePane = useAppStore((s) => s.activePane);
  const panes = useAppStore((s) => s.panes);
  const dualPaneEnabled = useAppStore((s) => s.dualPaneEnabled);
  const setDualPaneEnabled = useAppStore((s) => s.setDualPaneEnabled);
  const showHiddenFiles = useAppStore((s) => s.showHiddenFiles);
  const setShowHiddenFiles = useAppStore((s) => s.setShowHiddenFiles);
  const showPreviewPanel = useAppStore((s) => s.showPreviewPanel);
  const setShowPreviewPanel = useAppStore((s) => s.setShowPreviewPanel);
  const showQueueDrawer = useAppStore((s) => s.showQueueDrawer);
  const setShowQueueDrawer = useAppStore((s) => s.setShowQueueDrawer);
  const conflictStrategy = useAppStore((s) => s.conflictStrategy);
  const queueRetention = useAppStore((s) => s.queueRetention);
  const logFormat = useAppStore((s) => s.logFormat);
  const setPendingConflictPrompt = useAppStore(
    (s) => s.setPendingConflictPrompt
  );
  const fontSettings = useAppStore((s) => s.fontSettings);
  const updateFontSettings = useAppStore((s) => s.updateFontSettings);
  const keybindings = useAppStore((s) => s.keybindings);
  const clipboard = useAppStore((s) => s.clipboard);
  const setClipboard = useAppStore((s) => s.setClipboard);
  const dragPayload = useAppStore((s) => s.dragPayload);
  const setDragPayload = useAppStore((s) => s.setDragPayload);
  const transferJobs = useAppStore((s) => s.transferJobs);
  const setTransferJobs = useAppStore((s) => s.setTransferJobs);
  const lastUndoRenamePairs = useAppStore((s) => s.lastUndoRenamePairs);
  const setLastUndoRenamePairs = useAppStore((s) => s.setLastUndoRenamePairs);

  const addTab = useAppStore((s) => s.addTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const toggleTabLock = useAppStore((s) => s.toggleTabLock);
  const navigateTab = useAppStore((s) => s.navigateTab);
  const setTabSelection = useAppStore((s) => s.setTabSelection);
  const addBookmark = useAppStore((s) => s.addBookmark);
  const initDefaultPaths = useAppStore((s) => s.initDefaultPaths);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [systemLocations, setSystemLocations] =
    useState<SystemLocations | null>(null);
  const [paneEntriesMap, setPaneEntriesMap] = useState<
    Record<PaneId, FileEntry[]>
  >({
    left: [],
    right: [],
  });
  const [inlineRenameTargetPath, setInlineRenameTargetPath] = useState<
    string | null
  >(null);
  const [batchRenameModalOpen, setBatchRenameModalOpen] = useState(false);
  const [batchRenameTargets, setBatchRenameTargets] = useState<FileEntry[]>([]);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    "appearance" | "shortcuts" | "queue" | "config" | "logs"
  >("appearance");
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    pane: "left",
    targetEntry: null,
    selectedEntries: [],
    currentDirPath: "",
  });

  const leftSearchRef = useRef<HTMLInputElement>(null);
  const rightSearchRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3600);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // 將字形家族 (fontFamily) 與全域 UI 介面字體縮放 (uiFontSizePx) 同步套用至根節點 (<html> & <body>)
  useEffect(() => {
    const uiBase = fontSettings.uiFontSizePx || 14;
    // Tailwind 的 text-xs 為 0.75rem (當 root 16px 時為 12px)。
    // 將 root font-size 按比例縮放，讓所有側邊欄、分頁列、工具列、右鍵選單與對話視窗等比放大縮小！
    const rootScalePx = Math.round((uiBase / 14) * 16 * 10) / 10;
    document.documentElement.style.fontSize = `${rootScalePx}px`;
    document.documentElement.style.fontFamily = fontSettings.fontFamily;
    document.body.style.fontFamily = fontSettings.fontFamily;
  }, [fontSettings.fontFamily, fontSettings.uiFontSizePx]);

  // 同步日誌格式設定並攔截前端全域未處理錯誤寫入後端結構化日誌檔
  useEffect(() => {
    apiSetLogFormat(logFormat).catch(console.error);
  }, [logFormat]);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      apiWriteFrontendLog(
        "ERROR",
        "frontend::window",
        "uncaught_error",
        event.message || "Uncaught window error",
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        }
      ).catch(() => {});
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      apiWriteFrontendLog(
        "ERROR",
        "frontend::promise",
        "unhandled_rejection",
        String(event.reason || "Unhandled promise rejection")
      ).catch(() => {});
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  // 將佇列事件保留策略同步至 Rust 後端並套用過期/超量裁剪
  useEffect(() => {
    if (!queueRetention) return;
    apiSetQueueRetention(queueRetention)
      .then((jobs) => setTransferJobs(jobs))
      .catch(console.error);
  }, [queueRetention, setTransferJobs]);

  // 初始化系統掛載點與背景佇列事件監聽
  useEffect(() => {
    apiGetSystemLocations()
      .then((locs) => {
        setSystemLocations(locs);
        if (locs.homeDir) {
          initDefaultPaths(locs.homeDir);
        }
      })
      .catch(console.error);

    apiListTransferJobs()
      .then((jobs) => setTransferJobs(jobs))
      .catch(console.error);

    let unlistenFn: (() => void) | null = null;
    const announcedCompletedIds = new Set<string>();
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      listen<TransferJobSnapshot[]>("queue://updated", (event) => {
        setTransferJobs(event.payload);
        for (const job of event.payload) {
          if (
            job.status === "completed" &&
            !announcedCompletedIds.has(job.id)
          ) {
            announcedCompletedIds.add(job.id);
            triggerRefresh();
            notify(job.currentFile);
          }
        }
      })
        .then((fn) => {
          unlistenFn = fn;
        })
        .catch(console.error);
    }

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, [initDefaultPaths, notify, setTransferJobs, triggerRefresh]);

  const handleEntriesLoaded = useCallback(
    (pane: PaneId, entries: FileEntry[]) => {
      setPaneEntriesMap((prev) => ({ ...prev, [pane]: entries }));
    },
    []
  );

  // 取得目前焦點面板與分頁
  const currentPaneState = panes[activePane];
  const currentTab =
    currentPaneState.tabs.find((t) => t.id === currentPaneState.activeTabId) ||
    currentPaneState.tabs[0];
  const currentEntries = paneEntriesMap[activePane] || [];
  const selectedEntries = currentEntries.filter((e) =>
    currentTab?.selectedPaths.includes(e.path)
  );

  // 執行佇列貼上（若衝突策略為 ask 且有同名檔案，先彈出互動詢問對話框）
  const executePasteToDir = useCallback(
    async (targetDirPath: string) => {
      if (!clipboard || clipboard.paths.length === 0) return;
      const jobType = clipboard.mode === "cut" ? "move" : "copy";
      try {
        if (conflictStrategy === "ask") {
          const conflicts = await apiCheckTransferConflicts(
            clipboard.paths,
            targetDirPath
          );
          if (conflicts.length > 0) {
            const sources = [...clipboard.paths];
            if (clipboard.mode === "cut") {
              setClipboard(null);
            }
            setPendingConflictPrompt({
              jobType,
              sources,
              destination: targetDirPath,
              conflicts,
            });
            return;
          }
        }
        await apiEnqueueTransfer(
          jobType,
          clipboard.paths,
          targetDirPath,
          conflictStrategy
        );
        if (clipboard.mode === "cut") {
          setClipboard(null);
        }
        setShowQueueDrawer(true);
        notify(
          `已加入背景佇列：${
            jobType === "move" ? "搬移" : "複製"
          } ${clipboard.paths.length} 個項目`
        );
      } catch (err) {
        notify(`貼上失敗: ${String(err)}`);
      }
    },
    [
      clipboard,
      conflictStrategy,
      notify,
      setClipboard,
      setPendingConflictPrompt,
      setShowQueueDrawer,
    ]
  );

  // 執行快捷鍵對應動作
  const executeShortcutAction = useCallback(
    async (actionId: ShortcutActionId) => {
      if (!currentTab) return;

      switch (actionId) {
        case "rename_selected": {
          if (selectedEntries.length === 1) {
            setInlineRenameTargetPath(selectedEntries[0].path);
          } else if (selectedEntries.length > 1) {
            setBatchRenameTargets(selectedEntries);
            setBatchRenameModalOpen(true);
          } else {
            notify("請先選取要重新命名的檔案或目錄");
          }
          break;
        }
        case "batch_rename": {
          const targets =
            selectedEntries.length > 0 ? selectedEntries : currentEntries;
          if (targets.length === 0) {
            notify("目前目錄沒有可批次更名的項目");
            return;
          }
          setBatchRenameTargets(targets);
          setBatchRenameModalOpen(true);
          break;
        }
        case "copy_selected": {
          if (selectedEntries.length === 0) return;
          setClipboard({
            mode: "copy",
            paths: selectedEntries.map((e) => e.path),
          });
          notify(`已複製 ${selectedEntries.length} 個項目至剪貼簿`);
          break;
        }
        case "cut_selected": {
          if (selectedEntries.length === 0) return;
          setClipboard({
            mode: "cut",
            paths: selectedEntries.map((e) => e.path),
          });
          notify(`已剪下 ${selectedEntries.length} 個項目（貼上後將搬移）`);
          break;
        }
        case "paste_items": {
          await executePasteToDir(currentTab.path);
          break;
        }
        case "trash_selected": {
          if (selectedEntries.length === 0) return;
          await apiEnqueueTransfer(
            "trash",
            selectedEntries.map((e) => e.path),
            null,
            conflictStrategy
          );
          setShowQueueDrawer(true);
          notify(`正在將 ${selectedEntries.length} 個項目移至資源回收桶`);
          break;
        }
        case "delete_permanent": {
          if (selectedEntries.length === 0) return;
          await apiEnqueueTransfer(
            "delete",
            selectedEntries.map((e) => e.path),
            null,
            conflictStrategy
          );
          setShowQueueDrawer(true);
          notify(`正在永久刪除 ${selectedEntries.length} 個項目`);
          break;
        }
        case "new_tab": {
          addTab(activePane, currentTab.path);
          break;
        }
        case "close_tab": {
          if (currentTab.locked) {
            notify("此分頁已被鎖定，避免誤關（可按右鍵或 Ctrl+L 解鎖）");
          } else {
            closeTab(activePane, currentTab.id);
          }
          break;
        }
        case "lock_tab": {
          toggleTabLock(activePane, currentTab.id);
          notify(currentTab.locked ? "已解除分頁鎖定" : "已鎖定目前分頁");
          break;
        }
        case "refresh": {
          triggerRefresh();
          notify("已重新整理並更新快取");
          break;
        }
        case "new_folder": {
          const folderName = `新資料夾_${Date.now().toString().slice(-4)}`;
          try {
            const created = await apiCreateDirectory(
              currentTab.path,
              folderName
            );
            triggerRefresh();
            setTabSelection(activePane, [created], created);
            setInlineRenameTargetPath(created);
          } catch (err) {
            notify(`建立資料夾失敗: ${String(err)}`);
          }
          break;
        }
        case "select_all": {
          const allPaths = currentEntries.map((e) => e.path);
          setTabSelection(
            activePane,
            allPaths,
            allPaths[allPaths.length - 1] || null
          );
          break;
        }
        case "focus_search": {
          if (activePane === "left") leftSearchRef.current?.focus();
          else rightSearchRef.current?.focus();
          break;
        }
        case "go_up": {
          const parts = currentTab.path.replace(/\/+$/, "").split("/");
          if (parts.length > 1) {
            parts.pop();
            const parent =
              parts.length === 1 && parts[0].endsWith(":")
                ? `${parts[0]}/`
                : parts.join("/");
            navigateTab(activePane, parent);
          }
          break;
        }
        case "toggle_dual_pane": {
          setDualPaneEnabled(!dualPaneEnabled);
          break;
        }
        case "toggle_queue": {
          setShowQueueDrawer(!showQueueDrawer);
          break;
        }
        case "toggle_hidden": {
          setShowHiddenFiles(!showHiddenFiles);
          break;
        }
        case "open_terminal": {
          await apiOpenTerminal(currentTab.path);
          break;
        }
      }
    },
    [
      currentTab,
      selectedEntries,
      currentEntries,
      activePane,
      conflictStrategy,
      dualPaneEnabled,
      showQueueDrawer,
      showHiddenFiles,
      addTab,
      closeTab,
      toggleTabLock,
      triggerRefresh,
      setTabSelection,
      navigateTab,
      setDualPaneEnabled,
      setShowHiddenFiles,
      setClipboard,
      setShowQueueDrawer,
      executePasteToDir,
      notify,
    ]
  );

  // 全域自訂快捷鍵攔截器
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (batchRenameModalOpen || settingsModalOpen) return;

      // Enter 直接進入目錄或開啟檔案
      if (
        e.key === "Enter" &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        selectedEntries.length === 1
      ) {
        e.preventDefault();
        const item = selectedEntries[0];
        if (item.isDir) {
          navigateTab(activePane, item.path);
        } else {
          apiOpenItem(item.path).catch((err) => notify(String(err)));
        }
        return;
      }

      const combo = keyboardEventToCombo(e);
      const matched = keybindings.find(
        (kb) => kb.keyCombo.toLowerCase() === combo.toLowerCase()
      );
      if (matched) {
        e.preventDefault();
        executeShortcutAction(matched.id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    keybindings,
    batchRenameModalOpen,
    settingsModalOpen,
    selectedEntries,
    activePane,
    navigateTab,
    executeShortcutAction,
    notify,
  ]);

  // 處理右鍵選單動作
  const handleContextMenuAction = async (
    action: string,
    entry: FileEntry | null
  ) => {
    const pane = contextMenu.pane;
    const dirPath = contextMenu.currentDirPath;
    const sel = contextMenu.selectedEntries;

    try {
      switch (action) {
        case "進入此目錄":
          if (entry) navigateTab(pane, entry.path);
          break;
        case "在新分頁中開啟此目錄":
          if (entry) addTab(pane, entry.path, "#3b82f6");
          break;
        case "在另一側面板開啟 (Dual-Pane)":
          if (entry) {
            const otherPane: PaneId = pane === "left" ? "right" : "left";
            setDualPaneEnabled(true);
            navigateTab(otherPane, entry.path);
          }
          break;
        case "加入側邊欄書籤捷徑":
          if (entry) {
            addBookmark(entry.name, entry.path);
            notify(`已將「${entry.name}」加入書籤捷徑`);
          }
          break;
        case "在此目錄開啟終端機":
        case "在終端機環境開啟所屬目錄":
          if (entry) await apiOpenTerminal(entry.path);
          break;
        case "在目前目錄開啟終端機":
          await apiOpenTerminal(dirPath);
          break;
        case "使用系統預設程式開啟":
          if (entry) await apiOpenItem(entry.path);
          break;
        case "解壓縮至此處 (自動建立同名資料夾)":
          if (entry) {
            notify(`正在解壓縮 ${entry.name}...`);
            const outDir = await apiExtractArchive(entry.path);
            triggerRefresh();
            notify(`已解壓縮至 ${outDir}`);
          }
          break;
        case "計算檔案雜湊值 (MD5 / SHA-256 / CRC32)":
          if (entry) {
            setShowPreviewPanel(true);
            const res = await apiComputeChecksum(entry.path);
            notify(`SHA-256: ${res.sha256.slice(0, 16)}... (詳見右側預覽欄)`);
          }
          break;
        case "新增資料夾": {
          const created = await apiCreateDirectory(
            dirPath,
            `新資料夾_${Date.now().toString().slice(-4)}`
          );
          triggerRefresh();
          setTabSelection(pane, [created], created);
          setInlineRenameTargetPath(created);
          break;
        }
        case "新增空白文字檔": {
          const created = await apiCreateFile(
            dirPath,
            `new_file_${Date.now().toString().slice(-4)}.txt`
          );
          triggerRefresh();
          setTabSelection(pane, [created], created);
          setInlineRenameTargetPath(created);
          break;
        }
        case "強制重新整理 (清除此目錄快取)":
          triggerRefresh();
          break;
        case "貼上至目前目錄 (佇列傳輸)":
        case "貼上至目前目錄":
          await executePasteToDir(dirPath);
          break;
        case "重新命名":
          if (entry) setInlineRenameTargetPath(entry.path);
          break;
        case "複製完整路徑至剪貼簿":
          if (entry) {
            await navigator.clipboard.writeText(entry.path);
            notify(`已複製路徑：${entry.path}`);
          }
          break;
        case "在系統原生檔案總管中顯示":
          if (entry) await apiRevealInShell(entry.path);
          break;
        case "移至資源回收桶":
          if (sel.length > 0) {
            await apiEnqueueTransfer(
              "trash",
              sel.map((s) => s.path),
              null,
              conflictStrategy
            );
            setShowQueueDrawer(true);
            notify(`已排入佇列：移至資源回收桶 (${sel.length} 項)`);
          }
          break;
        case "永久刪除 (無法復原)":
          if (sel.length > 0) {
            await apiEnqueueTransfer(
              "delete",
              sel.map((s) => s.path),
              null,
              conflictStrategy
            );
            setShowQueueDrawer(true);
            notify(`已排入佇列：永久刪除 (${sel.length} 項)`);
          }
          break;
        default: {
          if (action.startsWith("複製")) {
            setClipboard({ mode: "copy", paths: sel.map((s) => s.path) });
            notify(`已複製 ${sel.length} 個項目`);
          } else if (action.startsWith("剪下")) {
            setClipboard({ mode: "cut", paths: sel.map((s) => s.path) });
            notify(`已剪下 ${sel.length} 個項目`);
          } else if (action.includes("批次重新命名")) {
            setBatchRenameTargets(sel);
            setBatchRenameModalOpen(true);
          } else if (action.includes("壓縮")) {
            if (sel.length > 0) {
              const baseName =
                sel.length === 1 ? `${sel[0].name}.zip` : `Archive_${Date.now()}.zip`;
              const outZip = `${dirPath.replace(/\/+$/, "")}/${baseName}`;
              notify(`正在壓縮為 ${baseName}...`);
              await apiCompressToZip(
                sel.map((s) => s.path),
                outZip
              );
              triggerRefresh();
              notify(`已建立壓縮檔：${baseName}`);
            }
          }
          break;
        }
      }
    } catch (err) {
      notify(`操作失敗: ${String(err)}`);
    }
  };

  const runningJobsCount = transferJobs.filter(
    (j) => j.status === "running" || j.status === "scanning" || j.status === "queued"
  ).length;

  return (
    <div
      style={{ fontFamily: fontSettings.fontFamily }}
      className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none"
    >
      {/* 頂部全域功能列 */}
      <header className="h-11 px-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0 text-xs">
        {/* 左側品牌與快速工具 */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-2 py-1 rounded-md bg-blue-600/15 border border-blue-500/30 text-blue-400 font-semibold">
            <FolderKanban size={16} />
            <span>Rust File Manager</span>
          </div>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            type="button"
            disabled={selectedEntries.length === 0}
            onClick={() => executeShortcutAction("copy_selected")}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-40"
            title="複製 (Ctrl+C)"
          >
            <Copy size={13} />
            <span>複製</span>
          </button>
          <button
            type="button"
            disabled={selectedEntries.length === 0}
            onClick={() => executeShortcutAction("cut_selected")}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-40"
            title="剪下 (Ctrl+X)"
          >
            <Scissors size={13} />
            <span>剪下</span>
          </button>
          <button
            type="button"
            disabled={!clipboard}
            onClick={() => executeShortcutAction("paste_items")}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-emerald-400 disabled:opacity-40"
            title="貼上至目前目錄 (Ctrl+V)"
          >
            <ClipboardPaste size={13} />
            <span>
              貼上{clipboard ? ` (${clipboard.paths.length})` : ""}
            </span>
          </button>

          <button
            type="button"
            disabled={selectedEntries.length === 0}
            onClick={() => executeShortcutAction("trash_selected")}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-500/20 text-rose-400 disabled:opacity-40"
            title="移至資源回收桶 (Delete)"
          >
            <Trash2 size={13} />
            <span>刪除</span>
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <button
            type="button"
            onClick={() => executeShortcutAction("batch_rename")}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 font-medium"
            title="批次重新命名工具 (Ctrl+Shift+R 或多選時按 F2)"
          >
            <Wand2 size={13} />
            <span>批次重新命名</span>
          </button>

          {lastUndoRenamePairs.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const count = await apiUndoBatchRename(lastUndoRenamePairs);
                  setLastUndoRenamePairs([]);
                  triggerRefresh();
                  notify(`已成功復原 ${count} 個檔案的原始名稱`);
                } catch (err) {
                  notify(`復原失敗: ${String(err)}`);
                }
              }}
              className="flex items-center gap-1 px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300"
              title="復原上一次的批次重新命名"
            >
              <RotateCcw size={13} />
              <span>復原批次改名</span>
            </button>
          )}
        </div>

        {/* 右側字體大小快捷微調、雙欄切換、任務佇列與設定 */}
        <div className="flex items-center gap-1.5">
          {/* 字體大小快速微調 (同時微調檔案列表與全域 UI 字體) */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-md px-1.5 py-0.5 gap-1">
            <Type size={13} className="text-slate-400" />
            <button
              type="button"
              onClick={() =>
                updateFontSettings({
                  fontSizePx: Math.max(11, fontSettings.fontSizePx - 1),
                  uiFontSizePx: Math.max(
                    11,
                    (fontSettings.uiFontSizePx || 14) - 1
                  ),
                })
              }
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-mono"
              title="同時縮小檔案列表與 UI 介面字體"
            >
              A-
            </button>
            <span
              className="text-[11px] font-mono text-blue-400 px-1"
              title={`檔案列表: ${fontSettings.fontSizePx}px / UI 介面: ${
                fontSettings.uiFontSizePx || 14
              }px`}
            >
              {fontSettings.fontSizePx}px
            </span>
            <button
              type="button"
              onClick={() =>
                updateFontSettings({
                  fontSizePx: Math.min(24, fontSettings.fontSizePx + 1),
                  uiFontSizePx: Math.min(
                    22,
                    (fontSettings.uiFontSizePx || 14) + 1
                  ),
                })
              }
              className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-300 font-mono"
              title="同時放大檔案列表與 UI 介面字體"
            >
              A+
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowHiddenFiles(!showHiddenFiles)}
            className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
              showHiddenFiles
                ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="顯示/隱藏系統隱藏檔 (Ctrl+H)"
          >
            {showHiddenFiles ? <Eye size={13} /> : <EyeOff size={13} />}
            <span className="hidden lg:inline">隱藏檔</span>
          </button>

          <button
            type="button"
            onClick={() => setDualPaneEnabled(!dualPaneEnabled)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded border transition-colors ${
              dualPaneEnabled
                ? "bg-emerald-600/20 border-emerald-500/50 text-emerald-300"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="切換雙欄指揮官模式 (F6)"
          >
            <Columns size={13} />
            <span>雙欄並排</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPreviewPanel(!showPreviewPanel)}
            className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
              showPreviewPanel
                ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
            }`}
            title="顯示/隱藏右側預覽與雜湊面板"
          >
            <PanelRight size={13} />
            <span className="hidden xl:inline">預覽欄</span>
          </button>

          <button
            type="button"
            onClick={() => setShowQueueDrawer(!showQueueDrawer)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors ${
              runningJobsCount > 0
                ? "bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse"
                : showQueueDrawer
                ? "bg-blue-600/20 border-blue-500/50 text-blue-300"
                : "bg-slate-950 border-slate-800 text-slate-300"
            }`}
            title="開啟 / 關閉背景傳輸佇列懸浮視窗 (Ctrl+Q)"
          >
            <Activity size={13} />
            <span>佇列 ({transferJobs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => executeShortcutAction("open_terminal")}
            className="p-1.5 rounded bg-slate-950 border border-slate-800 hover:border-slate-700 text-cyan-400"
            title="在目前目錄開啟終端機 (Ctrl+`)"
          >
            <Terminal size={14} />
          </button>

          <button
            type="button"
            onClick={() => {
              setSettingsInitialTab("appearance");
              setSettingsModalOpen(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium"
            title="開啟字體設定與自訂鍵盤快速鍵"
          >
            <Settings size={13} />
            <span>設定與快捷鍵</span>
          </button>
        </div>
      </header>

      {/* 主工作區：左側邊欄 + 單/雙欄虛擬列表 + 右側預覽面板 */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        <Sidebar
          systemLocations={systemLocations}
          onDropFilesToDir={async (targetDirPath) => {
            if (!dragPayload || dragPayload.paths.length === 0) return;
            const sources = dragPayload.paths;
            setDragPayload(null);
            if (conflictStrategy === "ask") {
              const conflicts = await apiCheckTransferConflicts(
                sources,
                targetDirPath
              );
              if (conflicts.length > 0) {
                setPendingConflictPrompt({
                  jobType: "move",
                  sources,
                  destination: targetDirPath,
                  conflicts,
                });
                return;
              }
            }
            await apiEnqueueTransfer(
              "move",
              sources,
              targetDirPath,
              conflictStrategy
            );
            setShowQueueDrawer(true);
            notify(`已排入佇列：搬移 ${sources.length} 個項目至 ${targetDirPath}`);
          }}
        />

        <main className="flex-1 flex min-w-0 h-full overflow-hidden">
          <FilePane
            pane="left"
            searchInputRef={leftSearchRef}
            inlineRenameTargetPath={
              activePane === "left" ? inlineRenameTargetPath : null
            }
            onSetInlineRenameTarget={setInlineRenameTargetPath}
            onOpenContextMenu={(e, p, entry, sel, dirPath) =>
              setContextMenu({
                visible: true,
                x: e.clientX,
                y: e.clientY,
                pane: p,
                targetEntry: entry,
                selectedEntries: sel,
                currentDirPath: dirPath,
              })
            }
            onEntriesLoaded={handleEntriesLoaded}
            onNotify={notify}
          />

          {dualPaneEnabled && (
            <FilePane
              pane="right"
              searchInputRef={rightSearchRef}
              inlineRenameTargetPath={
                activePane === "right" ? inlineRenameTargetPath : null
              }
              onSetInlineRenameTarget={setInlineRenameTargetPath}
              onOpenContextMenu={(e, p, entry, sel, dirPath) =>
                setContextMenu({
                  visible: true,
                  x: e.clientX,
                  y: e.clientY,
                  pane: p,
                  targetEntry: entry,
                  selectedEntries: sel,
                  currentDirPath: dirPath,
                })
              }
              onEntriesLoaded={handleEntriesLoaded}
              onNotify={notify}
            />
          )}
        </main>

        {showPreviewPanel && (
          <PreviewPanel
            selectedPath={
              selectedEntries.length === 1 ? selectedEntries[0].path : null
            }
            onNotify={notify}
          />
        )}
      </div>

      {/* 底部佇列面板 */}
      <QueueDrawer />

      {/* 通知 Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-slate-900/95 border border-blue-500/50 text-xs text-white shadow-2xl flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* 右鍵功能選單 */}
      <ContextMenu
        menu={contextMenu}
        hasClipboard={Boolean(clipboard && clipboard.paths.length > 0)}
        onClose={() => setContextMenu((prev) => ({ ...prev, visible: false }))}
        onAction={handleContextMenuAction}
      />

      {/* 批次重新命名工具視窗 */}
      <BatchRenameModal
        visible={batchRenameModalOpen}
        entries={batchRenameTargets}
        onClose={() => setBatchRenameModalOpen(false)}
        onSuccess={(msg) => notify(msg)}
      />

      {/* 字形、字體大小與自訂快捷鍵設定視窗 */}
      <SettingsModal
        visible={settingsModalOpen}
        initialTab={settingsInitialTab}
        onClose={() => setSettingsModalOpen(false)}
        onNotify={notify}
      />

      {/* 同名檔案衝突詢問對話框 */}
      <ConflictDialogModal onNotify={notify} />
    </div>
  );
};
