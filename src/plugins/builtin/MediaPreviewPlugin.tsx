import React from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Music, Video, CopyCheck } from "lucide-react";
import { formatBytes } from "../../utils/formatters";
import type { PreviewPlugin, PreviewPluginProps } from "../types";

export const MediaPreviewComponent: React.FC<PreviewPluginProps> = ({
  entry,
  onNotify,
}) => {
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
        {isVideo ? (
          <div className="w-full max-w-lg rounded-lg overflow-hidden bg-black shadow-xl border border-slate-800">
            <video
              src={mediaSrc}
              controls
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

export const mediaPreviewPlugin: PreviewPlugin = {
  id: "builtin.media",
  name: "音訊與影片原生播放器",
  description: "支援 MP3, WAV, OGG, FLAC, MP4, WebM 原生多媒體播放控制與串流檢視",
  version: "1.0.0",
  category: "viewer",
  defaultEnabled: true,
  supports: (entry) => {
    const ext = (entry.extension || "").toLowerCase();
    return (
      entry.kind === "audio" ||
      entry.kind === "video" ||
      [
        "mp3",
        "wav",
        "ogg",
        "flac",
        "aac",
        "m4a",
        "mp4",
        "webm",
        "mkv",
        "avi",
        "mov",
        "wmv",
        "m4v",
      ].includes(ext)
    );
  },
  component: MediaPreviewComponent,
};
