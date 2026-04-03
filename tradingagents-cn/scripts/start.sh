#!/bin/bash
# TradingAgents-CN 启动脚本

set -e

echo "=== TradingAgents-CN 启动脚本 ==="

# 检查环境变量
if [ -z "$OPENAI_API_KEY" ] && [ -z "$DEEPSEEK_API_KEY" ] && [ -z "$DASHSCOPE_API_KEY" ]; then
    echo "警告: 未设置任何 API 密钥"
    echo "请设置以下环境变量之一:"
    echo "  - OPENAI_API_KEY"
    echo "  - DEEPSEEK_API_KEY"
    echo "  - DASHSCOPE_API_KEY"
fi

# 创建必要目录
mkdir -p .cache logs

# 构建并启动服务
echo "构建 Docker 镜像..."
docker-compose -f docker-compose.prod.yml build

echo "启动服务..."
docker-compose -f docker-compose.prod.yml up -d

# 等待服务就绪
echo "等待服务就绪..."
sleep 10

# 检查服务状态
echo "检查服务状态..."
docker-compose -f docker-compose.prod.yml ps

# 显示访问信息
echo ""
echo "=== 服务已启动 ==="
echo "API 地址: http://localhost:8000"
echo "API 文档: http://localhost:8000/docs"
echo "健康检查: http://localhost:8000/health"

# 查看日志
echo ""
echo "查看日志: docker-compose -f docker-compose.prod.yml logs -f"

echo ""
echo "=== 完成 ==="
