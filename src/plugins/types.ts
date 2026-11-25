import React from "react";
import type { FileEntry, FilePreviewData } from "../types";

export interface PreviewPluginProps {
  entry: FileEntry;
  previewData: FilePreviewData | null;
  onNotify: (msg: string) => void;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
}

export interface PreviewPlugin {
  id: string;
  name: string;
  description: string;
  version: string;
  category: "viewer" | "tool";
  defaultEnabled: boolean;
  supports: (entry: FileEntry) => boolean;
  component: React.ComponentType<PreviewPluginProps>;
}

export interface PluginRegistryState {
  plugins: PreviewPlugin[];
  register: (plugin: PreviewPlugin) => void;
  unregister: (id: string) => void;
  getPlugin: (id: string) => PreviewPlugin | undefined;
  findMatchingPlugin: (
    entry: FileEntry,
    enabledMap: Record<string, boolean>
  ) => PreviewPlugin | null;
  getAllPlugins: () => PreviewPlugin[];
}
