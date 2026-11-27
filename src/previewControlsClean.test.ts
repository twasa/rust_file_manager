import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { mediaPreviewPlugin } from "./plugins/builtin/MediaPreviewPlugin";
import { pdfPlugin } from "../plugins/pdf";
import type { FileEntry } from "./types";

const createMockEntry = (name: string, ext: string, kind: FileEntry["kind"]): FileEntry => ({
  name,
  path: `/test/${name}`,
  isDir: false,
  isSymlink: false,
  isHidden: false,
  isReadonly: false,
  size: 1024,
  modifiedMs: Date.now(),
  createdMs: Date.now(),
  extension: ext,
  kind,
});

describe("Media & PDF Preview Controls Hygiene", () => {
  it("MediaPreviewComponent source code enforces nodownload and context menu suppression", () => {
    const mediaComponentPath = path.resolve(
      __dirname,
      "../plugins/media/MediaPreviewComponent.tsx"
    );
    const content = fs.readFileSync(mediaComponentPath, "utf-8");

    // 驗證 video 與 audio 皆已配置 controlsList="nodownload"（杜絕下載選項）
    const occurrences = (content.match(/controlsList="nodownload"/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);

    // 驗證 video 與 audio 均攔截 context menu
    expect(content).toContain("onContextMenu={(e) => e.preventDefault()}");
  });

  it("PdfPreviewComponent source code enforces toolbar suppression hash and context menu suppression", () => {
    const pdfComponentPath = path.resolve(
      __dirname,
      "../plugins/pdf/PdfPreviewComponent.tsx"
    );
    const content = fs.readFileSync(pdfComponentPath, "utf-8");

    // 驗證 PDF 載入參數具備完整之 toolbar 與功能抑制參數
    expect(content).toContain(
      "#toolbar=0&navpanes=0&scrollbar=0&statusbar=0&messages=0"
    );

    // 驗證 iframe 阻擋原生右鍵選單以杜絕分享選單
    expect(content).toContain("onContextMenu={(e) => e.preventDefault()}");
  });

  it("mediaPreviewPlugin correctly identifies video and audio extensions", () => {
    const testVideo = createMockEntry("sample.mp4", "mp4", "video");
    const testAudio = createMockEntry("music.mp3", "mp3", "audio");
    const testText = createMockEntry("note.txt", "txt", "document");

    expect(mediaPreviewPlugin.supports(testVideo)).toBe(true);
    expect(mediaPreviewPlugin.supports(testAudio)).toBe(true);
    expect(mediaPreviewPlugin.supports(testText)).toBe(false);
  });

  it("pdfPlugin correctly identifies pdf extensions", () => {
    const testPdf = createMockEntry("doc.pdf", "pdf", "document");
    const testImage = createMockEntry("pic.png", "png", "image");

    expect(pdfPlugin.supports(testPdf)).toBe(true);
    expect(pdfPlugin.supports(testImage)).toBe(false);
  });
});
