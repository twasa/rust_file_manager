import { describe, it, expect } from "vitest";
import { pluginRegistry } from "./registry";
import "./builtin";
import { imagePreviewPlugin } from "./builtin/ImagePreviewPlugin";
import { mediaPreviewPlugin } from "./builtin/MediaPreviewPlugin";
import { markdownPreviewPlugin } from "./builtin/MarkdownPreviewPlugin";
import { codePreviewPlugin } from "./builtin/CodePreviewPlugin";
import { pdfPlugin } from "../../plugins/pdf";
import type { FileEntry } from "../types";

describe("Plugin Registry & Preview Plugins", () => {
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

  it("registers and lists all builtin and modular plugins", () => {
    const plugins = pluginRegistry.getAllPlugins();
    const ids = plugins.map((p) => p.id);
    expect(ids).toContain("builtin.image");
    expect(ids).toContain("builtin.media");
    expect(ids).toContain("builtin.markdown");
    expect(ids).toContain("builtin.code");
    expect(ids).toContain("rfm.preview.pdf");
  });

  it("correctly matches image entry to image plugin", () => {
    const pngEntry = createMockEntry("photo.png", "png", "image");
    const matched = pluginRegistry.findMatchingPlugin(pngEntry, {});
    expect(matched?.id).toBe("builtin.image");

    const svgEntry = createMockEntry("logo.svg", "svg", "image");
    expect(pluginRegistry.findMatchingPlugin(svgEntry, {})?.id).toBe("builtin.image");
  });

  it("correctly matches audio and video entries to media plugin", () => {
    const mp3Entry = createMockEntry("song.mp3", "mp3", "audio");
    expect(pluginRegistry.findMatchingPlugin(mp3Entry, {})?.id).toBe("builtin.media");

    const mp4Entry = createMockEntry("movie.mp4", "mp4", "video");
    expect(pluginRegistry.findMatchingPlugin(mp4Entry, {})?.id).toBe("builtin.media");
  });

  it("correctly matches markdown entries to markdown plugin", () => {
    const mdEntry = createMockEntry("README.md", "md", "document");
    expect(pluginRegistry.findMatchingPlugin(mdEntry, {})?.id).toBe("builtin.markdown");
  });

  it("correctly matches pdf entries to pdf plugin", () => {
    const pdfEntry = createMockEntry("spec.pdf", "pdf", "document");
    expect(pluginRegistry.findMatchingPlugin(pdfEntry, {})?.id).toBe("rfm.preview.pdf");
  });

  it("correctly matches source code entries to code plugin", () => {
    const rsEntry = createMockEntry("main.rs", "rs", "code");
    expect(pluginRegistry.findMatchingPlugin(rsEntry, {})?.id).toBe("builtin.code");

    const tsEntry = createMockEntry("app.tsx", "tsx", "code");
    expect(pluginRegistry.findMatchingPlugin(tsEntry, {})?.id).toBe("builtin.code");
  });

  it("respects enabled/disabled state in pluginsConfig", () => {
    const mdEntry = createMockEntry("notes.md", "md", "document");

    // 當停用 builtin.markdown 時，會回退至其他支援的外掛 (如 codePlugin) 或 null
    const matchedWithDisabled = pluginRegistry.findMatchingPlugin(mdEntry, {
      "builtin.markdown": false,
    });
    expect(matchedWithDisabled?.id).not.toBe("builtin.markdown");

    // 當停用 pdf 外掛時，pdf 檔案不應匹配 pdf 外掛
    const pdfEntry = createMockEntry("report.pdf", "pdf", "document");
    const disabledPdf = pluginRegistry.findMatchingPlugin(pdfEntry, {
      "rfm.preview.pdf": false,
    });
    expect(disabledPdf?.id).not.toBe("rfm.preview.pdf");

    // 當所有外掛皆被停用時，匹配結果應為 null
    const allDisabled = {
      "builtin.image": false,
      "builtin.media": false,
      "builtin.markdown": false,
      "builtin.code": false,
      "rfm.preview.pdf": false,
    };
    expect(pluginRegistry.findMatchingPlugin(mdEntry, allDisabled)).toBeNull();
  });

  it("supports dynamic registration and unregistration", () => {
    const testPluginId = "test.dynamic.plugin";
    expect(pluginRegistry.getPlugin(testPluginId)).toBeUndefined();

    pluginRegistry.register({
      id: testPluginId,
      name: "動態外掛測試",
      description: "測試動態註冊",
      version: "1.0.0",
      category: "viewer",
      defaultEnabled: true,
      supports: (e) => e.extension === "test",
      component: () => null,
    });

    expect(pluginRegistry.getPlugin(testPluginId)).toBeDefined();
    const testEntry = createMockEntry("sample.test", "test", "file");
    expect(pluginRegistry.findMatchingPlugin(testEntry, {})?.id).toBe(testPluginId);

    pluginRegistry.unregister(testPluginId);
    expect(pluginRegistry.getPlugin(testPluginId)).toBeUndefined();
    expect(pluginRegistry.findMatchingPlugin(testEntry, {})).toBeNull();
  });
});
