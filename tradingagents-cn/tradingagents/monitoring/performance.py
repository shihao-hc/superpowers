"""
TradingAgents-CN 性能监控模块
"""

import time
import asyncio
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import threading


class MetricType(str, Enum):
    LATENCY = "latency"
    COST = "cost"
    TOKENS = "tokens"
    COUNT = "count"
    ERROR = "error"


@dataclass
class MetricRecord:
    """指标记录"""
    name: str
    metric_type: MetricType
    value: float
    timestamp: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    success: bool = True
    error_message: Optional[str] = None


@dataclass
class AggregatedMetrics:
    """聚合指标"""
    total_calls: int
    successful_calls: int
    failed_calls: int
    total_latency_ms: float
    avg_latency_ms: float
    min_latency_ms: float
    max_latency_ms: float
    total_cost_usd: float
    total_tokens: int
    timestamp: str


class PerformanceMonitor:
    """
    性能监控器
    追踪LLM调用的延迟、成本、token使用等指标
    """
    
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self.records: List[MetricRecord] = []
        self.lock = threading.Lock()
        
        # 价格配置 (USD per 1M tokens)
        self.pricing = {
            "gpt-4o": {"prompt": 5.0, "completion": 15.0},
            "gpt-4": {"prompt": 30.0, "completion": 60.0},
            "gpt-3.5-turbo": {"prompt": 0.5, "completion": 1.5},
            "deepseek-chat": {"prompt": 0.1, "completion": 0.3},
            "gemini-1.5-flash": {"prompt": 0.075, "completion": 0.3},
            "qwen-plus": {"prompt": 0.2, "completion": 0.6},
        }
    
    def record(
        self,
        name: str,
        metric_type: MetricType,
        value: float,
        metadata: Optional[Dict[str, Any]] = None,
        success: bool = True,
        error_message: Optional[str] = None
    ):
        """记录指标"""
        if not self.enabled:
            return
        
        record = MetricRecord(
            name=name,
            metric_type=metric_type,
            value=value,
            timestamp=datetime.now().isoformat(),
            metadata=metadata or {},
            success=success,
            error_message=error_message
        )
        
        with self.lock:
            self.records.append(record)
    
    def record_latency(self, name: str, latency_ms: float, metadata: Optional[Dict] = None):
        """记录延迟"""
        self.record(name, MetricType.LATENCY, latency_ms, metadata)
    
    def record_cost(self, name: str, cost_usd: float, metadata: Optional[Dict] = None):
        """记录成本"""
        self.record(name, MetricType.COST, cost_usd, metadata)
    
    def record_tokens(self, name: str, tokens: int, metadata: Optional[Dict] = None):
        """记录token使用"""
        self.record(name, MetricType.TOKENS, tokens, metadata)
    
    def record_call(self, name: str, success: bool = True, error: Optional[str] = None):
        """记录调用"""
        self.record(
            name, 
            MetricType.COUNT if success else MetricType.ERROR,
            1 if success else 0,
            success=success,
            error_message=error
        )
    
    def calculate_cost(
        self,
        prompt_tokens: int,
        completion_tokens: int,
        model: str = "gpt-4o"
    ) -> float:
        """计算API调用成本"""
        prices = self.pricing.get(model, {"prompt": 5.0, "completion": 15.0})
        
        prompt_cost = (prompt_tokens / 1_000_000) * prices["prompt"]
        completion_cost = (completion_tokens / 1_000_000) * prices["completion"]
        
        return prompt_cost + completion_cost
    
    def get_aggregated(self, name: Optional[str] = None) -> AggregatedMetrics:
        """获取聚合指标"""
        with self.lock:
            filtered = self.records
            if name:
                filtered = [r for r in filtered if r.name == name]
            
            latency_records = [r for r in filtered if r.metric_type == MetricType.LATENCY]
            cost_records = [r for r in filtered if r.metric_type == MetricType.COST]
            token_records = [r for r in filtered if r.metric_type == MetricType.TOKENS]
            error_records = [r for r in filtered if r.metric_type == MetricType.ERROR]
            
            total_latencies = [r.value for r in latency_records]
            
            return AggregatedMetrics(
                total_calls=len(latency_records),
                successful_calls=len([r for r in latency_records if r.success]),
                failed_calls=len(error_records),
                total_latency_ms=sum(total_latencies) if total_latencies else 0,
                avg_latency_ms=sum(total_latencies) / len(total_latencies) if total_latencies else 0,
                min_latency_ms=min(total_latencies) if total_latencies else 0,
                max_latency_ms=max(total_latencies) if total_latencies else 0,
                total_cost_usd=sum(r.value for r in cost_records),
                total_tokens=sum(r.value for r in token_records),
                timestamp=datetime.now().isoformat()
            )
    
    def get_summary(self) -> Dict[str, Any]:
        """获取监控摘要"""
        total = self.get_aggregated()
        
        return {
            "total_calls": total.total_calls,
            "success_rate": total.successful_calls / total.total_calls if total.total_calls > 0 else 0,
            "avg_latency_ms": round(total.avg_latency_ms, 2),
            "total_cost_usd": round(total.total_cost_usd, 4),
            "total_tokens": total.total_tokens,
        }
    
    def clear(self):
        """清空记录"""
        with self.lock:
            self.records.clear()
    
    def export_to_dict(self) -> List[Dict]:
        """导出为字典"""
        with self.lock:
            return [
                {
                    "name": r.name,
                    "type": r.metric_type.value,
                    "value": r.value,
                    "timestamp": r.timestamp,
                    "metadata": r.metadata,
                    "success": r.success,
                }
                for r in self.records
            ]


class MonitoredLLM:
    """
    带监控的LLM包装器
    """
    
    def __init__(self, llm, monitor: PerformanceMonitor, name: str = "llm"):
        self.llm = llm
        self.monitor = monitor
        self.name = name
    
    async def ainvoke(self, prompt: str, **kwargs) -> Any:
        """带延迟追踪的调用"""
        start_time = time.perf_counter()
        model = kwargs.get("model", getattr(self.llm, "model", "unknown"))
        
        try:
            response = await self.llm.ainvoke(prompt, **kwargs)
            
            latency_ms = (time.perf_counter() - start_time) * 1000
            self.monitor.record_latency(self.name, latency_ms, {"model": model})
            self.monitor.record_call(self.name, success=True)
            
            # 记录成本
            if hasattr(response, "usage") and response.usage:
                usage = response.usage
                cost = self.monitor.calculate_cost(
                    usage.get("prompt_tokens", 0),
                    usage.get("completion_tokens", 0),
                    model
                )
                self.monitor.record_cost(self.name, cost, {"model": model})
                self.monitor.record_tokens(
                    self.name,
                    usage.get("total_tokens", 0),
                    {"model": model}
                )
            
            return response
            
        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            self.monitor.record_latency(self.name, latency_ms, {"model": model, "error": str(e)})
            self.monitor.record_call(self.name, success=False, error=str(e))
            raise
    
    async def astream(self, prompt: str, **kwargs):
        """带延迟追踪的流式调用"""
        start_time = time.perf_counter()
        
        try:
            full_response = ""
            async for chunk in self.llm.astream(prompt, **kwargs):
                full_response += chunk
                yield chunk
            
            latency_ms = (time.perf_counter() - start_time) * 1000
            self.monitor.record_latency(f"{self.name}_stream", latency_ms)
            self.monitor.record_call(f"{self.name}_stream", success=True)
            
        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            self.monitor.record_latency(f"{self.name}_stream", latency_ms)
            self.monitor.record_call(f"{self.name}_stream", success=False, error=str(e))
            raise


# 全局监控器实例
_global_monitor = PerformanceMonitor()


def get_monitor() -> PerformanceMonitor:
    """获取全局监控器"""
    return _global_monitor


def monitored(llm, name: str = "llm") -> MonitoredLLM:
    """创建带监控的LLM实例"""
    return MonitoredLLM(llm, _global_monitor, name)
