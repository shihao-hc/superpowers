# TradingAgents-CN 快速开始指南

## 概述

TradingAgents-CN 是一个基于 LangGraph 的多智能体股票分析系统，支持 A 股数据获取、LLM 多提供商、实时 WebSocket 推送。

## 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/your-username/tradingagents-cn.git
cd tradingagents-cn
```

### 2. 配置环境变量

```bash
# 创建 .env 文件
cat > .env << EOF
# LLM API Keys (至少配置一个)
DEEPSEEK_API_KEY=sk-your-deepseek-key
# DASHSCOPE_API_KEY=sk-your-aliyun-key
# GOOGLE_API_KEY=your-google-key

# 安全设置
API_KEY=your-secret-api-key
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173

# CI 测试 (本地开发可设为 true)
USE_MOCK_LLM=false
EOF
```

### 3. 安装依赖

```bash
# 后端
pip install -r requirements.txt

# 前端
cd frontend
npm install
cd ..
```

### 4. 运行测试

```bash
# 使用 Mock LLM 运行测试 (无需 API Key)
USE_MOCK_LLM=true pytest tests/test_code_review.py -v

# 使用真实 LLM 运行测试
pytest tests/test_code_review.py -v
```

### 5. 启动服务

```bash
# 启动后端
python -m uvicorn tradingagents.api.app:create_app --factory --host 0.0.0.0 --port 8000

# 启动前端 (新终端)
cd frontend
npm run dev
```

## GitHub Actions 设置

### 1. 启用 Actions

1. 进入仓库 `Settings` → `Actions` → `General`
2. 确保 `Allow all actions` 已选中
3. `Workflow permissions` 设置为 `Read and write permissions`

### 2. 配置 Secrets

在 `Settings` → `Secrets and variables` → `Actions` 中添加：

| Secret | 说明 | 获取方式 |
|--------|------|----------|
| `KUBE_CONFIG` | K8s 部署配置 | `cat ~/.kube/config \| base64 -w 0` |
| `SLACK_WEBHOOK_URL` | Slack 通知 | Slack App 设置 |
| `DINGTALK_WEBHOOK_URL` | 钉钉通知 | 钉钉群机器人 |
| `FEISHU_WEBHOOK_URL` | 飞书通知 | 飞书群机器人 |

### 3. 推送代码触发流水线

```bash
git add .
git commit -m "Initial setup"
git push origin main
```

### 4. 查看流水线状态

访问 `https://github.com/your-username/tradingagents-cn/actions`

## Docker 部署

### 本地构建

```bash
# 构建后端镜像
docker build -t tradingagents-backend -f Dockerfile .

# 构建前端镜像
docker build -t tradingagents-frontend -f frontend/Dockerfile ./frontend

# 运行
docker-compose up -d
```

### 使用 GitHub Container Registry

```bash
# 登录
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# 拉取最新镜像
docker pull ghcr.io/owner/tradingagents-cn-backend:latest
docker pull ghcr.io/owner/tradingagents-cn-frontend:latest
```

## Kubernetes 部署

### 前置条件

- Kubernetes 集群
- kubectl 配置
- Helm 3

### 部署步骤

```bash
# 添加 Helm repo (可选)
helm repo add bitnami https://charts.bitnami.com/bitnami

# 创建命名空间
kubectl create namespace tradingagents

# 部署
helm upgrade --install tradingagents-cn ./k8s/helm \
  --namespace tradingagents \
  --create-namespace \
  --set backend.image.repository=ghcr.io/owner/tradingagents-cn-backend \
  --set backend.image.tag=latest \
  --set frontend.image.repository=ghcr.io/owner/tradingagents-cn-frontend \
  --set frontend.image.tag=latest
```

## 常见问题

### Q: 测试失败 "No API Key"

```bash
# 设置环境变量
export USE_MOCK_LLM=true
# 或在 .env 文件中设置
echo "USE_MOCK_LLM=true" >> .env
```

### Q: Docker 构建失败

```bash
# 清理 Docker 缓存
docker builder prune

# 重新构建
docker build --no-cache -t tradingagents-backend -f Dockerfile .
```

### Q: K8s 部署失败

```bash
# 检查 pod 状态
kubectl get pods -n tradingagents

# 查看日志
kubectl logs -n tradingagents -l app=backend

# 检查 events
kubectl get events -n tradingagents --sort-by='.lastTimestamp'
```

## API 文档

启动服务后访问:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 监控

| 服务 | 地址 |
|------|------|
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |
| Alertmanager | http://localhost:9093 |

## 支持

- GitHub Issues: https://github.com/your-username/tradingagents-cn/issues
- 文档: https://github.com/your-username/tradingagents-cn#readme
