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
  apiCheckTransferConflicts,
  apiCreateDirectory,
  apiCreateFile,
  apiEnqueueTransfer,
  apiOpenItem,
  apiReadDirectory,
  apiRenameItem,
} from "../api";
import { useAppStore } from "../store/useAppStore";
import { formatBytes, formatDateTime, keyboardEventToCombo } from "../utils/formatters";
import { findTypeAheadMatchIndex, isTypeAheadKey } from "../utils/typeAhead";
import {
  computeKeyboardNavigation,
  isKeyboardNavigationKey,
} from "../utils/keyboardNavigation";
import {
  calculateMarqueeBox,
  getDetailsIntersectedIndices,
  computeMarqueeSelection,
  MarqueeBox,
  MarqueeModifierMode,
} from "../utils/marquee";
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
  const keybindings = useAppStore((s) => s.keybindings);
  const conflictStrategy = useAppStore((s) => s.conflictStrategy);
  const setPendingConflictPrompt = useAppStore(
    (s) => s.setPendingConflictPrompt
  );
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
  const [renameSelectionStage, setRenameSelectionStage] = useState<
    "stem" | "ext" | "all"
  >("stem");
  const [creatingMode, setCreatingMode] = useState<"folder" | "file" | null>(
    null
  );
  const [newEntryName, setNewEntryName] = useState("");
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [dragOverPaneBg, setDragOverPaneBg] = useState(false);

  const parentRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  // 打字跳轉 (Type-to-Select) 狀態
  const typeAheadBufferRef = useRef("");
  const [typeAheadBadge, setTypeAheadBadge] = useState<string | null>(null);
  const typeAheadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTypeAhead = useCallback(() => {
    typeAheadBufferRef.current = "";
    setTypeAheadBadge(null);
    if (typeAheadTimerRef.current) {
      clearTimeout(typeAheadTimerRef.current);
      typeAheadTimerRef.current = null;
    }
  }, []);

  // 鍵盤游標與連續選取錨點狀態
  const navAnchorRef = useRef<{
    anchorPath: string;
    cursorPath: string;
  } | null>(null);

  useEffect(() => {
    navAnchorRef.current = null;
  }, [activeTab?.path]);

  // 動態偵測網格檢視每列包含的卡片欄數
  const getGridColumns = useCallback((): number => {
    if (activeTab?.viewMode !== "grid" || !parentRef.current) return 1;
    const cards = parentRef.current.querySelectorAll<HTMLElement>(
      "[data-file-grid-card='true']"
    );
    if (cards.length < 2) return 1;
    const firstTop = cards[0].offsetTop;
    for (let i = 1; i < cards.length; i++) {
      if (cards[i].offsetTop > firstTop) {
        return i;
      }
    }
    return cards.length;
  }, [activeTab?.viewMode]);

  // 滑鼠框選 (Marquee Selection) 狀態
  const [marqueeBox, setMarqueeBox] = useState<MarqueeBox | null>(null);
  const justFinishedMarqueeRef = useRef(false);
  const marqueeStateRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    initialSelectedPaths: string[];
    mode: MarqueeModifierMode;
  } | null>(null);

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

  // 依指定模式圈選原地改名輸入框範圍：
  // - "stem": 僅全選主檔名 (不含 .ext)
  // - "ext" : 僅全選副檔名 (不含 .)
  // - "all" : 全選完整名稱 (主檔名 + .ext)
  const applyInlineSelection = useCallback(
    (
      inputEl: HTMLInputElement | null,
      text: string,
      isDir: boolean,
      stage: "stem" | "ext" | "all"
    ) => {
      if (!inputEl) return;
      inputEl.focus();
      const lastDot = !isDir ? text.lastIndexOf(".") : -1;
      const hasValidExt = lastDot > 0 && lastDot < text.length - 1;

      if (!hasValidExt || stage === "all") {
        inputEl.setSelectionRange(0, text.length);
      } else if (stage === "stem") {
        inputEl.setSelectionRange(0, lastDot);
      } else if (stage === "ext") {
        inputEl.setSelectionRange(lastDot + 1, text.length);
      }
    },
    []
  );

  const renameShortcutCombo = useMemo(() => {
    const found = keybindings.find((k) => k.id === "rename_selected");
    return (found?.keyCombo || "F2").toLowerCase();
  }, [keybindings]);

  // 當觸發單筆 F2 原地改名時，初始化輸入框文字並預設選取「主檔名 (stem)」
  useEffect(() => {
    if (inlineRenameTargetPath && listing) {
      const target = listing.entries.find(
        (e) => e.path === inlineRenameTargetPath
      );
      if (target) {
        setInlineNameValue(target.name);
        setRenameSelectionStage("stem");
      }
    }
  }, [inlineRenameTargetPath, listing]);

  // 當 inlineNameValue 首次填入後，確保 DOM input value 已更新，再執行聚焦與圈選主檔名
  useEffect(() => {
    if (!inlineRenameTargetPath || !listing || !inlineNameValue) return;
    const target = listing.entries.find(
      (e) => e.path === inlineRenameTargetPath
    );
    if (!target || inlineNameValue !== target.name) return;

    const timer = setTimeout(() => {
      applyInlineSelection(
        inlineInputRef.current,
        target.name,
        target.isDir,
        "stem"
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [inlineRenameTargetPath, inlineNameValue, listing, applyInlineSelection]);

  const handleInlineRenameKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    entry: FileEntry
  ) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      commitInlineRename(entry);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setInlineNameValue("");
      onSetInlineRenameTarget(null);
      return;
    }

    // 正在改名時再次按下改名快速鍵 (預設 F2)：
    // 若有副檔名則循環切換：全選主檔名 (stem) -> 全選副檔名 (ext) -> 全選完整檔名 (all) -> 全選主檔名 (stem)
    const pressedCombo = keyboardEventToCombo(e).toLowerCase();
    if (pressedCombo === renameShortcutCombo) {
      e.preventDefault();
      const lastDot = !entry.isDir ? inlineNameValue.lastIndexOf(".") : -1;
      const hasValidExt = lastDot > 0 && lastDot < inlineNameValue.length - 1;

      if (!hasValidExt) {
        applyInlineSelection(
          e.currentTarget,
          inlineNameValue,
          entry.isDir,
          "all"
        );
        return;
      }

      const nextStage: "stem" | "ext" | "all" =
        renameSelectionStage === "stem"
          ? "ext"
          : renameSelectionStage === "ext"
          ? "all"
          : "stem";
      setRenameSelectionStage(nextStage);
      applyInlineSelection(
        e.currentTarget,
        inlineNameValue,
        entry.isDir,
        nextStage
      );
    }
  };

  const selectedSet = useMemo(
    () => new Set(activeTab?.selectedPaths || []),
    [activeTab?.selectedPaths]
  );

  const handleRowClick = (e: React.MouseEvent, entry: FileEntry, index: number) => {
    e.stopPropagation();
    setActivePane(pane);
    clearTypeAhead();

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
        navAnchorRef.current = {
          anchorPath: lastPath,
          cursorPath: entry.path,
        };
        return;
      }
    }

    if (e.ctrlKey || e.metaKey) {
      const exists = selectedSet.has(entry.path);
      const next = exists
        ? currentSelected.filter((p) => p !== entry.path)
        : [...currentSelected, entry.path];
      setTabSelection(pane, next, entry.path);
      navAnchorRef.current = {
        anchorPath: entry.path,
        cursorPath: entry.path,
      };
    } else {
      setTabSelection(pane, [entry.path], entry.path);
      navAnchorRef.current = {
        anchorPath: entry.path,
        cursorPath: entry.path,
      };
    }
  };

  const handleRowDoubleClick = async (entry: FileEntry) => {
    setActivePane(pane);
    navAnchorRef.current = null;
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
    setInlineNameValue("");
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
      if (conflictStrategy === "ask") {
        const conflicts = await apiCheckTransferConflicts(
          validSources,
          destDirPath
        );
        if (conflicts.length > 0) {
          setPendingConflictPrompt({
            jobType,
            sources: validSources,
            destination: destDirPath,
            conflicts,
          });
          return;
        }
      }
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

  // 切換分頁或更換目錄時清空打字跳轉狀態
  useEffect(() => {
    clearTypeAhead();
  }, [activeTab?.path, clearTypeAhead]);

  // 元件卸載時清理計時器
  useEffect(() => {
    return () => {
      if (typeAheadTimerRef.current) {
        clearTimeout(typeAheadTimerRef.current);
      }
    };
  }, []);

  // 監聽鍵盤事件以執行檔案光標移動 (Keyboard Cursor Navigation) 與打字跳轉 (Type-to-Select)
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (activePane !== pane) return;
      if (creatingMode || inlineRenameTargetPath) return;
      if (e.defaultPrevented) return;

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

      // 若有開啟全螢幕對話框 (如設定、詳細資訊、衝突提示等) 則不攔截鍵盤導覽
      if (document.querySelector(".fixed.inset-0.z-50")) {
        return;
      }

      if (e.key === "Escape") {
        clearTypeAhead();
        return;
      }

      // 方向鍵與游標移動導覽 (ArrowUp, ArrowDown, Home, End, PageUp, PageDown 等)
      if (
        isKeyboardNavigationKey(e.key) &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        clearTypeAhead();

        const currentSelectedPath =
          navAnchorRef.current?.cursorPath ||
          activeTab?.lastSelectedPath ||
          activeTab?.selectedPaths[0];

        const anchorPath =
          navAnchorRef.current?.anchorPath || activeTab?.lastSelectedPath;

        const pageSize = Math.max(
          1,
          Math.floor(
            (parentRef.current?.clientHeight || 400) /
              (activeTab?.viewMode === "grid" ? 140 : fontSettings.rowHeightPx)
          ) * (activeTab?.viewMode === "grid" ? getGridColumns() : 1)
        );

        const navResult = computeKeyboardNavigation({
          key: e.key,
          isShift: e.shiftKey,
          entries: processedEntries,
          currentSelectedPath,
          anchorPath,
          viewMode: activeTab?.viewMode,
          gridColumns: getGridColumns(),
          pageSize,
        });

        if (navResult) {
          e.preventDefault();
          navAnchorRef.current = {
            anchorPath: navResult.anchorPath,
            cursorPath: navResult.nextPath,
          };
          setTabSelection(pane, navResult.selectedPaths, navResult.nextPath);

          if (activeTab?.viewMode !== "grid") {
            rowVirtualizer.scrollToIndex(navResult.nextIndex, { align: "auto" });
          } else {
            const gridItems =
              parentRef.current?.querySelectorAll<HTMLElement>(
                "[data-grid-item-path]"
              );
            if (gridItems) {
              for (const item of gridItems) {
                if (
                  item.getAttribute("data-grid-item-path") === navResult.nextPath
                ) {
                  item.scrollIntoView({ block: "nearest", inline: "nearest" });
                  break;
                }
              }
            }
          }
          return;
        }
      }

      if (!isTypeAheadKey(e)) return;

      const char = e.key;
      let nextQuery = "";
      let isSingleRepeat = false;

      if (
        typeAheadBufferRef.current.length === 1 &&
        typeAheadBufferRef.current.toLowerCase() === char.toLowerCase()
      ) {
        isSingleRepeat = true;
        nextQuery = typeAheadBufferRef.current;
      } else {
        nextQuery = typeAheadBufferRef.current + char;
      }

      typeAheadBufferRef.current = nextQuery;
      setTypeAheadBadge(nextQuery);

      if (typeAheadTimerRef.current) {
        clearTimeout(typeAheadTimerRef.current);
      }
      typeAheadTimerRef.current = setTimeout(() => {
        typeAheadBufferRef.current = "";
        setTypeAheadBadge(null);
        typeAheadTimerRef.current = null;
      }, 1000);

      const currentSelectedPath =
        activeTab?.lastSelectedPath || activeTab?.selectedPaths[0];
      const currentIdx = currentSelectedPath
        ? processedEntries.findIndex((item) => item.path === currentSelectedPath)
        : -1;

      const matchIdx = findTypeAheadMatchIndex(
        processedEntries,
        nextQuery,
        currentIdx,
        isSingleRepeat
      );

      if (matchIdx !== -1) {
        const matched = processedEntries[matchIdx];
        navAnchorRef.current = {
          anchorPath: matched.path,
          cursorPath: matched.path,
        };
        setTabSelection(pane, [matched.path], matched.path);
        if (activeTab?.viewMode !== "grid") {
          rowVirtualizer.scrollToIndex(matchIdx, { align: "auto" });
        } else {
          const gridItems =
            parentRef.current?.querySelectorAll<HTMLElement>(
              "[data-grid-item-path]"
            );
          if (gridItems) {
            for (const item of gridItems) {
              if (item.getAttribute("data-grid-item-path") === matched.path) {
                item.scrollIntoView({ block: "nearest", inline: "nearest" });
                break;
              }
            }
          }
        }
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown);
    };
  }, [
    activePane,
    pane,
    creatingMode,
    inlineRenameTargetPath,
    processedEntries,
    activeTab,
    setTabSelection,
    rowVirtualizer,
    clearTypeAhead,
    fontSettings.rowHeightPx,
    getGridColumns,
  ]);

  // 處理滑鼠在容器內空白處按住拖曳框選 (Marquee Selection)
  const handleContainerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (creatingMode || inlineRenameTargetPath) return;

    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, textarea, [role='button']")) {
      return;
    }

    const fileBodyEl = target.closest("[data-file-body='true']");
    const gridCardEl = target.closest("[data-file-grid-card='true']");

    if (fileBodyEl || gridCardEl) {
      return;
    }

    const rowEl = target.closest("[data-file-row='true']");
    if (rowEl) {
      const rowPath = rowEl.getAttribute("data-file-row-path");
      if (rowPath && selectedSet.has(rowPath)) {
        return;
      }
    }

    if (!parentRef.current) return;
    const rect = parentRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left + parentRef.current.scrollLeft;
    const startY = e.clientY - rect.top + parentRef.current.scrollTop;

    const mode: MarqueeModifierMode =
      e.ctrlKey || e.metaKey
        ? "toggle"
        : e.shiftKey
        ? "union"
        : "replace";

    marqueeStateRef.current = {
      isDragging: false,
      startX,
      startY,
      initialSelectedPaths: activeTab?.selectedPaths || [],
      mode,
    };

    const handleWindowMouseMove = (moveEvent: MouseEvent) => {
      if (!marqueeStateRef.current || !parentRef.current) return;

      const pRect = parentRef.current.getBoundingClientRect();
      const curX =
        moveEvent.clientX - pRect.left + parentRef.current.scrollLeft;
      const curY =
        moveEvent.clientY - pRect.top + parentRef.current.scrollTop;

      const dist = Math.hypot(
        curX - marqueeStateRef.current.startX,
        curY - marqueeStateRef.current.startY
      );
      if (!marqueeStateRef.current.isDragging && dist < 4) {
        return;
      }
      marqueeStateRef.current.isDragging = true;

      // 邊界自動平滑捲動 (30px 邊界門檻)
      const mouseY = moveEvent.clientY - pRect.top;
      if (mouseY < 30) {
        const speed = Math.max(2, Math.floor((30 - mouseY) / 2));
        parentRef.current.scrollTop -= speed;
      } else if (pRect.bottom - moveEvent.clientY < 30) {
        const speed = Math.max(
          2,
          Math.floor((30 - (pRect.bottom - moveEvent.clientY)) / 2)
        );
        parentRef.current.scrollTop += speed;
      }

      const box = calculateMarqueeBox(
        marqueeStateRef.current.startX,
        marqueeStateRef.current.startY,
        curX,
        curY
      );
      setMarqueeBox(box);

      let intersectedPaths: string[] = [];
      if (activeTab?.viewMode !== "grid") {
        const rowHeight = fontSettings.rowHeightPx;
        const indices = getDetailsIntersectedIndices(
          box,
          rowHeight,
          processedEntries.length
        );
        intersectedPaths = indices.map((idx) => processedEntries[idx].path);
      } else {
        const gridItems = parentRef.current.querySelectorAll<HTMLElement>(
          "[data-grid-item-path]"
        );
        const boxScreenLeft =
          box.left - parentRef.current.scrollLeft + pRect.left;
        const boxScreenTop =
          box.top - parentRef.current.scrollTop + pRect.top;
        const boxScreenRight = boxScreenLeft + box.width;
        const boxScreenBottom = boxScreenTop + box.height;

        gridItems.forEach((el) => {
          const itemRect = el.getBoundingClientRect();
          if (
            itemRect.left < boxScreenRight &&
            itemRect.right > boxScreenLeft &&
            itemRect.top < boxScreenBottom &&
            itemRect.bottom > boxScreenTop
          ) {
            const path = el.getAttribute("data-grid-item-path");
            if (path) intersectedPaths.push(path);
          }
        });
      }

      const newSelected = computeMarqueeSelection(
        marqueeStateRef.current.initialSelectedPaths,
        intersectedPaths,
        marqueeStateRef.current.mode
      );
      setTabSelection(
        pane,
        newSelected,
        newSelected[newSelected.length - 1] || null
      );
    };

    const handleWindowMouseUp = () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);

      if (marqueeStateRef.current?.isDragging) {
        justFinishedMarqueeRef.current = true;
      }
      marqueeStateRef.current = null;
      setMarqueeBox(null);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
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
        onMouseDown={handleContainerMouseDown}
        onClick={() => {
          clearTypeAhead();
          navAnchorRef.current = null;
          if (justFinishedMarqueeRef.current) {
            justFinishedMarqueeRef.current = false;
            return;
          }
          setTabSelection(pane, [], null);
        }}
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
              const isRenaming = inlineRenameTargetPath === entry.path;
              return (
                <div
                  key={entry.path}
                  data-file-grid-card="true"
                  data-grid-item-path={entry.path}
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
                  {isRenaming ? (
                    <input
                      ref={inlineInputRef}
                      type="text"
                      value={inlineNameValue}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setInlineNameValue(e.target.value)}
                      onBlur={() => commitInlineRename(entry)}
                      onKeyDown={(e) => handleInlineRenameKeyDown(e, entry)}
                      className="mt-2 w-full px-1.5 py-0.5 rounded bg-slate-900 border border-blue-500 text-xs text-white text-center focus:outline-none"
                    />
                  ) : (
                    <span className="mt-2 w-full truncate text-xs font-medium">
                      {entry.name}
                    </span>
                  )}
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
                  data-file-row="true"
                  data-file-row-path={entry.path}
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
                      ? "bg-blue-600/25 ring-1 ring-inset ring-blue-500/40 text-white"
                      : "hover:bg-slate-900/80 text-slate-200"
                  } ${entry.isHidden ? "opacity-60" : ""}`}
                >
                  {/* 名稱與圖示 */}
                  <div
                    data-file-body="true"
                    className="col-span-6 flex items-center gap-2.5 min-w-0 pr-2"
                  >
                    <FileEntryIcon
                      kind={entry.kind}
                      size={Math.max(16, fontSettings.fontSizePx + 3)}
                    />
                    {isRenaming ? (
                      <input
                        ref={inlineInputRef}
                        type="text"
                        value={inlineNameValue}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setInlineNameValue(e.target.value)}
                        onBlur={() => commitInlineRename(entry)}
                        onKeyDown={(e) => handleInlineRenameKeyDown(e, entry)}
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

        {/* 滑鼠框選矩形 */}
        {marqueeBox && (
          <div
            style={{
              position: "absolute",
              left: `${marqueeBox.left}px`,
              top: `${marqueeBox.top}px`,
              width: `${marqueeBox.width}px`,
              height: `${marqueeBox.height}px`,
            }}
            className="border border-blue-400 bg-blue-500/20 rounded-sm pointer-events-none z-30"
          />
        )}

        {/* 打字跳轉浮動提示標籤 (1 秒自動清除，亦支援點擊關閉或按 Esc 清除) */}
        {typeAheadBadge && (
          <div
            onClick={clearTypeAhead}
            className="absolute bottom-3 right-3 z-30 px-3 py-1.5 rounded-lg bg-slate-900/95 border border-blue-500/70 shadow-xl text-xs text-blue-300 font-mono flex items-center gap-2 backdrop-blur-md cursor-pointer transition-all animate-in fade-in duration-150 select-none hover:border-blue-400 group"
            title="點擊或按 Esc 關閉"
          >
            <span className="text-[11px] text-slate-400">跳至:</span>
            <span className="font-semibold text-white tracking-wide text-sm">
              {typeAheadBadge}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                clearTypeAhead();
              }}
              className="ml-1 p-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="清除 (Esc)"
            >
              <X size={12} />
            </button>
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
