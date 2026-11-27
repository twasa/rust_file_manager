import type { FileEntry } from "../types";
import type { PreviewPlugin, PluginRegistryState } from "./types";

class PluginRegistry implements PluginRegistryState {
  plugins: PreviewPlugin[] = [];

  register(plugin: PreviewPlugin): void {
    const existingIndex = this.plugins.findIndex((p) => p.id === plugin.id);
    if (existingIndex >= 0) {
      this.plugins[existingIndex] = plugin;
    } else {
      this.plugins.push(plugin);
    }
  }

  unregister(id: string): void {
    this.plugins = this.plugins.filter((p) => p.id !== id);
  }

  getPlugin(id: string): PreviewPlugin | undefined {
    return this.plugins.find((p) => p.id === id);
  }

  findMatchingPlugin(
    entry: FileEntry,
    enabledMap: Record<string, boolean>
  ): PreviewPlugin | null {
    // 優先匹配特定格式外掛（非通用 code/text fallback）
    for (const plugin of this.plugins) {
      if (plugin.id === "builtin.code") continue;
      const isEnabled = enabledMap[plugin.id] ?? plugin.defaultEnabled;
      if (isEnabled && plugin.supports(entry)) {
        return plugin;
      }
    }

    // 若無專用外掛匹配，則回退至通用文字/程式碼外掛
    const fallbackPlugin = this.plugins.find((p) => p.id === "builtin.code");
    if (fallbackPlugin) {
      const isEnabled = enabledMap[fallbackPlugin.id] ?? fallbackPlugin.defaultEnabled;
      if (isEnabled && fallbackPlugin.supports(entry)) {
        return fallbackPlugin;
      }
    }

    return null;
  }

  getAllPlugins(): PreviewPlugin[] {
    return [...this.plugins];
  }
}

export const pluginRegistry = new PluginRegistry();
