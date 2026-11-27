#!/usr/bin/env bash
# ==============================================================================
# Rust File Manager - 外掛獨立打包腳本 (Bash 版)
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PLUGINS_SRC_DIR="$PROJECT_ROOT/plugins"
OUTPUT_DIR="${1:-$PROJECT_ROOT/release-artifacts/plugins}"

mkdir -p "$OUTPUT_DIR"

echo "=========================================================="
echo " 開始打包 Rust File Manager 獨立外掛 (.rfmp 套件包)"
echo " 來源目錄: $PLUGINS_SRC_DIR"
echo " 輸出目錄: $OUTPUT_DIR"
echo "=========================================================="

SUCCESS_COUNT=0

for plugin_dir in "$PLUGINS_SRC_DIR"/*; do
  if [ -d "$plugin_dir" ] && [ -f "$plugin_dir/plugin.json" ]; then
    plugin_name="$(basename "$plugin_dir")"
    echo "-> 正在打包 $plugin_name..."
    
    pkg_name="rfm.preview.${plugin_name}-v1.0.0.rfmp"
    pkg_dest="$OUTPUT_DIR/$pkg_name"
    
    (cd "$plugin_dir" && tar -a -cf "$pkg_dest" ./*)
    echo "   ✔ 已產出: $pkg_name"
    SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
  fi
done

echo ""
echo "打包完成！共成功產出 $SUCCESS_COUNT 個獨立外掛套件包。"
echo "產物目錄: $OUTPUT_DIR"
