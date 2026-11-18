import React, { useState } from "react";
import {
  Plus,
  X,
  Lock,
  Unlock,
  Palette,
  Copy,
  XCircle,
} from "lucide-react";
import { TAB_COLORS, useAppStore } from "../store/useAppStore";
import type { PaneId, TabItem } from "../types";

interface TabBarProps {
  pane: PaneId;
  onDropFilesToTab: (targetPath: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({ pane, onDropFilesToTab }) => {
  const paneState = useAppStore((s) => s.panes[pane]);
  const activePane = useAppStore((s) => s.activePane);
  const addTab = useAppStore((s) => s.addTab);
  const closeTab = useAppStore((s) => s.closeTab);
  const closeOtherTabs = useAppStore((s) => s.closeOtherTabs);
  const duplicateTab = useAppStore((s) => s.duplicateTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const toggleTabLock = useAppStore((s) => s.toggleTabLock);
  const setTabColor = useAppStore((s) => s.setTabColor);
  const reorderTabs = useAppStore((s) => s.reorderTabs);

  const [tabContextMenu, setTabContextMenu] = useState<{
    tab: TabItem;
    x: number;
    y: number;
  } | null>(null);
  const [dragTabIdx, setDragTabIdx] = useState<number | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);

  const isPaneFocused = activePane === pane;

  return (
    <div
      className={`flex items-center justify-between px-1.5 pt-1 border-b select-none ${
        isPaneFocused
          ? "bg-slate-900 border-slate-700"
          : "bg-slate-950 border-slate-800"
      }`}
    >
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 max-w-full">
        {paneState.tabs.map((tab, idx) => {
          const isActive = tab.id === paneState.activeTabId;
          const hasColor = tab.color && tab.color !== "none" && tab.color !== "transparent";

          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                setDragTabIdx(idx);
                e.dataTransfer.setData("application/x-rfm-tab", String(idx));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverTabId(tab.id);
              }}
              onDragLeave={() => setDragOverTabId(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverTabId(null);
                const tabDrag = e.dataTransfer.getData("application/x-rfm-tab");
                if (tabDrag !== "" && dragTabIdx !== null) {
                  reorderTabs(pane, dragTabIdx, idx);
                  setDragTabIdx(null);
                } else {
                  // 將拖曳中的檔案直接丟到該分頁的目錄中
                  onDropFilesToTab(tab.path);
                }
              }}
              onClick={() => setActiveTab(pane, tab.id)}
              onAuxClick={(e) => {
                // 滑鼠中鍵關閉分頁（若已鎖定則拒絕關閉）
                if (e.button === 1 && !tab.locked) {
                  e.preventDefault();
                  closeTab(pane, tab.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setTabContextMenu({ tab, x: e.clientX, y: e.clientY });
              }}
              style={{
                borderTopColor: hasColor ? tab.color : isActive ? "#3b82f6" : "transparent",
              }}
              className={`group relative flex items-center gap-2 px-3 py-1.5 rounded-t-md border-t-2 text-xs cursor-pointer transition-all shrink-0 max-w-[210px] ${
                isActive
                  ? "bg-slate-800 text-white font-medium shadow-sm"
                  : "bg-slate-900/60 text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              } ${
                dragOverTabId === tab.id ? "ring-2 ring-blue-500 bg-blue-500/20" : ""
              }`}
              title={`${tab.path}${tab.locked ? " (分頁已鎖定，防止誤關)" : ""}`}
            >
              {/* 顏色圓點標記 */}
              {hasColor && (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: tab.color }}
                />
              )}

              {/* 鎖定圖示 */}
              {tab.locked && (
                <span title="已鎖定分頁（點擊右鍵可解鎖）" className="shrink-0 flex items-center">
                  <Lock size={12} className="text-amber-400" />
                </span>
              )}

              <span className="truncate">{tab.title || "/"}</span>

              {/* 關閉或鎖定按鈕 */}
              {tab.locked ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleTabLock(pane, tab.id);
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-slate-700 text-amber-400/80 hover:text-amber-300"
                  title="點擊解鎖此分頁"
                >
                  <Unlock size={11} />
                </button>
              ) : (
                paneState.tabs.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(pane, tab.id);
                    }}
                    className="ml-1 p-0.5 rounded opacity-60 group-hover:opacity-100 hover:bg-rose-500/30 hover:text-rose-300 transition-opacity"
                    title="關閉分頁 (Ctrl+W)"
                  >
                    <X size={12} />
                  </button>
                )
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => addTab(pane)}
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors shrink-0"
          title="新增分頁 (Ctrl+T)"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* 分頁專屬右鍵選單：自訂顏色、鎖定防關閉、複製分頁 */}
      {tabContextMenu && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setTabContextMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setTabContextMenu(null);
          }}
        >
          <div
            style={{
              left: Math.min(tabContextMenu.x, window.innerWidth - 230),
              top: Math.min(tabContextMenu.y, window.innerHeight - 280),
            }}
            onClick={(e) => e.stopPropagation()}
            className="fixed w-56 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl p-1.5 text-xs text-slate-200"
          >
            <div className="px-2.5 py-1 text-[11px] text-slate-400 border-b border-slate-800 mb-1 truncate">
              分頁設定：{tabContextMenu.tab.title}
            </div>

            <button
              type="button"
              onClick={() => {
                toggleTabLock(pane, tabContextMenu.tab.id);
                setTabContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-blue-600/30 text-left"
            >
              {tabContextMenu.tab.locked ? (
                <>
                  <Unlock size={14} className="text-amber-400" />
                  <span>解除分頁鎖定</span>
                </>
              ) : (
                <>
                  <Lock size={14} className="text-amber-400" />
                  <span>鎖定分頁 (避免誤關閉)</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                duplicateTab(pane, tabContextMenu.tab.id);
                setTabContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-blue-600/30 text-left"
            >
              <Copy size={14} className="text-sky-400" />
              <span>複製此分頁</span>
            </button>

            <div className="my-1 border-t border-slate-800" />

            <div className="px-2.5 py-1 text-[11px] text-slate-400 flex items-center gap-1.5">
              <Palette size={12} />
              <span>自訂分頁顏色標籤</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5">
              {TAB_COLORS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setTabColor(
                      pane,
                      tabContextMenu.tab.id,
                      c.id === "none" ? "none" : c.hex
                    );
                    setTabContextMenu(null);
                  }}
                  title={c.label}
                  className={`w-5 h-5 rounded-full border transition-transform hover:scale-110 ${
                    c.id === "none"
                      ? "border-slate-500 bg-slate-800"
                      : "border-white/20"
                  }`}
                  style={
                    c.id !== "none" ? { backgroundColor: c.hex } : undefined
                  }
                />
              ))}
            </div>

            <div className="my-1 border-t border-slate-800" />

            <button
              type="button"
              disabled={tabContextMenu.tab.locked || paneState.tabs.length <= 1}
              onClick={() => {
                closeTab(pane, tabContextMenu.tab.id);
                setTabContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-rose-500/20 text-rose-400 disabled:opacity-40 disabled:cursor-not-allowed text-left"
            >
              <X size={14} />
              <span>
                {tabContextMenu.tab.locked
                  ? "分頁已鎖定 (無法關閉)"
                  : "關閉此分頁"}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                closeOtherTabs(pane, tabContextMenu.tab.id);
                setTabContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded hover:bg-slate-800 text-slate-300 text-left"
            >
              <XCircle size={14} />
              <span>關閉其他未鎖定分頁</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
