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
    for (const plugin of this.plugins) {
      const isEnabled = enabledMap[plugin.id] ?? plugin.defaultEnabled;
      if (isEnabled && plugin.supports(entry)) {
        return plugin;
      }
    }
    return null;
  }

  getAllPlugins(): PreviewPlugin[] {
    return [...this.plugins];
  }
}

export const pluginRegistry = new PluginRegistry();
