export type EntryKind =
  | "directory"
  | "symlink"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "document"
  | "executable"
  | "file";

export interface FileEntry {
  name: string;
  path: string;
  isDir: boolean;
  isSymlink: boolean;
  isHidden: boolean;
  isReadonly: boolean;
  size: number;
  modifiedMs: number;
  createdMs: number;
  extension: string;
  kind: EntryKind;
}

export interface DirectoryListing {
  path: string;
  parentPath: string | null;
  entries: FileEntry[];
  totalFiles: number;
  totalDirs: number;
  totalSize: number;
  fromCache: boolean;
  elapsedMs: number;
}

export interface VolumeInfo {
  name: string;
  mountPoint: string;
  fileSystem: string;
  totalSpace: number;
  availableSpace: number;
  isRemovable: boolean;
}

export interface SpecialLocation {
  id: string;
  label: string;
  path: string;
  icon: string;
}

export interface SystemLocations {
  osPlatform: string;
  homeDir: string;
  volumes: VolumeInfo[];
  specialLocations: SpecialLocation[];
}

export type TransferJobType = "copy" | "move" | "delete" | "trash";
export type ConflictStrategy = "ask" | "overwrite" | "skip" | "rename";

export interface TransferConflictItem {
  sourcePath: string;
  targetPath: string;
  name: string;
  isDir: boolean;
  sourceSize: number;
  targetSize: number;
  sourceModifiedMs: number;
  targetModifiedMs: number;
}
export type JobStatus =
  | "queued"
  | "scanning"
  | "running"
  | "paused"
  | "completed"
  | "cancelled"
  | "failed";

export interface TransferJobSnapshot {
  id: string;
  jobType: TransferJobType;
  sources: string[];
  destination: string | null;
  conflictStrategy: ConflictStrategy;
  status: JobStatus;
  totalBytes: number;
  processedBytes: number;
  totalFiles: number;
  processedFiles: number;
  skippedFiles: number;
  overwrittenFiles: number;
  renamedFiles: number;
  currentFile: string;
  speedBytesPerSec: number;
  createdAtMs: number;
  errorMessage: string | null;
}

export interface BatchRenameRule {
  findText: string;
  replaceText: string;
  useRegex: boolean;
  caseSensitive: boolean;
  prefix: string;
  suffix: string;
  caseTransform: "none" | "lower" | "upper" | "title";
  sequenceEnabled: boolean;
  sequenceStart: number;
  sequenceStep: number;
  sequencePadding: number;
  sequencePosition: "prefix" | "suffix" | "replace_name";
  extensionOverride: string;
}

export interface BatchRenamePreviewItem {
  originalPath: string;
  originalName: string;
  newName: string;
  newPath: string;
  changed: boolean;
  hasConflict: boolean;
  error: string | null;
}

export interface BatchRenameExecutionResult {
  successCount: number;
  skippedCount: number;
  errors: string[];
  undoPairs: [string, string][];
}

export interface FileChecksumResult {
  path: string;
  size: number;
  md5: string;
  sha256: string;
  crc32: string;
  elapsedMs: number;
}

export interface FilePreviewData {
  path: string;
  name: string;
  kind: EntryKind;
  size: number;
  modifiedMs: number;
  isBinary: boolean;
  textPreview: string | null;
  totalLines: number | null;
  dirItemCount: number | null;
}

export type SortField = "name" | "size" | "modifiedMs" | "extension";
export type SortDirection = "asc" | "desc";
export type ViewMode = "details" | "grid";

export interface TabItem {
  id: string;
  title: string;
  path: string;
  history: string[];
  historyIndex: number;
  color: string; // e.g. "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#a855f7", "none"
  locked: boolean;
  sortField: SortField;
  sortDirection: SortDirection;
  viewMode: ViewMode;
  filterQuery: string;
  selectedPaths: string[];
  lastSelectedPath: string | null;
}

export type PaneId = "left" | "right";

export type ShortcutActionId =
  | "rename_selected"
  | "batch_rename"
  | "copy_selected"
  | "cut_selected"
  | "paste_items"
  | "trash_selected"
  | "delete_permanent"
  | "new_tab"
  | "close_tab"
  | "lock_tab"
  | "refresh"
  | "new_folder"
  | "select_all"
  | "focus_search"
  | "go_up"
  | "toggle_dual_pane"
  | "toggle_queue"
  | "toggle_hidden"
  | "open_terminal";

export interface KeybindingItem {
  id: ShortcutActionId;
  label: string;
  description: string;
  keyCombo: string; // e.g. "F2", "Ctrl+Shift+R", "Ctrl+C", "Shift+Delete"
  defaultCombo: string;
}

export interface FontSettings {
  fontFamily: string;
  fontSizePx: number;
  rowHeightPx: number;
  uiFontSizePx: number;
}

export interface DragPayload {
  sourcePane: PaneId;
  paths: string[];
}
