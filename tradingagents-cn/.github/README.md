# GitHub Actions CI/CD

## 概述

本项目使用 GitHub Actions 实现持续集成和部署，包含以下功能：

- 自动化测试（后端 + 前端）
- 代码质量检查（Lint + Security）
- Docker 镜像构建和推送
- Kubernetes 部署
- 多渠道通知（Slack、钉钉、企业微信）

## 工作流程

### 1. CI/CD 流程图

```
push / PR (main, develop)
        │
        ├── test
        │   ├── Backend Tests (pytest)
        │   │   └── USE_MOCK_LLM=true
        │   └── Frontend Tests (npm)
        │
        ├── lint
        │   ├── flake8 (Critical Errors)
        │   ├── bandit (Security)
        │   └── mypy (Type Check)
        │
        └── build-and-push
            ├── Backend Image → ghcr.io/.../backend
            └── Frontend Image → ghcr.io/.../frontend
                        │
                        ├── develop → deploy-staging
                        └── main → deploy-production
```

### 2. 触发条件

| 事件 | 触发分支 | 操作 |
|------|----------|------|
| push | main, develop | 运行测试 + 构建镜像 |
| pull_request | main | 运行测试 |
| workflow_dispatch | 任意 | 手动触发 |

## 使用方法

### 本地测试 CI

```bash
# 模拟 CI 环境
export USE_MOCK_LLM=true
pytest tests/ -v
```

### 手动触发部署

```bash
# 在 GitHub Actions 页面手动触发
# 或使用 GitHub CLI
gh workflow run ci-cd.yml
```

## 环境变量

### CI 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `USE_MOCK_LLM` | 使用 Mock LLM | `true` |
| `MONGODB_URI` | MongoDB 连接 | `localhost:27017` |
| `REDIS_URL` | Redis 连接 | `localhost:6379` |

### 生产环境变量

| 变量 | 说明 | 配置位置 |
|------|------|----------|
| `DEEPSEEK_API_KEY` | DeepSeek API | K8s Secret |
| `DASHSCOPE_API_KEY` | 阿里云 API | K8s Secret |
| `API_KEY` | 服务 API 密钥 | K8s Secret |

## GitHub Secrets 配置

在仓库 `Settings → Secrets and variables → Actions` 中配置：

### 必需

| Secret | 说明 |
|--------|------|
| `GITHUB_TOKEN` | 自动提供，无需手动配置 |

### 可选（用于部署）

| Secret | 说明 |
|--------|------|
| `KUBE_CONFIG` | K8s kubeconfig (base64 编码) |
| `GRAFANA_PASSWORD` | Grafana 密码 |

### 可选（用于通知）

| Secret | 说明 |
|--------|------|
| `SLACK_WEBHOOK` | Slack Incoming Webhook URL |
| `DINGTALK_WEBHOOK` | 钉钉群机器人 Webhook URL |
| `WECHAT_WEBHOOK` | 企业微信群机器人 Webhook URL |

详细配置说明见 [SECRETS.md](SECRETS.md)。

## Mock LLM

测试时使用 `USE_MOCK_LLM=true` 避免真实 API 调用：

```python
from tradingagents.llm import create_llm_adapter

# 自动使用 Mock
adapter = create_llm_adapter("deepseek")  # USE_MOCK_LLM=true 时返回 MockLLMAdapter
```

Mock 数据存储在 `tradingagents/llm/mock_data.py`，包括：

**股票分析 Mock 数据**:
- `MOCK_MARKET_REPORT` - 技术指标分析
- `MOCK_FUNDAMENTALS_REPORT` - 财务数据分析
- `MOCK_NEWS_REPORT` - 新闻舆情
- `MOCK_SENTIMENT_REPORT` - 情绪分析
- `MOCK_RISK_ASSESSMENT` - 风险评估

**决策 Mock 数据**:
- `MOCK_INVESTMENT_PLAN` - 投资计划
- `MOCK_FINAL_DECISION` - 最终决策

**代码审查 Mock 数据**:
- `MOCK_CODE_REVIEW_VERDICT` - 综合审查
- `MOCK_CRITIC_ARGUMENTS` - 批评论点
- `MOCK_ADVOCATE_ARGUMENTS` - 辩护论点

**WebSocket 进度模拟**:
- `WS_PROGRESS_MESSAGES` - 完整进度消息序列

## Docker 镜像

镜像自动推送到 GitHub Container Registry：

```
ghcr.io/{owner}/{repo}-backend:{tag}
ghcr.io/{owner}/{repo}-frontend:{tag}
```

### 标签策略

| 标签 | 说明 |
|------|------|
| `latest` | main 分支最新 |
| `main-{sha}` | main 分支特定提交 |
| `develop-{sha}` | develop 分支特定提交 |

## Kubernetes 部署

### 命名空间

- Staging: `tradingagents-staging`
- Production: `tradingagents`

### Helm 参数

```bash
helm upgrade --install tradingagents-cn ./k8s/helm \
  --set backend.image.tag=main-${{ github.sha }} \
  --set backend.image.repository=ghcr.io/${{ env.IMAGE_NAME_BACKEND }} \
  --namespace tradingagents \
  --create-namespace
```

## 监控和告警

部署后可通过以下地址访问：

- API: `http://{service}/api/v1`
- Prometheus: `http://prometheus:9090`
- Grafana: `http://grafana:3000`
- Health: `http://{service}/health`

## 故障排除

### 测试失败

```bash
# 本地运行相同测试
export USE_MOCK_LLM=true
pytest tests/test_code_review.py -v
```

### Docker 构建失败

```bash
# 本地构建测试
docker build -t test-backend -f Dockerfile .
docker build -t test-frontend -f frontend/Dockerfile ./frontend
```

### 部署失败

检查 K8s 配置：
```bash
kubectl get pods -n tradingagents
kubectl logs -n tradingagents -l app=backend
```
