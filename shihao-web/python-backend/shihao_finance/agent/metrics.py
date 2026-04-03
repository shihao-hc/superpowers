"""
Prometheus 监控端点
集成到 ShiHao Agent
"""

import logging
from typing import Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class PrometheusMetrics:
    """Prometheus 指标收集器"""

    def __init__(self):
        self._counters = {}
        self._gauges = {}
        self._histograms = {}

    def increment(self, name: str, labels: dict = None, value: int = 1):
        """增加计数器"""
        key = self._make_key(name, labels)
        self._counters[key] = self._counters.get(key, 0) + value

    def set_gauge(self, name: str, value: float, labels: dict = None):
        """设置仪表"""
        key = self._make_key(name, labels)
        self._gauges[key] = value

    def observe_histogram(self, name: str, value: float, labels: dict = None):
        """观察直方图"""
        key = self._make_key(name, labels)
        if key not in self._histograms:
            self._histograms[key] = []
        self._histograms[key].append(value)

    def _make_key(self, name: str, labels: dict = None) -> str:
        """创建键"""
        if not labels:
            return name
        label_str = ",".join(f'{k}="{v}"' for k, v in sorted(labels.items()))
        return f"{name}{{{label_str}}}"

    def export(self) -> str:
        """导出 Prometheus 格式"""
        lines = []

        for name, value in self._counters.items():
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {value}")

        for name, value in self._gauges.items():
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name} {value}")

        for name, values in self._histograms.items():
            if values:
                lines.append(f"# TYPE {name} histogram")
                lines.append(f"{name}_count {len(values)}")
                lines.append(f"{name}_sum {sum(values)}")
                lines.append(f"{name}_avg {sum(values) / len(values)}")

        return "\n".join(lines)


class MetricsEndpoint:
    """指标端点"""

    def __init__(self, metrics: PrometheusMetrics):
        self.metrics = metrics

    async def get_metrics(self) -> str:
        """获取指标"""
        return self.metrics.export()

    async def record_request(self, endpoint: str, status: int, duration_ms: float):
        """记录请求"""
        self.metrics.increment(
            "shihao_requests_total",
            labels={"endpoint": endpoint, "status": str(status)},
        )
        self.metrics.set_gauge(
            "shihao_request_duration_ms", duration_ms, labels={"endpoint": endpoint}
        )

    async def record_tool_call(self, tool_name: str, success: bool, duration_ms: float):
        """记录工具调用"""
        self.metrics.increment(
            "shihao_tool_calls_total",
            labels={"tool": tool_name, "success": str(success).lower()},
        )
        self.metrics.observe_histogram(
            "shihao_tool_duration_ms", duration_ms, labels={"tool": tool_name}
        )

    async def record_model_call(
        self, model: str, tokens: int, duration_ms: float, cost: float
    ):
        """记录模型调用"""
        self.metrics.increment("shihao_model_calls_total", labels={"model": model})
        self.metrics.increment(
            "shihao_model_tokens_total", labels={"model": model}, value=tokens
        )
        self.metrics.observe_histogram(
            "shihao_model_duration_ms", duration_ms, labels={"model": model}
        )
        self.metrics.increment(
            "shihao_model_cost_total", labels={"model": model}, value=int(cost * 1000)
        )

    async def record_error(self, error_type: str):
        """记录错误"""
        self.metrics.increment("shihao_errors_total", labels={"type": error_type})


def create_metrics_endpoint() -> tuple[MetricsEndpoint, PrometheusMetrics]:
    """创建指标端点"""
    metrics = PrometheusMetrics()
    endpoint = MetricsEndpoint(metrics)
    return endpoint, metrics
