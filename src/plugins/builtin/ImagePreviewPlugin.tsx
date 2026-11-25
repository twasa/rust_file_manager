import React, { useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, CopyCheck } from "lucide-react";
import { formatBytes } from "../../utils/formatters";
import type { PreviewPlugin, PreviewPluginProps } from "../types";

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
            className={
              fit
                ? "max-w-full max-h-[60vh] object-contain rounded shadow-lg select-none pointer-events-none"
                : "max-w-none rounded shadow-lg select-none pointer-events-none"
            }
          />
        </div>
      </div>
    </div>
  );
};

export const imagePreviewPlugin: PreviewPlugin = {
  id: "builtin.image",
  name: "圖片與向量圖預覽器",
  description: "提供 PNG, JPG, WebP, GIF, SVG, BMP 縮圖預覽、縮放與原始解析度資訊檢視",
  version: "1.0.0",
  category: "viewer",
  defaultEnabled: true,
  supports: (entry) => {
    const ext = (entry.extension || "").toLowerCase();
    return (
      entry.kind === "image" ||
      ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico", "tiff", "avif"].includes(
        ext
      )
    );
  },
  component: ImagePreviewComponent,
};
