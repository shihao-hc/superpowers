# MCP 部署检查清单 / MCP Deployment Checklist

## 部署前检查 / Pre-Deployment Checks

### 依赖安装 / Dependencies

- [ ] 所有依赖已安装 (`npm ci`)
- [ ] Node.js 版本 >= 18
- [ ] PM2 已安装 (如使用 PM2)

### 环境变量 / Environment Variables

- [ ] `.env` 或 `.env.production` 已创建
- [ ] `NODE_ENV=production` 已设置
- [ ] `API_KEY` 已配置 (随机安全密钥)
- [ ] `ALLOWED_ORIGINS` 已配置 (生产域名)

### MCP 配置 / MCP Configuration

- [ ] `config/mcp-servers.json` 已配置
- [ ] `GITHUB_TOKEN` 已配置 (如启用 GitHub)
- [ ] `BRAVE_API_KEY` 已配置 (如启用搜索)
- [ ] `CHROME_DEBUG_PORT` 已配置 (如启用 DevTools)

---

## 服务配置检查 / Service Configuration Checks

### GitHub 服务 / GitHub Service

- [ ] GitHub Token 有效
- [ ] Token 权限正确 (repo, issues)
- [ ] `config/mcp-servers.json` 中 `github.enabled: true`

### Chrome DevTools / Chrome DevTools

- [ ] Chrome 已安装
- [ ] 调试端口 (9222) 可访问
- [ ] 无头模式配置正确 (如需要)

### Context7 / Context7

- [ ] API Key 已配置 (如使用 API)
- [ ] 代理配置正确 (如需要)

### 文件系统 / FileSystem

- [ ] Roots 目录存在
- [ ] 目录权限正确 (可读写)
- [ ] 临时目录 `/tmp` 可用

### 存储 / Storage

- [ ] `MCP_STORAGE_PATH` 目录可写
- [ ] 数据库目录存在

---

## 构建与启动 / Build & Start

### 构建 / Build

- [ ] 前端构建完成 (如需要)
- [ ] 构建产物复制到正确位置

### 启动 / Start

- [ ] PM2 配置完成
- [ ] 或 systemd 服务文件配置完成
- [ ] 或 Docker 容器已构建

### 反向代理 / Reverse Proxy

- [ ] Nginx 配置完成
- [ ] SSL 证书配置正确
- [ ] 端口映射正确 (80, 443)

---

## 安全配置 / Security Configuration

- [ ] API 鉴权已启用
- [ ] CORS 配置正确 (`ALLOWED_ORIGINS`)
- [ ] Roots 动态添加已禁用 (生产环境)
- [ ] Dry-run 强制启用 (`MCP_DRY_RUN_REQUIRED=true`)
- [ ] 敏感信息未记录到日志
- [ ] 输入校验已启用

---

## 健康检查 / Health Checks

### API 端点 / API Endpoints

- [ ] `GET /api/mcp/health` 返回 `healthy`
- [ ] `GET /api/mcp/status` 返回正确状态
- [ ] `GET /api/mcp/metrics` 返回 Prometheus 指标
- [ ] `GET /api/mcp/annotations` 返回工具注解

### 前端页面 / Frontend Pages

- [ ] `GET /frontend/mcp-dashboard.html` 可访问
- [ ] `GET /frontend/mcp-annotation-ui.html` 可访问
- [ ] `GET /frontend/mcp-dryrun.html` 可访问
- [ ] `GET /frontend/mcp-thinking-chain.html` 可访问
- [ ] `GET /frontend/mcp-roots.html` 可访问

---

## 功能验证 / Functionality Verification

### 工具市场 / Tool Market

- [ ] 工具列表加载正常
- [ ] 注解标签显示正确
- [ ] 工具筛选功能正常
- [ ] 搜索功能正常

### Dry-run / Dry-run

- [ ] 预览功能正常
- [ ] Diff 视图显示正确
- [ ] 历史记录保存正常
- [ ] 确认执行功能正常

### 思维链 / Thinking Chain

- [ ] 创建思维链正常
- [ ] 添加步骤正常
- [ ] 创建分支正常
- [ ] 添加反思正常

### Roots 管理 / Roots Management

- [ ] Roots 列表显示正常
- [ ] 添加 Root 正常
- [ ] 删除 Root 正常
- [ ] 路径验证正常
- [ ] 沙箱创建正常

---

## 监控与告警 / Monitoring & Alerting

- [ ] Prometheus 抓取配置正确
- [ ] Grafana 仪表盘导入
- [ ] 告警规则已配置
- [ ] 通知渠道已配置 (钉钉/飞书等)

---

## 日志管理 / Log Management

- [ ] 日志轮转已配置
- [ ] 日志级别正确 (production: info/warn/error)
- [ ] 日志输出到文件

---

## 防火墙 / Firewall

- [ ] HTTP 端口 (80) 开放
- [ ] HTTPS 端口 (443) 开放
- [ ] 非必要端口已关闭

---

## 备份 / Backup

- [ ] 数据库备份计划已配置
- [ ] 配置文件备份已完成
- [ ] 恢复流程已测试

---

## 文档 / Documentation

- [ ] 用户手册已分发
- [ ] 运维文档已更新
- [ ] 故障响应流程已定义

---

## 签署确认 / Sign-off

| 角色 | 姓名 | 日期 | 签名 |
|------|------|------|------|
| 开发 / Developer | | | |
| 测试 / QA | | | |
| 运维 / DevOps | | | |
| 安全 / Security | | | |

---

## 快速验证命令 / Quick Verification Commands

```bash
# 1. 检查健康状态
curl http://localhost:3000/api/mcp/health

# 2. 检查 MCP 状态
curl http://localhost:3000/api/mcp/status

# 3. 检查工具数量
curl http://localhost:3000/api/mcp/annotations | jq '.count'

# 4. 检查 Prometheus 指标
curl http://localhost:3000/api/mcp/metrics | head -20

# 5. 检查前端页面
curl -I http://localhost:3000/frontend/mcp-dashboard.html

# 6. 检查进程状态 (PM2)
pm2 status

# 7. 检查 Docker 容器 (Docker)
docker ps

# 8. 检查日志
tail -f logs/ultrawork.log
```

---

*检查清单版本 / Checklist Version: 1.0*
*最后更新 / Last Updated: 2026-03-21*
