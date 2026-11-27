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

# 確保本地 node_modules 與 Tauri CLI 存在，若不存在則自動執行 npm install
if [[ ! -f "${PROJECT_ROOT}/node_modules/.bin/tauri" ]]; then
  echo "[INFO] 未偵測到本機 node_modules 或 Tauri CLI，自動執行 npm install..."
  (cd "${PROJECT_ROOT}" && npm install --no-fund --no-audit)
fi

PORTABLE_ONLY=0
INCLUDE_PORTABLE=0
BUNDLES="all"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --portable-only)
      PORTABLE_ONLY=1
      shift
      ;;
    --include-portable)
      INCLUDE_PORTABLE=1
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
  --include-portable   打包安裝套件同時匯出免安裝執行檔至 release-artifacts/
  --bundles <FORMAT>   指定打包格式 (例如: deb, rpm, appimage, dmg, msi)
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

if [[ -n "${CARGO_TARGET_DIR:-}" ]]; then
  TARGET_BUILD_DIR="${CARGO_TARGET_DIR}"
else
  TARGET_BUILD_DIR="${PROJECT_ROOT}/src-tauri/target"
fi

# 磁碟空間前置健康檢查 (Pre-flight disk space check)
check_disk_space() {
  local target_dir="${1}"
  mkdir -p "${target_dir}" 2>/dev/null || true
  if command -v df >/dev/null 2>&1; then
    local free_kb
    free_kb=$(df -k "${target_dir}" 2>/dev/null | awk 'NR==2 {print $4}')
    if [[ -n "${free_kb}" ]]; then
      local free_mb=$((free_kb / 1024))
      local free_gb
      free_gb=$(awk "BEGIN {printf \"%.2f\", ${free_kb}/1048576}")

      if [[ "${free_mb}" -lt 2048 ]]; then
        echo "" >&2
        echo "============================================================" >&2
        echo "[ERROR] 編譯目標磁區剩餘空間嚴重不足 (僅剩 ${free_gb} GB / ${free_mb} MB)！" >&2
        echo "[HINT]  Tauri / Rust Release 發行版編譯與 LTO 連結需要大量暫存空間，至少需 3~5 GB。" >&2
        echo "[HINT]  為防寫入中斷 (no space on device)，請先採取以下措施：" >&2
        echo "        1. 清理本專案快取: cd src-tauri && cargo clean" >&2
        echo "        2. 或指定其他大容量磁區: export CARGO_TARGET_DIR=/path/to/target" >&2
        echo "============================================================" >&2
        exit 1
      elif [[ "${free_mb}" -lt 5120 ]]; then
        echo "[WARN]  編譯目標磁區剩餘空間偏低 (僅剩 ${free_gb} GB)，建議預留至少 5~10 GB 供發行版連結與符號檔產生。"
      else
        echo "[INFO]  磁碟前置檢查正常：目標磁區可用空間 ${free_gb} GB"
      fi
    fi
  fi
}

handle_build_failure() {
  local exit_code=$?
  if [[ $exit_code -ne 0 ]]; then
    if command -v df >/dev/null 2>&1; then
      local free_kb
      free_kb=$(df -k "${TARGET_BUILD_DIR}" 2>/dev/null | awk 'NR==2 {print $4}')
      if [[ -n "${free_kb}" ]]; then
        local free_mb=$((free_kb / 1024))
        if [[ "${free_mb}" -lt 1024 ]]; then
          echo "" >&2
          echo "============================================================" >&2
          echo "[CRITICAL] 偵測到編譯磁區剩餘空間極低 (僅剩 ${free_mb} MB)！" >&2
          echo "[HINT]     本次編譯失敗極可能由磁碟空間耗盡 (no space on device) 引起。" >&2
          echo "[HINT]     建議採取以下措施釋放空間或重定向快取：" >&2
          echo "           1. 清理本專案快取: cd src-tauri && cargo clean" >&2
          echo "           2. 或將編譯目錄指向更大容量之磁區: export CARGO_TARGET_DIR=/path/to/target" >&2
          echo "============================================================" >&2
        fi
      fi
    fi
  fi
}
trap handle_build_failure EXIT

check_disk_space "${TARGET_BUILD_DIR}"

if [[ -n "${CARGO_TARGET_DIR:-}" && -d "${CARGO_TARGET_DIR}/release" ]]; then
  RELEASE_DIR="${CARGO_TARGET_DIR}/release"
else
  RELEASE_DIR="${PROJECT_ROOT}/src-tauri/target/release"
fi
BUNDLE_DIR="${RELEASE_DIR}/bundle"
rm -rf "${BUNDLE_DIR}"

echo "[INFO] 開始編譯 Rust File Manager 正式發行版 (Release Build)..."
cd "${PROJECT_ROOT}"

if [[ "${PORTABLE_ONLY}" -eq 1 ]]; then
  npm run tauri -- build --no-bundle
elif [[ "${BUNDLES}" != "all" ]]; then
  npm run tauri -- build --bundles "${BUNDLES}"
else
  npm run tauri -- build
fi

rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

if [[ -n "${CARGO_TARGET_DIR:-}" && -d "${CARGO_TARGET_DIR}/release" ]]; then
  RELEASE_DIR="${CARGO_TARGET_DIR}/release"
else
  RELEASE_DIR="${PROJECT_ROOT}/src-tauri/target/release"
fi
BUNDLE_DIR="${RELEASE_DIR}/bundle"
OS_NAME="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH_NAME="$(uname -m)"

# 1. 複製免安裝單一執行檔 (僅於 --portable-only 或 --include-portable 時匯出)
if [[ "${PORTABLE_ONLY}" -eq 1 || "${INCLUDE_PORTABLE}" -eq 1 ]]; then
  if [[ -f "${RELEASE_DIR}/rust-file-manager.exe" ]]; then
    cp "${RELEASE_DIR}/rust-file-manager.exe" "${OUT_DIR}/rust-file-manager-portable-windows-${ARCH_NAME}.exe"
  elif [[ -f "${RELEASE_DIR}/rust-file-manager" ]]; then
    cp "${RELEASE_DIR}/rust-file-manager" "${OUT_DIR}/rust-file-manager-portable-${OS_NAME}-${ARCH_NAME}"
    chmod +x "${OUT_DIR}/rust-file-manager-portable-${OS_NAME}-${ARCH_NAME}"
  fi
fi

# 2. 複製各平台系統原生安裝包
if [[ "${PORTABLE_ONLY}" -ne 1 && -d "${BUNDLE_DIR}" ]]; then
  if [[ "${OS_NAME}" == "darwin" ]]; then
    find "${BUNDLE_DIR}" -maxdepth 3 -type f -name "*.dmg" -exec cp {} "${OUT_DIR}/" \;
  elif [[ "${OS_NAME}" =~ (mingw|msys|cygwin) ]]; then
    find "${BUNDLE_DIR}" -maxdepth 3 -type f -name "*.msi" -exec cp {} "${OUT_DIR}/" \;
  else
    find "${BUNDLE_DIR}" -maxdepth 3 -type f \( \
      -name "*.deb" -o \
      -name "*.rpm" -o \
      -name "*.AppImage" \
    \) -exec cp {} "${OUT_DIR}/" \;
  fi
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
