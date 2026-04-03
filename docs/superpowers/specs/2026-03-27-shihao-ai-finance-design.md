# 拾号-金融 AI 全自动化升级 - 设计文档

**项目名称**: ShiHao AI Finance System  
**版本**: v3.0  
**日期**: 2026-03-27  
**状态**: 待审查

---

## 1. 项目概述

### 1.1 目标

将现有拾号-金融项目升级为具备完整AI金融能力的垂直项目，覆盖个人投资者、专业交易员和量化团队三大用户群体。

### 1.2 核心能力 (按优先级)

| 阶段 | 能力 | 周期 |
|------|------|------|
| 阶段1 | 自主记忆系统 | 周1-2 |
| 阶段2 | 自动学习 + 多Agent | 周3-4 |
| 阶段3 | 主动调度 + 全渠道 | 周5-6 |

### 1.3 技术决策

| 维度 | 选择 |
|------|------|
| LLM策略 | 混合使用（Ollama本地 + GPT/Claude云） |
| 部署方式 | 本地开发 + 云端生产 |
| 预算策略 | 零成本起步，后续可扩展 |
| 开发周期 | 4-6周稳健版 |

---

## 2. 阶段1：自主记忆系统

### 2.1 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ShiHao Agent Core                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                  三层记忆系统                                 │    │
│  │  ┌─────────────────────────────────────────────────────────┐│    │
│  │  │ CORE MEMORY (核心记忆 - 常驻内存)                        ││    │
│  │  │ • persona: Agent人格定义                                 ││    │
│  │  │ • risk_profile: 风险偏好配置                             ││    │
│  │  │ • user_preferences: 用户偏好                             ││    │
│  │  └─────────────────────────────────────────────────────────┘│    │
│  │                              │                                │    │
│  │                              ▼                                │    │
│  │  ┌─────────────────────────────────────────────────────────┐│    │
│  │  │ RECALL MEMORY (会话记忆 - 向量检索)                      ││    │
│  │  │ • Mem0 + ChromaDB                                       ││    │
│  │  │ • 语义搜索：交易决策、市场分析、用户对话                 ││    │
│  │  └─────────────────────────────────────────────────────────┘│    │
│  │                              │                                │    │
│  │                              ▼                                │    │
│  │  ┌─────────────────────────────────────────────────────────┐│    │
│  │  │ ARCHIVAL MEMORY (档案记忆 - 冷存储)                      ││    │
│  │  │ • SQLite + 文件系统                                      ││    │
│  │  │ • 研究报告、回测结果、历史数据                           ││    │
│  │  └─────────────────────────────────────────────────────────┘│    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Memory 数据结构

```python
@dataclass
class CoreMemory:
    persona: str          # Agent人格 (max 2000 tokens)
    risk_profile: str     # 风险偏好 (max 1000 tokens)
    user_preferences: str # 用户偏好 (max 1000 tokens)
```

### 2.3 实现文件

```
python-backend/shihao_finance/agent/
├── __init__.py
├── core.py              # ShiHaoAgent 主类
├── memory/
│   ├── __init__.py
│   ├── core.py          # CoreMemory 实现
│   ├── recall.py        # RecallMemory (Mem0集成)
│   └── archival.py      # ArchivalMemory (SQLite)
└── tools/
    └── memory_tools.py  # 记忆操作工具
```

---

## 3. 阶段2：自动学习 + 多Agent

### 3.1 多Agent架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ShiHao Trading Crew                               │
├─────────────────────────────────────────────────────────────────────┤
│                      (Portfolio Manager)                             │
│                              │                                       │
│            ┌─────────────────┼─────────────────┐                    │
│            ▼                 ▼                 ▼                    │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐       │
│  │ Market Analyst  │ │ Risk Manager    │ │ Trade Executor  │       │
│  │ (市场分析师)     │ │ (风险经理)       │ │ (交易执行员)    │       │
│  ├─────────────────┤ ├─────────────────┤ ├─────────────────┤       │
│  │ 工具:           │ │ 工具:           │ │ 工具:           │       │
│  │ • ashare_api    │ │ • risk_metrics  │ │ • trading_api   │       │
│  │ • highfreq_api  │ │ • backtest_api  │ │ • order_manager │       │
│  │ • policy_api    │ │ • alert_system  │ │ • market_data   │       │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘       │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Research Team                              │    │
│  │  News Analyst │ Policy Expert │ Sentiment Analyst            │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 自动学习循环

```
Trade → Track → Analyze → Extract → Update → Improve
  │                                              │
  └──────────── 下次决策更优 ◀──────────────────┘
```

### 3.3 实现文件

```
python-backend/shihao_finance/agent/
├── agents.py            # CrewAI Agent定义
├── crew.py              # Crew编排配置
├── learning.py          # SelfImprovingAgent实现
└── patterns.py          # 模式提取和技能生成
```

---

## 4. 阶段3：主动调度 + 全渠道

### 4.1 调度任务配置

| 任务 | 频率 | 功能 |
|------|------|------|
| morning_analysis | 每日 09:25 | 开盘前分析 |
| intraday_monitor | 每5分钟 | 盘中监控 |
| daily_review | 每日 15:30 | 收盘复盘 |
| weekly_strategy | 周日 20:00 | 周度策略 |
| weekly_report | 周一 09:00 | 周报生成 |

### 4.2 渠道配置

| 渠道 | 优先级 | 用途 |
|------|--------|------|
| Telegram | Critical/High/Normal | 即时通讯 |
| Discord | Critical/High | 社区通知 |
| 微信 | Critical/High | 国内用户 |
| Email | Low | 日报/周报 |
| WebSocket | All | 前端实时推送 |

### 4.3 实现文件

```
python-backend/shihao_finance/agent/
├── scheduler.py         # APScheduler配置
├── triggers.py          # 事件触发器
└── channels/
    ├── __init__.py
    ├── base.py          # BaseChannel基类
    ├── telegram.py      # Telegram适配器
    ├── discord.py       # Discord适配器
    ├── wechat.py        # 微信适配器
    ├── email.py         # Email适配器
    └── hub.py           # NotificationHub
```

---

## 5. 依赖项

### 5.1 Python包

```txt
# 核心依赖
crewai>=1.12.0
mem0ai>=0.1.0
apscheduler>=3.10.0

# 渠道依赖
python-telegram-bot>=20.0
discord.py>=2.0.0
aiosmtplib>=2.0.0
httpx>=0.25.0

# 向量存储
chromadb>=0.4.0

# 现有依赖（保持不变）
fastapi>=0.100.0
uvicorn>=0.20.0
pandas>=2.0.0
numpy>=1.24.0
scikit-learn>=1.3.0
```

### 5.2 外部服务

| 服务 | 用途 | 成本 |
|------|------|------|
| Ollama (本地) | 本地LLM推理 | 免费 |
| OpenAI API | 备用LLM | 按量付费 |
| Anthropic API | 备用LLM | 按量付费 |
| Telegram Bot | 即时通讯 | 免费 |
| Discord Bot | 社区通知 | 免费 |

---

## 6. 目录结构

```
shihao-web/python-backend/
├── shihao_finance/
│   ├── agent/                    # AI Agent核心 (新增)
│   │   ├── __init__.py
│   │   ├── core.py              # ShiHaoAgent主类
│   │   ├── agents.py            # CrewAI Agent定义
│   │   ├── crew.py              # Crew编排
│   │   ├── learning.py          # 自动学习系统
│   │   ├── scheduler.py         # 主动调度
│   │   ├── patterns.py          # 模式提取
│   │   ├── triggers.py          # 事件触发器
│   │   ├── memory/              # 记忆系统
│   │   │   ├── core.py
│   │   │   ├── recall.py
│   │   │   └── archival.py
│   │   ├── channels/            # 渠道适配器
│   │   │   ├── base.py
│   │   │   ├── telegram.py
│   │   │   ├── discord.py
│   │   │   ├── wechat.py
│   │   │   ├── email.py
│   │   │   └── hub.py
│   │   └── tools/               # Agent工具
│   │       └── memory_tools.py
│   ├── api/                     # 现有API (保持不变)
│   ├── core/                    # 现有核心 (保持不变)
│   └── config/
├── tests/
│   └── agent/                   # Agent测试
│       ├── test_memory.py
│       ├── test_agents.py
│       ├── test_learning.py
│       └── test_scheduler.py
└── requirements.txt
```

---

## 7. 实施计划

### Phase 1: 基础架构 (周1-2)

| 任务 | 产出 | 验证 |
|------|------|------|
| 实现CoreMemory | 记忆数据结构 | 单元测试 |
| 集成Mem0向量存储 | RecallMemory | 搜索测试 |
| 实现ArchivalMemory | SQLite存储 | 读写测试 |
| ShiHaoAgent主类 | Agent框架 | 集成测试 |

### Phase 2: 多Agent + 学习 (周3-4)

| 任务 | 产出 | 验证 |
|------|------|------|
| 定义CrewAI Agents | 6个专业角色 | 角色测试 |
| 实现Crew编排 | 协作流程 | 端到端测试 |
| 自动学习循环 | 学习系统 | 回测验证 |
| 模式提取 | 技能生成 | 准确性测试 |

### Phase 3: 调度 + 渠道 (周5-6)

| 任务 | 产出 | 验证 |
|------|------|------|
| APScheduler集成 | 定时任务 | 调度测试 |
| 事件触发器 | 异常检测 | 触发测试 |
| Telegram适配器 | 消息发送 | 发送测试 |
| 全渠道网关 | 通知分发 | 端到端测试 |

---

## 8. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM API限制 | 分析延迟 | Ollama本地降级 |
| 记忆系统复杂度 | 开发延期 | 分阶段实现 |
| 渠道API变更 | 功能失效 | 抽象适配层 |
| 性能瓶颈 | 响应慢 | 缓存 + 异步 |

---

## 9. 成功标准

### 9.1 功能性

- [ ] 三层记忆系统正常工作
- [ ] 多Agent协作分析完成
- [ ] 自动学习循环运行
- [ ] 定时任务按计划执行
- [ ] 至少2个渠道接入成功

### 9.2 性能

- [ ] Agent响应时间 < 10秒
- [ ] 记忆检索时间 < 1秒
- [ ] 定时任务执行偏差 < 1分钟

### 9.3 可靠性

- [ ] 系统可用性 > 99%
- [ ] 记忆持久化无丢失
- [ ] 渠道发送成功率 > 95%

---

## 11. API 文档

### 11.1 Agent API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/agent/analyze` | POST | 触发AI分析 |
| `/api/agent/memory/search` | GET | 搜索记忆 |
| `/api/agent/memory/core` | GET/PUT | 获取/更新核心记忆 |
| `/api/agent/status` | GET | Agent状态查询 |
| `/api/agent/trades` | GET | 交易历史查询 |

### 11.2 记忆操作 API

```python
# 核心记忆操作
GET    /api/agent/memory/core          # 获取核心记忆
PUT    /api/agent/memory/core          # 更新核心记忆
POST   /api/agent/memory/recall        # 搜索会话记忆
POST   /api/agent/memory/archival      # 归档记忆

# 示例请求
PUT /api/agent/memory/core
{
    "block": "user_preferences",
    "content": "偏好行业：科技、新能源、消费"
}
```

### 11.3 调度任务 API

```python
# 任务管理
GET    /api/agent/scheduler/jobs       # 获取任务列表
POST   /api/agent/scheduler/jobs       # 创建任务
DELETE /api/agent/scheduler/jobs/{id}  # 删除任务
POST   /api/agent/scheduler/jobs/{id}/run  # 立即执行
```

### 11.4 渠道管理 API

```python
# 渠道配置
GET    /api/agent/channels             # 获取渠道列表
POST   /api/agent/channels/test        # 测试渠道连接
POST   /api/agent/notifications/send   # 发送通知

# 示例请求
POST /api/agent/notifications/send
{
    "title": "测试通知",
    "content": "这是一条测试消息",
    "priority": "high",
    "channels": ["telegram", "wechat"]
}
```

---

## 12. 性能基准测试

### 12.1 测试场景

| 场景 | 并发数 | 指标 | 目标值 |
|------|--------|------|--------|
| 单Agent分析 | 1 | 响应时间 | < 10s |
| 多Agent协作 | 1 | 响应时间 | < 30s |
| 记忆检索 | 10 | 延迟 | < 1s |
| 批量通知 | 100 | 吞吐量 | > 50/s |
| 定时任务 | 10 | 执行偏差 | < 1min |

### 12.2 基准测试脚本

```python
# tests/agent/benchmarks.py

import asyncio
import time
from shihao_finance.agent import ShiHaoAgent

async def benchmark_agent_analysis():
    """分析性能基准测试"""
    agent = ShiHaoAgent()
    
    start = time.time()
    result = await agent.analyze({
        "tickers": ["600519", "300750", "000858"],
        "context": "benchmark"
    })
    elapsed = time.time() - start
    
    assert elapsed < 10.0, f"分析耗时过长: {elapsed}s"
    print(f"✅ Agent分析: {elapsed:.2f}s")

async def benchmark_memory_search():
    """记忆检索性能基准测试"""
    agent = ShiHaoAgent()
    
    times = []
    for i in range(10):
        start = time.time()
        results = await agent.memory.recall.search("投资偏好")
        elapsed = time.time() - start
        times.append(elapsed)
    
    avg_time = sum(times) / len(times)
    assert avg_time < 1.0, f"记忆检索平均耗时过长: {avg_time}s"
    print(f"✅ 记忆检索: {avg_time:.3f}s (avg)")

async def benchmark_notification_throughput():
    """通知吞吐量基准测试"""
    hub = NotificationHub()
    
    start = time.time()
    tasks = [hub.send("测试", f"消息{i}") for i in range(100)]
    await asyncio.gather(*tasks)
    elapsed = time.time() - start
    
    throughput = 100 / elapsed
    assert throughput > 50, f"通知吞吐量不足: {throughput}/s"
    print(f"✅ 通知吞吐量: {throughput:.1f}/s")
```

### 12.3 性能监控

```python
# 监控指标
AGENT_METRICS = {
    "agent_analysis_duration_seconds": "Histogram",
    "agent_memory_search_duration_seconds": "Histogram",
    "agent_notification_sent_total": "Counter",
    "agent_notification_failed_total": "Counter",
    "agent_scheduler_jobs_active": "Gauge",
    "agent_learning_patterns_extracted": "Counter",
}
```

---

## 13. 错误恢复机制

### 13.1 错误分类与处理

| 错误类型 | 处理策略 | 恢复动作 |
|----------|----------|----------|
| LLM API失败 | 降级到本地Ollama | 自动重试3次 |
| 记忆存储失败 | 写入本地缓存 | 异步同步 |
| 渠道发送失败 | 切换备用渠道 | 记录失败日志 |
| 调度任务失败 | 任务队列重试 | 告警通知 |
| Agent崩溃 | 进程重启 | 状态恢复 |

### 13.2 重试机制

```python
# python-backend/shihao_finance/agent/recovery.py

from tenacity import retry, stop_after_attempt, wait_exponential

class RetryConfig:
    """重试配置"""
    
    LLM_RETRY = {
        "stop": stop_after_attempt(3),
        "wait": wait_exponential(multiplier=1, min=2, max=10),
        "retry": lambda e: isinstance(e, (TimeoutError, ConnectionError))
    }
    
    MEMORY_RETRY = {
        "stop": stop_after_attempt(5),
        "wait": wait_exponential(multiplier=0.5, min=1, max=5),
    }
    
    NOTIFICATION_RETRY = {
        "stop": stop_after_attempt(2),
        "wait": 2,
    }

class ErrorHandler:
    """错误处理器"""
    
    def __init__(self, agent, fallback_llm="ollama"):
        self.agent = agent
        self.fallback_llm = fallback_llm
        self.error_log = []
    
    async def handle_llm_error(self, error, context):
        """处理LLM错误"""
        
        # 1. 记录错误
        self.error_log.append({
            "type": "llm_error",
            "error": str(error),
            "context": context,
            "timestamp": datetime.now()
        })
        
        # 2. 尝试降级到本地模型
        try:
            return await self.agent.use_local_llm(context)
        except Exception as e:
            # 3. 降级也失败，返回缓存结果
            return await self.get_cached_response(context)
    
    async def handle_memory_error(self, error, operation):
        """处理记忆错误"""
        
        # 1. 写入本地文件缓存
        await self.cache_to_file(operation)
        
        # 2. 异步重试
        asyncio.create_task(self.retry_memory_operation(operation))
        
        # 3. 返回默认值，不阻塞主流程
        return {"status": "cached", "message": "记忆操作已缓存"}
    
    async def handle_notification_error(self, error, notification):
        """处理通知错误"""
        
        # 1. 切换备用渠道
        fallback_channels = self.get_fallback_channels(notification.channels)
        
        if fallback_channels:
            return await self.send_via_fallback(notification, fallback_channels)
        
        # 2. 无备用渠道，记录日志
        self.error_log.append({
            "type": "notification_failed",
            "notification": notification,
            "error": str(error)
        })
        
        return {"status": "failed", "message": "所有渠道发送失败"}

class CircuitBreaker:
    """熔断器"""
    
    def __init__(self, failure_threshold=5, reset_timeout=60):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self.failures = 0
        self.last_failure = None
        self.state = "closed"  # closed, open, half_open
    
    def record_failure(self):
        self.failures += 1
        self.last_failure = datetime.now()
        
        if self.failures >= self.failure_threshold:
            self.state = "open"
    
    def record_success(self):
        self.failures = 0
        self.state = "closed"
    
    def can_execute(self) -> bool:
        if self.state == "closed":
            return True
        
        if self.state == "open":
            # 检查是否可以进入半开状态
            if self.last_failure:
                elapsed = (datetime.now() - self.last_failure).seconds
                if elapsed > self.reset_timeout:
                    self.state = "half_open"
                    return True
            return False
        
        # half_open 状态，允许一次尝试
        return True
```

### 13.3 状态恢复

```python
class StateRecovery:
    """状态恢复管理器"""
    
    def __init__(self, checkpoint_dir="checkpoints"):
        self.checkpoint_dir = Path(checkpoint_dir)
        self.checkpoint_dir.mkdir(exist_ok=True)
    
    async def save_checkpoint(self, agent_state: dict):
        """保存检查点"""
        checkpoint = {
            "timestamp": datetime.now().isoformat(),
            "core_memory": agent_state.get("core_memory"),
            "pending_tasks": agent_state.get("pending_tasks"),
            "active_trades": agent_state.get("active_trades"),
        }
        
        checkpoint_file = self.checkpoint_dir / f"checkpoint_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        checkpoint_file.write_text(json.dumps(checkpoint, indent=2))
        
        # 保留最近10个检查点
        self.cleanup_old_checkpoints(keep=10)
    
    async def restore_from_checkpoint(self):
        """从检查点恢复"""
        checkpoints = sorted(self.checkpoint_dir.glob("checkpoint_*.json"))
        
        if not checkpoints:
            return None
        
        latest = checkpoints[-1]
        return json.loads(latest.read_text())
    
    def cleanup_old_checkpoints(self, keep: int = 10):
        """清理旧检查点"""
        checkpoints = sorted(self.checkpoint_dir.glob("checkpoint_*.json"))
        
        while len(checkpoints) > keep:
            old = checkpoints.pop(0)
            old.unlink()
```

---

## 10. 审批

| 角色 | 姓名 | 日期 | 签名 |
|------|------|------|------|
| 项目负责人 | | | |
| 技术负责人 | | | |
| 产品负责人 | | | |

---

**文档状态**: 待审查  
**下一阶段**: 规格审查 → 实施计划
