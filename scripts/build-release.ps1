<#
.SYNOPSIS
    Rust File Manager (Tauri 2.x) 跨平台發布打包腳本 (Build Release & Export Artifacts)

.DESCRIPTION
    自動執行前端打包與 Tauri 2.x Release 編譯，並匯出各平台原生安裝包：
    - Windows: 系統原生單一 MSI 安裝套件 (*.msi)
    - Linux: 原生發行版套件 (.deb, .rpm, .AppImage)
    - macOS: 磁碟映像檔 (.dmg)
    統一整理匯出至專案根目錄下的 release-artifacts/ 目錄，並自動計算 SHA-256 校驗碼。

.PARAMETER PortableOnly
    僅編譯免安裝單一執行檔 (--no-bundle)，速度最快，不產生安裝套件

.PARAMETER IncludePortable
    在打包系統安裝套件的同時，額外匯出免安裝單一執行檔至 release-artifacts/

.PARAMETER Target
    指定目標安裝包格式 (例如: msi, deb, rpm, appimage, dmg, all)，在 Windows 下預設為 msi
#>

[CmdletBinding()]
param(
    [switch]$PortableOnly,
    [switch]$IncludePortable,
    [string]$Target = "all"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$OutDir = Join-Path $ProjectRoot "release-artifacts"

# 確保 PATH 包含 Cargo 與 fnm
$CargoBin = Join-Path $HOME ".cargo/bin"
$FnmDefault = if ($IsWindows) {
    Join-Path $env:APPDATA "fnm/aliases/default"
} else {
    Join-Path $HOME ".local/share/fnm/aliases/default"
}
$Sep = [System.IO.Path]::PathSeparator
foreach ($p in @($CargoBin, $FnmDefault)) {
    if ((Test-Path $p) -and ($env:Path -notlike "*$p*")) {
        $env:Path = "$p$Sep$env:Path"
    }
}

function Get-TargetDriveInfo([string]$Path) {
    try {
        $fullPath = [System.IO.Path]::GetFullPath($Path)
        $root = [System.IO.Path]::GetPathRoot($fullPath)
        $driveInfo = [System.IO.DriveInfo]::new($root)
        return [PSCustomObject]@{
            Root = $root
            AvailableFreeBytes = $driveInfo.AvailableFreeSpace
            TotalBytes = $driveInfo.TotalSize
            AvailableFreeGB = [math]::Round($driveInfo.AvailableFreeSpace / 1GB, 2)
        }
    } catch {
        return $null
    }
}

# 確保本地 node_modules、Tauri CLI 與核心相依套件存在，若缺漏則自動執行 npm install
$TauriCmd = Join-Path $ProjectRoot "node_modules/.bin/tauri.cmd"
$TauriBin = Join-Path $ProjectRoot "node_modules/.bin/tauri"
$DragPluginPkg = Join-Path $ProjectRoot "node_modules/@crabnebula/tauri-plugin-drag"
$NeedNpmInstall = (-not (Test-Path $TauriCmd) -and -not (Test-Path $TauriBin)) -or (-not (Test-Path $DragPluginPkg))
if ($NeedNpmInstall) {
    Write-Host "[INFO]  未偵測到完整 node_modules 或必要相依套件，自動執行 npm install..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try {
        npm install --prefer-offline --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) {
            throw "npm install 失敗，退出碼: $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
}

$TargetBuildDir = if ($env:CARGO_TARGET_DIR) {
    $env:CARGO_TARGET_DIR
} else {
    Join-Path $ProjectRoot "src-tauri/target"
}

# 磁碟空間前置健康檢查 (Pre-flight disk space check)
$targetDrive = Get-TargetDriveInfo $TargetBuildDir
if ($targetDrive) {
    if ($targetDrive.AvailableFreeGB -lt 2.0) {
        Write-Host "`n============================================================" -ForegroundColor Red
        Write-Host "[ERROR] 編譯目標磁區 ($($targetDrive.Root)) 剩餘空間嚴重不足 (僅剩 $($targetDrive.AvailableFreeGB) GB)！" -ForegroundColor Red
        Write-Host "[HINT]  Tauri / Rust Release 發行版編譯與 LTO 連結需要大量暫存空間，至少需 3~5 GB。" -ForegroundColor Yellow
        Write-Host "[HINT]  為防寫入中斷 (rustc-LLVM no space on device)，請先採取以下措施：" -ForegroundColor Yellow
        Write-Host "        1. 清理本專案快取: cd src-tauri; cargo clean" -ForegroundColor Yellow
        Write-Host "        2. 或指定其他大容量磁區: `$env:CARGO_TARGET_DIR = 'F:\cargo_target'" -ForegroundColor Yellow
        Write-Host "============================================================`n" -ForegroundColor Red
        throw "磁碟空間不足 (剩餘 $($targetDrive.AvailableFreeGB) GB < 2.0 GB)，已中斷編譯以防寫入失敗。"
    } elseif ($targetDrive.AvailableFreeGB -lt 5.0) {
        Write-Host "[WARN]  編譯目標磁區 ($($targetDrive.Root)) 剩餘空間偏低 (僅剩 $($targetDrive.AvailableFreeGB) GB)，建議預留至少 5~10 GB 供發行版連結與符號檔產生。" -ForegroundColor Yellow
    } else {
        Write-Host "[INFO]  磁碟前置檢查正常：目標磁區 ($($targetDrive.Root)) 可用空間 $($targetDrive.AvailableFreeGB) GB" -ForegroundColor Cyan
    }
}

$ReleaseDir = if ($env:CARGO_TARGET_DIR -and (Test-Path (Join-Path $env:CARGO_TARGET_DIR "release"))) {
    Join-Path $env:CARGO_TARGET_DIR "release"
} else {
    Join-Path $ProjectRoot "src-tauri/target/release"
}
$BundleDir = Join-Path $ReleaseDir "bundle"
if (Test-Path $BundleDir) {
    Remove-Item -Path $BundleDir -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "[INFO]  開始編譯 Rust File Manager 正式發行版 (Release Build)..." -ForegroundColor Cyan

Push-Location $ProjectRoot
try {
    if ($PortableOnly) {
        Write-Host "[INFO]  模式：僅產生免安裝單一執行檔 (--no-bundle)" -ForegroundColor Cyan
        npm run tauri -- build --no-bundle
    } elseif ($Target -ne "all") {
        Write-Host "[INFO]  模式：產生單一執行檔 + 指定安裝包 ($Target)" -ForegroundColor Cyan
        npm run tauri -- build --bundles $Target
    } else {
        if ($IsWindows) {
            Write-Host "[INFO]  模式：Windows 平台專注打包系統單一安裝檔 (MSI)" -ForegroundColor Cyan
            npm run tauri -- build --bundles msi
        } else {
            Write-Host "[INFO]  模式：跨平台系統完整安裝包 (deb, appimage, dmg)" -ForegroundColor Cyan
            npm run tauri -- build
        }
    }
    if ($LASTEXITCODE -ne 0) {
        $failedDrive = Get-TargetDriveInfo $TargetBuildDir
        if ($failedDrive -and ($failedDrive.AvailableFreeGB -lt 1.0)) {
            Write-Host "`n============================================================" -ForegroundColor Red
            Write-Host "[CRITICAL] 偵測到編譯磁區 ($($failedDrive.Root)) 剩餘空間極低 (僅剩 $($failedDrive.AvailableFreeGB) GB)！" -ForegroundColor Red
            Write-Host "[HINT]     本次編譯失敗極可能由磁碟空間耗盡 (no space on device) 引起。" -ForegroundColor Yellow
            Write-Host "[HINT]     建議採取以下措施釋放空間或重定向快取：" -ForegroundColor Yellow
            Write-Host "           1. 清理本專案快取: cd src-tauri; cargo clean" -ForegroundColor Yellow
            Write-Host "           2. 或將編譯目錄指向更大容量之磁區: `$env:CARGO_TARGET_DIR = 'F:\cargo_target'" -ForegroundColor Yellow
            Write-Host "============================================================`n" -ForegroundColor Red
        }
        throw "Tauri build 失敗，退出碼: $LASTEXITCODE"
    }
} catch {
    $failedDrive = Get-TargetDriveInfo $TargetBuildDir
    if ($failedDrive -and ($failedDrive.AvailableFreeGB -lt 1.0)) {
        Write-Host "`n============================================================" -ForegroundColor Red
        Write-Host "[CRITICAL] 偵測到編譯磁區 ($($failedDrive.Root)) 剩餘空間極低 (僅剩 $($failedDrive.AvailableFreeGB) GB)！" -ForegroundColor Red
        Write-Host "[HINT]     本次編譯失敗極可能由磁碟空間耗盡 (no space on device) 引起。" -ForegroundColor Yellow
        Write-Host "[HINT]     建議採取以下措施釋放空間或重定向快取：" -ForegroundColor Yellow
        Write-Host "           1. 清理本專案快取: cd src-tauri; cargo clean" -ForegroundColor Yellow
        Write-Host "           2. 或將編譯目錄指向更大容量之磁區: `$env:CARGO_TARGET_DIR = 'F:\cargo_target'" -ForegroundColor Yellow
        Write-Host "============================================================`n" -ForegroundColor Red
    }
    throw
} finally {
    Pop-Location
}

if (Test-Path $OutDir) {
    Remove-Item -Path $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$ReleaseDir = if ($env:CARGO_TARGET_DIR -and (Test-Path (Join-Path $env:CARGO_TARGET_DIR "release"))) {
    Join-Path $env:CARGO_TARGET_DIR "release"
} else {
    Join-Path $ProjectRoot "src-tauri/target/release"
}
$BundleDir = Join-Path $ReleaseDir "bundle"

# 1. 複製免安裝單一執行檔 (Portable Executable, 僅於指定 -PortableOnly 或 -IncludePortable 時匯出)
if ($PortableOnly -or $IncludePortable) {
    if ($IsWindows) {
        $exePath = Join-Path $ReleaseDir "rust-file-manager.exe"
        if (Test-Path $exePath) {
            $portableDest = Join-Path $OutDir "rust-file-manager-portable-windows-x64.exe"
            Copy-Item -Path $exePath -Destination $portableDest -Force
            Write-Host "[OK]    已匯出 Windows 免安裝單一執行檔: $portableDest" -ForegroundColor Green
        }
    } else {
        $binPath = Join-Path $ReleaseDir "rust-file-manager"
        if (Test-Path $binPath) {
            $osTag = if ($IsMacOS) { "macos" } else { "linux" }
            $portableDest = Join-Path $OutDir "rust-file-manager-portable-$osTag"
            Copy-Item -Path $binPath -Destination $portableDest -Force
            Write-Host "[OK]    已匯出免安裝單一執行檔: $portableDest" -ForegroundColor Green
        }
    }
}

# 2. 複製各平台系統原生安裝包 (Windows: 系統單一 .msi; Linux: .deb, .rpm, .AppImage; macOS: .dmg)
if (-not $PortableOnly) {
    if (Test-Path $BundleDir) {
        $filterPatterns = if ($IsWindows) {
            @("*.msi")
        } elseif ($IsMacOS) {
            @("*.dmg")
        } else {
            @("*.deb", "*.rpm", "*.AppImage")
        }
        $installers = Get-ChildItem -Path $BundleDir -Recurse -File -Include $filterPatterns
        foreach ($file in $installers) {
            # 若為 MSI 安裝包，去除 Tauri 自動附加之語言代碼 (例如 _zh-TW.msi 或 _en-US.msi -> .msi)
            $cleanName = if ($file.Extension -ieq ".msi") {
                $file.Name -replace '(_[a-zA-Z]{2}-[a-zA-Z]{2}|\.en-US|\.zh-TW)(?=\.msi$)', ''
            } else {
                $file.Name
            }
            $dest = Join-Path $OutDir $cleanName
            Copy-Item -Path $file.FullName -Destination $dest -Force
            Write-Host "[OK]    已匯出系統安裝包: $dest" -ForegroundColor Green
        }
    }
}

# 3. 產生 SHA256SUMS.txt 校驗清單
$checksumLines = @()
Get-ChildItem -Path $OutDir -File | Where-Object { $_.Name -ne "SHA256SUMS.txt" } | ForEach-Object {
    $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash.ToLower()
    $sizeMb = [math]::Round($_.Length / 1MB, 2)
    $checksumLines += "$hash  $($_.Name)"
    Write-Host ("        -> {0,-48} ({1} MB) SHA256: {2}" -f $_.Name, $sizeMb, $hash.Substring(0, 16)) -ForegroundColor Gray
}
if ($checksumLines.Count -gt 0) {
    $checksumLines | Set-Content -Path (Join-Path $OutDir "SHA256SUMS.txt") -Encoding UTF8
}

Write-Host "[OK]    所有打包產物已整理至: $OutDir" -ForegroundColor Green
