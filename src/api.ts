import { invoke } from "@tauri-apps/api/core";
import type {
  BatchRenameExecutionResult,
  BatchRenamePreviewItem,
  BatchRenameRule,
  ConflictStrategy,
  DirStats,
  DirectoryListing,
  FileChecksumResult,
  FileChunkData,
  FilePreviewData,
  ItemDetailedInfo,
  LogFormat,
  LogLevel,
  QueueRetentionPolicy,
  StructuredLogRecord,
  SystemLocations,
  TransferConflictItem,
  TransferJobSnapshot,
  TransferJobType,
} from "./types";

export const isTauriRuntime = (): boolean => {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
};

export async function apiGetSystemLocations(): Promise<SystemLocations> {
  if (!isTauriRuntime()) {
    return {
      osPlatform: "windows",
      homeDir: "D:/devops_workspace",
      volumes: [
        {
          name: "System (C:)",
          mountPoint: "C:/",
          fileSystem: "NTFS",
          totalSpace: 512_000_000_000,
          availableSpace: 240_000_000_000,
          isRemovable: false,
        },
        {
          name: "Workspace (D:)",
          mountPoint: "D:/",
          fileSystem: "NTFS",
          totalSpace: 1_024_000_000_000,
          availableSpace: 680_000_000_000,
          isRemovable: false,
        },
      ],
      specialLocations: [
        { id: "home", label: "家目錄 (Home)", path: "~", icon: "home" },
      ],
    };
  }
  return invoke<SystemLocations>("cmd_get_system_locations");
}

export async function apiReadDirectory(
  path: string,
  forceRefresh = false
): Promise<DirectoryListing> {
  if (!isTauriRuntime()) {
    return {
      path: path || "D:/devops_workspace",
      parentPath: "D:/",
      entries: [],
      totalFiles: 0,
      totalDirs: 0,
      totalSize: 0,
      fromCache: false,
      elapsedMs: 1,
    };
  }
  return invoke<DirectoryListing>("cmd_read_directory", {
    path,
    forceRefresh,
  });
}

export async function apiReadFilePreview(
  path: string,
  maxBytes?: number
): Promise<FilePreviewData> {
  return invoke<FilePreviewData>("cmd_read_file_preview", {
    path,
    maxBytes: maxBytes ?? null,
  });
}

export async function apiReadFileChunk(
  path: string,
  offset: number,
  length: number
): Promise<FileChunkData> {
  if (!isTauriRuntime()) {
    return {
      path,
      offset,
      bytesRead: 0,
      totalSize: 0,
      content: "",
      isBinary: false,
      hasMore: false,
    };
  }
  return invoke<FileChunkData>("cmd_read_file_chunk", { path, offset, length });
}

export async function apiGetItemDetailedInfo(
  path: string
): Promise<ItemDetailedInfo> {
  if (!isTauriRuntime()) {
    return {
      name: path.split("/").pop() || path,
      path,
      parentPath: path.split("/").slice(0, -1).join("/") || "/",
      isDir: false,
      isSymlink: false,
      symlinkTarget: null,
      isHidden: false,
      isReadonly: false,
      size: 1024,
      modifiedMs: Date.now(),
      createdMs: Date.now(),
      accessedMs: Date.now(),
      extension: path.split(".").pop() || "",
      kind: "file",
      typeDescription: "檔案",
    };
  }
  return invoke<ItemDetailedInfo>("cmd_get_item_detailed_info", { path });
}

export async function apiCalculateDirStats(path: string): Promise<DirStats> {
  if (!isTauriRuntime()) {
    return { totalFiles: 0, totalDirs: 0, totalBytes: 0 };
  }
  return invoke<DirStats>("cmd_calculate_dir_stats", { path });
}

export async function apiCalculateMultiItemStats(
  paths: string[]
): Promise<DirStats> {
  if (!isTauriRuntime()) {
    return { totalFiles: paths.length, totalDirs: 0, totalBytes: 0 };
  }
  return invoke<DirStats>("cmd_calculate_multi_item_stats", { paths });
}

export async function apiCreateDirectory(
  parentPath: string,
  dirName: string
): Promise<string> {
  return invoke<string>("cmd_create_directory", { parentPath, dirName });
}

export async function apiCreateFile(
  parentPath: string,
  fileName: string
): Promise<string> {
  return invoke<string>("cmd_create_file", { parentPath, fileName });
}

export async function apiRenameItem(
  path: string,
  newName: string
): Promise<string> {
  return invoke<string>("cmd_rename_item", { path, newName });
}

export async function apiCheckTransferConflicts(
  sources: string[],
  destination: string
): Promise<TransferConflictItem[]> {
  if (!isTauriRuntime()) return [];
  return invoke<TransferConflictItem[]>("cmd_check_transfer_conflicts", {
    sources,
    destination,
  });
}

export async function apiEnqueueTransfer(
  jobType: TransferJobType,
  sources: string[],
  destination: string | null,
  conflictStrategy: ConflictStrategy = "rename"
): Promise<TransferJobSnapshot> {
  return invoke<TransferJobSnapshot>("cmd_enqueue_transfer", {
    jobType,
    sources,
    destination,
    conflictStrategy,
  });
}

export async function apiListTransferJobs(): Promise<TransferJobSnapshot[]> {
  if (!isTauriRuntime()) return [];
  return invoke<TransferJobSnapshot[]>("cmd_list_transfer_jobs");
}

export async function apiControlTransferJob(
  jobId: string,
  action: "pause" | "resume" | "cancel" | "remove" | "clear_completed"
): Promise<TransferJobSnapshot[]> {
  return invoke<TransferJobSnapshot[]>("cmd_control_transfer_job", {
    jobId,
    action,
  });
}

export async function apiSetQueueRetention(
  policy: QueueRetentionPolicy
): Promise<TransferJobSnapshot[]> {
  if (!isTauriRuntime()) return [];
  return invoke<TransferJobSnapshot[]>("cmd_set_queue_retention", {
    policy,
  });
}

export async function apiPreviewBatchRename(
  paths: string[],
  rule: BatchRenameRule
): Promise<BatchRenamePreviewItem[]> {
  return invoke<BatchRenamePreviewItem[]>("cmd_preview_batch_rename", {
    paths,
    rule,
  });
}

export async function apiExecuteBatchRename(
  paths: string[],
  rule: BatchRenameRule
): Promise<BatchRenameExecutionResult> {
  return invoke<BatchRenameExecutionResult>("cmd_execute_batch_rename", {
    paths,
    rule,
  });
}

export async function apiUndoBatchRename(
  undoPairs: [string, string][]
): Promise<number> {
  return invoke<number>("cmd_undo_batch_rename", { undoPairs });
}

export async function apiComputeChecksum(
  path: string
): Promise<FileChecksumResult> {
  return invoke<FileChecksumResult>("cmd_compute_checksum", { path });
}

export async function apiOpenItem(path: string): Promise<void> {
  return invoke<void>("cmd_open_item", { path });
}

export async function apiOpenTerminal(path: string): Promise<void> {
  return invoke<void>("cmd_open_terminal", { path });
}

export async function apiRevealInShell(path: string): Promise<void> {
  return invoke<void>("cmd_reveal_in_shell", { path });
}

export async function apiExtractArchive(
  archivePath: string,
  destDir?: string
): Promise<string> {
  return invoke<string>("cmd_extract_archive", { archivePath, destDir });
}

export async function apiCompressToZip(
  sources: string[],
  outputZipPath: string
): Promise<string> {
  return invoke<string>("cmd_compress_to_zip", { sources, outputZipPath });
}

export async function apiClearCache(): Promise<void> {
  return invoke<void>("cmd_clear_cache");
}

export async function apiGetDefaultConfigPath(): Promise<string> {
  if (!isTauriRuntime()) {
    return "D:/devops_workspace/private/rust_file_manager/settings.json";
  }
  return invoke<string>("cmd_get_default_config_path");
}

export async function apiSaveConfigFile(
  content: string,
  targetPath?: string
): Promise<string> {
  if (!isTauriRuntime()) {
    return targetPath || "D:/devops_workspace/private/rust_file_manager/settings.json";
  }
  return invoke<string>("cmd_save_config_file", {
    targetPath: targetPath || null,
    content,
  });
}

export async function apiLoadConfigFile(sourcePath?: string): Promise<string> {
  if (!isTauriRuntime()) {
    return "";
  }
  return invoke<string>("cmd_load_config_file", {
    sourcePath: sourcePath || null,
  });
}

export interface ImportConfigResult {
  path: string;
  content: string;
}

export async function apiExportConfigWithDialog(
  content: string,
  defaultFilename?: string
): Promise<string | null> {
  if (!isTauriRuntime()) {
    return defaultFilename || "rfm-settings.json";
  }
  return invoke<string | null>("cmd_export_config_with_dialog", {
    content,
    defaultFilename: defaultFilename || null,
  });
}

export async function apiImportConfigWithDialog(): Promise<ImportConfigResult | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<ImportConfigResult | null>("cmd_import_config_with_dialog");
}

export async function apiGetLogFilePath(): Promise<string> {
  if (!isTauriRuntime()) {
    return "D:/devops_workspace/private/rust_file_manager/logs/rfm.jsonl";
  }
  return invoke<string>("cmd_get_log_file_path");
}

export async function apiReadLogs(limit = 200): Promise<StructuredLogRecord[]> {
  if (!isTauriRuntime()) return [];
  return invoke<StructuredLogRecord[]>("cmd_read_logs", { limit });
}

export async function apiClearLogs(): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_clear_logs");
}

export async function apiSetLogFormat(format: LogFormat): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_set_log_format", { format });
}

export async function apiGetLogLevel(): Promise<LogLevel> {
  if (!isTauriRuntime()) return "error";
  return invoke<LogLevel>("cmd_get_log_level");
}

export async function apiSetLogLevel(level: LogLevel): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_set_log_level", { level });
}

export async function apiWriteFrontendLog(
  level: "INFO" | "WARN" | "ERROR",
  target: string,
  event: string,
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_write_frontend_log", {
    level,
    target,
    event,
    message,
    context: context || null,
  });
}

export interface SystemClipboardFilesResult {
  paths: string[];
  is_cut: boolean;
}

export async function apiGetSystemClipboardFiles(): Promise<SystemClipboardFilesResult | null> {
  if (!isTauriRuntime()) return null;
  return invoke<SystemClipboardFilesResult | null>("cmd_get_system_clipboard_files");
}

export async function apiSetSystemClipboardFiles(
  paths: string[],
  isCut: boolean
): Promise<void> {
  if (!isTauriRuntime()) return;
  return invoke<void>("cmd_set_system_clipboard_files", {
    paths,
    isCut,
  });
}

const TRANSPARENT_DRAG_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export async function apiStartNativeDrag(
  paths: string[],
  isCut = false
): Promise<void> {
  if (!isTauriRuntime() || paths.length === 0) return;
  try {
    const { startDrag } = await import("@crabnebula/tauri-plugin-drag");
    await startDrag({
      item: paths,
      icon: TRANSPARENT_DRAG_ICON,
      mode: isCut ? "move" : "copy",
    });
  } catch (err) {
    console.error("apiStartNativeDrag error:", err);
  }
}



