import React, { useEffect, useState } from "react";
import {
  FileText,
  Hash,
  ExternalLink,
  Terminal,
  CopyCheck,
} from "lucide-react";
import {
  apiComputeChecksum,
  apiOpenItem,
  apiOpenTerminal,
  apiReadFilePreview,
} from "../api";
import { formatBytes, formatDateTime } from "../utils/formatters";
import { FileEntryIcon } from "./FileEntryIcon";
import type { FileChecksumResult, FilePreviewData } from "../types";

interface PreviewPanelProps {
  selectedPath: string | null;
  onNotify: (msg: string) => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  selectedPath,
  onNotify,
}) => {
  const [preview, setPreview] = useState<FilePreviewData | null>(null);
  const [checksum, setChecksum] = useState<FileChecksumResult | null>(null);
  const [loadingHash, setLoadingHash] = useState(false);

  useEffect(() => {
    setChecksum(null);
    if (!selectedPath) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    apiReadFilePreview(selectedPath)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPath]);

  const handleComputeChecksum = async () => {
    if (!selectedPath) return;
    setLoadingHash(true);
    try {
      const res = await apiComputeChecksum(selectedPath);
      setChecksum(res);
    } catch (err) {
      onNotify(`雜湊計算失敗: ${String(err)}`);
    } finally {
      setLoadingHash(false);
    }
  };

  if (!selectedPath || !preview) {
    return (
      <aside className="w-72 border-l border-slate-800 bg-slate-900/60 p-4 flex flex-col items-center justify-center text-center text-xs text-slate-500 shrink-0">
        <FileText size={32} className="mb-2 opacity-30" />
        <p>點選任一檔案或目錄即可在此檢視詳細屬性、雜湊校驗與內容預覽</p>
      </aside>
    );
  }

  return (
    <aside className="w-80 border-l border-slate-800 bg-slate-900/75 flex flex-col overflow-hidden shrink-0 text-xs">
      {/* Item Header */}
      <div className="p-3.5 border-b border-slate-800 bg-slate-950/40 flex items-start gap-3">
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
      <div className="p-3.5 border-b border-slate-800 space-y-2">
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
                  <span className="text-slate-500">CRC32: </span>
                  {checksum.crc32}
                </div>
                <div className="break-all text-slate-300">
                  <span className="text-slate-500">MD5: </span>
                  {checksum.md5}
                </div>
                <div className="break-all text-slate-300">
                  <span className="text-slate-500">SHA256: </span>
                  {checksum.sha256}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Text / Code Preview */}
      <div className="flex-1 overflow-y-auto p-3 bg-slate-950/70">
        {preview.kind === "directory" ? (
          <div className="text-slate-400 text-center py-8">
            雙擊或按 Enter 進入此目錄瀏覽內容
          </div>
        ) : preview.isBinary ? (
          <div className="text-slate-500 text-center py-8">
            二進位或媒體檔案（可點擊上方「開啟」使用系統預設程式檢視）
          </div>
        ) : preview.textPreview !== null ? (
          <div>
            <div className="text-[10px] text-slate-500 mb-1.5 flex justify-between">
              <span>文字內容預覽 (前 32 KB)</span>
              <span>{preview.totalLines} 行</span>
            </div>
            <pre className="text-[11px] leading-relaxed font-mono text-slate-300 whitespace-pre-wrap break-words select-text">
              {preview.textPreview || "(空白檔案)"}
            </pre>
          </div>
        ) : null}
      </div>
    </aside>
  );
};
