# UltraWork AI - 生产部署指南

## 快速开始

### 1. 环境配置

```bash
# 复制示例配置文件
cp .env.production.example .env

# 编辑配置文件
nano .env  # 或使用其他编辑器
```

**关键配置项：**

| 变量 | 说明 | 示例 |
|------|------|------|
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 服务端口 | `3000` |
| `API_KEY` | API密钥（必须修改） | `随机字符串` |
| `ALLOWED_ORIGINS` | 允许的来源 | `https://your-domain.com` |
| `GITHUB_TOKEN` | GitHub访问令牌 | `ghp_xxx` |
| `CHROME_PATH` | Chrome路径 | `/usr/bin/google-chrome` |
| `MCP_STORAGE_PATH` | 数据存储路径 | `/var/lib/ultrawork/mcp` |
| `MCP_ALLOWED_ROOTS` | 允许的根目录 | `/data/projects,/tmp` |
| `REDIS_URL` | Redis连接 | `redis://localhost:6379` |
| `OLLAMA_HOST` | Ollama地址 | `http://localhost:11434` |
| `OLLAMA_MODEL` | 默认模型 | `llama3.2` |

### 2. Docker Compose 部署（推荐）

```bash
# 启动所有服务
docker-compose up -d

# 启动带监控的服务
docker-compose --profile monitoring up -d

# 启动带GPU支持
docker-compose --profile gpu up -d

# 查看服务状态
docker-compose ps
```

**服务端口：**

| 服务 | 端口 | 说明 |
|------|------|------|
| ultrawork | 3000 | 主应用 |
| redis | 6379 | 缓存 |
| ollama | 11434 | LLM推理 |
| nginx | 80, 443 | 反向代理 |
| prometheus | 9090 | 指标收集 |
| grafana | 3001 | 监控仪表盘 |

### 3. 直接部署（无Docker）

```bash
# 安装依赖
npm install --production

# 启动服务
npm run start-prod

# 或使用PM2
npm install -g pm2
pm2 start ecosystem.config.js --env production
```

## 验证部署

### 健康检查

```bash
# API健康
curl http://localhost:3000/api/mcp/health

# MCP状态
curl http://localhost:3000/api/mcp/status

# Prometheus指标
curl http://localhost:3000/api/mcp/metrics
```

### 监控验证

1. **Prometheus**: http://localhost:9090/targets
2. **Grafana**: http://localhost:3001 (admin/admin)
3. **Redis**: `redis-cli ping`

## Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/mcp {
        proxy_pass http://localhost:3000/api/mcp;
        add_header 'Access-Control-Allow-Origin' '*';
    }
}
```

### SSL配置（Let's Encrypt）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## Prometheus 指标

### 内置指标

- `mcp_calls_total` - MCP调用总数
- `mcp_calls_success_total` - 成功调用数
- `mcp_calls_failed_total` - 失败调用数
- `mcp_servers_connected` - 连接的服务数
- `mcp_tools_available` - 可用工具数
- `mcp_cache_hits_total` - 缓存命中
- `mcp_cache_misses_total` - 缓存未命中
- `mcp_call_duration_seconds` - 调用延迟

### Grafana 查询

```promql
# 工具调用QPS
rate(mcp_calls_total[5m])

# 错误率
rate(mcp_calls_failed_total[5m]) / rate(mcp_calls_total[5m])

# 缓存命中率
mcp_cache_hits_total / (mcp_cache_hits_total + mcp_cache_misses_total)

# P99延迟
histogram_quantile(0.99, rate(mcp_call_duration_seconds_bucket[5m]))
```

## Redis 缓存

### 缓存策略

- **只读工具**: `read_file`, `search_docs` 等启用缓存
- **写操作**: 清除相关缓存
- **TTL**: 默认 3600秒

### 手动测试

```bash
redis-cli
> KEYS *
> GET cache:mcp:tools:annotations
> FLUSHALL
```

## Ollama 集成

### 安装模型

```bash
ollama pull llama3.2
ollama pull qwen2.5
ollama pull deepseek-coder
ollama pull llava
```

### 测试Ollama

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "Hello"
}'
```

## 安全配置

### 路径验证

```javascript
// DryRunEngine.js 已实现
- 防止路径遍历 (..)
- Windows/Linux 兼容
- 文件大小限制: 10MB
- 历史记录限制: 1000条
```

### CORS 配置

```javascript
// 生产环境设置具体域名
ALLOWED_ORIGINS=https://your-domain.com
```

### API 密钥

```bash
# 生成强密钥
openssl rand -base64 32
```

## 故障排除

### 服务无法启动

```bash
# 检查端口占用
lsof -i :3000

# 查看日志
docker-compose logs ultrawork
```

### Redis 连接失败

```bash
# 检查Redis
redis-cli ping

# 重启Redis
docker-compose restart redis
```

### Ollama 模型加载失败

```bash
# 查看可用模型
curl http://localhost:11434/api/tags

# 重新拉取
ollama pull llama3.2
```

## 备份与恢复

### 数据备份

```bash
# 备份Redis
redis-cli SAVE
cp dump.rdb ./backups/

# 备份配置
tar -czf config-backup.tar.gz config/
```

### 恢复数据

```bash
# 恢复Redis
cp dump.rdb /data/redis/
docker-compose restart redis

# 恢复配置
tar -xzf config-backup.tar.gz
```

## 环境变量参考

完整的环境变量列表见 `.env.production.example`

## 相关文档

- [MCP-User-Guide-CN.md](MCP-User-Guide-CN.md)
- [MCP-Production-Deployment-Guide-CN.md](MCP-Production-Deployment-Guide-CN.md)
- [MCP-Monitoring-Guide-CN-EN.md](MCP-Monitoring-Guide-CN-EN.md)
