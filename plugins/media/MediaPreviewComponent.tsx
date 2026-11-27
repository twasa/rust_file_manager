import React, { useState, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Music, Video, CopyCheck, AlertCircle, ExternalLink } from "lucide-react";
import { apiOpenItem } from "../../src/api";
import { formatBytes } from "../../src/utils/formatters";
import type { PreviewPluginProps } from "../../src/plugins/types";

export const MediaPreviewComponent: React.FC<PreviewPluginProps> = ({
  entry,
  onNotify,
}) => {
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoadError(false);
  }, [entry.path]);

  const isVideo =
    entry.kind === "video" ||
    ["mp4", "webm", "mkv", "avi", "mov", "wmv", "m4v"].includes(
      (entry.extension || "").toLowerCase()
    );

  const mediaSrc = convertFileSrc(entry.path);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950/70">
      {/* 媒體資訊列 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 text-[11px] shrink-0 select-none">
        <div className="flex items-center gap-1.5 text-slate-300">
          {isVideo ? (
            <Video size={13} className="text-purple-400" />
          ) : (
            <Music size={13} className="text-amber-400" />
          )}
          <span className="font-mono text-purple-400 font-medium uppercase">
            {entry.extension || (isVideo ? "VIDEO" : "AUDIO")}
          </span>
          <span className="text-slate-400">• {formatBytes(entry.size)}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(entry.path);
            onNotify("已複製媒體檔案路徑");
          }}
          className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
          title="複製完整路徑"
        >
          <CopyCheck size={13} />
        </button>
      </div>

      {/* 播放器區域 */}
      <div className="flex-1 overflow-auto flex flex-col items-center justify-center p-4 bg-slate-950/90 gap-4">
        {loadError ? (
          <div className="flex flex-col items-center justify-center text-center p-6 max-w-md bg-slate-900/80 rounded-xl border border-slate-800 text-slate-300 gap-3">
            <AlertCircle size={32} className="text-amber-400" />
            <div className="text-sm font-semibold text-slate-200">
              無法直接播放此{isVideo ? "影片" : "音訊"}
            </div>
            <div className="text-xs text-slate-400 leading-relaxed">
              系統內建 WebView 播放器主要支援標準串流編碼（如 MP4 / H.264、WebM、MP3、WAV、OGG）。特殊封裝（如 MKV、AVI、WMV、FLAC 或非標準編碼）建議使用系統已安裝的專業影音播放器（如 VLC、MPC-HC、PotPlayer 等）直接開啟。
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  await apiOpenItem(entry.path);
                  onNotify("已使用系統預設播放器開啟");
                } catch {
                  onNotify("無法開啟此檔案");
                }
              }}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors shadow-sm"
            >
              <ExternalLink size={13} />
              以系統預設程式開啟
            </button>
          </div>
        ) : isVideo ? (
          <div className="w-full max-w-lg rounded-lg overflow-hidden bg-black shadow-xl border border-slate-800">
            <video
              src={mediaSrc}
              controls
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              onError={() => setLoadError(true)}
              className="w-full max-h-[50vh] object-contain"
              preload="metadata"
            >
              您的系統環境不支援直接播放此影片格式
            </video>
          </div>
        ) : (
          <div className="w-full max-w-md p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col items-center gap-3 shadow-lg">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Music size={28} />
            </div>
            <div className="text-center font-medium text-slate-200 text-xs truncate max-w-full px-2">
              {entry.name}
            </div>
            <audio
              src={mediaSrc}
              controls
              controlsList="nodownload"
              onContextMenu={(e) => e.preventDefault()}
              onError={() => setLoadError(true)}
              className="w-full mt-1"
              preload="metadata"
            >
              您的系統環境不支援直接播放此音訊格式
            </audio>
          </div>
        )}
      </div>
    </div>
  );
};
