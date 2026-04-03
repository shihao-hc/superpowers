# TradingAgents-CN 在线演示环境部署

本文档介绍如何将 TradingAgents-CN 部署到云端，创建可公开访问的在线演示站点。

## 部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                        用户浏览器                              │
└─────────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Cloudflare CDN                          │
│                   (免费 SSL + 加速)                           │
└─────────────────────────────┬─────────────────────────────────┘
                            │
          ┌─────────────────┴─────────────────┐
          ▼                                   ▼
┌─────────────────────┐             ┌─────────────────────┐
│   Vercel            │             │   Railway/Render    │
│   (前端静态部署)      │             │   (后端 API)        │
│   - Vue3             │             │   - FastAPI         │
│   - 自动 HTTPS       │             │   - WebSocket       │
└─────────────────────┘             └──────────┬──────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    ▼                      ▼                      ▼
          ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
          │   Railway       │    │   MongoDB Atlas │    │   Redis Cloud  │
          │   (PostgreSQL) │    │   (数据库)      │    │   (缓存)        │
          └─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 前端部署到 Vercel

### 1. 准备前端代码

确保 `frontend/vite.config.ts` 配置正确：

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_WS_URL || 'ws://localhost:8000',
        ws: true,
      },
    },
  },
})
```

### 2. 部署到 Vercel

```bash
# 安装 Vercel CLI
npm i -g vercel

# 登录
vercel login

# 部署
cd frontend
vercel --prod

# 设置环境变量
vercel env add VITE_API_URL
# 输入: https://api.tradingagents.example.com

vercel env add VITE_WS_URL
# 输入: wss://api.tradingagents.example.com
```

### 3. GitHub 集成部署

1. 在 GitHub 创建仓库
2. 连接 GitHub 到 Vercel
3. 设置构建命令：`npm run build`
4. 设置输出目录：`dist`
5. 添加环境变量

## 后端部署到 Railway

### 1. 准备后端代码

确保 `app/main.py` 或 `tradingagents/api/app.py` 存在入口点。

### 2. 部署到 Railway

```bash
# 安装 Railway CLI
npm i -g @railway/cli

# 登录
railway login

# 初始化
cd tradingagents-cn
railway init

# 部署
railway up
```

### 3. 配置环境变量

在 Railway 仪表盘设置：

| 变量 | 值 | 说明 |
|------|-----|------|
| `LLM_PROVIDER` | `deepseek` | LLM 提供商 |
| `DEEPSEEK_API_KEY` | `sk-xxx` | API 密钥 |
| `REDIS_URL` | `redis://xxx` | Redis 连接 |
| `MONGODB_URL` | `mongodb://xxx` | MongoDB 连接 |
| `ENABLE_WEB_SEARCH` | `true` | 启用联网搜索 |
| `TAVILY_API_KEY` | `tvly-xxx` | Tavily API Key |

### 4. 域名绑定

在 Railway 仪表盘 → Settings → Networking → Custom Domain 添加自定义域名。

## 使用 Render 替代 Railway

### 1. 创建 Web Service

1. 访问 [render.com](https://render.com)
2. 创建新的 Web Service
3. 连接 GitHub 仓库
4. 设置：
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn tradingagents.api.app:app --host 0.0.0.0 --port $PORT`

### 2. 环境变量

在 Render 仪表盘添加相同的环境变量。

## 数据库服务

### MongoDB Atlas

```bash
# 创建免费集群
# 1. 访问 mongodb.com/atlas
# 2. 创建免费 M0 集群
# 3. 创建数据库用户
# 4. 获取连接字符串
```

连接字符串格式：
```
mongodb+srv://username:password@cluster.mongodb.net/tradingagents?retryWrites=true&w=majority
```

### Redis Cloud

```bash
# 创建免费 Redis 实例
# 1. 访问 redis.cloud
# 2. 创建免费订阅
# 3. 获取连接字符串
```

## Nginx 反向代理

如果使用自定义域名和 VPS：

```nginx
# /etc/nginx/sites-available/api.tradingagents.example.com

server {
    listen 80;
    server_name api.tradingagents.example.com;

    # API 代理
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket 代理
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }

    # SSL 配置 (使用 Let's Encrypt)
    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/api.tradingagents.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.tradingagents.example.com/privkey.pem;
}
```

启用 SSL：
```bash
sudo apt install certbot
sudo certbot --nginx -d api.tradingagents.example.com
```

## 完整部署检查清单

### 前端
- [ ] Vercel 部署成功
- [ ] 环境变量配置正确
- [ ] 自定义域名绑定
- [ ] SSL 证书生效
- [ ] API 代理配置正确

### 后端
- [ ] Railway/Render 部署成功
- [ ] 健康检查通过 (`/health`)
- [ ] 环境变量配置完整
- [ ] 数据库连接正常
- [ ] WebSocket 连接正常

### 集成测试

```bash
# 测试 API
curl https://api.tradingagents.example.com/health

# 测试 WebSocket
wscat -c wss://api.tradingagents.example.com/ws/test-task

# 测试分析接口
curl -X POST https://api.tradingagents.example.com/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"company":"000001.SZ","trade_date":"2026-03-22"}'
```

## 监控配置

### Prometheus 端点

部署后确认指标端点可访问：
```
https://api.tradingagents.example.com/metrics
```

### Grafana 仪表盘

导入预配置的仪表盘 JSON。

## 费用估算

| 服务 | 方案 | 月费用 |
|------|------|--------|
| Vercel | Free (100GB 带宽) | $0 |
| Railway | Starter | $5 |
| MongoDB Atlas | M0 Free | $0 |
| Redis Cloud | 30MB Free | $0 |
| 域名 | .example.com | $10-15/年 |

总计：约 $5/月 起

## 故障排除

### 前端无法连接 API

1. 检查浏览器控制台错误
2. 确认 `VITE_API_URL` 环境变量
3. 检查 CORS 配置
4. 验证 API 健康状态

### WebSocket 连接失败

1. 检查 Nginx/WebSocket 代理配置
2. 确认 WebSocket 超时设置
3. 检查防火墙规则

### 数据库连接失败

1. 检查连接字符串
2. 确认 IP 白名单设置
3. 验证用户名密码

## 自动化部署

使用 GitHub Actions：

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: frontend

  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: railway-deploy-action@v1
        with:
          railway-token: ${{ secrets.RAILWAY_TOKEN }}
```
