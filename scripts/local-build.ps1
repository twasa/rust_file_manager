<#
.SYNOPSIS
    Rust File Manager 本地打包與部署腳本 (Local Build & Deploy Script)

.DESCRIPTION
    一鍵編譯前端與 Tauri 後端免安裝可攜版主體，打包所有獨立外掛套件包 (.rfmp)，
    並自動同步複製部署至指定的本機工具目錄 ($env:RFM_HOME 或預設 $HOME\RFM)。

.PARAMETER Destination
    手動指定目標部署目錄。若未指定，則優先讀取 $env:RFM_HOME 環境變數；
    若環境變數亦不存在，則自動退回至預設路徑 $HOME\RFM。

.PARAMETER SkipBuild
    略過主體編譯步驟，僅重新打包並部署外掛。

.PARAMETER SkipPlugins
    略過外掛打包步驟，僅編譯並部署主體執行檔。

.PARAMETER Clean
    在部署前清空目標目錄中的舊版執行檔與外掛目錄。
#>

[CmdletBinding()]
param(
    [string]$Destination = "",
    [switch]$SkipBuild,
    [switch]$SkipPlugins,
    [switch]$Clean
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

# 1. 判定目標部署路徑
$TargetDir = if (-not [string]::IsNullOrWhiteSpace($Destination)) {
    $Destination
} elseif (-not [string]::IsNullOrWhiteSpace($env:RFM_HOME)) {
    $env:RFM_HOME
} else {
    Join-Path $HOME "RFM"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Rust File Manager 本地打包與部署 (Local Build & Deploy)" -ForegroundColor Cyan
Write-Host " 專案根目錄: $ProjectRoot" -ForegroundColor Gray
Write-Host " 目標部署目錄: $TargetDir" -ForegroundColor Yellow
if (-not [string]::IsNullOrWhiteSpace($env:RFM_HOME)) {
    Write-Host " (已由 `$env:RFM_HOME 環境變數指定)" -ForegroundColor DarkGray
} else {
    Write-Host " (使用預設 `$HOME\RFM 目錄)" -ForegroundColor DarkGray
}
Write-Host "==========================================================" -ForegroundColor Cyan

# 確保目標路徑存在
if (-not (Test-Path $TargetDir)) {
    Write-Host "[INFO] 建立目標目錄: $TargetDir" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
}

$PluginsDestDir = Join-Path $TargetDir "plugins"
$PluginsPkgDestDir = Join-Path $TargetDir "plugins-packages"

if ($Clean) {
    Write-Host "[INFO] 正在清理目標目錄舊版產物..." -ForegroundColor Yellow
    if (Test-Path $PluginsDestDir) {
        Remove-Item -Path $PluginsDestDir -Recurse -Force
    }
    if (Test-Path $PluginsPkgDestDir) {
        Remove-Item -Path $PluginsPkgDestDir -Recurse -Force
    }
}

if (-not (Test-Path $PluginsDestDir)) {
    New-Item -ItemType Directory -Path $PluginsDestDir -Force | Out-Null
}
if (-not (Test-Path $PluginsPkgDestDir)) {
    New-Item -ItemType Directory -Path $PluginsPkgDestDir -Force | Out-Null
}

# 2. 打包本體執行檔 (Portable Release)
if (-not $SkipBuild) {
    Write-Host "`n>>> [1/2] 開始編譯免安裝版主體執行檔..." -ForegroundColor Green
    $BuildReleaseScript = Join-Path $ScriptDir "build-release.ps1"
    if (-not (Test-Path $BuildReleaseScript)) {
        throw "找不到主體打包腳本: $BuildReleaseScript"
    }
    & $BuildReleaseScript -PortableOnly
    if ($LASTEXITCODE -ne 0) {
        throw "主體打包失敗，退出碼: $LASTEXITCODE"
    }

    # 尋找產出的主體執行檔
    $ReleaseArtifactsDir = Join-Path $ProjectRoot "release-artifacts"
    $CopiedCore = $false

    if ($IsWindows) {
        $sourceExe = Join-Path $ReleaseArtifactsDir "rust-file-manager-portable-windows-x64.exe"
        if (-not (Test-Path $sourceExe)) {
            $cargoTarget = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $ProjectRoot "src-tauri/target" }
            $candidate = Join-Path $cargoTarget "release/rust-file-manager.exe"
            if (Test-Path $candidate) { $sourceExe = $candidate }
        }

        if (Test-Path $sourceExe) {
            $destExe = Join-Path $TargetDir "rust-file-manager.exe"
            $destPortableExe = Join-Path $TargetDir "rust-file-manager-portable-windows-x64.exe"
            Copy-Item -Path $sourceExe -Destination $destExe -Force
            Copy-Item -Path $sourceExe -Destination $destPortableExe -Force
            Write-Host "   ✔ 已複製主體執行檔至: $destExe" -ForegroundColor Cyan
            $CopiedCore = $true
        }
    } else {
        $osTag = if ($IsMacOS) { "macos" } else { "linux" }
        $sourceBin = Join-Path $ReleaseArtifactsDir "rust-file-manager-portable-$osTag"
        if (-not (Test-Path $sourceBin)) {
            $cargoTarget = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $ProjectRoot "src-tauri/target" }
            $candidate = Join-Path $cargoTarget "release/rust-file-manager"
            if (Test-Path $candidate) { $sourceBin = $candidate }
        }

        if (Test-Path $sourceBin) {
            $destBin = Join-Path $TargetDir "rust-file-manager"
            Copy-Item -Path $sourceBin -Destination $destBin -Force
            if (Get-Command chmod -ErrorAction SilentlyContinue) {
                chmod +x $destBin
            }
            Write-Host "   ✔ 已複製主體執行檔至: $destBin" -ForegroundColor Cyan
            $CopiedCore = $true
        }
    }

    if (-not $CopiedCore) {
        Write-Host "   [WARN] 未能找到編譯產物主體執行檔，請檢查 release-artifacts 目錄！" -ForegroundColor Yellow
    }
} else {
    Write-Host "`n>>> [1/2] 略過主體編譯 (--SkipBuild)" -ForegroundColor Gray
}

# 3. 打包所有獨立外掛
if (-not $SkipPlugins) {
    Write-Host "`n>>> [2/2] 開始打包所有獨立外掛 (.rfmp 套件包)..." -ForegroundColor Green
    $BuildPluginsScript = Join-Path $ScriptDir "build-plugins.ps1"
    if (-not (Test-Path $BuildPluginsScript)) {
        throw "找不到外掛打包腳本: $BuildPluginsScript"
    }

    $ArtifactPluginsDir = Join-Path $ProjectRoot "release-artifacts/plugins"
    & $BuildPluginsScript -OutputDir $ArtifactPluginsDir
    if ($LASTEXITCODE -ne 0) {
        throw "外掛打包失敗，退出碼: $LASTEXITCODE"
    }

    # 複製 .rfmp 安裝套件至 $TargetDir/plugins-packages
    $rfmpFiles = Get-ChildItem -Path $ArtifactPluginsDir -Filter "*.rfmp"
    foreach ($rfmp in $rfmpFiles) {
        Copy-Item -Path $rfmp.FullName -Destination $PluginsPkgDestDir -Force
        Write-Host "   ✔ [套件包] $($rfmp.Name) -> $PluginsPkgDestDir" -ForegroundColor Cyan
    }

    # 解壓縮並同步外掛至 $TargetDir/plugins/<plugin_id>/ 供開箱即用
    $PluginsSrcDir = Join-Path $ProjectRoot "plugins"
    if (Test-Path $PluginsSrcDir) {
        $pluginFolders = Get-ChildItem -Path $PluginsSrcDir -Directory
        foreach ($folder in $pluginFolders) {
            $manifestPath = Join-Path $folder.FullName "plugin.json"
            if (-not (Test-Path $manifestPath)) { continue }

            $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
            $pluginId = $manifest.id

            $destPluginFolder = Join-Path $PluginsDestDir $pluginId
            if (Test-Path $destPluginFolder) {
                Remove-Item -Path $destPluginFolder -Recurse -Force
            }
            New-Item -ItemType Directory -Path $destPluginFolder -Force | Out-Null

            # 複製外掛目錄所有內容
            Copy-Item -Path "$($folder.FullName)\*" -Destination $destPluginFolder -Recurse -Force

            # 確保進入點 index.js 存在 (若尚未編譯 index.js，以入口原始碼封裝)
            $destIndexJs = Join-Path $destPluginFolder "index.js"
            if (-not (Test-Path $destIndexJs)) {
                $srcTs = Get-ChildItem -Path $folder.FullName -Filter "*.ts*"
                if ($srcTs.Count -gt 0) {
                    $header = "/* RFM Standalone Plugin: $pluginId v$($manifest.version) */`n"
                    $srcContent = Get-Content $srcTs[0].FullName -Raw
                    Set-Content -Path $destIndexJs -Value ($header + $srcContent) -Encoding utf8
                }
            }

            Write-Host "   ✔ [已安裝外掛] $pluginId ($($manifest.name)) -> $destPluginFolder" -ForegroundColor Green
        }
    }
} else {
    Write-Host "`n>>> [2/2] 略過外掛打包 (--SkipPlugins)" -ForegroundColor Gray
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " 本地打包與部署完成！" -ForegroundColor Green
Write-Host " 部署目錄: $TargetDir" -ForegroundColor Green
if ($IsWindows) {
    Write-Host " 啟動執行檔: $(Join-Path $TargetDir 'rust-file-manager.exe')" -ForegroundColor Green
} else {
    Write-Host " 啟動執行檔: $(Join-Path $TargetDir 'rust-file-manager')" -ForegroundColor Green
}
Write-Host " 外掛目錄: $PluginsDestDir" -ForegroundColor Green
Write-Host " 外掛安裝包: $PluginsPkgDestDir" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
