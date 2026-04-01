---
name: model-routing
description: AI Agent 智能模型路由 - 根据任务复杂度选择模型、成本优化、fallback策略
category: ai-agent-optimization
source: Claude Code model routing analysis
version: 1.0
tags:
  - model-selection
  - cost-optimization
  - routing
  - fallback
  - haiku
  - sonnet
---

# 智能模型路由 - 成本与质量平衡

> Claude Code 使用 Haiku 处理轻量任务，Sonnet 处理核心推理

## 路由策略

```
┌─────────────────────────────────────────────────────────────┐
│                    Model Router                             │
│                                                             │
│  ┌─────────────────┐                                       │
│  │  Task Analysis  │                                       │
│  │  任务分析       │                                       │
│  └────────┬────────┘                                       │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Complexity Assessment                  │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐              │   │
│  │  │ Simple  │ │ Medium  │ │ Complex │              │   │
│  │  │ (0-30)  │ │ (30-70) │ │ (70-100)│              │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘              │   │
│  └───────┼───────────┼───────────┼────────────────────┘   │
│          │           │           │                          │
│          ▼           ▼           ▼                          │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                      │
│  │  Haiku  │ │ Sonnet  │ │ Opus    │                      │
│  │ $0.25/M │ │  $3/M   │ │ $15/M   │                      │
│  └─────────┘ └─────────┘ └─────────┘                      │
│                                                             │
│  任务类型:                                                  │
│  • Haiku: 主题检测、摘要、格式化、简单查询                  │
│  • Sonnet: 核心推理、代码生成、工具调用、复杂分析          │
│  • Opus: 架构设计、深度推理、复杂调试（可选）              │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心实现

```python
from enum import Enum
from dataclasses import dataclass
from typing import Optional, Callable
import re
import logging

logger = logging.getLogger(__name__)


class ModelTier(Enum):
    """模型层级"""
    FAST = "fast"      # Haiku - 快速、便宜
    BALANCED = "balanced"  # Sonnet - 平衡
    POWERFUL = "powerful"  # Opus - 强大、昂贵


@dataclass
class ModelConfig:
    """模型配置"""
    name: str
    tier: ModelTier
    input_cost_per_million: float  # 每百万 token 输入价格
    output_cost_per_million: float  # 每百万 token 输出价格
    max_tokens: int = 200000
    rate_limit_rpm: int = 1000  # 每分钟请求限制
    rate_limit_tpm: int = 100000  # 每分钟 token 限制


# 默认模型配置
MODELS = {
    "haiku": ModelConfig(
        name="claude-3-5-haiku-20241022",
        tier=ModelTier.FAST,
        input_cost_per_million=0.25,
        output_cost_per_million=1.25,
    ),
    "sonnet": ModelConfig(
        name="claude-sonnet-4-20250514",
        tier=ModelTier.BALANCED,
        input_cost_per_million=3.0,
        output_cost_per_million=15.0,
    ),
    "opus": ModelConfig(
        name="claude-opus-4-20250514",
        tier=ModelTier.POWERFUL,
        input_cost_per_million=15.0,
        output_cost_per_million=75.0,
    ),
}


class TaskType(Enum):
    """任务类型"""
    TOPIC_DETECTION = "topic_detection"      # 主题检测
    QUOTA_CHECK = "quota_check"              # 额度检查
    SUMMARIZATION = "summarization"          # 摘要
    COMPACTING = "compacting"                # 上下文压缩
    SIMPLE_QUERY = "simple_query"            # 简单查询
    CODE_GENERATION = "code_generation"      # 代码生成
    CODE_REVIEW = "code_review"              # 代码审查
    COMPLEX_ANALYSIS = "complex_analysis"    # 复杂分析
    ARCHITECTURE = "architecture"            # 架构设计
    DEBUGGING = "debugging"                  # 调试
    MULTI_STEP = "multi_step"                # 多步骤任务


# 任务类型到模型的映射
TASK_MODEL_MAP: dict[TaskType, ModelTier] = {
    TaskType.TOPIC_DETECTION: ModelTier.FAST,
    TaskType.QUOTA_CHECK: ModelTier.FAST,
    TaskType.SUMMARIZATION: ModelTier.FAST,
    TaskType.COMPACTING: ModelTier.BALANCED,
    TaskType.SIMPLE_QUERY: ModelTier.FAST,
    TaskType.CODE_GENERATION: ModelTier.BALANCED,
    TaskType.CODE_REVIEW: ModelTier.BALANCED,
    TaskType.COMPLEX_ANALYSIS: ModelTier.BALANCED,
    TaskType.ARCHITECTURE: ModelTier.POWERFUL,
    TaskType.DEBUGGING: ModelTier.BALANCED,
    TaskType.MULTI_STEP: ModelTier.BALANCED,
}


class ModelRouter:
    """
    智能模型路由器
    
    Claude Code 模式:
    1. 轻量任务使用 Haiku (主题检测、额度检查)
    2. 核心任务使用 Sonnet (Agent 循环、工具调用)
    3. 重量任务可选使用 Opus (架构设计)
    """
    
    def __init__(
        self,
        default_tier: ModelTier = ModelTier.BALANCED,
        budget_per_day: Optional[float] = None,  # 每日预算（美元）
        llm_client=None
    ):
        self.default_tier = default_tier
        self.budget_per_day = budget_per_day
        self.llm_client = llm_client
        
        # 统计
        self._usage: dict[str, dict] = {
            tier.value: {"requests": 0, "input_tokens": 0, "output_tokens": 0, "cost": 0.0}
            for tier in ModelTier
        }
    
    def select_model(
        self,
        task_type: Optional[TaskType] = None,
        message: Optional[str] = None,
        context_length: int = 0,
        force_tier: Optional[ModelTier] = None
    ) -> ModelConfig:
        """
        选择模型
        
        策略:
        1. 如果指定了强制层级，使用对应模型
        2. 如果指定了任务类型，使用映射的模型
        3. 如果提供了消息，分析复杂度选择模型
        4. 否则使用默认模型
        """
        
        # 检查预算
        if self.budget_per_day and not self._check_budget():
            logger.warning("Daily budget exceeded, using FAST tier")
            return MODELS["haiku"]
        
        # 确定层级
        if force_tier:
            tier = force_tier
        elif task_type:
            tier = TASK_MODEL_MAP.get(task_type, self.default_tier)
        elif message:
            tier = self._analyze_complexity(message, context_length)
        else:
            tier = self.default_tier
        
        # 选择模型
        for model in MODELS.values():
            if model.tier == tier:
                return model
        
        return MODELS["sonnet"]  # 默认 Sonnet
    
    def _analyze_complexity(
        self,
        message: str,
        context_length: int = 0
    ) -> ModelTier:
        """
        分析消息复杂度
        
        简单特征 → Haiku:
        - 短消息 (< 100 字)
        - 简单问题
        - 格式化请求
        
        复杂特征 → Sonnet:
        - 长消息 (> 500 字)
        - 包含代码
        - 多步骤问题
        - 上下文较长 (> 50K tokens)
        """
        complexity_score = 0
        
        # 1. 消息长度
        msg_len = len(message)
        if msg_len < 100:
            complexity_score += 10
        elif msg_len < 500:
            complexity_score += 30
        elif msg_len < 2000:
            complexity_score += 50
        else:
            complexity_score += 70
        
        # 2. 代码存在
        if "```" in message or "def " in message or "class " in message:
            complexity_score += 20
        
        # 3. 问题复杂度
        complex_indicators = [
            r"explain|describe|analyze",
            r"how does|why does|what happens",
            r"compare|contrast|evaluate",
            r"design|architecture|implement",
            r"optimize|improve|refactor",
        ]
        for pattern in complex_indicators:
            if re.search(pattern, message, re.IGNORECASE):
                complexity_score += 15
        
        # 4. 上下文长度
        if context_length > 50000:
            complexity_score += 20
        elif context_length > 100000:
            complexity_score += 30
        
        # 5. 多步骤指示
        step_indicators = ["first", "then", "next", "finally", "also"]
        if any(indicator in message.lower() for indicator in step_indicators):
            complexity_score += 15
        
        # 映射到层级
        if complexity_score < 30:
            return ModelTier.FAST
        elif complexity_score < 70:
            return ModelTier.BALANCED
        else:
            return ModelTier.POWERFUL
    
    async def smart_complete(
        self,
        messages: list[dict],
        task_type: Optional[TaskType] = None,
        fallback: bool = True
    ) -> str:
        """
        智能补全 - 自动选择模型，支持 fallback
        
        流程:
        1. 选择最优模型
        2. 尝试调用
        3. 失败则降级到更低层级模型
        """
        
        # 分析上下文
        context_length = sum(len(m.get("content", "")) for m in messages)
        last_message = messages[-1].get("content", "") if messages else ""
        
        # 选择模型
        model = self.select_model(
            task_type=task_type,
            message=last_message,
            context_length=context_length
        )
        
        # 尝试调用
        try:
            result = await self._call_model(model, messages)
            self._record_usage(model, messages, result)
            return result
        except Exception as e:
            logger.error(f"Model {model.name} failed: {e}")
            
            # Fallback 到更便宜的模型
            if fallback and model.tier != ModelTier.FAST:
                fallback_model = MODELS["haiku"]
                logger.info(f"Falling back to {fallback_model.name}")
                try:
                    result = await self._call_model(fallback_model, messages)
                    self._record_usage(fallback_model, messages, result)
                    return result
                except Exception as e2:
                    logger.error(f"Fallback also failed: {e2}")
            
            raise
    
    async def _call_model(self, model: ModelConfig, messages: list[dict]) -> str:
        """调用模型"""
        if self.llm_client:
            return await self.llm_client.complete(
                messages=messages,
                model=model.name
            )
        raise NotImplementedError("No LLM client configured")
    
    def _record_usage(
        self,
        model: ModelConfig,
        messages: list[dict],
        response: str
    ):
        """记录使用情况"""
        input_tokens = sum(len(m.get("content", "")) // 4 for m in messages)
        output_tokens = len(response) // 4
        
        cost = (
            input_tokens * model.input_cost_per_million / 1_000_000 +
            output_tokens * model.output_cost_per_million / 1_000_000
        )
        
        tier_stats = self._usage[model.tier.value]
        tier_stats["requests"] += 1
        tier_stats["input_tokens"] += input_tokens
        tier_stats["output_tokens"] += output_tokens
        tier_stats["cost"] += cost
    
    def _check_budget(self) -> bool:
        """检查是否超出预算"""
        if not self.budget_per_day:
            return True
        
        total_cost = sum(
            stats["cost"] for stats in self._usage.values()
        )
        return total_cost < self.budget_per_day
    
    def get_stats(self) -> dict:
        """获取使用统计"""
        total_requests = sum(s["requests"] for s in self._usage.values())
        total_cost = sum(s["cost"] for s in self._usage.values())
        
        return {
            "total_requests": total_requests,
            "total_cost_usd": total_cost,
            "by_tier": self._usage,
            "cost_per_request": total_cost / total_requests if total_requests > 0 else 0,
        }
```

---

## 使用示例

### 基本使用

```python
# 创建路由器
router = ModelRouter(
    default_tier=ModelTier.BALANCED,
    budget_per_day=10.0  # 每天 10 美元预算
)

# 自动选择
model = router.select_model(message="简单查询")
print(model.name)  # haiku

model = router.select_model(message="请分析这个复杂的架构问题...")
print(model.name)  # sonnet

# 任务类型选择
model = router.select_model(task_type=TaskType.TOPIC_DETECTION)
print(model.name)  # haiku

model = router.select_model(task_type=TaskType.CODE_GENERATION)
print(model.name)  # sonnet
```

### Agent 集成

```python
class CostOptimizedAgent:
    """成本优化的 Agent"""
    
    def __init__(self, llm_client):
        self.llm = llm_client
        self.router = ModelRouter(
            budget_per_day=5.0,
            llm_client=llm_client
        )
    
    async def run(self, task: str):
        # 1. 主题检测 - Haiku
        is_new_topic = await self.router.smart_complete(
            messages=[{"role": "user", "content": f"Is this a new topic? {task}"}],
            task_type=TaskType.TOPIC_DETECTION
        )
        
        # 2. 核心 Agent 循环 - Sonnet
        while True:
            response = await self.router.smart_complete(
                messages=self.messages,
                task_type=TaskType.CODE_GENERATION
            )
            
            if self._needs_debugging(response):
                # 调试任务 - Sonnet
                response = await self.router.smart_complete(
                    messages=self.messages + [{"role": "user", "content": "Debug this"}],
                    task_type=TaskType.DEBUGGING
                )
            
            if not self._has_tool_calls(response):
                break
        
        # 3. 总结 - Haiku
        summary = await self.router.smart_complete(
            messages=[{"role": "user", "content": "Summarize what was done"}],
            task_type=TaskType.SUMMARIZATION
        )
        
        # 打印统计
        stats = self.router.get_stats()
        print(f"Total cost: ${stats['total_cost_usd']:.4f}")
```

---

## Claude Code 的模型使用策略

| 任务 | 使用模型 | 原因 |
|------|----------|------|
| 额度检查 | Haiku | 轻量、快速 |
| 主题检测 | Haiku | 简单分类 |
| 上下文压缩 | Sonnet | 需要理解上下文 |
| 核心 Agent 循环 | Sonnet | 核心推理 |
| IDE 集成 | Sonnet | 工具调用 |
| 对话总结 | Haiku | 快速摘要 |

---

## 关键要点

| 要点 | 说明 |
|------|------|
| **成本意识** | 轻量任务用便宜模型 |
| **智能分析** | 根据消息复杂度选择 |
| **Budget 控制** | 每日预算限制 |
| **Fallback** | 失败时降级到更稳定模型 |
| **统计追踪** | 记录每个模型的使用情况 |

## 相关技能

- `ai-model-integration` - AI 模型集成
- `llm-client-patterns` - LLM 客户端模式
- `agent-loop-patterns` - Agent 循环模式
