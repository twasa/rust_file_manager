import React, { useState } from "react";
import { Eye, Code, CopyCheck, ArrowDownCircle } from "lucide-react";
import type { PreviewPluginProps } from "../../src/plugins/types";

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
    const dataRows = tableRows.slice(2);
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

    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      elements.push(
        <li key={i} className="ml-4 list-disc text-slate-300 my-0.5 text-xs">
          {line.trim().slice(2)}
        </li>
      );
      continue;
    }

    if (!line.trim()) {
      elements.push(<div key={i} className="h-2" />);
      continue;
    }

    elements.push(
      <p key={i} className="my-1 text-xs text-slate-300 leading-relaxed">
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
  const text = previewData?.textPreview || "";

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950/70">
      {/* 工具列 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 text-[11px] shrink-0 select-none">
        <div className="flex items-center gap-1 bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60">
          <button
            type="button"
            onClick={() => setViewMode("rendered")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
              viewMode === "rendered"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Eye size={12} />
            排版視圖
          </button>
          <button
            type="button"
            onClick={() => setViewMode("raw")}
            className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all ${
              viewMode === "raw"
                ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Code size={12} />
            原始碼
          </button>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400 font-mono mr-1">
            {previewData?.totalLines || text.split("\n").length} 行
          </span>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(text);
              onNotify("已複製 Markdown 全文");
            }}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="複製全文"
          >
            <CopyCheck size={13} />
          </button>
        </div>
      </div>

      {/* 內文檢視區 */}
      <div className="flex-1 overflow-auto p-4 font-sans select-text leading-relaxed">
        {viewMode === "rendered" ? (
          <div className="space-y-1">{renderMarkdownContent(text)}</div>
        ) : (
          <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap word-break">
            {text}
          </pre>
        )}

        {hasMore && (
          <div className="mt-4 pt-3 border-t border-slate-800 text-center">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={onLoadMore}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-xs font-medium text-slate-200 transition-all shadow-sm"
            >
              <ArrowDownCircle size={13} />
              {isLoadingMore ? "載入中..." : "載入後續內容"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
