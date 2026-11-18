import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  RefreshCw,
  Search,
  FolderPlus,
  FilePlus,
  LayoutList,
  LayoutGrid,
  ArrowUpDown,
  Zap,
  Check,
  X,
} from "lucide-react";
import {
  apiCreateDirectory,
  apiCreateFile,
  apiEnqueueTransfer,
  apiOpenItem,
  apiReadDirectory,
  apiRenameItem,
} from "../api";
import { useAppStore } from "../store/useAppStore";
import { formatBytes, formatDateTime } from "../utils/formatters";
import { FileEntryIcon } from "./FileEntryIcon";
import { TabBar } from "./TabBar";
import type {
  DirectoryListing,
  FileEntry,
  PaneId,
  SortField,
} from "../types";

interface FilePaneProps {
  pane: PaneId;
  searchInputRef?: React.RefObject<HTMLInputElement>;
  inlineRenameTargetPath: string | null;
  onSetInlineRenameTarget: (path: string | null) => void;
  onOpenContextMenu: (
    e: React.MouseEvent,
    pane: PaneId,
    entry: FileEntry | null,
    selectedEntries: FileEntry[],
    currentDirPath: string
  ) => void;
  onEntriesLoaded?: (pane: PaneId, entries: FileEntry[]) => void;
  onNotify: (msg: string) => void;
}

export const FilePane: React.FC<FilePaneProps> = ({
  pane,
  searchInputRef,
  inlineRenameTargetPath,
  onSetInlineRenameTarget,
  onOpenContextMenu,
  onEntriesLoaded,
  onNotify,
}) => {
  const paneState = useAppStore((s) => s.panes[pane]);
  const activePane = useAppStore((s) => s.activePane);
  const setActivePane = useAppStore((s) => s.setActivePane);
  const showHiddenFiles = useAppStore((s) => s.showHiddenFiles);
  const fontSettings = useAppStore((s) => s.fontSettings);
  const conflictStrategy = useAppStore((s) => s.conflictStrategy);
  const dragPayload = useAppStore((s) => s.dragPayload);
  const setDragPayload = useAppStore((s) => s.setDragPayload);
  const setShowQueueDrawer = useAppStore((s) => s.setShowQueueDrawer);
  const refreshVersion = useAppStore((s) => s.refreshVersion);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const navigateTab = useAppStore((s) => s.navigateTab);
  const addTab = useAppStore((s) => s.addTab);
  const goBack = useAppStore((s) => s.goBack);
  const goForward = useAppStore((s) => s.goForward);
  const setTabSort = useAppStore((s) => s.setTabSort);
  const setTabViewMode = useAppStore((s) => s.setTabViewMode);
  const setTabFilterQuery = useAppStore((s) => s.setTabFilterQuery);
  const setTabSelection = useAppStore((s) => s.setTabSelection);

  const activeTab = useMemo(
    () =>
      paneState.tabs.find((t) => t.id === paneState.activeTabId) ||
      paneState.tabs[0],
    [paneState.tabs, paneState.activeTabId]
  );

  const [listing, setListing] = useState<DirectoryListing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState(false);
  const [pathInput, setPathInput] = useState(activeTab?.path || "");
  const [inlineNameValue, setInlineNameValue] = useState("");
  const [creatingMode, setCreatingMode] = useState<"folder" | "file" | null>(
    null
  );
  const [newEntryName, setNewEntryName] = useState("");
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [dragOverPaneBg, setDragOverPaneBg] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);

  const loadDirectory = useCallback(
    async (targetPath: string, force = false) => {
      if (!targetPath) return;
      setLoading(true);
      setError(null);
      try {
        const res = await apiReadDirectory(targetPath, force);
        setListing(res);
        setPathInput(res.path);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeTab?.path) {
      loadDirectory(activeTab.path, false);
    }
  }, [activeTab?.path, refreshVersion, loadDirectory]);

  // 過濾與排序後的檔案列表
  const processedEntries = useMemo(() => {
    if (!listing) return [];
    const q = (activeTab?.filterQuery || "").trim().toLowerCase();
    const filtered = listing.entries.filter((item) => {
      if (!showHiddenFiles && item.isHidden) return false;
      if (q && !item.name.toLowerCase().includes(q)) return false;
      return true;
    });

    const sortField = activeTab?.sortField || "name";
    const sortDir = activeTab?.sortDirection === "desc" ? -1 : 1;

    return [...filtered].sort((a, b) => {
      // 資料夾永遠置頂
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      switch (sortField) {
        case "size":
          return (a.size - b.size) * sortDir;
        case "modifiedMs":
          return (a.modifiedMs - b.modifiedMs) * sortDir;
        case "extension":
          return (
            a.extension.localeCompare(b.extension, undefined, {
              sensitivity: "base",
            }) * sortDir
          );
        case "name":
        default:
          return (
            a.name.localeCompare(b.name, undefined, {
              numeric: true,
              sensitivity: "base",
            }) * sortDir
          );
      }
    });
  }, [
    listing,
    showHiddenFiles,
    activeTab?.filterQuery,
    activeTab?.sortField,
    activeTab?.sortDirection,
  ]);

  useEffect(() => {
    onEntriesLoaded?.(pane, processedEntries);
  }, [pane, processedEntries, onEntriesLoaded]);

  // 啟動虛擬捲動器 (@tanstack/react-virtual)，支援數萬筆檔案零卡頓
  const rowVirtualizer = useVirtualizer({
    count: processedEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => fontSettings.rowHeightPx,
    overscan: 18,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [fontSettings.rowHeightPx, rowVirtualizer]);

  // 當觸發單筆 F2 原地改名時，初始化輸入框文字
  useEffect(() => {
    if (inlineRenameTargetPath && listing) {
      const target = listing.entries.find(
        (e) => e.path === inlineRenameTargetPath
      );
      if (target) {
        setInlineNameValue(target.name);
      }
    }
  }, [inlineRenameTargetPath, listing]);

  const selectedSet = useMemo(
    () => new Set(activeTab?.selectedPaths || []),
    [activeTab?.selectedPaths]
  );

  const handleRowClick = (e: React.MouseEvent, entry: FileEntry, index: number) => {
    e.stopPropagation();
    setActivePane(pane);

    // Ctrl + 左鍵點擊目錄：直接在新分頁開啟該目錄
    if ((e.ctrlKey || e.metaKey) && e.altKey && entry.isDir) {
      addTab(pane, entry.path);
      return;
    }

    const currentSelected = activeTab?.selectedPaths || [];
    const lastPath = activeTab?.lastSelectedPath;

    if (e.shiftKey && lastPath) {
      const lastIdx = processedEntries.findIndex((item) => item.path === lastPath);
      if (lastIdx !== -1) {
        const start = Math.min(lastIdx, index);
        const end = Math.max(lastIdx, index);
        const rangePaths = processedEntries.slice(start, end + 1).map((i) => i.path);
        setTabSelection(pane, rangePaths, lastPath);
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      const exists = selectedSet.has(entry.path);
      const next = exists
        ? currentSelected.filter((p) => p !== entry.path)
        : [...currentSelected, entry.path];
      setTabSelection(pane, next, entry.path);
    } else {
      setTabSelection(pane, [entry.path], entry.path);
    }
  };

  const handleRowDoubleClick = async (entry: FileEntry) => {
    setActivePane(pane);
    if (entry.isDir) {
      navigateTab(pane, entry.path);
    } else {
      try {
        await apiOpenItem(entry.path);
      } catch (err) {
        onNotify(`開啟失敗: ${String(err)}`);
      }
    }
  };

  const commitInlineRename = async (entry: FileEntry) => {
    const trimmed = inlineNameValue.trim();
    onSetInlineRenameTarget(null);
    if (!trimmed || trimmed === entry.name) return;
    try {
      const newPath = await apiRenameItem(entry.path, trimmed);
      setTabSelection(pane, [newPath], newPath);
      await loadDirectory(activeTab.path, true);
      onNotify(`已重新命名為「${trimmed}」`);
    } catch (err) {
      onNotify(`重新命名失敗: ${String(err)}`);
    }
  };

  const commitCreateNew = async () => {
    const name = newEntryName.trim();
    const mode = creatingMode;
    setCreatingMode(null);
    setNewEntryName("");
    if (!name || !activeTab?.path) return;
    try {
      const createdPath =
        mode === "folder"
          ? await apiCreateDirectory(activeTab.path, name)
          : await apiCreateFile(activeTab.path, name);
      setTabSelection(pane, [createdPath], createdPath);
      await loadDirectory(activeTab.path, true);
      onNotify(`已建立${mode === "folder" ? "資料夾" : "檔案"}「${name}」`);
    } catch (err) {
      onNotify(`建立失敗: ${String(err)}`);
    }
  };

  // 處理拖拉放開 (Drop)：支援拖入子資料夾、跨分頁拖曳或跨面板拖曳（按住 Ctrl 為複製，預設為搬移或跨欄複製）
  const handleDropToDestination = async (
    destDirPath: string,
    isCopyModifier: boolean
  ) => {
    if (!dragPayload || dragPayload.paths.length === 0) return;
    // 過濾掉與目標目錄完全相同的路徑
    const validSources = dragPayload.paths.filter((p) => p !== destDirPath);
    setDragPayload(null);
    setDragOverFolder(null);
    setDragOverPaneBg(false);
    if (validSources.length === 0) return;

    const jobType = isCopyModifier ? "copy" : "move";
    try {
      await apiEnqueueTransfer(
        jobType,
        validSources,
        destDirPath,
        conflictStrategy
      );
      setShowQueueDrawer(true);
      onNotify(
        `已排入佇列：${jobType === "copy" ? "複製" : "搬移"} ${
          validSources.length
        } 個項目至 ${destDirPath}`
      );
      setTimeout(() => triggerRefresh(), 250);
    } catch (err) {
      onNotify(`拖拉佇列失敗: ${String(err)}`);
    }
  };

  // 拆解麵包屑導覽路徑
  const breadcrumbs = useMemo(() => {
    const p = activeTab?.path || "";
    const parts = p.split("/").filter(Boolean);
    const crumbs: { label: string; fullPath: string }[] = [];
    let acc = "";
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === 0 && part.endsWith(":")) {
        acc = `${part}/`;
      } else {
        acc = acc.endsWith("/") ? `${acc}${part}` : `${acc}/${part}`;
      }
      crumbs.push({ label: part, fullPath: acc });
    }
    return crumbs;
  }, [activeTab?.path]);

  const isFocused = activePane === pane;

  return (
    <div
      onClick={() => setActivePane(pane)}
      className={`flex-1 flex flex-col min-w-0 h-full overflow-hidden border-r border-slate-800 transition-colors ${
        isFocused ? "bg-slate-950" : "bg-slate-950/60"
      }`}
    >
      {/* 分頁列 (支援顏色標記、鎖定防關、拖入分頁傳檔) */}
      <TabBar
        pane={pane}
        onDropFilesToTab={(targetPath) =>
          handleDropToDestination(targetPath, false)
        }
      />

      {/* 導覽與工具列 */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-900/90 border-b border-slate-800 text-xs">
        <button
          type="button"
          disabled={!activeTab || activeTab.historyIndex <= 0}
          onClick={() => goBack(pane)}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30"
          title="上一頁 (Alt+Left)"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          disabled={
            !activeTab || activeTab.historyIndex >= activeTab.history.length - 1
          }
          onClick={() => goForward(pane)}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30"
          title="下一頁 (Alt+Right)"
        >
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          disabled={!listing?.parentPath}
          onClick={() => {
            if (listing?.parentPath) navigateTab(pane, listing.parentPath);
          }}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30"
          title="上一層目錄 (Backspace)"
        >
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          onClick={() => loadDirectory(activeTab.path, true)}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
          title="重新整理並更新快取 (F5)"
        >
          <RefreshCw size={14} className={loading ? "animate-spin text-blue-400" : ""} />
        </button>

        {/* 麵包屑 / 可直接輸入路徑列 */}
        <div
          onClick={() => setEditingPath(true)}
          className="flex-1 flex items-center bg-slate-950 border border-slate-700/80 hover:border-slate-600 rounded-md px-2.5 py-1 min-w-0 cursor-text"
        >
          {editingPath ? (
            <input
              type="text"
              autoFocus
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              onBlur={() => setEditingPath(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setEditingPath(false);
                  if (pathInput.trim()) navigateTab(pane, pathInput.trim());
                } else if (e.key === "Escape") {
                  setEditingPath(false);
                  setPathInput(activeTab.path);
                }
              }}
              className="w-full bg-transparent text-white font-mono text-xs focus:outline-none"
            />
          ) : (
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar w-full">
              {breadcrumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.fullPath}>
                  {idx > 0 && <span className="text-slate-600">/</span>}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigateTab(pane, crumb.fullPath);
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDropToDestination(
                        crumb.fullPath,
                        e.ctrlKey || e.metaKey
                      );
                    }}
                    className="px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-200 hover:text-blue-400 shrink-0 font-medium"
                  >
                    {crumb.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* 快取與讀取耗時徽章 */}
          {listing && !editingPath && (
            <span
              className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono flex items-center gap-1 shrink-0 ${
                listing.fromCache
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-slate-800 text-slate-400"
              }`}
              title={
                listing.fromCache
                  ? "命中 Rust LRU 記憶體快取 (0ms)"
                  : `Rust Rayon 多執行緒掃描耗時 ${listing.elapsedMs}ms`
              }
            >
              <Zap size={10} />
              {listing.fromCache ? "CACHE" : `${listing.elapsedMs}ms`}
            </span>
          )}
        </div>

        {/* 即時過濾搜尋框 */}
        <div className="relative w-44">
          <Search
            size={13}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          />
          <input
            ref={searchInputRef}
            type="text"
            value={activeTab?.filterQuery || ""}
            onChange={(e) => setTabFilterQuery(pane, e.target.value)}
            placeholder="快速過濾 (Ctrl+F)..."
            className="w-full pl-7 pr-6 py-1 rounded-md bg-slate-950 border border-slate-700/80 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
          {activeTab?.filterQuery && (
            <button
              type="button"
              onClick={() => setTabFilterQuery(pane, "")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* 快速建立與檢視切換按鈕 */}
        <button
          type="button"
          onClick={() => {
            setCreatingMode("folder");
            setNewEntryName("新資料夾");
          }}
          className="p-1.5 rounded hover:bg-slate-800 text-amber-400"
          title="新增資料夾 (Ctrl+Shift+N)"
        >
          <FolderPlus size={15} />
        </button>
        <button
          type="button"
          onClick={() => {
            setCreatingMode("file");
            setNewEntryName("new_file.txt");
          }}
          className="p-1.5 rounded hover:bg-slate-800 text-sky-400"
          title="新增空白檔案"
        >
          <FilePlus size={15} />
        </button>
        <button
          type="button"
          onClick={() =>
            setTabViewMode(
              pane,
              activeTab?.viewMode === "grid" ? "details" : "grid"
            )
          }
          className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
          title="切換詳細列表 / 網格檢視"
        >
          {activeTab?.viewMode === "grid" ? (
            <LayoutList size={15} />
          ) : (
            <LayoutGrid size={15} />
          )}
        </button>
      </div>

      {/* 新增資料夾 / 檔案快速輸入列 */}
      {creatingMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-950/40 border-b border-blue-500/40 text-xs">
          <span className="text-blue-300 font-medium">
            建立{creatingMode === "folder" ? "新資料夾" : "新檔案"}：
          </span>
          <input
            type="text"
            autoFocus
            value={newEntryName}
            onChange={(e) => setNewEntryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitCreateNew();
              if (e.key === "Escape") setCreatingMode(null);
            }}
            className="px-2.5 py-1 rounded bg-slate-900 border border-blue-500 text-white focus:outline-none"
          />
          <button
            type="button"
            onClick={commitCreateNew}
            className="p-1 rounded bg-blue-600 hover:bg-blue-500 text-white"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={() => setCreatingMode(null)}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 欄位標題列 (Details 模式) */}
      {activeTab?.viewMode !== "grid" && (
        <div className="grid grid-cols-12 px-3 py-1.5 bg-slate-900/60 border-b border-slate-800 text-[11px] font-medium text-slate-400 select-none">
          {(
            [
              { field: "name", label: "名稱 (Name)", span: "col-span-6" },
              { field: "size", label: "大小 (Size)", span: "col-span-2 text-right pr-4" },
              { field: "extension", label: "類型 (Type)", span: "col-span-1" },
              { field: "modifiedMs", label: "修改日期 (Modified)", span: "col-span-3" },
            ] as { field: SortField; label: string; span: string }[]
          ).map((col) => (
            <div
              key={col.field}
              onClick={() => setTabSort(pane, col.field)}
              className={`${col.span} flex items-center gap-1 cursor-pointer hover:text-slate-200 ${
                col.field === "size" ? "justify-end" : ""
              }`}
            >
              <span>{col.label}</span>
              {activeTab?.sortField === col.field && (
                <ArrowUpDown
                  size={11}
                  className={
                    activeTab.sortDirection === "asc"
                      ? "text-blue-400"
                      : "text-amber-400"
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* 檔案列表主視窗 (Virtual Scrolling + Drag & Drop + Context Menu) */}
      <div
        ref={parentRef}
        onClick={() => setTabSelection(pane, [], null)}
        onContextMenu={(e) => {
          e.preventDefault();
          setActivePane(pane);
          onOpenContextMenu(e, pane, null, [], activeTab?.path || "");
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverPaneBg(true);
        }}
        onDragLeave={() => setDragOverPaneBg(false)}
        onDrop={(e) => {
          e.preventDefault();
          if (activeTab?.path) {
            handleDropToDestination(activeTab.path, e.ctrlKey || e.metaKey);
          }
        }}
        style={{
          fontFamily: fontSettings.fontFamily,
          fontSize: `${fontSettings.fontSizePx}px`,
        }}
        className={`flex-1 overflow-y-auto relative ${
          dragOverPaneBg ? "ring-2 ring-inset ring-blue-500/60 bg-blue-500/5" : ""
        }`}
      >
        {error ? (
          <div className="p-6 text-center text-rose-400 text-xs">{error}</div>
        ) : processedEntries.length === 0 && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs">
            <p>此目錄目前沒有符合條件的項目</p>
            <p className="text-[11px] mt-1">
              可將檔案拖拉至此處，或點擊滑鼠右鍵新增檔案/資料夾
            </p>
          </div>
        ) : activeTab?.viewMode === "grid" ? (
          /* 網格檢視模式 */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5 p-3">
            {processedEntries.map((entry, index) => {
              const isSelected = selectedSet.has(entry.path);
              return (
                <div
                  key={entry.path}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    const paths = isSelected
                      ? activeTab.selectedPaths
                      : [entry.path];
                    setDragPayload({ sourcePane: pane, paths });
                    e.dataTransfer.setData("text/plain", paths.join("\n"));
                  }}
                  onDragOver={(e) => {
                    if (entry.isDir) {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverFolder(entry.path);
                    }
                  }}
                  onDragLeave={() => setDragOverFolder(null)}
                  onDrop={(e) => {
                    if (entry.isDir) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDropToDestination(
                        entry.path,
                        e.ctrlKey || e.metaKey
                      );
                    }
                  }}
                  onClick={(e) => handleRowClick(e, entry, index)}
                  onDoubleClick={() => handleRowDoubleClick(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActivePane(pane);
                    let selEntries = processedEntries.filter((item) =>
                      selectedSet.has(item.path)
                    );
                    if (!selectedSet.has(entry.path)) {
                      setTabSelection(pane, [entry.path], entry.path);
                      selEntries = [entry];
                    }
                    onOpenContextMenu(
                      e,
                      pane,
                      entry,
                      selEntries,
                      activeTab.path
                    );
                  }}
                  className={`flex flex-col items-center p-3 rounded-lg border text-center cursor-pointer transition-all ${
                    dragOverFolder === entry.path
                      ? "ring-2 ring-amber-400 bg-amber-500/20 border-amber-400"
                      : isSelected
                      ? "bg-blue-600/25 border-blue-500 text-white"
                      : "bg-slate-900/40 border-slate-800/80 hover:bg-slate-800/60 text-slate-200"
                  }`}
                >
                  <FileEntryIcon kind={entry.kind} size={32} />
                  <span className="mt-2 w-full truncate text-xs font-medium">
                    {entry.name}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">
                    {entry.isDir ? "資料夾" : formatBytes(entry.size)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          /* 高效能虛擬滾動詳細列表模式 (@tanstack/react-virtual) */
          <div
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const entry = processedEntries[virtualRow.index];
              const isSelected = selectedSet.has(entry.path);
              const isRenaming = inlineRenameTargetPath === entry.path;
              const isDropTarget = dragOverFolder === entry.path;

              return (
                <div
                  key={entry.path}
                  draggable={!isRenaming}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    const paths = isSelected
                      ? activeTab.selectedPaths
                      : [entry.path];
                    setDragPayload({ sourcePane: pane, paths });
                    e.dataTransfer.setData("text/plain", paths.join("\n"));
                  }}
                  onDragOver={(e) => {
                    if (entry.isDir) {
                      e.preventDefault();
                      e.stopPropagation();
                      setDragOverFolder(entry.path);
                    }
                  }}
                  onDragLeave={() => {
                    if (dragOverFolder === entry.path) setDragOverFolder(null);
                  }}
                  onDrop={(e) => {
                    if (entry.isDir) {
                      e.preventDefault();
                      e.stopPropagation();
                      handleDropToDestination(
                        entry.path,
                        e.ctrlKey || e.metaKey
                      );
                    }
                  }}
                  onClick={(e) => handleRowClick(e, entry, virtualRow.index)}
                  onDoubleClick={() => handleRowDoubleClick(entry)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActivePane(pane);
                    let selEntries = processedEntries.filter((item) =>
                      selectedSet.has(item.path)
                    );
                    if (!selectedSet.has(entry.path)) {
                      setTabSelection(pane, [entry.path], entry.path);
                      selEntries = [entry];
                    }
                    onOpenContextMenu(
                      e,
                      pane,
                      entry,
                      selEntries,
                      activeTab.path
                    );
                  }}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  className={`grid grid-cols-12 items-center px-3 border-b border-slate-900/60 cursor-pointer transition-colors ${
                    isDropTarget
                      ? "bg-amber-500/25 ring-1 ring-amber-400 text-white"
                      : isSelected
                      ? "bg-blue-600/25 text-white"
                      : "hover:bg-slate-900/80 text-slate-200"
                  } ${entry.isHidden ? "opacity-60" : ""}`}
                >
                  {/* 名稱與圖示 */}
                  <div className="col-span-6 flex items-center gap-2.5 min-w-0 pr-2">
                    <FileEntryIcon
                      kind={entry.kind}
                      size={Math.max(16, fontSettings.fontSizePx + 3)}
                    />
                    {isRenaming ? (
                      <input
                        type="text"
                        autoFocus
                        value={inlineNameValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setInlineNameValue(e.target.value)}
                        onBlur={() => commitInlineRename(entry)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") commitInlineRename(entry);
                          if (e.key === "Escape") onSetInlineRenameTarget(null);
                        }}
                        className="w-full px-2 py-0.5 rounded bg-slate-900 border border-blue-500 text-white focus:outline-none"
                      />
                    ) : (
                      <span className="truncate font-medium">{entry.name}</span>
                    )}
                  </div>

                  {/* 大小 */}
                  <div className="col-span-2 text-right pr-4 font-mono text-[0.88em] text-slate-400">
                    {entry.isDir ? "--" : formatBytes(entry.size)}
                  </div>

                  {/* 副檔名類型 */}
                  <div className="col-span-1 truncate text-[0.85em] text-slate-400 uppercase">
                    {entry.isDir ? "DIR" : entry.extension || "-"}
                  </div>

                  {/* 修改時間 */}
                  <div className="col-span-3 truncate font-mono text-[0.85em] text-slate-400">
                    {formatDateTime(entry.modifiedMs)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 面板底部狀態列 */}
      <div className="flex items-center justify-between px-3 py-1 bg-slate-900 border-t border-slate-800 text-[11px] text-slate-400 select-none">
        <div className="flex items-center gap-3">
          <span>
            目錄：<strong className="text-slate-200">{listing?.totalDirs ?? 0}</strong>
          </span>
          <span>
            檔案：<strong className="text-slate-200">{listing?.totalFiles ?? 0}</strong>
          </span>
          <span>
            顯示：<strong className="text-slate-200">{processedEntries.length}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          {selectedSet.size > 0 && (
            <span className="text-blue-400 font-medium">
              已選取 {selectedSet.size} 項
            </span>
          )}
          <span>總容量：{formatBytes(listing?.totalSize ?? 0)}</span>
        </div>
      </div>
    </div>
  );
};
