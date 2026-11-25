#!/usr/bin/env bash
# ==============================================================================
# setup-dev-env.sh — Rust File Manager (Tauri 2.x) 跨平台開發環境自動化安裝腳本
# 支援平台: Linux (Debian/Ubuntu, Fedora/RHEL, Arch), macOS (Darwin), Windows (Git Bash / MSYS2)
#
# 使用方式:
#   ./scripts/setup-dev-env.sh                      # 完整安裝 OS 依賴 + 定版 Rust / Node.js + npm install
#   ./scripts/setup-dev-env.sh --check-only         # 僅檢查目前系統環境與版本，不執行安裝
#   ./scripts/setup-dev-env.sh --skip-system-deps   # 略過需要 sudo 的作業系統套件安裝
#   RUST_VERSION=1.100.0 NODE_VERSION=26.13.1 ./scripts/setup-dev-env.sh
# ==============================================================================

set -euo pipefail

# ------------------------------------------------------------------------------
# 1. 官方發行穩定版定版變數 (Pinned Versions — 可由外部環境變數覆寫)
# ------------------------------------------------------------------------------
RUST_VERSION="${RUST_VERSION:-1.100.0}"
NODE_VERSION="${NODE_VERSION:-26.13.1}"
FNM_VERSION="${FNM_VERSION:-1.39.0}"
TAURI_CLI_VERSION="${TAURI_CLI_VERSION:-2.2.0}"

SKIP_SYSTEM_DEPS=0
SKIP_NPM_INSTALL=0
CHECK_ONLY=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-system-deps)
      SKIP_SYSTEM_DEPS=1
      shift
      ;;
    --skip-npm-install)
      SKIP_NPM_INSTALL=1
      shift
      ;;
    --check-only)
      CHECK_ONLY=1
      shift
      ;;
    -h|--help)
      cat <<EOF
Usage: ./scripts/setup-dev-env.sh [OPTIONS]

Options:
  --check-only         僅檢查環境與定版工具狀態，不進行安裝
  --skip-system-deps   略過作業系統層級套件 (apt/dnf/pacman/xcode/winget) 安裝
  --skip-npm-install   略過專案目錄下的 npm install
  -h, --help           顯示此說明

可覆寫之定版環境變數 (預設為官方穩定版):
  RUST_VERSION         (預設: ${RUST_VERSION})
  NODE_VERSION         (預設: ${NODE_VERSION})
  FNM_VERSION          (預設: ${FNM_VERSION})
  TAURI_CLI_VERSION    (預設: ${TAURI_CLI_VERSION})
EOF
      exit 0
      ;;
    *)
      echo "[ERROR] 未知的參數: $1 (請使用 --help 查看說明)" >&2
      exit 1
      ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log_info()  { printf '\033[1;34m[INFO]\033[0m  %s\n' "$*"; }
log_ok()    { printf '\033[1;32m[OK]\033[0m    %s\n' "$*"; }
log_warn()  { printf '\033[1;33m[WARN]\033[0m  %s\n' "$*"; }
log_error() { printf '\033[1;31m[ERROR]\033[0m %s\n' "$*" >&2; }

# ------------------------------------------------------------------------------
# 2. 偵測作業系統與處理器架構
# ------------------------------------------------------------------------------
OS_RAW="$(uname -s)"
ARCH_RAW="$(uname -m)"

case "${OS_RAW}" in
  Linux*)   OS_TYPE="linux" ;;
  Darwin*)  OS_TYPE="macos" ;;
  MINGW*|MSYS*|CYGWIN*) OS_TYPE="windows" ;;
  *)
    log_error "不支援的作業系統: ${OS_RAW}"
    exit 1
    ;;
esac

log_info "=========================================================="
log_info "Rust File Manager 開發環境安裝與檢核 (${OS_TYPE} / ${ARCH_RAW})"
log_info "目標定版設定:"
log_info "  - RUST_VERSION      = ${RUST_VERSION}"
log_info "  - NODE_VERSION      = v${NODE_VERSION}"
log_info "  - FNM_VERSION       = v${FNM_VERSION}"
log_info "  - TAURI_CLI_VERSION = ^${TAURI_CLI_VERSION}"
log_info "=========================================================="

# 載入既有 Cargo 與 fnm PATH
export PATH="${HOME}/.cargo/bin:${HOME}/.local/share/fnm:${PATH}"

if [[ "${CHECK_ONLY}" -eq 1 ]]; then
  log_info "執行環境唯讀檢核 (--check-only)..."
  rustc --version || log_warn "rustc 尚未安裝"
  cargo --version || log_warn "cargo 尚未安裝"
  fnm --version   || log_warn "fnm 尚未安裝"
  node --version  || log_warn "node 尚未安裝"
  npm --version   || log_warn "npm 尚未安裝"
  if command -v df >/dev/null 2>&1; then
    free_kb=$(df -k "${PROJECT_ROOT}" 2>/dev/null | awk 'NR==2 {print $4}')
    if [[ -n "${free_kb}" ]]; then
      free_gb=$(awk "BEGIN {printf \"%.2f\", ${free_kb}/1048576}")
      log_ok "disk     : 專案磁區可用空間 ${free_gb} GB"
    fi
  fi
  exit 0
fi

# ------------------------------------------------------------------------------
# 3. 安裝作業系統層級 Tauri 2.x 建置依賴 (Linux / macOS / Windows)
# ------------------------------------------------------------------------------
install_linux_deps() {
  if command -v apt-get >/dev/null 2>&1; then
    log_info "偵測到 Debian / Ubuntu (apt)，正在安裝 Tauri 2.x WebKitGTK 與編譯依賴..."
    sudo apt-get update
    sudo apt-get install -y \
      libwebkit2gtk-4.1-dev \
      build-essential \
      curl \
      wget \
      file \
      unzip \
      libxdo-dev \
      libssl-dev \
      libayatana-appindicator3-dev \
      librsvg2-dev \
      pkg-config
  elif command -v dnf >/dev/null 2>&1; then
    log_info "偵測到 Fedora / RHEL (dnf)，正在安裝 Tauri 2.x WebKitGTK 與編譯依賴..."
    sudo dnf install -y \
      webkit2gtk4.1-devel \
      openssl-devel \
      curl \
      wget \
      file \
      unzip \
      libappindicator-gtk3-devel \
      librsvg2-devel \
      libxdo-devel \
      gcc \
      gcc-c++ \
      make \
      pkgconf-pkg-config
  elif command -v pacman >/dev/null 2>&1; then
    log_info "偵測到 Arch Linux (pacman)，正在安裝 Tauri 2.x 系統依賴..."
    sudo pacman -Syu --needed --noconfirm \
      webkit2gtk-4.1 \
      base-devel \
      curl \
      wget \
      file \
      unzip \
      openssl \
      appmenu-gtk-module \
      libappindicator-gtk3 \
      librsvg \
      xdotool
  else
    log_warn "未能自動識別 Linux 套件管理器，請手動確認已安裝 webkit2gtk-4.1 與 C/C++ 編譯工具。"
  fi
}

install_macos_deps() {
  log_info "檢查 macOS Xcode Command Line Tools..."
  if ! xcode-select -p >/dev/null 2>&1; then
    log_info "正在觸發安裝 Xcode Command Line Tools..."
    xcode-select --install || true
  else
    log_ok "Xcode Command Line Tools 已就緒: $(xcode-select -p)"
  fi
}

if [[ "${SKIP_SYSTEM_DEPS}" -eq 0 ]]; then
  case "${OS_TYPE}" in
    linux)   install_linux_deps ;;
    macos)   install_macos_deps ;;
    windows)
      log_info "Windows 環境建議直接執行 ./scripts/setup-dev-env.ps1 以獲得完整 MSVC 與 WebView2 檢查；繼續執行 Bash 工具鏈設定..."
      ;;
  esac
else
  log_info "已略過作業系統層級依賴安裝 (--skip-system-deps)"
fi

# ------------------------------------------------------------------------------
# 4. 安裝並鎖定 Rust 工具鏈版本 (rustup + RUST_VERSION)
# ------------------------------------------------------------------------------
if ! command -v rustup >/dev/null 2>&1; then
  log_info "正在安裝 rustup 並綁定穩定版工具鏈 ${RUST_VERSION}..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain "${RUST_VERSION}" --profile minimal
  export PATH="${HOME}/.cargo/bin:${PATH}"
else
  log_info "rustup 已存在，確保安裝並切換至定版 Rust ${RUST_VERSION}..."
  rustup toolchain install "${RUST_VERSION}" --profile minimal
  rustup default "${RUST_VERSION}"
fi

# 確保安裝 clippy 與 rustfmt 元件
rustup component add clippy rustfmt --toolchain "${RUST_VERSION}" >/dev/null 2>&1 || true
log_ok "Rust 工具鏈就緒: $(rustc --version) / $(cargo --version)"

# ------------------------------------------------------------------------------
# 5. 安裝定版 fnm (Fast Node Manager) 並鎖定 Node.js 版本 (NODE_VERSION)
# ------------------------------------------------------------------------------
install_fnm_binary() {
  local target_zip=""
  case "${OS_TYPE}-${ARCH_RAW}" in
    linux-x86_64)            target_zip="fnm-linux.zip" ;;
    linux-aarch64|linux-arm64) target_zip="fnm-arm64.zip" ;;
    macos-*)                 target_zip="fnm-macos.zip" ;;
    windows-*)               target_zip="fnm-windows.zip" ;;
    *)
      log_error "不支援自動下載 fnm 的平台架構: ${OS_TYPE}-${ARCH_RAW}"
      exit 1
      ;;
  esac

  local download_url="https://github.com/Schniz/fnm/releases/download/v${FNM_VERSION}/${target_zip}"
  local tmp_zip
  tmp_zip="$(mktemp "${TMPDIR:-/tmp}/fnm.XXXXXX.zip")"
  mkdir -p "${HOME}/.cargo/bin"

  log_info "正在下載定版 fnm v${FNM_VERSION} (${download_url})..."
  curl -fsSL "${download_url}" -o "${tmp_zip}"
  unzip -o -q "${tmp_zip}" -d "${HOME}/.cargo/bin"
  chmod +x "${HOME}/.cargo/bin/fnm" 2>/dev/null || true
  rm -f "${tmp_zip}"
}

if ! command -v fnm >/dev/null 2>&1; then
  install_fnm_binary
else
  CURRENT_FNM_VER="$(fnm --version | awk '{print $2}')"
  if [[ "${CURRENT_FNM_VER}" != "${FNM_VERSION}" ]]; then
    log_info "目前 fnm 版本 (${CURRENT_FNM_VER}) 與定版 (${FNM_VERSION}) 不同，更新為定版..."
    install_fnm_binary
  fi
fi

log_info "正在透過 fnm 安裝並鎖定 Node.js v${NODE_VERSION}..."
fnm install "${NODE_VERSION}"
fnm default "${NODE_VERSION}"
eval "$(fnm env --shell bash)"

log_ok "Node.js 工具鏈就緒: node $(node --version) / npm v$(npm --version)"

# ------------------------------------------------------------------------------
# 6. 安裝專案前端依賴 (npm install)
# ------------------------------------------------------------------------------
if [[ "${SKIP_NPM_INSTALL}" -eq 0 && -f "${PROJECT_ROOT}/package.json" ]]; then
  log_info "正在於專案根目錄 (${PROJECT_ROOT}) 安裝前端與 Tauri CLI 套件..."
  (
    cd "${PROJECT_ROOT}"
    npm install
  )
  log_ok "前端與 @tauri-apps/cli 依賴安裝完成"
fi

log_info "=========================================================="
log_ok "所有跨平台開發環境安裝與定版設定已完成！"
log_info "  - Rustc : $(rustc --version)"
log_info "  - Cargo : $(cargo --version)"
log_info "  - Fnm   : $(fnm --version)"
log_info "  - Node  : $(node --version)"
log_info "  - Npm   : v$(npm --version)"
log_info "啟動開發預覽指令: npm run tauri dev"
log_info "=========================================================="
