#!/usr/bin/env bash
set -euo pipefail

HOST=${EDGE_HOST:-localhost}
PORT=${EDGE_PORT:-3000}
echo "[Edge Health Extend] Endpoint latency checks on ${HOST}:${PORT}"
for ep in health api/infer; do
  start=$(date +%s%3N)
  curl -sS http://${HOST}:${PORT}/${ep} >/dev/null
  end=$(date +%s%3N)
  echo "${ep} latency_ms: $((end - start))"
done
