import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  FileText,
  Hash,
  ExternalLink,
  Terminal,
  CopyCheck,
  Layers,
  Edit3,
  Copy,
  Folder,
} from "lucide-react";
import {
  apiComputeChecksum,
  apiOpenItem,
  apiOpenTerminal,
  apiReadFilePreview,
  apiReadFileChunk,
} from "../api";
import { formatBytes, formatDateTime } from "../utils/formatters";
import { useAppStore } from "../store/useAppStore";
import { pluginRegistry } from "../plugins/registry";
import "../plugins/builtin"; // 確保內建外掛完成註冊
import { FileEntryIcon } from "./FileEntryIcon";
import type {
  FileChecksumResult,
  FileEntry,
  FilePreviewData,
} from "../types";

interface PreviewPanelProps {
  selectedEntries: FileEntry[];
  currentDirPath: string;
  onNotify: (msg: string) => void;
  onBatchRename?: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  selectedEntries,
  currentDirPath,
  onNotify,
  onBatchRename,
}) => {
  const panelWidth = useAppStore((s) => s.previewPanelWidth);
  const setPanelWidth = useAppStore((s) => s.setPreviewPanelWidth);
  const pluginsConfig = useAppStore((s) => s.pluginsConfig);

  const [preview, setPreview] = useState<FilePreviewData | null>(null);
  const [checksum, setChecksum] = useState<FileChecksumResult | null>(null);
  const [loadingHash, setLoadingHash] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const singleEntry = selectedEntries.length === 1 ? selectedEntries[0] : null;

  // 載入單選檔案的預覽資訊
  useEffect(() => {
    setChecksum(null);
    if (!singleEntry) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    apiReadFilePreview(singleEntry.path)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [singleEntry?.path]);

  // 分段載入更多內容 (Load More)
  const handleLoadMore = useCallback(async () => {
    if (!singleEntry || !preview || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const currentOffset = preview.loadedBytes || (preview.textPreview?.length ?? 0);
      const chunk = await apiReadFileChunk(singleEntry.path, currentOffset, 64 * 1024);
      setPreview((prev) => {
        if (!prev) return prev;
        const newText = (prev.textPreview || "") + chunk.content;
        return {
          ...prev,
          textPreview: newText,
          totalLines: newText.split("\n").length,
          hasMore: chunk.hasMore,
          loadedBytes: (prev.loadedBytes || 0) + chunk.bytesRead,
        };
      });
    } catch (err) {
      onNotify(`載入後續內容失敗: ${String(err)}`);
    } finally {
      setIsLoadingMore(false);
    }
  }, [singleEntry, preview, isLoadingMore, onNotify]);

  // 計算雜湊值
  const handleComputeChecksum = async () => {
    if (!singleEntry) return;
    setLoadingHash(true);
    try {
      const res = await apiComputeChecksum(singleEntry.path);
      setChecksum(res);
    } catch (err) {
      onNotify(`雜湊計算失敗: ${String(err)}`);
    } finally {
      setLoadingHash(false);
    }
  };

  // 滑鼠拖曳調整預覽面板寬度
  const handleMouseDownResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = window.innerWidth - moveEvent.clientX;
      setPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // 匹配最適合的 Preview Plugin
  const matchedPlugin = useMemo(() => {
    if (!singleEntry) return null;
    return pluginRegistry.findMatchingPlugin(singleEntry, pluginsConfig);
  }, [singleEntry, pluginsConfig]);

  // 多選統計計算
  const multiStats = useMemo(() => {
    if (selectedEntries.length <= 1) return null;
    let totalSize = 0;
    let fileCount = 0;
    let dirCount = 0;
    const kindCounts: Record<string, number> = {};

    for (const item of selectedEntries) {
      totalSize += item.size;
      if (item.isDir) {
        dirCount++;
      } else {
        fileCount++;
      }
      kindCounts[item.kind] = (kindCounts[item.kind] || 0) + 1;
    }

    return {
      totalItems: selectedEntries.length,
      totalSize,
      fileCount,
      dirCount,
      kindCounts,
    };
  }, [selectedEntries]);

  return (
    <aside
      style={{ width: `${panelWidth}px` }}
      className="border-l border-slate-800 bg-slate-900/80 flex flex-col overflow-hidden shrink-0 text-xs relative select-none"
    >
      {/* Resizable 拖曳手把 */}
      <div
        onMouseDown={handleMouseDownResize}
        className="w-1.5 hover:w-2 bg-transparent hover:bg-blue-500/60 cursor-col-resize absolute left-0 top-0 bottom-0 z-20 transition-all"
        title="拖曳調整預覽面板寬度"
      />

      {/* 狀況一：多選項目總覽 (Multi-selection Summary) */}
      {selectedEntries.length > 1 && multiStats && (
        <div className="flex-1 flex flex-col p-4 overflow-y-auto">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800 text-slate-200">
            <div className="p-2 rounded-lg bg-blue-500/15 text-blue-400">
              <Layers size={22} />
            </div>
            <div>
              <div className="font-semibold text-sm">
                已選取 {multiStats.totalItems} 個項目
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                合計容量：{formatBytes(multiStats.totalSize)}
              </div>
            </div>
          </div>

          <div className="py-3.5 space-y-2 border-b border-slate-800 text-[11px]">
            <div className="text-slate-400 font-medium">包含內容：</div>
            <div className="grid grid-cols-2 gap-2 text-slate-300">
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-400">檔案數量：</span>
                <span className="font-mono font-semibold text-white ml-1">
                  {multiStats.fileCount}
                </span>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800/80">
                <span className="text-slate-400">資料夾數：</span>
                <span className="font-mono font-semibold text-white ml-1">
                  {multiStats.dirCount}
                </span>
              </div>
            </div>

            <div className="pt-2 text-slate-400 font-medium">類型分佈：</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(multiStats.kindCounts).map(([kind, count]) => (
                <span
                  key={kind}
                  className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700/60 text-slate-300 text-[10px]"
                >
                  {kind}: <strong className="text-white">{count}</strong>
                </span>
              ))}
            </div>
          </div>

          {/* 多選批次快捷操作 */}
          <div className="pt-4 space-y-2">
            <div className="text-slate-400 font-medium mb-1">批次快捷動作：</div>
            {onBatchRename && (
              <button
                type="button"
                onClick={onBatchRename}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md transition-colors"
              >
                <Edit3 size={14} />
                <span>開啟進階批次重新命名</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const paths = selectedEntries.map((e) => e.path).join("\n");
                navigator.clipboard.writeText(paths);
                onNotify(`已複製 ${selectedEntries.length} 筆完整路徑`);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
            >
              <CopyCheck size={14} />
              <span>複製所有項目完整路徑</span>
            </button>
            <button
              type="button"
              onClick={() => {
                const names = selectedEntries.map((e) => e.name).join("\n");
                navigator.clipboard.writeText(names);
                onNotify(`已複製 ${selectedEntries.length} 筆檔案名稱`);
              }}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs transition-colors"
            >
              <Copy size={14} />
              <span>複製所有項目檔案名稱</span>
            </button>
          </div>
        </div>
      )}

      {/* 狀況二：無選取項目 (No Selection) */}
      {selectedEntries.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-400">
          <Folder size={36} className="mb-2.5 text-slate-600 opacity-60" />
          <div className="font-semibold text-slate-300 mb-1">未選取任何檔案</div>
          <p className="text-[11px] text-slate-400 leading-relaxed max-w-[220px]">
            在清單中點選任一檔案或多選項目，即可檢視內容預覽、屬性與雜湊校驗
          </p>
          {currentDirPath && (
            <div className="mt-4 pt-3 border-t border-slate-800/80 w-full text-left">
              <span className="text-[10px] text-slate-400 block mb-1">目前所在目錄：</span>
              <div
                className="font-mono text-[10px] text-slate-300 break-all bg-slate-950 p-2 rounded border border-slate-800"
                title={currentDirPath}
              >
                {currentDirPath}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 狀況三：單選檔案預覽 (Single Entry Preview) */}
      {singleEntry && preview && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Item Header */}
          <div className="p-3.5 border-b border-slate-800 bg-slate-950/40 flex items-start gap-3 shrink-0">
            <div className="p-2 rounded-lg bg-slate-800/80">
              <FileEntryIcon kind={preview.kind} size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-white break-all leading-snug">
                {preview.name}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 uppercase">
                {preview.kind === "directory"
                  ? `目錄 (${preview.dirItemCount ?? 0} 個子項目)`
                  : `${preview.kind} • ${formatBytes(preview.size)}`}
              </div>
            </div>
          </div>

          {/* Metadata & Actions */}
          <div className="p-3.5 border-b border-slate-800 space-y-2 shrink-0">
            <div className="flex justify-between text-[11px]">
              <span className="text-slate-400">修改時間：</span>
              <span className="text-slate-200 font-mono">
                {formatDateTime(preview.modifiedMs)}
              </span>
            </div>
            <div className="flex justify-between text-[11px] gap-2">
              <span className="text-slate-400 shrink-0">完整路徑：</span>
              <span className="text-slate-300 font-mono truncate" title={preview.path}>
                {preview.path}
              </span>
            </div>

            <div className="flex items-center gap-1.5 pt-1.5">
              <button
                type="button"
                onClick={() => apiOpenItem(preview.path)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
              >
                <ExternalLink size={12} />
                <span>開啟</span>
              </button>
              <button
                type="button"
                onClick={() => apiOpenTerminal(preview.path)}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px]"
              >
                <Terminal size={12} />
                <span>終端機</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(preview.path);
                  onNotify("已複製完整路徑");
                }}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                title="複製路徑"
              >
                <CopyCheck size={13} />
              </button>
            </div>

            {preview.kind !== "directory" && (
              <div className="pt-1">
                {!checksum ? (
                  <button
                    type="button"
                    disabled={loadingHash}
                    onClick={handleComputeChecksum}
                    className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[11px]"
                  >
                    <Hash size={12} />
                    <span>
                      {loadingHash
                        ? "正在計算雜湊..."
                        : "計算 MD5 / SHA-256 / CRC32"}
                    </span>
                  </button>
                ) : (
                  <div className="p-2 rounded bg-slate-950 border border-slate-800 space-y-1 font-mono text-[10px]">
                    <div className="text-emerald-400 font-sans font-medium flex justify-between">
                      <span>檔案校驗值</span>
                      <span>{checksum.elapsedMs} ms</span>
                    </div>
                    <div className="break-all text-slate-300">
                      <span className="text-slate-400">CRC32: </span>
                      {checksum.crc32}
                    </div>
                    <div className="break-all text-slate-300">
                      <span className="text-slate-400">MD5: </span>
                      {checksum.md5}
                    </div>
                    <div className="break-all text-slate-300">
                      <span className="text-slate-400">SHA256: </span>
                      {checksum.sha256}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Plugin 渲染區域 (Dynamic Preview Plugin Outlet) */}
          <div className="flex-1 overflow-hidden min-h-0 flex flex-col">
            {preview.kind === "directory" ? (
              <div className="text-slate-400 text-center py-8">
                雙擊或按 Enter 進入此目錄瀏覽內容
              </div>
            ) : matchedPlugin ? (
              <matchedPlugin.component
                entry={singleEntry}
                previewData={preview}
                onNotify={onNotify}
                onLoadMore={handleLoadMore}
                isLoadingMore={isLoadingMore}
                hasMore={preview.hasMore}
              />
            ) : preview.isBinary ? (
              <div className="text-slate-400 text-center py-8 p-4">
                二進位檔案或目前未啟用對應的預覽外掛
                <div className="text-[11px] text-slate-400 mt-2">
                  （可點擊上方「開啟」使用系統預設程式檢視，或於設定中啟用相關外掛）
                </div>
              </div>
            ) : preview.textPreview !== null ? (
              <div className="flex-1 overflow-auto p-3 bg-slate-950 font-mono text-xs text-slate-300">
                <pre className="whitespace-pre-wrap break-words select-text">
                  {preview.textPreview || "(空白檔案)"}
                </pre>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  );
};
