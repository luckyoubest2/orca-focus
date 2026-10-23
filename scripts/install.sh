#!/usr/bin/env bash
# Install orca-focus into Orca Note's plugin directory.
# Usage: bash scripts/install.sh [dataDir]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${1:-$HOME/Documents/orca}"
TARGET="$DATA_DIR/plugins/orca-focus"

if [[ ! -f "$ROOT/dist/index.js" ]]; then
  echo "dist/index.js not found. Run: npm install && npm run build" >&2
  exit 1
fi

mkdir -p "$TARGET"
cp -R "$ROOT/dist" "$TARGET/"
cp "$ROOT/icon.png" "$TARGET/"
cp "$ROOT/package.json" "$TARGET/"
cp "$ROOT/README.md" "$TARGET/"
cp "$ROOT/LICENSE" "$TARGET/"

echo "Installed to: $TARGET"
echo "Next: restart Orca Note, enable “orca-focus” in Settings → Plugins,"
echo "then right-click a block handle → 插件命令 → 开始专注，或点顶栏 ⏱ 打开计时面板。"
