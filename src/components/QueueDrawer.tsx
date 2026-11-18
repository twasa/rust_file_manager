import React from "react";
import {
  Activity,
  Pause,
  Play,
  XCircle,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { apiControlTransferJob } from "../api";
import { useAppStore } from "../store/useAppStore";
import { formatBytes } from "../utils/formatters";
import type { TransferJobSnapshot } from "../types";

export const QueueDrawer: React.FC = () => {
  const showQueueDrawer = useAppStore((s) => s.showQueueDrawer);
  const setShowQueueDrawer = useAppStore((s) => s.setShowQueueDrawer);
  const transferJobs = useAppStore((s) => s.transferJobs);
  const setTransferJobs = useAppStore((s) => s.setTransferJobs);
  const triggerRefresh = useAppStore((s) => s.triggerRefresh);

  if (!showQueueDrawer) return null;

  const handleControl = async (
    jobId: string,
    action: "pause" | "resume" | "cancel" | "remove" | "clear_completed"
  ) => {
    try {
      const next = await apiControlTransferJob(jobId, action);
      setTransferJobs(next);
      triggerRefresh();
    } catch (err) {
      console.error("Queue control error:", err);
    }
  };

  const renderJobTypeBadge = (job: TransferJobSnapshot) => {
    switch (job.jobType) {
      case "copy":
        return (
          <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium">
            複製
          </span>
        );
      case "move":
        return (
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
            搬移
          </span>
        );
      case "trash":
        return (
          <span className="px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-medium">
            回收桶
          </span>
        );
      case "delete":
        return (
          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium">
            永久刪除
          </span>
        );
    }
  };

  return (
    <div className="border-t border-slate-700 bg-slate-900/95 backdrop-blur-md h-64 flex flex-col z-30 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950/60 text-xs">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-blue-400" />
          <span className="font-semibold text-white">
            背景非同步檔案傳輸佇列 (I/O Transfer Queue & Chunked Stream)
          </span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[11px]">
            共 {transferJobs.length} 筆任務
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleControl("", "clear_completed")}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px]"
          >
            <Trash2 size={12} />
            <span>清除已完成任務</span>
          </button>
          <button
            type="button"
            onClick={() => setShowQueueDrawer(false)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
            title="收合佇列面板"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* Job List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        {transferJobs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            目前佇列中沒有任何檔案搬移、複製或刪除任務
          </div>
        ) : (
          transferJobs.map((job) => {
            const pct =
              job.totalBytes > 0
                ? Math.min(
                    100,
                    Math.round((job.processedBytes / job.totalBytes) * 100)
                  )
                : job.totalFiles > 0
                ? Math.min(
                    100,
                    Math.round((job.processedFiles / job.totalFiles) * 100)
                  )
                : 0;

            return (
              <div
                key={job.id}
                className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {renderJobTypeBadge(job)}
                    <span className="text-slate-200 font-medium truncate">
                      {job.sources.length} 個項目{" "}
                      {job.destination ? `→ ${job.destination}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {job.speedBytesPerSec > 0 && job.status === "running" && (
                      <span className="text-emerald-400 font-mono text-[11px]">
                        {formatBytes(job.speedBytesPerSec)}/s
                      </span>
                    )}
                    <span className="text-slate-400 font-mono text-[11px]">
                      {job.processedFiles}/{job.totalFiles} 檔 (
                      {formatBytes(job.processedBytes)} /{" "}
                      {formatBytes(job.totalBytes)})
                    </span>

                    {/* 控制按鈕 */}
                    {job.status === "running" && (
                      <button
                        type="button"
                        onClick={() => handleControl(job.id, "pause")}
                        className="p-1 rounded bg-slate-800 hover:bg-amber-500/20 text-amber-300"
                        title="暫停任務"
                      >
                        <Pause size={13} />
                      </button>
                    )}
                    {job.status === "paused" && (
                      <button
                        type="button"
                        onClick={() => handleControl(job.id, "resume")}
                        className="p-1 rounded bg-slate-800 hover:bg-emerald-500/20 text-emerald-300"
                        title="繼續任務"
                      >
                        <Play size={13} />
                      </button>
                    )}
                    {(job.status === "running" ||
                      job.status === "paused" ||
                      job.status === "queued" ||
                      job.status === "scanning") && (
                      <button
                        type="button"
                        onClick={() => handleControl(job.id, "cancel")}
                        className="p-1 rounded bg-slate-800 hover:bg-rose-500/20 text-rose-400"
                        title="取消任務"
                      >
                        <XCircle size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    style={{ width: `${pct}%` }}
                    className={`h-full transition-all duration-150 ${
                      job.status === "failed"
                        ? "bg-rose-500"
                        : job.status === "completed"
                        ? "bg-emerald-500"
                        : job.status === "paused"
                        ? "bg-amber-500"
                        : "bg-blue-500"
                    }`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="truncate font-mono">{job.currentFile}</span>
                  <span className="flex items-center gap-1 shrink-0">
                    {job.status === "completed" && (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 size={12} /> 完成
                      </span>
                    )}
                    {job.status === "failed" && (
                      <span className="text-rose-400 flex items-center gap-1">
                        <AlertCircle size={12} /> 失敗
                      </span>
                    )}
                    {(job.status === "running" || job.status === "scanning") && (
                      <span className="text-blue-400 flex items-center gap-1">
                        <Loader2 size={12} className="animate-spin" /> {pct}%
                      </span>
                    )}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
