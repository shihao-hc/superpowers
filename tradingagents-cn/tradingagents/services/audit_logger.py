"""
Audit Logging Service - 审计日志服务

支持 MongoDB 审计日志存储，包含敏感数据脱敏
"""

import re
import os
import json
import time
from typing import Dict, Any, Optional, List, Callable
from datetime import datetime, timedelta
from enum import Enum
from functools import wraps
from contextlib import asynccontextmanager


SENSITIVE_PATTERNS = [
    (r'api[_-]?key["\']?\s*[:=]\s*["\'][^"\']+', '***REDACTED***'),
    (r'password["\']?\s*[:=]\s*["\'][^"\']+', '***REDACTED***'),
    (r'secret["\']?\s*[:=]\s*["\'][^"\']+', '***REDACTED***'),
    (r'token["\']?\s*[:=]\s*["\'][^"\']+', '***REDACTED***'),
    (r'authorization["\']?\s*[:=]\s*["\'][^"\']+', '***REDACTED***'),
    (r'bearer\s+[a-zA-Z0-9\-_.]+', 'Bearer ***REDACTED***'),
    (r'sk-[a-zA-Z0-9]{20,}', '***REDACTED_API_KEY***'),
    (r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', '***REDACTED_EMAIL***'),
]


class AuditEvent(str, Enum):
    """审计事件类型"""
    USER_LOGIN = "user_login"
    USER_LOGOUT = "user_logout"
    ANALYSIS_SUBMIT = "analysis_submit"
    ANALYSIS_VIEW = "analysis_view"
    ANALYSIS_COMPLETE = "analysis_complete"
    ANALYSIS_FAILED = "analysis_failed"
    API_KEY_VERIFY = "api_key_verify"
    API_KEY_FAILED = "api_key_failed"
    RATE_LIMIT_EXCEEDED = "rate_limit_exceeded"
    BUDGET_ALERT = "budget_alert"
    SETTINGS_CHANGE = "settings_change"
    DATA_EXPORT = "data_export"
    ERROR_OCCURRED = "error_occurred"


class AuditLogger:
    """
    审计日志服务
    
    支持：
    - MongoDB 存储
    - 敏感数据脱敏
    - 按时间/用户/操作类型检索
    - 异步批量写入
    """

    def __init__(self, mongodb_client=None):
        self.mongodb = mongodb_client
        self._collection_name = "audit_logs"
        self._buffer: List[Dict[str, Any]] = []
        self._buffer_size = 100
        self._buffer_flush_interval = 5  # 秒
        self._last_flush = time.time()
        self._in_memory_fallback = True

    def _get_collection(self):
        """获取 MongoDB 集合"""
        if self.mongodb:
            return self.mongodb[self._collection_name]
        return None

    def _sanitize(self, data: Any) -> Any:
        """
        递归脱敏敏感数据
        
        Args:
            data: 待脱敏数据
            
        Returns:
            脱敏后的数据
        """
        if isinstance(data, dict):
            sanitized = {}
            for key, value in data.items():
                key_lower = key.lower()
                if any(s in key_lower for s in ['key', 'password', 'secret', 'token', 'auth']):
                    sanitized[key] = '***REDACTED***'
                else:
                    sanitized[key] = self._sanitize(value)
            return sanitized
        elif isinstance(data, list):
            return [self._sanitize(item) for item in data]
        elif isinstance(data, str):
            sanitized = data
            for pattern, replacement in SENSITIVE_PATTERNS:
                sanitized = re.sub(pattern, replacement, sanitized, flags=re.IGNORECASE)
            return sanitized
        else:
            return data

    def log(
        self,
        event: str,
        user_id: str = "anonymous",
        client_ip: str = "unknown",
        resource_id: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        success: bool = True,
        severity: str = "info"
    ) -> bool:
        """
        记录审计日志
        
        Args:
            event: 事件类型 (使用 AuditEvent 枚举)
            user_id: 用户ID
            client_ip: 客户端IP
            resource_id: 资源ID (如 task_id)
            details: 事件详情
            success: 是否成功
            severity: 严重程度 (info/warning/error/critical)
            
        Returns:
            bool: 是否记录成功
        """
        audit_entry = {
            "event": event,
            "user_id": user_id,
            "client_ip": client_ip,
            "resource_id": resource_id,
            "details": self._sanitize(details) if details else {},
            "success": success,
            "severity": severity,
            "timestamp": datetime.now().isoformat(),
            "user_agent": os.getenv("HTTP_USER_AGENT", "unknown"),
        }

        if self._in_memory_fallback or not self.mongodb:
            self._buffer.append(audit_entry)
            if len(self._buffer) >= self._buffer_size:
                self._flush_buffer()
            return True

        try:
            collection = self._get_collection()
            if collection:
                collection.insert_one(audit_entry)
                return True
        except Exception as e:
            print(f"Audit log write failed: {e}")
            self._buffer.append(audit_entry)
            return False

    def _flush_buffer(self):
        """刷新缓冲区到 MongoDB"""
        if not self._buffer or not self.mongodb:
            return

        try:
            collection = self._get_collection()
            if collection and self._buffer:
                collection.insert_many(self._buffer)
                self._buffer = []
                self._last_flush = time.time()
        except Exception as e:
            print(f"Audit buffer flush failed: {e}")

    def query(
        self,
        user_id: Optional[str] = None,
        event: Optional[str] = None,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        success: Optional[bool] = None,
        severity: Optional[str] = None,
        limit: int = 100,
        skip: int = 0
    ) -> List[Dict[str, Any]]:
        """
        查询审计日志
        
        Args:
            user_id: 按用户ID筛选
            event: 按事件类型筛选
            start_time: 开始时间
            end_time: 结束时间
            success: 按成功状态筛选
            severity: 按严重程度筛选
            limit: 返回数量
            skip: 跳过数量
            
        Returns:
            审计日志列表
        """
        if self._buffer:
            self._flush_buffer()

        if not self.mongodb:
            return self._buffer[-limit:]

        collection = self._get_collection()
        if not collection:
            return []

        query_filter = {}
        
        if user_id:
            query_filter["user_id"] = user_id
        if event:
            query_filter["event"] = event
        if success is not None:
            query_filter["success"] = success
        if severity:
            query_filter["severity"] = severity
            
        if start_time or end_time:
            query_filter["timestamp"] = {}
            if start_time:
                query_filter["timestamp"]["$gte"] = start_time.isoformat()
            if end_time:
                query_filter["timestamp"]["$lte"] = end_time.isoformat()

        try:
            cursor = collection.find(query_filter).sort("timestamp", -1).skip(skip).limit(limit)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(doc)
            return results
        except Exception as e:
            print(f"Audit query failed: {e}")
            return []

    def get_statistics(
        self,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None
    ) -> Dict[str, Any]:
        """
        获取审计统计信息
        
        Args:
            start_time: 开始时间
            end_time: 结束时间
            
        Returns:
            统计信息字典
        """
        if not self.mongodb:
            return {
                "total_events": len(self._buffer),
                "unique_users": len(set(e["user_id"] for e in self._buffer)),
            }

        collection = self._get_collection()
        if not collection:
            return {}

        match_stage = {"$match": {}}
        if start_time or end_time:
            match_stage["$match"]["timestamp"] = {}
            if start_time:
                match_stage["$match"]["timestamp"]["$gte"] = start_time.isoformat()
            if end_time:
                match_stage["$match"]["timestamp"]["$lte"] = end_time.isoformat()

        pipeline = [
            match_stage,
            {
                "$facet": {
                    "total": [{"$count": "count"}],
                    "by_event": [{"$group": {"_id": "$event", "count": {"$sum": 1}}}],
                    "by_user": [{"$group": {"_id": "$user_id", "count": {"$sum": 1}}}],
                    "by_severity": [{"$group": {"_id": "$severity", "count": {"$sum": 1}}}],
                    "success_rate": [
                        {"$group": {"_id": None, "success": {"$sum": {"$cond": ["$success", 1, 0]}}, "total": {"$sum": 1}}}
                    ],
                }
            }
        ]

        try:
            result = list(collection.aggregate(pipeline))
            if result:
                r = result[0]
                return {
                    "total_events": r.get("total", [{}])[0].get("count", 0),
                    "unique_users": len(r.get("by_user", [])),
                    "events_by_type": {item["_id"]: item["count"] for item in r.get("by_event", [])},
                    "events_by_severity": {item["_id"]: item["count"] for item in r.get("by_severity", [])},
                    "success_rate": (
                        r.get("success_rate", [{}])[0].get("success", 0) / 
                        max(r.get("success_rate", [{}])[0].get("total", 1), 1)
                    ) * 100,
                }
        except Exception as e:
            print(f"Audit statistics failed: {e}")

        return {}

    def create_index(self):
        """创建索引以提高查询性能"""
        if not self.mongodb:
            return

        collection = self._get_collection()
        if not collection:
            return

        try:
            collection.create_index("timestamp")
            collection.create_index("user_id")
            collection.create_index("event")
            collection.create_index([("user_id", 1), ("timestamp", -1)])
        except Exception as e:
            print(f"Failed to create audit index: {e}")


def audit_log(
    event: str,
    severity: str = "info"
):
    """
    审计日志装饰器
    
    Args:
        event: 事件类型
        severity: 严重程度
        
    Usage:
        @audit_log(AuditEvent.ANALYSIS_SUBMIT)
        async def submit_analysis(request):
            ...
    """
    def decorator(func: Callable):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            user_id = "anonymous"
            client_ip = "unknown"
            
            if kwargs.get("request"):
                from fastapi import Request
                if isinstance(kwargs["request"], Request):
                    client_ip = kwargs["request"].client.host if kwargs["request"].client else "unknown"
            
            success = True
            error_msg = None
            result = None
            
            try:
                result = await func(*args, **kwargs)
                return result
            except Exception as e:
                success = False
                error_msg = str(e)
                raise
            finally:
                audit_logger.log(
                    event=event,
                    user_id=user_id,
                    client_ip=client_ip,
                    details={"args": str(args)[:100], "kwargs": str(kwargs)[:100], "error": error_msg},
                    success=success,
                    severity=severity
                )
        
        @wraps(func)
        def sync_wrapper(*args, **kwargs):
            success = True
            error_msg = None
            try:
                return func(*args, **kwargs)
            except Exception as e:
                success = False
                error_msg = str(e)
                raise
            finally:
                audit_logger.log(
                    event=event,
                    details={"error": error_msg},
                    success=success,
                    severity=severity
                )
        
        import asyncio
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        return sync_wrapper

    return decorator


audit_logger = AuditLogger()
