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
  Save,
  FolderOpen,
  ExternalLink,
} from "lucide-react";
import {
  apiGetDefaultConfigPath,
  apiLoadConfigFile,
  apiRevealInShell,
  apiSaveConfigFile,
} from "../api";
import { AVAILABLE_FONTS, useAppStore } from "../store/useAppStore";
import { keyboardEventToCombo } from "../utils/formatters";
import type { ConflictStrategy, ShortcutActionId } from "../types";

interface SettingsModalProps {
  visible: boolean;
  initialTab?: "appearance" | "shortcuts" | "queue" | "config";
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
    "appearance" | "shortcuts" | "queue" | "config"
  >(initialTab);
  const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null);
  const [customFontInput, setCustomFontInput] = useState("");
  const [configPathInput, setConfigPathInput] = useState("");
  const [configStatusMsg, setConfigStatusMsg] = useState<{
    type: "ok" | "err";
    text: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fontSettings = useAppStore((s) => s.fontSettings);
  const updateFontSettings = useAppStore((s) => s.updateFontSettings);
  const keybindings = useAppStore((s) => s.keybindings);
  const updateKeybinding = useAppStore((s) => s.updateKeybinding);
  const resetKeybindings = useAppStore((s) => s.resetKeybindings);
  const conflictStrategy = useAppStore((s) => s.conflictStrategy);
  const setConflictStrategy = useAppStore((s) => s.setConflictStrategy);
  const exportConfigJson = useAppStore((s) => s.exportConfigJson);
  const importConfigJson = useAppStore((s) => s.importConfigJson);

  useEffect(() => {
    if (visible) {
      setConfigStatusMsg(null);
      apiGetDefaultConfigPath()
        .then((p) => {
          setConfigPathInput((prev) => prev || p);
        })
        .catch(console.error);
    }
  }, [visible]);

  if (!visible) return null;

  // 1. 透過 Rust 後端儲存 JSON 設定檔至指定磁碟路徑
  const handleSaveToDisk = async () => {
    try {
      const jsonStr = exportConfigJson();
      const savedPath = await apiSaveConfigFile(jsonStr, configPathInput);
      setConfigPathInput(savedPath);
      setConfigStatusMsg({
        type: "ok",
        text: `已成功匯出設定檔至磁碟：${savedPath}`,
      });
      onNotify?.(`設定檔已匯出至 ${savedPath}`);
    } catch (err) {
      setConfigStatusMsg({
        type: "err",
        text: `匯出失敗：${String(err)}`,
      });
    }
  };

  // 2. 透過 Rust 後端從指定磁碟路徑讀取並匯入 JSON 設定檔
  const handleLoadFromDisk = async () => {
    try {
      const rawJson = await apiLoadConfigFile(configPathInput);
      importConfigJson(rawJson);
      setConfigStatusMsg({
        type: "ok",
        text: `已成功從磁碟載入並套用設定檔：${configPathInput}`,
      });
      onNotify?.("已成功匯入並套用設定檔！");
    } catch (err) {
      setConfigStatusMsg({
        type: "err",
        text: `匯入失敗：${String(err)}`,
      });
    }
  };

  // 3. 瀏覽器/檔案選擇器直接下載 .json 備份檔
  const handleDownloadJsonFile = () => {
    const jsonStr = exportConfigJson();
    const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateTag = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url;
    a.download = `rfm-settings-${dateTag}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setConfigStatusMsg({
      type: "ok",
      text: `已觸發下載設定檔備份 (rfm-settings-${dateTag}.json)`,
    });
  };

  // 4. 從本機檔案選擇器挑選任意 .json 匯入
  const handleUploadJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = String(ev.target?.result || "");
        importConfigJson(content);
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[86vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">
              偏好設定、自訂快速鍵與設定檔匯出/匯入
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
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
            onClick={() => setActiveTab("config")}
            className={`flex items-center gap-2 px-3.5 py-2 border-b-2 font-medium transition-colors shrink-0 ${
              activeTab === "config"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileJson size={15} />
            <span>設定檔匯出 / 匯入 (.json)</span>
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="p-4 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-200">
                      字體大小 (Font Size)
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
                    <span>緊湊 (11px)</span>
                    <span>標準 (14px)</span>
                    <span>大型高清晰 (24px)</span>
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
                    <span>高密度 (26px)</span>
                    <span>舒適 (34px)</span>
                    <span>寬鬆 (58px)</span>
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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  {(
                    [
                      {
                        id: "rename",
                        title: "自動重新命名保留兩者 (推薦)",
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
            </div>
          )}

          {activeTab === "config" && (
            <div className="space-y-5">
              {configStatusMsg && (
                <div
                  className={`p-3 rounded-lg border text-xs ${
                    configStatusMsg.type === "ok"
                      ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                      : "bg-rose-500/15 border-rose-500/40 text-rose-300"
                  }`}
                >
                  {configStatusMsg.text}
                </div>
              )}

              {/* 方式一：磁碟固定路徑讀寫 (支援跨平台設定目錄或 Portable 模式) */}
              <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="font-semibold text-slate-200 flex items-center gap-2">
                  <Save size={15} className="text-emerald-400" />
                  <span>1. 直接儲存 / 載入本機設定檔路徑 (支援 Portable 隨身碟攜帶)</span>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  可將您的<strong>字型與大小、自訂鍵盤快速鍵、書籤捷徑、已鎖定與設色分頁、雙欄狀態</strong>直接寫入指定的{" "}
                  <code className="text-emerald-300">.json</code>{" "}
                  設定檔路徑。若將檔案命名為{" "}
                  <code className="text-amber-300">rfm-settings.json</code>{" "}
                  放在執行檔同目錄，即可作為免安裝隨身攜帶設定檔。
                </p>

                <div className="space-y-2 pt-1">
                  <label className="block text-[11px] text-slate-400">
                    目標設定檔完整路徑：
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={configPathInput}
                      onChange={(e) => setConfigPathInput(e.target.value)}
                      placeholder="例如: D:/devops_workspace/private/rust_file_manager/rfm-settings.json"
                      className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-white font-mono text-xs focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (configPathInput) apiRevealInShell(configPathInput).catch(() => {});
                      }}
                      className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
                      title="在系統檔案總管中顯示此設定檔"
                    >
                      <ExternalLink size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={handleSaveToDisk}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                    >
                      <Save size={14} />
                      <span>匯出寫入此路徑</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleLoadFromDisk}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium"
                    >
                      <FolderOpen size={14} />
                      <span>從此路徑讀取匯入</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 方式二：透過檔案選擇器任意匯出下載 / 挑選檔案匯入 */}
              <div className="p-4 rounded-lg bg-slate-950/70 border border-slate-800 space-y-3">
                <div className="font-semibold text-slate-200 flex items-center gap-2">
                  <FileJson size={15} className="text-blue-400" />
                  <span>2. 透過檔案對話框匯出備份或選擇任意設定檔匯入</span>
                </div>
                <p className="text-slate-400">
                  方便您將設定檔備份分享至其他電腦（Windows / Linux / macOS 格式完全相容）。
                </p>

                <div className="flex items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleDownloadJsonFile}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium"
                  >
                    <Download size={14} className="text-emerald-400" />
                    <span>下載設定檔備份 (.json)</span>
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleUploadJsonFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium"
                  >
                    <Upload size={14} className="text-blue-400" />
                    <span>瀏覽並選擇 .json 設定檔匯入...</span>
                  </button>
                </div>
              </div>

              {/* 目前設定檔 JSON 內容即時預覽 */}
              <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800">
                <div className="text-[11px] text-slate-400 mb-2 flex justify-between">
                  <span>目前設定檔 JSON 結構預覽：</span>
                  <span className="font-mono text-slate-500">schemaVersion: 1</span>
                </div>
                <pre className="max-h-44 overflow-y-auto text-[11px] font-mono text-slate-300 whitespace-pre-wrap select-text">
                  {exportConfigJson()}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-slate-800 bg-slate-950/80">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium"
          >
            完成並關閉
          </button>
        </div>
      </div>
    </div>
  );
};
