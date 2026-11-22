import React, { useEffect, useState, useCallback } from "react";
import {
  X,
  Info,
  Files,
  Copy,
  Check,
  ExternalLink,
  Terminal,
  Loader2,
  Link2,
  Hash,
  FolderOpen,
} from "lucide-react";
import {
  apiCalculateDirStats,
  apiCalculateMultiItemStats,
  apiComputeChecksum,
  apiGetItemDetailedInfo,
  apiOpenItem,
  apiOpenTerminal,
  apiRevealInShell,
} from "../api";
import { formatBytes, formatDateTime } from "../utils/formatters";
import { FileEntryIcon } from "./FileEntryIcon";
import type { DirStats, FileChecksumResult, ItemDetailedInfo } from "../types";

interface DetailsModalProps {
  visible: boolean;
  targetPaths: string[];
  isCurrentDir?: boolean;
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export const DetailsModal: React.FC<DetailsModalProps> = ({
  visible,
  targetPaths,
  isCurrentDir = false,
  onClose,
  onNotify,
}) => {
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [itemInfo, setItemInfo] = useState<ItemDetailedInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 目錄或多項目遞迴大小統計
  const [calculatingStats, setCalculatingStats] = useState(false);
  const [dirStats, setDirStats] = useState<DirStats | null>(null);

  // 雜湊校驗
  const [activeTab, setActiveTab] = useState<"general" | "checksum">("general");
  const [checksum, setChecksum] = useState<FileChecksumResult | null>(null);
  const [calculatingChecksum, setCalculatingChecksum] = useState(false);

  // 複製回饋動畫
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const isMulti = targetPaths.length > 1;
  const singlePath = targetPaths[0] || "";

  // 載入基本屬性與觸發統計
  useEffect(() => {
    if (!visible || targetPaths.length === 0) {
      setItemInfo(null);
      setDirStats(null);
      setChecksum(null);
      setErrorMsg(null);
      setActiveTab("general");
      return;
    }

    let isCancelled = false;

    if (!isMulti) {
      setLoadingInfo(true);
      setErrorMsg(null);
      apiGetItemDetailedInfo(singlePath)
        .then((info) => {
          if (isCancelled) return;
          setItemInfo(info);
          setLoadingInfo(false);

          // 若為目錄，背景開始計算遞迴大小
          if (info.isDir) {
            setCalculatingStats(true);
            apiCalculateDirStats(singlePath)
              .then((stats) => {
                if (!isCancelled) {
                  setDirStats(stats);
                  setCalculatingStats(false);
                }
              })
              .catch(() => {
                if (!isCancelled) setCalculatingStats(false);
              });
          }
        })
        .catch((err) => {
          if (isCancelled) return;
          setErrorMsg(String(err));
          setLoadingInfo(false);
        });
    } else {
      // 多選項目
      setItemInfo(null);
      setCalculatingStats(true);
      apiCalculateMultiItemStats(targetPaths)
        .then((stats) => {
          if (!isCancelled) {
            setDirStats(stats);
            setCalculatingStats(false);
          }
        })
        .catch(() => {
          if (!isCancelled) setCalculatingStats(false);
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [visible, targetPaths, isMulti, singlePath]);

  // 計算雜湊
  const handleComputeChecksum = useCallback(async () => {
    if (!singlePath || itemInfo?.isDir) return;
    setCalculatingChecksum(true);
    try {
      const res = await apiComputeChecksum(singlePath);
      setChecksum(res);
    } catch (err) {
      onNotify(`雜湊計算失敗: ${String(err)}`);
    } finally {
      setCalculatingChecksum(false);
    }
  }, [singlePath, itemInfo?.isDir, onNotify]);

  // 當切換到雜湊分頁時若尚未計算則自動開始計算
  useEffect(() => {
    if (activeTab === "checksum" && !checksum && !calculatingChecksum && itemInfo && !itemInfo.isDir) {
      handleComputeChecksum();
    }
  }, [activeTab, checksum, calculatingChecksum, itemInfo, handleComputeChecksum]);

  // 鍵盤 Esc 關閉
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, onClose]);

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 1800);
  };

  if (!visible) return null;

  const titleText = isMulti
    ? `已選取 ${targetPaths.length} 個項目的內容`
    : isCurrentDir
    ? `目前目錄屬性：${itemInfo?.name || "目錄"}`
    : itemInfo?.isDir
    ? `資料夾內容：${itemInfo.name}`
    : `檔案內容：${itemInfo?.name || singlePath.split("/").pop() || "檔案"}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl flex flex-col overflow-hidden text-slate-100 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 頂部標題列 */}
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {isMulti ? (
              <Files size={18} className="text-purple-400 shrink-0" />
            ) : itemInfo ? (
              <FileEntryIcon kind={itemInfo.kind} size={20} />
            ) : (
              <Info size={18} className="text-sky-400 shrink-0" />
            )}
            <h2 className="text-sm font-semibold truncate text-white">
              {titleText}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="關閉 (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        {/* 分頁列 (單一非目錄檔案提供雜湊校驗分頁) */}
        {!isMulti && itemInfo && !itemInfo.isDir && (
          <div className="px-4 border-b border-slate-800 bg-slate-950/30 flex gap-4 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`py-2 border-b-2 transition-colors ${
                activeTab === "general"
                  ? "border-blue-500 text-blue-400 font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              一般屬性
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("checksum")}
              className={`py-2 border-b-2 flex items-center gap-1.5 transition-colors ${
                activeTab === "checksum"
                  ? "border-blue-500 text-blue-400 font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200"
              }`}
            >
              <Hash size={13} />
              <span>雜湊校驗碼</span>
            </button>
          </div>
        )}

        {/* 內容區塊 */}
        <div className="p-4 space-y-3.5 text-xs overflow-y-auto max-h-[68vh]">
          {loadingInfo ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 size={24} className="animate-spin text-blue-400" />
              <span>正在讀取詳細資訊...</span>
            </div>
          ) : errorMsg ? (
            <div className="p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300">
              讀取資訊失敗：{errorMsg}
            </div>
          ) : activeTab === "general" ? (
            <>
              {/* 單一項目基本資訊 */}
              {!isMulti && itemInfo && (
                <>
                  {/* 名稱列 */}
                  <div className="flex items-start gap-3 pb-3 border-b border-slate-800">
                    <div className="p-2.5 rounded-lg bg-slate-800/80 border border-slate-700/50 shrink-0">
                      <FileEntryIcon kind={itemInfo.kind} size={28} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-white break-all select-text">
                        {itemInfo.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {itemInfo.typeDescription}
                      </div>
                    </div>
                  </div>

                  {/* 詳細資訊表格 */}
                  <div className="grid grid-cols-3 gap-y-2.5 text-[11.5px] items-baseline">
                    <span className="text-slate-400">檔案類型：</span>
                    <span className="col-span-2 text-slate-200 font-medium">
                      {itemInfo.typeDescription}
                    </span>

                    <span className="text-slate-400">所在位置：</span>
                    <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-slate-300 font-mono text-[11px] truncate select-text"
                        title={itemInfo.parentPath}
                      >
                        {itemInfo.parentPath || "/"}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(itemInfo.parentPath, "parentPath")}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
                        title="複製所在目錄路徑"
                      >
                        {copiedField === "parentPath" ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>

                    <span className="text-slate-400">完整路徑：</span>
                    <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                      <span
                        className="text-slate-300 font-mono text-[11px] truncate select-text"
                        title={itemInfo.path}
                      >
                        {itemInfo.path}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(itemInfo.path, "fullPath")}
                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
                        title="複製完整路徑"
                      >
                        {copiedField === "fullPath" ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </div>

                    {itemInfo.isSymlink && itemInfo.symlinkTarget && (
                      <>
                        <span className="text-slate-400 flex items-center gap-1">
                          <Link2 size={12} className="text-cyan-400" />
                          <span>指向目標：</span>
                        </span>
                        <div className="col-span-2 flex items-center gap-1.5 min-w-0">
                          <span
                            className="text-cyan-300 font-mono text-[11px] truncate select-text"
                            title={itemInfo.symlinkTarget}
                          >
                            {itemInfo.symlinkTarget}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              copyToClipboard(itemInfo.symlinkTarget!, "symlinkTarget")
                            }
                            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white shrink-0"
                            title="複製捷徑目標路徑"
                          >
                            {copiedField === "symlinkTarget" ? (
                              <Check size={12} className="text-emerald-400" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </>
                    )}

                    <span className="text-slate-400">大小：</span>
                    <div className="col-span-2 flex items-center gap-2">
                      {itemInfo.isDir ? (
                        calculatingStats ? (
                          <span className="flex items-center gap-1.5 text-blue-400">
                            <Loader2 size={12} className="animate-spin" />
                            <span>計算中...</span>
                          </span>
                        ) : dirStats ? (
                          <span className="font-mono text-slate-200">
                            {formatBytes(dirStats.totalBytes)}{" "}
                            <span className="text-slate-400 text-[10.5px]">
                              ({dirStats.totalBytes.toLocaleString()} 位元組)
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )
                      ) : (
                        <span className="font-mono text-slate-200">
                          {formatBytes(itemInfo.size)}{" "}
                          <span className="text-slate-400 text-[10.5px]">
                            ({itemInfo.size.toLocaleString()} 位元組)
                          </span>
                        </span>
                      )}
                    </div>

                    {itemInfo.isDir && (
                      <>
                        <span className="text-slate-400">包含內容：</span>
                        <div className="col-span-2 flex items-center gap-2">
                          {calculatingStats ? (
                            <span className="flex items-center gap-1.5 text-blue-400">
                              <Loader2 size={12} className="animate-spin" />
                              <span>統計目錄內容中...</span>
                            </span>
                          ) : dirStats ? (
                            <span className="text-slate-200 font-medium">
                              {dirStats.totalFiles.toLocaleString()} 個檔案,{" "}
                              {dirStats.totalDirs.toLocaleString()} 個資料夾
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="border-t border-slate-800 my-1" />

                  {/* 時間戳記 */}
                  <div className="grid grid-cols-3 gap-y-2 text-[11.5px]">
                    <span className="text-slate-400">建立時間：</span>
                    <span className="col-span-2 text-slate-300 font-mono">
                      {formatDateTime(itemInfo.createdMs)}
                    </span>

                    <span className="text-slate-400">修改時間：</span>
                    <span className="col-span-2 text-slate-300 font-mono">
                      {formatDateTime(itemInfo.modifiedMs)}
                    </span>

                    <span className="text-slate-400">存取時間：</span>
                    <span className="col-span-2 text-slate-300 font-mono">
                      {formatDateTime(itemInfo.accessedMs)}
                    </span>
                  </div>

                  <div className="border-t border-slate-800 my-1" />

                  {/* 屬性標籤 */}
                  <div className="flex items-center gap-4 text-[11.5px]">
                    <span className="text-slate-400">屬性：</span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 cursor-default">
                        <input
                          type="checkbox"
                          checked={itemInfo.isReadonly}
                          readOnly
                          className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0"
                        />
                        <span className={itemInfo.isReadonly ? "text-amber-300" : "text-slate-400"}>
                          唯讀 (Read-only)
                        </span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-default">
                        <input
                          type="checkbox"
                          checked={itemInfo.isHidden}
                          readOnly
                          className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0"
                        />
                        <span className={itemInfo.isHidden ? "text-cyan-300" : "text-slate-400"}>
                          隱藏 (Hidden)
                        </span>
                      </label>
                      {itemInfo.isSymlink && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                          捷徑 / 符號連結
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* 多項目選取統計 */}
              {isMulti && (
                <div className="space-y-3.5">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-800">
                    <div className="p-2.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 shrink-0">
                      <Files size={28} />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-white">
                        已選取 {targetPaths.length} 個項目
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        多項目組合屬性總覽
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-y-2.5 text-[11.5px] items-baseline">
                    <span className="text-slate-400">選取項目數：</span>
                    <span className="col-span-2 text-slate-200 font-semibold">
                      {targetPaths.length} 個檔案與資料夾
                    </span>

                    <span className="text-slate-400">總大小：</span>
                    <div className="col-span-2 flex items-center gap-2">
                      {calculatingStats ? (
                        <span className="flex items-center gap-1.5 text-blue-400">
                          <Loader2 size={12} className="animate-spin" />
                          <span>正在統計整體大小...</span>
                        </span>
                      ) : dirStats ? (
                        <span className="font-mono text-slate-200 font-semibold">
                          {formatBytes(dirStats.totalBytes)}{" "}
                          <span className="text-slate-400 text-[10.5px]">
                            ({dirStats.totalBytes.toLocaleString()} 位元組)
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>

                    <span className="text-slate-400">包含總計：</span>
                    <div className="col-span-2">
                      {calculatingStats ? (
                        <span className="flex items-center gap-1.5 text-blue-400">
                          <Loader2 size={12} className="animate-spin" />
                          <span>計算中...</span>
                        </span>
                      ) : dirStats ? (
                        <span className="text-slate-200 font-medium">
                          {dirStats.totalFiles.toLocaleString()} 個檔案,{" "}
                          {dirStats.totalDirs.toLocaleString()} 個資料夾
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-800 my-1" />

                  {/* 清單預覽前 5 筆 */}
                  <div>
                    <div className="text-slate-400 text-[11px] mb-1.5">包含項目預覽：</div>
                    <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-2 max-h-36 overflow-y-auto space-y-1">
                      {targetPaths.slice(0, 8).map((p, idx) => (
                        <div key={idx} className="font-mono text-[10.5px] text-slate-300 truncate" title={p}>
                          {p}
                        </div>
                      ))}
                      {targetPaths.length > 8 && (
                        <div className="text-[10px] text-slate-500 italic pt-1">
                          ... 其餘 {targetPaths.length - 8} 個項目已省略
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* 雜湊校驗分頁 (Checksum) */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium text-[11.5px]">
                  完整性校驗雜湊碼 (Cryptographic Checksums)
                </span>
                <button
                  type="button"
                  disabled={calculatingChecksum}
                  onClick={handleComputeChecksum}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] disabled:opacity-40"
                >
                  {calculatingChecksum ? (
                    <Loader2 size={12} className="animate-spin text-blue-400" />
                  ) : (
                    <Hash size={12} />
                  )}
                  <span>{calculatingChecksum ? "計算中..." : "重新計算"}</span>
                </button>
              </div>

              {calculatingChecksum ? (
                <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-400">
                  <Loader2 size={24} className="animate-spin text-emerald-400" />
                  <span>正在計算檔案雜湊值 (MD5 / SHA-256 / CRC32)...</span>
                </div>
              ) : checksum ? (
                <div className="space-y-2.5">
                  {/* SHA-256 */}
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-emerald-400">SHA-256</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(checksum.sha256, "sha256")}
                        className="flex items-center gap-1 text-[10.5px] text-slate-400 hover:text-white"
                      >
                        {copiedField === "sha256" ? (
                          <>
                            <Check size={11} className="text-emerald-400" />
                            <span className="text-emerald-400">已複製</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>複製</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono text-[11px] text-slate-200 break-all select-text">
                      {checksum.sha256}
                    </div>
                  </div>

                  {/* MD5 */}
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-blue-400">MD5</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(checksum.md5, "md5")}
                        className="flex items-center gap-1 text-[10.5px] text-slate-400 hover:text-white"
                      >
                        {copiedField === "md5" ? (
                          <>
                            <Check size={11} className="text-emerald-400" />
                            <span className="text-emerald-400">已複製</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>複製</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono text-[11px] text-slate-200 break-all select-text">
                      {checksum.md5}
                    </div>
                  </div>

                  {/* CRC32 */}
                  <div className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-amber-400">CRC32</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(checksum.crc32, "crc32")}
                        className="flex items-center gap-1 text-[10.5px] text-slate-400 hover:text-white"
                      >
                        {copiedField === "crc32" ? (
                          <>
                            <Check size={11} className="text-emerald-400" />
                            <span className="text-emerald-400">已複製</span>
                          </>
                        ) : (
                          <>
                            <Copy size={11} />
                            <span>複製</span>
                          </>
                        )}
                      </button>
                    </div>
                    <div className="font-mono text-[11px] text-slate-200 break-all select-text">
                      {checksum.crc32.toUpperCase()}
                    </div>
                  </div>

                  <div className="text-[10.5px] text-slate-500 text-right">
                    計算耗時：{checksum.elapsedMs} ms
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* 底部功能與操作列 */}
        <div className="px-4 py-3 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            {!isMulti && itemInfo && (
              <>
                <button
                  type="button"
                  onClick={() => apiRevealInShell(itemInfo.path).catch(console.error)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition-colors"
                  title="在系統原生檔案總管中標示此項目"
                >
                  <FolderOpen size={12} className="text-amber-400" />
                  <span>在檔案總管顯示</span>
                </button>
                <button
                  type="button"
                  onClick={() => apiOpenTerminal(itemInfo.path).catch(console.error)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition-colors"
                  title="在此目錄開啟終端機"
                >
                  <Terminal size={12} className="text-cyan-400" />
                  <span>終端機</span>
                </button>
                {!itemInfo.isDir && (
                  <button
                    type="button"
                    onClick={() => apiOpenItem(itemInfo.path).catch(console.error)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] transition-colors"
                    title="使用系統預設關聯程式開啟"
                  >
                    <ExternalLink size={12} className="text-blue-400" />
                    <span>開啟</span>
                  </button>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow transition-colors ml-auto"
          >
            確定
          </button>
        </div>
      </div>
    </div>
  );
};
