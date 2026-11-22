import React, { useEffect, useRef } from "react";
import {
  FolderOpen,
  ExternalLink,
  Terminal,
  Copy,
  Scissors,
  ClipboardPaste,
  Edit3,
  Wand2,
  Trash2,
  ShieldAlert,
  Archive,
  PackageOpen,
  Hash,
  BookmarkPlus,
  FolderPlus,
  FilePlus,
  RefreshCw,
  CopyCheck,
  Columns,
  Info,
} from "lucide-react";
import type { FileEntry, PaneId } from "../types";

export interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  pane: PaneId;
  targetEntry: FileEntry | null;
  selectedEntries: FileEntry[];
  currentDirPath: string;
}

interface ContextMenuProps {
  menu: ContextMenuState;
  hasClipboard: boolean;
  onClose: () => void;
  onAction: (action: string, entry: FileEntry | null) => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  menu,
  hasClipboard,
  onClose,
  onAction,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (menu.visible) {
      window.addEventListener("mousedown", handleClickOutside);
      window.addEventListener("keydown", handleEsc);
    }
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleEsc);
    };
  }, [menu.visible, onClose]);

  if (!menu.visible) return null;

  const entry = menu.targetEntry;
  const count = menu.selectedEntries.length;
  const isMulti = count > 1;
  const isDir = entry?.isDir ?? false;
  const isArchive = entry?.kind === "archive";
  const isExecutableOrScript =
    entry?.kind === "executable" ||
    ["ps1", "sh", "bat", "cmd", "py"].includes(
      (entry?.extension || "").toLowerCase()
    );

  // 防止選單超出視窗邊界
  const maxX = typeof window !== "undefined" ? window.innerWidth - 260 : menu.x;
  const maxY = typeof window !== "undefined" ? window.innerHeight - 420 : menu.y;
  const left = Math.max(8, Math.min(menu.x, maxX));
  const top = Math.max(8, Math.min(menu.y, maxY));

  const Item: React.FC<{
    icon: React.ReactNode;
    label: string;
    shortcut?: string;
    danger?: boolean;
    disabled?: boolean;
    onClick: () => void;
  }> = ({ icon, label, shortcut, danger, disabled, onClick }) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onAction(label, entry);
          onClose();
        }
      }}
      className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs rounded transition-colors ${
        disabled
          ? "opacity-40 cursor-not-allowed text-slate-500"
          : danger
          ? "text-rose-400 hover:bg-rose-500/20"
          : "text-slate-200 hover:bg-blue-600/30 hover:text-white"
      }`}
    >
      <span className="flex items-center gap-2.5 truncate">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      {shortcut && (
        <span className="ml-4 text-[10px] text-slate-400 font-mono shrink-0">
          {shortcut}
        </span>
      )}
    </button>
  );

  return (
    <div
      ref={menuRef}
      style={{ left, top }}
      className="fixed z-50 w-64 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-lg shadow-2xl p-1.5 select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 標題區：顯示目前右鍵針對的對象 */}
      <div className="px-2.5 py-1 mb-1 border-b border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
        <span className="truncate font-medium text-slate-300">
          {!entry
            ? "目前目錄空白處"
            : isMulti
            ? `已選取 ${count} 個項目`
            : isDir
            ? `目錄：${entry.name}`
            : `檔案：${entry.name}`}
        </span>
      </div>

      {/* 針對目錄專屬功能 */}
      {entry && isDir && !isMulti && (
        <>
          <Item
            icon={<FolderOpen size={14} className="text-amber-400" />}
            label="進入此目錄"
            shortcut="Enter"
            onClick={() => onAction("open_dir", entry)}
          />
          <Item
            icon={<FolderPlus size={14} className="text-blue-400" />}
            label="在新分頁中開啟此目錄"
            shortcut="Ctrl+Click"
            onClick={() => onAction("open_in_new_tab", entry)}
          />
          <Item
            icon={<Columns size={14} className="text-emerald-400" />}
            label="在另一側面板開啟 (Dual-Pane)"
            onClick={() => onAction("open_in_other_pane", entry)}
          />
          <Item
            icon={<BookmarkPlus size={14} className="text-purple-400" />}
            label="加入側邊欄書籤捷徑"
            onClick={() => onAction("bookmark_dir", entry)}
          />
          <Item
            icon={<Terminal size={14} className="text-cyan-400" />}
            label="在此目錄開啟終端機"
            shortcut="Ctrl+`"
            onClick={() => onAction("open_terminal_here", entry)}
          />
          <div className="my-1 border-t border-slate-800" />
        </>
      )}

      {/* 針對一般檔案與特殊檔案功能 */}
      {entry && !isDir && !isMulti && (
        <>
          <Item
            icon={<ExternalLink size={14} className="text-blue-400" />}
            label="使用系統預設程式開啟"
            shortcut="Enter"
            onClick={() => onAction("open_system", entry)}
          />
          {isArchive && (
            <Item
              icon={<PackageOpen size={14} className="text-orange-400" />}
              label="解壓縮至此處 (自動建立同名資料夾)"
              onClick={() => onAction("extract_archive", entry)}
            />
          )}
          {isExecutableOrScript && (
            <Item
              icon={<Terminal size={14} className="text-rose-400" />}
              label="在終端機環境開啟所屬目錄"
              onClick={() => onAction("open_terminal_here", entry)}
            />
          )}
          <Item
            icon={<Hash size={14} className="text-emerald-400" />}
            label="計算檔案雜湊值 (MD5 / SHA-256 / CRC32)"
            onClick={() => onAction("compute_checksum", entry)}
          />
          <div className="my-1 border-t border-slate-800" />
        </>
      )}

      {/* 針對空白處功能 */}
      {!entry && (
        <>
          <Item
            icon={<FolderPlus size={14} className="text-amber-400" />}
            label="新增資料夾"
            shortcut="Ctrl+Shift+N"
            onClick={() => onAction("new_folder", null)}
          />
          <Item
            icon={<FilePlus size={14} className="text-sky-400" />}
            label="新增空白文字檔"
            onClick={() => onAction("new_file", null)}
          />
          <Item
            icon={<ClipboardPaste size={14} className="text-emerald-400" />}
            label="貼上至目前目錄 (佇列傳輸)"
            shortcut="Ctrl+V"
            disabled={!hasClipboard}
            onClick={() => onAction("paste_here", null)}
          />
          <Item
            icon={<Terminal size={14} className="text-cyan-400" />}
            label="在目前目錄開啟終端機"
            shortcut="Ctrl+`"
            onClick={() => onAction("open_terminal_current", null)}
          />
          <Item
            icon={<RefreshCw size={14} className="text-blue-400" />}
            label="強制重新整理 (清除此目錄快取)"
            shortcut="F5"
            onClick={() => onAction("refresh_force", null)}
          />
          <div className="my-1 border-t border-slate-800" />
          <Item
            icon={<Info size={14} className="text-sky-400" />}
            label="目前目錄詳細資訊"
            shortcut="Alt+Enter"
            onClick={() => onAction("details_current", null)}
          />
        </>
      )}

      {/* 針對單選或多選的共用編輯與佇列操作 */}
      {entry && (
        <>
          <Item
            icon={<Copy size={14} />}
            label={isMulti ? `複製選取的 ${count} 個項目` : "複製"}
            shortcut="Ctrl+C"
            onClick={() => onAction("copy", entry)}
          />
          <Item
            icon={<Scissors size={14} />}
            label={isMulti ? `剪下選取的 ${count} 個項目` : "剪下"}
            shortcut="Ctrl+X"
            onClick={() => onAction("cut", entry)}
          />
          {hasClipboard && (
            <Item
              icon={<ClipboardPaste size={14} className="text-emerald-400" />}
              label="貼上至目前目錄"
              shortcut="Ctrl+V"
              onClick={() => onAction("paste_here", entry)}
            />
          )}
          <div className="my-1 border-t border-slate-800" />

          {!isMulti && (
            <Item
              icon={<Edit3 size={14} className="text-amber-300" />}
              label="重新命名"
              shortcut="F2"
              onClick={() => onAction("inline_rename", entry)}
            />
          )}
          <Item
            icon={<Wand2 size={14} className="text-purple-400" />}
            label={
              isMulti
                ? `批次重新命名 (${count} 個項目)...`
                : "進階批次重新命名工具..."
            }
            shortcut={isMulti ? "F2" : "Ctrl+Shift+R"}
            onClick={() => onAction("batch_rename", entry)}
          />
          <Item
            icon={<Archive size={14} className="text-orange-400" />}
            label={
              isMulti ? `壓縮選取的 ${count} 個項目為 .zip` : "壓縮為 .zip 檔案"
            }
            onClick={() => onAction("compress_zip", entry)}
          />
          <Item
            icon={<CopyCheck size={14} className="text-slate-400" />}
            label="複製完整路徑至剪貼簿"
            onClick={() => onAction("copy_path", entry)}
          />
          <Item
            icon={<ExternalLink size={14} className="text-slate-400" />}
            label="在系統原生檔案總管中顯示"
            onClick={() => onAction("reveal_in_shell", entry)}
          />

          <div className="my-1 border-t border-slate-800" />
          <Item
            icon={<Trash2 size={14} />}
            label="移至資源回收桶"
            shortcut="Delete"
            danger
            onClick={() => onAction("trash", entry)}
          />
          <Item
            icon={<ShieldAlert size={14} />}
            label="永久刪除 (無法復原)"
            shortcut="Shift+Delete"
            danger
            onClick={() => onAction("delete_permanent", entry)}
          />

          <div className="my-1 border-t border-slate-800" />
          <Item
            icon={<Info size={14} className="text-sky-400" />}
            label={isMulti ? `詳細資訊 (${count} 個項目)` : "詳細資訊 (屬性)"}
            shortcut="Alt+Enter"
            onClick={() => onAction("details", entry)}
          />
        </>
      )}
    </div>
  );
};
