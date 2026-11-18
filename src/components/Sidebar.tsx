import React from "react";
import {
  HardDrive,
  Home,
  Monitor,
  FileText,
  Download,
  Image,
  Music,
  Film,
  FolderGit2,
  Bookmark,
  Trash2,
} from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { formatBytes } from "../utils/formatters";
import type { SystemLocations } from "../types";

interface SidebarProps {
  systemLocations: SystemLocations | null;
  onDropFilesToDir: (targetPath: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  systemLocations,
  onDropFilesToDir,
}) => {
  const activePane = useAppStore((s) => s.activePane);
  const navigateTab = useAppStore((s) => s.navigateTab);
  const addTab = useAppStore((s) => s.addTab);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const removeBookmark = useAppStore((s) => s.removeBookmark);

  const renderSpecialIcon = (icon: string) => {
    switch (icon) {
      case "home":
        return <Home size={14} className="text-blue-400" />;
      case "monitor":
        return <Monitor size={14} className="text-sky-400" />;
      case "file-text":
        return <FileText size={14} className="text-emerald-400" />;
      case "download":
        return <Download size={14} className="text-amber-400" />;
      case "image":
        return <Image size={14} className="text-purple-400" />;
      case "music":
        return <Music size={14} className="text-pink-400" />;
      case "film":
        return <Film size={14} className="text-rose-400" />;
      default:
        return <FolderGit2 size={14} className="text-cyan-400" />;
    }
  };

  return (
    <aside className="w-56 border-r border-slate-800 bg-slate-900/80 flex flex-col overflow-y-auto select-none shrink-0 text-xs">
      {/* 快速存取捷徑 */}
      <div className="p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 mb-1.5">
          系統快速存取
        </div>
        <div className="space-y-0.5">
          {systemLocations?.specialLocations.map((loc) => (
            <button
              key={loc.id}
              type="button"
              onClick={(e) => {
                if (e.ctrlKey || e.metaKey) {
                  addTab(activePane, loc.path);
                } else {
                  navigateTab(activePane, loc.path);
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDropFilesToDir(loc.path);
              }}
              className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
              title={`${loc.path} (Ctrl+點擊在新分頁開啟)`}
            >
              {renderSpecialIcon(loc.icon)}
              <span className="truncate">{loc.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 自訂書籤捷徑 */}
      <div className="px-3 pb-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 mb-1.5">
          書籤捷徑 (可拖放檔案至此)
        </div>
        <div className="space-y-0.5">
          {bookmarks.map((bm) => (
            <div
              key={bm.path}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                onDropFilesToDir(bm.path);
              }}
              className="group flex items-center justify-between px-2.5 py-1.5 rounded-md text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <button
                type="button"
                onClick={() => navigateTab(activePane, bm.path)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left"
                title={bm.path}
              >
                <Bookmark size={13} className="text-amber-400 shrink-0" />
                <span className="truncate">{bm.label}</span>
              </button>
              <button
                type="button"
                onClick={() => removeBookmark(bm.path)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-500 hover:text-rose-400"
                title="移除書籤"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 本機磁碟與掛載點 */}
      <div className="px-3 pb-4 mt-auto">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-2 mb-1.5">
          磁碟區與儲存空間
        </div>
        <div className="space-y-2">
          {systemLocations?.volumes.map((vol) => {
            const used = Math.max(0, vol.totalSpace - vol.availableSpace);
            const pct =
              vol.totalSpace > 0
                ? Math.min(100, Math.round((used / vol.totalSpace) * 100))
                : 0;
            return (
              <button
                key={vol.mountPoint}
                type="button"
                onClick={() => navigateTab(activePane, vol.mountPoint)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  onDropFilesToDir(vol.mountPoint);
                }}
                className="w-full p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 text-left transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="flex items-center gap-1.5 font-medium text-slate-200 truncate">
                    <HardDrive size={13} className="text-blue-400 shrink-0" />
                    <span className="truncate">{vol.name}</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {pct}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-1">
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full ${
                      pct > 85 ? "bg-rose-500" : "bg-blue-500"
                    }`}
                  />
                </div>
                <div className="text-[10px] text-slate-400 flex justify-between">
                  <span>可用 {formatBytes(vol.availableSpace)}</span>
                  <span>共 {formatBytes(vol.totalSpace)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
};
