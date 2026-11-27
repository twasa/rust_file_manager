import { pluginRegistry } from "../registry";
import { imagePreviewPlugin } from "./ImagePreviewPlugin";
import { mediaPreviewPlugin } from "./MediaPreviewPlugin";
import { markdownPreviewPlugin } from "./MarkdownPreviewPlugin";
import { codePreviewPlugin } from "./CodePreviewPlugin";
import { pdfPlugin } from "../../../plugins/pdf";

export function registerBuiltinPlugins(): void {
  pluginRegistry.register(imagePreviewPlugin);
  pluginRegistry.register(mediaPreviewPlugin);
  pluginRegistry.register(markdownPreviewPlugin);
  pluginRegistry.register(pdfPlugin);
  pluginRegistry.register(codePreviewPlugin);
}

// 自動註冊官方內建模組外掛
registerBuiltinPlugins();
