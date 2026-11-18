import React, { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  File,
  Folder,
  Trash2,
  X,
} from "lucide-react";
import { apiEnqueueTransfer } from "../api";
import { useAppStore } from "../store/useAppStore";
import { formatBytes, formatDateTime } from "../utils/formatters";

interface DeleteConfirmModalProps {
  onNotify: (msg: string) => void;
}

export const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  onNotify,
}) => {
  const prompt = useAppStore((s) => s.pendingDeletePrompt);
  const setPendingDeletePrompt = useAppStore((s) => s.setPendingDeletePrompt);
  const confirmDelete = useAppStore((s) => s.confirmDelete);
  const setConfirmDelete = useAppStore((s) => s.setConfirmDelete);
  const conflictStrategy = useAppStore((s) => s.conflictStrategy);
  const setShowQueueDrawer = useAppStore((s) => s.setShowQueueDrawer);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  const [alwaysConfirm, setAlwaysConfirm] = useState(confirmDelete);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAlwaysConfirm(confirmDelete);
  }, [confirmDelete, prompt]);

  const handleClose = useCallback(() => {
    if (submitting) return;
    setPendingDeletePrompt(null);
  }, [submitting, setPendingDeletePrompt]);

  const handleConfirm = useCallback(async () => {
    if (!prompt || submitting) return;
    setSubmitting(true);
    try {
      if (alwaysConfirm !== confirmDelete) {
        setConfirmDelete(alwaysConfirm);
      }
      const isTrash = prompt.jobType === "trash";
      await apiEnqueueTransfer(
        prompt.jobType,
        prompt.items.map((i) => i.path),
        null,
        conflictStrategy
      );
      setPendingDeletePrompt(null);
      setShowQueueDrawer(true);
      onNotify(
        isTrash
          ? `已將 ${prompt.items.length} 個項目排入移至資源回收桶佇列`
          : `已將 ${prompt.items.length} 個項目排入永久刪除佇列`
      );
      setTimeout(() => triggerRefresh(), 200);
    } catch (err) {
      onNotify(`刪除任務排入佇列失敗: ${String(err)}`);
    } finally {
      setSubmitting(false);
    }
  }, [
    prompt,
    submitting,
    alwaysConfirm,
    confirmDelete,
    setConfirmDelete,
    conflictStrategy,
    setPendingDeletePrompt,
    setShowQueueDrawer,
    onNotify,
    triggerRefresh,
  ]);

  useEffect(() => {
    if (!prompt) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
      } else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleConfirm();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [prompt, handleClose, handleConfirm]);

  if (!prompt) return null;

  const isTrash = prompt.jobType === "trash";
  const items = prompt.items;
  const totalBytes = items.reduce(
    (sum, item) => sum + (item.isDir ? 0 : item.size),
    0
  );
  const singleItem = items.length === 1 ? items[0] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-2 rounded-lg border ${
                isTrash
                  ? "bg-amber-500/20 border-amber-500/30 text-amber-400"
                  : "bg-rose-500/20 border-rose-500/30 text-rose-400"
              }`}
            >
              {isTrash ? <Trash2 size={18} /> : <AlertTriangle size={18} />}
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">
                {isTrash ? "確認移至資源回收桶" : "確認永久刪除檔案"}
              </h2>
              <p className="text-xs text-slate-400">
                {isTrash
                  ? `即將將 ${items.length} 個項目移至系統資源回收桶`
                  : `即將從磁碟永久抹除 ${items.length} 個項目（無法復原）`}
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={submitting}
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="關閉 (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* 永久刪除警示標籤 */}
        {!isTrash && (
          <div className="mx-5 mt-4 p-3 rounded-lg bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2.5">
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
            <span>
              <strong>警告：</strong>永久刪除將直接抹除檔案，<strong>不會</strong>放入資源回收桶且無法復原，請確認後再執行！
            </span>
          </div>
        )}

        {/* 待刪除項目清單或單項詳細資料 */}
        <div className="p-5 space-y-3">
          {singleItem ? (
            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800 flex items-start gap-3">
              <div className="mt-0.5">
                {singleItem.isDir ? (
                  <Folder size={20} className="text-amber-400" />
                ) : (
                  <File size={20} className="text-blue-400" />
                )}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <div className="font-medium text-white truncate text-xs">
                  {singleItem.name}
                </div>
                <div className="text-[11px] font-mono text-slate-400 truncate">
                  {singleItem.path}
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-3 pt-1">
                  {!singleItem.isDir && (
                    <span>大小：{formatBytes(singleItem.size)}</span>
                  )}
                  {singleItem.modifiedMs > 0 && (
                    <span>修改時間：{formatDateTime(singleItem.modifiedMs)}</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>選取的項目清單 ({items.length} 項)</span>
                <span>檔案合計約 {formatBytes(totalBytes)}</span>
              </div>
              <div className="max-h-52 overflow-y-auto p-2 space-y-1 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                {items.map((item) => (
                  <div
                    key={item.path}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded hover:bg-slate-900 text-slate-300"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.isDir ? (
                        <Folder size={14} className="text-amber-400 shrink-0" />
                      ) : (
                        <File size={14} className="text-blue-400 shrink-0" />
                      )}
                      <span className="truncate">{item.name}</span>
                    </div>
                    {!item.isDir && (
                      <span className="text-[11px] font-mono text-slate-500 shrink-0">
                        {formatBytes(item.size)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-950/70 text-xs">
          <label className="flex items-center gap-2 cursor-pointer text-slate-400 hover:text-slate-300">
            <input
              type="checkbox"
              checked={alwaysConfirm}
              onChange={(e) => setAlwaysConfirm(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 accent-blue-500"
            />
            <span>刪除檔案前先確認</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={handleClose}
              className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
            >
              取消 (Esc)
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
              className={`px-3.5 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 text-white transition-all shadow-md disabled:opacity-50 ${
                isTrash
                  ? "bg-amber-600 hover:bg-amber-500 shadow-amber-600/20"
                  : "bg-rose-600 hover:bg-rose-500 shadow-rose-600/20"
              }`}
            >
              {isTrash ? <Trash2 size={13} /> : <AlertTriangle size={13} />}
              <span>{isTrash ? "移至回收桶 (Enter)" : "永久刪除 (Enter)"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
