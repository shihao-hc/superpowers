#!/usr/bin/env bash
set -euo pipefail

echo "[Edge Deploy] Starting deployment..."
echo "Using docker-compose by default. Ports: 80 for public, 3000 for app."
docker-compose -f docker/docker-compose.yml up -d --build
echo "Deployment started. Check http://localhost:80 and http://localhost:3000/"
