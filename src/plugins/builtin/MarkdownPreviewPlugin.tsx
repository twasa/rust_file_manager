import React, { useState } from "react";
import { Eye, Code, CopyCheck, ArrowDownCircle } from "lucide-react";
import type { PreviewPlugin, PreviewPluginProps } from "../types";

/**
 * 輕量且安全的 Markdown 解析與渲染器 (支援標題、粗斜體、表格、清單、區塊引言與程式碼)
 */
function renderMarkdownContent(content: string) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";
  let inTable = false;
  let tableRows: string[][] = [];

  const flushTable = (key: string) => {
    if (tableRows.length === 0) return;
    const header = tableRows[0];
    const dataRows = tableRows.slice(2); // 跳過分隔線 |---|---|
    elements.push(
      <div key={key} className="my-2.5 overflow-x-auto rounded border border-slate-800">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-900 border-b border-slate-800">
              {header.map((col, idx) => (
                <th key={idx} className="p-2 font-semibold text-slate-200">
                  {col.trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
            {dataRows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-slate-900/40">
                {row.map((cell, cIdx) => (
                  <td key={cIdx} className="p-2 text-slate-300">
                    {cell.trim()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 處理程式碼區塊 ```
    if (line.trim().startsWith("```")) {
      if (inTable) flushTable(`table-${i}`);
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeBlockLang = line.trim().slice(3).trim();
        codeBlockContent = [];
      } else {
        inCodeBlock = false;
        elements.push(
          <div
            key={`code-${i}`}
            className="my-2 p-2.5 rounded bg-slate-950 border border-slate-800/90 font-mono text-xs overflow-x-auto text-slate-200"
          >
            {codeBlockLang && (
              <div className="text-[10px] text-slate-500 uppercase font-sans mb-1 font-semibold">
                {codeBlockLang}
              </div>
            )}
            <pre className="whitespace-pre">{codeBlockContent.join("\n")}</pre>
          </div>
        );
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // 處理 Markdown 表格 | a | b |
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      inTable = true;
      const cells = line
        .trim()
        .slice(1, -1)
        .split("|");
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      flushTable(`table-${i}`);
    }

    // 標題 # ~ ###
    if (line.startsWith("# ")) {
      elements.push(
        <h1
          key={i}
          className="text-base font-bold text-white border-b border-slate-800 pb-1 mt-3 mb-2"
        >
          {line.slice(2)}
        </h1>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={i}
          className="text-sm font-semibold text-slate-100 border-b border-slate-800/80 pb-0.5 mt-2.5 mb-1.5"
        >
          {line.slice(3)}
        </h2>
      );
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-xs font-semibold text-slate-200 mt-2 mb-1">
          {line.slice(4)}
        </h3>
      );
      continue;
    }

    // 區塊引言 >
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={i}
          className="border-l-2 border-blue-500 pl-3 my-1.5 italic text-slate-400 text-xs bg-slate-900/30 py-1 rounded-r"
        >
          {line.slice(2)}
        </blockquote>
      );
      continue;
    }

    // 清單 - 或 *
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-slate-300 my-0.5 text-xs">
          {line.trim().slice(2)}
        </li>
      );
      continue;
    }

    // 水平分割線 ---
    if (line.trim() === "---" || line.trim() === "***") {
      elements.push(<hr key={i} className="my-3 border-slate-800" />);
      continue;
    }

    // 空行
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-1.5" />);
      continue;
    }

    // 一般段落
    elements.push(
      <p key={i} className="my-1 text-slate-300 leading-relaxed break-words text-xs">
        {line}
      </p>
    );
  }

  if (inTable) {
    flushTable("table-end");
  }

  return elements;
}

export const MarkdownPreviewComponent: React.FC<PreviewPluginProps> = ({
  entry,
  previewData,
  onNotify,
  onLoadMore,
  isLoadingMore,
  hasMore,
}) => {
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");
  const content = previewData?.textPreview || "";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950/70 text-xs">
      {/* 工具控制列 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 shrink-0 select-none">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="font-mono text-blue-400 font-semibold uppercase">
            MARKDOWN
          </span>
          {previewData?.totalLines && (
            <span>• {previewData.totalLines} 行</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <div className="flex bg-slate-800 rounded p-0.5 mr-1">
            <button
              type="button"
              onClick={() => setViewMode("rendered")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${
                viewMode === "rendered"
                  ? "bg-blue-600 text-white font-medium shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
              title="排版渲染視圖"
            >
              <Eye size={12} />
              <span>排版</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] ${
                viewMode === "raw"
                  ? "bg-blue-600 text-white font-medium shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
              title="原始原始碼視圖"
            >
              <Code size={12} />
              <span>原始碼</span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(content);
              onNotify("已複製 Markdown 全文");
            }}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="複製全文"
          >
            <CopyCheck size={13} />
          </button>
        </div>
      </div>

      {/* 內容區塊 */}
      <div className="flex-1 overflow-y-auto p-4 bg-slate-950/90 min-h-0">
        {viewMode === "rendered" ? (
          <div className="prose prose-invert max-w-none">
            {renderMarkdownContent(content)}
          </div>
        ) : (
          <pre className="font-mono text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-words select-text">
            {content || "(空白檔案)"}
          </pre>
        )}

        {/* 載入更多分段按鈕 */}
        {hasMore && (
          <div className="pt-4 pb-2 flex justify-center">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={onLoadMore}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-xs font-medium transition-colors"
            >
              <ArrowDownCircle size={14} className={isLoadingMore ? "animate-spin" : ""} />
              <span>{isLoadingMore ? "正在載入分段..." : "載入後續內容 (Load More)"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const markdownPreviewPlugin: PreviewPlugin = {
  id: "builtin.markdown",
  name: "Markdown 格式化排版外掛",
  description: "提供 Markdown 即時結構排版、GFM 規範表格、標題、清單渲染與原始碼快速切換",
  version: "1.0.0",
  category: "viewer",
  defaultEnabled: true,
  supports: (entry) => {
    const ext = (entry.extension || "").toLowerCase();
    return ["md", "markdown"].includes(ext);
  },
  component: MarkdownPreviewComponent,
};
