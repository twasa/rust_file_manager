import {
  apiInstallPluginPackage,
  apiListInstalledPlugins,
  apiReadPluginFileContent,
  apiUninstallPlugin,
} from "../api";
import { pluginRegistry } from "./registry";
import { initHostSdk } from "./hostSdk";
import type { InstalledPluginInfo } from "./types";

/**
 * 初始化外掛系統並掃描載入所有外部已安裝外掛
 */
export async function initExternalPlugins(): Promise<InstalledPluginInfo[]> {
  initHostSdk();

  try {
    const installed = await apiListInstalledPlugins();
    for (const plugin of installed) {
      await loadSingleExternalPlugin(plugin);
    }
    return installed;
  } catch (err) {
    console.warn("載入外部外掛清單失敗:", err);
    return [];
  }
}

/**
 * 載入單一外部外掛之代碼與樣式
 */
export async function loadSingleExternalPlugin(
  info: InstalledPluginInfo
): Promise<boolean> {
  try {
    // 1. 若該外掛包含專屬 CSS 樣式檔，載入並注入至 DOM
    if (info.styles) {
      try {
        const cssContent = await apiReadPluginFileContent(info.id, info.styles);
        if (cssContent) {
          injectPluginStyle(info.id, cssContent);
        }
      } catch (styleErr) {
        console.warn(`載入外掛 ${info.id} 樣式檔失敗:`, styleErr);
      }
    }

    // 2. 讀取並執行外掛主入口 JS 代碼
    const jsContent = await apiReadPluginFileContent(info.id, info.mainFile);
    if (!jsContent.trim()) {
      return false;
    }

    // 透過 Host SDK 容器沙盒執行外掛模組代碼
    const hostSdk = initHostSdk();
    const runner = new Function("RFM", "window", jsContent);
    runner(hostSdk, window);

    return true;
  } catch (err) {
    console.error(`執行外掛 ${info.id} 失敗:`, err);
    return false;
  }
}

/**
 * 從本機壓縮包 (.rfmp / .zip) 安裝外部外掛
 */
export async function installPluginFromArchive(
  archivePath: string
): Promise<InstalledPluginInfo> {
  const installedInfo = await apiInstallPluginPackage(archivePath);
  await loadSingleExternalPlugin(installedInfo);
  return installedInfo;
}

/**
 * 解除安裝外部外掛
 */
export async function uninstallPluginById(pluginId: string): Promise<boolean> {
  const ok = await apiUninstallPlugin(pluginId);
  if (ok) {
    pluginRegistry.unregister(pluginId);
    removePluginStyle(pluginId);
  }
  return ok;
}

function injectPluginStyle(pluginId: string, css: string): void {
  if (typeof document === "undefined") return;
  const styleId = `rfm-plugin-style-${pluginId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  let el = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = styleId;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function removePluginStyle(pluginId: string): void {
  if (typeof document === "undefined") return;
  const styleId = `rfm-plugin-style-${pluginId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const el = document.getElementById(styleId);
  if (el) {
    el.remove();
  }
}
