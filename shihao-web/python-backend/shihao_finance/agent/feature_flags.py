"""
特性开关系统 - Claude Code 44+ Flags 架构
基于 Claude Code 源码分析的构建时特性消除
"""

import os
import hashlib
import logging
from typing import Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

logger = logging.getLogger(__name__)


class FlagType(Enum):
    BOOLEAN = "boolean"
    PERCENTAGE = "percentage"
    USER_LIST = "user_list"


@dataclass
class FeatureFlag:
    """特性开关定义"""

    name: str
    description: str
    flag_type: FlagType
    default_value: Any = False

    percentage: int = 100
    user_list: list[str] = field(default_factory=list)
    allowed_environments: list[str] = field(
        default_factory=lambda: ["development", "staging", "production"]
    )

    created_at: datetime = field(default_factory=datetime.now)
    created_by: str = "system"
    tags: list[str] = field(default_factory=list)

    requires: list[str] = field(default_factory=list)
    conflicts: list[str] = field(default_factory=list)

    def __post_init__(self):
        if self.flag_type == FlagType.BOOLEAN:
            self.percentage = 100 if self.default_value else 0


class ClaudeCodeFlags:
    """Claude Code 特性开关定义"""

    KAIROS = FeatureFlag(
        name="KAIROS",
        description="自主代理模式 - 全自主执行",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["core", "autonomous"],
    )

    PROACTIVE = FeatureFlag(
        name="PROACTIVE",
        description="主动协助模式 - 主动提供建议",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["core", "assistant"],
    )

    BRIDGE_MODE = FeatureFlag(
        name="BRIDGE_MODE",
        description="远程会话支持",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["core", "remote"],
    )

    VOICE_MODE = FeatureFlag(
        name="VOICE_MODE",
        description="语音输入/输出",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["core", "voice"],
    )

    BUDDY = FeatureFlag(
        name="BUDDY",
        description="数字宠物系统 - 编程伴侣",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["easter-egg", "ui"],
    )

    CACHED_MICROCOMPACT = FeatureFlag(
        name="CACHED_MICROCOMPACT",
        description="缓存微压缩",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context", "performance"],
    )

    CONTEXT_COLLAPSE = FeatureFlag(
        name="CONTEXT_COLLAPSE",
        description="上下文折叠",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context"],
    )

    REACTIVE_COMPACT = FeatureFlag(
        name="REACTIVE_COMPACT",
        description="反应式压缩",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context", "safety"],
    )

    HISTORY_SNIP = FeatureFlag(
        name="HISTORY_SNIP",
        description="历史裁剪",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context"],
    )

    TOKEN_BUDGET = FeatureFlag(
        name="TOKEN_BUDGET",
        description="Token 预算追踪",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context", "cost"],
    )

    VERIFICATION_AGENT = FeatureFlag(
        name="VERIFICATION_AGENT",
        description="验证代理",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["internal", "quality"],
    )

    STREAMING = FeatureFlag(
        name="STREAMING",
        description="流式输出",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["core", "performance"],
    )

    MCP_INTEGRATION = FeatureFlag(
        name="MCP_INTEGRATION",
        description="MCP 协议集成",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["core", "integration"],
    )

    ANALYTICS = FeatureFlag(
        name="ANALYTICS",
        description="分析遥测",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["core", "monitoring"],
    )


_flag_registry: dict[str, FeatureFlag] = {}


def register_flag(flag: FeatureFlag):
    """注册 Flag"""
    _flag_registry[flag.name] = flag


def get_flag(name: str) -> Optional[FeatureFlag]:
    """获取 Flag"""
    return _flag_registry.get(name)


class FeatureFlagManager:
    """特性开关管理器"""

    def __init__(self, user_id: Optional[str] = None, environment: str = "production"):
        self.user_id = user_id
        self.environment = environment
        self._overrides: dict[str, bool] = {}
        self._cache: dict[str, bool] = {}

        self._init_default_flags()

    def _init_default_flags(self):
        """初始化默认 Flags"""
        for flag in [
            ClaudeCodeFlags.KAIROS,
            ClaudeCodeFlags.PROACTIVE,
            ClaudeCodeFlags.BRIDGE_MODE,
            ClaudeCodeFlags.VOICE_MODE,
            ClaudeCodeFlags.BUDDY,
            ClaudeCodeFlags.CACHED_MICROCOMPACT,
            ClaudeCodeFlags.CONTEXT_COLLAPSE,
            ClaudeCodeFlags.REACTIVE_COMPACT,
            ClaudeCodeFlags.HISTORY_SNIP,
            ClaudeCodeFlags.TOKEN_BUDGET,
            ClaudeCodeFlags.VERIFICATION_AGENT,
            ClaudeCodeFlags.STREAMING,
            ClaudeCodeFlags.MCP_INTEGRATION,
            ClaudeCodeFlags.ANALYTICS,
        ]:
            register_flag(flag)

    def is_enabled(self, flag_name: str) -> bool:
        """检查 Flag 是否启用"""
        if flag_name in self._cache:
            return self._cache[flag_name]

        if flag_name in self._overrides:
            result = self._overrides[flag_name]
            self._cache[flag_name] = result
            return result

        env_var = f"FEATURE_{flag_name.upper()}"
        env_value = os.environ.get(env_var)
        if env_value is not None:
            result = env_value.lower() in ("true", "1", "yes")
            self._cache[flag_name] = result
            return result

        flag = get_flag(flag_name)
        if not flag:
            logger.warning(f"Unknown flag: {flag_name}")
            return False

        if self.environment not in flag.allowed_environments:
            self._cache[flag_name] = False
            return False

        if flag.flag_type == FlagType.PERCENTAGE:
            result = self._check_percentage(flag)
            self._cache[flag_name] = result
            return result

        if flag.flag_type == FlagType.USER_LIST:
            result = self.user_id in flag.user_list if self.user_id else False
            self._cache[flag_name] = result
            return result

        for req in flag.requires:
            if not self.is_enabled(req):
                self._cache[flag_name] = False
                return False

        for conflict in flag.conflicts:
            if self.is_enabled(conflict):
                self._cache[flag_name] = False
                return False

        result = flag.default_value
        self._cache[flag_name] = result
        return result

    def _check_percentage(self, flag: FeatureFlag) -> bool:
        """检查百分比发布"""
        if not self.user_id:
            return flag.default_value

        hash_value = int(hashlib.md5(self.user_id.encode()).hexdigest()[:8], 16)
        bucket = hash_value % 100
        return bucket < flag.percentage

    def set_override(self, flag_name: str, value: bool):
        """设置运行时覆盖"""
        self._overrides[flag_name] = value
        self._cache.pop(flag_name, None)

    def clear_override(self, flag_name: str):
        """清除运行时覆盖"""
        self._overrides.pop(flag_name, None)
        self._cache.pop(flag_name, None)

    def get_all_flags(self) -> dict[str, bool]:
        """获取所有 Flag 状态"""
        return {name: self.is_enabled(name) for name in _flag_registry.keys()}

    def get_flags_by_tag(self, tag: str) -> dict[str, bool]:
        """获取指定标签的 Flags"""
        return {
            name: self.is_enabled(name)
            for name, flag in _flag_registry.items()
            if tag in flag.tags
        }


class FeatureCheck:
    """特性检查工具"""

    def __init__(self, flag_manager: FeatureFlagManager):
        self.manager = flag_manager

    def if_enabled(self, flag_name: str, func, *args, **kwargs):
        """如果 Flag 启用则执行"""
        if self.manager.is_enabled(flag_name):
            return func(*args, **kwargs)
        return None

    def require(self, flag_name: str, message: Optional[str] = None):
        """要求 Flag 启用"""
        if not self.manager.is_enabled(flag_name):
            msg = message or f"Feature {flag_name} is not enabled"
            raise FeatureDisabledError(msg)


class FeatureDisabledError(Exception):
    """特性未启用异常"""

    pass


def create_feature_manager(
    user_id: str = None, environment: str = "production"
) -> FeatureFlagManager:
    """创建特性开关管理器"""
    return FeatureFlagManager(user_id=user_id, environment=environment)
