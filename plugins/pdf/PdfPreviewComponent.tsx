import React, { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RotateCcw,
  CopyCheck,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { apiOpenItem } from "../../src/api";
import { formatBytes } from "../../src/utils/formatters";
import type { PreviewPluginProps } from "../../src/plugins/types";

export const PdfPreviewComponent: React.FC<PreviewPluginProps> = ({
  entry,
  onNotify,
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fit, setFit] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
    setRotation(0);
    setFit(true);
    setZoom(1);
  }, [entry.path]);

  const pdfSrc = `${convertFileSrc(entry.path)}#toolbar=0&navpanes=0`;

  const handleZoomIn = () => {
    setFit(false);
    setZoom((z) => Math.min(3, Math.round((z + 0.2) * 10) / 10));
  };

  const handleZoomOut = () => {
    setFit(false);
    setZoom((z) => Math.max(0.5, Math.round((z - 0.2) * 10) / 10));
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  const handleReset = () => {
    setFit(true);
    setZoom(1);
    setRotation(0);
  };

  const handleOpenExternal = async () => {
    try {
      await apiOpenItem(entry.path);
      onNotify("已使用系統預設 PDF 閱讀器開啟");
    } catch {
      onNotify("無法使用系統預設程式開啟此檔案");
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950/80">
      {/* PDF 頂部控制列 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 text-[11px] shrink-0 select-none">
        <div className="flex items-center gap-1.5 text-slate-300">
          <FileText size={14} className="text-red-400" />
          <span className="font-mono text-red-400 font-semibold uppercase">PDF</span>
          <span className="text-slate-400">• {formatBytes(entry.size)}</span>
          {rotation > 0 && (
            <span className="text-[10px] px-1 py-0.2 rounded bg-slate-800 text-slate-400 font-mono">
              {rotation}°
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="縮小"
          >
            <ZoomOut size={13} />
          </button>
          <span className="font-mono text-[10px] text-slate-400 w-9 text-center">
            {fit ? "Fit" : `${Math.round(zoom * 100)}%`}
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="放大"
          >
            <ZoomIn size={13} />
          </button>
          <button
            type="button"
            onClick={handleRotate}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="順時針旋轉 90°"
          >
            <RotateCw size={13} />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="重設大小與旋轉角度"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onClick={handleOpenExternal}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="以系統預設程式開啟"
          >
            <ExternalLink size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(entry.path);
              onNotify("已複製 PDF 完整路徑");
            }}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white ml-0.5"
            title="複製完整路徑"
          >
            <CopyCheck size={13} />
          </button>
        </div>
      </div>

      {/* PDF 檢視畫布 */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-2 min-h-0 bg-slate-950 relative">
        {loadError ? (
          <div className="flex flex-col items-center justify-center text-center p-6 max-w-md bg-slate-900/80 rounded-xl border border-slate-800 text-slate-300 gap-3">
            <AlertCircle size={32} className="text-red-400" />
            <div className="text-sm font-semibold text-slate-200">無法預覽此 PDF 文件</div>
            <div className="text-xs text-slate-400 leading-relaxed">
              此檔案可能已損壞、加密受密碼保護，或目前環境的 WebView 尚未就緒。您可以直接透過外部閱讀器檢視。
            </div>
            <button
              type="button"
              onClick={handleOpenExternal}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors shadow-sm"
            >
              <ExternalLink size={13} />
              以系統預設 PDF 閱讀器開啟
            </button>
          </div>
        ) : (
          <div
            className="w-full h-full transition-transform duration-150 ease-out flex items-center justify-center"
            style={{
              transform: fit ? "none" : `scale(${zoom})`,
              transformOrigin: "top center",
            }}
          >
            <iframe
              key={`${entry.path}-${rotation}`}
              src={pdfSrc}
              title={entry.name}
              onError={() => setLoadError(true)}
              style={{
                transform: rotation > 0 ? `rotate(${rotation}deg)` : "none",
                transformOrigin: "center center",
              }}
              className="w-full h-full min-h-[400px] border-0 rounded bg-white shadow-2xl"
            />
          </div>
        )}
      </div>
    </div>
  );
};
