import React from "react";
import {
  Folder,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileCode,
  Terminal,
  File,
  FolderSymlink,
} from "lucide-react";
import type { EntryKind } from "../types";

interface FileIconProps {
  kind: EntryKind;
  size?: number;
}

export const FileEntryIcon: React.FC<FileIconProps> = ({ kind, size = 18 }) => {
  switch (kind) {
    case "directory":
      return <Folder size={size} className="text-amber-400 fill-amber-400/20 shrink-0" />;
    case "symlink":
      return <FolderSymlink size={size} className="text-cyan-400 shrink-0" />;
    case "image":
      return <FileImage size={size} className="text-emerald-400 shrink-0" />;
    case "video":
      return <FileVideo size={size} className="text-purple-400 shrink-0" />;
    case "audio":
      return <FileAudio size={size} className="text-pink-400 shrink-0" />;
    case "archive":
      return <FileArchive size={size} className="text-orange-400 shrink-0" />;
    case "code":
      return <FileCode size={size} className="text-sky-400 shrink-0" />;
    case "document":
      return <FileText size={size} className="text-blue-300 shrink-0" />;
    case "executable":
      return <Terminal size={size} className="text-rose-400 shrink-0" />;
    default:
      return <File size={size} className="text-slate-400 shrink-0" />;
  }
};
