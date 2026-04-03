"""
分析遥测系统 - Claude Code 风格的可观测性
基于 Claude Code 源码分析实现的数据收集与分析
"""

import time
import json
import logging
from typing import Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import defaultdict
from enum import Enum

logger = logging.getLogger(__name__)


class EventType(Enum):
    """事件类型"""

    SESSION_START = "session_start"
    SESSION_END = "session_end"
    MESSAGE_SENT = "message_sent"
    MESSAGE_RECEIVED = "message_received"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOOL_ERROR = "tool_error"
    MODEL_CALL = "model_call"
    MODEL_ERROR = "model_error"
    MODEL_FALLBACK = "model_fallback"
    CONTEXT_COMPACT = "context_compact"
    ERROR_RECOVERY = "error_recovery"
    RATE_LIMIT_HIT = "rate_limit_hit"
    COMMAND_EXECUTED = "command_executed"
    FEATURE_FLAG_TOGGLED = "feature_flag_toggled"


@dataclass
class AnalyticsEvent:
    """分析事件"""

    event_type: EventType
    timestamp: datetime = field(default_factory=datetime.now)
    session_id: str = ""
    user_id: str = ""
    metadata: dict = field(default_factory=dict)
    duration_ms: Optional[float] = None
    token_count: Optional[int] = None
    cost_usd: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "event_type": self.event_type.value,
            "timestamp": self.timestamp.isoformat(),
            "session_id": self.session_id,
            "user_id": self.user_id,
            "metadata": self.metadata,
            "duration_ms": self.duration_ms,
            "token_count": self.token_count,
            "cost_usd": self.cost_usd,
        }


class AnalyticsCollector:
    """分析数据收集器"""

    def __init__(self, session_id: str, user_id: str = "", enable_memory: bool = True):
        self.session_id = session_id
        self.user_id = user_id
        self.enable_memory = enable_memory

        self._events: list[AnalyticsEvent] = []
        self._buffer_size = 100

        self._session_start = datetime.now()
        self._message_count = 0
        self._tool_calls: dict[str, int] = defaultdict(int)
        self._model_usage: dict[str, dict] = defaultdict(
            lambda: {
                "calls": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "cost": 0.0,
                "errors": 0,
            }
        )
        self._error_count = 0
        self._recovery_count = 0

    def track(self, event: AnalyticsEvent):
        """记录事件"""
        event.session_id = self.session_id
        event.user_id = self.user_id
        self._events.append(event)
        self._update_stats(event)

        if len(self._events) >= self._buffer_size:
            self._flush()

    def _update_stats(self, event: AnalyticsEvent):
        """更新实时统计"""
        et = event.event_type

        if et in [EventType.MESSAGE_SENT, EventType.MESSAGE_RECEIVED]:
            self._message_count += 1

        elif et == EventType.TOOL_CALL:
            tool_name = event.metadata.get("tool_name", "unknown")
            self._tool_calls[tool_name] += 1

        elif et == EventType.MODEL_CALL:
            model = event.metadata.get("model", "unknown")
            self._model_usage[model]["calls"] += 1
            if event.token_count:
                self._model_usage[model]["input_tokens"] += event.token_count
            if event.cost_usd:
                self._model_usage[model]["cost"] += event.cost_usd

        elif et == EventType.MODEL_ERROR:
            model = event.metadata.get("model", "unknown")
            self._model_usage[model]["errors"] += 1
            self._error_count += 1

        elif et == EventType.ERROR_RECOVERY:
            self._recovery_count += 1

    def track_message(self, content: str, role: str = "user"):
        """记录消息"""
        self.track(
            AnalyticsEvent(
                event_type=EventType.MESSAGE_SENT
                if role == "user"
                else EventType.MESSAGE_RECEIVED,
                metadata={"role": role, "content_length": len(content)},
            )
        )

    def track_tool(self, tool_name: str, duration_ms: float, success: bool):
        """记录工具调用"""
        self.track(
            AnalyticsEvent(
                event_type=EventType.TOOL_CALL if success else EventType.TOOL_ERROR,
                metadata={"tool_name": tool_name, "success": success},
                duration_ms=duration_ms,
            )
        )

    def track_model(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost: float,
        duration_ms: float,
    ):
        """记录模型调用"""
        self.track(
            AnalyticsEvent(
                event_type=EventType.MODEL_CALL,
                metadata={"model": model},
                token_count=input_tokens + output_tokens,
                cost_usd=cost,
                duration_ms=duration_ms,
            )
        )

    def track_error(self, error_type: str, message: str):
        """记录错误"""
        self.track(
            AnalyticsEvent(
                event_type=EventType.MODEL_ERROR,
                metadata={"error_type": error_type, "message": message},
            )
        )

    def track_recovery(self, action: str, success: bool):
        """记录恢复"""
        self.track(
            AnalyticsEvent(
                event_type=EventType.ERROR_RECOVERY,
                metadata={"action": action, "success": success},
            )
        )

    def _flush(self):
        """清空缓冲"""
        self._events = self._events[-50:]

    def get_summary(self) -> dict:
        """获取会话摘要"""
        duration = (datetime.now() - self._session_start).total_seconds()

        total_tokens = sum(
            m["input_tokens"] + m["output_tokens"] for m in self._model_usage.values()
        )

        total_cost = sum(m["cost"] for m in self._model_usage.values())

        return {
            "session_id": self.session_id,
            "duration_seconds": duration,
            "messages": self._message_count,
            "tool_calls": dict(self._tool_calls),
            "total_tool_calls": sum(self._tool_calls.values()),
            "model_usage": dict(self._model_usage),
            "total_tokens": total_tokens,
            "total_cost_usd": total_cost,
            "error_count": self._error_count,
            "recovery_count": self._recovery_count,
            "recovery_rate": self._recovery_count / max(self._error_count, 1),
        }

    def end_session(self):
        """结束会话"""
        self.track(
            AnalyticsEvent(
                event_type=EventType.SESSION_END, metadata=self.get_summary()
            )
        )
        self._flush()


class CostTracker:
    """成本追踪器"""

    PRICES = {
        "claude-3-5-haiku-20241022": {"input": 0.25, "output": 1.25},
        "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
        "claude-opus-4-20250514": {"input": 15.0, "output": 75.0},
        "llama3": {"input": 0.0, "output": 0.0},
        "qwen": {"input": 0.0, "output": 0.0},
    }

    def __init__(self, daily_budget: Optional[float] = None):
        self.daily_budget = daily_budget
        self._daily_cost: dict[str, float] = defaultdict(float)
        self._total_cost: float = 0.0

    def calculate_cost(
        self, model: str, input_tokens: int, output_tokens: int
    ) -> float:
        """计算成本"""
        prices = self.PRICES.get(model, {"input": 3.0, "output": 15.0})

        cost = (
            input_tokens * prices["input"] / 1_000_000
            + output_tokens * prices["output"] / 1_000_000
        )

        today = datetime.now().strftime("%Y-%m-%d")
        self._daily_cost[today] += cost
        self._total_cost += cost

        return cost

    def check_budget(self) -> tuple[bool, str]:
        """检查预算"""
        if not self.daily_budget:
            return True, "No budget set"

        today = datetime.now().strftime("%Y-%m-%d")
        spent = self._daily_cost.get(today, 0)

        if spent >= self.daily_budget:
            return (
                False,
                f"Daily budget exceeded: ${spent:.2f} / ${self.daily_budget:.2f}",
            )

        remaining = self.daily_budget - spent
        return True, f"Budget remaining: ${remaining:.2f}"

    def get_daily_summary(self) -> dict:
        """获取每日摘要"""
        today = datetime.now().strftime("%Y-%m-%d")

        return {
            "date": today,
            "spent_today": self._daily_cost.get(today, 0),
            "daily_budget": self.daily_budget,
            "remaining": (self.daily_budget - self._daily_cost.get(today, 0))
            if self.daily_budget
            else None,
            "total_cost": self._total_cost,
        }


class PerformanceMetrics:
    """性能指标"""

    def __init__(self):
        self._latencies: dict[str, list[float]] = defaultdict(list)
        self._throughput: list[float] = []

    def record_latency(self, operation: str, latency_ms: float):
        """记录延迟"""
        self._latencies[operation].append(latency_ms)

        if len(self._latencies[operation]) > 1000:
            self._latencies[operation] = self._latencies[operation][-1000:]

    def record_throughput(self, tokens_per_second: float):
        """记录吞吐量"""
        self._throughput.append(tokens_per_second)

        if len(self._throughput) > 1000:
            self._throughput = self._throughput[-1000:]

    def get_stats(self) -> dict:
        """获取统计"""
        import statistics

        stats = {}

        for operation, latencies in self._latencies.items():
            if latencies:
                sorted_latencies = sorted(latencies)
                stats[operation] = {
                    "count": len(latencies),
                    "avg_ms": statistics.mean(latencies),
                    "median_ms": statistics.median(latencies),
                    "p95_ms": sorted_latencies[int(len(latencies) * 0.95)]
                    if len(latencies) >= 20
                    else None,
                    "p99_ms": sorted_latencies[int(len(latencies) * 0.99)]
                    if len(latencies) >= 100
                    else None,
                    "min_ms": min(latencies),
                    "max_ms": max(latencies),
                }

        if self._throughput:
            stats["throughput"] = {
                "avg_tps": statistics.mean(self._throughput),
                "max_tps": max(self._throughput),
            }

        return stats


class PrometheusExporter:
    """Prometheus 指标导出"""

    def __init__(self, prefix: str = "shihao"):
        self.prefix = prefix
        self._counters: dict[str, int] = defaultdict(int)
        self._gauges: dict[str, float] = {}

    def increment(self, name: str, labels: Optional[dict] = None, value: int = 1):
        """增加计数器"""
        key = self._make_key(name, labels)
        self._counters[key] += value

    def set_gauge(self, name: str, value: float, labels: Optional[dict] = None):
        """设置仪表"""
        key = self._make_key(name, labels)
        self._gauges[key] = value

    def _make_key(self, name: str, labels: Optional[dict]) -> str:
        """创建指标键"""
        key = f"{self.prefix}_{name}"
        if labels:
            label_str = ",".join(f'{k}="{v}"' for k, v in sorted(labels.items()))
            key += f"{{{label_str}}}"
        return key

    def export(self) -> str:
        """导出 Prometheus 格式"""
        lines = []

        for name, value in self._counters.items():
            lines.append(f"{name} {value}")

        for name, value in self._gauges.items():
            lines.append(f"{name} {value}")

        return "\n".join(lines)


def create_analytics_collector(
    session_id: str, user_id: str = ""
) -> AnalyticsCollector:
    """创建分析收集器"""
    return AnalyticsCollector(session_id=session_id, user_id=user_id)
