#!/bin/bash
# TradingAgents-CN 测试脚本

set -e

echo "=== TradingAgents-CN 测试 ==="

# 运行单元测试
echo "1. 运行单元测试..."
python -m pytest tests/test_agents.py -v --tb=short

# 运行集成测试
echo "2. 运行集成测试..."
python -m pytest tests/test_integration.py -v --tb=short

# 运行覆盖率测试
echo "3. 运行覆盖率测试..."
python -m pytest tests/ -v --cov=tradingagents --cov-report=html --cov-report=term

echo ""
echo "=== 测试完成 ==="
