# Rust File Manager — 跨平台高效能檔案管理軟體 (Tauri 2.x + Rust + React)

使用 **Rust** 與 **Tauri 2.x** 搭配 **React 18 + TypeScript + Tailwind CSS** 打造的跨平台（Microsoft Windows、Linux、macOS）桌面檔案管理軟體。兼顧巨量檔案瀏覽效能、背景非同步傳輸佇列（Queue）、LRU 快取與檔案監控、多色彩可鎖定分頁、雙欄並排指揮官模式（Dual-Pane）以及進階批次重新命名工具。

---

## 核心功能與架構亮點

### 1. 極致效能：虛擬滾動、Rayon 平行掃描與 LRU 智慧快取 (`src-tauri/src/fs_ops.rs`)
- **後端多執行緒平行解析 (`rayon`)**：目錄讀取採用 Rust `rayon` 平行迭代器解析檔案 Metadata、隱藏屬性與類型分類，面對上萬個檔案的巨型目錄依然能在毫秒級完成。
- **LRU 記憶體快取 + 即時檔案監聽 (`lru` + `notify`)**：內建 `FsCacheState`（12 秒智慧 TTL 搭配 `notify::RecommendedWatcher` 檔案系統事件監聽），二次切換分頁或返回上層目錄達到 **0ms 快取命中 (`CACHE`)**，且當目錄內容發生異動時自動使快取失效。
- **前端虛擬滾動 (`@tanstack/react-virtual`)**：不論目錄下有 1,000 或 100,000 個檔案，DOM 永遠只渲染可視範圍內的列（Row），徹底杜絕傳統 WebView 檔案過多造成的捲動卡頓。

### 2. 背景非同步檔案傳輸佇列與刪除安全防呆 (`src-tauri/src/queue.rs`)
- **2MB 分塊串流讀寫 (Chunked Streaming)**：複製或跨磁碟搬移超大型檔案（如數十 GB 映像檔或影片）或成千上萬個零碎檔案時，一律交由背景 Worker 佇列以 `2 MB` 緩衝區分段串流處理，絕不阻塞 UI 主執行緒或撐爆記憶體。
- **檔案刪除安全防呆確認對話框 (`src/components/DeleteConfirmModal.tsx`)**：
  - 按下鍵盤 `Delete` 移至回收桶、`Shift+Delete` 永久刪除、點擊工具列刪除或右鍵選單刪除時，**預設彈出互動確認對話框**防範手滑誤刪檔案。
  - **詳細項目預覽**：單一項目顯示檔名、路徑、大小與修改時間；多選項目顯示清單與總容量估算。針對永久刪除提供高對比醒目警示標籤。
  - **極速鍵盤操作**：對話框支援原生桌面級快捷操作——按 **`Enter` 立即確認刪除**、按 **`Esc` 立即取消關閉**。
  - **偏好設定可隨時切換**：對話框底部與「設定 -> 檔案佇列與衝突策略」中皆提供「刪除檔案前先確認」開關，亦支援透過 `settings.json` 匯出與匯入。
- **佇列控制與即時速率回報（右下角可拖曳懸浮小視窗）**：透過 Tauri Event (`queue://updated`) 即時推送位元組進度、完成百分比與每秒傳輸速率（MB/s）。佇列視窗採用**右下角懸浮小視窗 (Floating Popover Widget)** 設計，完全不擠壓檔案列表高度，支援**自由拖曳位置**、**縮小為迷你膠囊 (Compact Pill)**，且在所有任務完成後 **延遲 3 秒自動隱藏收合**（若有錯誤則保留提醒，滑鼠移入時自動暫停倒數），亦可隨時從頂部工具列「佇列」按鈕點開檢視。
- **四種同名衝突策略（預設「每次詢問」）與明確統計徽章**：預設為 **「每次詢問 (`ask`)」**，當貼上或拖拉遇到同名檔案時會彈出衝突比對視窗（對比來源與目標的檔案大小與修改時間），讓您當場選擇「自動重新命名保留兩者 (`_1`, `_2`)」、「直接覆寫」或「略過同名檔案」（並可勾選記住選擇）。佇列卡片與完成通知會即時標示 **`已略過同名: N`**、**`已覆寫同名: N`** 或 **`已自動改名: N`**。
- **佇列歷史事件 (Queue Events) 自動保留與清理策略**：於「設定 -> 檔案佇列與衝突策略」中，可自由切換是否保留已完成任務紀錄；若啟用保留，可設定**保留天數上限（例如 `1 ~ 365 天`）**與**最大保留筆數上限（例如 `10 ~ 1000 筆`）**，由 Rust 後端自動淘汰過期或超額紀錄。

### 3. 多分頁管理：自訂顏色標籤與防誤關鎖定 (`src/components/TabBar.tsx`)
- **自訂分頁顏色**：支援右鍵為分頁設定專屬色彩標籤（海洋藍、翡翠綠、琥珀橘、珊瑚紅、極光紫、青色），方便區分不同工作目錄。
- **分頁鎖定保護 (Tab Lock)**：可透過分頁右鍵選單或快捷鍵 `Ctrl+L` 鎖定分頁；鎖定後的分頁會顯示鎖頭圖示，並隱藏關閉按鈕、攔截 `Ctrl+W` 與滑鼠中鍵關閉，避免重要工作目錄被誤關。
- **拖曳排序與跨分頁投遞**：支援直接拖曳調整分頁順序，或將檔案直接拖拉至上方任一分頁標籤完成搬移/複製。
- **分頁瀏覽歷史上限保護與一鍵清除**：各分頁之導航歷史（供「上一頁/下一頁」使用）內建 **50 筆上限保護**，超出時自動由最舊紀錄修剪淘汰（FIFO），杜絕設定檔無限膨脹。支援在分頁標籤按右鍵「清除此分頁歷史紀錄」，或於「設定 -> 設定檔匯出/匯入」中點選「清除所有分頁歷史紀錄」即時重置。

### 4. 字形與字體大小即時調整（含全域 UI 介面字體縮放） + 設定檔自動持久化與匯出/匯入 (`src/components/SettingsModal.tsx`)
- 支援切換系統字體、微軟正黑體、Inter、JetBrains Mono、Cascadia Code、Consolas，或直接輸入系統已安裝的任意自訂字型名稱，並**全域同步套用至檔案列表、側邊欄、分頁列、工具列、右鍵選單與所有設定視窗**。
- 支援獨立調整 **「檔案列表字體大小 (`11px ~ 24px`)」**、**「全域 UI 介面字體大小 (`11px ~ 22px`)」** 以及 **「虛擬列表列高 (`26px ~ 58px`)」**（頂部工具列 `A-` / `A+` 按鈕可同步縮放檔案列表與 UI 字體）。
- **跨平台設定檔即時自動存檔與匯出/匯入 (`.json`)**：
  - **設定變更即時防抖自動儲存至磁碟**：使用者在 UI 或設定視窗中所進行的任何設定異動（字型大小、自訂快捷鍵、書籤捷徑、已鎖定與設色分頁、雙欄狀態、刪除確認、佇列衝突策略與日誌等級等），系統皆會即時透過防抖 (Debounce) 機制自動寫入磁碟上的 `settings.json`，並在視窗關閉前立即 Flush，徹底解決「僅在記憶體生效但未寫入檔案」的問題，重新啟動或隨身攜帶設定完全不遺失。
  - **Portable 與安裝版雙模智慧感知支援**：若執行檔所在目錄具備寫入權限（如隨身碟或免安裝目錄），設定檔（`settings.json`）與日誌目錄（`logs/`）優先存於執行檔同層，實現真正的綠色免安裝與零設定搬移；若安裝於系統唯讀目錄（如 `C:\Program Files`），自動無縫導向至使用者標準目錄（Windows: `%LOCALAPPDATA%\rust-file-manager\settings.json`），兼顧系統安全性與書籤/設定持久化。同時相容自訂路徑與既有 `rfm-settings.json`。
  - **原生系統視窗對話框統一匯出/匯入**：於「設定 -> **設定檔匯出/匯入**」分頁中，提供目前設定檔完整路徑檢視（支援一鍵在檔案總管開啟），並統一採用作業系統原生檔案對話框（「另存新檔」與「開啟檔案」）進行「匯出設定檔」與「匯入設定檔」，使用者可自由選擇檔案存放位置與檔名，完成後明確顯示完整存檔路徑，操作體驗一致且透明。
  - **一鍵恢復所有出廠預設值**：設定視窗左下角提供「將所有設定恢復預設值」按鈕（附二次確認防呆），重設後亦會自動同步寫入磁碟設定檔。

### 5. 智慧感知右鍵功能表 (`src/components/ContextMenu.tsx`)
- **全域遮蔽瀏覽器原生網頁選單與非預期熱鍵**：全面停用 WebView 原生預設右鍵選單（如重新整理、另存新檔、列印、檢查等非必要網頁操作）與網頁熱鍵（`Ctrl+P`、`Ctrl+S`、`Ctrl+R`），徹底避免瀏覽器網頁功能破壞桌面應用操作體驗，僅在檔案列表、目錄空白處與分頁標籤上顯示專屬自訂右鍵選單。
針對不同右鍵點擊對象動態呈現專屬操作：
- **針對目錄**：進入目錄、在新分頁中開啟、在另一側面板開啟 (Dual-Pane)、加入側邊欄書籤捷徑、在此目錄開啟系統終端機 (`pwsh` / `wt` / `Terminal`)、壓縮為 `.zip`、**檢視詳細資訊 (內容屬性)**。
- **針對壓縮檔 (`.zip`, `.tar`, `.gz`, `.7z`)**：一鍵「解壓縮至此處（自動建立同名資料夾）」、**檢視詳細資訊 (內容屬性)**。
- **針對一般檔案與執行檔**：使用系統預設程式開啟、計算檔案校驗雜湊值（**MD5 / SHA-256 / CRC32**）、複製完整路徑、在原生系統檔案總管中顯示、**檢視詳細資訊 (內容屬性)**。
- **針對多選項目**：批次複製/剪下/刪除/壓縮、**多選項目詳細資訊總覽**（即時遞迴計算總容量、檔案與資料夾數）。
- **針對目錄空白處**：新增資料夾、新增空白文字檔、貼上佇列項目、開啟終端機、強制重新整理快取、**目前目錄詳細資訊**。

### 6. 檔案與目錄詳細屬性視窗 (Properties / Details Dialog) (`src/components/DetailsModal.tsx`)
- **相容標準系統檔案總管習慣**：在任意檔案、目錄、多選項目或空白處按右鍵點選「詳細資訊 (屬性)」，或直接按下快捷鍵 **`Alt+Enter`**，即時開啟專屬屬性對話視窗。
- **完整屬性展示**：包含檔案類型說明（如 `Rust 原始程式碼 (.rs)`、`PNG 影像檔 (.PNG)`、`資料夾 (Folder)`）、所在目錄與完整路徑（提供一鍵複製按鈕）、符號連結/捷徑指向目標 (Symlink Target)、格式化大小與精確位元組數。
- **目錄與多選項目背景遞迴大小統計**：採用非阻塞安全走訪，自動計算目錄內部所包含的檔案總數、子目錄總數與累積總大小，附帶動態計算中指示。
- **時間戳記與檔案屬性**：展示建立時間、修改時間、存取時間，並清楚標示唯讀 (Read-only)、隱藏 (Hidden) 與捷徑狀態。
- **檔案雜湊校驗碼分頁 (Checksums)**：針對單一檔案提供一鍵計算 **MD5**、**SHA-256**、**CRC32** 完整性校驗碼，並支援獨立一鍵複製與耗時統計。
- **底部快捷工具列**：視窗底部內建「在檔案總管顯示」、「開啟終端機」與「以預設程式開啟」等原生捷徑按鈕。

### 7. 微核心外掛架構 (Plugin Architecture) 與豐富內容預覽面板 (`plugins/`, `src/plugins/` & `src/components/PreviewPanel.tsx`)
- **微核心宿主與模組化獨立外掛體系 (Micro-Kernel Plugin Architecture)**：
  - **集中維護，產物獨立**：所有外掛源碼集中於 `plugins/` 目錄（Monorepo 管理，免除一個外掛一個 repo 的繁瑣維護負擔），但建置時產物徹底獨立，使用者亦可單獨下載或安裝特定外掛。
  - **各外掛標準清單宣告 (`plugin.json`)**：定義外掛識別碼 (`id`)、名稱、版本、支援副檔名清單 (`extensions`)、類別與進入點。
  - **全域宿主 SDK (`window.RFM` & `src/plugins/hostSdk.ts`)**：提供共用之 React、ReactDOM、Tauri API 與格式化函式，徹底根絕外掛自行打包 React 引發的雙重實例與 Hooks 崩潰問題。
  - **動態熱插拔安裝與載入器 (`src/plugins/loader.ts`)**：
    - 啟動時自動掃描 Portable 目錄或 AppData 目錄下的 `plugins/`，動態註冊外部外掛。
    - 於「設定 -> 外掛功能管理」中內建「**安裝外掛 (.rfmp)**」按鈕，支援系統檔案對話框選取外掛包，後端自動經由 Zip Slip 安全防護解壓並即時熱載入生效，**完全無需重啟軟體**。
    - 外部外掛卡片附帶「**解除安裝**」功能與「**開啟外掛目錄**」捷徑。
- **五大豐富預覽外掛**：
  - **PDF 文件預覽器 (`rfm.preview.pdf`) [全新獨立外掛]**：
    - 支援 PDF 文件即時檢視、高畫質向量渲染。
    - 控制列內建 **縮小 / 放大**、**Fit 自適應尺寸**、**順時針 90° 旋轉**、**複製路徑**與**一鍵以系統預設 PDF 閱讀器開啟**。
    - 內建容錯提示防護卡片，防範受保護或損壞之 PDF 檔案。
  - **圖片與向量圖預覽器 (`rfm.preview.image`)**：支援 PNG, JPG, JPEG, WebP, GIF, SVG, BMP, ICO 等縮圖預覽、自適應 Fit / 原始尺寸縮放、即時解析度（寬×高 px）與檔案大小顯示。
  - **音訊與影片原生播放器 (`rfm.preview.media`)**：支援 MP3, WAV, OGG, FLAC, MP4, WebM 等原生多媒體播放器、播放/暫停、時間進度條與音量調節。
  - **Markdown 格式化排版外掛 (`rfm.preview.markdown`)**：支援 Markdown 即時結構排版（標題、粗斜體、引用、清單、GFM 規範表格）、原始碼 (Raw) 與排版視圖一鍵切換、全文一鍵複製。
  - **原始碼與文字高亮預覽器 (`builtin.code`)**：核心輕量通用備援外掛，支援常見程式語言（Rust, TS, JS, Python, JSON, CSS, Shell 等）行號對齊顯示、關鍵字語法上色與全文一鍵複製。
- **一鍵批次外掛打包工具 (`scripts/build-plugins.ps1` & `scripts/build-plugins.sh`)**：
  - 執行 `npm run package:plugins`，一鍵掃描 `plugins/` 下各外掛並打包為標準 `.rfmp`（相容 zip）發行套件包至 `release-artifacts/plugins/`。
- **預設 5 MB 預覽上限與自訂設定 (Default 5MB Preview Limit & User Configurable)**：
  - 後端 `read_file_preview` 與多媒體預覽預設上限全面調升為 **5 MB**（相容普遍多媒體與豐富格式檔案）。
  - **設定視窗自主配置**：於「設定 -> 外掛功能管理」中提供快捷預設按鈕（1 MB、2 MB、5 MB 預設、10 MB、20 MB、50 MB、100 MB），使用者可依硬體效能彈性配置，並持久化寫入 `settings.json`。
  - **超額保護防禦**：當檔案大小超出設定之上限時，預覽面板呈現清晰防護提示與容量警示，並提供「強制載入預覽」與「以預設程式開啟」按鈕，防範非預期的超大檔案撐爆記憶體。
- **大檔案分段動態載入 (Dynamic Paging & Load More)**：
  - 文字與原始碼支援分段讀取，超出單次預覽範圍時底部提供「載入後續內容 (Load More)」按鈕，動態串接後續內容。
- **滑鼠拖曳自訂寬度 (Resizable Splitter)**：
  - 預覽面板左邊緣內建拖曳手把，可即時拖曳調整寬度（`260px ~ 800px`），並自動持久化儲存至 `settings.json`。
- **多選項目統計總覽 (Multi-selection Summary)**：
  - 選取多個檔案時，預覽面板自動切換為多選統計視圖（項目總數、累計容量、檔案/資料夾數與各類型分佈徽章）。
  - 內建「開啟進階批次重新命名」、「複製所有項目完整路徑」與「複製所有項目檔案名稱」快捷動作。

### 8. 自定義鍵盤快速鍵（預設相容 MS Windows 習慣）
內建按鍵錄製器，可自由修改所有快捷鍵並隨時一鍵還原預設值：

| 功能動作 | 預設快捷鍵 (Windows 標準) | 說明 |
| :--- | :--- | :--- |
| **重新命名** | `F2` | 單選時觸發原地改名（按第 1 次**全選主檔名**、再按第 2 次**全選副檔名**、第 3 次**全選完整檔名**循環切換）；多選時自動開啟批次重新命名視窗 |
| **進階批次重新命名** | `Ctrl+Shift+R` | 開啟 Regex / 流水號 / 日期變數批次改名工具 |
| **複製 / 剪下 / 貼上** | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | 系統級剪貼簿雙向互通：支援與外部系統檔案總管相互複製、剪下與貼上（自動進入背景非同步傳輸佇列與衝突詢問） |
| **移至資源回收桶** | `Delete` | 安全移至作業系統資源回收桶 (Trash)（預設彈出確認視窗，支援 Enter 確認、Esc 取消） |
| **永久刪除** | `Shift+Delete` | 略過資源回收桶直接永久刪除（彈出危險警告確認視窗） |
| **檢視詳細資訊 (內容屬性)** | `Alt+Enter` | 開啟所選檔案/目錄或目前目錄的詳細資訊與內容屬性對話視窗 (Properties) |
| **新增 / 關閉 / 鎖定分頁** | `Ctrl+T` / `Ctrl+W` / `Ctrl+L` | 分頁生命週期管理與防關閉鎖定 |
| **新增資料夾** | `Ctrl+Shift+N` | 在目前目錄快速建立新資料夾 |
| **開啟 / 關閉傳輸佇列懸浮視窗** | `Ctrl+Q` | 快速顯示或收合右下角背景檔案傳輸佇列懸浮視窗 |
| **重新整理 (強制刷新快取)** | `F5` | 強制清除目前目錄 LRU 快取並重新掃描 |
| **切換單欄 / 雙欄並排** | `F6` | 切換左右雙欄指揮官檢視模式 (Dual-Pane) |
| **顯示 / 隱藏系統隱藏檔** | `Ctrl+H` | 切換是否顯示 `.` 開頭或具隱藏屬性之檔案 |
| **快速過濾搜尋** | `Ctrl+F` | 聚焦至頂部即時檔名過濾框 |
| **返回上一層目錄** | `Backspace` | 導覽至父目錄 |
| **在目前目錄開啟終端機** | `` Ctrl+` `` | 啟動 PowerShell 7 / Windows Terminal / macOS & Linux Terminal |

### 9. 高效操作性：鍵盤游標移動導覽 (Keyboard Navigation)、打字自動跳轉 (Type-to-Select) 與滑鼠框選多檔案 (Marquee Selection) (`src/components/FilePane.tsx`)
- **鍵盤游標移動導航 (Keyboard Arrow Navigation)** (`src/utils/keyboardNavigation.ts` & `src/components/FilePane.tsx`)：
  - **上下方向鍵移動游標**：按 `ArrowUp` 與 `ArrowDown` 正確移動檔案焦點與選取游標，徹底攔截瀏覽器原生網頁滾動預設行為（不再像滑鼠滾輪般單純滾動畫面）。
  - **視窗自動捲動至焦點**：游標移動時若接近或超出可視畫面，自動透過 `@tanstack/react-virtual` 將目標檔案捲入可視區內。
  - **Shift 連續範圍選取**：按住 `Shift + ArrowUp / ArrowDown` 保持錨點並連續擴展或縮減選取範圍。
  - **網格檢視多欄自適應**：在網格檢視 (Grid View) 模式下，自動依螢幕排版寬度動態計算欄數，按上下鍵依整列跨欄跳轉、按左右鍵移動相鄰項目。
  - **首尾與換頁鍵支援**：支援 `Home`（移至首項）、`End`（移至尾項）、`PageUp` / `PageDown`（依畫面高度快速換頁）。
  - **輸入框與彈跳視窗防誤觸**：當使用者處於搜尋框、路徑列、重新命名輸入框或 Modal 對話框時自動停用，確保輸入行為不受干擾。
- **打字自動跳轉檔案 (Type-to-Select / Quick Jump)**：
  - **前綴即時匹配**：在檔案列表任意處直接鍵入字母（例如連續輸入 `doc` 或 `proj`），焦點與選取游標即時跳轉至開頭相符的檔案，並自動捲動至可視範圍中央。
  - **單字母重複循環跳轉**：連續重複按下同一個字母（例如連續按 `p`、`p`、`p`），將在所有以該字母開頭的項目間依序循環切換。
  - **800ms 智慧緩衝與浮動提示**：按鍵輸入具備 800ms 緩衝逾時自動重設，並於面板右下角顯示極簡半透明徽章（如 `跳至: doc`），停止輸入後自動淡出。
  - **輸入框防衝突隔離**：當聚焦於搜尋框、路徑列、重新命名輸入框或對話框時自動停用，嚴防誤觸。
- **滑鼠框選 / 圈選多檔案 (Marquee / Rubber-band Selection)**：
  - **空白處直接起拖**：於檔案列表空白處、列與列間隔或清單底端按住滑鼠左鍵拖曳即可拉出藍色半透明選取矩形；點擊檔案圖示或檔名本體拖曳則維持為檔案搬移/複製 (DND)。
  - **原生標準組合鍵行為**：
    - **一般拖曳**：取代選取，僅選取與框選矩形相交的檔案。
    - **按住 `Ctrl` / `Cmd` 拖曳**：對框選到的項目進行反轉/追加選取（Toggle）。
    - **按住 `Shift` 拖曳**：聯集追加選取（保留既有選取項目並擴充）。
  - **O(1) 高效幾何相交計算**：結合 `@tanstack/react-virtual` 虛擬滾動的高度區間與幾何座標比對，無論數百或數萬個檔案皆極速判定。
  - **邊界自動平滑捲動**：當框選游標拖曳接近面板頂部或底部邊界（$\le 30\text{px}$）時，清單自動平滑向上/向下捲動，支援跨畫面大範圍框選。

### 10. 雙向作業系統級拖拉功能 (System Native Drag & Drop)
- **內部與跨面板拖曳**：支援將單一或多個選取項目直接拖拉至：
  1. 同一列表中的**子資料夾**
  2. 雙欄並排模式下的**另一側面板**
  3. 頂部**分頁標籤**或**麵包屑路徑節點**
  4. 左側邊欄的**書籤捷徑**或**磁碟掛載點**
- **外部檔案拖入 (Drag In，跨 Windows / Linux / macOS)**：
  - 支援直接從 Windows 檔案總管、macOS Finder、Linux 桌面或其它軟體中將實體檔案直接拖入應用程式。
  - 游標停留在特定資料夾列、分頁標籤、書籤或磁碟區放開，將精準投遞至該目標目錄並進入非同步背景傳輸佇列（支援同名衝突檢查）。
- **原生檔案拖出至外部程式 (Drag Out，如撥放器、瀏覽器、修圖軟體)**：
  - 整合作業系統底層拖曳協定（Windows OLE `CF_HDROP` / macOS Cocoa `NSDraggingSession` / Linux GTK）。
  - 使用者可直接從檔案清單中將**音樂檔案拖曳至外部撥放器（如 VLC、PotPlayer、Spotify）、將圖片拖入修圖軟體或瀏覽器**，外部程式即時接收並開啟檔案。
- 拖拉放開時若按住 `Ctrl` 鍵會自動轉為「複製佇列」，未按則預設為「搬移佇列」。

### 11. 進階批次檔案重新命名工具 (`src-tauri/src/batch_rename.rs`)
- **尋找與取代**：支援一般字串與正規表示式（Regex 擷取群組 `$1`, `$2`）及大小寫區分設定。
- **動態變數支援**：支援在取代欄、前綴或後綴插入 `{date}`（當日 `YYYYMMDD`）、`{name}`（原主檔名）、`{ext}`（原副檔名）。
- **大小寫與副檔名轉換**：一鍵轉全小寫 (`lowercase`)、全大寫 (`UPPERCASE`)、首字大寫 (`Title Case`) 或統一覆寫副檔名。
- **自動流水號編碼**：可自訂起始數字、遞增步長、補零位數（如 `001`, `002`）與插入位置（開頭、末端或完全取代主檔名）。
- **即時預覽、衝突檢查與兩階段原子更名 + 一鍵復原 (Undo)**：執行前即時標示同名衝突；執行時採用兩階段暫存更名避免連號檔案互撞，並在完成後於頂部工具列提供「復原批次改名」按鈕。

### 12. 完整儲存裝置支援與磁碟代號排序 (`src-tauri/src/fs_ops.rs` & `src/components/Sidebar.tsx`)
- **支援 RAMDisk / ImDisk / Google Drive 雲端硬碟 / 網路磁碟機**：除了標準實體磁碟外，Windows 後端結合 Win32 API (`GetLogicalDrives`、`GetVolumeInformationW`、`GetDiskFreeSpaceExW`) 自動補齊所有邏輯掛載磁碟（如 ImDisk RAMDisk `R:`、Google 雲端硬碟 `G:` 與網路磁碟）。
- **依磁碟代號字母嚴格排序**：側邊欄儲存空間統一採用 `代號: (磁碟標籤)` 格式（如 `C: (本機磁碟)`、`D: (D)`、`G: (Google Drive)`、`R: (RamDisk)`），並依磁碟字母由小到大整齊排列。

### 13. 資訊安全防護設計 (Security Architecture)
- **嚴格內容安全政策 (Strict CSP)**：於 `src-tauri/tauri.conf.json` 啟用 `default-src 'self'; script-src 'self'` 等白名單限制，防止 WebView 載入或執行任何外部未知腳本。
- **壓縮檔解壓縮 Zip Slip 路徑穿越防護 (`src-tauri/src/system_ops.rs`)**：解壓縮前先透過 `validate_archive_entries_list` 預檢壓縮檔內部清單，一旦發現包含 `../`、`..\`、絕對路徑（`/`、`C:\`）即自動攔截並拒絕解壓縮。
- **檔名安全驗證與保留設備名攔截 (`validate_safe_entry_name`)**：於建立檔案/目錄、原地改名與批次重新命名中，統一攔截路徑跳脫字元（`..`、`/`、`\`、`:`、`\0`）與系統保留設備名（`CON`、`PRN`、`AUX`、`NUL`、`COM1~9`、`LPT1~9`）。
- **防止目錄遞迴自我複製/搬移炸彈 (`src-tauri/src/queue.rs`)**：佇列執行前強制檢查目標路徑是否為來源目錄之子孫目錄，並於取消任務時自動清除未寫完的殘留檔案。
- **子行程陣列傳參防範命令注入 (Command Injection Prevention)**：所有外部行程呼叫（`wt`、`pwsh`、`explorer`、`tar`）一律透過 `Command::new().args([...])` 陣列傳遞，不經過 Shell 字串拼接。
- **設定檔讀寫副檔名與容量保護 (`src-tauri/src/lib.rs`)**：強制限制設定檔讀寫路徑必須為 `.json` 副檔名且不超過 `5 MB`，並於預覽面板預設限制讀取前 `5 MB`（可自訂調高），防止任意系統檔案覆寫或大檔記憶體耗盡 (OOM)。

### 14. 結構化 JSON 日誌與設定檔損毀診斷 (`src-tauri/src/logger.rs`)
- **同層日誌目錄與 JSON Lines (`.jsonl`) 現代化格式**：日誌目錄 `logs/` 預設直接建立於執行檔同層，以單行 JSON (`timestamp`, `level`, `target`, `event`, `message`, `context`, `pid`, `os`) 寫入 `logs/rfm.jsonl`（單檔上限 5 MB 自動輪替 Rotation），方便直接對接 `jq`、Grafana Loki、ELK 或 Datadog 進行收集與查詢，亦支援切換為 Plain Text 格式。
- **預設 ERROR 日誌門檻等級 (Zero Noise)**：記錄門檻預設為 **`ERROR`**（僅記錄錯誤與 Panic，初次啟動與一般運作不產生多餘雜訊），使用者可隨時於設定中自由切換為 `DEBUG`、`INFO`、`WARN` 或 `ERROR`。
- **全域 Panic Hook 與前端未捕獲錯誤攔截**：自動註冊 Rust `std::panic::set_hook` 以及前端 `window.onerror` / `unhandledrejection` 監聽器，任何異常皆會連同行號寫入日誌檔。
- **設定檔語法損毀自動備份與欄位診斷**：當載入的設定檔 JSON 語法錯誤時，日誌會精準記錄錯誤之 `line` 與 `column` 並自動將損毀檔案備份為 `.json.corrupted.bak`；若設定欄位值超出範圍則自動記錄 `WARN` 診斷訊息。
- **內建 UI 日誌檢視器**：於「設定 -> 系統診斷日誌 (JSON Logs)」分頁中，支援依等級（`ALL` / `INFO` / `WARN` / `ERROR` / `PANIC`）即時過濾檢視、切換記錄門檻、一鍵在檔案總管開啟日誌檔或清空日誌。

---

## 專案目錄結構

```text
rust_file_manager/
├── .github/workflows/
│   ├── ci.yml                    # Pull Request 自動化前端建置與 Rust 單元測試 CI 門檻
│   └── release.yml               # GitHub Actions 三平台 (Win/Linux/macOS) 自動打包與發布流水線
├── .githooks/
│   └── pre-push                  # 本地主幹保護 Hook (禁止直推 main，強制走 PR + CI 流程)
├── scripts/                      # 跨平台開發環境安裝與 Release 打包腳本
│   ├── build-release.ps1         # PowerShell 單一執行檔 (Portable) 與安裝包打包腳本
│   ├── build-release.sh          # Bash 單一執行檔與安裝包打包腳本
│   ├── macos-postinstall.sh      # macOS 安裝後解除 Gatekeeper 隔離屬性腳本
│   ├── setup-dev-env.ps1         # PowerShell 7+ 定版開發環境安裝腳本 (Windows / Linux / macOS)
│   └── setup-dev-env.sh          # Bash / Zsh 定版開發環境安裝腳本 (Linux / macOS / Windows Git Bash)
├── src/                          # React 18 + TypeScript 前端原始碼
│   ├── components/
│   │   ├── BatchRenameModal.tsx  # 進階批次重新命名工具 (Regex/流水號/即時預覽)
│   │   ├── ConflictDialogModal.tsx # 檔案覆寫/改名/略過衝突互動詢問對話框
│   │   ├── ContextMenu.tsx       # 智慧感知右鍵選單 (目錄/壓縮檔/一般檔/空白處)
│   │   ├── DeleteConfirmModal.tsx # 檔案刪除/回收桶安全防呆確認對話框
│   │   ├── FileEntryIcon.tsx     # 檔案類型彩色圖示組件
│   │   ├── FilePane.tsx          # 虛擬滾動檔案面板 (@tanstack/react-virtual + 拖拉)
│   │   ├── PreviewPanel.tsx      # 可拖曳寬度預覽面板 (多選統計/微核心外掛調度/雜湊校驗)
│   │   ├── QueueDrawer.tsx       # 底部背景非同步傳輸佇列進度抽屜
│   │   ├── SettingsModal.tsx     # 字體大小、自訂快捷鍵與外掛功能管理面板
│   │   ├── Sidebar.tsx           # 跨平台磁碟空間、系統捷徑與書籤側邊欄
│   │   └── TabBar.tsx            # 多色彩、可鎖定防關閉之分頁列
│   ├── plugins/                  # 微核心外掛系統 (Micro-Kernel Plugin System)
│   │   ├── builtin/              # 官方內建預覽外掛
│   │   │   ├── ImagePreviewPlugin.tsx    # 圖片/SVG 縮放與解析度檢視
│   │   │   ├── MediaPreviewPlugin.tsx    # 音訊/影片原生播放控制
│   │   │   ├── MarkdownPreviewPlugin.tsx # Markdown 結構排版/Raw 切換
│   │   │   └── CodePreviewPlugin.tsx     # 程式碼行號、關鍵字高亮與複製
│   │   ├── registry.ts           # 插件註冊表與動態匹配調度中心
│   │   └── types.ts              # 外掛介面標準規範 (PreviewPlugin)
│   ├── store/
│   │   └── useAppStore.ts        # Zustand 狀態管理與 localStorage 持久化
│   ├── utils/
│   │   └── formatters.ts         # 容量、時間與鍵盤組合鍵格式化工具
│   ├── api.ts                    # Tauri IPC invoke 封裝層
│   ├── types.ts                  # 前後端共用資料型別定義
│   └── App.tsx                   # 主視窗與雙欄/單欄佈局、全域快捷鍵調度
├── src-tauri/                    # Rust Tauri 2.x 原生後端
│   ├── src/
│   │   ├── batch_rename.rs       # 批次改名引擎、衝突偵測、兩階段更名與單元測試
│   │   ├── fs_ops.rs             # Rayon 平行目錄掃描、LRU 快取與 Notify 檔案監聽
│   │   ├── logger.rs             # JSON Lines 結構化日誌、Panic Hook、Rotation 與設定檔診斷
│   │   ├── models.rs             # 跨平台路徑正規化與序列化資料結構
│   │   ├── queue.rs              # 2MB Chunked 非同步檔案複製/搬移/回收桶佇列
│   │   ├── system_ops.rs         # MD5/SHA256/CRC32 計算、跨平台終端機與壓縮解壓縮
│   │   ├── lib.rs                # Tauri Commands 註冊入口
│   │   └── main.rs               # 桌面應用程式啟動點
│   ├── capabilities/default.json # Tauri 2.x 權限設定
│   ├── Cargo.toml                # Rust 依賴設定
│   └── tauri.conf.json           # Tauri 2.x 視窗與打包設定
└── package.json
```

---

## 開發環境自動化定版安裝與建置指令 (Windows / Linux / macOS)

本專案於 `scripts/` 目錄下提供支援三大作業系統（Microsoft Windows、Linux、macOS）的 **PowerShell (`setup-dev-env.ps1`)** 與 **Bash (`setup-dev-env.sh`)** 自動化環境安裝腳本。所有核心工具鏈版本均設為可覆寫變數並預設鎖定於官方發行的穩定版本：

| 工具鏈項目 | 變數名稱 (Bash / PowerShell) | 預設定版版本 (Official Stable) |
| :--- | :--- | :--- |
| **Rust 工具鏈 (`rustup` / `rustc`)** | `RUST_VERSION` / `-RustVersion` | `1.100.0` |
| **Node.js LTS 執行環境** | `NODE_VERSION` / `-NodeVersion` | `26.13.1` |
| **Fast Node Manager (`fnm`)** | `FNM_VERSION` / `-FnmVersion` | `1.39.0` |
| **Tauri 2.x CLI (`@tauri-apps/cli`)** | `TAURI_CLI_VERSION` / `-TauriCliVersion` | `2.2.0` |

> **工具鏈預設安裝位置（Windows）**：
> - `rustc` / `cargo` / `fnm` 執行檔：`~/.cargo/bin` (`C:/Users/<User>/.cargo/bin`)
> - `rustup` 工具鏈本體：`~/.rustup`
> - `fnm` Node.js 版本與全域模組：`$env:APPDATA/fnm/aliases/default`（且 `setup-dev-env.ps1` 會自動寫入 Windows User PATH 與 PowerShell `$PROFILE`）

### 0. 一鍵自動化安裝開發環境

#### PowerShell 7 (`pwsh` — Windows / Linux / macOS 通用)
```powershell
# 使用預設官方穩定版本一鍵安裝系統依賴、Rust、fnm、Node.js 與 npm 套件
./scripts/setup-dev-env.ps1

# 僅檢查目前系統環境與版本 (不進行安裝)
./scripts/setup-dev-env.ps1 -CheckOnly

# 自訂指定目標版本進行安裝
./scripts/setup-dev-env.ps1 -RustVersion "1.100.0" -NodeVersion "26.13.1" -FnmVersion "1.39.0"
```

#### Bash / Zsh (Linux `apt`/`dnf`/`pacman`、macOS `xcode-select`、Windows Git Bash)
```bash
# 使用預設官方穩定版本一鍵安裝 (Linux 會自動安裝 webkit2gtk-4.1 等 Tauri 2.x 系統依賴)
./scripts/setup-dev-env.sh

# 僅檢查目前系統環境與版本
./scripts/setup-dev-env.sh --check-only

# 透過環境變數覆寫定版版本號
RUST_VERSION="1.100.0" NODE_VERSION="26.13.1" FNM_VERSION="1.39.0" ./scripts/setup-dev-env.sh
```

### 1. 手動安裝前端依賴
```powershell
npm install
```

### 2. 啟動開發模式 (Hot-Reload 預覽視窗)
```powershell
npm run tauri dev
```

### 3. 執行後端單元測試與前端建置檢查
```powershell
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

### 4. 打包跨平台單一執行檔 (Portable) 與原生安裝包 (Installer)

Tauri 2.x 會將前端所有靜態資源（HTML / CSS / JS）直接嵌入編譯進 Rust 二進位執行檔中，並已於 `src-tauri/Cargo.toml` 啟用 `LTO`、`strip` 與體積最佳化（單一執行檔僅約 **4 ~ 8 MB**）。

#### 支援產出的格式一覽
| 目標作業系統 | 免安裝單一執行檔 (Portable) | 系統原生安裝包 (Installer) |
| :--- | :--- | :--- |
| **Microsoft Windows** | `rust-file-manager-portable-windows-x64.exe` (單一 `.exe` 直接雙擊執行) | Windows Installer `*.msi` (支援自訂安裝路徑問答與完成資訊摘要) |
| **Linux** | `rust-file-manager-portable-linux-x86_64` / `*.AppImage` (單一檔案免安裝) | Debian/Ubuntu `*.deb`、Fedora/RHEL `*.rpm`、`*.AppImage` |
| **macOS** | `Rust File Manager.app` | Apple Disk Image `*.dmg` (支援 Intel `x64` 與 Apple Silicon `arm64`) |

#### 本地一鍵打包與部署至工具目錄 (`$env:RFM_HOME\rfm.exe`)

專案提供 `build-local.ps1` 與 `build-local.sh`，可一鍵編譯免安裝版主體執行檔、打包所有獨立外掛，並自動同步部署至本機工具目錄（優先讀取 `$env:RFM_HOME`，若未配置則預設為 `$HOME\RFM`）。目標目錄保持極簡，僅輸出單一可執行檔 `rfm.exe`（Linux/macOS 為 `rfm`）與 `plugins/` 目錄：

**PowerShell (`pwsh`)**：
```powershell
# 自動判定 $env:RFM_HOME (預設 $HOME\RFM) 進行打包並輸出 rfm.exe 與 plugins/
./scripts/build-local.ps1
# 或使用 npm 指令: npm run build:local

# 自訂目標部署目錄 (例如輸出至 D:\TOOLS\RFM\rfm.exe)
./scripts/build-local.ps1 -Destination "D:\TOOLS\RFM"

# 僅重新打包並部署外掛（略過主體編譯，極速調試外掛）
./scripts/build-local.ps1 -SkipBuild
```

**Bash / Zsh (`bash`)**：
```bash
# 自動判定 $RFM_HOME (預設 $HOME/RFM) 進行打包部署 (輸出 rfm 與 plugins/)
./scripts/build-local.sh
# 或自訂目標目錄: ./scripts/build-local.sh /opt/RFM
```

#### 使用自動化發布打包腳本（自動匯出至 `release-artifacts/` 並產生 `SHA256SUMS.txt`）

> **智慧依賴與磁碟防呆檢測**：打包腳本（`build-release.ps1` 與 `build-release.sh`）具備智慧檢核機制：
> - **依賴防呆**：若檢測到尚未安裝 `node_modules` 或本機 `@tauri-apps/cli`，將自動觸發 `npm install` 補齊依賴後再進行打包。
> - **磁碟空間守門 (Pre-flight Check)**：Release 發行版編譯與 LTO 連結需要大量暫存空間，編譯前自動檢查目標磁區可用空間（低於 2 GB 即刻阻斷防寫入失敗，低於 5 GB 發出黃字警告）；若不幸因磁碟耗盡中斷亦會自動印出友善清理建議與 `CARGO_TARGET_DIR` 重定向指引。

**PowerShell (`pwsh`)**：
```powershell
# 1. 僅快速編譯「免安裝單一執行檔 (Portable .exe)」（不打包安裝程式，速度最快）
./scripts/build-release.ps1 -PortableOnly
# 或使用 npm 指令: npm run package:portable

# 2. 完整編譯系統原生安裝包 (Windows 下預設打包單一 MSI 安裝套件)
./scripts/build-release.ps1
# 或使用 npm 指令: npm run package:all

# 3. 僅打包指定格式的安裝包 (例如明確指定 Windows MSI 安裝包)
./scripts/build-release.ps1 -Target msi
# 或使用 npm 指令: npm run package:msi

# 4. 打包系統安裝包同時額外匯出免安裝單一執行檔
./scripts/build-release.ps1 -IncludePortable
```

**Bash / Zsh (`bash`)**：
```bash
# 1. 僅快速編譯免安裝單一執行檔
./scripts/build-release.sh --portable-only

# 2. 完整編譯當前系統原生安裝包 (Linux: .deb / .rpm / .AppImage; macOS: .dmg)
./scripts/build-release.sh

# 3. 打包系統安裝包同時額外匯出免安裝單一執行檔
./scripts/build-release.sh --include-portable
```

#### macOS 安裝後解除 Gatekeeper 隔離屬性
在 macOS 下載 `.dmg` 或安裝 `Rust File Manager.app` 後，若出現「無法打開，因為無法驗證開發者」或「已損毀」提示，可執行專屬輔助腳本一鍵清除隔離旗標：
```bash
chmod +x ./scripts/macos-postinstall.sh
./scripts/macos-postinstall.sh
# 若應用程式非安裝在預設 /Applications 目錄，可傳入路徑參數：
# ./scripts/macos-postinstall.sh ~/Downloads/"Rust File Manager.app"
```
亦可手動在終端機執行：
```bash
xattr -cr "/Applications/Rust File Manager.app"
```

#### 跨平台雲端自動打包 (GitHub Actions CI/CD)
專案已內建 [`.github/workflows/release.yml`](.github/workflows/release.yml)，只要推送版本標籤（例如 `git tag v0.1.0 && git push origin v0.1.0`）或在 GitHub Actions 手動觸發，就會自動平行啟動 **Windows、Ubuntu Linux、macOS (Intel & Apple Silicon)** 四台雲端建置機，一次產出三大平台的所有安裝包與單一執行檔並發布至 GitHub Releases。
