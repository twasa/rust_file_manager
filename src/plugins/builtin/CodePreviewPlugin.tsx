import React from "react";
import { CopyCheck, ArrowDownCircle } from "lucide-react";
import type { PreviewPlugin, PreviewPluginProps } from "../types";

/**
 * 簡易程式碼關鍵字語法上色
 */
function highlightCodeLine(line: string, ext: string): React.ReactNode {
  // 若為註解行
  if (
    line.trim().startsWith("//") ||
    line.trim().startsWith("#") ||
    line.trim().startsWith("/*") ||
    line.trim().startsWith("*")
  ) {
    return <span className="text-slate-500 italic">{line}</span>;
  }

  // 關鍵字高亮規則
  const keywords =
    /\b(fn|pub|struct|enum|impl|let|mut|const|return|if|else|match|for|while|loop|use|mod|crate|async|await|type|import|export|from|default|class|function|interface|extends|implements|public|private|protected|static|readonly|true|false|null|undefined|None|Some|Ok|Err)\b/g;

  const parts = line.split(keywords);
  return (
    <span>
      {parts.map((part, idx) => {
        if (part.match(keywords)) {
          return (
            <span key={idx} className="text-purple-400 font-medium">
              {part}
            </span>
          );
        }
        // 字串標記
        if (
          (part.startsWith('"') && part.endsWith('"')) ||
          (part.startsWith("'") && part.endsWith("'")) ||
          (part.startsWith("`") && part.endsWith("`"))
        ) {
          return (
            <span key={idx} className="text-emerald-400">
              {part}
            </span>
          );
        }
        return <span key={idx}>{part}</span>;
      })}
    </span>
  );
}

export const CodePreviewComponent: React.FC<PreviewPluginProps> = ({
  entry,
  previewData,
  onNotify,
  onLoadMore,
  isLoadingMore,
  hasMore,
}) => {
  const content = previewData?.textPreview || "";
  const lines = content.split("\n");
  const ext = (entry.extension || "").toLowerCase();

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-950/70 text-xs">
      {/* 頂部程式碼狀態列 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800/80 bg-slate-900/60 shrink-0 select-none">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span className="font-mono text-cyan-400 font-semibold uppercase">
            {ext || "CODE"}
          </span>
          <span>• {lines.length} 行</span>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(content);
            onNotify("已複製程式碼全文");
          }}
          className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white text-[11px]"
          title="複製全部程式碼"
        >
          <CopyCheck size={12} />
          <span>複製</span>
        </button>
      </div>

      {/* 程式碼與行號區塊 */}
      <div className="flex-1 overflow-auto p-2 bg-slate-950 font-mono text-xs leading-relaxed select-text min-h-0">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-slate-900/40">
                <td className="w-10 pr-3 text-right text-slate-600 select-none align-top font-mono text-[11px]">
                  {idx + 1}
                </td>
                <td className="text-slate-300 whitespace-pre break-all pl-2 border-l border-slate-800/60">
                  {highlightCodeLine(line, ext)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* 載入更多分段按鈕 */}
        {hasMore && (
          <div className="pt-4 pb-2 flex justify-center">
            <button
              type="button"
              disabled={isLoadingMore}
              onClick={onLoadMore}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-xs font-medium transition-colors"
            >
              <ArrowDownCircle size={14} className={isLoadingMore ? "animate-spin" : ""} />
              <span>{isLoadingMore ? "正在載入分段..." : "載入後續程式碼 (Load More)"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export const codePreviewPlugin: PreviewPlugin = {
  id: "builtin.code",
  name: "原始碼與文字高亮預覽器",
  description: "提供程式原始碼行號、關鍵字高亮、一鍵複製與大檔案分段載入支援",
  version: "1.0.0",
  category: "viewer",
  defaultEnabled: true,
  supports: (entry) => {
    const ext = (entry.extension || "").toLowerCase();
    return (
      entry.kind === "code" ||
      entry.kind === "document" ||
      [
        "rs",
        "ts",
        "tsx",
        "js",
        "jsx",
        "json",
        "toml",
        "yaml",
        "yml",
        "css",
        "html",
        "sh",
        "bash",
        "zsh",
        "ps1",
        "py",
        "c",
        "cpp",
        "h",
        "hpp",
        "go",
        "sql",
        "txt",
        "log",
        "xml",
        "ini",
        "conf",
      ].includes(ext)
    );
  },
  component: CodePreviewComponent,
};
