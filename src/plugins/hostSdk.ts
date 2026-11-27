import React from "react";
import ReactDOM from "react-dom";
import * as TauriCore from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { pluginRegistry } from "./registry";
import { formatBytes, formatDateTime } from "../utils/formatters";
import type { PreviewPlugin } from "./types";

export interface RfmHostSdk {
  React: typeof React;
  ReactDOM: typeof ReactDOM;
  TauriCore: typeof TauriCore;
  convertFileSrc: typeof convertFileSrc;
  formatBytes: typeof formatBytes;
  formatDateTime: typeof formatDateTime;
  registerPlugin: (plugin: PreviewPlugin) => void;
  unregisterPlugin: (id: string) => void;
  getPlugin: (id: string) => PreviewPlugin | undefined;
  getAllPlugins: () => PreviewPlugin[];
  version: string;
}

declare global {
  interface Window {
    RFM?: RfmHostSdk;
  }
}

let isInitialized = false;

export function initHostSdk(): RfmHostSdk {
  if (typeof window !== "undefined" && window.RFM && isInitialized) {
    return window.RFM;
  }

  const hostSdk: RfmHostSdk = {
    React,
    ReactDOM,
    TauriCore,
    convertFileSrc,
    formatBytes,
    formatDateTime,
    registerPlugin: (plugin: PreviewPlugin) => {
      pluginRegistry.register(plugin);
    },
    unregisterPlugin: (id: string) => {
      pluginRegistry.unregister(id);
    },
    getPlugin: (id: string) => {
      return pluginRegistry.getPlugin(id);
    },
    getAllPlugins: () => {
      return pluginRegistry.getAllPlugins();
    },
    version: "1.0.0",
  };

  if (typeof window !== "undefined") {
    window.RFM = hostSdk;
  }
  isInitialized = true;
  return hostSdk;
}

// 預設初始化宿主環境
initHostSdk();
