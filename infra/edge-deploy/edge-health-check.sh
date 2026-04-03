#!/usr/bin/env bash
set -euo pipefail

HOST=${EDGE_HOST:-localhost}
PORT=${EDGE_PORT:-3000}
echo "Edge health check: ${HOST}:${PORT}"
if command -v curl >/dev/null 2>&1; then
  curl -sS "http://${HOST}:${PORT}/health" | sed 's/^/EDGE-HEALTH: /'
else
  echo "curl not available; skipping HTTP health check."
fi
