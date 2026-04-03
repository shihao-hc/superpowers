"""
权限控制系统 - Claude Code 三层权限模式
基于 Claude Code 源码分析实现的安全防护系统
"""

import re
import logging
from enum import Enum
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable
from collections import defaultdict
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class PermissionMode(Enum):
    """权限模式"""

    DEFAULT = "default"
    PLAN = "plan"
    AUTO = "auto"


class ToolCategory(Enum):
    """工具安全分类"""

    READONLY = "readonly"
    SAFE = "safe"
    MODERATE = "moderate"
    DESTRUCTIVE = "destructive"
    DANGEROUS = "dangerous"


@dataclass
class ToolDefinition:
    """工具定义"""

    name: str
    category: ToolCategory
    description: str
    confirmation_message: Optional[str] = None
    always_ask: bool = False
    auto_deny: bool = False


@dataclass
class PermissionRequest:
    """权限请求"""

    tool_name: str
    action: str
    parameters: dict
    timestamp: datetime = field(default_factory=datetime.now)
    context: Optional[dict] = None


@dataclass
class PermissionDecision:
    """权限决策"""

    granted: bool
    reason: str
    mode: PermissionMode
    requires_confirmation: bool = False


class SecurityClassifier:
    """工具安全分类器"""

    DESTRUCTIVE_PATTERNS = [
        r"rm\s+-rf",
        r"del\s+/[fsq]",
        r"format\s+",
        r"mkfs\.",
        r"dd\s+if=",
    ]

    DANGEROUS_PATTERNS = [
        r"sudo",
        r"chmod\s+777",
        r"wget.*\|\s*bash",
        r"curl.*\|\s*sh",
        r">\s*/dev/sd",
    ]

    @classmethod
    def classify(cls, tool_name: str, parameters: dict) -> ToolCategory:
        """分类工具的风险级别"""

        if tool_name in ["Read", "Grep", "Glob", "Ls", "search", "get_time"]:
            return ToolCategory.READONLY

        if tool_name in ["Write", "Edit", "calculate"]:
            return ToolCategory.SAFE

        if tool_name == "Bash":
            command = parameters.get("command", "")
            return cls._classify_command(command)

        if tool_name in ["WebFetch", "WebSearch"]:
            return ToolCategory.SAFE

        return ToolCategory.MODERATE

    @classmethod
    def _classify_command(cls, command: str) -> ToolCategory:
        """分类 Shell 命令"""

        for pattern in cls.DANGEROUS_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return ToolCategory.DANGEROUS

        for pattern in cls.DESTRUCTIVE_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return ToolCategory.DESTRUCTIVE

        if any(cmd in command for cmd in ["cat ", "head ", "tail ", "ls ", "pwd"]):
            return ToolCategory.READONLY

        return ToolCategory.MODERATE


class DenialTracker:
    """拒绝追踪器 - Claude Code 核心创新"""

    def __init__(self, max_denials: int = 3, reset_hours: int = 24):
        self.max_denials = max_denials
        self.reset_hours = reset_hours

        self._denials: dict[tuple[str, str], list[datetime]] = defaultdict(list)
        self._auto_deny_list: set[tuple[str, str]] = set()

    def record_denial(self, tool: str, action: str):
        """记录一次拒绝"""
        key = (tool, action)
        now = datetime.now()

        cutoff = now - timedelta(hours=self.reset_hours)
        self._denials[key] = [ts for ts in self._denials[key] if ts > cutoff]

        self._denials[key].append(now)

        if len(self._denials[key]) >= self.max_denials:
            logger.warning(
                f"Auto-denying {tool}.{action} after {self.max_denials} denials"
            )
            self._auto_deny_list.add(key)

    def should_auto_deny(self, tool: str, action: str) -> bool:
        """检查是否应该自动拒绝"""
        return (tool, action) in self._auto_deny_list

    def get_denial_count(self, tool: str, action: str) -> int:
        """获取拒绝次数"""
        return len(self._denials.get((tool, action), []))

    def reset(self, tool: Optional[str] = None, action: Optional[str] = None):
        """重置拒绝记录"""
        if tool and action:
            key = (tool, action)
            self._denials.pop(key, None)
            self._auto_deny_list.discard(key)
        elif tool:
            keys_to_remove = [k for k in self._denials if k[0] == tool]
            for key in keys_to_remove:
                del self._denials[key]
                self._auto_deny_list.discard(key)
        else:
            self._denials.clear()
            self._auto_deny_list.clear()


class PermissionManager:
    """权限管理器 - Claude Code 风格"""

    def __init__(
        self,
        mode: PermissionMode = PermissionMode.DEFAULT,
        max_denials: int = 3,
        ask_callback: Optional[Callable[[PermissionRequest], Awaitable[bool]]] = None,
    ):
        self.mode = mode
        self.denial_tracker = DenialTracker(max_denials=max_denials)
        self._ask_callback = ask_callback

        self._tools: dict[str, ToolDefinition] = {}
        self.classifier = SecurityClassifier()

        self._audit_log: list[dict] = []
        self._max_audit_entries = 10000

        self._register_default_tools()

    def _register_default_tools(self):
        """注册默认工具"""
        self.register_tool(
            ToolDefinition(
                name="Read",
                category=ToolCategory.READONLY,
                description="Read file contents",
            )
        )
        self.register_tool(
            ToolDefinition(
                name="Write",
                category=ToolCategory.SAFE,
                description="Write file contents",
                always_ask=True,
            )
        )
        self.register_tool(
            ToolDefinition(
                name="Edit",
                category=ToolCategory.SAFE,
                description="Edit file contents",
                always_ask=True,
            )
        )
        self.register_tool(
            ToolDefinition(
                name="Bash",
                category=ToolCategory.MODERATE,
                description="Execute shell commands",
            )
        )
        self.register_tool(
            ToolDefinition(
                name="search",
                category=ToolCategory.SAFE,
                description="Search for information",
            )
        )
        self.register_tool(
            ToolDefinition(
                name="calculate",
                category=ToolCategory.SAFE,
                description="Execute calculations",
            )
        )
        self.register_tool(
            ToolDefinition(
                name="get_time",
                category=ToolCategory.READONLY,
                description="Get current time",
            )
        )

    def register_tool(self, definition: ToolDefinition):
        """注册工具"""
        self._tools[definition.name] = definition

    async def check_permission(
        self,
        tool_name: str,
        action: str = "execute",
        parameters: dict = None,
        context: Optional[dict] = None,
    ) -> PermissionDecision:
        """检查权限"""

        parameters = parameters or {}

        if self.denial_tracker.should_auto_deny(tool_name, action):
            return PermissionDecision(
                granted=False,
                reason=f"Auto-denied after {self.denial_tracker.max_denials} previous rejections",
                mode=self.mode,
            )

        tool_def = self._tools.get(tool_name)

        if tool_def and tool_def.auto_deny:
            return PermissionDecision(
                granted=False, reason=f"Tool {tool_name} is blocked", mode=self.mode
            )

        if tool_def and tool_def.always_ask:
            return await self._ask_user(
                tool_name,
                action,
                parameters,
                context,
                reason="Tool requires explicit approval",
            )

        if self.mode == PermissionMode.PLAN:
            category = self.classifier.classify(tool_name, parameters)
            if category != ToolCategory.READONLY:
                return PermissionDecision(
                    granted=False,
                    reason="Plan mode only allows read-only operations",
                    mode=self.mode,
                )
            return PermissionDecision(
                granted=True,
                reason="Read-only operation allowed in plan mode",
                mode=self.mode,
            )

        elif self.mode == PermissionMode.AUTO:
            category = self.classifier.classify(tool_name, parameters)

            if category in (ToolCategory.READONLY, ToolCategory.SAFE):
                return PermissionDecision(
                    granted=True,
                    reason=f"Auto-approved: {category.value} operation",
                    mode=self.mode,
                )
            else:
                return await self._ask_user(
                    tool_name,
                    action,
                    parameters,
                    context,
                    reason=f"{category.value} operation requires confirmation",
                )

        else:
            category = self.classifier.classify(tool_name, parameters)

            if category == ToolCategory.READONLY:
                return PermissionDecision(
                    granted=True,
                    reason="Read-only operation auto-approved",
                    mode=self.mode,
                )
            else:
                return await self._ask_user(
                    tool_name,
                    action,
                    parameters,
                    context,
                    reason=f"{category.value} operation",
                )

    async def _ask_user(
        self,
        tool_name: str,
        action: str,
        parameters: dict,
        context: Optional[dict],
        reason: str,
    ) -> PermissionDecision:
        """询问用户"""

        request = PermissionRequest(
            tool_name=tool_name, action=action, parameters=parameters, context=context
        )

        if self._ask_callback:
            granted = await self._ask_callback(request)
        else:
            granted = False

        self._record_decision(request, granted, reason)

        if not granted:
            self.denial_tracker.record_denial(tool_name, action)

        return PermissionDecision(
            granted=granted, reason=reason, mode=self.mode, requires_confirmation=True
        )

    def _record_decision(self, request: PermissionRequest, granted: bool, reason: str):
        """记录审计日志"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "tool": request.tool_name,
            "action": request.action,
            "granted": granted,
            "reason": reason,
            "mode": self.mode.value,
            "denial_count": self.denial_tracker.get_denial_count(
                request.tool_name, request.action
            ),
        }

        self._audit_log.append(entry)

        if len(self._audit_log) > self._max_audit_entries:
            self._audit_log = self._audit_log[-self._max_audit_entries // 2 :]

    def set_mode(self, mode: PermissionMode):
        """切换权限模式"""
        if isinstance(mode, str):
            mode = PermissionMode(mode)
        logger.info(f"Permission mode changed: {self.mode.value} → {mode.value}")
        self.mode = mode

    def set_mode_from_string(self, mode_str: str):
        """从字符串设置模式"""
        try:
            self.mode = PermissionMode(mode_str)
            logger.info(f"Permission mode set to: {mode_str}")
        except ValueError:
            logger.warning(
                f"Invalid mode: {mode_str}, keeping current: {self.mode.value}"
            )

    def get_audit_log(
        self, limit: int = 100, tool_filter: Optional[str] = None
    ) -> list[dict]:
        """获取审计日志"""
        logs = self._audit_log

        if tool_filter:
            logs = [l for l in logs if l["tool"] == tool_filter]

        return logs[-limit:]

    def get_stats(self) -> dict:
        """获取统计信息"""
        total = len(self._audit_log)
        granted = sum(1 for l in self._audit_log if l["granted"])
        denied = total - granted

        return {
            "total_requests": total,
            "granted": granted,
            "denied": denied,
            "grant_rate": granted / total if total > 0 else 0,
            "mode": self.mode.value,
            "tracked_denials": len(self.denial_tracker._denials),
            "auto_denied_tools": len(self.denial_tracker._auto_deny_list),
        }
