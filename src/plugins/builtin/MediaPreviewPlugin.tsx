import { MediaPreviewComponent } from "../../../plugins/media/MediaPreviewComponent";
import type { PreviewPlugin } from "../types";

export { MediaPreviewComponent };

export const mediaPreviewPlugin: PreviewPlugin = {
  id: "builtin.media",
  name: "音訊與影片原生播放器",
  description: "支援 MP3, WAV, OGG, FLAC, MP4, WebM 原生多媒體播放控制與串流檢視",
  version: "1.0.0",
  category: "viewer",
  defaultEnabled: true,
  extensions: [
    ".mp3",
    ".wav",
    ".ogg",
    ".flac",
    ".aac",
    ".m4a",
    ".mp4",
    ".webm",
    ".mkv",
    ".avi",
    ".mov",
    ".wmv",
    ".m4v",
  ],
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
