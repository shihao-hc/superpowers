#!/bin/bash
set -e

echo "=========================================="
echo "  UltraWork AI - 快速部署脚本"
echo "=========================================="

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

echo "✅ Node.js 版本: $(node -v)"

# 创建日志目录
mkdir -p .opencode/logs

# 安装依赖
echo ""
echo "📦 安装依赖..."
npm install

# PM2 部署
if command -v pm2 &> /dev/null; then
    echo ""
    echo "🚀 使用 PM2 启动服务..."
    pm2 start ecosystem.config.js --env production
    pm2 save
    echo "✅ PM2 已启动并保存"
    echo ""
    echo "常用命令:"
    echo "  pm2 status          - 查看状态"
    echo "  pm2 logs ultrawork  - 查看日志"
    echo "  pm2 restart ultrawork - 重启服务"
    echo "  pm2 stop ultrawork  - 停止服务"
else
    echo ""
    echo "🚀 使用 npm start 启动服务..."
    npm start
fi

echo ""
echo "=========================================="
echo "  服务已启动: http://localhost:3000"
echo "=========================================="
