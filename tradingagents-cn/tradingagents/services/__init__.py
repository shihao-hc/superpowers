"""
Services Module - 服务模块

提供用户偏好、审计日志、批量分析等服务
"""

from .preferences import (
    PreferenceKey,
    UserPreferencesService,
    SessionHistoryService,
    preferences_service,
    history_service,
)

from .audit_logger import (
    AuditEvent,
    AuditLogger,
    audit_log,
    audit_logger,
)

from .batch_analysis import (
    BatchStatus,
    BatchTask,
    StockAnalysisResult,
    BatchAnalysisService,
    batch_service,
)

__all__ = [
    # Preferences
    "PreferenceKey",
    "UserPreferencesService",
    "SessionHistoryService",
    "preferences_service",
    "history_service",
    # Audit
    "AuditEvent",
    "AuditLogger",
    "audit_log",
    "audit_logger",
    # Batch
    "BatchStatus",
    "BatchTask",
    "StockAnalysisResult",
    "BatchAnalysisService",
    "batch_service",
]
