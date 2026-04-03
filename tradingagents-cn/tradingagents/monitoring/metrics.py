"""
TradingAgents-CN Prometheus Metrics
Prometheus 指标收集与暴露
"""

import time
from typing import Dict, Any, Optional
from datetime import datetime
from collections import defaultdict
import threading


class MetricsCollector:
    """
    Prometheus 指标收集器
    """

    def __init__(self):
        self._counters: Dict[str, float] = defaultdict(float)
        self._gauges: Dict[str, float] = {}
        self._histograms: Dict[str, list] = defaultdict(list)
        self._labels: Dict[str, Dict[str, str]] = defaultdict(dict)
        self._lock = threading.Lock()

    def inc_counter(self, name: str, value: float = 1, labels: Optional[Dict[str, str]] = None):
        """递增计数器"""
        key = self._make_key(name, labels)
        with self._lock:
            self._counters[key] += value

    def set_gauge(self, name: str, value: float, labels: Optional[Dict[str, str]] = None):
        """设置仪表值"""
        key = self._make_key(name, labels)
        with self._lock:
            self._gauges[key] = value

    def observe_histogram(self, name: str, value: float, labels: Optional[Dict[str, str]] = None):
        """记录直方图值"""
        key = self._make_key(name, labels)
        with self._lock:
            self._histograms[key].append(value)

    def _make_key(self, name: str, labels: Optional[Dict[str, str]] = None) -> str:
        if not labels:
            return name
        label_str = ",".join(f'{k}="{v}"' for k, v in sorted(labels.items()))
        return f"{name}{{{label_str}}}"

    def get_metrics(self) -> str:
        """获取 Prometheus 格式的指标"""
        lines = []
        timestamp = int(time.time() * 1000)

        lines.append("# HELP tradingagents_info 系统信息")
        lines.append("# TYPE tradingagents_info gauge")
        lines.append(f'tradingagents_info{{version="1.0.0"}} 1')

        if self._counters:
            lines.append("# HELP tradingagents_counter 计数器")
            lines.append("# TYPE tradingagents_counter counter")
            for key, value in self._counters.items():
                lines.append(f"tradingagents_counter{{{key}}} {value} {timestamp}")

        if self._gauges:
            lines.append("# HELP tradingagents_gauge 仪表")
            lines.append("# TYPE tradingagents_gauge gauge")
            for key, value in self._gauges.items():
                lines.append(f"tradingagents_gauge{{{key}}} {value} {timestamp}")

        if self._histograms:
            lines.append("# HELP tradingagents_histogram 直方图")
            lines.append("# TYPE tradingagents_histogram histogram")
            for key, values in self._histograms.items():
                values_sorted = sorted(values)
                n = len(values_sorted)
                total = sum(values_sorted)

                buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
                cumulative = 0
                for b in buckets:
                    cumulative += len([v for v in values_sorted if v <= b])
                    lines.append(f'tradingagents_histogram_bucket{{{key},le="{b}"}} {cumulative} {timestamp}')
                lines.append(f'tradingagents_histogram_bucket{{{key},le="+Inf"}} {n} {timestamp}')
                lines.append(f'tradingagents_histogram_sum{{{key}}} {total} {timestamp}')
                lines.append(f'tradingagents_histogram_count{{{key}}} {n} {timestamp}')

        return "\n".join(lines)


_metrics = MetricsCollector()


def get_metrics() -> MetricsCollector:
    """获取全局指标收集器"""
    return _metrics


def inc_counter(name: str, value: float = 1, **labels):
    """递增计数器"""
    _metrics.inc_counter(name, value, labels)


def set_gauge(name: str, value: float, **labels):
    """设置仪表值"""
    _metrics.set_gauge(name, value, labels)


def observe_histogram(name: str, value: float, **labels):
    """记录直方图值"""
    _metrics.observe_histogram(name, value, labels)


class Timer:
    """计时器上下文管理器"""

    def __init__(self, name: str, **labels):
        self.name = name
        self.labels = labels
        self.start = None

    def __enter__(self):
        self.start = time.perf_counter()
        return self

    def __exit__(self, *args):
        elapsed = (time.perf_counter() - self.start) * 1000
        observe_histogram(f"{self.name}_duration_ms", elapsed, **self.labels)
        inc_counter(f"{self.name}_total", 1, **self.labels)


# LLM 定价表 (USD per 1M tokens)
LLM_PRICING = {
    "deepseek-chat": {"prompt": 0.27, "completion": 1.10},
    "deepseek-coder": {"prompt": 0.27, "completion": 1.10},
    "gpt-4o": {"prompt": 5.00, "completion": 15.00},
    "gpt-4o-mini": {"prompt": 0.15, "completion": 0.60},
    "gpt-3.5-turbo": {"prompt": 0.50, "completion": 2.00},
    "qwen-plus": {"prompt": 0.80, "completion": 2.00},
    "qwen-turbo": {"prompt": 0.50, "completion": 1.00},
    "qwen-max": {"prompt": 6.00, "completion": 18.00},
    "gemini-1.5-flash": {"prompt": 0.075, "completion": 0.30},
    "gemini-1.5-pro": {"prompt": 1.25, "completion": 5.00},
}

# Prometheus health metrics (gauges - set via set_gauge)
def update_health_metrics(mongodb: str, redis: str, llm: str):
    """更新健康状态指标"""
    set_gauge("mongodb_health", 1 if mongodb == "healthy" else 0)
    set_gauge("redis_health", 1 if redis == "healthy" else 0)
    set_gauge("llm_services_health", 1 if llm == "healthy" else 0)


def get_cost_manager() -> 'CostManager':
    """获取全局 CostManager 实例"""
    return CostManager()


class CostManager:
    """
    LLM 用量限制管理器
    支持每日预算和调用次数限制
    """
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._init()
        return cls._instance

    def _init(self):
        self.daily_calls: Dict[str, int] = {}
        self.daily_cost: Dict[str, float] = {}
        self.reset_day = time.strftime("%Y-%m-%d")
        self.limit = float(os.getenv("LLM_DAILY_BUDGET", "10"))
        self.call_limit = int(os.getenv("LLM_DAILY_CALLS", "1000"))

    def _check_date(self):
        today = time.strftime("%Y-%m-%d")
        if today != self.reset_day:
            self.daily_calls = {}
            self.daily_cost = {}
            self.reset_day = today

    def record_usage(self, provider: str, model: str, prompt_tokens: int, completion_tokens: int, cost: float):
        self._check_date()
        key = f"{provider}:{model}"
        self.daily_calls[key] = self.daily_calls.get(key, 0) + 1
        self.daily_cost[key] = self.daily_cost.get(key, 0) + cost

        total_cost = sum(self.daily_cost.values())
        if total_cost > self.limit:
            raise Exception(f"Daily budget exceeded: ${total_cost:.2f} > ${self.limit}")

        total_calls = sum(self.daily_calls.values())
        if total_calls > self.call_limit:
            raise Exception(f"Daily call limit exceeded: {total_calls} > {self.call_limit}")

        set_gauge("llm_daily_budget_remaining", self.limit - total_cost)
        set_gauge("llm_daily_calls_remaining", self.call_limit - total_calls)

    def get_stats(self) -> Dict[str, Any]:
        self._check_date()
        return {
            "calls": self.daily_calls,
            "cost": self.daily_cost,
            "total_cost": sum(self.daily_cost.values()),
            "total_calls": sum(self.daily_calls.values()),
            "budget_remaining": self.limit - sum(self.daily_cost.values()),
            "calls_remaining": self.call_limit - sum(self.daily_calls.values()),
        }


class LLMCostTracker:
    """
    LLM 调用成本追踪器
    
    记录每次调用的 token 数量和成本
    """

    def __init__(self):
        self._calls: list = []
        self._total_cost = 0.0
        self._total_prompt_tokens = 0
        self._total_completion_tokens = 0
        self._lock = threading.Lock()
        
        # 按 provider/model 统计
        self._by_provider: Dict[str, Dict[str, float]] = defaultdict(lambda: {
            "calls": 0, "cost": 0.0, "prompt_tokens": 0, "completion_tokens": 0
        })

    def record_call(
        self,
        provider: str,
        model: str,
        prompt_tokens: int,
        completion_tokens: int,
        cost: Optional[float] = None
    ):
        """记录一次 LLM 调用"""
        with self._lock:
            # 计算成本
            if cost is None:
                pricing = LLM_PRICING.get(model, {"prompt": 1.0, "completion": 2.0})
                cost = (prompt_tokens / 1_000_000 * pricing["prompt"] + 
                        completion_tokens / 1_000_000 * pricing["completion"])
            
            # 记录
            self._calls.append({
                "provider": provider,
                "model": model,
                "prompt_tokens": prompt_tokens,
                "completion_tokens": completion_tokens,
                "total_tokens": prompt_tokens + completion_tokens,
                "cost": cost,
                "timestamp": datetime.now().isoformat(),
            })
            
            self._total_cost += cost
            self._total_prompt_tokens += prompt_tokens
            self._total_completion_tokens += completion_tokens
            
            # 按 provider 统计
            self._by_provider[provider]["calls"] += 1
            self._by_provider[provider]["cost"] += cost
            self._by_provider[provider]["prompt_tokens"] += prompt_tokens
            self._by_provider[provider]["completion_tokens"] += completion_tokens
            
            # 更新 Prometheus 指标
            inc_counter("llm_calls_total", 1, provider=provider, model=model)
            inc_counter("llm_tokens_total", prompt_tokens, provider=provider, model=model, type="prompt")
            inc_counter("llm_tokens_total", completion_tokens, provider=provider, model=model, type="completion")
            inc_counter("llm_cost_total", cost, provider=provider, model=model)

    @property
    def total_cost(self) -> float:
        return self._total_cost

    @property
    def total_calls(self) -> int:
        return len(self._calls)

    @property
    def total_tokens(self) -> int:
        return self._total_prompt_tokens + self._total_completion_tokens

    def get_cost_by_provider(self, provider: str) -> Dict[str, float]:
        """获取按 provider 统计的成本"""
        with self._lock:
            return self._by_provider.get(provider, {}).copy()

    def get_daily_cost(self, days: int = 1) -> float:
        """获取最近 N 天的成本"""
        cutoff = datetime.now().timestamp() - days * 86400
        return sum(
            c["cost"] for c in self._calls 
            if datetime.fromisoformat(c["timestamp"]).timestamp() > cutoff
        )

    def get_stats(self) -> Dict[str, Any]:
        """获取统计信息"""
        with self._lock:
            return {
                "total_calls": len(self._calls),
                "total_cost": self._total_cost,
                "total_tokens": self._total_prompt_tokens + self._total_completion_tokens,
                "prompt_tokens": self._total_prompt_tokens,
                "completion_tokens": self._total_completion_tokens,
                "by_provider": dict(self._by_provider),
                "daily_cost": self.get_daily_cost(),
            }

    def check_budget_alerts(self, daily_budget: float, monthly_budget: float) -> Dict[str, Any]:
        """检查预算告警"""
        daily_cost = self.get_daily_cost()
        monthly_cost = self.get_daily_cost(days=30)
        
        alerts = []
        
        if daily_cost >= daily_budget:
            alerts.append({
                "level": "critical",
                "message": f"Daily budget exceeded: ${daily_cost:.2f} / ${daily_budget:.2f}"
            })
        elif daily_cost >= daily_budget * 0.8:
            alerts.append({
                "level": "warning",
                "message": f"Daily budget warning: ${daily_cost:.2f} / ${daily_budget:.2f} (80%)"
            })
        
        if monthly_cost >= monthly_budget:
            alerts.append({
                "level": "critical",
                "message": f"Monthly budget exceeded: ${monthly_cost:.2f} / ${monthly_budget:.2f}"
            })
        elif monthly_cost >= monthly_budget * 0.8:
            alerts.append({
                "level": "warning",
                "message": f"Monthly budget warning: ${monthly_cost:.2f} / ${monthly_budget:.2f} (80%)"
            })
        
        return {
            "daily_cost": daily_cost,
            "daily_budget": daily_budget,
            "daily_percentage": (daily_cost / daily_budget * 100) if daily_budget > 0 else 0,
            "monthly_cost": monthly_cost,
            "monthly_budget": monthly_budget,
            "monthly_percentage": (monthly_cost / monthly_budget * 100) if monthly_budget > 0 else 0,
            "alerts": alerts,
        }

    def get_daily_costs(self) -> Dict[str, Any]:
        """获取每日成本统计（供健康检查使用）"""
        daily_cost = self.get_daily_cost()
        return {
            "today_cost": daily_cost,
            "by_provider": {p: stats["cost"] for p, stats in self._by_provider.items()},
            "calls_today": sum(1 for c in self._calls if 
                datetime.fromisoformat(c["timestamp"]).date() == datetime.now().date())
        }


_llm_cost_tracker = LLMCostTracker()


def get_llm_cost_tracker() -> LLMCostTracker:
    """获取全局 LLM 成本追踪器"""
    return _llm_cost_tracker


def record_llm_call(
    provider: str,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
    cost: Optional[float] = None
):
    """记录 LLM 调用（便捷函数）"""
    _llm_cost_tracker.record_call(provider, model, prompt_tokens, completion_tokens, cost)
