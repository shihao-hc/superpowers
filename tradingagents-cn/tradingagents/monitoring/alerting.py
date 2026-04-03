"""
TradingAgents-CN Alerting System
告警系统 - 支持 Webhook、DingTalk、企业微信、飞书
"""

import os
import asyncio
import json
from typing import Dict, Any, Optional, List, Callable
from enum import Enum
from datetime import datetime
from dataclasses import dataclass, field
import httpx


class AlertLevel(str, Enum):
    """告警级别"""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AlertChannel(str, Enum):
    """告警渠道"""
    WEBHOOK = "webhook"
    DINGTALK = "dingtalk"
    WECHAT_WORK = "wechat_work"
    FEISHU = "feishu"
    SLACK = "slack"
    EMAIL = "email"
    CONSOLE = "console"


@dataclass
class Alert:
    """告警消息"""
    level: AlertLevel
    title: str
    message: str
    source: str = "TradingAgents"
    tags: Dict[str, str] = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class AlertManager:
    """
    告警管理器
    支持多渠道发送告警
    """

    def __init__(self):
        self._handlers: Dict[AlertChannel, Callable] = {}
        self._webhook_urls: Dict[AlertChannel, str] = {}
        self._enabled_channels: List[AlertChannel] = [AlertChannel.CONSOLE]
        self._register_default_handlers()

    def _register_default_handlers(self):
        """注册默认处理器"""
        self._handlers[AlertChannel.CONSOLE] = self._send_console
        self._handlers[AlertChannel.WEBHOOK] = self._send_webhook
        self._handlers[AlertChannel.DINGTALK] = self._send_dingtalk
        self._handlers[AlertChannel.WECHAT_WORK] = self._send_wechat_work
        self._handlers[AlertChannel.FEISHU] = self._send_feishu

    def configure_channel(self, channel: AlertChannel, url: str):
        """配置告警渠道"""
        self._webhook_urls[channel] = url
        if channel not in self._enabled_channels:
            self._enabled_channels.append(channel)

    def enable_channel(self, channel: AlertChannel):
        """启用告警渠道"""
        if channel not in self._enabled_channels:
            self._enabled_channels.append(channel)

    def disable_channel(self, channel: AlertChannel):
        """禁用告警渠道"""
        if channel in self._enabled_channels:
            self._enabled_channels.remove(channel)

    async def send_alert(self, alert: Alert):
        """发送告警"""
        tasks = []
        for channel in self._enabled_channels:
            if channel in self._handlers:
                handler = self._handlers[channel]
                tasks.append(self._safe_send(channel, handler, alert))

        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    def send_alert_sync(self, alert: Alert):
        """同步发送告警"""
        asyncio.run(self.send_alert(alert))

    async def _safe_send(self, channel: AlertChannel, handler: Callable, alert: Alert):
        """安全发送告警"""
        try:
            await handler(alert)
        except Exception as e:
            print(f"[AlertManager] Failed to send via {channel}: {e}")

    async def _send_console(self, alert: Alert):
        """发送到控制台"""
        icons = {
            AlertLevel.INFO: "ℹ️",
            AlertLevel.WARNING: "⚠️",
            AlertLevel.ERROR: "❌",
            AlertLevel.CRITICAL: "🚨",
        }
        icon = icons.get(alert.level, "📢")
        print(f"{icon} [{alert.level.upper()}] {alert.title}")
        print(f"   {alert.message}")
        print(f"   Source: {alert.source} | Time: {alert.timestamp}")

    async def _send_webhook(self, alert: Alert):
        """发送到 Webhook"""
        url = self._webhook_urls.get(AlertChannel.WEBHOOK)
        if not url:
            return

        payload = {
            "level": alert.level.value,
            "title": alert.title,
            "message": alert.message,
            "source": alert.source,
            "tags": alert.tags,
            "timestamp": alert.timestamp,
        }

        async with httpx.AsyncClient() as client:
            await client.post(url, json=payload, timeout=10)

    async def _send_dingtalk(self, alert: Alert):
        """发送到钉钉"""
        url = self._webhook_urls.get(AlertChannel.DINGTALK)
        if not url:
            return

        color_map = {
            AlertLevel.INFO: "58B5FF",
            AlertLevel.WARNING: "FFB800",
            AlertLevel.ERROR: "FF6B6B",
            AlertLevel.CRITICAL: "FF0000",
        }

        payload = {
            "msgtype": "markdown",
            "markdown": {
                "title": f"{alert.level.value.upper()}: {alert.title}",
                "text": f"### {alert.level.value.upper()}: {alert.title}\n\n"
                       f"**消息**: {alert.message}\n\n"
                       f"**来源**: {alert.source}\n\n"
                       f"**时间**: {alert.timestamp}\n\n"
                       f"**标签**: {', '.join(f'{k}={v}' for k, v in alert.tags.items())}",
            },
        }

        async with httpx.AsyncClient() as client:
            await client.post(url, json=payload, timeout=10)

    async def _send_wechat_work(self, alert: Alert):
        """发送到企业微信"""
        url = self._webhook_urls.get(AlertChannel.WECHAT_WORK)
        if not url:
            return

        payload = {
            "msgtype": "markdown",
            "markdown": {
                "content": f"### {alert.title}\n\n"
                          f"> 级别: **{alert.level.value.upper()}**\n\n"
                          f"> {alert.message}\n\n"
                          f"> 来源: {alert.source} | 时间: {alert.timestamp}",
            },
        }

        async with httpx.AsyncClient() as client:
            await client.post(url, json=payload, timeout=10)

    async def _send_feishu(self, alert: Alert):
        """发送到飞书"""
        url = self._webhook_urls.get(AlertChannel.FEISHU)
        if not url:
            return

        color_map = {
            AlertLevel.INFO: "blue",
            AlertLevel.WARNING: "orange",
            AlertLevel.ERROR: "red",
            AlertLevel.CRITICAL: "red",
        }

        payload = {
            "msg_type": "interactive",
            "card": {
                "header": {
                    "title": {"tag": "plain_text", "content": f"{alert.level.value.upper()}: {alert.title}"},
                    "template": color_map.get(alert.level, "blue"),
                },
                "elements": [
                    {"tag": "div", "text": {"tag": "lark_md", "content": f"**消息**: {alert.message}"}},
                    {"tag": "div", "text": {"tag": "lark_md", "content": f"**来源**: {alert.source}"}},
                    {"tag": "div", "text": {"tag": "lark_md", "content": f"**时间**: {alert.timestamp}"}},
                ],
            },
        }

        async with httpx.AsyncClient() as client:
            await client.post(url, json=payload, timeout=10)

    def alert(
        self,
        level: AlertLevel,
        title: str,
        message: str,
        source: str = "TradingAgents",
        **tags
    ):
        """便捷告警方法"""
        alert = Alert(
            level=level,
            title=title,
            message=message,
            source=source,
            tags=tags,
        )
        asyncio.create_task(self.send_alert(alert))

    def info(self, title: str, message: str, **tags):
        self.alert(AlertLevel.INFO, title, message, **tags)

    def warning(self, title: str, message: str, **tags):
        self.alert(AlertLevel.WARNING, title, message, **tags)

    def error(self, title: str, message: str, **tags):
        self.alert(AlertLevel.ERROR, title, message, **tags)

    def critical(self, title: str, message: str, **tags):
        self.alert(AlertLevel.CRITICAL, title, message, **tags)


_alert_manager = AlertManager()


def get_alert_manager() -> AlertManager:
    """获取全局告警管理器"""
    return _alert_manager


def configure_alerting(
    dingtalk_url: Optional[str] = None,
    wechat_url: Optional[str] = None,
    feishu_url: Optional[str] = None,
    webhook_url: Optional[str] = None,
):
    """配置告警渠道"""
    if dingtalk_url:
        _alert_manager.configure_channel(AlertChannel.DINGTALK, dingtalk_url)
    if wechat_url:
        _alert_manager.configure_channel(AlertChannel.WECHAT_WORK, wechat_url)
    if feishu_url:
        _alert_manager.configure_channel(AlertChannel.FEISHU, feishu_url)
    if webhook_url:
        _alert_manager.configure_channel(AlertChannel.WEBHOOK, webhook_url)
