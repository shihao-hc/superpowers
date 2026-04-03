# MCP 生产环境部署指南 / MCP Production Deployment Guide

## 一、部署架构 / Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Nginx (Reverse Proxy)                  │
│                    SSL Termination, Load Balance              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    UltraWork AI (Node.js)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │ MCP Router  │  │  REST API   │  │  WebSocket API  │   │
│  │ /api/mcp/* │  │   /api/*    │  │   /socket.io/*  │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                    MCP Plugin                          │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐  │  │
│  │  │FileSystem│  │ GitHub  │  │ Search  │  │ DevTools│  │  │
│  │  └─────────┘  └─────────┘  └─────────┘  └────────┘  │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│    Redis    │      │   Ollama    │      │  Minecraft  │
│   (Cache)   │      │   (LLM)     │      │   (Game)    │
└─────────────┘      └─────────────┘      └─────────────┘
```

---

## 二、环境变量配置 / Environment Variables

### 2.1 必需配置 / Required

```bash
# 应用配置 / Application
NODE_ENV=production
PORT=3000
API_KEY=your-secure-random-key-here
ALLOWED_ORIGINS=https://your-domain.com

# 代理配置 / Proxy
TRUST_PROXY=true

# MCP 配置 / MCP
MCP_CONFIG_PATH=/app/config/mcp-servers.json
```

### 2.2 MCP 服务配置 / MCP Services

```bash
# GitHub MCP (可选 / Optional)
GITHUB_TOKEN=ghp_xxxxxxxxxxxx

# Brave Search MCP (可选 / Optional)
BRAVE_API_KEY=BSAxxxxxxxxxxxx

# Chrome DevTools MCP (可选 / Optional)
CHROME_DEBUG_PORT=9222
CHROME_HOST=localhost
```

### 2.3 其他服务 / Other Services

```bash
# Redis (可选 / Optional)
REDIS_URL=redis://redis:6379

# Ollama (可选 / Optional)
INFERENCE_ENGINE=ollama
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=llama3.2

# Minecraft 游戏机器人 (可选 / Optional)
ENABLE_GAME=true
MINECRAFT_HOST=mc-server
MINECRAFT_PORT=25565
```

---

## 三、MCP 服务配置 / MCP Server Configuration

### 3.1 配置文件 / Configuration File

编辑 `config/mcp-servers.json`:

```json
{
  "mcpServers": {
    "filesystem": {
      "enabled": true,
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/app/data",
        "/app/uploads",
        "/tmp"
      ],
      "description": "文件操作服务"
    },
    "github": {
      "enabled": true,
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-github",
        "--token",
        "${GITHUB_TOKEN}"
      ],
      "description": "GitHub API 服务",
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "brave-search": {
      "enabled": false,
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-brave-search",
        "--brave-api-key",
        "${BRAVE_API_KEY}"
      ],
      "description": "Brave 搜索服务",
      "env": {
        "BRAVE_API_KEY": "${BRAVE_API_KEY}"
      }
    },
    "context7": {
      "enabled": true,
      "command": "npx",
      "args": ["-y", "@context7/mcp-server"],
      "description": "代码库分析服务"
    },
    "devtools": {
      "enabled": false,
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-chrome-devtools",
        "--port",
        "${CHROME_DEBUG_PORT:-9222}"
      ],
      "description": "Chrome 调试服务"
    }
  }
}
```

### 3.2 环境变量文件 / Environment File

创建 `.env.production`:

```bash
# ===========================================
# UltraWork AI - Production Environment
# ===========================================

# 应用配置
NODE_ENV=production
PORT=3000
API_KEY=change-this-to-a-secure-random-key
ALLOWED_ORIGINS=https://ultrawork.example.com

# MCP 配置
MCP_CONFIG_PATH=/app/config/mcp-servers.json

# GitHub MCP
GITHUB_TOKEN=

# Brave Search MCP
BRAVE_API_KEY=

# Chrome DevTools MCP
CHROME_DEBUG_PORT=9222
CHROME_HOST=chrome

# Redis
REDIS_URL=redis://redis:6379

# Ollama
INFERENCE_ENGINE=ollama
OLLAMA_HOST=http://ollama:11434
OLLAMA_MODEL=llama3.2

# 游戏机器人
ENABLE_GAME=false
```

---

## 四、Docker 部署 / Docker Deployment

### 4.1 Docker Compose 配置 / Configuration

```yaml
version: '3.8'

services:
  ultrawork:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: ultrawork-ai
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - API_KEY=${API_KEY}
      - ALLOWED_ORIGINS=${ALLOWED_ORIGINS}
      - MCP_CONFIG_PATH=/app/config/mcp-servers.json
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - BRAVE_API_KEY=${BRAVE_API_KEY}
      - REDIS_URL=redis://redis:6379
      - INFERENCE_ENGINE=ollama
      - OLLAMA_HOST=http://ollama:11434
    volumes:
      - ./config:/app/config:ro
      - ./data:/app/data
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    depends_on:
      - redis
      - ollama
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: ultrawork-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes

  ollama:
    image: ollama/ollama:latest
    container_name: ultrawork-ollama
    restart: unless-stopped
    ports:
      - "11434:11434"
    volumes:
      - ollama_data:/root/.ollama
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]

  nginx:
    image: nginx:alpine
    container_name: ultrawork-nginx
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
    depends_on:
      - ultrawork

  prometheus:
    image: prom/prometheus:latest
    container_name: ultrawork-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - prometheus_data:/prometheus

  grafana:
    image: grafana/grafana:latest
    container_name: ultrawork-grafana
    restart: unless-stopped
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_PASSWORD:-admin}
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro

volumes:
  redis_data:
  ollama_data:
  prometheus_data:
  grafana_data:
```

### 4.2 Nginx 配置 / Nginx Configuration

```nginx
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # 日志格式
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';

    access_log /var/log/nginx/access.log main;
    error_log /var/log/nginx/error.log warn;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json;

    # 上游服务器
    upstream ultrawork {
        server ultrawork:3000;
        keepalive 32;
    }

    server {
        listen 80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        server_name _;

        # SSL 配置
        ssl_certificate /etc/nginx/ssl/cert.pem;
        ssl_certificate_key /etc/nginx/ssl/key.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
        ssl_prefer_server_ciphers off;

        # 安全头
        add_header X-Frame-Options "SAMEORIGIN" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;

        # 静态资源
        location /frontend/ {
            alias /usr/share/nginx/html/frontend/;
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # API 代理
        location /api/ {
            proxy_pass http://ultrawork;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
        }

        # WebSocket 代理
        location /socket.io/ {
            proxy_pass http://ultrawork;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
        }

        # Prometheus 指标
        location /metrics {
            proxy_pass http://ultrawork;
            proxy_set_header Host $host;
        }
    }
}
```

---

## 五、部署步骤 / Deployment Steps

### 5.1 准备阶段 / Preparation

```bash
# 1. 克隆代码
git clone https://github.com/your-org/ultrawork-ai.git
cd ultrawork-ai

# 2. 配置环境变量
cp .env.example .env.production
vim .env.production

# 3. 配置 MCP 服务
vim config/mcp-servers.json

# 4. 创建必要目录
mkdir -p data uploads logs
chmod 755 data uploads logs
```

### 5.2 构建阶段 / Build

```bash
# 1. 构建 Docker 镜像
docker-compose build

# 2. 拉取 Ollama 模型
docker-compose exec ollama ollama pull llama3.2
```

### 5.3 部署阶段 / Deploy

```bash
# 1. 启动所有服务
docker-compose up -d

# 2. 查看服务状态
docker-compose ps

# 3. 查看日志
docker-compose logs -f ultrawork
```

### 5.4 验证阶段 / Verification

```bash
# 1. 检查健康状态
curl http://localhost:3000/health

# 2. 检查 MCP 状态
curl http://localhost:3000/api/mcp/status

# 3. 检查 MCP 健康
curl http://localhost:3000/api/mcp/health

# 4. 检查 Prometheus 指标
curl http://localhost:3000/api/mcp/metrics | head -20

# 5. 检查 Nginx 日志
docker-compose logs nginx
```

---

## 六、MCP 服务验证 / MCP Service Verification

### 6.1 工具市场验证 / Tool Market Verification

```bash
# 列出所有工具
curl -H "X-API-Key: $API_KEY" \
  http://localhost:3000/api/mcp/tools

# 获取工具注解
curl http://localhost:3000/api/mcp/annotations

# 获取注解摘要
curl http://localhost:3000/api/mcp/annotations/summary
```

### 6.2 Roots 管理验证 / Roots Management Verification

```bash
# 列出 Roots
curl http://localhost:3000/api/mcp/roots

# 验证路径
curl "http://localhost:3000/api/mcp/roots/validate?path=/app/data"

# 创建沙箱
curl -X POST http://localhost:3000/api/mcp/roots/sandbox
```

### 6.3 思维链验证 / Thinking Chain Verification

```bash
# 创建思维链
curl -X POST http://localhost:3000/api/mcp/thinking/chains \
  -H "Content-Type: application/json" \
  -d '{"initialThought": "测试思维链"}'

# 列出思维链
curl http://localhost:3000/api/mcp/thinking/chains
```

---

## 七、监控与告警 / Monitoring & Alerting

### 7.1 Prometheus 指标 / Prometheus Metrics

| 指标 | 说明 |
|------|------|
| `mcp_servers_connected` | 已连接 MCP 服务器数 |
| `mcp_tools_available` | 可用工具数 |
| `mcp_calls_total` | MCP 调用总数 |
| `mcp_calls_success_total` | 成功调用数 |
| `mcp_calls_failed_total` | 失败调用数 |
| `mcp_call_duration_seconds` | 调用延迟分布 |

### 7.2 告警规则 / Alert Rules

```yaml
groups:
  - name: mcp_alerts
    rules:
      - alert: MCPServerDown
        expr: mcp_servers_connected == 0
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "MCP 服务器全部离线"
          
      - alert: MCPHighErrorRate
        expr: rate(mcp_calls_failed_total[5m]) / rate(mcp_calls_total[5m]) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "MCP 调用错误率超过 5%"
```

---

## 八、故障排查 / Troubleshooting

### 8.1 常见问题 / Common Issues

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| MCP 服务器离线 | 配置错误或网络问题 | 检查 `config/mcp-servers.json` |
| 工具调用失败 | 权限不足 | 检查 API_KEY 配置 |
| 文件访问被拒绝 | 路径不在 Roots 内 | 在 Roots 管理中添加路径 |
| GitHub API 失败 | Token 无效或过期 | 更新 GITHUB_TOKEN |

### 8.2 日志查看 / Log Viewing

```bash
# 应用日志
docker-compose logs -f ultrawork

# MCP 日志
docker-compose logs -f ultrawork | grep MCP

# Nginx 日志
docker-compose logs nginx

# Prometheus 日志
docker-compose logs prometheus
```

### 8.3 调试命令 / Debug Commands

```bash
# 进入容器
docker exec -it ultrawork-ai bash

# 查看 MCP 进程
ps aux | grep mcp

# 测试 MCP 连接
curl http://localhost:3000/api/mcp/health

# 重启 MCP
docker-compose restart ultrawork
```

---

## 九、安全配置 / Security Configuration

### 9.1 API 认证 / API Authentication

```bash
# 生成安全的 API Key
openssl rand -hex 32

# 配置到环境变量
API_KEY=your-generated-key
```

### 9.2 CORS 配置 / CORS Configuration

```bash
# 生产环境必须设置
ALLOWED_ORIGINS=https://your-domain.com,https://www.your-domain.com
```

### 9.3 防火墙规则 / Firewall Rules

```bash
# 只开放必要端口
ufw allow 80/tcp   # HTTP
ufw allow 443/tcp  # HTTPS
ufw allow 3000/tcp  # 开发环境
```

---

*文档版本 / Document Version: 1.0*
*最后更新 / Last Updated: 2026-03-21*
