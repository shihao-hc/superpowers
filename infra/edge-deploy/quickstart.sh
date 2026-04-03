#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "Edge Deployment Quick Start"
echo "=========================================="

# Step 1: Build and start services
echo "[1/4] Starting services with docker-compose..."
docker-compose -f docker/docker-compose.yml up -d --build

# Step 2: Check health
echo "[2/4] Checking health endpoints..."
curl -sS http://localhost:3000/health && echo " health OK"

# Step 3: Run edge health checks
echo "[3/4] Running edge health checks..."
bash infra/edge-deploy/edge-final-check.sh

# Step 4: Summary
echo "[4/4] Deployment complete!"
echo "Access the platform at http://localhost:3000/"
echo "Health check: http://localhost:3000/health"
