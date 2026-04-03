"""
智能模型路由 - Claude Code 成本优化模式
基于 Claude Code 源码分析的模型选择策略
"""

import re
import logging
from enum import Enum
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


class ModelTier(Enum):
    """模型层级"""

    FAST = "fast"
    BALANCED = "balanced"
    POWERFUL = "powerful"


class TaskType(Enum):
    """任务类型"""

    TOPIC_DETECTION = "topic_detection"
    QUOTA_CHECK = "quota_check"
    SUMMARIZATION = "summarization"
    COMPACTING = "compacting"
    SIMPLE_QUERY = "simple_query"
    CODE_GENERATION = "code_generation"
    CODE_REVIEW = "code_review"
    COMPLEX_ANALYSIS = "complex_analysis"
    ARCHITECTURE = "architecture"
    DEBUGGING = "debugging"
    MULTI_STEP = "multi_step"


@dataclass
class ModelConfig:
    """模型配置"""

    name: str
    tier: ModelTier
    input_cost_per_million: float
    output_cost_per_million: float
    max_tokens: int = 200000
    rate_limit_rpm: int = 1000


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
    "llama3": ModelConfig(
        name="llama3",
        tier=ModelTier.FAST,
        input_cost_per_million=0.0,
        output_cost_per_million=0.0,
    ),
    "qwen": ModelConfig(
        name="qwen",
        tier=ModelTier.FAST,
        input_cost_per_million=0.0,
        output_cost_per_million=0.0,
    ),
}


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
    """智能模型路由器"""

    def __init__(
        self,
        default_tier: ModelTier = ModelTier.BALANCED,
        budget_per_day: Optional[float] = None,
        llm_client=None,
        default_model: str = "llama3",
    ):
        self.default_tier = default_tier
        self.budget_per_day = budget_per_day
        self.llm_client = llm_client
        self.default_model_name = default_model

        self._usage: dict[str, dict] = {
            tier.value: {
                "requests": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "cost": 0.0,
            }
            for tier in ModelTier
        }

    def select_model(
        self,
        task_type: Optional[TaskType] = None,
        message: Optional[str] = None,
        context_length: int = 0,
        force_tier: Optional[ModelTier] = None,
    ) -> ModelConfig:
        """选择模型"""

        if self.budget_per_day and not self._check_budget():
            logger.warning("Daily budget exceeded, using FAST tier")
            return MODELS.get(self.default_model_name, MODELS["llama3"])

        if force_tier:
            tier = force_tier
        elif task_type:
            tier = TASK_MODEL_MAP.get(task_type, self.default_tier)
        elif message:
            # 消息复杂度分析决定 tier
            tier = self._analyze_complexity(message, context_length)
        else:
            tier = self.default_tier

        if tier == ModelTier.FAST:
            return MODELS.get(self.default_model_name, MODELS["llama3"])
        elif tier == ModelTier.BALANCED:
            return MODELS.get("sonnet", MODELS["llama3"])
        else:
            return MODELS.get(
                "opus", MODELS.get(self.default_model_name, MODELS["llama3"])
            )

    def _analyze_complexity(self, message: str, context_length: int = 0) -> ModelTier:
        """分析消息复杂度"""
        complexity_score = 0

        msg_len = len(message)
        if msg_len < 100:
            complexity_score += 10
        elif msg_len < 500:
            complexity_score += 30
        elif msg_len < 2000:
            complexity_score += 50
        else:
            complexity_score += 70

        if "```" in message or "def " in message or "class " in message:
            complexity_score += 20

        complex_indicators = [
            r"explain|describe|analyze",
            r"how does|why does|what happens",
            r"compare|contrast|evaluate",
            r"design|architecture|implement|create|build",
            r"optimize|improve|refactor",
        ]
        for pattern in complex_indicators:
            if re.search(pattern, message, re.IGNORECASE):
                complexity_score += 15

        if context_length > 50000:
            complexity_score += 20
        elif context_length > 100000:
            complexity_score += 30

        step_indicators = ["first", "then", "next", "finally", "also"]
        if any(indicator in message.lower() for indicator in step_indicators):
            complexity_score += 15

        # 调整阈值 - 更敏感地检测复杂消息
        if complexity_score < 25:
            return ModelTier.FAST
        elif complexity_score < 60:
            return ModelTier.BALANCED
        else:
            return ModelTier.POWERFUL

    async def smart_complete(
        self,
        messages: list[dict],
        task_type: Optional[TaskType] = None,
        fallback: bool = True,
    ) -> str:
        """智能补全 - 自动选择模型，支持 fallback"""

        context_length = sum(len(m.get("content", "")) for m in messages)
        last_message = messages[-1].get("content", "") if messages else ""

        model = self.select_model(
            task_type=task_type, message=last_message, context_length=context_length
        )

        try:
            result = await self._call_model(model, messages)
            self._record_usage(model, messages, result)
            return result
        except Exception as e:
            logger.error(f"Model {model.name} failed: {e}")

            if fallback and model.tier != ModelTier.FAST:
                fallback_model = MODELS.get(self.default_model_name, MODELS["llama3"])
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
            return await self.llm_client.complete(messages=messages, model=model.name)
        raise NotImplementedError("No LLM client configured")

    def _record_usage(self, model: ModelConfig, messages: list[dict], response: str):
        """记录使用情况"""
        input_tokens = sum(len(m.get("content", "")) // 4 for m in messages)
        output_tokens = len(response) // 4

        cost = (
            input_tokens * model.input_cost_per_million / 1_000_000
            + output_tokens * model.output_cost_per_million / 1_000_000
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

        total_cost = sum(stats["cost"] for stats in self._usage.values())
        return total_cost < self.budget_per_day

    def get_stats(self) -> dict:
        """获取使用统计"""
        total_requests = sum(s["requests"] for s in self._usage.values())
        total_cost = sum(s["cost"] for s in self._usage.values())

        return {
            "total_requests": total_requests,
            "total_cost_usd": total_cost,
            "by_tier": self._usage,
            "cost_per_request": total_cost / total_requests
            if total_requests > 0
            else 0,
        }


def create_model_router(
    default_model: str = "llama3",
    budget_per_day: Optional[float] = None,
    llm_client=None,
) -> ModelRouter:
    """创建模型路由器"""
    return ModelRouter(
        default_tier=ModelTier.BALANCED,
        budget_per_day=budget_per_day,
        llm_client=llm_client,
        default_model=default_model,
    )
