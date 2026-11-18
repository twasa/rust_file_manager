import React, { useEffect, useState } from "react";
import {
  Wand2,
  X,
  Check,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import {
  apiExecuteBatchRename,
  apiPreviewBatchRename,
} from "../api";
import type {
  BatchRenamePreviewItem,
  BatchRenameRule,
  FileEntry,
} from "../types";
import { useAppStore } from "../store/useAppStore";

interface BatchRenameModalProps {
  visible: boolean;
  entries: FileEntry[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}

const DEFAULT_RULE: BatchRenameRule = {
  findText: "",
  replaceText: "",
  useRegex: false,
  caseSensitive: false,
  prefix: "",
  suffix: "",
  caseTransform: "none",
  sequenceEnabled: false,
  sequenceStart: 1,
  sequenceStep: 1,
  sequencePadding: 3,
  sequencePosition: "suffix",
  extensionOverride: "",
};

export const BatchRenameModal: React.FC<BatchRenameModalProps> = ({
  visible,
  entries,
  onClose,
  onSuccess,
}) => {
  const [rule, setRule] = useState<BatchRenameRule>(DEFAULT_RULE);
  const [previews, setPreviews] = useState<BatchRenamePreviewItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  const setLastUndoRenamePairs = useAppStore((s) => s.setLastUndoRenamePairs);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  useEffect(() => {
    if (!visible || entries.length === 0) return;
    let cancelled = false;
    const paths = entries.map((e) => e.path);

    apiPreviewBatchRename(paths, rule)
      .then((res) => {
        if (!cancelled) {
          setPreviews(res);
          setErrorMsg(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setErrorMsg(String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [visible, entries, rule]);

  if (!visible) return null;

  const changedCount = previews.filter((p) => p.changed).length;
  const conflictCount = previews.filter((p) => p.hasConflict).length;

  const handleApply = async () => {
    if (conflictCount > 0 || changedCount === 0) return;
    setIsExecuting(true);
    setErrorMsg(null);
    try {
      const paths = entries.map((e) => e.path);
      const res = await apiExecuteBatchRename(paths, rule);
      if (res.errors.length > 0) {
        setErrorMsg(res.errors.join("; "));
      } else {
        setLastUndoRenamePairs(res.undoPairs);
        triggerRefresh();
        onSuccess(`成功批次重新命名 ${res.successCount} 個項目（可隨時點擊復原）`);
        onClose();
      }
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-5xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[88vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
              <Wand2 size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                進階批次重新命名工具 (Multi-Rename Tool)
              </h2>
              <p className="text-xs text-slate-400">
                已載入 {entries.length} 個項目 — 支援正規表示式 (Regex)、日期變數{" "}
                <code className="text-purple-300">{"{date}"}</code>、自動流水號與兩階段防撞更名
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRule(DEFAULT_RULE)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300"
            >
              <RotateCcw size={13} />
              <span>重設規則</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Rule Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-900/90 border-b border-slate-800 text-xs">
          {/* Column 1: Find & Replace */}
          <div className="space-y-2.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <div className="font-medium text-slate-200 flex items-center justify-between">
              <span>1. 尋找與取代 (支援 Regex)</span>
              <div className="flex items-center gap-2 text-[11px]">
                <label className="flex items-center gap-1 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={rule.useRegex}
                    onChange={(e) =>
                      setRule({ ...rule, useRegex: e.target.checked })
                    }
                    className="rounded border-slate-600"
                  />
                  <span>Regex</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-slate-300">
                  <input
                    type="checkbox"
                    checked={rule.caseSensitive}
                    onChange={(e) =>
                      setRule({ ...rule, caseSensitive: e.target.checked })
                    }
                    className="rounded border-slate-600"
                  />
                  <span>區分大小寫</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                尋找字串 / 正規表示式
              </label>
              <input
                type="text"
                value={rule.findText}
                onChange={(e) => setRule({ ...rule, findText: e.target.value })}
                placeholder={rule.useRegex ? "例如: ^IMG_(\\d+)" : "輸入要尋找的文字..."}
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                取代為 (可用 $1, {"{date}"}, {"{name}"})
              </label>
              <input
                type="text"
                value={rule.replaceText}
                onChange={(e) =>
                  setRule({ ...rule, replaceText: e.target.value })
                }
                placeholder="例如: Photo_{date}_$1"
                className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Column 2: Prefix, Suffix, Case & Extension */}
          <div className="space-y-2.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <div className="font-medium text-slate-200">
              2. 前綴、後綴、大小寫與副檔名
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  前綴 (Prefix)
                </label>
                <input
                  type="text"
                  value={rule.prefix}
                  onChange={(e) => setRule({ ...rule, prefix: e.target.value })}
                  placeholder="例如: {date}_"
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  後綴 (Suffix)
                </label>
                <input
                  type="text"
                  value={rule.suffix}
                  onChange={(e) => setRule({ ...rule, suffix: e.target.value })}
                  placeholder="例如: _backup"
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  大小寫轉換
                </label>
                <select
                  value={rule.caseTransform}
                  onChange={(e) =>
                    setRule({
                      ...rule,
                      caseTransform: e.target.value as BatchRenameRule["caseTransform"],
                    })
                  }
                  className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="none">維持原樣</option>
                  <option value="lower">全部小寫 (lowercase)</option>
                  <option value="upper">全部大寫 (UPPERCASE)</option>
                  <option value="title">首字大寫 (Title Case)</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  統一修改副檔名
                </label>
                <input
                  type="text"
                  value={rule.extensionOverride}
                  onChange={(e) =>
                    setRule({ ...rule, extensionOverride: e.target.value })
                  }
                  placeholder="留空維持原副檔名"
                  className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-white focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Column 3: Sequence Numbering */}
          <div className="space-y-2.5 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
            <div className="flex items-center justify-between font-medium text-slate-200">
              <span>3. 自動流水號編碼</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-purple-300">
                <input
                  type="checkbox"
                  checked={rule.sequenceEnabled}
                  onChange={(e) =>
                    setRule({ ...rule, sequenceEnabled: e.target.checked })
                  }
                  className="rounded border-slate-600"
                />
                <span>啟用流水號</span>
              </label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  起始數字
                </label>
                <input
                  type="number"
                  min={0}
                  disabled={!rule.sequenceEnabled}
                  value={rule.sequenceStart}
                  onChange={(e) =>
                    setRule({
                      ...rule,
                      sequenceStart: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                  className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  遞增步長
                </label>
                <input
                  type="number"
                  min={1}
                  disabled={!rule.sequenceEnabled}
                  value={rule.sequenceStep}
                  onChange={(e) =>
                    setRule({
                      ...rule,
                      sequenceStep: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-40"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  補零位數
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  disabled={!rule.sequenceEnabled}
                  value={rule.sequencePadding}
                  onChange={(e) =>
                    setRule({
                      ...rule,
                      sequencePadding: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                  className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-40"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 mb-1">
                流水號插入位置
              </label>
              <select
                disabled={!rule.sequenceEnabled}
                value={rule.sequencePosition}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    sequencePosition:
                      e.target.value as BatchRenameRule["sequencePosition"],
                  })
                }
                className="w-full px-2 py-1.5 rounded bg-slate-900 border border-slate-700 text-white disabled:opacity-40"
              >
                <option value="suffix">加在檔名末端 (Name_001.ext)</option>
                <option value="prefix">加在檔名開頭 (001_Name.ext)</option>
                <option value="replace_name">
                  完全取代原檔名 (Prefix + 001 + Suffix.ext)
                </option>
              </select>
            </div>
          </div>
        </div>

        {/* Quick Presets Bar */}
        <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800 flex items-center gap-2 text-xs overflow-x-auto">
          <span className="text-slate-400 flex items-center gap-1 shrink-0">
            <Sparkles size={13} className="text-amber-400" />
            快速範本：
          </span>
          <button
            type="button"
            onClick={() =>
              setRule({
                ...DEFAULT_RULE,
                prefix: "{date}_",
                sequenceEnabled: true,
                sequencePadding: 3,
                sequencePosition: "suffix",
              })
            }
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0"
          >
            今日日期前綴 + 3位流水號
          </button>
          <button
            type="button"
            onClick={() =>
              setRule({
                ...DEFAULT_RULE,
                findText: "\\s+",
                replaceText: "_",
                useRegex: true,
              })
            }
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0"
          >
            將所有空白改為底線 (_)
          </button>
          <button
            type="button"
            onClick={() =>
              setRule({
                ...DEFAULT_RULE,
                caseTransform: "lower",
              })
            }
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0"
          >
            檔名統一轉小寫
          </button>
        </div>

        {/* Live Preview Table */}
        <div className="flex-1 overflow-y-auto p-4">
          {errorMsg && (
            <div className="mb-3 p-3 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 px-3 w-12">#</th>
                <th className="py-2 px-3">原始檔名</th>
                <th className="py-2 px-2 w-8"></th>
                <th className="py-2 px-3">新檔名預覽</th>
                <th className="py-2 px-3 w-40">狀態檢查</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {previews.map((item, i) => (
                <tr
                  key={item.originalPath}
                  className={
                    item.hasConflict
                      ? "bg-rose-500/10"
                      : item.changed
                      ? "bg-emerald-500/5"
                      : ""
                  }
                >
                  <td className="py-2 px-3 text-slate-500 font-mono">
                    {i + 1}
                  </td>
                  <td className="py-2 px-3 text-slate-300 font-mono break-all">
                    {item.originalName}
                  </td>
                  <td className="py-2 px-2 text-slate-500">
                    <ArrowRight size={13} />
                  </td>
                  <td
                    className={`py-2 px-3 font-mono break-all ${
                      item.hasConflict
                        ? "text-rose-400 font-semibold"
                        : item.changed
                        ? "text-emerald-400 font-medium"
                        : "text-slate-500"
                    }`}
                  >
                    {item.newName}
                  </td>
                  <td className="py-2 px-3">
                    {item.hasConflict ? (
                      <span className="inline-flex items-center gap-1 text-rose-400">
                        <AlertTriangle size={13} />
                        {item.error || "衝突"}
                      </span>
                    ) : item.changed ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <Check size={13} />
                        準備就緒
                      </span>
                    ) : (
                      <span className="text-slate-500">無變更</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-950/80 text-xs">
          <div className="flex items-center gap-4 text-slate-400">
            <span>
              總項目數：<strong className="text-white">{previews.length}</strong>
            </span>
            <span>
              即將變更：
              <strong className="text-emerald-400">{changedCount}</strong>
            </span>
            {conflictCount > 0 && (
              <span className="text-rose-400 font-medium">
                偵測到衝突：{conflictCount} 項
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              取消
            </button>
            <button
              type="button"
              disabled={isExecuting || changedCount === 0 || conflictCount > 0}
              onClick={handleApply}
              className="flex items-center gap-1.5 px-5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium shadow-lg shadow-blue-600/20"
            >
              <Check size={15} />
              <span>
                {isExecuting
                  ? "正在執行批次更名..."
                  : `套用批次重新命名 (${changedCount})`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
