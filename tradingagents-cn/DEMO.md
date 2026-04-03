# TradingAgents-CN Demo Environment

## 快速启动

### 方式一：使用 Mock LLM（无需 API Key）

```bash
# 启动演示环境
docker-compose -f docker-compose.demo.yml up -d

# 查看服务状态
docker-compose -f docker-compose.demo.yml ps

# 查看日志
docker-compose -f docker-compose.demo.yml logs -f api
```

访问服务：
- **前端界面**: http://localhost:3000
- **API 文档**: http://localhost:8000/docs
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

### 方式二：使用 Ollama 本地模型

```bash
# 1. 确保 Ollama 已安装并运行
ollama serve

# 2. 拉取模型
ollama pull llama3
ollama pull qwen2

# 3. 配置环境变量
export LLM_PROVIDER=ollama
export OLLAMA_MODEL=llama3

# 4. 启动
docker-compose -f docker-compose.demo.yml up -d
```

### 方式三：使用云端 LLM

```bash
# 编辑 .env 文件
cat > .env << EOF
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxxxx
TAVILY_API_KEY=tvly-xxxxx
EOF

docker-compose -f docker-compose.demo.yml up -d
```

## 演示功能

### 1. 股票分析（Mock 模式）

```
1. 访问 http://localhost:3000
2. 输入股票代码：000001.SZ
3. 点击"开始分析"
4. 观察实时进度动画
5. 查看分析结果
```

### 2. 代码审查

```
1. 访问 http://localhost:3000/code-review
2. 输入代码片段
3. 选择语言
4. 查看审查报告
```

### 3. 多智能体辩论

观察 4 位分析师的并发分析和辩论决策过程：
- 市场分析师
- 基本面分析师
- 新闻分析师
- 情绪分析师

### 4. RAG 增强（需要 Tavily API）

```python
from tradingagents.tools.tavily_search import create_tavily_rag_tool
from tradingagents.llm import create_llm_adapter

rag_tool = create_tavily_rag_tool(api_key="tvly-xxx")
llm = create_llm_adapter("ollama", model="llama3")

context = "分析 AAPL 股票..."
enhanced = await rag_tool.enhance_with_search(
    query="AAPL 最新消息",
    context=context
)
```

## 服务端口

| 服务 | 端口 | 说明 |
|------|------|------|
| API | 8000 | FastAPI 后端 |
| Frontend | 3000 | Vue3 前端 |
| Prometheus | 9090 | 指标收集 |
| Grafana | 3001 | 可视化仪表盘 |
| Ollama | 11434 | 本地模型 |
| Redis | 6379 | 缓存 |
| MongoDB | 27017 | 审计日志 |

## 停止环境

```bash
# 停止服务
docker-compose -f docker-compose.demo.yml down

# 清理数据
docker-compose -f docker-compose.demo.yml down -v
```

## 故障排除

### 前端无法连接 API

```bash
# 检查 API 是否运行
curl http://localhost:8000/health

# 查看 API 日志
docker-compose -f docker-compose.demo.yml logs api
```

### Ollama 模型加载失败

```bash
# 检查 Ollama 状态
curl http://localhost:11434/api/tags

# 查看可用模型
docker-compose -f docker-compose.demo.yml logs ollama
```

### WebSocket 连接失败

确保前端配置的 `VITE_WS_URL` 与后端地址一致。

## 使用 Terraform 部署到云端

```bash
cd terraform

# 初始化
terraform init

# 预览
terraform plan

# 部署
terraform apply
```

支持的云平台：
- AWS
- 阿里云
- GCP
