#!/usr/bin/env bash
# ==============================================================================
# macos-postinstall.sh — Rust File Manager macOS 安裝後解除隔離屬性腳本
# 用途: 解決 macOS Gatekeeper 因未公證/未簽名阻擋執行的問題 (解除 com.apple.quarantine)
#
# 使用方式:
#   chmod +x scripts/macos-postinstall.sh
#   ./scripts/macos-postinstall.sh
#   ./scripts/macos-postinstall.sh ~/Downloads/"Rust File Manager.app"
# ==============================================================================

set -euo pipefail

APP_PATH="${1:-/Applications/Rust File Manager.app}"

if [[ -d "${APP_PATH}" ]]; then
  echo "[INFO] 正在清除 Gatekeeper 隔離屬性: ${APP_PATH}"
  xattr -cr "${APP_PATH}"
  echo "[OK] 已成功解除隔離屬性！您現在可以正常開啟 Rust File Manager。"
else
  echo "[WARN] 找不到應用程式: ${APP_PATH}"
  echo "請確認應用程式已複製至 /Applications 或指定路徑，例如:"
  echo "  ./scripts/macos-postinstall.sh ~/Downloads/\"Rust File Manager.app\""
  exit 1
fi

exit 0
