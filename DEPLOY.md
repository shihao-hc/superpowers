# UltraWork 部署指南

## 环境要求

- Docker 20.10+
- Docker Compose 2.0+
- 最低配置: 4GB RAM, 2 CPU cores
- 推荐配置: 8GB+ RAM, 4+ CPU cores, GPU (用于 Ollama)

## 快速部署

### 1. 克隆项目

```bash
git clone https://github.com/your-repo/ultrawork.git
cd ultrawork
```

### 2. 配置环境变量

```bash
cp .env.production .env
nano .env  # 编辑配置
```

关键配置项:
- `ALLOWED_ORIGINS`: 允许访问的域名
- `OLLAMA_MODEL`: 使用的模型 (如 llama3.2, qwen2.5)
- `GRAFANA_PASSWORD`: Grafana 管理密码

### 3. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f ultrawork
```

### 4. 访问服务

- 主应用: http://your-server:3000
- Grafana 监控: http://your-server:3001 (默认 admin/ultrawork123)
- Prometheus: http://your-server:9090
- Minecraft: your-server:25565

## Nginx 反向代理配置

```nginx
server {
    listen 443 ssl http2;
    server_name ai.your-domain.com;

    ssl_certificate /etc/letsencrypt/live/ai.your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai.your-domain.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## PM2 部署 (无 Docker)

```bash
# 安装依赖
npm ci --production

# 配置环境
cp .env.production .env

# 启动服务
pm2 start ecosystem.config.js --env production

# 设置开机自启
pm2 startup
pm2 save
```

## 备份策略

### 自动备份 (Docker)

备份脚本已配置在 docker-compose.yml 中:
- 默认每日 02:00 执行
- 保留 7 天
- 可选上传到 S3

### 手动备份

```bash
docker-compose exec ultrawork tar -czf /backups/backup.tar.gz /app/.opencode
docker cp ultrawork:/backups/backup.tar.gz ./backup_$(date +%Y%m%d).tar.gz
```

### 从备份恢复

```bash
docker cp backup_20240101.tar.gz ultrawork:/tmp/backup.tar.gz
docker-compose exec ultrawork tar -xzf /tmp/backup.tar.gz -C /
docker-compose restart ultrawork
```

## 监控告警

### Grafana 仪表板

访问 http://your-server:3001 查看:
- 服务状态
- 请求速率
- 响应时间
- 资源使用率

### 告警配置

在 Grafana 中创建告警规则:
- 服务宕机
- 内存使用 > 90%
- CPU 使用 > 90%
- 响应时间 > 5s

## SSL 证书 (Let's Encrypt)

```bash
# 安装 certbot
apt install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d ai.your-domain.com

# 自动续期
certbot renew --dry-run
```

## 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建
docker-compose build ultrawork

# 重启服务
docker-compose up -d --no-deps ultrawork
```

## 故障排除

### 服务无法启动

```bash
docker-compose logs ultrawork
docker-compose exec ultrawork node -e "require('./src/personality/PersonalityManager')"
```

### Ollama 连接失败

```bash
docker-compose logs ollama
curl http://localhost:11434/api/tags
```

### Minecraft 连接失败

```bash
docker-compose logs mc-server
docker-compose exec mc-server rcon-cli list
```
