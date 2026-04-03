#!/usr/bin/env bash
set -euo pipefail

HOST=${EDGE_HOST:-localhost}
PORT=${EDGE_PORT:-3000}
echo "[Edge Health Extended 2] Checking endpoints on ${HOST}:${PORT}"
for ep in health; do
  start=$(date +%s%3N)
  if curl -sS http://${HOST}:${PORT}/${ep} >/dev/null; then
    end=$(date +%s%3N)
    echo "EDGE-OK: /${ep} latency=${end-start}ms"
  else
    echo "EDGE-ERR: /${ep}"
  fi
done
