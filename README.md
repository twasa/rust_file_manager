# Rust File Manager — 跨平台高效能檔案管理軟體 (Tauri 2.x + Rust + React)

使用 **Rust** 與 **Tauri 2.x** 搭配 **React 18 + TypeScript + Tailwind CSS** 打造的跨平台（Microsoft Windows、Linux、macOS）桌面檔案管理軟體。兼顧巨量檔案瀏覽效能、背景非同步傳輸佇列（Queue）、LRU 快取與檔案監控、多色彩可鎖定分頁、雙欄並排指揮官模式（Dual-Pane）以及進階批次重新命名工具。

---

## 核心功能與架構亮點

### 1. 極致效能：虛擬滾動、Rayon 平行掃描與 LRU 智慧快取 (`src-tauri/src/fs_ops.rs`)
- **後端多執行緒平行解析 (`rayon`)**：目錄讀取採用 Rust `rayon` 平行迭代器解析檔案 Metadata、隱藏屬性與類型分類，面對上萬個檔案的巨型目錄依然能在毫秒級完成。
- **LRU 記憶體快取 + 即時檔案監聽 (`lru` + `notify`)**：內建 `FsCacheState`（12 秒智慧 TTL 搭配 `notify::RecommendedWatcher` 檔案系統事件監聽），二次切換分頁或返回上層目錄達到 **0ms 快取命中 (`CACHE`)**，且當目錄內容發生異動時自動使快取失效。
- **前端虛擬滾動 (`@tanstack/react-virtual`)**：不論目錄下有 1,000 或 100,000 個檔案，DOM 永遠只渲染可視範圍內的列（Row），徹底杜絕傳統 WebView 檔案過多造成的捲動卡頓。

### 2. 背景非同步檔案傳輸佇列 (`src-tauri/src/queue.rs`)
- **2MB 分塊串流讀寫 (Chunked Streaming)**：複製或跨磁碟搬移超大型檔案（如數十 GB 映像檔或影片）或成千上萬個零碎檔案時，一律交由背景 Worker 佇列以 `2 MB` 緩衝區分段串流處理，絕不阻塞 UI 主執行緒或撐爆記憶體。
- **佇列控制與即時速率回報**：透過 Tauri Event (`queue://updated`) 即時推送位元組進度、完成百分比與每秒傳輸速率（MB/s），支援隨時 **暫停 (Pause)**、**繼續 (Resume)**、**取消 (Cancel)**（取消時自動清理未完成殘留檔）與 **清除已完成紀錄**。
- **三種同名衝突策略**：支援「自動重新命名保留兩者 (`_1`, `_2`)」、「直接覆寫」與「略過同名檔案」。

### 3. 多分頁管理：自訂顏色標籤與防誤關鎖定 (`src/components/TabBar.tsx`)
- **自訂分頁顏色**：支援右鍵為分頁設定專屬色彩標籤（海洋藍、翡翠綠、琥珀橘、珊瑚紅、極光紫、青色），方便區分不同工作目錄。
- **分頁鎖定保護 (Tab Lock)**：可透過分頁右鍵選單或快捷鍵 `Ctrl+L` 鎖定分頁；鎖定後的分頁會顯示鎖頭圖示，並隱藏關閉按鈕、攔截 `Ctrl+W` 與滑鼠中鍵關閉，避免重要工作目錄被誤關。
- **拖曳排序與跨分頁投遞**：支援直接拖曳調整分頁順序，或將檔案直接拖拉至上方任一分頁標籤完成搬移/複製。

### 4. 字形與字體大小即時調整 + 設定檔匯出/匯入 (`src/components/SettingsModal.tsx`)
- 支援切換系統字體、微軟正黑體、Inter、JetBrains Mono、Cascadia Code、Consolas，或直接輸入系統已安裝的任意自訂字型名稱。
- 支援 `11px` ~ `24px` 字體大小無段調整（頂部工具列亦提供 `A-` / `A+` 快速微調按鈕）以及虛擬列表列高（`26px` ~ `58px`）調整，並自動持久化儲存。
- **跨平台設定檔匯出與匯入 (`.json`)**：
  - 於「設定與快捷鍵 -> **設定檔匯出 / 匯入 (.json)**」分頁中，支援一鍵將**字型設定、自定義鍵盤快速鍵、書籤捷徑、雙欄狀態、所有分頁（含鎖定狀態與顏色標籤）及佇列衝突策略**完整匯出為標準 JSON 設定檔，或從任意 `.json` 備份檔匯入還原。
  - **Portable 隨身碟攜帶支援**：支援直接讀寫本機設定檔路徑（預設為系統設定目錄 `rust-file-manager/settings.json`，若在單一執行檔同目錄放置 `rfm-settings.json` 則自動優先識別為 Portable 設定檔）。

### 5. 智慧感知右鍵功能表 (`src/components/ContextMenu.tsx`)
針對不同右鍵點擊對象動態呈現專屬操作：
- **針對目錄**：進入目錄、在新分頁中開啟、在另一側面板開啟 (Dual-Pane)、加入側邊欄書籤捷徑、在此目錄開啟系統終端機 (`pwsh` / `wt` / `Terminal`)、壓縮為 `.zip`。
- **針對壓縮檔 (`.zip`, `.tar`, `.gz`, `.7z`)**：一鍵「解壓縮至此處（自動建立同名資料夾）」。
- **針對一般檔案與執行檔**：使用系統預設程式開啟、計算檔案校驗雜湊值（**MD5 / SHA-256 / CRC32**）、複製完整路徑、在原生系統檔案總管中顯示。
- **針對目錄空白處**：新增資料夾、新增空白文字檔、貼上佇列項目、開啟終端機、強制重新整理快取。

### 6. 自定義鍵盤快速鍵（預設相容 MS Windows 習慣）
內建按鍵錄製器，可自由修改所有快捷鍵並隨時一鍵還原預設值：

| 功能動作 | 預設快捷鍵 (Windows 標準) | 說明 |
| :--- | :--- | :--- |
| **重新命名** | `F2` | 單選時觸發原地改名 (Inline Rename)；多選時自動開啟批次重新命名視窗 |
| **進階批次重新命名** | `Ctrl+Shift+R` | 開啟 Regex / 流水號 / 日期變數批次改名工具 |
| **複製 / 剪下 / 貼上** | `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | 剪貼簿複製與搬移（自動進入背景非同步佇列） |
| **移至資源回收桶** | `Delete` | 安全移至作業系統資源回收桶 (Trash) |
| **永久刪除** | `Shift+Delete` | 略過資源回收桶直接永久刪除 |
| **新增 / 關閉 / 鎖定分頁** | `Ctrl+T` / `Ctrl+W` / `Ctrl+L` | 分頁生命週期管理與防關閉鎖定 |
| **新增資料夾** | `Ctrl+Shift+N` | 在目前目錄快速建立新資料夾 |
| **重新整理 (強制刷新快取)** | `F5` | 強制清除目前目錄 LRU 快取並重新掃描 |
| **切換單欄 / 雙欄並排** | `F6` | 切換左右雙欄指揮官檢視模式 (Dual-Pane) |
| **顯示 / 隱藏系統隱藏檔** | `Ctrl+H` | 切換是否顯示 `.` 開頭或具隱藏屬性之檔案 |
| **快速過濾搜尋** | `Ctrl+F` | 聚焦至頂部即時檔名過濾框 |
| **返回上一層目錄** | `Backspace` | 導覽至父目錄 |
| **在目前目錄開啟終端機** | `` Ctrl+` `` | 啟動 PowerShell 7 / Windows Terminal / macOS & Linux Terminal |

### 7. 拖拉功能 (Drag & Drop)
- 支援將單一或多個選取項目直接拖拉至：
  1. 同一列表中的**子資料夾**
  2. 雙欄並排模式下的**另一側面板**
  3. 頂部**分頁標籤**或**麵包屑路徑節點**
  4. 左側邊欄的**書籤捷徑**或**磁碟掛載點**
- 拖拉放開時若按住 `Ctrl` 鍵會自動轉為「複製佇列」，未按則預設為「搬移佇列」。

### 8. 進階批次檔案重新命名工具 (`src-tauri/src/batch_rename.rs`)
- **尋找與取代**：支援一般字串與正規表示式（Regex 擷取群組 `$1`, `$2`）及大小寫區分設定。
- **動態變數支援**：支援在取代欄、前綴或後綴插入 `{date}`（當日 `YYYYMMDD`）、`{name}`（原主檔名）、`{ext}`（原副檔名）。
- **大小寫與副檔名轉換**：一鍵轉全小寫 (`lowercase`)、全大寫 (`UPPERCASE`)、首字大寫 (`Title Case`) 或統一覆寫副檔名。
- **自動流水號編碼**：可自訂起始數字、遞增步長、補零位數（如 `001`, `002`）與插入位置（開頭、末端或完全取代主檔名）。
- **即時預覽、衝突檢查與兩階段原子更名 + 一鍵復原 (Undo)**：執行前即時標示同名衝突；執行時採用兩階段暫存更名避免連號檔案互撞，並在完成後於頂部工具列提供「復原批次改名」按鈕。

---

## 專案目錄結構

```text
rust_file_manager/
├── scripts/                      # 跨平台定版開發環境自動化安裝腳本
│   ├── setup-dev-env.ps1         # PowerShell 7+ 安裝腳本 (Windows / Linux / macOS)
│   └── setup-dev-env.sh          # Bash / Zsh 安裝腳本 (Linux / macOS / Windows Git Bash)
├── src/                          # React 18 + TypeScript 前端原始碼
│   ├── components/
│   │   ├── BatchRenameModal.tsx  # 進階批次重新命名工具 (Regex/流水號/即時預覽)
│   │   ├── ContextMenu.tsx       # 智慧感知右鍵選單 (目錄/壓縮檔/一般檔/空白處)
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
