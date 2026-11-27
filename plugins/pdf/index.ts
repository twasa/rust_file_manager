import type { PreviewPlugin } from "../../src/plugins/types";
import { PdfPreviewComponent } from "./PdfPreviewComponent";

export const pdfPlugin: PreviewPlugin = {
  id: "rfm.preview.pdf",
  name: "PDF 文件預覽器",
  description: "提供 PDF 文件預覽、縮放、旋轉角度調整與系統預設閱讀器一鍵開啟",
  version: "1.0.0",
  category: "viewer",
  defaultEnabled: true,
  extensions: [".pdf"],
  supports: (entry) => {
    const ext = (entry.extension || "").toLowerCase();
    return ext === "pdf";
  },
  component: PdfPreviewComponent,
};

export default pdfPlugin;
