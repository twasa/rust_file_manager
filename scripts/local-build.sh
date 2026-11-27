#!/usr/bin/env bash
# ==============================================================================
# local-build.sh — Rust File Manager 本地打包與部署腳本 (Bash 版)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# 判定目標部署路徑
DESTINATION="${1:-}"
if [ -n "$DESTINATION" ]; then
  TARGET_DIR="$DESTINATION"
elif [ -n "${RFM_HOME:-}" ]; then
  TARGET_DIR="$RFM_HOME"
else
  TARGET_DIR="$HOME/RFM"
fi

echo "=========================================================="
echo " Rust File Manager 本地打包與部署 (Local Build & Deploy)"
echo " 專案根目錄: $PROJECT_ROOT"
echo " 目標部署目錄: $TARGET_DIR"
echo "=========================================================="

mkdir -p "$TARGET_DIR"
PLUGINS_DEST_DIR="$TARGET_DIR/plugins"
PLUGINS_PKG_DEST_DIR="$TARGET_DIR/plugins-packages"
mkdir -p "$PLUGINS_DEST_DIR" "$PLUGINS_PKG_DEST_DIR"

# 1. 編譯主體執行檔 (Portable)
echo ""
echo ">>> [1/2] 開始編譯免安裝版主體執行檔..."
"$SCRIPT_DIR/build-release.sh" --portable-only

RELEASE_ARTIFACTS_DIR="$PROJECT_ROOT/release-artifacts"
OS_TAG="linux"
if [[ "$OSTYPE" == "darwin"* ]]; then
  OS_TAG="macos"
fi

SRC_BIN="$RELEASE_ARTIFACTS_DIR/rust-file-manager-portable-$OS_TAG"
if [ ! -f "$SRC_BIN" ]; then
  CARGO_TARGET="${CARGO_TARGET_DIR:-$PROJECT_ROOT/src-tauri/target}"
  CANDIDATE="$CARGO_TARGET/release/rust-file-manager"
  if [ -f "$CANDIDATE" ]; then
    SRC_BIN="$CANDIDATE"
  fi
fi

if [ -f "$SRC_BIN" ]; then
  cp "$SRC_BIN" "$TARGET_DIR/rust-file-manager"
  chmod +x "$TARGET_DIR/rust-file-manager"
  echo "   ✔ 已複製主體執行檔至: $TARGET_DIR/rust-file-manager"
else
  echo "   [WARN] 未找到主體執行檔: $SRC_BIN"
fi

# 2. 打包外掛
echo ""
echo ">>> [2/2] 開始打包所有獨立外掛..."
"$SCRIPT_DIR/build-plugins.sh" "$PROJECT_ROOT/release-artifacts/plugins"

# 複製 .rfmp 安裝套件
for pkg in "$PROJECT_ROOT/release-artifacts/plugins"/*.rfmp; do
  if [ -f "$pkg" ]; then
    cp "$pkg" "$PLUGINS_PKG_DEST_DIR/"
    echo "   ✔ [套件包] $(basename "$pkg") -> $PLUGINS_PKG_DEST_DIR"
  fi
done

# 同步已安裝外掛目錄
if [ -d "$PROJECT_ROOT/plugins" ]; then
  for pdir in "$PROJECT_ROOT/plugins"/*; do
    if [ -d "$pdir" ] && [ -f "$pdir/plugin.json" ]; then
      pid="$(basename "$pdir")"
      target_pdir="$PLUGINS_DEST_DIR/$pid"
      mkdir -p "$target_pdir"
      cp -r "$pdir"/* "$target_pdir/"
      echo "   ✔ [已安裝外掛] $pid -> $target_pdir"
    fi
  done
fi

echo ""
echo "=========================================================="
echo " 本地打包與部署完成！"
echo " 部署目錄: $TARGET_DIR"
echo " 執行檔: $TARGET_DIR/rust-file-manager"
echo " 外掛目錄: $PLUGINS_DEST_DIR"
echo " 外掛套件包: $PLUGINS_PKG_DEST_DIR"
echo "=========================================================="
