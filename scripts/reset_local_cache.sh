#!/usr/bin/env bash
set -euo pipefail

# リポジトリルートに移動
cd "$(dirname "$0")/.."

echo "[reset] stopping compose (if running)..."
docker compose down 2>/dev/null || true

echo "[reset] checking for root-owned files in .docker-cache..."
if [ -d ".docker-cache" ]; then
    root_files=$(find .docker-cache -user root 2>/dev/null | head -5 || true)
    if [ -n "$root_files" ]; then
        echo "[reset] WARNING: root-owned files found:"
        echo "$root_files"
        echo ""
        echo "[reset] Please run manually:"
        echo "  sudo rm -rf .docker-cache"
        echo "Then run this script again."
        exit 1
    fi
    echo "[reset] removing local cache dir..."
    rm -rf .docker-cache
fi

echo "[reset] recreating local cache dir..."
mkdir -p .docker-cache/npm .docker-cache/hugo

echo "[reset] verifying ownership..."
ls -la .docker-cache/

echo "[reset] done."
echo ""
echo "You can now run: docker compose up -d"
