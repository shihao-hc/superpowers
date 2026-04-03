"""
错误恢复系统 - Claude Code 韧性设计
基于 Claude Code 源码分析的 413 处理、模型降级、重试策略
"""

import asyncio
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable, Any
from functools import wraps

logger = logging.getLogger(__name__)


class ErrorType(Enum):
    """错误类型"""

    CONTEXT_LIMIT = "context_limit"
    RATE_LIMIT = "rate_limit"
    MODEL_ERROR = "model_error"
    TIMEOUT = "timeout"
    NETWORK_ERROR = "network_error"
    AUTH_ERROR = "auth_error"
    UNKNOWN = "unknown"


class RecoveryAction(Enum):
    """恢复动作"""

    COMPACT_CONTEXT = "compact_context"
    RETRY_WITH_DELAY = "retry_with_delay"
    FALLBACK_MODEL = "fallback_model"
    REDUCE_PAYLOAD = "reduce_payload"
    SKIP_AND_CONTINUE = "skip_and_continue"
    FAIL = "fail"


@dataclass
class ErrorInfo:
    """错误信息"""

    error_type: ErrorType
    message: str
    status_code: Optional[int] = None
    retry_after: Optional[int] = None
    details: Optional[dict] = None

    @classmethod
    def from_exception(cls, exc: Exception) -> "ErrorInfo":
        """从异常创建"""
        error_str = str(exc).lower()

        if (
            "413" in error_str
            or "content too large" in error_str
            or "payload too large" in error_str
        ):
            return cls(ErrorType.CONTEXT_LIMIT, str(exc), status_code=413)

        if "429" in error_str or "rate limit" in error_str:
            return cls(ErrorType.RATE_LIMIT, str(exc), status_code=429)

        if "timeout" in error_str:
            return cls(ErrorType.TIMEOUT, str(exc))

        if (
            "network" in error_str
            or "connection" in error_str
            or "ECONNREFUSED" in error_str
        ):
            return cls(ErrorType.NETWORK_ERROR, str(exc))

        if "auth" in error_str or "401" in error_str or "403" in error_str:
            return cls(ErrorType.AUTH_ERROR, str(exc))

        if "model" in error_str or "api" in error_str:
            return cls(ErrorType.MODEL_ERROR, str(exc))

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
        condition: Optional[Callable] = None,
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


class ModelFallbackChain:
    """模型降级链"""

    def __init__(self):
        self._chain = {
            "opus": ["sonnet", "haiku", "llama3"],
            "sonnet": ["haiku", "llama3"],
            "haiku": ["llama3"],
            "claude": ["llama3", "qwen"],
            "llama3": ["qwen"],
            "qwen": [],
        }

    def get_fallback(self, current_model: str) -> Optional[str]:
        """获取下一个降级模型"""
        chain = self._chain.get(current_model, [])
        return chain[0] if chain else None

    def get_all_fallbacks(self, current_model: str) -> list[str]:
        """获取所有降级选项"""
        return self._chain.get(current_model, [])


class ErrorRecoverySystem:
    """错误恢复系统"""

    def __init__(
        self,
        context_compactor=None,
        model_fallback: Optional[ModelFallbackChain] = None,
        max_total_retries: int = 5,
    ):
        self.context_compactor = context_compactor
        self.model_fallback = model_fallback or ModelFallbackChain()
        self.max_total_retries = max_total_retries

        self.strategies = [
            RecoveryStrategy(
                ErrorType.CONTEXT_LIMIT, RecoveryAction.COMPACT_CONTEXT, max_retries=2
            ),
            RecoveryStrategy(
                ErrorType.RATE_LIMIT,
                RecoveryAction.RETRY_WITH_DELAY,
                max_retries=3,
                backoff_factor=2.0,
            ),
            RecoveryStrategy(
                ErrorType.MODEL_ERROR, RecoveryAction.FALLBACK_MODEL, max_retries=2
            ),
            RecoveryStrategy(
                ErrorType.TIMEOUT, RecoveryAction.REDUCE_PAYLOAD, max_retries=2
            ),
            RecoveryStrategy(
                ErrorType.NETWORK_ERROR,
                RecoveryAction.RETRY_WITH_DELAY,
                max_retries=3,
                backoff_factor=1.5,
            ),
        ]

        self._recovery_count: dict[ErrorType, int] = {}
        self._recovery_success: dict[ErrorType, int] = {}

    async def handle_error(
        self, error: Exception, context: dict, operation: Callable[[], Awaitable[Any]]
    ) -> Any:
        """处理错误并尝试恢复"""
        error_info = ErrorInfo.from_exception(error)
        logger.error(
            f"Error occurred: {error_info.error_type.value} - {error_info.message}"
        )

        strategy = self._find_strategy(error_info)
        if not strategy:
            raise RecoveryFailedError(
                f"No recovery strategy for {error_info.error_type}"
            )

        return await self._execute_recovery(strategy, error_info, context, operation)

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
        operation: Callable,
    ) -> Any:
        """执行恢复"""

        for attempt in range(strategy.max_retries + 1):
            try:
                if attempt > 0:
                    recovery_result = await self._perform_recovery_action(
                        strategy.action, error, context, attempt
                    )

                    if not recovery_result.success:
                        logger.warning(
                            f"Recovery action failed: {recovery_result.message}"
                        )
                        continue

                result = await operation()

                self._record_recovery(error.error_type, True)
                logger.info(f"Recovery successful after {attempt + 1} attempts")

                return result

            except Exception as e:
                logger.warning(f"Retry {attempt + 1} failed: {e}")

                if attempt < strategy.max_retries:
                    delay = strategy.backoff_factor**attempt
                    await asyncio.sleep(delay)
                else:
                    self._record_recovery(error.error_type, False)
                    raise RecoveryFailedError(
                        f"All {strategy.max_retries + 1} attempts failed for {error.error_type.value}"
                    )

    async def _perform_recovery_action(
        self, action: RecoveryAction, error: ErrorInfo, context: dict, attempt: int
    ) -> RecoveryResult:
        """执行恢复动作"""

        if action == RecoveryAction.COMPACT_CONTEXT:
            return await self._compact_context(context)

        elif action == RecoveryAction.RETRY_WITH_DELAY:
            delay = error.retry_after or (2**attempt)
            logger.info(f"Waiting {delay}s before retry")
            await asyncio.sleep(delay)
            return RecoveryResult(True, action, f"Waited {delay}s")

        elif action == RecoveryAction.FALLBACK_MODEL:
            return await self._fallback_model(context)

        elif action == RecoveryAction.REDUCE_PAYLOAD:
            return self._reduce_payload(context)

        else:
            return RecoveryResult(False, action, "Unknown action")

    async def _compact_context(self, context: dict) -> RecoveryResult:
        """压缩上下文"""
        if not self.context_compactor:
            return RecoveryResult(
                False, RecoveryAction.COMPACT_CONTEXT, "No compactor available"
            )

        try:
            messages = context.get("messages", [])
            result = await self.context_compactor.compact(messages)

            if result:
                context["messages"] = result.messages
                return RecoveryResult(
                    True,
                    RecoveryAction.COMPACT_CONTEXT,
                    f"Compacted: {result.original_tokens} → {result.compacted_tokens} tokens",
                    data={"result": result},
                )
            else:
                return RecoveryResult(
                    False, RecoveryAction.COMPACT_CONTEXT, "Nothing to compact"
                )
        except Exception as e:
            return RecoveryResult(False, RecoveryAction.COMPACT_CONTEXT, str(e))

    async def _fallback_model(self, context: dict) -> RecoveryResult:
        """降级模型"""
        try:
            current_model = context.get("current_model", "sonnet")
            fallback = self.model_fallback.get_fallback(current_model)

            if fallback:
                context["current_model"] = fallback
                return RecoveryResult(
                    True,
                    RecoveryAction.FALLBACK_MODEL,
                    f"Fallback from {current_model} to {fallback}",
                )
            else:
                return RecoveryResult(
                    False, RecoveryAction.FALLBACK_MODEL, "No fallback model available"
                )
        except Exception as e:
            return RecoveryResult(False, RecoveryAction.FALLBACK_MODEL, str(e))

    def _reduce_payload(self, context: dict) -> RecoveryResult:
        """减少载荷"""
        messages = context.get("messages", [])

        if len(messages) > 5:
            keep = 5
            removed = len(messages) - keep
            context["messages"] = messages[-keep:]

            return RecoveryResult(
                True, RecoveryAction.REDUCE_PAYLOAD, f"Removed {removed} old messages"
            )

        return RecoveryResult(
            False, RecoveryAction.REDUCE_PAYLOAD, "Cannot reduce further"
        )

    def _record_recovery(self, error_type: ErrorType, success: bool):
        """记录恢复统计"""
        self._recovery_count[error_type] = self._recovery_count.get(error_type, 0) + 1
        if success:
            self._recovery_success[error_type] = (
                self._recovery_success.get(error_type, 0) + 1
            )

    def get_stats(self) -> dict:
        """获取恢复统计"""
        return {
            "total_attempts": sum(self._recovery_count.values()),
            "by_error_type": {
                error_type.value: {
                    "attempts": self._recovery_count.get(error_type, 0),
                    "success": self._recovery_success.get(error_type, 0),
                    "rate": self._recovery_success.get(error_type, 0)
                    / max(self._recovery_count.get(error_type, 1), 1),
                }
                for error_type in ErrorType
            },
        }


class RecoveryFailedError(Exception):
    """恢复失败错误"""

    pass


def with_recovery(recovery_system: ErrorRecoverySystem, context: dict):
    """重试装饰器"""

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


class ContextLimitHandler:
    """413 Context Limit 专门处理器"""

    def __init__(self, context_manager):
        self.context_manager = context_manager
        self.max_recovery_attempts = 2

    async def handle_413(self, messages: list[dict], llm_call: Callable) -> Any:
        """处理 413 错误"""
        for attempt in range(self.max_recovery_attempts + 1):
            try:
                return await llm_call(messages)

            except Exception as e:
                if (
                    "413" not in str(e)
                    and "content too large" not in str(e)
                    and "payload too large" not in str(e)
                ):
                    raise

                if attempt >= self.max_recovery_attempts:
                    logger.error("Max recovery attempts reached for 413 error")
                    raise

                logger.info(f"413 recovery attempt {attempt + 1}: compacting context")

                if attempt == 0:
                    result = await self.context_manager.compact(messages)
                else:
                    result = await self.context_manager.compact(messages)

                if result:
                    messages = result.messages


def create_error_recovery(context_compactor=None) -> ErrorRecoverySystem:
    """创建错误恢复系统"""
    return ErrorRecoverySystem(
        context_compactor=context_compactor, model_fallback=ModelFallbackChain()
    )
