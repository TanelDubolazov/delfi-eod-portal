#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE_BIN="$ROOT_DIR/node/bin/node"

if [ ! -x "$NODE_BIN" ]; then
  echo "Portable Node not found: $NODE_BIN"
  exit 1
fi

if [ ! -f "$ROOT_DIR/admin/fe/dist/index.html" ]; then
  echo "Missing admin frontend build at admin/fe/dist/index.html"
  exit 1
fi

if [ ! -f "$ROOT_DIR/web/dist/index.html" ]; then
  echo "Missing public site build at web/dist/index.html"
  exit 1
fi

"$NODE_BIN" "$ROOT_DIR/admin/be/index.js" &
ADMIN_PID=$!

"$NODE_BIN" "$ROOT_DIR/scripts/runtime/site-server.mjs" &
SITE_PID=$!

cleanup() {
  kill "$ADMIN_PID" "$SITE_PID" 2>/dev/null || true
}

trap cleanup INT TERM EXIT

echo
echo "Admin portal: http://localhost:3001"
echo "Public site:  http://localhost:4321"
echo
echo "Press Ctrl+C to stop"

wait "$ADMIN_PID" "$SITE_PID"
