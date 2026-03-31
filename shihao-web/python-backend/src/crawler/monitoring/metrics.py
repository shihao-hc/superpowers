"""Prometheus metrics for crawler monitoring."""

import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Callable
from functools import wraps


class MetricType(Enum):
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


@dataclass
class MetricDefinition:
    """Metric definition."""

    name: str
    description: str
    metric_type: MetricType
    labels: list[str] = field(default_factory=list)
    buckets: Optional[list[float]] = None


class CrawlerMetrics:
    """Prometheus metrics for crawler operations.

    Metrics:
    - crawl_requests_total: Total crawl requests by status/strategy
    - crawl_duration_seconds: Crawl duration histogram
    - crawl_bytes_total: Total bytes crawled
    - crawl_errors_total: Total crawl errors by type
    - active_crawls: Currently active crawls
    - strategy_selections_total: Strategy selection counts
    - cache_hits_total: Cache hit counts
    - cache_misses_total: Cache miss counts
    """

    METRICS = {
        "crawl_requests_total": MetricDefinition(
            name="crawler_crawl_requests_total",
            description="Total number of crawl requests",
            metric_type=MetricType.COUNTER,
            labels=["status", "strategy"],
        ),
        "crawl_duration_seconds": MetricDefinition(
            name="crawler_crawl_duration_seconds",
            description="Crawl duration in seconds",
            metric_type=MetricType.HISTOGRAM,
            labels=["strategy"],
            buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, 120.0, 300.0],
        ),
        "crawl_bytes_total": MetricDefinition(
            name="crawler_crawl_bytes_total",
            description="Total bytes crawled",
            metric_type=MetricType.COUNTER,
            labels=["strategy"],
        ),
        "crawl_errors_total": MetricDefinition(
            name="crawler_crawl_errors_total",
            description="Total number of crawl errors",
            metric_type=MetricType.COUNTER,
            labels=["error_type", "strategy"],
        ),
        "active_crawls": MetricDefinition(
            name="crawler_active_crawls",
            description="Number of currently active crawls",
            metric_type=MetricType.GAUGE,
            labels=["strategy"],
        ),
        "strategy_selections_total": MetricDefinition(
            name="crawler_strategy_selections_total",
            description="Strategy selection counts",
            metric_type=MetricType.COUNTER,
            labels=["strategy", "reason"],
        ),
        "cache_hits_total": MetricDefinition(
            name="crawler_cache_hits_total",
            description="Cache hit count",
            metric_type=MetricType.COUNTER,
            labels=["cache_name"],
        ),
        "cache_misses_total": MetricDefinition(
            name="crawler_cache_misses_total",
            description="Cache miss count",
            metric_type=MetricType.COUNTER,
            labels=["cache_name"],
        ),
        "xpath_attempts_total": MetricDefinition(
            name="crawler_xpath_attempts_total",
            description="XPath generation attempts",
            metric_type=MetricType.COUNTER,
            labels=["strategy", "success"],
        ),
        "retry_attempts_total": MetricDefinition(
            name="crawler_retry_attempts_total",
            description="Retry attempts",
            metric_type=MetricType.COUNTER,
            labels=["strategy", "attempt_number"],
        ),
        "worker_tasks_total": MetricDefinition(
            name="crawler_worker_tasks_total",
            description="Worker task counts",
            metric_type=MetricType.COUNTER,
            labels=["worker_id", "status"],
        ),
        "queue_depth": MetricDefinition(
            name="crawler_queue_depth",
            description="Current job queue depth",
            metric_type=MetricType.GAUGE,
            labels=["queue_name"],
        ),
    }

    MAX_HISTOGRAM_VALUES: int = 1000
    MAX_LABEL_COMBINATIONS: int = 10000

    def __init__(
        self,
        metrics_prefix: str = "crawler",
        max_histogram_values: int = 1000,
        max_label_combinations: int = 10000,
    ):
        self.prefix = metrics_prefix
        self._metrics: dict = {}
        self._values: dict = {}
        self.MAX_HISTOGRAM_VALUES = max_histogram_values
        self.MAX_LABEL_COMBINATIONS = max_label_combinations
        self._label_counts: dict = {}
        self._initialize_metrics()

    def _initialize_metrics(self):
        """Initialize all metrics."""
        for key, definition in self.METRICS.items():
            full_name = f"{self.prefix}_{definition.name}"
            self._metrics[key] = {
                "name": full_name,
                "type": definition.metric_type.value,
                "help": definition.description,
                "labels": definition.labels,
                "buckets": definition.buckets,
            }
            self._values[key] = {}

    def record_crawl_request(self, strategy: str, status: str):
        """Record a crawl request."""
        self._increment(
            "crawl_requests_total", {"status": status, "strategy": strategy}
        )

    def record_crawl_duration(self, strategy: str, duration: float):
        """Record crawl duration."""
        self._observe("crawl_duration_seconds", duration, {"strategy": strategy})

    def record_crawl_bytes(self, strategy: str, bytes_count: int):
        """Record crawled bytes."""
        self._add("crawl_bytes_total", bytes_count, {"strategy": strategy})

    def record_crawl_error(self, strategy: str, error_type: str):
        """Record a crawl error."""
        self._increment(
            "crawl_errors_total", {"error_type": error_type, "strategy": strategy}
        )

    def record_strategy_selection(self, strategy: str, reason: str):
        """Record strategy selection."""
        self._increment(
            "strategy_selections_total", {"strategy": strategy, "reason": reason}
        )

    def record_cache_hit(self, cache_name: str):
        """Record cache hit."""
        self._increment("cache_hits_total", {"cache_name": cache_name})

    def record_cache_miss(self, cache_name: str):
        """Record cache miss."""
        self._increment("cache_misses_total", {"cache_name": cache_name})

    def record_xpath_attempt(self, strategy: str, success: bool):
        """Record XPath generation attempt."""
        self._increment(
            "xpath_attempts_total", {"strategy": strategy, "success": str(success)}
        )

    def record_retry(self, strategy: str, attempt: int):
        """Record retry attempt."""
        self._increment(
            "retry_attempts_total",
            {"strategy": strategy, "attempt_number": str(attempt)},
        )

    def set_active_crawls(self, strategy: str, count: int):
        """Set active crawl count."""
        self._set("active_crawls", count, {"strategy": strategy})

    def increment_active_crawls(self, strategy: str):
        """Increment active crawls."""
        self._increment("active_crawls", {}, {"strategy": strategy})

    def decrement_active_crawls(self, strategy: str):
        """Decrement active crawls."""
        self._decrement("active_crawls", {}, {"strategy": strategy})

    def set_queue_depth(self, queue_name: str, depth: int):
        """Set queue depth."""
        self._set("queue_depth", depth, {"queue_name": queue_name})

    def _increment(
        self,
        metric_key: str,
        label_values: dict,
        additional_labels: Optional[dict] = None,
    ):
        """Increment a counter metric."""
        labels = {**label_values, **(additional_labels or {})}
        key = self._make_key(metric_key, labels)

        if self._should_drop_label(key):
            return

        self._values[metric_key][key] = self._values[metric_key].get(key, 0) + 1

    def _should_drop_label(self, key: str) -> bool:
        """Check if we should drop this label combination to prevent memory issues."""
        current_count = self._label_counts.get(key, 0)

        if current_count == 0:
            total_labels = sum(self._label_counts.values())
            if total_labels >= self.MAX_LABEL_COMBINATIONS:
                oldest_key = min(
                    self._label_counts.keys(),
                    key=lambda k: self._label_counts[k],
                )
                del self._label_counts[oldest_key]
                if oldest_key in self._values.get("crawl_requests_total", {}):
                    del self._values["crawl_requests_total"][oldest_key]

        self._label_counts[key] = current_count + 1
        return False

    def _decrement(
        self,
        metric_key: str,
        label_values: dict,
        additional_labels: Optional[dict] = None,
    ):
        """Decrement a gauge metric."""
        labels = {**label_values, **(additional_labels or {})}
        key = self._make_key(metric_key, labels)
        self._values[metric_key][key] = self._values[metric_key].get(key, 0) - 1

    def _set(self, metric_key: str, value: float, labels: dict):
        """Set a gauge metric."""
        key = self._make_key(metric_key, labels)
        self._values[metric_key][key] = value

    def _add(self, metric_key: str, value: float, labels: dict):
        """Add to a counter metric."""
        key = self._make_key(metric_key, labels)
        self._values[metric_key][key] = self._values[metric_key].get(key, 0) + value

    def _observe(self, metric_key: str, value: float, labels: dict):
        """Observe a histogram/summary metric."""
        key = self._make_key(metric_key, labels)
        if metric_key not in self._values:
            self._values[metric_key] = {}
        if key not in self._values[metric_key]:
            self._values[metric_key][key] = {"count": 0, "sum": 0, "values": []}
        self._values[metric_key][key]["count"] += 1
        self._values[metric_key][key]["sum"] += value
        self._values[metric_key][key]["values"].append(value)
        if len(self._values[metric_key][key]["values"]) > self.MAX_HISTOGRAM_VALUES:
            self._values[metric_key][key]["values"] = self._values[metric_key][key][
                "values"
            ][-500:]

    def _make_key(self, metric_key: str, labels: dict) -> str:
        """Create unique key from metric and labels."""
        label_str = ",".join(f'{k}="{v}"' for k, v in sorted(labels.items()))
        return f"{metric_key}{{{label_str}}}"

    def get_metrics_text(self) -> str:
        """Export metrics in Prometheus text format."""
        lines = []
        for key, metric in self._metrics.items():
            lines.append(f"# HELP {metric['name']} {metric['help']}")
            lines.append(f"# TYPE {metric['name']} {metric['type']}")

            for key_str, value in self._values[key].items():
                if metric["type"] == "histogram":
                    definition = self.METRICS[key]
                    buckets = definition.buckets or []
                    total_count = value["count"]
                    total_sum = value["sum"]

                    for bucket in buckets:
                        bucket_count = sum(1 for v in value["values"] if v <= bucket)
                        lines.append(
                            f'{metric["name"]}_bucket{{le="{bucket}",{key_str[1:-1]}}} {bucket_count}'
                        )
                    lines.append(
                        f'{metric["name"]}_bucket{{le="+Inf",{key_str[1:-1]}}} {total_count}'
                    )
                    lines.append(f"{metric['name']}_sum{{{key_str[1:-1]}}} {total_sum}")
                    lines.append(
                        f"{metric['name']}_count{{{key_str[1:-1]}}} {total_count}"
                    )
                else:
                    lines.append(f"{metric['name']}{{{key_str}}} {value}")

        return "\n".join(lines)

    def get_summary(self) -> dict:
        """Get metrics summary as dict."""
        return {
            "crawl_requests": self._get_total("crawl_requests_total"),
            "crawl_errors": self._get_total("crawl_errors_total"),
            "cache_hits": self._get_total("cache_hits_total"),
            "cache_misses": self._get_total("cache_misses_total"),
            "avg_duration": self._get_avg_duration(),
        }

    def _get_total(self, metric_key: str) -> int:
        """Get total value for a counter metric."""
        return sum(
            v if isinstance(v, (int, float)) else v.get("count", 0)
            for v in self._values.get(metric_key, {}).values()
        )

    def _get_avg_duration(self) -> float:
        """Get average crawl duration."""
        hist_data = self._values.get("crawl_duration_seconds", {})
        total_sum = sum(v.get("sum", 0) for v in hist_data.values())
        total_count = sum(v.get("count", 0) for v in hist_data.values())
        return total_sum / total_count if total_count > 0 else 0


class MetricsCollector:
    """Context manager and decorator for collecting metrics."""

    def __init__(self, metrics: CrawlerMetrics, strategy: str):
        self.metrics = metrics
        self.strategy = strategy
        self.start_time: Optional[float] = None

    def __enter__(self):
        self.start_time = time.time()
        self.metrics.increment_active_crawls(self.strategy)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.time() - self.start_time
        self.metrics.decrement_active_crawls(self.strategy)
        self.metrics.record_crawl_duration(self.strategy, duration)

        if exc_type:
            self.metrics.record_crawl_error(self.strategy, exc_type.__name__)
            self.metrics.record_crawl_request(self.strategy, "error")
        else:
            self.metrics.record_crawl_request(self.strategy, "success")
        return False

    def record_bytes(self, bytes_count: int):
        """Record bytes crawled."""
        self.metrics.record_crawl_bytes(self.strategy, bytes_count)


def track_duration(metrics: CrawlerMetrics, strategy: str) -> Callable:
    """Decorator to track function duration."""

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                duration = time.time() - start_time
                metrics.record_crawl_duration(strategy, duration)
                return result
            finally:
                pass

        return async_wrapper

        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                duration = time.time() - start_time
                metrics.record_crawl_duration(strategy, duration)
                return result
            finally:
                pass

        return sync_wrapper

    return decorator


_global_metrics: Optional[CrawlerMetrics] = None


def get_metrics() -> CrawlerMetrics:
    """Get global metrics instance."""
    global _global_metrics
    if _global_metrics is None:
        _global_metrics = CrawlerMetrics()
    return _global_metrics


def set_metrics(metrics: CrawlerMetrics):
    """Set global metrics instance."""
    global _global_metrics
    _global_metrics = metrics
