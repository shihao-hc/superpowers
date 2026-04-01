---
name: error-recovery
description: AI Agent 错误恢复系统 - 413处理、模型降级、重试策略、优雅降级
category: ai-agent-reliability
source: Claude Code error recovery analysis
version: 1.0
tags:
  - error-handling
  - recovery
  - retry
  - fallback
  - resilience
---

# 错误恢复系统 - 韧性设计

> Claude Code 的多层错误恢复：413 错误、Token 限制、模型失败

## 错误类型与恢复策略

```
┌─────────────────────────────────────────────────────────────┐
│                   Error Recovery System                     │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Error Detection                        │   │
│  │  413 | 429 | Timeout | Rate Limit | Model Error    │   │
│  └───────────────────────┬─────────────────────────────┘   │
│                          │                                  │
│                          ▼                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Error Classification                   │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │   │
│  │  │ Context │ │  Rate   │ │  Model  │ │Network │  │   │
│  │  │  Limit  │ │  Limit  │ │  Error  │ │ Error  │  │   │
│  │  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘  │   │
│  └───────┼───────────┼───────────┼───────────┼────────┘   │
│          │           │           │           │             │
│          ▼           ▼           ▼           ▼             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│  │ Compact  │ │  Wait &  │ │  Model   │ │  Retry   │      │
│  │ Context  │ │  Retry   │ │Fallback  │ │  Later   │      │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心实现

```python
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable, Any
from functools import wraps
import asyncio
import time
import logging

logger = logging.getLogger(__name__)


class ErrorType(Enum):
    """错误类型"""
    CONTEXT_LIMIT = "context_limit"      # 413 Token 限制
    RATE_LIMIT = "rate_limit"            # 429 速率限制
    MODEL_ERROR = "model_error"          # 模型错误
    TIMEOUT = "timeout"                  # 超时
    NETWORK_ERROR = "network_error"      # 网络错误
    AUTH_ERROR = "auth_error"            # 认证错误
    UNKNOWN = "unknown"                  # 未知错误


class RecoveryAction(Enum):
    """恢复动作"""
    COMPACT_CONTEXT = "compact_context"      # 压缩上下文
    RETRY_WITH_DELAY = "retry_with_delay"    # 延迟重试
    FALLBACK_MODEL = "fallback_model"        # 降级模型
    REDUCE_PAYLOAD = "reduce_payload"        # 减少载荷
    SKIP_AND_CONTINUE = "skip_and_continue"  # 跳过继续
    FAIL = "fail"                            # 失败


@dataclass
class ErrorInfo:
    """错误信息"""
    error_type: ErrorType
    message: str
    status_code: Optional[int] = None
    retry_after: Optional[int] = None  # 秒
    details: Optional[dict] = None
    
    @classmethod
    def from_exception(cls, exc: Exception) -> "ErrorInfo":
        """从异常创建"""
        error_str = str(exc).lower()
        
        # HTTP 状态码
        if "413" in error_str or "content too large" in error_str:
            return cls(ErrorType.CONTEXT_LIMIT, str(exc), status_code=413)
        
        if "429" in error_str or "rate limit" in error_str:
            return cls(ErrorType.RATE_LIMIT, str(exc), status_code=429)
        
        if "timeout" in error_str:
            return cls(ErrorType.TIMEOUT, str(exc))
        
        if "network" in error_str or "connection" in error_str:
            return cls(ErrorType.NETWORK_ERROR, str(exc))
        
        if "auth" in error_str or "401" in error_str or "403" in error_str:
            return cls(ErrorType.AUTH_ERROR, str(exc))
        
        return cls(ErrorType.UNKNOWN, str(exc))


@dataclass
class RecoveryResult:
    """恢复结果"""
    success: bool
    action: RecoveryAction
    message: str
    data: Optional[dict] = None


class RecoveryStrategy:
    """恢复策略定义"""
    
    def __init__(
        self,
        error_type: ErrorType,
        action: RecoveryAction,
        max_retries: int = 3,
        backoff_factor: float = 2.0,
        condition: Optional[Callable] = None
    ):
        self.error_type = error_type
        self.action = action
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.condition = condition
    
    def matches(self, error: ErrorInfo) -> bool:
        """检查是否匹配"""
        if error.error_type != self.error_type:
            return False
        if self.condition and not self.condition(error):
            return False
        return True


class ErrorRecoverySystem:
    """
    错误恢复系统
    
    Claude Code 恢复策略:
    1. 413 → 压缩上下文后重试
    2. 429 → 指数退避后重试
    3. 模型错误 → 降级到更稳定模型
    4. 超时 → 减少 payload 重试
    5. 网络错误 → 延迟重试
    """
    
    def __init__(
        self,
        context_compactor=None,
        model_fallback=None,
        max_total_retries: int = 5
    ):
        self.context_compactor = context_compactor
        self.model_fallback = model_fallback
        self.max_total_retries = max_total_retries
        
        # 默认恢复策略
        self.strategies: list[RecoveryStrategy] = [
            RecoveryStrategy(
                ErrorType.CONTEXT_LIMIT,
                RecoveryAction.COMPACT_CONTEXT,
                max_retries=2
            ),
            RecoveryStrategy(
                ErrorType.RATE_LIMIT,
                RecoveryAction.RETRY_WITH_DELAY,
                max_retries=3,
                backoff_factor=2.0
            ),
            RecoveryStrategy(
                ErrorType.MODEL_ERROR,
                RecoveryAction.FALLBACK_MODEL,
                max_retries=2
            ),
            RecoveryStrategy(
                ErrorType.TIMEOUT,
                RecoveryAction.REDUCE_PAYLOAD,
                max_retries=2
            ),
            RecoveryStrategy(
                ErrorType.NETWORK_ERROR,
                RecoveryAction.RETRY_WITH_DELAY,
                max_retries=3,
                backoff_factor=1.5
            ),
        ]
        
        # 统计
        self._recovery_count: dict[ErrorType, int] = {}
        self._recovery_success: dict[ErrorType, int] = {}
    
    async def handle_error(
        self,
        error: Exception,
        context: dict,
        operation: Callable[[], Awaitable[Any]]
    ) -> Any:
        """
        处理错误并尝试恢复
        
        Args:
            error: 捕获的异常
            context: 当前上下文
            operation: 需要重试的操作（无参数函数）
        
        Returns:
            操作结果
        
        Raises:
            RecoveryFailedError: 所有恢复尝试都失败
        """
        error_info = ErrorInfo.from_exception(error)
        logger.error(f"Error occurred: {error_info.error_type.value} - {error_info.message}")
        
        # 查找恢复策略
        strategy = self._find_strategy(error_info)
        if not strategy:
            raise RecoveryFailedError(f"No recovery strategy for {error_info.error_type}")
        
        # 执行恢复
        return await self._execute_recovery(
            strategy, error_info, context, operation
        )
    
    def _find_strategy(self, error: ErrorInfo) -> Optional[RecoveryStrategy]:
        """查找匹配的恢复策略"""
        for strategy in self.strategies:
            if strategy.matches(error):
                return strategy
        return None
    
    async def _execute_recovery(
        self,
        strategy: RecoveryStrategy,
        error: ErrorInfo,
        context: dict,
        operation: Callable
    ) -> Any:
        """执行恢复"""
        
        for attempt in range(strategy.max_retries + 1):
            try:
                # 执行恢复动作
                if attempt > 0:
                    recovery_result = await self._perform_recovery_action(
                        strategy.action, error, context, attempt
                    )
                    
                    if not recovery_result.success:
                        logger.warning(f"Recovery action failed: {recovery_result.message}")
                        continue
                
                # 重试操作
                result = await operation()
                
                # 记录成功
                self._record_recovery(error.error_type, True)
                logger.info(f"Recovery successful after {attempt + 1} attempts")
                
                return result
                
            except Exception as e:
                logger.warning(f"Retry {attempt + 1} failed: {e}")
                
                if attempt < strategy.max_retries:
                    # 计算退避时间
                    delay = strategy.backoff_factor ** attempt
                    await asyncio.sleep(delay)
                else:
                    self._record_recovery(error.error_type, False)
                    raise RecoveryFailedError(
                        f"All {strategy.max_retries + 1} attempts failed for {error.error_type.value}"
                    )
    
    async def _perform_recovery_action(
        self,
        action: RecoveryAction,
        error: ErrorInfo,
        context: dict,
        attempt: int
    ) -> RecoveryResult:
        """执行恢复动作"""
        
        if action == RecoveryAction.COMPACT_CONTEXT:
            return await self._compact_context(context)
        
        elif action == RecoveryAction.RETRY_WITH_DELAY:
            delay = error.retry_after or (2 ** attempt)
            logger.info(f"Waiting {delay}s before retry")
            await asyncio.sleep(delay)
            return RecoveryResult(True, action, f"Waited {delay}s")
        
        elif action == RecoveryAction.FALLBACK_MODEL:
            return await self._fallback_model(context)
        
        elif action == RecoveryAction.REDUCE_PAYLOAD:
            return self._reduce_payload(context)
        
        elif action == RecoveryAction.SKIP_AND_CONTINUE:
            return RecoveryResult(True, action, "Skipped")
        
        else:
            return RecoveryResult(False, action, "Unknown action")
    
    async def _compact_context(self, context: dict) -> RecoveryResult:
        """压缩上下文"""
        if not self.context_compactor:
            return RecoveryResult(False, RecoveryAction.COMPACT_CONTEXT, "No compactor available")
        
        try:
            messages = context.get("messages", [])
            result = await self.context_compactor.compact_if_needed()
            
            if result:
                return RecoveryResult(
                    True,
                    RecoveryAction.COMPACT_CONTEXT,
                    f"Compacted: {result.original_tokens} → {result.compacted_tokens} tokens",
                    data={"result": result}
                )
            else:
                return RecoveryResult(
                    False,
                    RecoveryAction.COMPACT_CONTEXT,
                    "Nothing to compact"
                )
        except Exception as e:
            return RecoveryResult(False, RecoveryAction.COMPACT_CONTEXT, str(e))
    
    async def _fallback_model(self, context: dict) -> RecoveryResult:
        """降级模型"""
        if not self.model_fallback:
            return RecoveryResult(False, RecoveryAction.FALLBACK_MODEL, "No fallback available")
        
        try:
            current_model = context.get("current_model", "sonnet")
            fallback = self.model_fallback.get_fallback(current_model)
            
            if fallback:
                context["current_model"] = fallback
                return RecoveryResult(
                    True,
                    RecoveryAction.FALLBACK_MODEL,
                    f"Fallback from {current_model} to {fallback}"
                )
            else:
                return RecoveryResult(
                    False,
                    RecoveryAction.FALLBACK_MODEL,
                    "No fallback model available"
                )
        except Exception as e:
            return RecoveryResult(False, RecoveryAction.FALLBACK_MODEL, str(e))
    
    def _reduce_payload(self, context: dict) -> RecoveryResult:
        """减少载荷"""
        messages = context.get("messages", [])
        
        if len(messages) > 10:
            # 保留最近的消息
            keep = 10
            removed = len(messages) - keep
            context["messages"] = messages[-keep:]
            
            return RecoveryResult(
                True,
                RecoveryAction.REDUCE_PAYLOAD,
                f"Removed {removed} old messages"
            )
        
        return RecoveryResult(
            False,
            RecoveryAction.REDUCE_PAYLOAD,
            "Cannot reduce further"
        )
    
    def _record_recovery(self, error_type: ErrorType, success: bool):
        """记录恢复统计"""
        self._recovery_count[error_type] = self._recovery_count.get(error_type, 0) + 1
        if success:
            self._recovery_success[error_type] = self._recovery_success.get(error_type, 0) + 1
    
    def get_stats(self) -> dict:
        """获取恢复统计"""
        return {
            "total_attempts": sum(self._recovery_count.values()),
            "by_error_type": {
                error_type.value: {
                    "attempts": self._recovery_count.get(error_type, 0),
                    "success": self._recovery_success.get(error_type, 0),
                    "rate": self._recovery_success.get(error_type, 0) / max(self._recovery_count.get(error_type, 1), 1)
                }
                for error_type in ErrorType
            }
        }
```

---

## 重试装饰器

```python
def with_recovery(
    recovery_system: ErrorRecoverySystem,
    context: dict
):
    """
    重试装饰器
    
    用法:
    @with_recovery(recovery_system, context)
    async def my_operation():
        # 可能失败的操作
        pass
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            async def operation():
                return await func(*args, **kwargs)
            
            try:
                return await operation()
            except Exception as e:
                return await recovery_system.handle_error(e, context, operation)
        
        return wrapper
    return decorator


# 使用示例
@with_recovery(recovery_system, {"messages": messages})
async def call_llm(messages):
    return await llm.complete(messages)
```

---

## 413 错误专门处理

```python
class ContextLimitHandler:
    """
    413 Context Limit 专门处理器
    
    Claude Code 的核心恢复机制:
    1. 检测 413 错误
    2. 5层压缩策略
    3. 重试（最多2次）
    4. 最终降级为只读模式
    """
    
    def __init__(self, context_manager):
        self.context_manager = context_manager
        self.max_recovery_attempts = 2
    
    async def handle_413(
        self,
        messages: list[dict],
        llm_call: Callable
    ) -> list[dict]:
        """
        处理 413 错误
        
        Returns:
            压缩后的消息列表
        """
        for attempt in range(self.max_recovery_attempts + 1):
            try:
                # 尝试调用
                return await llm_call(messages)
                
            except Exception as e:
                if "413" not in str(e) and "content too large" not in str(e):
                    raise
                
                if attempt >= self.max_recovery_attempts:
                    logger.error("Max recovery attempts reached for 413 error")
                    raise
                
                # 尝试压缩
                logger.info(f"413 recovery attempt {attempt + 1}: compacting context")
                
                # 根据尝试次数使用不同策略
                if attempt == 0:
                    # L1-L3: 轻度压缩
                    compacted = await self.context_manager._microcompact(messages)
                else:
                    # L4-L5: 激进压缩
                    compacted = await self.context_manager._auto_compact(messages)
                
                if len(compacted) >= len(messages) * 0.9:
                    # 压缩效果不佳，尝试更激进
                    compacted = await self.context_manager._reactive_compact(messages)
                
                messages = compacted
        
        return messages
```

---

## 模型降级策略

```python
class ModelFallbackChain:
    """
    模型降级链
    
    Claude Code 模型降级:
    Sonnet → Haiku (失败时)
    """
    
    def __init__(self):
        self._chain: dict[str, list[str]] = {
            "opus": ["sonnet", "haiku"],
            "sonnet": ["haiku"],
            "haiku": [],  # 最低层级
        }
    
    def get_fallback(self, current_model: str) -> Optional[str]:
        """获取下一个降级模型"""
        chain = self._chain.get(current_model, [])
        return chain[0] if chain else None
    
    async def try_with_fallback(
        self,
        model_name: str,
        llm_call: Callable,
        context: dict
    ) -> str:
        """
        尝试调用，失败时自动降级
        """
        models_to_try = [model_name] + self._chain.get(model_name, [])
        
        last_error = None
        for model in models_to_try:
            try:
                logger.info(f"Trying model: {model}")
                context["current_model"] = model
                return await llm_call(model)
            except Exception as e:
                logger.warning(f"Model {model} failed: {e}")
                last_error = e
                continue
        
        raise Exception(f"All models failed. Last error: {last_error}")
```

---

## 使用示例

```python
# 创建恢复系统
recovery = ErrorRecoverySystem(
    context_compactor=context_manager,
    model_fallback=ModelFallbackChain()
)

# 方式1: 手动处理
try:
    result = await llm.complete(messages)
except Exception as e:
    result = await recovery.handle_error(
        e,
        {"messages": messages},
        lambda: llm.complete(messages)
    )

# 方式2: 装饰器
@with_recovery(recovery, {"messages": messages})
async def chat(messages):
    return await llm.complete(messages)

result = await chat(messages)

# 查看统计
stats = recovery.get_stats()
print(f"Recovery rate: {stats['by_error_type']['context_limit']['rate']:.1%}")
```

---

## 关键要点

| 要点 | 说明 |
|------|------|
| **错误分类** | 8 种错误类型 |
| **恢复策略** | 6 种恢复动作 |
| **413 处理** | 5层压缩 + 重试 |
| **模型降级** | Sonnet → Haiku |
| **指数退避** | 可配置的退避因子 |
| **统计追踪** | 恢复成功率统计 |

## 相关技能

- `context-management` - 上下文压缩
- `model-routing` - 模型路由
- `resilient-websocket` - WebSocket 韧性
- `agent-loop-patterns` - Agent 循环
