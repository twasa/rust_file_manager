import React, { useState } from "react";
import {
  Type,
  Keyboard,
  X,
  RotateCcw,
  ShieldCheck,
  Check,
} from "lucide-react";
import { AVAILABLE_FONTS, useAppStore } from "../store/useAppStore";
import { keyboardEventToCombo } from "../utils/formatters";
import type { ConflictStrategy, ShortcutActionId } from "../types";

interface SettingsModalProps {
  visible: boolean;
  initialTab?: "appearance" | "shortcuts" | "queue";
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  initialTab = "appearance",
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"appearance" | "shortcuts" | "queue">(
    initialTab
  );
  const [recordingId, setRecordingId] = useState<ShortcutActionId | null>(null);
  const [customFontInput, setCustomFontInput] = useState("");

  const fontSettings = useAppStore((s) => s.fontSettings);
  const updateFontSettings = useAppStore((s) => s.updateFontSettings);
  const keybindings = useAppStore((s) => s.keybindings);
  const updateKeybinding = useAppStore((s) => s.updateKeybinding);
  const resetKeybindings = useAppStore((s) => s.resetKeybindings);
  const conflictStrategy = useAppStore((s) => s.conflictStrategy);
  const setConflictStrategy = useAppStore((s) => s.setConflictStrategy);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">
              偏好設定與自訂鍵盤快速鍵
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
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-800 bg-slate-950/30 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("appearance")}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium transition-colors ${
              activeTab === "appearance"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Type size={15} />
            <span>字形與字體大小 (Typography)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shortcuts")}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium transition-colors ${
              activeTab === "shortcuts"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Keyboard size={15} />
            <span>自定義鍵盤快速鍵 (Keybindings)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("queue")}
            className={`flex items-center gap-2 px-4 py-2 border-b-2 font-medium transition-colors ${
              activeTab === "queue"
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <ShieldCheck size={15} />
            <span>檔案佇列與衝突策略</span>
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
        </div>

        {/* Footer */}
        <div className="flex justify-end px-5 py-3 border-t border-slate-800 bg-slate-950/80">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs text-white font-medium"
          >
            完成並儲存
          </button>
        </div>
      </div>
    </div>
  );
};
