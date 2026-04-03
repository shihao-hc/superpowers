# UltraWork AI 快速入门指南

## 1. 一键安装

```bash
curl -fsSL https://raw.githubusercontent.com/user/ultrawork/main/scripts/install.sh | sudo bash
```

安装完成后访问 http://localhost:3000

## 2. Docker 部署

```bash
# 克隆项目
git clone https://github.com/user/ultrawork.git
cd ultrawork

# 启动服务
docker-compose up -d

# 查看状态
docker-compose ps
```

## 3. 基本使用

### 3.1 选择人格

访问 http://localhost:3000，点击人格卡片切换：

| 人格 | 特点 |
|------|------|
| 狐九 | 活泼可爱，喜欢颜文字 |
| 零 | 冷酷神秘，技术向 |
| 墨兰 | 古典优雅，文学气质 |
| 甜甜 | 元气满满，美食控 |

### 3.2 聊天对话

在输入框输入消息，按 Enter 发送：

```
你: 今天天气怎么样？
AI: 今天阳光明媚呢！(◕‿◕) 有什么想做的吗？
```

### 3.3 浏览器自动化

点击 "🌐 浏览器" 按钮，输入 URL 开始自动化：

```
打开 https://www.baidu.com
搜索最新AI新闻
```

### 3.4 价格监控

点击 "+ 添加商品" 开始监控：

1. 输入商品名称
2. 输入商品 URL
3. 设置目标价格
4. 保存

当价格低于目标价时自动告警。

### 3.5 工作流编排

点击 "🤖 新任务" 创建自动化任务：

```
任务描述: 打开百度搜索最新AI新闻
执行方式: 自动执行
```

## 4. API 使用

### 4.1 获取 API Key

编辑 `.env` 文件：

```bash
API_KEY=your-secret-key
```

### 4.2 发送请求

```bash
# 聊天
curl -X POST http://localhost:3000/api/chat \
  -H "X-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "你好"}'

# 获取价格监控商品
curl http://localhost:3000/api/price-monitor/products \
  -H "X-API-Key: your-key"

# 获取工作流列表
curl http://localhost:3000/api/workflows

# 获取行业领域列表
curl http://localhost:3000/api/vertical-domains \
  -H "X-API-Key: your-key"
```

## 5. 常用命令

```bash
# PM2 管理
pm2 status          # 查看状态
pm2 logs ultrawork  # 查看日志
pm2 restart ultrawork  # 重启
pm2 stop ultrawork     # 停止

# Docker 管理
docker-compose logs -f    # 查看日志
docker-compose restart    # 重启
docker-compose down       # 停止

# 压力测试
node scripts/stress-test.js http://localhost:3000 10 30
```

## 6. 行业解决方案

### 6.1 浏览行业方案

访问 http://localhost:3000/vertical-markets.html 查看所有行业解决方案，包括金融、医疗、制造、能源、农业、政府、交通、媒体等行业。

### 6.2 安装方案

在方案卡片上点击"安装"按钮，或通过API安装：

```bash
# 安装金融行业智能信用评分方案
curl -X POST http://localhost:3000/api/vertical-domains/finance/solutions/smart-credit-scoring/install \
  -H "X-API-Key: your-key"
```

### 6.3 导入演示数据

```bash
# 导入演示数据
curl -X POST http://localhost:3000/api/vertical-domains/finance/solutions/smart-credit-scoring/demo-data \
  -H "X-API-Key: your-key"
```

### 6.4 搜索方案

```bash
# 搜索包含"credit"的方案
curl "http://localhost:3000/api/vertical-domains/solutions/search?q=credit" \
  -H "X-API-Key: your-key"
```

### 6.5 查看热门方案

```bash
# 获取热门方案（按自动化率排序）
curl "http://localhost:3000/api/vertical-domains/solutions/popular?sortBy=automation" \
  -H "X-API-Key: your-key"
```

## 7. 监控

### 6.1 Prometheus 指标

访问 http://localhost:3000/metrics

### 6.2 健康检查

访问 http://localhost:3000/health

### 6.3 Grafana 仪表盘

导入 `monitoring/grafana/dashboards/ultrawork-industry.json`

## 8. 常见问题

### Q: 服务无法启动

```bash
# 检查端口占用
netstat -ano | findstr :3000

# 查看日志
pm2 logs ultrawork --lines 50
```

### Q: API 返回 401

检查 `.env` 中的 `API_KEY` 配置。

### Q: 价格监控不工作

确保商品 URL 可访问，检查网络连接。

## 9. 更多信息

- API 文档: `docs/openapi.yaml`
- 运维手册: `docs/OPERATIONS.md`
- GitHub: https://github.com/user/ultrawork
