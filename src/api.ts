import { invoke } from "@tauri-apps/api/core";
import type {
  BatchRenameExecutionResult,
  BatchRenamePreviewItem,
  BatchRenameRule,
  ConflictStrategy,
  DirectoryListing,
  FileChecksumResult,
  FilePreviewData,
  QueueRetentionPolicy,
  SystemLocations,
  TransferConflictItem,
  TransferJobSnapshot,
  TransferJobType,
} from "./types";

const isTauriRuntime = (): boolean => {
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
        { id: "home", label: "家目錄 (Home)", path: "D:/devops_workspace", icon: "home" },
        { id: "workspace", label: "工作區 (Workspace)", path: "D:/devops_workspace/private/rust_file_manager", icon: "folder-git" },
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

export async function apiReadFilePreview(path: string): Promise<FilePreviewData> {
  return invoke<FilePreviewData>("cmd_read_file_preview", { path });
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
    return "D:/devops_workspace/private/rust_file_manager/rfm-settings.json";
  }
  return invoke<string>("cmd_get_default_config_path");
}

export async function apiSaveConfigFile(
  content: string,
  targetPath?: string
): Promise<string> {
  return invoke<string>("cmd_save_config_file", {
    targetPath: targetPath || null,
    content,
  });
}

export async function apiLoadConfigFile(sourcePath?: string): Promise<string> {
  return invoke<string>("cmd_load_config_file", {
    sourcePath: sourcePath || null,
  });
}

