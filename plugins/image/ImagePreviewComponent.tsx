import React, { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ZoomIn, ZoomOut, RotateCcw, CopyCheck, AlertCircle, ExternalLink } from "lucide-react";
import { apiOpenItem } from "../../src/api";
import { formatBytes } from "../../src/utils/formatters";
import type { PreviewPluginProps } from "../../src/plugins/types";

export const ImagePreviewComponent: React.FC<PreviewPluginProps> = ({
  entry,
  onNotify,
}) => {
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState(true);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [entry.path]);

  const imgSrc = convertFileSrc(entry.path);

  const handleZoomIn = () => {
    setFit(false);
    setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100));
  };

  const handleZoomOut = () => {
    setFit(false);
    setZoom((z) => Math.max(0.25, Math.round((z - 0.25) * 100) / 100));
  };

  const handleReset = () => {
    setFit(true);
    setZoom(1);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950/70">
      {/* 圖片輔助控制列 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 text-[11px] shrink-0 select-none">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="font-mono text-emerald-400 font-medium uppercase">
            {entry.extension || "IMG"}
          </span>
          {dimensions && (
            <span>
              • {dimensions.width} × {dimensions.height} px
            </span>
          )}
          <span>• {formatBytes(entry.size)}</span>
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
            onClick={handleReset}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="自適應大小 (Fit)"
          >
            <RotateCcw size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(entry.path);
              onNotify("已複製圖片完整路徑");
            }}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white ml-1"
            title="複製完整路徑"
          >
            <CopyCheck size={13} />
          </button>
        </div>
      </div>

      {/* 圖片預覽畫布 */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 min-h-0 bg-slate-950/90 relative">
        {loadError ? (
          <div className="flex flex-col items-center justify-center text-center p-6 max-w-md bg-slate-900/80 rounded-xl border border-slate-800 text-slate-300 gap-3">
            <AlertCircle size={32} className="text-amber-400" />
            <div className="text-sm font-semibold text-slate-200">無法預覽此圖片</div>
            <div className="text-xs text-slate-400 leading-relaxed">
              此格式可能包含特殊色彩配置、編碼或受系統環境限制。您可以嘗試使用作業系統預設的圖片檢視器開啟此檔案。
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await apiOpenItem(entry.path);
                  onNotify("已使用系統預設程式開啟");
                } catch {
                  onNotify("無法開啟此檔案");
                }
              }}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors shadow-sm"
            >
              <ExternalLink size={13} />
              以系統預設程式開啟
            </button>
          </div>
        ) : (
          <div
            className="relative transition-transform duration-100 ease-out flex items-center justify-center"
            style={{
              transform: fit ? "none" : `scale(${zoom})`,
              transformOrigin: "center center",
            }}
          >
            <img
              src={imgSrc}
              alt={entry.name}
              onLoad={(e) => {
                const img = e.currentTarget;
                setDimensions({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                });
              }}
              onError={() => setLoadError(true)}
              className={
                fit
                  ? "max-w-full max-h-[60vh] object-contain rounded shadow-lg select-none pointer-events-none"
                  : "max-w-none rounded shadow-lg select-none pointer-events-none"
              }
            />
          </div>
        )}
      </div>
    </div>
  );
};
