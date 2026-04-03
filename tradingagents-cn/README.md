# TradingAgents-CN

[![CI](https://github.com/tradingagents-cn/tradingagents-cn/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/tradingagents-cn/tradingagents-cn/actions)
[![codecov](https://codecov.io/gh/tradingagents-cn/tradingagents-cn/branch/main/graph/badge.svg)](https://codecov.io/gh/tradingagents-cn/tradingagents-cn)
[![Python](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Security Score](https://img.shields.io/badge/security-A%2B-brightgreen)](SECURITY_AUDIT.md)

多智能体股票分析系统 + 代码审查助手 + 法律/产品审查

基于 LangGraph 的多智能体系统，支持 A 股/港股/美股数据、LLM 多提供商、实时 WebSocket 推送、RAG 增强检索。

## 快速开始

详细设置指南见 [.github/QUICKSTART.md](.github/QUICKSTART.md)

## 功能特性

### 股票分析
- 4 位分析师并发执行：市场、基本面、新闻、情绪
- 看涨/看跌辩论 + 裁判裁决
- 风险评估（激进/保守/中立）
- 交易计划生成

### 多市场支持
- A 股：使用 AkShare 数据
- 港股/美股：使用 yfinance 数据
- 自动市场检测和符号规范化

### 代码审查
- 4 维度审查：静态分析、安全、性能、风格
- 批评者 vs 辩护者辩论
- 最终审查裁决

### 领域适配器
- **法律审查**：GDPR/CCPA 合规、合同审查、隐私政策分析
- **产品审查**：UX、性能、安全、市场契合度评估

### RAG 增强检索
- Tavily AI 搜索集成
- 金融/新闻领域搜索
- 自动上下文增强

### 监控告警
- Prometheus 指标 + Grafana 仪表盘
- LLM 成本追踪和预算告警
- Loguru 日志轮转（每天轮转，保留 30 天）
- MongoDB 审计日志
- 钉钉/企业微信/飞书告警

### 安全特性 (A+ 评分)
- CORS 白名单控制
- 速率限制（API + WebSocket）
- 请求大小限制
- 安全响应头
- 敏感数据脱敏
- OWASP Top 10 合规

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境

```bash
cp .env.example .env
# 编辑 .env 填入 API 密钥
```

```bash
# .env 示例
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-xxx
LOG_LEVEL=INFO
```

### 3. 运行测试

```bash
# 快速测试（无需 API 密钥）
python test_run.py --quick

# 完整测试（需要 API 密钥）
python test_run.py
```

### 4. Docker 部署

```bash
# 启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

## API 文档

启动后访问：http://localhost:8000/docs

### 股票分析

```bash
# 提交分析任务
curl -X POST http://localhost:8000/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"company":"000001.SZ","trade_date":"2026-03-22","llm_provider":"dashscope","risk_preference":"moderate"}'

# Request
{
  "company": "000001.SZ",
  "trade_date": "2026-03-22",
  "llm_provider": "dashscope",  // 可选: deepseek, openai, google
  "risk_preference": "moderate"  // 可选: conservative, moderate, aggressive
}

# Response
{
  "task_id": "xxx",
  "status": "completed",
  "analyst_reports": {...},
  "trading_plan": {
    "action": "buy",
    "position_size": 0.05,
    "entry_price_range": {"low": 10.0, "high": 10.5},
    "stop_loss": 9.5,
    "take_profit": 12.0
  }
}
```

### 代码审查

```bash
# 提交代码审查任务
curl -X POST http://localhost:8000/api/v1/code-review \
  -H "Content-Type: application/json" \
  -d '{"code":"def hello(): pass","language":"python","llm_provider":"dashscope"}'

# Request
{
  "code": "def hello(): print('world')",
  "language": "python",        // python, javascript, typescript, java, go, rust
  "file_path": "src/main.py",  // 可选
  "llm_provider": "dashscope"   // 可选
}

# Response
{
  "task_id": "xxx",
  "status": "completed",
  "final_verdict": "Code approved with minor suggestions",
  "critic_arguments": "...",
  "advocate_arguments": "..."
}
```

### 查询任务状态

```bash
# 获取任务列表
curl http://localhost:8000/api/v1/tasks?page=1&page_size=10

# 获取单个任务详情
curl http://localhost:8000/api/v1/tasks/{task_id}
```

### WebSocket 实时推送

```javascript
// 连接 WebSocket
const ws = new WebSocket('ws://localhost:8000/ws/{task_id}')

// 接收进度消息
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  
  if (msg.type === 'status') {
    // 进度更新
    console.log(`Progress: ${msg.data.progress * 100}%`)
    console.log(`Status: ${msg.data.status}`)
  } else if (msg.type === 'completed') {
    // 分析完成
    console.log('Result:', msg.data)
    ws.close()
  } else if (msg.type === 'error') {
    // 错误处理
    console.error('Error:', msg.error)
  }
}
```

### 健康检查

```bash
# API 健康检查
curl http://localhost:8000/health

# Prometheus 指标
curl http://localhost:8000/metrics
```

## 前端页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 股票分析 | `/` | 输入股票代码开始分析 |
| 代码审查 | `/code-review` | 输入代码进行审查 |
| 历史记录 | `/history` | 查看历史分析 |
| 设置 | `/settings` | 配置模型和告警 |

## 监控配置

### Prometheus

访问：http://localhost:9090

指标端点：`GET /metrics`

### Grafana

访问：http://localhost:3001 (admin/admin)

1. 添加数据源：`http://prometheus:9090`
2. 导入仪表盘或创建查询

#### 导入仪表盘

创建 `grafana/provisioning/dashboards/tradingagents.json`:

```json
{
  "dashboard": {
    "title": "TradingAgents-CN",
    "tags": ["tradingagents", "api"],
    "timezone": "browser",
    "panels": [
      {
        "title": "API 请求率",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{handler}}"
          }
        ]
      },
      {
        "title": "P95 延迟",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "p95"
          }
        ]
      },
      {
        "title": "LLM 调用成本",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(llm_cost_total[1h])",
            "legendFormat": "{{provider}} - ${{value}}/hour"
          }
        ]
      },
      {
        "title": "错误率",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total{status=~\"5..\"}[5m]) / rate(http_requests_total[5m])",
            "legendFormat": "Error Rate"
          }
        ]
      }
    ]
  }
}
```

然后配置 `grafana/provisioning/dashboards/dashboard.yml`:

```yaml
apiVersion: 1
providers:
  - name: 'TradingAgents'
    folder: ''
    type: file
    options:
      path: /etc/grafana/provisioning/dashboards
```

### 告警规则

告警规则位于 `prometheus/alerts.yml`：

- `APIHighLatency`: 延迟 > 1s
- `APIHighErrorRate`: 错误率 > 5%
- `HighLLMCost`: LLM 成本过高
- `DailyBudgetExceeded`: 日成本 > $100
- `ServiceDown`: 服务不可用

### Alertmanager

访问：http://localhost:9093

配置文件 `alertmanager.yml` 定义告警路由：

```yaml
global:
  resolve_timeout: 5m

route:
  group_by: ['alertname']
  receiver: 'webhook'

receivers:
  - name: 'webhook'
    webhook_configs:
      - url: 'http://api:8000/api/v1/alerts/webhook'
```

### 告警通知配置

#### 钉钉

```yaml
receivers:
  - name: 'dingtalk'
    webhook_configs:
      - url: 'https://oapi.dingtalk.com/robot/send?access_token=YOUR_TOKEN'
```

#### 企业微信

```yaml
receivers:
  - name: 'wechat'
    webhook_configs:
      - url: 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=YOUR_KEY'
```

## 项目结构

```
tradingagents-cn/
├── tradingagents/
│   ├── agents/              # 智能体
│   │   ├── analysts/        # 分析师
│   │   ├── researchers/     # 研究员
│   │   ├── risk_mgmt/       # 风险管理
│   │   └── trader/          # 交易员
│   ├── llm/                # LLM 适配器
│   │   ├── base_llm.py      # 基础接口
│   │   ├── factory.py       # 工厂函数
│   │   ├── openai_adapter.py
│   │   ├── deepseek_adapter.py
│   │   ├── google_adapter.py
│   │   ├── dashscope_adapter.py
│   │   ├── ollama_adapter.py  # 本地模型
│   │   └── mock_adapter.py    # 测试用
│   ├── tools/               # 工具
│   │   ├── akshare_provider.py  # A股数据
│   │   ├── multi_market_provider.py  # 多市场支持
│   │   ├── tavily_search.py     # RAG 搜索
│   │   ├── news_tools.py
│   │   └── cache.py         # 多级缓存
│   ├── services/            # 服务层
│   │   ├── preferences.py   # 用户偏好
│   │   ├── audit_logger.py  # 审计日志
│   │   └── batch_analysis.py # 批量分析
│   ├── graph/               # LangGraph 工作流
│   ├── api/                # FastAPI 后端
│   ├── monitoring/         # 监控告警
│   └── domain_adapters/    # 领域适配器
│       ├── base/            # 通用基类
│       ├── code_review/     # 代码审查
│       ├── legal/           # 法律审查
│       └── product_review/  # 产品审查
├── frontend/               # Vue3 前端
│   └── src/
│       ├── stores/          # Pinia 状态管理
│       ├── components/      # 组件
│       └── composables/     # 组合式函数
├── tests/                  # 单元测试
├── prometheus/             # Prometheus 配置
│   └── alerts.yml          # 告警规则
├── k8s/                    # Kubernetes 配置
├── terraform/              # Terraform 配置
├── .opencode/skills/       # Skills 文档
├── docker-compose.yml
└── requirements.txt
```

## LLM 支持

| 提供商 | 环境变量 | 模型 | 特点 |
|--------|----------|------|------|
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat | 高性价比 |
| 阿里云百炼 | `DASHSCOPE_API_KEY` | qwen-plus | 中文优化 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o | 通用强大 |
| Google | `GOOGLE_API_KEY` | gemini-1.5-flash | 长上下文 |
| Ollama | `OLLAMA_API_KEY` (可选) | llama3, qwen2 | 本地运行 |

### Ollama 本地模型

```bash
# 启动 Ollama 服务
ollama serve

# 使用示例
from tradingagents.llm import create_llm_adapter
llm = create_llm_adapter("ollama", model="llama3")
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | LLM 提供商 | deepseek |
| `DEEPSEEK_API_KEY` | DeepSeek 密钥 | - |
| `DASHSCOPE_API_KEY` | 阿里云密钥 | - |
| `OPENAI_API_KEY` | OpenAI 密钥 | - |
| `GOOGLE_API_KEY` | Google 密钥 | - |
| `OLLAMA_BASE_URL` | Ollama 地址 | http://localhost:11434 |
| `TAVILY_API_KEY` | Tavily 搜索密钥 | - |
| `LOG_LEVEL` | 日志级别 | INFO |
| `ENABLE_METRICS` | 启用指标 | true |
| `ENABLE_AUDIT_LOG` | 启用审计日志 | true |
| `REDIS_URL` | Redis 连接 | localhost:6379 |
| `MONGODB_URL` | MongoDB 连接 | localhost:27017 |
| `USE_MOCK_LLM` | 使用模拟 LLM | false |

## 开发

### 运行测试

```bash
pytest tests/ -v
```

### 代码格式

```bash
black tradingagents/
isort tradingagents/
```

## License

MIT
