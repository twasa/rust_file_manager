# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-11-26

### Added
- **作業系統級系統剪貼簿雙向互通 (System Native Clipboard Integration)** (`src-tauri/src/clipboard_ops.rs` & `src/api.ts` & `src/App.tsx`)：
  - **檔案總管複製 ➔ 本管理器貼上**：從外部 Windows 檔案總管、macOS Finder、Linux Nautilus 複製或剪下實體檔案，切換至本管理器按 `Ctrl+V` 可直接解析作業系統剪貼簿（Windows `CF_HDROP`、`Preferred DropEffect`）並加入傳輸佇列執行。
  - **本管理器複製 ➔ 檔案總管貼上**：在列表按 `Ctrl+C` 複製或 `Ctrl+X` 剪下，自動封裝 `DROPFILES` 結構寫入全域系統剪貼簿，可於外部作業系統程式中無縫貼上。
  - **即時剪貼簿狀態感知**：當視窗重新聚焦（`focus`）或觸發右鍵選單時自動同步系統剪貼簿狀態，確保工具列與選單上的「貼上」按鈕即時啟用。
- **作業系統級雙向拖曳功能 (System Native Drag & Drop)** (`tauri-plugin-drag` & `src/components/FilePane.tsx` & `src/App.tsx`)：
  - **原生檔案拖出至外部應用程式 (Native Drag Out)**：整合作業系統底層拖曳協定，支援直接將音樂、影片或各類檔案由本管理器**拖曳至外部播放器（如 VLC、PotPlayer、Spotify）、瀏覽器或各類修圖軟體**，由外部程式直接解析並開啟播放。
  - **外部檔案拖入應用程式 (Native Drag In)**：啟用 Tauri 2 原生 `dragDropEnabled` 與 `onDragDropEvent`，支援將外部視窗或桌面之實體檔案拖入特定子資料夾、分頁標籤、側邊欄書籤/磁碟區或目前列表面板，跨 Windows、Linux、macOS 全平台相容。

### Fixed
- **修復檔案向外拖拉至 Windows 檔案總管複製失效問題** (`src/components/FilePane.tsx` & `src/api.ts`)：
  - 在 `onDragStart` 調用 `e.preventDefault()` 阻止瀏覽器預設 HTML5 拖拉行為，杜絕 Chromium 內部文字拖拉搶佔滑鼠捕獲，由作業系統原生 OLE `DoDragDrop` 管線全權接管。
  - 靜態引入 `startDrag` 消除動態模組載入之微任務延遲，並將傳入之檔案路徑自動轉換為標準 Windows 原生反斜線格式（`D:\...`）。
  - 在 `App.tsx` 補強父目錄比對防呆，避免在相同目錄內意外拖放造成重複自拷貝。
- **建置發布指令碼防呆與磁碟前置健康檢查** (`scripts/build-release.ps1`)：
  - 補足相依套件完整性檢驗，若缺漏 `@crabnebula/tauri-plugin-drag` 自動觸發離線優先的 `npm install`。
  - 加入磁碟空間前置健康檢查與建置診斷資訊輸出。

## [0.2.0] - 2026-11-25

### Added
- **微核心外掛預覽架構 (Micro-kernel Plugin Architecture)** (`src/plugins/`)：
  - 設計高內聚、鬆耦合之外掛擴充登錄系統 (`PluginRegistry`)，支援自訂多媒體與特殊檔案格式預覽器擴充。
  - 實作「外掛功能管理」設定介面，提供熱插拔啟用/停用各預覽器外掛。
- **豐富多媒體與程式碼預覽器 (Built-in Preview Plugins)**：
  - **圖片與向量圖預覽器 (`ImagePreviewPlugin`)**：支援 PNG, JPG, WebP, GIF, SVG, BMP 縮放檢視 (Fit / Zoom In / Zoom Out) 與原始解析度資訊。
  - **音訊與影片原生播放器 (`MediaPreviewPlugin`)**：支援 MP4, WebM, MP3, WAV, OGG 等媒體原生播放，並提供非原生或特殊編碼之容錯提示與一鍵外部預設程式開啟。
  - **Markdown 文件美化渲染器 (`MarkdownPreviewPlugin`)**：支援標題階層、程式碼區塊、核取清單與行數/字數統計。
  - **程式碼語法高亮檢視器 (`CodePreviewPlugin`)**：支援行號標註、一鍵複製程式碼與大檔案分段讀取。
- **高效能大檔案分段載入與串流預覽機制**：
  - 後端新增 `cmd_read_file_chunk` 指令，支援按指定 offset 與長度讀取二進位資料。
  - 預覽設定提供自訂預覽檔案大小上限（預設調整為 5MB），並支援超過上限時「分段載入更多 (Load more chunk)」功能。

### Fixed
- **修復 Tauri 2.x 下 Asset Protocol 預覽圖片與影音 403 Forbidden 失敗問題**：
  - 於 `tauri.conf.json` 配置 `app.security.assetProtocol.enable = true` 與萬用 scope，允許安全存取本機多媒體資源。
  - 調整 CSP 支援 `asset: http://asset.localhost https://asset.localhost` 圖片與媒體來源。
  - 圖片與影音播放器新增 `onError` 容錯防護卡片，遇特殊編碼或無法播放時引導使用者一鍵以系統預設應用程式開啟。

## [0.1.4] - 2026-11-24

### Added
- **macOS 權限解除輔助腳本 (macOS Postinstall Helper)** (`scripts/macos-postinstall.sh`)：
  - 提供一鍵解除 macOS Gatekeeper 隔離屬性 (`xattr -cr`) 輔助腳本，解決未簽署應用程式安裝後無法直接執行的問題。
  - 支援預設 `/Applications/Rust File Manager.app` 與自訂目標路徑參數。
- **鍵盤游標移動導覽與連續選取 (Keyboard Arrow Navigation)** (`src/utils/keyboardNavigation.ts` & `src/components/FilePane.tsx`)：
  - 支援按鍵盤 `ArrowUp` 與 `ArrowDown` 於檔案清單中移動焦點游標，並自動捲動目標項目至可視區域。
  - 支援 `Shift + ArrowUp / ArrowDown` 保持錨點連續擴展或縮減選取範圍。
  - 支援網格檢視模式（Grid View）跨欄上下列跳轉與左右項移動。
  - 支援 `Home`、`End`、`PageUp`、`PageDown` 快速移動。
  - 輸入框（路徑列、搜尋過濾框、重新命名輸入）與對話視窗防誤觸隔離。
- **檔案與目錄詳細屬性視窗 (Properties / Details Dialog)** (`src/components/DetailsModal.tsx`)：
  - 右鍵選單全面新增「詳細資訊 (屬性)」項目，完全相容 Windows 檔案總管與標準系統檔案管理器操作習慣。
  - 支援單選檔案、單選資料夾、多選檔案/目錄群組，以及空白處（目前目錄）之詳細內容屬性檢視。
  - **一般屬性資訊**：完整展示檔名、類型描述（自動依副檔名解析）、所在目錄與完整路徑（提供一鍵複製）、捷徑目標路徑（Symlink Target）、格式化大小與精確位元組數。
  - **目錄與多項目遞迴大小統計**：非阻塞背景計算目錄與多選項目所包含之檔案總數、資料夾總數與整體位元組大小。
  - **時間戳記與屬性標籤**：完整呈現建立時間、修改時間與存取時間；清晰標示唯讀 (Read-only)、隱藏 (Hidden) 與符號連結狀態。
  - **完整性雜湊校驗分頁**：針對單一檔案提供 MD5、SHA-256、CRC32 雜湊碼一鍵計算與個別複製。
  - **標準快捷鍵與捷徑**：支援 Windows 標準快速鍵 `Alt+Enter` 開啟詳細資訊視窗、`Esc` 關閉視窗，底部提供「在檔案總管顯示」、「開啟終端機」與「以預設程式開啟」快捷工具列。

### Fixed
- **修復鍵盤上下方向鍵未移動選取項目而僅像滑鼠滾輪滾動容器的問題** (`src/components/FilePane.tsx`)：
  - 攔截瀏覽器容器預設捲動行為（`e.preventDefault()`），將方向鍵操作綁定至檔案清單游標移動與選取更新，確保方向鍵聚焦並跟隨檔案游標。
- **修復右鍵選單點擊詳細資訊無反應問題** (`src/App.tsx`)：
  - 修正右鍵功能表動作分派比對遺漏 UI 顯示文字（`詳細資訊 (屬性)`、`目前目錄詳細資訊`、`詳細資訊 (N 個項目)`），導致點擊後未能觸發彈窗的缺陷。
  - 後端 `get_item_detailed_info` 補強根目錄（如 `C:/`）與家目錄符號（`~`）之安全路徑解析與空檔名回退。

---

## [0.1.3] - 2026-11-22

### Added
- **打字自動跳轉 (Type-to-Select / Quick Jump)**：
  - 支援前綴鍵盤輸入即時跳轉並選取相符檔案，自動捲動至視窗中央。
  - 支援單字母重複輸入循環跳轉（例如連續按 `p` 切換不同項目）。
  - 右下角極簡半透明提示徽章，支援 1 秒自動淡出。
  - 支援 `Escape` 鍵、點擊提示徽章、點擊 `✕` 按鈕、點擊檔案列表或切換分頁多重途徑即時清除。
  - 輸入框防衝突機制（搜尋框、路徑列、重新命名輸入時自動停用）。
- **滑鼠框選多檔案 (Marquee / Rubber-band Selection)**：
  - 檔案清單空白處、欄位間隙或清單底部按住滑鼠左鍵拖曳拉出半透明藍色框選矩形。
  - 原生標準修飾鍵模式：一般拖曳（替換選取）、按住 `Ctrl` / `Cmd` 拖曳（反轉/追加選取）、按住 `Shift` 拖曳（聯集追加選取）。
  - $O(1)$ 高效幾何相交計算：結合 `@tanstack/react-virtual` 虛擬滾動的高度區間與幾何座標比對，萬筆檔案極速判定。
  - 邊界自動平滑捲動：游標接近頂部或底部邊界（$\le 30\text{px}$）時自動平滑向上/向下捲動。
- **Changelog 維護機制**：正式新增標準 `CHANGELOG.md` 紀錄歷代版本演進。

### Fixed
- **全域停用 WebView 預設網頁右鍵選單與熱鍵**：
  - 全面阻擋瀏覽器預設右鍵選單（重新整理、另存新檔、列印、檢查），僅保留自訂檔案與分頁功能表。
  - 攔截瀏覽器原生網頁快捷鍵（`Ctrl+P`、`Ctrl+S`、`Ctrl+R`），防止非預期行為干擾桌面操作體驗。
- **打字跳轉提示框狀態清理**：重構快取緩衝區至 `useRef`，解決 React 渲染週期導致計時器異常被終止而無法自動清除的問題。

---

## [0.1.2] - 2026-11-19

### Changed
- **統一設定檔匯出/匯入行為**：
  - 改用作業系統原生檔案對話框（另存新檔 / 開啟檔案），使用者可自由指定存檔目錄與檔案名稱。
  - 匯出成功後明確提示完整檔案存放路徑，提升操作透明度與體驗一致性。
  - 設定頁面簡化，保留設定檔路徑檢視與「在檔案總管開啟」捷徑。

---

## [0.1.1] - 2026-11-19

### Changed
- **介面用詞調整與設定體驗優化**：
  - 頂部導覽列「設定與快捷鍵」文字簡化為「設定」。
  - 傳輸佇列懸浮小視窗改善，完成所有傳輸任務後延遲 3 秒自動隱藏收合。

---

## [0.1.0] - 2026-11-18

### Added
- **極致效能檔案列表**：
  - Rust + Tauri 2.x 跨平台桌面架構。
  - 前端 `@tanstack/react-virtual` 虛擬滾動，支援十萬級檔案順暢捲動。
  - 後端 `rayon` 平行多執行緒解析目錄與屬性。
  - `lru` 記憶體快取 + `notify` 檔案系統即時監聽（0ms 快取命中）。
- **背景非同步傳輸佇列 (Queue)**：
  - 2MB 分塊串流讀寫，巨型檔案不阻塞主執行緒。
  - 傳輸進度即時回報、傳輸速率 (MB/s) 統計。
  - 同名檔案衝突比對與四種解決策略（覆寫、略過、自動重命名、每次詢問）。
  - 刪除安全防呆確認對話框（支援 `Enter` 確認、`Esc` 取消）。
- **多色彩可鎖定分頁與雙欄模式**：
  - 支援分頁色彩標籤、分頁鎖定防誤關 (`Ctrl+L`)。
  - 雙欄指揮官並排模式 (`F6`) 與跨面板拖放。
- **自訂字體與全域 UI 縮放**：
  - 支援自訂等寬字體與字級調整，同步作用於全域介面。
  - 即時防抖持久化儲存至 `settings.json`。
- **進階批次重新命名工具**：
  - 正則表示式搜尋取代、流水號編碼、動態時間與檔名變數、即時衝突檢查與一鍵復原 (Undo)。
- **安全防護與結構化日誌**：
  - Zip Slip 路徑穿越防護、保留設備名攔截。
  - `logs/rfm.jsonl` 單行 JSON Lines 格式日誌，支援輪替與損毀診斷。
