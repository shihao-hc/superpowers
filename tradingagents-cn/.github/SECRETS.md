# GitHub Secrets Configuration Guide

## 概述

本文档说明如何在 GitHub 仓库中配置 Secrets，以启用 CI/CD 流水线的全部功能。

## 配置步骤

### 1. 进入仓库设置

1. 在 GitHub 仓库页面，点击 `Settings` (设置)
2. 在左侧菜单中选择 `Secrets and variables` → `Actions`

### 2. 配置 Secrets

点击 `New repository secret` 按钮添加以下 Secrets：

## 必需 Secrets

### GITHUB_TOKEN
- **说明**: 自动提供，无需手动配置
- **用途**: 推送到 GitHub Container Registry (ghcr.io)

## 可选 Secrets

### KUBE_CONFIG
- **说明**: Kubernetes kubeconfig 文件 (base64 编码)
- **用途**: 自动部署到 Kubernetes 集群
- **配置方法**:
  ```bash
  # 本地生成 kubeconfig 后编码
  cat ~/.kube/config | base64 | tr -d '\n'
  ```
- **注意**: 确保配置文件中不包含敏感信息

### SLACK_WEBHOOK
- **说明**: Slack Incoming Webhook URL
- **用途**: 流水线状态通知 (成功/失败)
- **配置方法**:
  1. 在 Slack 中创建 Incoming Webhook
  2. 复制 Webhook URL 到 GitHub Secret
- **格式**: `https://hooks.slack.com/services/xxx/xxx/xxx`

### DINGTALK_WEBHOOK
- **说明**: 钉钉群机器人 Webhook URL
- **用途**: 流水线状态通知 (中文)
- **配置方法**:
  1. 在钉钉群中添加自定义机器人
  2. 复制 Webhook URL (包含 access_token)
- **格式**: `https://oapi.dingtalk.com/robot/send?access_token=xxx`

### WECHAT_WEBHOOK
- **说明**: 企业微信群机器人 Webhook URL
- **用途**: 流水线状态通知 (企业微信)
- **配置方法**:
  1. 在企业微信群中添加群机器人
  2. 复制 Webhook URL
- **格式**: `https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx`

## LLM API Keys (生产环境)

如需在生产环境使用真实 LLM API，在 K8s Secret 中配置：

### DEEPSEEK_API_KEY
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: tradingagents-secrets
type: Opaque
stringData:
  deepseek-api-key: "sk-xxx"
```

### DASHSCOPE_API_KEY
```yaml
stringData:
  dashscope-api-key: "sk-xxx"
```

### GOOGLE_API_KEY
```yaml
stringData:
  google-api-key: "xxx"
```

## 本地开发 Secrets

在本地 `.env` 文件中配置 (不要提交到 Git):

```bash
# .env (添加到 .gitignore)
USE_MOCK_LLM=true

# 真实 API Keys (可选)
DEEPSEEK_API_KEY=sk-xxx
DASHSCOPE_API_KEY=sk-xxx
API_KEY=your-secret-key

# Grafana
GRAFANA_PASSWORD=admin

# 通知 (可选)
SLACK_WEBHOOK=https://hooks.slack.com/...
DINGTALK_WEBHOOK=https://oapi.dingtalk.com/...
WECHAT_WEBHOOK=https://qyapi.weixin.qq.com...
```

## 验证配置

推送代码到 main 或 develop 分支，检查 GitHub Actions 日志：

1. 进入 `Actions` 标签页
2. 查看最新 workflow 运行
3. 检查 `notify` job 日志确认通知发送

## 故障排除

### Secrets 未生效
- 确认 Secrets 名称完全匹配 (区分大小写)
- 确认 Secrets 在正确的仓库中配置
- Secrets 更新后需要重新触发 workflow

### 通知未收到
- 检查 Webhook URL 是否正确
- 确认 Slack/钉钉/企业微信群机器人未被禁用
- 查看 GitHub Actions 日志中的 curl 响应

### Kubernetes 部署失败
- 确认 KUBE_CONFIG 编码正确
- 检查 kubeconfig 中的集群地址是否可达
- 验证 ServiceAccount 权限是否足够
