import { ImagePreviewComponent } from "../../../plugins/image/ImagePreviewComponent";
import type { PreviewPlugin } from "../types";

export { ImagePreviewComponent };

export const imagePreviewPlugin: PreviewPlugin = {
  id: "builtin.image",
  name: "圖片與向量圖預覽器",
  description: "提供 PNG, JPG, WebP, GIF, SVG, BMP 縮圖預覽、縮放與原始解析度資訊檢視",
  version: "1.0.0",
  category: "viewer",
  defaultEnabled: true,
  extensions: [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".bmp", ".ico", ".tiff", ".avif"],
  supports: (entry) => {
    const ext = (entry.extension || "").toLowerCase();
    return (
      entry.kind === "image" ||
      ["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico", "tiff", "avif"].includes(
        ext
      )
    );
  },
  component: ImagePreviewComponent,
};
