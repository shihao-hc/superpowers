#!/usr/bin/env bash
set -euo pipefail

HOST=${EDGE_HOST:-localhost}
PORT=${EDGE_PORT:-3000}

echo "[Edge Final Check] Running final checks on ${HOST}:${PORT}"

# Health check
curl -sS http://${HOST}:${PORT}/health && echo " health OK" || echo " health FAIL"

# API check
curl -sS http://${HOST}:${PORT}/api/infer -X POST -H 'Content-Type: application/json' -d '{"text":"final check"}' && echo " api OK" || echo " api FAIL"

echo "[Edge Final Check] Done"
