import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  Pause,
  Play,
  XCircle,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Minimize2,
  Maximize2,
  X,
  GripHorizontal,
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

  const [minimized, setMinimized] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [autoHideCountdown, setAutoHideCountdown] = useState<number | null>(
    null
  );

  const dragStartRef = useRef<{
    mouseX: number;
    mouseY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const hadActiveJobsRef = useRef(false);

  const activeJobs = transferJobs.filter(
    (j) =>
      j.status === "running" ||
      j.status === "scanning" ||
      j.status === "queued" ||
      j.status === "paused"
  );
  const failedJobs = transferJobs.filter((j) => j.status === "failed");
  const isWorking = activeJobs.length > 0;

  // 當有新任務開始執行時，標記 hadActiveJobsRef 並取消自動隱藏倒數
  useEffect(() => {
    if (isWorking) {
      hadActiveJobsRef.current = true;
      setAutoHideCountdown(null);
      setMinimized(false);
    }
  }, [isWorking]);

  // 當所有任務從執行中變為全部完成（且無失敗任務）時，啟動 3 秒自動隱藏倒數
  useEffect(() => {
    if (
      showQueueDrawer &&
      hadActiveJobsRef.current &&
      !isWorking &&
      transferJobs.length > 0 &&
      failedJobs.length === 0
    ) {
      setAutoHideCountdown(3);
      const interval = setInterval(() => {
        setAutoHideCountdown((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            clearInterval(interval);
            hadActiveJobsRef.current = false;
            setShowQueueDrawer(false);
            return null;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [
    showQueueDrawer,
    isWorking,
    transferJobs.length,
    failedJobs.length,
    setShowQueueDrawer,
  ]);

  // 滑鼠拖曳懸浮視窗位置
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      const nextX = Math.max(
        12,
        Math.min(window.innerWidth - 320, dragStartRef.current.startX + dx)
      );
      const nextY = Math.max(
        48,
        Math.min(window.innerHeight - 80, dragStartRef.current.startY + dy)
      );
      setPos({ x: nextX, y: nextY });
    };

    const handleMouseUp = () => {
      dragStartRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  if (!showQueueDrawer) return null;

  const handleControl = async (
    jobId: string,
    action: "pause" | "resume" | "cancel" | "remove" | "clear_completed"
  ) => {
    setAutoHideCountdown(null);
    hadActiveJobsRef.current = false;
    try {
      const next = await apiControlTransferJob(jobId, action);
      setTransferJobs(next);
      triggerRefresh();
    } catch (err) {
      console.error("Queue control error:", err);
    }
  };

  const renderStrategyBadge = (job: TransferJobSnapshot) => {
    if (job.jobType !== "copy" && job.jobType !== "move") return null;
    switch (job.conflictStrategy) {
      case "skip":
        return (
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] shrink-0">
            策略:略過同名
          </span>
        );
      case "overwrite":
        return (
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-rose-300 text-[10px] shrink-0">
            策略:直接覆寫
          </span>
        );
      case "rename":
        return (
          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 text-[10px] shrink-0">
            策略:自動改名
          </span>
        );
    }
  };

  const renderJobTypeBadge = (job: TransferJobSnapshot) => {
    switch (job.jobType) {
      case "copy":
        return (
          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 font-medium text-[10px]">
            複製
          </span>
        );
      case "move":
        return (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium text-[10px]">
            搬移
          </span>
        );
      case "trash":
        return (
          <span className="px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 font-medium text-[10px]">
            回收桶
          </span>
        );
      case "delete":
        return (
          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium text-[10px]">
            永久刪除
          </span>
        );
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const rect = widgetRef.current?.getBoundingClientRect();
    const currentX = pos ? pos.x : rect ? rect.left : window.innerWidth - 420;
    const currentY = pos ? pos.y : rect ? rect.top : window.innerHeight - 320;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: currentX,
      startY: currentY,
    };
  };

  const floatingStyle: React.CSSProperties = pos
    ? { left: `${pos.x}px`, top: `${pos.y}px` }
    : { right: "16px", bottom: "16px" };

  // 最小化膠囊模式 (Compact Pill)
  if (minimized) {
    return (
      <div
        ref={widgetRef}
        style={floatingStyle}
        onMouseDown={startDrag}
        className="fixed z-40 flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-slate-900/95 backdrop-blur-md border border-slate-700 shadow-2xl text-xs cursor-move select-none"
      >
        {isWorking ? (
          <Loader2 size={14} className="text-blue-400 animate-spin shrink-0" />
        ) : failedJobs.length > 0 ? (
          <AlertCircle size={14} className="text-rose-400 shrink-0" />
        ) : (
          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
        )}
        <span className="text-slate-200 font-medium">
          {isWorking
            ? `傳輸中 (${activeJobs.length} 筆進行中)`
            : `佇列完成 (${transferJobs.length} 筆)`}
        </span>
        <button
          type="button"
          onClick={() => setMinimized(false)}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-300 hover:text-white"
          title="展開懸浮佇列視窗"
        >
          <Maximize2 size={12} />
        </button>
        <button
          type="button"
          onClick={() => {
            setAutoHideCountdown(null);
            hadActiveJobsRef.current = false;
            setShowQueueDrawer(false);
          }}
          className="p-1 rounded-full hover:bg-slate-800 text-slate-400 hover:text-rose-400"
          title="隱藏佇列視窗"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={widgetRef}
      style={floatingStyle}
      onMouseEnter={() => {
        // 滑鼠移入檢視時暫停自動隱藏倒數
        if (autoHideCountdown !== null) {
          setAutoHideCountdown(null);
          hadActiveJobsRef.current = false;
        }
      }}
      className="fixed z-40 w-[390px] max-w-[92vw] max-h-[340px] rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/90 shadow-2xl flex flex-col overflow-hidden select-none"
    >
      {/* 可拖曳標題列 */}
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-between px-3.5 py-2 border-b border-slate-800 bg-slate-950/80 text-xs cursor-move"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal size={14} className="text-slate-500 shrink-0" />
          <Activity size={14} className="text-blue-400 shrink-0" />
          <span className="font-semibold text-white truncate">
            檔案傳輸佇列 ({transferJobs.length})
          </span>
          {autoHideCountdown !== null && (
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
              {autoHideCountdown}s 後自動收合
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {transferJobs.length > 0 && (
            <button
              type="button"
              onClick={() => handleControl("", "clear_completed")}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-[11px]"
              title="清除已完成任務"
            >
              <Trash2 size={12} />
              <span>清除</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
            title="縮小為迷你膠囊"
          >
            <Minimize2 size={13} />
          </button>
          <button
            type="button"
            onClick={() => {
              setAutoHideCountdown(null);
              hadActiveJobsRef.current = false;
              setShowQueueDrawer(false);
            }}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-rose-400"
            title="關閉懸浮視窗 (可隨時從頂部佇列按鈕開啟)"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* 任務清單 */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 text-xs">
        {transferJobs.length === 0 ? (
          <div className="py-8 text-center text-slate-500">
            目前佇列中沒有任何檔案傳輸任務
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
                className="p-2.5 rounded-lg bg-slate-950/85 border border-slate-800/90 flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {renderJobTypeBadge(job)}
                    {renderStrategyBadge(job)}
                    <span className="text-slate-200 font-medium truncate text-[11px]">
                      {job.sources.length} 項{" "}
                      {job.destination ? `→ ${job.destination}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {job.speedBytesPerSec > 0 && job.status === "running" && (
                      <span className="text-emerald-400 font-mono text-[10px]">
                        {formatBytes(job.speedBytesPerSec)}/s
                      </span>
                    )}
                    {job.status === "running" && (
                      <button
                        type="button"
                        onClick={() => handleControl(job.id, "pause")}
                        className="p-1 rounded bg-slate-800 hover:bg-amber-500/20 text-amber-300"
                        title="暫停任務"
                      >
                        <Pause size={11} />
                      </button>
                    )}
                    {job.status === "paused" && (
                      <button
                        type="button"
                        onClick={() => handleControl(job.id, "resume")}
                        className="p-1 rounded bg-slate-800 hover:bg-emerald-500/20 text-emerald-300"
                        title="繼續任務"
                      >
                        <Play size={11} />
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
                        <XCircle size={11} />
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

                {/* 衝突處理結果統計標籤 (略過 / 覆寫 / 自動改名) */}
                {((job.skippedFiles ?? 0) > 0 ||
                  (job.overwrittenFiles ?? 0) > 0 ||
                  (job.renamedFiles ?? 0) > 0) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {(job.skippedFiles ?? 0) > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-medium">
                        已略過同名: {job.skippedFiles}
                      </span>
                    )}
                    {(job.overwrittenFiles ?? 0) > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-medium">
                        已覆寫同名: {job.overwrittenFiles}
                      </span>
                    )}
                    {(job.renamedFiles ?? 0) > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-medium">
                        已自動改名: {job.renamedFiles}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between text-[10px] text-slate-400 gap-2">
                  <span className="truncate font-mono text-slate-300">
                    {job.currentFile}
                  </span>
                  <span className="flex items-center gap-1 shrink-0 font-mono">
                    <span>
                      {job.processedFiles}/{job.totalFiles}
                    </span>
                    {job.status === "completed" && (
                      <CheckCircle2 size={11} className="text-emerald-400" />
                    )}
                    {job.status === "failed" && (
                      <AlertCircle size={11} className="text-rose-400" />
                    )}
                    {(job.status === "running" ||
                      job.status === "scanning") && (
                      <Loader2
                        size={11}
                        className="text-blue-400 animate-spin"
                      />
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
