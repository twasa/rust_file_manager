<#
.SYNOPSIS
    Rust File Manager (Tauri 2.x) 跨平台開發環境自動化安裝腳本 (PowerShell 7+ 支援 Windows / Linux / macOS)

.DESCRIPTION
    自動檢查並以定版 (Pinned Versions) 安裝開發環境所需的系統建置工具：
    - 作業系統層級依賴 (Windows C++ Build Tools + WebView2 / Linux WebKit2GTK / macOS Xcode CLT)
    - Rust 穩定版工具鏈 (rustup + 指定定版 RustVersion)
    - Fast Node Manager (fnm 指定定版 FnmVersion)
    - Node.js LTS 官方穩定版 (指定定版 NodeVersion)
    - 專案 npm 依賴與 Tauri 2.x CLI

.PARAMETER RustVersion
    指定安裝的 Rust 穩定版版號 (預設: 1.100.0)

.PARAMETER NodeVersion
    指定安裝的 Node.js LTS 穩定版版號 (預設: 26.13.1)

.PARAMETER FnmVersion
    指定安裝的 fnm 套件管理器版號 (預設: 1.39.0)

.PARAMETER TauriCliVersion
    指定專案使用的 @tauri-apps/cli 基準版號 (預設: 2.2.0)

.PARAMETER SkipSystemDeps
    略過需要系統管理員權限 (winget / sudo) 的作業系統依賴安裝

.PARAMETER SkipNpmInstall
    略過專案根目錄的 npm install

.PARAMETER CheckOnly
    僅檢查目前環境工具鏈版本，不執行任何安裝或變更

.EXAMPLE
    ./scripts/setup-dev-env.ps1
    ./scripts/setup-dev-env.ps1 -CheckOnly
    ./scripts/setup-dev-env.ps1 -RustVersion "1.100.0" -NodeVersion "26.13.1"
#>

[CmdletBinding()]
param(
    [string]$RustVersion = $(if ($env:RUST_VERSION) { $env:RUST_VERSION } else { "1.100.0" }),
    [string]$NodeVersion = $(if ($env:NODE_VERSION) { $env:NODE_VERSION } else { "26.13.1" }),
    [string]$FnmVersion = $(if ($env:FNM_VERSION) { $env:FNM_VERSION } else { "1.39.0" }),
    [string]$TauriCliVersion = $(if ($env:TAURI_CLI_VERSION) { $env:TAURI_CLI_VERSION } else { "2.2.0" }),
    [switch]$SkipSystemDeps,
    [switch]$SkipNpmInstall,
    [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) { Write-Host "[INFO]  $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message)   { Write-Host "[OK]    $Message" -ForegroundColor Green }
function Write-Warn([string]$Message) { Write-Host "[WARN]  $Message" -ForegroundColor Yellow }

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# 若在 Linux 或 macOS 下使用 pwsh 執行，且僅需作業系統依賴時可共用邏輯或直接委派處理
$CargoBinDir = Join-Path $HOME ".cargo/bin"
if (-not (Test-Path $CargoBinDir)) {
    New-Item -ItemType Directory -Force -Path $CargoBinDir | Out-Null
}

# 確保目前 Session PATH 包含 Cargo 與 fnm 預設別名路徑
$FnmDefaultDir = if ($IsWindows) {
    Join-Path $env:APPDATA "fnm/aliases/default"
} else {
    Join-Path $HOME ".local/share/fnm/aliases/default"
}

$PathSeparator = [System.IO.Path]::PathSeparator
foreach ($dir in @($CargoBinDir, $FnmDefaultDir)) {
    if ($dir -and ($env:Path -split [regex]::Escape($PathSeparator)) -notcontains $dir) {
        $env:Path = "$dir$PathSeparator$env:Path"
    }
}

$OsLabel = if ($IsWindows) { "Windows" } elseif ($IsMacOS) { "macOS" } else { "Linux" }
Write-Info "=========================================================="
Write-Info "Rust File Manager 開發環境安裝與檢核 ($OsLabel / PowerShell $($PSVersionTable.PSVersion))"
Write-Info "目標定版設定:"
Write-Info "  - RustVersion     = $RustVersion"
Write-Info "  - NodeVersion     = v$NodeVersion"
Write-Info "  - FnmVersion      = v$FnmVersion"
Write-Info "  - TauriCliVersion = ^$TauriCliVersion"
Write-Info "=========================================================="

if ($CheckOnly) {
    Write-Info "執行環境唯讀檢核 (-CheckOnly)..."
    foreach ($cmd in @("rustc", "cargo", "fnm", "node", "npm")) {
        $found = Get-Command $cmd -ErrorAction SilentlyContinue
        if ($found) {
            $ver = & $found.Source --version
            Write-Ok ("{0,-8} : {1} ({2})" -f $cmd, $ver, $found.Source)
        } else {
            Write-Warn ("{0,-8} : 尚未安裝" -f $cmd)
        }
    }
    exit 0
}

# ------------------------------------------------------------------------------
# 1. 檢查並安裝作業系統層級依賴 (Windows MSVC BuildTools / Linux / macOS)
# ------------------------------------------------------------------------------
if (-not $SkipSystemDeps) {
    if ($IsWindows) {
        $vsWhere = "${env:ProgramFiles(x86)}/Microsoft Visual Studio/Installer/vswhere.exe"
        $hasVcTools = $false
        if (Test-Path $vsWhere) {
            $vcInstall = & $vsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
            if ($vcInstall) {
                $hasVcTools = $true
                Write-Ok "已偵測到 Visual Studio C++ Build Tools: $vcInstall"
            }
        }
        if (-not $hasVcTools) {
            Write-Warn "未偵測到 Visual Studio C++ Build Tools，嘗試透過 winget 安裝..."
            $wingetCmd = Get-Command "winget.exe" -ErrorAction SilentlyContinue
            if (-not $wingetCmd -and (Test-Path "$env:LOCALAPPDATA/Microsoft/WindowsApps/winget.exe")) {
                $wingetCmd = "$env:LOCALAPPDATA/Microsoft/WindowsApps/winget.exe"
            }
            if ($wingetCmd) {
                & $wingetCmd install --id Microsoft.VisualStudio.2022.BuildTools --override "--passive --wait --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended" --accept-package-agreements --accept-source-agreements
            } else {
                Write-Warn "找不到 winget，請手動安裝 Visual Studio C++ Build Tools: https://visualstudio.microsoft.com/visual-cpp-build-tools/"
            }
        }
    } elseif ($IsLinux -or $IsMacOS) {
        $bashScript = Join-Path $ScriptDir "setup-dev-env.sh"
        if (Test-Path $bashScript) {
            Write-Info "在 $OsLabel 環境下呼叫 setup-dev-env.sh 處理系統原生依賴..."
            $env:RUST_VERSION = $RustVersion
            $env:NODE_VERSION = $NodeVersion
            $env:FNM_VERSION = $FnmVersion
            $env:TAURI_CLI_VERSION = $TauriCliVersion
            & bash $bashScript $(if ($SkipNpmInstall) { "--skip-npm-install" } else { @() })
            exit $LASTEXITCODE
        }
    }
}

# ------------------------------------------------------------------------------
# 2. 安裝並鎖定 Rust 穩定版工具鏈 (rustup + $RustVersion)
# ------------------------------------------------------------------------------
$rustupExe = Join-Path $CargoBinDir $(if ($IsWindows) { "rustup.exe" } else { "rustup" })
if (-not (Test-Path $rustupExe)) {
    Write-Info "正在下載並安裝 rustup，綁定定版工具鏈 $RustVersion..."
    if ($IsWindows) {
        $rustupInit = Join-Path $env:TEMP "rustup-init.exe"
        Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile $rustupInit
        & $rustupInit -y --default-toolchain $RustVersion --profile minimal
    } else {
        $shScript = Invoke-RestMethod -Uri "https://sh.rustup.rs"
        $shScript | sh -s -- -y --default-toolchain $RustVersion --profile minimal
    }
} else {
    Write-Info "確認並切換至定版 Rust 工具鏈 $RustVersion..."
    & $rustupExe toolchain install $RustVersion --profile minimal
    & $rustupExe default $RustVersion
}

$rustcExe = Join-Path $CargoBinDir $(if ($IsWindows) { "rustc.exe" } else { "rustc" })
$cargoExe = Join-Path $CargoBinDir $(if ($IsWindows) { "cargo.exe" } else { "cargo" })
Write-Ok "Rust 工具鏈就緒: $(& $rustcExe --version) / $(& $cargoExe --version)"

# ------------------------------------------------------------------------------
# 3. 安裝定版 fnm ($FnmVersion) 並鎖定 Node.js ($NodeVersion)
# ------------------------------------------------------------------------------
$fnmExe = Join-Path $CargoBinDir $(if ($IsWindows) { "fnm.exe" } else { "fnm" })
$needInstallFnm = $true
if (Test-Path $fnmExe) {
    $currentFnm = (& $fnmExe --version).Trim()
    if ($currentFnm -eq "fnm $FnmVersion") {
        $needInstallFnm = $false
        Write-Ok "定版 fnm 已就緒: $currentFnm"
    }
}

if ($needInstallFnm) {
    $zipName = if ($IsWindows) { "fnm-windows.zip" } elseif ($IsMacOS) { "fnm-macos.zip" } else { "fnm-linux.zip" }
    $fnmUrl = "https://github.com/Schniz/fnm/releases/download/v$FnmVersion/$zipName"
    $fnmZip = Join-Path ([System.IO.Path]::GetTempPath()) "fnm-$FnmVersion.zip"
    Write-Info "正在下載定版 fnm v$FnmVersion ($fnmUrl)..."
    Invoke-WebRequest -Uri $fnmUrl -OutFile $fnmZip
    Expand-Archive -Path $fnmZip -DestinationPath $CargoBinDir -Force
    Remove-Item -Path $fnmZip -Force -ErrorAction SilentlyContinue
}

Write-Info "正在透過 fnm 安裝並鎖定 Node.js v$NodeVersion..."
& $fnmExe install $NodeVersion
& $fnmExe default $NodeVersion
(& $fnmExe env --shell power-shell) | Out-String | Invoke-Expression

# 永久寫入使用者環境變數 PATH (Windows User PATH) 與 PowerShell $PROFILE
if ($IsWindows) {
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $toAdd = @()
    foreach ($p in @($CargoBinDir, $FnmDefaultDir)) {
        if ($userPath -notlike "*$p*") { $toAdd += $p }
    }
    if ($toAdd.Count -gt 0) {
        $updatedPath = ($userPath.TrimEnd(';') + ';' + ($toAdd -join ';')).TrimStart(';')
        [Environment]::SetEnvironmentVariable("Path", $updatedPath, "User")
        Write-Ok "已將 Cargo 與 Node 預設路徑寫入使用者永久 PATH"
    }

    if ($PROFILE -and (Test-Path $PROFILE)) {
        $profileContent = Get-Content $PROFILE -Raw
        if ($profileContent -notmatch [regex]::Escape(".cargo") -or $profileContent -notmatch "fnm") {
            $appendBlock = @"

# --- Rust (Cargo) & Node.js (fnm) ---
foreach (`$p in @("`$HOME\.cargo\bin", "`$env:APPDATA\fnm\aliases\default")) {
    if ((Test-Path `$p) -and (`$env:Path -notlike "*`$p*")) {
        `$env:Path = "`$p;`$env:Path"
    }
}
if (Get-Command fnm -ErrorAction SilentlyContinue) {
    fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression
}
"@
            Add-Content -Path $PROFILE -Value $appendBlock
            Write-Ok "已同步更新 PowerShell Profile ($PROFILE) 載入 Cargo 與 fnm"
        }
    }
}

Write-Ok "Node.js 工具鏈就緒: node $(node --version) / npm v$(npm --version)"

# ------------------------------------------------------------------------------
# 4. 安裝專案前端依賴 (npm install)
# ------------------------------------------------------------------------------
$pkgJson = Join-Path $ProjectRoot "package.json"
if ((-not $SkipNpmInstall) -and (Test-Path $pkgJson)) {
    Write-Info "正在於專案根目錄 ($ProjectRoot) 執行 npm install..."
    Push-Location $ProjectRoot
    try {
        npm install
    } finally {
        Pop-Location
    }
    Write-Ok "專案前端依賴與 Tauri CLI 安裝完成"
}

Write-Info "=========================================================="
Write-Ok "開發環境自動化定版安裝完成！"
Write-Info "  - Rustc : $(& $rustcExe --version)"
Write-Info "  - Cargo : $(& $cargoExe --version)"
Write-Info "  - Fnm   : $(& $fnmExe --version)"
Write-Info "  - Node  : $(node --version)"
Write-Info "  - Npm   : v$(npm --version)"
Write-Info "啟動開發視窗指令: npm run tauri dev"
Write-Info "=========================================================="
