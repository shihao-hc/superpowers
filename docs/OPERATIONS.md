# UltraWork AI 运维手册

## 1. 部署指南

### 1.1 环境变量

```bash
# 必需
API_KEY=your-secret-api-key
JWT_SECRET=your-jwt-secret-32-chars

# 可选
REDIS_URL=redis://localhost:6379
OLLAMA_HOST=http://localhost:11434
ALLOWED_ORIGINS=http://localhost:3000,https://your-domain.com
TRUST_PROXY=true
NODE_ENV=production
PORT=3000
```

### 1.2 Docker 部署

```bash
# 构建镜像
docker build -t ultrawork:latest .

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f ultrawork

# 停止服务
docker-compose down
```

### 1.3 PM2 部署

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
pm2 start ecosystem.config.js --env production

# 查看状态
pm2 status

# 查看日志
pm2 logs ultrawork

# 重启服务
pm2 restart ultrawork

# 保存配置
pm2 save
pm2 startup
```

### 1.4 Kubernetes 部署

```bash
# 创建命名空间
kubectl create namespace ultrawork

# 创建密钥
kubectl create secret generic ultrawork-secrets \
  --from-literal=api-key=YOUR_API_KEY \
  -n ultrawork

# 部署应用
kubectl apply -f k8s/deployment.yaml

# 查看状态
kubectl get pods -n ultrawork
kubectl get svc -n ultrawork
kubectl get ingress -n ultrawork
```

### 1.5 证书申请

```bash
# 使用 cert-manager (K8s)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/latest/download/cert-manager.yaml

# 创建 ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

## 2. 常见故障排查

### 2.1 OOM (Out of Memory)

**症状**: 进程被杀死，日志显示 `OOM killer`

**排查**:
```bash
# 查看内存使用
pm2 monit
docker stats ultrawork

# 查看 OOM 日志
dmesg | grep -i "oom\|kill"
```

**解决**:
- 增加 `max_memory_restart` 配置
- 检查内存泄漏（堆快照）
- 减少 `maxConcurrent` 参数
- 增加服务器内存

### 2.2 网络策略问题

**症状**: 服务间无法通信

**排查**:
```bash
# 测试连接
kubectl exec -it pod-name -- curl http://service:port/health

# 查看网络策略
kubectl get networkpolicies -n ultrawork

# 查看 DNS 解析
kubectl exec -it pod-name -- nslookup service-name
```

**解决**:
- 检查 NetworkPolicy 配置
- 确认 Service 名称和端口
- 检查防火墙规则

### 2.3 证书过期

**症状**: HTTPS 连接失败

**排查**:
```bash
# 查看证书状态
kubectl get certificates -n ultrawork
kubectl describe certificate ultrawork-tls -n ultrawork

# 手动检查证书
openssl s_client -connect your-domain.com:443 -servername your-domain.com
```

**解决**:
- 检查 cert-manager 日志
- 手动续期: `kubectl delete certificate ultrawork-tls -n ultrawork`
- 检查 DNS 验证记录

### 2.4 高延迟

**症状**: API 响应缓慢

**排查**:
```bash
# 查看资源使用
pm2 monit
kubectl top pods -n ultrawork

# 查看日志
pm2 logs ultrawork --lines 100
kubectl logs deployment/ultrawork -n ultrawork --tail=100

# 压力测试
node scripts/stress-test.js http://localhost:3000 20 60
```

**解决**:
- 增加副本数量
- 检查 Redis 连接
- 优化数据库查询
- 增加缓存

### 2.5 Redis 连接失败

**症状**: 缓存不工作

**排查**:
```bash
# 测试 Redis 连接
redis-cli ping

# 查看 Redis 状态
docker exec redis redis-cli info memory

# 查看应用日志
pm2 logs ultrawork | grep -i redis
```

**解决**:
- 检查 Redis URL 配置
- 确认 Redis 服务运行
- 检查网络连通性

## 3. 备份策略

### 3.1 数据备份

```bash
# Redis 备份
docker exec redis redis-cli BGSAVE
docker cp redis:/data/dump.rdb ./backups/redis-$(date +%Y%m%d).rdb

# 应用数据备份
tar -czf ./backups/app-data-$(date +%Y%m%d).tar.gz ./data/

# 自动备份脚本
cat > /etc/cron.daily/ultrawork-backup << 'EOF'
#!/bin/bash
BACKUP_DIR=/opt/backups/ultrawork
mkdir -p $BACKUP_DIR
docker exec redis redis-cli BGSAVE
docker cp redis:/data/dump.rdb $BACKUP_DIR/redis-$(date +%Y%m%d).rdb
tar -czf $BACKUP_DIR/app-data-$(date +%Y%m%d).tar.gz /opt/ultrawork/data/
find $BACKUP_DIR -mtime +7 -delete
EOF
chmod +x /etc/cron.daily/ultrawork-backup
```

### 3.2 配置备份

```bash
# Git 备份配置
cd /opt/ultrawork
git add .
git commit -m "Backup: $(date)"
git push origin main
```

### 3.3 恢复演练

```bash
# 恢复 Redis
docker cp backups/redis-20260320.rdb redis:/data/dump.rdb
docker restart redis

# 恢复应用数据
tar -xzf backups/app-data-20260320.tar.gz -C /opt/ultrawork/

# 验证
curl http://localhost:3000/health
```

## 4. 监控告警

### 4.1 Prometheus 告警规则

```yaml
# prometheus/rules.yml
groups:
  - name: ultrawork
    rules:
      - alert: ServiceDown
        expr: up{job="ultrawork"} == 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "UltraWork service is down"

      - alert: HighErrorRate
        expr: rate(ultrawork_http_errors_total[5m]) / rate(ultrawork_http_requests_total[5m]) > 0.1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"

      - alert: HighMemory
        expr: ultrawork_memory_heap_bytes > 1.5e9
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High memory usage"
```

### 4.2 Grafana 仪表盘

导入 `monitoring/grafana/dashboards/ultrawork-industry.json` 到 Grafana。

## 5. 日常维护

### 5.1 日志查看

```bash
# PM2 日志
pm2 logs ultrawork --lines 100

# Docker 日志
docker logs ultrawork --tail 100 -f

# K8s 日志
kubectl logs deployment/ultrawork -n ultrawork --tail 100 -f
```

### 5.2 性能调优

```bash
# 压力测试
node scripts/stress-test.js http://localhost:3000 50 60 --suite

# 根据结果调整:
# - PM2 instances
# - maxConcurrent
# - Redis 缓存 TTL
# - Nginx worker_connections
```

### 5.3 安全审计

```bash
# 运行安全检查
node scripts/security-check.js

# npm audit
npm audit --production

# Docker 镜像扫描
trivy image ultrawork:latest
```
