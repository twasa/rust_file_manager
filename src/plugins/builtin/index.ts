import { pluginRegistry } from "../registry";
import { imagePreviewPlugin } from "./ImagePreviewPlugin";
import { mediaPreviewPlugin } from "./MediaPreviewPlugin";
import { markdownPreviewPlugin } from "./MarkdownPreviewPlugin";
import { codePreviewPlugin } from "./CodePreviewPlugin";

export function registerBuiltinPlugins(): void {
  pluginRegistry.register(imagePreviewPlugin);
  pluginRegistry.register(mediaPreviewPlugin);
  pluginRegistry.register(markdownPreviewPlugin);
  pluginRegistry.register(codePreviewPlugin);
}

// 自動註冊官方內建外掛
registerBuiltinPlugins();
