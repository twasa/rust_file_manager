import React, { useState } from "react";
import {
  AlertTriangle,
  X,
  CopyPlus,
  RefreshCw,
  SkipForward,
  Folder,
  File,
} from "lucide-react";
import { apiEnqueueTransfer } from "../api";
import { useAppStore } from "../store/useAppStore";
import { formatBytes, formatDateTime } from "../utils/formatters";
import type { ConflictStrategy } from "../types";

interface ConflictDialogModalProps {
  onNotify: (msg: string) => void;
}

export const ConflictDialogModal: React.FC<ConflictDialogModalProps> = ({
  onNotify,
}) => {
  const prompt = useAppStore((s) => s.pendingConflictPrompt);
  const setPendingConflictPrompt = useAppStore(
    (s) => s.setPendingConflictPrompt
  );
  const setConflictStrategy = useAppStore((s) => s.setConflictStrategy);
  const setShowQueueDrawer = useAppStore((s) => s.setShowQueueDrawer);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [rememberChoice, setRememberChoice] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!prompt) return null;

  const handleChoose = async (chosenStrategy: "rename" | "overwrite" | "skip") => {
    setSubmitting(true);
    try {
      if (rememberChoice) {
        setConflictStrategy(chosenStrategy as ConflictStrategy);
      }
      await apiEnqueueTransfer(
        prompt.jobType,
        prompt.sources,
        prompt.destination,
        chosenStrategy
      );
      setPendingConflictPrompt(null);
      setRememberChoice(false);
      setShowQueueDrawer(true);
      setTimeout(() => triggerRefresh(), 200);
    } catch (err) {
      onNotify(`排入佇列失敗: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                偵測到同名檔案或目錄衝突 ({prompt.conflicts.length} 項)
              </h2>
              <p className="text-xs text-slate-400">
                目標目錄 <code className="text-slate-200">{prompt.destination}</code> 已存在同名項目，請選擇處理方式：
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPendingConflictPrompt(null)}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Conflict Items List */}
        <div className="max-h-56 overflow-y-auto p-4 space-y-2 bg-slate-950/40 text-xs">
          {prompt.conflicts.map((item) => (
            <div
              key={item.sourcePath}
              className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex flex-col gap-1"
            >
              <div className="flex items-center gap-2 font-medium text-white">
                {item.isDir ? (
                  <Folder size={14} className="text-amber-400 shrink-0" />
                ) : (
                  <File size={14} className="text-blue-400 shrink-0" />
                )}
                <span className="truncate">{item.name}</span>
              </div>
              {!item.isDir && (
                <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pl-5 font-mono">
                  <div>
                    來源：{formatBytes(item.sourceSize)} ({formatDateTime(item.sourceModifiedMs)})
                  </div>
                  <div>
                    目標：{formatBytes(item.targetSize)} ({formatDateTime(item.targetModifiedMs)})
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="p-4 space-y-2.5 border-t border-slate-800 bg-slate-900 text-xs">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleChoose("rename")}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <CopyPlus size={18} className="text-cyan-400 shrink-0" />
              <div>
                <div className="font-semibold text-white">
                  自動重新命名並保留兩者 (產生 _1, _2 副本)
                </div>
                <div className="text-[11px] text-slate-300">
                  不覆蓋目標檔案，將新貼上的項目自動加上編號後綴
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => handleChoose("overwrite")}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <RefreshCw size={18} className="text-rose-400 shrink-0" />
              <div>
                <div className="font-semibold text-white">
                  直接覆寫目標檔案 (Overwrite)
                </div>
                <div className="text-[11px] text-slate-300">
                  以來源檔案取代目標目錄中的同名檔案
                </div>
              </div>
            </div>
          </button>

          <button
            type="button"
            disabled={submitting}
            onClick={() => handleChoose("skip")}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-left transition-all"
          >
            <div className="flex items-center gap-3">
              <SkipForward size={18} className="text-amber-400 shrink-0" />
              <div>
                <div className="font-semibold text-white">
                  略過同名檔案 (Skip)
                </div>
                <div className="text-[11px] text-slate-300">
                  不處理同名項目，僅傳輸其餘未衝突的檔案
                </div>
              </div>
            </div>
          </button>

          {/* Footer Remember Choice & Cancel */}
          <div className="flex items-center justify-between pt-2">
            <label className="flex items-center gap-2 text-slate-400 cursor-pointer hover:text-slate-200">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="rounded border-slate-600"
              />
              <span>記住我的選擇（更新預設衝突策略，下次不再詢問）</span>
            </label>

            <button
              type="button"
              onClick={() => setPendingConflictPrompt(null)}
              className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              取消操作
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
