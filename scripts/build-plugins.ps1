# ==============================================================================
# Rust File Manager - 外掛獨立打包腳本 (Build & Package Standalone RFM Plugins)
# ==============================================================================
[CmdletBinding()]
param (
    [string]$PluginName = "",
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ProjectRoot = Split-Path -Parent $ScriptDir
$PluginsSrcDir = Join-Path $ProjectRoot "plugins"

if (-not (Test-Path $PluginsSrcDir)) {
    Write-Error "找不到 plugins 目錄: $PluginsSrcDir"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $ProjectRoot "release-artifacts/plugins"
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$PluginFolders = if (-not [string]::IsNullOrWhiteSpace($PluginName)) {
    $target = Join-Path $PluginsSrcDir $PluginName
    if (-not (Test-Path $target)) {
        Write-Error "找不到指定之外掛目錄: $target"
        exit 1
    }
    Get-Item $target
} else {
    Get-ChildItem -Path $PluginsSrcDir -Directory
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " 開始打包 Rust File Manager 獨立外掛 (.rfmp 套件包)" -ForegroundColor Cyan
Write-Host " 來源目錄: $PluginsSrcDir" -ForegroundColor Gray
Write-Host " 輸出目錄: $OutputDir" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

$SuccessCount = 0

foreach ($folder in $PluginFolders) {
    $manifestPath = Join-Path $folder.FullName "plugin.json"
    if (-not (Test-Path $manifestPath)) {
        Write-Host "略過無 plugin.json 之目錄: $($folder.Name)" -ForegroundColor Yellow
        continue
    }

    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $pluginId = $manifest.id
    $version = $manifest.version
    $pkgName = "$pluginId-v$version.rfmp"
    $pkgDest = Join-Path $OutputDir $pkgName

    Write-Host "-> 正在打包 [$($manifest.name)] ($pluginId v$version)..." -ForegroundColor Green

    # 建立臨時打包暫存區
    $tempStaging = Join-Path ([System.IO.Path]::GetTempPath()) "rfm_pkg_$([guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $tempStaging -Force | Out-Null

    try {
        # 複製 plugin.json
        Copy-Item -Path $manifestPath -Destination (Join-Path $tempStaging "plugin.json")

        # 複製該外掛目錄下所有程式碼檔案
        Get-ChildItem -Path $folder.FullName -File | Where-Object { $_.Name -ne "plugin.json" } | ForEach-Object {
            Copy-Item -Path $_.FullName -Destination $tempStaging
        }

        # 產出外掛進入點 index.js (若尚未編譯，將入口原始碼作為發布封裝)
        $indexPath = Join-Path $tempStaging "index.js"
        if (-not (Test-Path $indexPath)) {
            $srcFiles = Get-ChildItem -Path $folder.FullName -Filter "*.ts*"
            if ($srcFiles.Count -gt 0) {
                # 建立獨立自包含外掛載入包
                $mainSrc = Get-Content $srcFiles[0].FullName -Raw
                $bundleHeader = "/* RFM Standalone Plugin: $pluginId v$version */`n"
                Set-Content -Path $indexPath -Value ($bundleHeader + $mainSrc) -Encoding utf8
            }
        }

        if (Test-Path $pkgDest) {
            Remove-Item -Path $pkgDest -Force
        }

        # 打包為標準 .rfmp (zip 壓縮格式)
        Compress-Archive -Path "$tempStaging\*" -DestinationPath $pkgDest -Force

        $zipSize = (Get-Item $pkgDest).Length
        Write-Host "   ✔ 已產出: $pkgName ($([math]::Round($zipSize / 1KB, 2)) KB)" -ForegroundColor Cyan
        $SuccessCount++
    }
    finally {
        if (Test-Path $tempStaging) {
            Remove-Item -Path $tempStaging -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "`n打包完成！共成功產出 $SuccessCount 個獨立外掛套件包。" -ForegroundColor Green
Write-Host "產物目錄: $OutputDir" -ForegroundColor Green
