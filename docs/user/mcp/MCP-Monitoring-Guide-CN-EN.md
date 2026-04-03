# MCP 监控与告警配置 / MCP Monitoring and Alerting Configuration

## 概述 / Overview

本文档介绍如何配置 MCP 系统的监控和告警功能，包括 Prometheus 指标、Grafana 仪表盘和告警规则。

---

## 1. Prometheus 指标 / Prometheus Metrics

### 指标端点 / Metrics Endpoint

MCP 系统暴露以下 Prometheus 指标端点：

| 端点 | 说明 |
|------|------|
| `GET /api/mcp/metrics` | MCP 指标 (Prometheus 格式) |
| `GET /api/mcp/metrics?format=json` | MCP 指标 (JSON 格式) |
| `GET /api/mcp/health` | MCP 健康状态 |
| `GET /api/mcp/status` | MCP 详细状态 |

### 指标列表 / Metrics List

#### 调用指标 / Call Metrics

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `mcp_calls_total` | Counter | MCP 调用总数 |
| `mcp_calls_success_total` | Counter | 成功调用数 |
| `mcp_calls_failed_total` | Counter | 失败调用数 |
| `mcp_call_duration_seconds` | Histogram | 调用耗时分布 |

#### 服务器指标 / Server Metrics

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `mcp_servers_connected` | Gauge | 已连接服务器数 |
| `mcp_servers_total` | Gauge | 服务器总数 |
| `mcp_servers_by_status` | Gauge | 按状态分类的服务器 |

#### 工具指标 / Tool Metrics

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `mcp_tools_available` | Gauge | 可用工具数 |
| `mcp_tool_usage_total` | Counter | 工具使用次数 |
| `mcp_tool_errors_total` | Counter | 工具错误次数 |

#### 工作流指标 / Workflow Metrics

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `mcp_workflow_nodes` | Gauge | 工作流节点数 |
| `mcp_workflow_active` | Gauge | 活跃工作流数 |

#### 缓存指标 / Cache Metrics

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `mcp_cache_hits_total` | Counter | 缓存命中数 |
| `mcp_cache_misses_total` | Counter | 缓存未命中数 |
| `mcp_cache_size` | Gauge | 缓存大小 |

#### 资源指标 / Resource Metrics

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `mcp_memory_heap_used_bytes` | Gauge | 堆内存使用 |
| `mcp_memory_rss_bytes` | Gauge | RSS 内存 |
| `mcp_cpu_seconds_total` | Counter | CPU 使用时间 |

---

## 2. Prometheus 配置 / Prometheus Configuration

### prometheus.yml

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'ultrawork-mcp'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/mcp/metrics'
    scrape_interval: 10s
```

---

## 3. Grafana 仪表盘 / Grafana Dashboard

### 仪表盘 JSON

```json
{
  "dashboard": {
    "title": "UltraWork MCP Dashboard",
    "uid": "ultrawork-mcp",
    "panels": [
      {
        "title": "MCP 服务器状态 / Server Status",
        "type": "stat",
        "gridPos": { "x": 0, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "mcp_servers_connected",
            "legendFormat": "Connected"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "mappings": [
              { "type": "value", "options": { "0": { "text": "离线" } } },
              { "type": "range", "options": { "1-": { "text": "在线" } } }
            ],
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "red", "value": null },
                { "color": "green", "value": 1 }
              ]
            }
          }
        }
      },
      {
        "title": "调用成功率 / Success Rate",
        "type": "gauge",
        "gridPos": { "x": 6, "y": 0, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "mcp_calls_success_total / mcp_calls_total * 100",
            "legendFormat": "Success %"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "mode": "absolute",
              "steps": [
                { "color": "red", "value": null },
                { "color": "yellow", "value": 90 },
                { "color": "green", "value": 95 }
              ]
            }
          }
        }
      },
      {
        "title": "调用量趋势 / Call Rate",
        "type": "graph",
        "gridPos": { "x": 0, "y": 4, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "rate(mcp_calls_total[5m])",
            "legendFormat": "Calls/sec"
          },
          {
            "expr": "rate(mcp_calls_failed_total[5m])",
            "legendFormat": "Errors/sec"
          }
        ]
      },
      {
        "title": "工具使用排行 / Tool Usage",
        "type": "bargauge",
        "gridPos": { "x": 12, "y": 4, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "topk(10, mcp_tool_usage_total)",
            "legendFormat": "{{tool}}"
          }
        ]
      },
      {
        "title": "调用延迟分布 / Latency Distribution",
        "type": "heatmap",
        "gridPos": { "x": 0, "y": 12, "w": 12, "h": 8 },
        "targets": [
          {
            "expr": "rate(mcp_call_duration_seconds_bucket[5m])",
            "legendFormat": "{{le}}"
          }
        ]
      },
      {
        "title": "缓存命中率 / Cache Hit Rate",
        "type": "gauge",
        "gridPos": { "x": 12, "y": 12, "w": 6, "h": 4 },
        "targets": [
          {
            "expr": "mcp_cache_hits_total / (mcp_cache_hits_total + mcp_cache_misses_total) * 100"
          }
        ]
      },
      {
        "title": "内存使用 / Memory Usage",
        "type": "graph",
        "gridPos": { "x": 18, "y": 12, "w": 6, "h": 8 },
        "targets": [
          {
            "expr": "mcp_memory_heap_used_bytes / 1024 / 1024",
            "legendFormat": "Heap (MB)"
          },
          {
            "expr": "mcp_memory_rss_bytes / 1024 / 1024",
            "legendFormat": "RSS (MB)"
          }
        ]
      }
    ]
  }
}
```

---

## 4. 告警规则 / Alert Rules

### alert-rules.yml

```yaml
groups:
  - name: ultrawork-mcp
    rules:
      # MCP 服务器离线告警
      - alert: MCPServerOffline
        expr: mcp_servers_connected == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "MCP 服务器全部离线"
          description: "所有 MCP 服务器已离线超过 1 分钟"
      
      # MCP 调用失败率过高
      - alert: MCPHighErrorRate
        expr: rate(mcp_calls_failed_total[5m]) / rate(mcp_calls_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "MCP 调用失败率过高"
          description: "MCP 调用失败率超过 10%"
      
      # MCP 响应时间过长
      - alert: MCPSlowResponseTime
        expr: histogram_quantile(0.95, rate(mcp_call_duration_seconds_bucket[5m])) > 5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "MCP 响应时间过长"
          description: "P95 响应时间超过 5 秒"
      
      # MCP 服务器部分离线
      - alert: MCPServerPartialOffline
        expr: mcp_servers_connected < mcp_servers_total and mcp_servers_connected > 0
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "部分 MCP 服务器离线"
          description: "{{ $value }} 个服务器离线"
      
      # 工具错误率过高
      - alert: MCPToolHighErrorRate
        expr: rate(mcp_tool_errors_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "工具错误率过高"
          description: "工具 {{ $labels.tool }} 错误率过高"
      
      # 内存使用过高
      - alert: MCPHighMemoryUsage
        expr: mcp_memory_heap_used_bytes / mcp_memory_heap_total_bytes > 0.9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "MCP 内存使用过高"
          description: "内存使用率超过 90%"
      
      # 缓存命中率过低
      - alert: MCPLowCacheHitRate
        expr: mcp_cache_hits_total / (mcp_cache_hits_total + mcp_cache_misses_total) < 0.5
        for: 10m
        labels:
          severity: info
        annotations:
          summary: "缓存命中率过低"
          description: "缓存命中率低于 50%"
```

---

## 5. 健康检查 / Health Checks

### 健康检查端点 / Health Endpoint

访问 `GET /api/mcp/health` 获取健康状态：

```json
{
  "status": "healthy",
  "timestamp": "2026-03-21T12:00:00Z",
  "checks": {
    "server": {
      "status": "pass",
      "message": "All servers connected"
    },
    "bridge": {
      "status": "pass",
      "message": "Bridge operational"
    },
    "cache": {
      "status": "pass",
      "message": "Cache operational"
    }
  }
}
```

### 健康检查状态 / Health Check Status

| 状态 | 说明 |
|------|------|
| `healthy` | 所有检查通过 |
| `degraded` | 部分功能降级 |
| `unhealthy` | 严重问题需要处理 |

---

## 6. Grafana 告警通知 / Grafana Alert Notifications

### 通知渠道配置 / Notification Channel Configuration

#### 钉钉 / DingTalk

```json
{
  "type": "dingding",
  "settings": {
    "url": "https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN",
    "msgType": "markdown"
  }
}
```

#### 企业微信 / WeCom

```json
{
  "type": "wecom",
  "settings": {
    "webhook_url": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY"
  }
}
```

#### 飞书 / Feishu

```json
{
  "type": "feishu",
  "settings": {
    "webhook_url": "https://open.feishu.cn/open-apis/bot/v2/hook/YOUR_HOOK"
  }
}
```

---

## 7. 监控集成示例 / Monitoring Integration Examples

### Docker Compose 集成

```yaml
version: '3.8'
services:
  ultrawork:
    image: ultrawork/ai:latest
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config
  
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
  
  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - ./grafana/dashboards:/var/lib/grafana/dashboards
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
```

### Kubernetes 部署

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: ultrawork-mcp
  labels:
    release: prometheus
spec:
  selector:
    matchLabels:
      app: ultrawork
  endpoints:
    - port: http
      path: /api/mcp/metrics
      interval: 10s
```

---

## 8. 故障排查 / Troubleshooting

### 常见问题 / Common Issues

| 问题 | 解决方案 |
|------|----------|
| 指标端点返回 404 | 检查 MCP 是否正确加载 |
| Prometheus 无法抓取 | 检查网络连接和防火墙 |
| Grafana 无数据 | 检查数据源配置 |
| 告警不触发 | 检查告警规则语法 |

### 调试命令 / Debug Commands

```bash
# 检查指标端点
curl http://localhost:3000/api/mcp/metrics

# 检查健康状态
curl http://localhost:3000/api/mcp/health

# 检查 Prometheus 配置
promtool check config prometheus.yml

# 测试告警规则
promtool check rules alert-rules.yml
```

---

*文档版本 / Document Version: 1.0*
*最后更新 / Last Updated: 2026-03-21*
