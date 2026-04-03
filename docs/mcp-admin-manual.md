# MCP 集成管理员部署手册

> 适用于 UltraWork AI 平台的 MCP 模块部署与运维

---

## 目录

1. [架构概述](#架构概述)
2. [环境准备](#环境准备)
3. [配置说明](#配置说明)
4. [Kubernetes 部署](#kubernetes-部署)
5. [PM2 部署](#pm2-部署)
6. [监控配置](#监控配置)
7. [告警配置](#告警配置)
8. [备份与恢复](#备份与恢复)
9. [故障排查](#故障排查)

---

## 架构概述

```
                    ┌─────────────────────────────────────┐
                    │           UltraWork Server           │
                    │                                     │
  ┌─────────┐      │  ┌─────────┐   ┌──────────────┐  │
  │  Agent  │──────┼─▶│ MCPBridge│──▶│ MCPClient(s)│  │
  └─────────┘      │  └────┬────┘   └──────┬───────┘  │
                    │       │                │            │
  ┌─────────┐      │  ┌────▼────┐   ┌──────▼───────┐  │
  │ Workflow│──────┼─▶│ Registry │   │ MCP Servers  │  │
  └─────────┘      │  └────┬────┘   │  - filesystem│  │
                    │       │         │  - github    │  │
  ┌─────────┐      │  ┌────▼────┐   │  - brave    │  │
  │ Frontend│──────┼─▶│ Router  │   └──────────────┘  │
  └─────────┘      │  └────┬────┘                      │
                    │       │                            │
                    │  ┌────▼────┐   ┌──────────────┐  │
                    │  │AuditLogger│─▶│  Loki/ES     │  │
                    │  └─────────┘   └──────────────┘  │
                    └─────────────────────────────────────┘
```

### 核心组件

| 组件 | 功能 | 关键文件 |
|------|------|----------|
| MCPBridge | 统一入口、路由、熔断 | `src/mcp/MCPBridge.js` |
| MCPClient | 单服务器进程管理 | `src/mcp/MCPClient.js` |
| MCPToolRegistry | 工具缓存、参数校验 | `src/mcp/MCPToolRegistry.js` |
| MCPNodeManager | 工作流节点注册 | `src/mcp/MCPNodeManager.js` |
| MCPAuditLogger | 审计日志记录 | `src/mcp/metrics.js` |
| MCPAlertManager | 实时告警 | `src/mcp/MCPAlertManager.js` |
| MCPPermissionManager | 权限管理 | `src/mcp/MCPPermissionManager.js` |

---

## 环境准备

### 系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|----------|----------|
| CPU | 2 核 | 4 核+ |
| 内存 | 4 GB | 8 GB+ |
| 磁盘 | 10 GB | 50 GB+ SSD |
| Node.js | 18.x | 20.x LTS |
| 操作系统 | Ubuntu 20.04+ | Ubuntu 22.04 LTS |

### 依赖服务

| 服务 | 用途 | 是否必需 |
|------|------|----------|
| Prometheus | 指标采集 | 推荐 |
| Grafana | 可视化仪表盘 | 推荐 |
| Loki/ELK | 日志存储 | 可选 |
| Redis | 缓存同步 | 可选（分布式部署时） |
| PostgreSQL | 数据持久化 | 可选 |

---

## 配置说明

### 环境变量

```bash
# MCP 服务器配置
MCP_SERVERS_CONFIG=/path/to/mcp-servers.json

# 审计日志
MCP_AUDIT_FILE_ENABLED=true
MCP_AUDIT_ROTATION=true
MCP_AUDIT_MAX_FILES=30
MCP_AUDIT_MAX_AGE=2592000000
MCP_AUDIT_ENCRYPT=false
MCP_AUDIT_KEY=

# JWT 认证
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=86400000

# 外部服务（根据需要配置）
GITHUB_TOKEN=
BRAVE_API_KEY=
SLACK_WEBHOOK_URL=

# 性能调优
NODE_ENV=production
MCP_CACHE_TTL=60000
MCP_MAX_CACHE_SIZE=1000
MCP_RATE_LIMIT=20

# 端口配置
PORT=3000
```

### 配置文件

`config/mcp-servers.json`:

```json
{
  "servers": [
    {
      "name": "filesystem",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp", "/home"],
      "env": {},
      "enabled": true,
      "timeout": 30000,
      "maxRetries": 3
    },
    {
      "name": "github",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      },
      "enabled": true,
      "timeout": 30000
    }
  ],
  "global": {
    "toolCacheTTL": 300000,
    "rateLimit": { "enabled": true, "maxRequestsPerSecond": 20 },
    "circuitBreaker": { "threshold": 5, "timeout": 30000 }
  },
  "security": {
    "roleRestrictions": {
      "admin": { "allowedTools": ["*"] },
      "operator": { 
        "allowedTools": ["filesystem:read*", "github:read*"],
        "deniedTools": ["*delete*", "*release*"]
      },
      "viewer": {
        "allowedTools": ["filesystem:read_file", "brave-search:*"],
        "deniedTools": ["*write*", "*delete*", "*create*"]
      }
    },
    "toolPermissions": {
      "github:create_release": "admin",
      "filesystem:delete_file": "admin"
    }
  }
}
```

---

## Kubernetes 部署

### Deployment YAML

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ultrawork-mcp
  namespace: ultrawork
  labels:
    app: ultrawork-mcp
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ultrawork-mcp
  template:
    metadata:
      labels:
        app: ultrawork-mcp
    spec:
      containers:
        - name: ultrawork
          image: ghcr.io/ultrawork/ultrawork:latest
          ports:
            - containerPort: 3000
          env:
            - name: NODE_ENV
              value: "production"
            - name: PORT
              value: "3000"
            - name: MCP_AUDIT_FILE_ENABLED
              value: "true"
            - name: MCP_AUDIT_ROTATION
              value: "true"
            - name: JWT_SECRET
              valueFrom:
                secretKeyRef:
                  name: ultrawork-secrets
                  key: jwt-secret
            - name: GITHUB_TOKEN
              valueFrom:
                secretKeyRef:
                  name: ultrawork-secrets
                  key: github-token
          resources:
            requests:
              memory: "512Mi"
              cpu: "250m"
            limits:
              memory: "2Gi"
              cpu: "1000m"
          livenessProbe:
            httpGet:
              path: /api/mcp/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /api/mcp/health?deep=true
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 5
          volumeMounts:
            - name: audit-logs
              mountPath: /app/logs
      volumes:
        - name: audit-logs
          persistentVolumeClaim:
            claimName: ultrawork-audit-logs
---
apiVersion: v1
kind: Service
metadata:
  name: ultrawork-mcp-svc
  namespace: ultrawork
spec:
  selector:
    app: ultrawork-mcp
  ports:
    - port: 80
      targetPort: 3000
  type: ClusterIP
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: ultrawork-mcp-hpa
  namespace: ultrawork
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ultrawork-mcp
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

### RBAC 配置

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ultrawork-mcp
  namespace: ultrawork
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    resourceNames: ["ultrawork-secrets"]
    verbs: ["get"]
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ultrawork-mcp
  namespace: ultrawork
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ultrawork-mcp-binding
  namespace: ultrawork
subjects:
  - kind: ServiceAccount
    name: ultrawork-mcp
    namespace: ultrawork
roleRef:
  kind: Role
  name: ultrawork-mcp
  apiGroup: rbac.authorization.k8s.io
```

### PVC 配置

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ultrawork-audit-logs
  namespace: ultrawork
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

### Helm Values

```yaml
# values.yaml
replicaCount: 3

image:
  repository: ghcr.io/ultrawork/ultrawork
  tag: latest
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 80

resources:
  requests:
    memory: 512Mi
    cpu: 250m
  limits:
    memory: 2Gi
    cpu: 1000m

autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70

env:
  NODE_ENV: production
  MCP_AUDIT_FILE_ENABLED: "true"
  MCP_AUDIT_ROTATION: "true"
  MCP_AUDIT_MAX_FILES: "30"

persistence:
  enabled: true
  size: 10Gi
  storageClass: standard-ssd

prometheus:
  enabled: true
  port: 9090

livenessProbe:
  path: /api/mcp/health
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  path: /api/mcp/health?deep=true
  initialDelaySeconds: 10
  periodSeconds: 5
```

---

## PM2 部署

### ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'ultrawork-mcp',
    script: 'server/staticServer.js',
    instances: 4,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'development',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      MCP_AUDIT_FILE_ENABLED: 'true',
      MCP_AUDIT_ROTATION: 'true'
    },
    error_file: '/var/log/ultrawork/error.log',
    out_file: '/var/log/ultrawork/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
    max_memory_restart: '1G',
    restart_delay: 4000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

### 部署脚本

```bash
#!/bin/bash
# deploy.sh

set -e

APP_DIR="/opt/ultrawork"
APP_NAME="ultrawork-mcp"

# Pull latest code
cd $APP_DIR
git pull origin main

# Install dependencies
npm ci --production

# Reload with zero downtime
pm2 reload ecosystem.config.js --env production

# Show status
pm2 show $APP_NAME

# Monitor logs
pm2 logs $APP_NAME --lines 50 --nostream
```

---

## 监控配置

### Prometheus 配置

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'ultrawork-mcp'
    static_configs:
      - targets: ['ultrawork-mcp-svc:3000']
    metrics_path: '/api/mcp/metrics'
    scrape_interval: 15s
```

### Grafana Dashboard

导入 `monitoring/mcp-audit-dashboard.json`

关键指标：

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `mcp_calls_total` | Counter | 总调用次数 |
| `mcp_calls_success_total` | Counter | 成功次数 |
| `mcp_calls_failed_total` | Counter | 失败次数 |
| `mcp_servers_connected` | Gauge | 连接服务器数 |
| `mcp_cache_hits_total` | Counter | 缓存命中数 |
| `mcp_cache_size` | Gauge | 缓存大小 |

### 健康检查 API

```bash
# 基础健康检查
curl http://localhost:3000/api/mcp/health

# 深度健康检查（含每个服务器状态）
curl http://localhost:3000/api/mcp/health?deep=true

# 单服务器健康检查
curl http://localhost:3000/api/mcp/health/github
```

---

## 告警配置

### 告警规则

| 规则 ID | 名称 | 触发条件 | 静默期 |
|---------|------|----------|---------|
| `sensitive_ops` | 敏感操作告警 | delete/create_release/write_file | 60s |
| `failed_auth` | 认证失败告警 | access_denied | 300s |
| `high_failure_rate` | 高频失败告警 | 同一工具失败5次 | 600s |
| `unusual_activity` | 异常时间活动 | 非工作时间操作 | 3600s |

### Slack 集成

1. 创建 Slack App
2. 启用 Incoming Webhooks
3. 添加 Webhook URL 到配置

```bash
# 测试 Webhook
curl -X POST $SLACK_WEBHOOK_URL \
  -H 'Content-Type: application/json' \
  -d '{"text": "MCP 测试消息"}'
```

### 企业微信集成

1. 创建企业微信应用
2. 获取 AgentId 和 CorpSecret
3. 配置 Webhook

---

## 备份与恢复

### 备份项

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/backups/ultrawork"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 备份配置文件
cp config/mcp-servers.json $BACKUP_DIR/mcp-servers_$DATE.json

# 备份审计日志
cp logs/mcp-audit-*.jsonl $BACKUP_DIR/ 2>/dev/null || true

# 备份工作流
cp -r workflows/ $BACKUP_DIR/workflows_$DATE/ 2>/dev/null || true

# 清理 30 天前的备份
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup complete: $DATE"
```

### 恢复脚本

```bash
#!/bin/bash
# restore.sh

BACKUP_DATE=$1
BACKUP_DIR="/backups/ultrawork"

if [ -z "$BACKUP_DATE" ]; then
  echo "Usage: $0 <backup_date>"
  exit 1
fi

# 恢复配置
cp $BACKUP_DIR/mcp-servers_$BACKUP_DATE.json config/mcp-servers.json

# 重启服务
pm2 restart ultrawork-mcp

echo "Restore complete for date: $BACKUP_DATE"
```

---

## 故障排查

### 常见问题

| 问题 | 可能原因 | 解决方案 |
|------|----------|----------|
| MCP 服务器启动超时 | npx 下载慢 | 使用离线包或代理 |
| 熔断器打开 | 连续失败 | 检查网络、权限或工具参数 |
| 缓存命中率低 | TTL 太短 | 调整 `MCP_CACHE_TTL` |
| 审计日志丢失 | 磁盘满 | 增加存储或清理旧日志 |

### 日志分析

```bash
# 查看实时日志
pm2 logs ultrawork-mcp --f

# 查看 MCP 相关日志
grep -i mcp /var/log/ultrawork/error.log | tail -100

# 查看审计日志
tail -f logs/mcp-audit-*.jsonl

# 统计错误类型
cat logs/mcp-audit-*.jsonl | jq -r '.result.error // "unknown"' | sort | uniq -c | sort -rn
```

### 调试模式

```bash
# 启用调试日志
export MCP_DEBUG=1
export DEBUG=mcp:*

# 重启服务
pm2 restart ultrawork-mcp
```

---

## 性能调优

### 缓存配置

```javascript
// 根据内存调整
MCP_CACHE_TTL=60000        // 60秒（内存紧张时）
MCP_CACHE_TTL=300000        // 5分钟（内存充足时）
MCP_MAX_CACHE_SIZE=1000     // 根据内存调整
```

### 连接池配置

```yaml
# Kubernetes HPA 配置
metrics:
  - type: Pods
    pods:
      metricName: mcp_calls_total
      targetAverageValue: "1000"
```

### 限流配置

```json
{
  "global": {
    "rateLimit": {
      "enabled": true,
      "maxRequestsPerSecond": 20
    }
  }
}
```

---

## 安全检查清单

- [ ] JWT Secret 已配置
- [ ] GITHUB_TOKEN 已通过 Secret 管理
- [ ] 审计日志已启用
- [ ] 日志加密已启用（生产环境）
- [ ] 限流规则已配置
- [ ] 熔断阈值已调整
- [ ] 告警渠道已配置
- [ ] 备份策略已设置
- [ ] 监控仪表盘已导入
- [ ] 健康检查探针已配置
