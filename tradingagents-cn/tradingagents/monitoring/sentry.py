"""
TradingAgents-CN Sentry Integration
错误跟踪和性能监控
"""

import os
from typing import Optional

try:
    import sentry_sdk
    from sentry_sdk.integrations.asgi import SentryAsgiMiddleware
    from sentry_sdk.integrations.fastapi import FastAsgiIntegration
    from sentry_sdk.integrations.starlette import StarletteIntegration
    SENTRY_AVAILABLE = True
except ImportError:
    SENTRY_AVAILABLE = False


def init_sentry(
    dsn: Optional[str] = None,
    environment: str = None,
    traces_sample_rate: float = 1.0,
    profiles_sample_rate: float = 1.0,
):
    """
    初始化 Sentry SDK

    Args:
        dsn: Sentry DSN 地址
        environment: 环境名称 (production/staging/development)
        traces_sample_rate: 追踪采样率 (0.0-1.0)
        profiles_sample_rate: 性能采样率 (0.0-1.0)
    """
    if not SENTRY_AVAILABLE:
        print("[WARN] Sentry SDK not installed. Run: pip install sentry-sdk")
        return None

    dsn = dsn or os.getenv("SENTRY_DSN")
    if not dsn:
        print("[INFO] SENTRY_DSN not configured, skipping Sentry initialization")
        return None

    environment = environment or os.getenv("ENVIRONMENT", "production")

    sentry_sdk.init(
        dsn=dsn,
        environment=environment,
        traces_sample_rate=traces_sample_rate,
        profiles_sample_rate=profiles_sample_rate,
        integrations=[
            FastAsgiIntegration(transaction_style="url"),
            StarletteIntegration(transaction_style="url"),
        ],
        before_send=lambda event, hint: _before_send(event, hint),
    )

    print(f"[INFO] Sentry initialized (environment={environment})")
    return sentry_sdk


def _before_send(event: dict, hint: dict) -> Optional[dict]:
    """在发送事件前进行过滤"""
    if "exc_info" in hint:
        exc_type, exc_value, _ = hint["exc_info"]

        if exc_type in [KeyboardInterrupt, SystemExit]:
            return None

        if "timeout" in str(exc_value).lower():
            event["level"] = "warning"

    return event


def capture_exception(error: Exception, **extra):
    """手动捕获异常"""
    if SENTRY_AVAILABLE:
        with sentry_sdk.configure_scope() as scope:
            for key, value in extra.items():
                scope.set_extra(key, value)
        sentry_sdk.capture_exception(error)


def capture_message(message: str, level: str = "info", **extra):
    """手动捕获消息"""
    if SENTRY_AVAILABLE:
        with sentry_sdk.configure_scope() as scope:
            for key, value in extra.items():
                scope.set_extra(key, value)
        sentry_sdk.capture_message(message, level=level)


def set_user(user_id: str, **kwargs):
    """设置用户信息"""
    if SENTRY_AVAILABLE:
        sentry_sdk.set_user({"id": user_id, **kwargs})


def add_breadcrumb(message: str, category: str = "default", **data):
    """添加面包屑"""
    if SENTRY_AVAILABLE:
        sentry_sdk.add_breadcrumb(
            message=message,
            category=category,
            data=data,
        )


def get_sentry_middleware():
    """获取 Sentry ASGI 中间件"""
    if SENTRY_AVAILABLE:
        return SentryAsgiMiddleware
    return None
