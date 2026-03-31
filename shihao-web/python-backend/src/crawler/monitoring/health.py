"""Monitoring endpoints for crawler health and metrics."""

import logging
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Callable
from .metrics import CrawlerMetrics, get_metrics

logger = logging.getLogger(__name__)


@dataclass
class HealthStatus:
    """Health check status."""

    status: str
    healthy: bool
    checks: dict
    timestamp: datetime
    uptime_seconds: float


class HealthChecker:
    """Health checker for crawler components."""

    def __init__(self, metrics: Optional[CrawlerMetrics] = None):
        self.metrics = metrics or get_metrics()
        self._start_time = time.time()
        self._checks: dict[str, Callable] = {}

    def register_check(self, name: str, check_fn: Callable):
        """Register a health check function."""
        self._checks[name] = check_fn

    async def check_all(self) -> HealthStatus:
        """Run all health checks."""
        checks = {}
        healthy = True

        for name, check_fn in self._checks.items():
            try:
                result = await check_fn()
                checks[name] = {"status": "ok" if result else "failed", "value": result}
                if not result:
                    healthy = False
            except Exception as e:
                checks[name] = {"status": "error", "error": str(e)}
                healthy = False
                logger.error(f"Health check {name} failed: {e}")

        return HealthStatus(
            status="healthy" if healthy else "unhealthy",
            healthy=healthy,
            checks=checks,
            timestamp=datetime.now(),
            uptime_seconds=time.time() - self._start_time,
        )

    def to_dict(self, status: HealthStatus) -> dict:
        """Convert health status to dict."""
        return {
            "status": status.status,
            "healthy": status.healthy,
            "checks": status.checks,
            "timestamp": status.timestamp.isoformat(),
            "uptime_seconds": status.uptime_seconds,
        }


@dataclass
class PrometheusEndpoint:
    """Prometheus metrics endpoint."""

    metrics: CrawlerMetrics
    content_type: str = "text/plain; version=0.0.4; charset=utf-8"

    async def get_metrics(self) -> tuple[str, str]:
        """Get metrics in Prometheus format."""
        content = self.metrics.get_metrics_text()
        return content, self.content_type

    async def get_json(self) -> dict:
        """Get metrics as JSON."""
        return {
            "metrics": self.metrics.get_summary(),
            "timestamp": datetime.now().isoformat(),
        }


class CrawlerMonitor:
    """Combined monitoring for crawler.

    Features:
    - Health checks
    - Metrics endpoint
    - Alerting support
    - Status page
    """

    def __init__(self, metrics: Optional[CrawlerMetrics] = None):
        self.metrics = metrics or get_metrics()
        self.health_checker = HealthChecker(self.metrics)
        self.prometheus_endpoint = PrometheusEndpoint(self.metrics)
        self._alerts: list[dict] = []

    def register_default_checks(self):
        """Register default health checks."""
        self.health_checker.register_check("metrics_collector", self._check_metrics)
        self.health_checker.register_check("active_crawls", self._check_active_crawls)

    async def _check_metrics(self) -> bool:
        """Check if metrics collector is working."""
        return self.metrics is not None

    async def _check_active_crawls(self) -> bool:
        """Check if there are no stuck crawls."""
        summary = self.metrics.get_summary()
        return summary["avg_duration"] < 300

    async def get_health(self) -> dict:
        """Get health status."""
        status = await self.health_checker.check_all()
        return self.health_checker.to_dict(status)

    async def get_metrics(self) -> tuple[str, str]:
        """Get Prometheus metrics."""
        return await self.prometheus_endpoint.get_metrics()

    async def get_status_page(self) -> dict:
        """Get comprehensive status page data."""
        health = await self.get_health()
        metrics = await self.prometheus_endpoint.get_json()
        return {
            "version": "1.0.0",
            "health": health,
            "metrics": metrics,
            "alerts": self._alerts,
        }

    def trigger_alert(self, name: str, message: str, severity: str = "warning"):
        """Trigger an alert."""
        alert = {
            "name": name,
            "message": message,
            "severity": severity,
            "timestamp": datetime.now().isoformat(),
        }
        self._alerts.append(alert)
        logger.warning(f"Alert triggered: {name} - {message}")

    def clear_alerts(self):
        """Clear all alerts."""
        self._alerts = []


_global_monitor: Optional[CrawlerMonitor] = None


def get_monitor() -> CrawlerMonitor:
    """Get global monitor instance."""
    global _global_monitor
    if _global_monitor is None:
        _global_monitor = CrawlerMonitor()
        _global_monitor.register_default_checks()
    return _global_monitor
