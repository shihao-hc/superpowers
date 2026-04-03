#!/usr/bin/env bash
set -euo pipefail

HOST=${EDGE_HOST:-localhost}
PORT=${EDGE_PORT:-3000}
NAMES=(health api/infer)
echo "[Edge Health] Checking endpoints on ${HOST}:${PORT}"
for ep in "${NAMES[@]}"; do
  if curl -sS http://${HOST}:${PORT}/${ep} >/dev/null; then
    echo "EDGE-OK: /${ep}"
  else
    echo "EDGE-ERR: /${ep}"
  fi
done
