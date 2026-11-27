import type { PreviewPlugin } from "../../src/plugins/types";
import { MarkdownPreviewComponent } from "./MarkdownPreviewComponent";

export const markdownPlugin: PreviewPlugin = {
  id: "rfm.preview.markdown",
  name: "Markdown 結構排版檢視器",
  description: "提供 Markdown 即時結構排版（標題、清單、引言、GFM 表格）與原始碼一鍵切換視圖",
  version: "1.0.0",
  category: "viewer",
  defaultEnabled: true,
  extensions: [".md", ".markdown", ".mdown", ".mkd"],
  supports: (entry) => {
    const ext = (entry.extension || "").toLowerCase();
    return ["md", "markdown", "mdown", "mkd"].includes(ext);
  },
  component: MarkdownPreviewComponent,
};

export default markdownPlugin;
