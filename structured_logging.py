"""
Structured JSON Logging with audit support.
- JSON format for log aggregation
- Audit logging for compliance
- Module-specific logging
"""
from __future__ import annotations

import logging
import json
import sys
from datetime import datetime
from typing import Dict, Any, Optional
from logging.handlers import RotatingFileHandler
import threading
from pathlib import Path
from enum import Enum
from dataclasses import dataclass, field


class EventType(str, Enum):
    """Event types for structured logging."""
    ORDER_SUBMITTED = "order_submitted"
    ORDER_FILLED = "order_filled"
    ORDER_CANCELLED = "order_cancelled"
    RISK_TRIGGERED = "risk_triggered"
    PARAM_CHANGED = "param_changed"
    POSITION_OPENED = "position_opened"
    POSITION_CLOSED = "position_closed"
    DATA_RECEIVED = "data_received"
    MODEL_PREDICTION = "model_prediction"
    SYSTEM_START = "system_start"
    SYSTEM_STOP = "system_stop"


class AuditLogger:
    """
    Audit logger for compliance tracking.
    Records all sensitive operations.
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self, log_dir: str = "./logs/audit", include_caller: bool = True):
        if hasattr(self, '_initialized'):
            return
        
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.include_caller = include_caller
        self._initialized = True
        
        self.logger = logging.getLogger("audit")
        self.logger.setLevel(logging.INFO)
        self.logger.handlers = []
        
        handler = RotatingFileHandler(
            self.log_dir / "audit.json",
            maxBytes=100_000_000,
            backupCount=10
        )
        handler.setFormatter(JsonFormatter())
        self.logger.addHandler(handler)
    
    def log(
        self,
        event_type: EventType,
        action: str,
        details: Dict[str, Any],
        user: str = "system",
        resource: str = ""
    ) -> None:
        """Log an audit event."""
        caller = ""
        if self.include_caller:
            import traceback
            stack = traceback.extract_stack()
            if len(stack) > 2:
                caller = f"{stack[-3].filename}:{stack[-3].lineno}"
        
        record = AuditRecord(
            timestamp=datetime.now().isoformat(),
            event_type=event_type.value,
            action=action,
            user=user,
            resource=resource,
            details=details,
            caller=caller
        )
        
        self.logger.info(record.to_json())
    
    def log_order(self, order_id: str, ticker: str, side: str, quantity: int, status: str) -> None:
        """Log order event."""
        self.log(
            EventType.ORDER_SUBMITTED if status == "submitted" else EventType.ORDER_FILLED,
            f"order_{status}",
            {"order_id": order_id, "ticker": ticker, "side": side, "quantity": quantity},
            resource=order_id
        )
    
    def log_risk_trigger(self, trigger_type: str, details: Dict[str, Any]) -> None:
        """Log risk trigger event."""
        self.log(
            EventType.RISK_TRIGGERED,
            "risk_triggered",
            details,
            resource=trigger_type
        )
    
    def log_param_change(self, param_name: str, old_value: Any, new_value: Any, user: str = "system") -> None:
        """Log parameter change."""
        self.log(
            EventType.PARAM_CHANGED,
            "parameter_changed",
            {"param": param_name, "old_value": old_value, "new_value": new_value},
            user=user
        )


@dataclass
class AuditRecord:
    """Audit record structure."""
    timestamp: str
    event_type: str
    action: str
    user: str
    resource: str
    details: Dict[str, Any]
    caller: str
    
    def to_json(self) -> str:
        return json.dumps({
            "timestamp": self.timestamp,
            "event_type": self.event_type,
            "action": self.action,
            "user": self.user,
            "resource": self.resource,
            "details": self.details,
            "caller": self.caller
        })


class JsonFormatter(logging.Formatter):
    """JSON formatter for structured logging."""
    
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.now().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        
        if hasattr(record, "extra_fields"):
            log_data.update(record.extra_fields)
        
        return json.dumps(log_data)


class StructuredLogger:
    """
    Structured logger with module support.
    """
    
    def __init__(self, module_name: str, log_dir: str = "./logs"):
        self.module_name = module_name
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        
        self.logger = logging.getLogger(module_name)
        self.logger.setLevel(logging.INFO)
        
        if not self.logger.handlers:
            handler = RotatingFileHandler(
                self.log_dir / f"{module_name}.json",
                maxBytes=50_000_000,
                backupCount=5
            )
            handler.setFormatter(JsonFormatter())
            self.logger.addHandler(handler)
            
            console = logging.StreamHandler(sys.stdout)
            console.setFormatter(JsonFormatter())
            self.logger.addHandler(console)
    
    def _log(self, level: int, message: str, **kwargs) -> None:
        """Internal log method."""
        extra = {"extra_fields": kwargs} if kwargs else {}
        self.logger.log(level, message, extra=extra)
    
    def debug(self, message: str, **kwargs) -> None:
        self._log(logging.DEBUG, message, **kwargs)
    
    def info(self, message: str, **kwargs) -> None:
        self._log(logging.INFO, message, **kwargs)
    
    def warning(self, message: str, **kwargs) -> None:
        self._log(logging.WARNING, message, **kwargs)
    
    def error(self, message: str, **kwargs) -> None:
        self._log(logging.ERROR, message, **kwargs)
    
    def critical(self, message: str, **kwargs) -> None:
        self._log(logging.CRITICAL, message, **kwargs)
    
    def log_order(self, order_id: str, ticker: str, side: str, qty: int, price: float, status: str) -> None:
        """Log order event."""
        self.info(
            f"Order {status}",
            event_type=f"order_{status}",
            order_id=order_id,
            ticker=ticker,
            side=side,
            quantity=qty,
            price=price
        )
    
    def log_risk(self, check_type: str, result: str, details: Dict) -> None:
        """Log risk check."""
        self.warning(
            f"Risk check: {check_type}",
            event_type="risk_check",
            check_type=check_type,
            result=result,
            details=details
        )
    
    def log_prediction(self, model_name: str, prediction: float, features: Dict) -> None:
        """Log model prediction."""
        self.debug(
            f"Model prediction: {model_name}",
            event_type="prediction",
            model=model_name,
            prediction=prediction,
            feature_count=len(features)
        )


def get_logger(module_name: str) -> StructuredLogger:
    """Get a structured logger for a module."""
    return StructuredLogger(module_name)


def get_audit_logger() -> AuditLogger:
    """Get the audit logger singleton."""
    return AuditLogger()


def demo_logging():
    """Demo structured logging."""
    logger = get_logger("demo_module")
    
    logger.info("Application started", version="0.1.0")
    logger.log_order("ORD001", "AAPL", "BUY", 100, 150.0, "submitted")
    logger.log_risk("daily_loss", "APPROVED", {"loss": -1000})
    
    audit = get_audit_logger()
    audit.log_order("ORD001", "AAPL", "BUY", 100, "submitted")
    audit.log_param_change("max_position_pct", 0.10, 0.15)
    
    print("Check logs/ directory for output files")


if __name__ == "__main__":
    demo_logging()
