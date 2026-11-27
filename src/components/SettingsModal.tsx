import React, { useEffect, useRef, useState } from "react";
import {
  Type,
  Keyboard,
  X,
  RotateCcw,
  ShieldCheck,
  Check,
  FileJson,
  Download,
  Upload,
  ExternalLink,
  TerminalSquare,
  RefreshCw,
  Trash2,
  Boxes,
  FolderOpen,
  PackagePlus,
} from "lucide-react";
import {
  apiClearLogs,
  apiExportConfigWithDialog,
  apiGetDefaultConfigPath,
  apiGetLogFilePath,
  apiGetLogLevel,
  apiGetPluginsDirectory,
  apiImportConfigWithDialog,
  apiInstallPluginWithDialog,
  apiReadLogs,
  apiRevealInShell,
  apiSetLogFormat,
  apiSetLogLevel,
  isTauriRuntime,
} from "../api";
import {
  loadSingleExternalPlugin,
  uninstallPluginById,
} from "../plugins/loader";
import {
  AVAILABLE_FONTS,
  useAppStore,
  flushAutoSave,
  saveSettingsToFile,
} from "../store/useAppStore";
import { formatBytes, keyboardEventToCombo } from "../utils/formatters";
import { pluginRegistry } from "../plugins/registry";
import type {
  ConflictStrategy,
  LogFormat,
  LogLevel,
  ShortcutActionId,
  StructuredLogRecord,
} from "../types";

interface SettingsModalProps {
  visible: boolean;
  initialTab?: "appearance" | "shortcuts" | "queue" | "plugins" | "config" | "logs";
  onClose: () => void;
  onNotify?: (msg: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  initialTab = "appearance",
  onClose,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<
    "appearance" | "shortcuts" | "queue" | "plugins" | "config" | "logs"
  >(initialTab);
  const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null);
  const [customFontInput, setCustomFontInput] = useState("");
  const [configPathInput, setConfigPathInput] = useState("");
  const [configStatusMsg, setConfigStatusMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);

  // 結構化日誌檢視器狀態
  const [logFilePath, setLogFilePath] = useState("");
  const [logRecords, setLogRecords] = useState<StructuredLogRecord[]>([]);
  const [logLevelFilter, setLogLevelFilter] = useState<string>("ALL");
  const [loadingLogs, setLoadingLogs] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fontSettings = useAppStore((s) => s.fontSettings);
  const updateFontSettings = useAppStore((s) => s.updateFontSettings);
  const keybindings = useAppStore((s) => s.keybindings);
  const updateKeybinding = useAppStore((s) => s.updateKeybinding);
  const resetKeybindings = useAppStore((s) => s.resetKeybindings);
  const resetAllSettings = useAppStore((s) => s.resetAllSettings);
  const conflictStrategy = useAppStore((s) => s.conflictStrategy);
  const setConflictStrategy = useAppStore((s) => s.setConflictStrategy);
  const confirmDelete = useAppStore((s) => s.confirmDelete);
  const setConfirmDelete = useAppStore((s) => s.setConfirmDelete);
  const queueRetention = useAppStore((s) => s.queueRetention);
  const updateQueueRetention = useAppStore((s) => s.updateQueueRetention);
  const logFormat = useAppStore((s) => s.logFormat);
  const setLogFormat = useAppStore((s) => s.setLogFormat);
  const logLevel = useAppStore((s) => s.logLevel);
  const setLogLevel = useAppStore((s) => s.setLogLevel);
  const exportConfigJson = useAppStore((s) => s.exportConfigJson);
  const importConfigJson = useAppStore((s) => s.importConfigJson);
  const pluginsConfig = useAppStore((s) => s.pluginsConfig);
  const setPluginEnabled = useAppStore((s) => s.setPluginEnabled);
  const maxPreviewSizeBytes = useAppStore((s) => s.maxPreviewSizeBytes);
  const setMaxPreviewSizeBytes = useAppStore((s) => s.setMaxPreviewSizeBytes);

  const refreshLogs = async () => {
    setLoadingLogs(true);
    try {
      const [p, records] = await Promise.all([
        apiGetLogFilePath(),
        apiReadLogs(250),
      ]);
      setLogFilePath(p);
      setLogRecords(records.reverse());
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setConfigStatusMsg(null);
      setConfirmResetAll(false);
      apiGetDefaultConfigPath()
        .then((p) => {
          setConfigPathInput((prev) => prev || p);
        })
        .catch(console.error);
      refreshLogs();
    }
  }, [visible]);

  if (!visible) return null;

  const handleClose = () => {
    flushAutoSave();
    onClose();
  };

  // 1. 透過系統「另存新檔」檔案對話框選擇路徑匯出設定檔
  const handleExportConfig = async () => {
    try {
      await saveSettingsToFile();
      const jsonStr = exportConfigJson();
      const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const defaultFilename = `rfm-settings-${dateTag}.json`;
      const savedPath = await apiExportConfigWithDialog(jsonStr, defaultFilename);
      if (!savedPath) {
        // 使用者在系統檔案選擇視窗中按下「取消」
        return;
      }
      setConfigStatusMsg({
        type: "ok",
        text: `已成功匯出設定檔至：${savedPath}`,
      });
      onNotify?.(`設定檔已成功匯出至：${savedPath}`);
    } catch (err) {
      setConfigStatusMsg({
        type: "err",
        text: `匯出失敗：${String(err)}`,
      });
    }
  };

  // 2. 透過系統「開啟檔案」檔案對話框挑選任意 .json 設定檔匯入
  const handleImportConfig = async () => {
    try {
      if (isTauriRuntime()) {
        const res = await apiImportConfigWithDialog();
        if (!res) {
          // 使用者在系統檔案選擇視窗中按下「取消」
          return;
        }
        importConfigJson(res.content);
        await saveSettingsToFile();
        setConfigStatusMsg({
          type: "ok",
          text: `已成功從「${res.path}」匯入所有偏好設定、書籤、分頁與快捷鍵！`,
        });
        onNotify?.(`已匯入設定檔：${res.path}`);
      } else {
        fileInputRef.current?.click();
      }
    } catch (err) {
      setConfigStatusMsg({
        type: "err",
        text: `匯入失敗：${String(err)}`,
      });
    }
  };

  // Web 環境回退之 input file 變更處理器
  const handleWebFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const content = String(ev.target?.result || "");
        importConfigJson(content);
        await saveSettingsToFile();
        setConfigStatusMsg({
          type: "ok",
          text: `已成功從「${file.name}」匯入所有偏好設定、書籤、分頁與快捷鍵！`,
        });
        onNotify?.(`已匯入設定檔：${file.name}`);
      } catch (err) {
        setConfigStatusMsg({
          type: "err",
          text: `解析設定檔失敗：${String(err)}`,
        });
      }
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const handleInstallPluginWithDialog = async () => {
    try {
      const installed = await apiInstallPluginWithDialog();
      if (installed) {
        await loadSingleExternalPlugin(installed);
        onNotify?.(`外掛「${installed.name}」已成功安裝並即時生效！`);
      }
    } catch (err) {
      onNotify?.(`安裝外掛失敗: ${String(err)}`);
    }
  };

  const handleOpenPluginsFolder = async () => {
    try {
      const dir = await apiGetPluginsDirectory();
      await apiRevealInShell(dir);
    } catch (err) {
      onNotify?.(`開啟外掛目錄失敗: ${String(err)}`);
    }
  };

  const handleUninstallPlugin = async (id: string, name: string) => {
    try {
      const ok = await uninstallPluginById(id);
      if (ok) {
        onNotify?.(`已成功解除安裝外掛「${name}」`);
      }
    } catch (err) {
      onNotify?.(`解除安裝外掛失敗: ${String(err)}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[86vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">
              偏好設定
            </h2>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-medium">
              <Check size={12} />
              自動即時存檔至 settings.json
            </span>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-5 pt-3 border-b border-slate-800 bg-slate-950/30 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab("appearance")}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 font-medium transition-colors shrink-0 ${
              activeTab === "appearance"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Type size={15} />
            <span>字形與字體大小</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shortcuts")}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 font-medium transition-colors shrink-0 ${
              activeTab === "shortcuts"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Keyboard size={15} />
            <span>自定義鍵盤快速鍵</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 font-medium transition-colors shrink-0 ${
              activeTab === "queue"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck size={15} />
            <span>檔案佇列與衝突策略</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("plugins")}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 font-medium transition-colors shrink-0 ${
              activeTab === "plugins"
                ? "border-cyan-500 text-cyan-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Boxes size={15} />
            <span>外掛功能管理</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("config")}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 font-medium transition-colors shrink-0 ${
              activeTab === "config"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileJson size={15} />
            <span>設定檔匯出/匯入</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("logs");
              refreshLogs();
            }}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 font-medium transition-colors shrink-0 ${
              activeTab === "logs"
                ? "border-amber-500 text-amber-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <TerminalSquare size={15} />
            <span>系統診斷日誌 (JSON Logs)</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5 text-xs">
          {activeTab === "appearance" && (
            <div className="space-y-6">
              <div>
                <label className="block text-slate-200 font-medium mb-2">
                  選擇預設字形家族 (Font Family)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {AVAILABLE_FONTS.map((f) => {
                    const selected = fontSettings.fontFamily === f.value;
                    return (
                      <button
                        key={f.label}
                        type="button"
                        onClick={() =>
                          updateFontSettings({ fontFamily: f.value })
                        }
                        style={{ fontFamily: f.value }}
                        className={`flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                          selected
                            ? "bg-blue-600/20 border-blue-500 text-white"
                            : "bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700"
                        }`}
                      >
                        <span>{f.label}</span>
                        {selected && (
                          <Check size={15} className="text-blue-400 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-slate-200 font-medium mb-1.5">
                  或輸入系統已安裝的自訂字體名稱
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customFontInput}
                    onChange={(e) => setCustomFontInput(e.target.value)}
                    placeholder="例如: 'Sarasa Mono TC', 'Fira Code', sans-serif"
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customFontInput.trim()) {
                        updateFontSettings({
                          fontFamily: customFontInput.trim(),
                        });
                      }
                    }}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
                  >
                    套用自訂字體
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-200">
                      檔案列表字體大小
                    </span>
                    <span className="text-blue-400 font-mono font-semibold">
                      {fontSettings.fontSizePx} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={11}
                    max={24}
                    step={1}
                    value={fontSettings.fontSizePx}
                    onChange={(e) =>
                      updateFontSettings({
                        fontSizePx: Number(e.target.value),
                      })
                    }
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>11px</span>
                    <span>14px</span>
                    <span>24px</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-200">
                      全域 UI 介面字體大小
                    </span>
                    <span className="text-purple-400 font-mono font-semibold">
                      {fontSettings.uiFontSizePx || 14} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={11}
                    max={22}
                    step={1}
                    value={fontSettings.uiFontSizePx || 14}
                    onChange={(e) =>
                      updateFontSettings({
                        uiFontSizePx: Number(e.target.value),
                      })
                    }
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>緊湊 (11px)</span>
                    <span>標準 (14px)</span>
                    <span>放大 (22px)</span>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-200">
                      虛擬列表列高 (Row Height)
                    </span>
                    <span className="text-emerald-400 font-mono font-semibold">
                      {fontSettings.rowHeightPx} px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={26}
                    max={58}
                    step={2}
                    value={fontSettings.rowHeightPx}
                    onChange={(e) =>
                      updateFontSettings({
                        rowHeightPx: Number(e.target.value),
                      })
                    }
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                    <span>26px</span>
                    <span>34px</span>
                    <span>58px</span>
                  </div>
                </div>
              </div>

              {/* 即時字體預覽區 */}
              <div
                style={{
                  fontFamily: fontSettings.fontFamily,
                  fontSize: `${fontSettings.fontSizePx}px`,
                }}
                className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-1"
              >
                <div className="text-xs text-slate-400 mb-1">
                  即時顯示預覽 (Live Typography Preview)：
                </div>
                <div className="text-white font-medium">
                  D:/devops_workspace/private/rust_file_manager/Cargo.toml — 128.4 KB
                </div>
                <div className="text-slate-300">
                  跨平台高效能檔案總管 ABCDEFGHIJKLM 0123456789 (Il1O0)
                </div>
              </div>
            </div>
          )}

          {activeTab === "shortcuts" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-lg border border-slate-800">
                <p className="text-slate-300">
                  預設採用 <strong>Microsoft Windows 檔案總管</strong> 標準快速鍵（例如{" "}
                  <code className="text-amber-300">F2</code> 重新命名、
                  <code className="text-amber-300">Delete</code> 回收桶、
                  <code className="text-amber-300">Shift+Delete</code> 永久刪除）。點擊右側按鍵即可錄製自訂組合鍵。
                </p>
                <button
                  type="button"
                  onClick={resetKeybindings}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 shrink-0"
                >
                  <RotateCcw size={13} />
                  <span>全部還原預設值</span>
                </button>
              </div>

              <div className="divide-y divide-slate-800 border border-slate-800 rounded-lg overflow-hidden">
                {keybindings.map((kb) => {
                  const isRecording = recordingId === kb.id;
                  return (
                    <div
                      key={kb.id}
                      className="flex items-center justify-between px-4 py-2.5 bg-slate-950/40 hover:bg-slate-900/80"
                    >
                      <div>
                        <div className="font-medium text-slate-200">
                          {kb.label}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {kb.description}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setRecordingId(isRecording ? null : kb.id)
                          }
                          onKeyDown={(e) => {
                            if (!isRecording) return;
                            e.preventDefault();
                            e.stopPropagation();
                            if (e.key === "Escape") {
                              setRecordingId(null);
                              return;
                            }
                            const combo = keyboardEventToCombo(e);
                            if (
                              combo &&
                              !["Ctrl", "Alt", "Shift"].includes(combo)
                            ) {
                              updateKeybinding(kb.id, combo);
                              setRecordingId(null);
                            }
                          }}
                          className={`min-w-[120px] px-3 py-1.5 rounded font-mono text-xs border transition-all ${
                            isRecording
                              ? "bg-amber-500/20 border-amber-400 text-amber-300 animate-pulse"
                              : "bg-slate-900 border-slate-700 text-blue-300 hover:border-blue-500"
                          }`}
                        >
                          {isRecording ? "請按下新快速鍵..." : kb.keyCombo}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "queue" && (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="font-medium text-slate-200">
                  檔案搬移與複製佇列 (Queue) 預設同名衝突處理策略
                </div>
                <p className="text-slate-400">
                  當執行大量檔案複製或跨目錄拖拉搬移時，若目標資料夾已存在同名檔案，背景佇列應採取的預設行為：
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  {(
                    [
                      {
                        id: "ask",
                        title: "每次詢問我如何處理 (預設)",
                        desc: "當偵測到同名檔案時彈出對話視窗，讓您當場選擇改名、覆寫或略過",
                      },
                      {
                        id: "rename",
                        title: "自動重新命名保留兩者",
                        desc: "自動加上 _1, _2 後綴，確保不覆蓋任何既有資料且不中斷巨量佇列",
                      },
                      {
                        id: "overwrite",
                        title: "直接覆寫目標檔案",
                        desc: "以來源檔案直接取代目標目錄中的同名檔案",
                      },
                      {
                        id: "skip",
                        title: "略過同名檔案",
                        desc: "若目標已存在同名檔案則直接跳過不處理",
                      },
                    ] as { id: ConflictStrategy; title: string; desc: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setConflictStrategy(item.id)}
                      className={`p-3.5 rounded-lg border text-left transition-all ${
                        conflictStrategy === item.id
                          ? "bg-blue-600/20 border-blue-500 text-white"
                          : "bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700"
                      }`}
                    >
                      <div className="font-semibold mb-1">{item.title}</div>
                      <div className="text-[11px] text-slate-400">
                        {item.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 檔案刪除安全防呆確認設定 */}
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-200">
                      檔案刪除安全防呆確認 (Delete Confirmation)
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      按下鍵盤 Delete 鍵（移至回收桶）、Shift+Delete（永久刪除）或右鍵選單刪除時，先跳出確認對話視窗防範誤刪
                    </p>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 shrink-0">
                    <input
                      type="checkbox"
                      checked={confirmDelete}
                      onChange={(e) => setConfirmDelete(e.target.checked)}
                      className="rounded border-slate-600 accent-blue-500"
                    />
                    <span className="font-medium">
                      {confirmDelete ? "啟用刪除確認 (預設)" : "直接刪除不詢問"}
                    </span>
                  </label>
                </div>
              </div>

              {/* 佇列任務歷史紀錄 (Events) 保留策略設定 */}
              <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-200">
                      佇列任務歷史紀錄 (Queue Events) 保留設定
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      設定已完成的檔案傳輸任務事件是否保留在佇列清單中，以及保留的天數與最大筆數上限
                    </p>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 shrink-0">
                    <input
                      type="checkbox"
                      checked={queueRetention.keepHistory}
                      onChange={(e) =>
                        updateQueueRetention({ keepHistory: e.target.checked })
                      }
                      className="rounded border-slate-600 accent-blue-500"
                    />
                    <span className="font-medium">
                      {queueRetention.keepHistory
                        ? "保留歷史事件紀錄"
                        : "不保留 (完成後自動清除)"}
                    </span>
                  </label>
                </div>

                {queueRetention.keepHistory && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-800/80">
                    <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-200">
                          保留天數上限 (Days)
                        </span>
                        <span className="text-blue-400 font-mono font-semibold">
                          {queueRetention.retentionDays} 天
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={queueRetention.retentionDays}
                          onChange={(e) =>
                            updateQueueRetention({
                              retentionDays: Math.max(
                                1,
                                Math.min(365, Number(e.target.value) || 1)
                              ),
                            })
                          }
                          className="w-24 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                        />
                        <div className="flex items-center gap-1">
                          {[1, 3, 7, 14, 30].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() =>
                                updateQueueRetention({ retentionDays: d })
                              }
                              className={`px-2 py-1 rounded text-[11px] ${
                                queueRetention.retentionDays === d
                                  ? "bg-blue-600 text-white"
                                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                              }`}
                            >
                              {d}天
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        超過 {queueRetention.retentionDays} 天的已完成/已取消事件將自動從佇列清理
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-slate-900/70 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-200">
                          保留最大筆數上限 (Max Events)
                        </span>
                        <span className="text-emerald-400 font-mono font-semibold">
                          最多 {queueRetention.maxEvents} 筆
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={1000}
                          value={queueRetention.maxEvents}
                          onChange={(e) =>
                            updateQueueRetention({
                              maxEvents: Math.max(
                                1,
                                Math.min(1000, Number(e.target.value) || 1)
                              ),
                            })
                          }
                          className="w-24 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-white font-mono"
                        />
                        <div className="flex items-center gap-1">
                          {[10, 30, 50, 100, 200].map((cnt) => (
                            <button
                              key={cnt}
                              type="button"
                              onClick={() =>
                                updateQueueRetention({ maxEvents: cnt })
                              }
                              className={`px-2 py-1 rounded text-[11px] ${
                                queueRetention.maxEvents === cnt
                                  ? "bg-emerald-600 text-white"
                                  : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                              }`}
                            >
                              {cnt}筆
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">
                        當歷史紀錄超過 {queueRetention.maxEvents} 筆時，自動淘汰最舊的事件
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "plugins" && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-lg text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="font-semibold text-slate-200">
                    微核心外掛管理 (Micro-Kernel Plugin Architecture)
                  </span>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    所有預覽模組均採動態按需載入。支援從本機安裝獨立外掛套件包 (.rfmp / .zip)。
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleInstallPluginWithDialog}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow transition-colors"
                  >
                    <PackagePlus size={13} />
                    安裝外掛 (.rfmp)
                  </button>
                  <button
                    type="button"
                    onClick={handleOpenPluginsFolder}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-colors"
                    title="在檔案總管開啟外掛資料夾"
                  >
                    <FolderOpen size={13} />
                    外掛目錄
                  </button>
                </div>
              </div>

              {/* 預覽檔案大小上限設定 */}
              <div className="p-4 bg-slate-900/60 border border-slate-800 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-slate-200">
                      預覽檔案大小上限 (預設 5 MB)
                    </span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      多媒體與文字檔案的初始預覽上限。超出此上限的檔案會先提示，並提供「強制載入預覽」按鈕，防範超大檔案拖慢效能。
                    </p>
                  </div>
                  <span className="font-mono text-xs px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-cyan-300 font-semibold shrink-0">
                    {formatBytes(maxPreviewSizeBytes)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {[
                    { label: "1 MB", bytes: 1 * 1024 * 1024 },
                    { label: "2 MB", bytes: 2 * 1024 * 1024 },
                    { label: "5 MB (預設)", bytes: 5 * 1024 * 1024 },
                    { label: "10 MB", bytes: 10 * 1024 * 1024 },
                    { label: "20 MB", bytes: 20 * 1024 * 1024 },
                    { label: "50 MB", bytes: 50 * 1024 * 1024 },
                    { label: "100 MB", bytes: 100 * 1024 * 1024 },
                  ].map((preset) => {
                    const isSelected = maxPreviewSizeBytes === preset.bytes;
                    return (
                      <button
                        key={preset.bytes}
                        type="button"
                        onClick={() => setMaxPreviewSizeBytes(preset.bytes)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          isSelected
                            ? "bg-cyan-500/20 border-cyan-500 text-cyan-300 shadow-sm"
                            : "bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2.5">
                {pluginRegistry.getAllPlugins().map((plugin) => {
                  const isEnabled =
                    pluginsConfig[plugin.id] ?? plugin.defaultEnabled;
                  return (
                    <div
                      key={plugin.id}
                      className="p-3.5 rounded-lg border border-slate-800 bg-slate-900/40 flex items-center justify-between hover:bg-slate-900/70 transition-colors"
                    >
                      <div className="space-y-1 pr-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-slate-200 text-xs">
                            {plugin.name}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                            v{plugin.version}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
                            {plugin.id}
                          </span>
                          {plugin.extensions && plugin.extensions.length > 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 text-emerald-400 font-mono">
                              {plugin.extensions.slice(0, 4).join(", ")}
                              {plugin.extensions.length > 4 ? "..." : ""}
                            </span>
                          )}
                          {plugin.isExternal && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono">
                              外部外掛
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {plugin.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {plugin.isExternal && (
                          <button
                            type="button"
                            onClick={() => handleUninstallPlugin(plugin.id, plugin.name)}
                            className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                            title="解除安裝此外部外掛"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        <label className="relative inline-flex items-center cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() =>
                              setPluginEnabled(plugin.id, !isEnabled)
                            }
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "config" && (
            <div className="space-y-4">
              {configStatusMsg && (
                <div
                  className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
                    configStatusMsg.type === "ok"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-rose-500/15 border-rose-500/40 text-rose-300"
                  }`}
                >
                  <span>{configStatusMsg.text}</span>
                  <button
                    type="button"
                    onClick={() => setConfigStatusMsg(null)}
                    className="text-slate-400 hover:text-white ml-2 p-0.5 rounded"
                  >
                    <X size={13} />
                  </button>
                </div>
              )}

              {/* 設定檔路徑 */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-200 text-xs flex items-center gap-2">
                    <FileJson size={16} className="text-amber-400" />
                    <span>設定檔完整路徑 (Portable 隨身攜帶)</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={configPathInput}
                    className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 font-mono text-xs select-all focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (configPathInput) apiRevealInShell(configPathInput).catch(() => {});
                    }}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors shrink-0"
                    title="在系統檔案總管中開啟此設定檔所在位置"
                  >
                    <ExternalLink size={14} className="text-cyan-400" />
                    <span>在檔案總管開啟</span>
                  </button>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  系統已啟用<strong>即時防抖自動儲存</strong>，在各分頁中進行的任何設定異動皆會自動同步寫入此檔案，啟動時亦會自動載入。
                </p>
              </div>

              {/* 匯出與匯入兩大按鈕 */}
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="font-semibold text-slate-200 text-xs">
                  設定檔備份與遷移
                </div>
                <p className="text-[11px] text-slate-400">
                  您可將目前的所有偏好設定、快速鍵與書籤匯出為獨立 JSON 備份檔，或從備份檔還原。
                </p>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleExportConfig}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-md transition-colors"
                  >
                    <Download size={15} />
                    <span>匯出設定檔</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleImportConfig}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium shadow-md transition-colors"
                  >
                    <Upload size={15} />
                    <span>匯入設定檔</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleWebFileInputChange}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === "logs" && (
            <div className="space-y-4">
              {/* 日誌輸出格式設定與檔案位置 */}
              <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-200">
                      結構化日誌格式與持久化路徑 (Structured Logging)
                    </div>
                    <p className="text-slate-400 mt-0.5">
                      預設採用 <strong>JSON Lines (`.jsonl`)</strong> 格式寫入磁碟（單檔上限 5 MB 自動輪替），可直接透過{" "}
                      <code className="text-amber-300">jq</code>、Loki、ELK 或 Datadog 收集查詢。當設定檔損毀或發生未預期 Panic 時亦會自動記錄行號與備份路徑。
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-lg border border-slate-700 shrink-0">
                    {(
                      [
                        { id: "json", label: "JSON Lines (推薦)" },
                        { id: "text", label: "Plain Text" },
                      ] as { id: LogFormat; label: string }[]
                    ).map((fmt) => (
                      <button
                        key={fmt.id}
                        type="button"
                        onClick={async () => {
                          setLogFormat(fmt.id);
                          await apiSetLogFormat(fmt.id);
                          await refreshLogs();
                          onNotify?.(`日誌格式已切換為 ${fmt.label}`);
                        }}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          logFormat === fmt.id
                            ? "bg-amber-500 text-slate-950 font-semibold"
                            : "text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {fmt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 日誌記錄門檻等級 (Log Level Filter) */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div>
                    <div className="font-semibold text-xs text-slate-300">
                      日誌記錄等級 (Log Level Filter)
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      預設為 <strong>ERROR</strong>（僅記錄錯誤與 Panic，保持零雜訊）；亦可切換為 DEBUG、INFO 或 WARN。
                    </p>
                  </div>

                  <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-700 shrink-0">
                    {(
                      [
                        { id: "error", label: "ERROR (預設)" },
                        { id: "warn", label: "WARN" },
                        { id: "info", label: "INFO" },
                        { id: "debug", label: "DEBUG" },
                      ] as { id: LogLevel; label: string }[]
                    ).map((lvl) => (
                      <button
                        key={lvl.id}
                        type="button"
                        onClick={async () => {
                          setLogLevel(lvl.id);
                          await apiSetLogLevel(lvl.id);
                          await refreshLogs();
                          onNotify?.(`日誌記錄等級已切換為 ${lvl.label}`);
                        }}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          logLevel === lvl.id
                            ? "bg-rose-500 text-white font-semibold"
                            : "text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {lvl.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                  <div className="font-mono text-[11px] text-slate-300 truncate">
                    日誌檔路徑：<span className="text-amber-300">{logFilePath}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (logFilePath) apiRevealInShell(logFilePath).catch(() => {});
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      <ExternalLink size={12} />
                      <span>在檔案總管開啟</span>
                    </button>
                    <button
                      type="button"
                      onClick={refreshLogs}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200"
                    >
                      <RefreshCw
                        size={12}
                        className={loadingLogs ? "animate-spin text-blue-400" : ""}
                      />
                      <span>重新整理</span>
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await apiClearLogs();
                        await refreshLogs();
                        onNotify?.("已清空日誌記錄");
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500/20 hover:bg-rose-500/30 text-rose-300"
                    >
                      <Trash2 size={12} />
                      <span>清空日誌</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 等級過濾列 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {["ALL", "INFO", "WARN", "ERROR", "PANIC"].map((lv) => (
                    <button
                      key={lv}
                      type="button"
                      onClick={() => setLogLevelFilter(lv)}
                      className={`px-2.5 py-1 rounded text-[11px] font-mono font-medium ${
                        logLevelFilter === lv
                          ? "bg-blue-600 text-white"
                          : "bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {lv}
                    </button>
                  ))}
                </div>
                <span className="text-[11px] text-slate-400">
                  顯示最近 {logRecords.length} 筆事件
                </span>
              </div>

              {/* JSON 日誌清單檢視器 */}
              <div className="max-h-72 overflow-y-auto rounded-lg bg-slate-950 border border-slate-800 p-3 space-y-1.5 font-mono text-[11px] select-text">
                {logRecords
                  .filter(
                    (r) =>
                      logLevelFilter === "ALL" ||
                      r.level.toUpperCase() === logLevelFilter
                  )
                  .map((rec, idx) => (
                    <div
                      key={`${rec.timestamp}_${idx}`}
                      className="p-2 rounded bg-slate-900/80 border border-slate-800/80 break-all"
                    >
                      {logFormat === "json" ? (
                        <span className="text-slate-300">
                          {JSON.stringify(rec)}
                        </span>
                      ) : (
                        <div>
                          <span className="text-slate-500">{rec.timestamp} </span>
                          <span
                            className={
                              rec.level === "ERROR" || rec.level === "PANIC"
                                ? "text-rose-400 font-bold"
                                : rec.level === "WARN"
                                ? "text-amber-400 font-semibold"
                                : "text-emerald-400"
                            }
                          >
                            [{rec.level}]
                          </span>{" "}
                          <span className="text-cyan-400">[{rec.target}]</span>{" "}
                          <span className="text-slate-200">{rec.message}</span>
                          {rec.context && (
                            <span className="text-slate-400">
                              {" "}
                              {JSON.stringify(rec.context)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 bg-slate-950/80 text-xs">
          <div className="flex items-center gap-2">
            {!confirmResetAll ? (
              <button
                type="button"
                onClick={() => setConfirmResetAll(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 transition-colors"
              >
                <RotateCcw size={13} />
                <span>將所有設定恢復預設值</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-rose-950/50 border border-rose-500/40 px-3 py-1 rounded-lg">
                <span className="text-rose-200 font-medium">
                  確定將字型、快速鍵、佇列與面板設定全部恢復預設值？
                </span>
                <button
                  type="button"
                  onClick={() => {
                    resetAllSettings();
                    setConfirmResetAll(false);
                    onNotify?.("已將所有偏好設定恢復為出廠預設值");
                  }}
                  className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white font-semibold"
                >
                  確定重設
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResetAll(false)}
                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  取消
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="px-5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium"
          >
            完成並關閉
          </button>
        </div>
      </div>
    </div>
  );
};
