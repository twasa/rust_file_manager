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

### 4. 字形與字體大小即時調整（含全域 UI 介面字體縮放） + 設定檔自動持久化與匯出/匯入 (`src/components/SettingsModal.tsx`)
- 支援切換系統字體、微軟正黑體、Inter、JetBrains Mono、Cascadia Code、Consolas，或直接輸入系統已安裝的任意自訂字型名稱，並**全域同步套用至檔案列表、側邊欄、分頁列、工具列、右鍵選單與所有設定視窗**。
- 支援獨立調整 **「檔案列表字體大小 (`11px ~ 24px`)」**、**「全域 UI 介面字體大小 (`11px ~ 22px`)」** 以及 **「虛擬列表列高 (`26px ~ 58px`)」**（頂部工具列 `A-` / `A+` 按鈕可同步縮放檔案列表與 UI 字體）。
- **跨平台設定檔即時自動存檔與匯出/匯入 (`.json`)**：
  - **設定變更即時防抖自動儲存至磁碟**：使用者在 UI 或設定視窗中所進行的任何設定異動（字型大小、自訂快捷鍵、書籤捷徑、已鎖定與設色分頁、雙欄狀態、刪除確認、佇列衝突策略與日誌等級等），系統皆會即時透過防抖 (Debounce) 機制自動寫入磁碟上的 `settings.json`，並在視窗關閉前立即 Flush，徹底解決「僅在記憶體生效但未寫入檔案」的問題，重新啟動或隨身攜帶設定完全不遺失。
  - **Portable 隨身碟攜帶支援**：設定檔（`settings.json`）與日誌目錄（`logs/`）預設與執行檔（`.exe`）存放於同一層目錄，初次執行時若不存在即自動建立，實現真正的綠色免安裝與零設定搬移。同時相容自訂路徑與既有 `rfm-settings.json`。
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

### 7. 自定義鍵盤快速鍵（預設相容 MS Windows 習慣）
內建按鍵錄製器，可自由修改所有快捷鍵並隨時一鍵還原預設值：

| 功能動作 | 預設快捷鍵 (Windows 標準) | 說明 |
| :--- | :--- | :--- |
| **重新命名** | `F2` | 單選時觸發原地改名（按第 1 次**全選主檔名**、再按第 2 次**全選副檔名**、第 3 次**全選完整檔名**循環切換）；多選時自動開啟批次重新命名視窗 |
| **進階批次重新命名** | `Ctrl+Shift+R` | 開啟 Regex / 流水號 / 日期變數批次改名工具 |
| **複製 / 剪下 / 貼上** | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | 剪貼簿複製與搬移（自動進入背景非同步佇列） |
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

### 8. 高效操作性：鍵盤游標移動導覽 (Keyboard Navigation)、打字自動跳轉 (Type-to-Select) 與滑鼠框選多檔案 (Marquee Selection) (`src/components/FilePane.tsx`)
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

### 9. 拖拉功能 (Drag & Drop)
- 支援將單一或多個選取項目直接拖拉至：
  1. 同一列表中的**子資料夾**
  2. 雙欄並排模式下的**另一側面板**
  3. 頂部**分頁標籤**或**麵包屑路徑節點**
  4. 左側邊欄的**書籤捷徑**或**磁碟掛載點**
- 拖拉放開時若按住 `Ctrl` 鍵會自動轉為「複製佇列」，未按則預設為「搬移佇列」。

### 10. 進階批次檔案重新命名工具 (`src-tauri/src/batch_rename.rs`)
- **尋找與取代**：支援一般字串與正規表示式（Regex 擷取群組 `$1`, `$2`）及大小寫區分設定。
- **動態變數支援**：支援在取代欄、前綴或後綴插入 `{date}`（當日 `YYYYMMDD`）、`{name}`（原主檔名）、`{ext}`（原副檔名）。
- **大小寫與副檔名轉換**：一鍵轉全小寫 (`lowercase`)、全大寫 (`UPPERCASE`)、首字大寫 (`Title Case`) 或統一覆寫副檔名。
- **自動流水號編碼**：可自訂起始數字、遞增步長、補零位數（如 `001`, `002`）與插入位置（開頭、末端或完全取代主檔名）。
- **即時預覽、衝突檢查與兩階段原子更名 + 一鍵復原 (Undo)**：執行前即時標示同名衝突；執行時採用兩階段暫存更名避免連號檔案互撞，並在完成後於頂部工具列提供「復原批次改名」按鈕。

### 11. 完整儲存裝置支援與磁碟代號排序 (`src-tauri/src/fs_ops.rs` & `src/components/Sidebar.tsx`)
- **支援 RAMDisk / ImDisk / Google Drive 雲端硬碟 / 網路磁碟機**：除了標準實體磁碟外，Windows 後端結合 Win32 API (`GetLogicalDrives`、`GetVolumeInformationW`、`GetDiskFreeSpaceExW`) 自動補齊所有邏輯掛載磁碟（如 ImDisk RAMDisk `R:`、Google 雲端硬碟 `G:` 與網路磁碟）。
- **依磁碟代號字母嚴格排序**：側邊欄儲存空間統一採用 `代號: (磁碟標籤)` 格式（如 `C: (本機磁碟)`、`D: (D)`、`G: (Google Drive)`、`R: (RamDisk)`），並依磁碟字母由小到大整齊排列。

### 12. 資訊安全防護設計 (Security Architecture)
- **嚴格內容安全政策 (Strict CSP)**：於 `src-tauri/tauri.conf.json` 啟用 `default-src 'self'; script-src 'self'` 等白名單限制，防止 WebView 載入或執行任何外部未知腳本。
- **壓縮檔解壓縮 Zip Slip 路徑穿越防護 (`src-tauri/src/system_ops.rs`)**：解壓縮前先透過 `validate_archive_entries_list` 預檢壓縮檔內部清單，一旦發現包含 `../`、`..\`、絕對路徑（`/`、`C:\`）即自動攔截並拒絕解壓縮。
- **檔名安全驗證與保留設備名攔截 (`validate_safe_entry_name`)**：於建立檔案/目錄、原地改名與批次重新命名中，統一攔截路徑跳脫字元（`..`、`/`、`\`、`:`、`\0`）與系統保留設備名（`CON`、`PRN`、`AUX`、`NUL`、`COM1~9`、`LPT1~9`）。
- **防止目錄遞迴自我複製/搬移炸彈 (`src-tauri/src/queue.rs`)**：佇列執行前強制檢查目標路徑是否為來源目錄之子孫目錄，並於取消任務時自動清除未寫完的殘留檔案。
- **子行程陣列傳參防範命令注入 (Command Injection Prevention)**：所有外部行程呼叫（`wt`、`pwsh`、`explorer`、`tar`）一律透過 `Command::new().args([...])` 陣列傳遞，不經過 Shell 字串拼接。
- **設定檔讀寫副檔名與容量保護 (`src-tauri/src/lib.rs`)**：強制限制設定檔讀寫路徑必須為 `.json` 副檔名且不超過 `5 MB`，並於預覽面板限制最多讀取前 `32 KB`，防止任意系統檔案覆寫或大檔記憶體耗盡 (OOM)。

### 13. 結構化 JSON 日誌與設定檔損毀診斷 (`src-tauri/src/logger.rs`)
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
│   │   ├── PreviewPanel.tsx      # 右側內容預覽與 MD5/SHA256/CRC32 雜湊校驗面板
│   │   ├── QueueDrawer.tsx       # 底部背景非同步傳輸佇列進度抽屜
│   │   ├── SettingsModal.tsx     # 字形/字體大小調整與自訂鍵盤快速鍵錄製器
│   │   ├── Sidebar.tsx           # 跨平台磁碟空間、系統捷徑與書籤側邊欄
│   │   └── TabBar.tsx            # 多色彩、可鎖定防關閉之分頁列
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
| **Microsoft Windows** | `rust-file-manager-portable-windows-x64.exe` (單一 `.exe` 直接雙擊執行) | NSIS `*-setup.exe`、Windows Installer `*.msi` |
| **Linux** | `rust-file-manager-portable-linux-x86_64` / `*.AppImage` (單一檔案免安裝) | Debian/Ubuntu `*.deb`、Fedora/RHEL `*.rpm`、`*.AppImage` |
| **macOS** | `Rust File Manager.app` | Apple Disk Image `*.dmg` (支援 Intel `x64` 與 Apple Silicon `arm64`) |

#### 使用自動化打包腳本（自動匯出至 `release-artifacts/` 並產生 `SHA256SUMS.txt`）

> **智慧依賴檢測**：打包腳本（`build-release.ps1` 與 `build-release.sh`）具備依賴防呆機制，若檢測到尚未安裝 `node_modules` 或本機 `@tauri-apps/cli`，將自動觸發 `npm install` 補齊依賴後再進行打包，避免乾淨環境下出現找不到可執行檔之錯誤。

**PowerShell (`pwsh`)**：
```powershell
# 1. 僅快速編譯「免安裝單一執行檔 (Portable .exe)」（不打包安裝程式，速度最快）
./scripts/build-release.ps1 -PortableOnly
# 或使用 npm 指令: npm run package:portable

# 2. 完整編譯「免安裝單一執行檔 + 平台所有安裝包 (.exe / .msi / .deb / .dmg)」
./scripts/build-release.ps1
# 或使用 npm 指令: npm run package:all

# 3. 僅打包指定格式的安裝包 (例如只打包 Windows NSIS 安裝包)
./scripts/build-release.ps1 -Target nsis
```

**Bash / Zsh (`bash`)**：
```bash
# 1. 僅快速編譯免安裝單一執行檔
./scripts/build-release.sh --portable-only

# 2. 完整編譯單一執行檔與當前系統所有安裝包 (.deb / .rpm / .AppImage / .dmg)
./scripts/build-release.sh
```

#### 跨平台雲端自動打包 (GitHub Actions CI/CD)
專案已內建 [`.github/workflows/release.yml`](.github/workflows/release.yml)，只要推送版本標籤（例如 `git tag v0.1.0 && git push origin v0.1.0`）或在 GitHub Actions 手動觸發，就會自動平行啟動 **Windows、Ubuntu Linux、macOS (Intel & Apple Silicon)** 四台雲端建置機，一次產出三大平台的所有安裝包與單一執行檔並發布至 GitHub Releases。
