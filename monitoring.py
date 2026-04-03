"""
Monitoring & Alerting Module.
- Real-time monitoring dashboard
- Alert management (DingTalk, Telegram, Email)
- XAI explainability integration
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
import json
import threading
import time


class AlertLevel(Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertChannel(Enum):
    """Alert notification channels."""
    CONSOLE = "console"
    DINGTALK = "dingtalk"
    TELEGRAM = "telegram"
    EMAIL = "email"
    WEBHOOK = "webhook"


@dataclass
class Alert:
    """Alert message."""
    id: str
    timestamp: str
    level: AlertLevel
    title: str
    message: str
    metadata: Dict = field(default_factory=dict)
    channel: AlertChannel = AlertChannel.CONSOLE
    sent: bool = False


class AlertManager:
    """Centralized alert management."""

    def __init__(self):
        self.alerts: List[Alert] = []
        self.handlers: Dict[AlertChannel, Callable] = {
            AlertChannel.CONSOLE: self._console_handler
        }

    def register_handler(self, channel: AlertChannel, handler: Callable) -> None:
        """Register alert handler."""
        self.handlers[channel] = handler

    def send_alert(
        self,
        level: AlertLevel,
        title: str,
        message: str,
        channel: AlertChannel = AlertChannel.CONSOLE,
        metadata: Dict = None
    ) -> Alert:
        """Send alert through registered handlers."""
        alert = Alert(
            id=f"alert_{len(self.alerts)}",
            timestamp=datetime.now().isoformat(),
            level=level,
            title=title,
            message=message,
            metadata=metadata or {},
            channel=channel
        )

        # Send to handler
        if channel in self.handlers:
            self.handlers[channel](alert)
            alert.sent = True

        self.alerts.append(alert)
        return alert

    def _console_handler(self, alert: Alert) -> None:
        """Console alert output."""
        prefix = {
            AlertLevel.INFO: "ℹ️",
            AlertLevel.WARNING: "⚠️",
            AlertLevel.ERROR: "❌",
            AlertLevel.CRITICAL: "🚨"
        }.get(alert.level, "📌")

        print(f"\n{prefix} [{alert.level.value.upper()}] {alert.title}")
        print(f"   {alert.message}")

    def get_recent_alerts(self, level: AlertLevel = None, limit: int = 10) -> List[Alert]:
        """Get recent alerts."""
        alerts = self.alerts
        if level:
            alerts = [a for a in alerts if a.level == level]
        return alerts[-limit:]

    def clear_alerts(self) -> None:
        """Clear all alerts."""
        self.alerts = []


class DingTalkNotifier:
    """DingTalk webhook notifier."""

    def __init__(self, webhook_url: str = None):
        self.webhook_url = webhook_url

    def send(self, alert: Alert) -> bool:
        """Send DingTalk message."""
        if not self.webhook_url:
            return False

        # Construct message
        msg = {
            "msgtype": "text",
            "text": {
                "content": f"[{alert.level.value.upper()}] {alert.title}\n{alert.message}"
            }
        }

        # In real implementation, use requests to post
        print(f"DingTalk: Would send to {self.webhook_url}")
        return True


class TelegramNotifier:
    """Telegram bot notifier."""

    def __init__(self, bot_token: str = None, chat_id: str = None):
        self.bot_token = bot_token
        self.chat_id = chat_id

    def send(self, alert: Alert) -> bool:
        """Send Telegram message."""
        if not self.bot_token or not self.chat_id:
            return False

        text = f"*{alert.level.value.upper()}* {alert.title}\n{alert.message}"
        # In real implementation, use telegram bot API
        print(f"Telegram: Would send to {self.chat_id}")
        return True


class MonitoringDashboard:
    """Real-time monitoring dashboard."""

    def __init__(self, alert_manager: AlertManager = None):
        self.alert_manager = alert_manager or AlertManager()
        self.metrics: Dict[str, float] = {}
        self.history: List[Dict] = []
        self._monitoring = False
        self._monitor_thread = None

    def update_metric(self, name: str, value: float) -> None:
        """Update a metric."""
        self.metrics[name] = value
        self.history.append({
            'timestamp': datetime.now().isoformat(),
            'name': name,
            'value': value
        })

        # Check thresholds and trigger alerts
        self._check_thresholds(name, value)

    def _check_thresholds(self, name: str, value: float) -> None:
        """Check metric thresholds."""
        thresholds = {
            'daily_pnl': (-10000, -5000),
            'sharpe_ratio': (0.5, 1.0),
            'max_drawdown': (0.2, 0.3),
        }

        if name in thresholds:
            warning, critical = thresholds[name]
            if value < critical:
                self.alert_manager.send_alert(
                    AlertLevel.CRITICAL,
                    f"{name} critical",
                    f"{name} = {value:.4f} (threshold: {critical})",
                    metadata={'metric': name, 'value': value}
                )
            elif value < warning:
                self.alert_manager.send_alert(
                    AlertLevel.WARNING,
                    f"{name} warning",
                    f"{name} = {value:.4f} (threshold: {warning})",
                    metadata={'metric': name, 'value': value}
                )

    def get_dashboard_state(self) -> Dict:
        """Get current dashboard state."""
        return {
            'timestamp': datetime.now().isoformat(),
            'metrics': self.metrics,
            'recent_alerts': len(self.alert_manager.get_recent_alerts(limit=5)),
            'monitoring': self._monitoring
        }

    def start_monitoring(self, interval: int = 60) -> None:
        """Start background monitoring."""
        self._monitoring = True

        def monitor_loop():
            while self._monitoring:
                # Collect system metrics
                self.update_metric('timestamp', time.time())
                time.sleep(interval)

        self._monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        self._monitor_thread.start()

    def stop_monitoring(self) -> None:
        """Stop background monitoring."""
        self._monitoring = False


class ExplainabilityReporter:
    """Generate explainability reports for signals and decisions."""

    def __init__(self):
        pass

    def generate_signal_explanation(
        self,
        ticker: str,
        score: float,
        factor_contributions: Dict[str, float],
        market_conditions: Dict = None
    ) -> str:
        """Generate human-readable signal explanation."""
        lines = [f"=== {ticker} 信号分析 ===", ""]

        # Overall score
        direction = "看涨" if score > 0 else "看跌"
        lines.append(f"综合评分: {score:.4f} ({direction})")
        lines.append("")

        # Factor contributions
        lines.append("因子贡献:")
        sorted_factors = sorted(factor_contributions.items(), key=lambda x: abs(x[1]), reverse=True)
        for factor, contribution in sorted_factors[:5]:
            sign = "+" if contribution > 0 else ""
            lines.append(f"  {factor}: {sign}{contribution:.4f}")
        lines.append("")

        # Market context
        if market_conditions:
            lines.append("市场环境:")
            for key, value in market_conditions.items():
                lines.append(f"  {key}: {value}")
            lines.append("")

        return "\n".join(lines)

    def generate_portfolio_explanation(
        self,
        positions: List[Dict],
        risk_metrics: Dict
    ) -> str:
        """Generate portfolio-level explanation."""
        lines = ["=== 组合分析报告 ===", ""]

        # Position summary
        lines.append(f"持仓数量: {len(positions)}")
        total_value = sum(p.get('market_value', 0) for p in positions)
        lines.append(f"总市值: ${total_value:,.2f}")
        lines.append("")

        # Risk metrics
        lines.append("风险指标:")
        lines.append(f"  最大回撤: {risk_metrics.get('max_drawdown', 0)*100:.2f}%")
        lines.append(f"  夏普比率: {risk_metrics.get('sharpe', 0):.2f}")
        lines.append(f"  波动率: {risk_metrics.get('volatility', 0)*100:.2f}%")
        lines.append("")

        # Sector exposure
        if positions:
            sectors = {}
            for p in positions:
                sector = p.get('sector', 'Unknown')
                sectors[sector] = sectors.get(sector, 0) + p.get('weight', 0)

            lines.append("行业暴露:")
            for sector, weight in sorted(sectors.items(), key=lambda x: x[1], reverse=True)[:5]:
                lines.append(f"  {sector}: {weight*100:.1f}%")

        return "\n".join(lines)

    def generate_risk_alert(
        self,
        risk_report
    ) -> str:
        """Generate risk alert explanation."""
        lines = ["=== 风险告警 ===", ""]

        level_colors = {
            "low": "🟢",
            "medium": "🟡",
            "high": "🟠",
            "critical": "🔴"
        }

        icon = level_colors.get(risk_report.risk_level.value, "⚪")
        lines.append(f"风险等级: {icon} {risk_report.risk_level.value.upper()}")
        lines.append(f"当日盈亏: ${risk_report.daily_pnl:,.2f}")
        lines.append(f"持仓占比: {risk_report.max_position_pct*100:.1f}%")
        lines.append(f"杠杆率: {risk_report.leverage:.2f}x")

        if risk_report.active_alerts:
            lines.append("")
            lines.append("活跃告警:")
            for alert in risk_report.active_alerts:
                lines.append(f"  ⚠️ {alert}")

        return "\n".join(lines)


def demo_monitoring():
    """Demo monitoring and alerting."""
    # Setup alert manager
    am = AlertManager()
    am.register_handler(AlertChannel.CONSOLE, am.handlers[AlertChannel.CONSOLE])

    # Setup dashboard
    dashboard = MonitoringDashboard(am)

    # Update metrics
    dashboard.update_metric('portfolio_value', 1000000)
    dashboard.update_metric('daily_pnl', -8000)
    dashboard.update_metric('sharpe_ratio', 1.2)

    # Get dashboard state
    state = dashboard.get_dashboard_state()
    print("\n=== Dashboard State ===")
    print(f"Metrics: {state['metrics']}")
    print(f"Recent Alerts: {state['recent_alerts']}")

    # Generate explanations
    reporter = ExplainabilityReporter()

    print("\n=== Signal Explanation ===")
    print(reporter.generate_signal_explanation(
        "AAPL", 0.75,
        {"ROE": 0.3, "Momentum": 0.25, "Value": 0.2},
        {"market_regime": "bull", "vix": 15.2}
    ))


if __name__ == "__main__":
    demo_monitoring()
