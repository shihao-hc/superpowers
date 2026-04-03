#!/bin/bash
set -e

echo "=========================================="
echo "  UltraWork AI - Docker 部署"
echo "=========================================="

cd "$(dirname "$0")/.."

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    exit 1
fi

echo "✅ Docker 版本: $(docker --version)"

# 构建并启动
echo ""
echo "🐳 构建 Docker 镜像..."
docker compose -f docker/docker-compose.yml build

echo ""
echo "🚀 启动容器..."
docker compose -f docker/docker-compose.yml up -d

# 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 5

# 检查健康状态
echo ""
echo "📊 检查服务状态..."
docker compose -f docker/docker-compose.yml ps

echo ""
echo "=========================================="
echo "  Docker 部署完成"
echo "  服务地址: http://localhost:3000"
echo ""
echo "常用命令:"
echo "  docker compose -f docker/docker-compose.yml logs -f  - 查看日志"
echo "  docker compose -f docker/docker-compose.yml restart - 重启"
echo "  docker compose -f docker/docker-compose.yml down      - 停止"
echo "=========================================="
