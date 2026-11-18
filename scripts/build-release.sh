#!/usr/bin/env bash
# ==============================================================================
# build-release.sh — Rust File Manager (Tauri 2.x) 跨平台單一執行檔與安裝包打包腳本
# 支援平台: Linux (.deb / .rpm / .AppImage + Portable)、macOS (.dmg / .app)、Windows (.exe / .msi)
#
# 使用方式:
#   ./scripts/build-release.sh                  # 編譯單一執行檔 + 當前系統所有支援的安裝包
#   ./scripts/build-release.sh --portable-only  # 僅編譯免安裝單一執行檔 (--no-bundle)
#   ./scripts/build-release.sh --bundles deb    # 僅打包特定格式安裝包
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
OUT_DIR="${PROJECT_ROOT}/release-artifacts"

export PATH="${HOME}/.cargo/bin:${HOME}/.local/share/fnm:${PATH}"
if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --shell bash)"
fi

PORTABLE_ONLY=0
BUNDLES="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --portable-only)
      PORTABLE_ONLY=1
      shift
      ;;
    --bundles)
      BUNDLES="${2:-all}"
      shift 2
      ;;
    -h|--help)
      cat <<EOF
Usage: ./scripts/build-release.sh [OPTIONS]

Options:
  --portable-only      僅編譯免安裝單一執行檔 (--no-bundle)
  --bundles <FORMAT>   指定打包格式 (例如: deb, rpm, appimage, dmg, nsis, msi)
  -h, --help           顯示說明
EOF
      exit 0
      ;;
    *)
      echo "[ERROR] 未知參數: $1" >&2
      exit 1
      ;;
  esac
done

echo "[INFO] 開始編譯 Rust File Manager 正式發行版 (Release Build)..."
cd "${PROJECT_ROOT}"

if [[ "${PORTABLE_ONLY}" -eq 1 ]]; then
  npx tauri build --no-bundle
elif [[ "${BUNDLES}" != "all" ]]; then
  npx tauri build --bundles "${BUNDLES}"
else
  npx tauri build
fi

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

RELEASE_DIR="${PROJECT_ROOT}/src-tauri/target/release"
BUNDLE_DIR="${RELEASE_DIR}/bundle"
OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH_NAME="$(uname -m)"

# 1. 複製免安裝單一執行檔
if [[ -f "${RELEASE_DIR}/rust-file-manager.exe" ]]; then
  cp "${RELEASE_DIR}/rust-file-manager.exe" "${OUT_DIR}/rust-file-manager-portable-windows-${ARCH_NAME}.exe"
elif [[ -f "${RELEASE_DIR}/rust-file-manager" ]]; then
  cp "${RELEASE_DIR}/rust-file-manager" "${OUT_DIR}/rust-file-manager-portable-${OS_NAME}-${ARCH_NAME}"
  chmod +x "${OUT_DIR}/rust-file-manager-portable-${OS_NAME}-${ARCH_NAME}"
fi

# 2. 複製安裝包產物
if [[ -d "${BUNDLE_DIR}" ]]; then
  find "${BUNDLE_DIR}" -maxdepth 3 -type f \( \
    -name "*.exe" -o \
    -name "*.msi" -o \
    -name "*.deb" -o \
    -name "*.rpm" -o \
    -name "*.AppImage" -o \
    -name "*.dmg" \
  \) -exec cp {} "${OUT_DIR}/" \;
fi

# 3. 產生 SHA256SUMS.txt
(
  cd "${OUT_DIR}"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum * > SHA256SUMS.txt
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 * > SHA256SUMS.txt
  fi
)

echo "[OK] 打包完成！產物清單 (${OUT_DIR}):"
ls -lh "${OUT_DIR}"
