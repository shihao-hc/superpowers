#!/usr/bin/env bash
set -euo pipefail

HOST=${EDGE_HOST:-localhost}
PORT=${EDGE_PORT:-3000}
echo "[Edge Health 2] Checking endpoints on ${HOST}:${PORT}"
ENDPOINTS=(health api/infer)
for ep in "${ENDPOINTS[@]}"; do
  if curl -sS http://${HOST}:${PORT}/${ep} >/dev/null; then
    echo "EDGE-OK: /${ep}"
  else
    echo "EDGE-ERR: /${ep}"
  fi
done
