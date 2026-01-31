#!/usr/bin/env bash
set -euo pipefail

cd /work

# npm キャッシュ先（bind mount した /cache を使う）
mkdir -p /cache/npm
npm config set cache /cache/npm >/dev/null 2>&1 || true

# Node ビルドが必要なテーマ/パイプライン対応:
# - package-lock.json があれば npm ci
# - それ以外で package.json があれば npm install
if [ -f package-lock.json ]; then
  if [ ! -d node_modules ] || [ "${FORCE_NPM_CI:-0}" = "1" ]; then
    echo "[entrypoint] npm ci ..."
    npm ci
  fi
elif [ -f package.json ]; then
  if [ ! -d node_modules ] || [ "${FORCE_NPM_INSTALL:-0}" = "1" ]; then
    echo "[entrypoint] npm install ..."
    npm install
  fi
fi

exec "$@"
