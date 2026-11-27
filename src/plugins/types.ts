import React from "react";
import type { FileEntry, FilePreviewData } from "../types";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: "viewer" | "tool";
  author?: string;
  extensions: string[];
  main: string;
  styles?: string;
  icon?: string;
}

export interface InstalledPluginInfo extends PluginManifest {
  dirPath: string;
  mainFile: string;
  mainFilePath: string;
  styleFilePath?: string;
  isBuiltin: boolean;
}

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
  extensions?: string[];
  isExternal?: boolean;
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
