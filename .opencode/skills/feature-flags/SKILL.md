---
name: feature-flags
description: AI Agent 特性开关系统 - 构建时消除、A/B测试、渐进发布
category: ai-agent-infrastructure
source: Claude Code 44+ feature flags analysis
version: 1.0
tags:
  - feature-flags
  - feature-toggles
  - conditional-compilation
  - a-b-testing
  - rollout
---

# 特性开关系统 - 44+ Flags 架构

> Claude Code 的构建时特性消除：不是禁用，而是完全移除代码

## 设计理念

```
┌─────────────────────────────────────────────────────────────┐
│                 Feature Flag System                         │
│                                                             │
│  Build Time                          Runtime               │
│  ┌─────────────────┐                 ┌─────────────────┐   │
│  │ Feature Flags   │                 │ Environment     │   │
│  │                 │                 │ Variables       │   │
│  │ KAIROS = true   │                 │                 │   │
│  │ BUDDY = false   │                 │ KAIROS=true     │   │
│  │ VOICE = true    │                 │ BUDDY=false     │   │
│  └────────┬────────┘                 └────────┬────────┘   │
│           │                                   │            │
│           ▼                                   ▼            │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Build-Time Elimination                 │   │
│  │  if (KAIROS) { include autonomous_code }           │   │
│  │  if (BUDDY) { include digital_pet }  ← REMOVED     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Result: BUDDY code 不在 bundle 中，0 开销                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心实现

### 1. Feature Flag 定义

```python
from enum import Enum
from typing import Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
import os
import logging

logger = logging.getLogger(__name__)


class FlagType(Enum):
    """Flag 类型"""
    BOOLEAN = "boolean"      # 开/关
    PERCENTAGE = "percentage"  # 百分比发布
    USER_LIST = "user_list"   # 用户白名单
    DATE_BASED = "date_based"  # 基于日期
    ENVIRONMENT = "environment"  # 基于环境


class FlagStatus(Enum):
    """Flag 状态"""
    ENABLED = "enabled"
    DISABLED = "disabled"
    PARTIAL = "partial"  # 部分启用


@dataclass
class FeatureFlag:
    """特性开关定义"""
    name: str
    description: str
    flag_type: FlagType
    default_value: Any = False
    
    # 发布控制
    percentage: int = 100  # 百分比发布 (0-100)
    user_list: list[str] = field(default_factory=list)
    allowed_environments: list[str] = field(default_factory=lambda: ["development", "staging", "production"])
    
    # 元数据
    created_at: datetime = field(default_factory=datetime.now)
    created_by: str = "system"
    tags: list[str] = field(default_factory=list)
    
    # 依赖
    requires: list[str] = field(default_factory=list)  # 必须同时启用的 flags
    conflicts: list[str] = field(default_factory=list)  # 不能同时启用的 flags
    
    def __post_init__(self):
        if self.flag_type == FlagType.BOOLEAN:
            self.percentage = 100 if self.default_value else 0


class ClaudeCodeFlags:
    """
    Claude Code 特性开关定义 (44+ flags)
    
    来源: cli.js.map 源码分析
    """
    
    # Core Flags
    KAIROS = FeatureFlag(
        name="KAIROS",
        description="自主代理模式 - 全自主执行",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["core", "autonomous"]
    )
    
    PROACTIVE = FeatureFlag(
        name="PROACTIVE",
        description="主动协助模式 - 主动提供建议",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["core", "assistant"]
    )
    
    BRIDGE_MODE = FeatureFlag(
        name="BRIDGE_MODE",
        description="远程会话支持",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["core", "remote"]
    )
    
    VOICE_MODE = FeatureFlag(
        name="VOICE_MODE",
        description="语音输入/输出",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["core", "voice"]
    )
    
    # Easter Egg
    BUDDY = FeatureFlag(
        name="BUDDY",
        description="数字宠物系统 - 编程伴侣",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["easter-egg", "ui"]
    )
    
    # Context Flags
    CACHED_MICROCOMPACT = FeatureFlag(
        name="CACHED_MICROCOMPACT",
        description="缓存微压缩",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context", "performance"]
    )
    
    CONTEXT_COLLAPSE = FeatureFlag(
        name="CONTEXT_COLLAPSE",
        description="上下文折叠",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context"]
    )
    
    REACTIVE_COMPACT = FeatureFlag(
        name="REACTIVE_COMPACT",
        description="反应式压缩",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context", "safety"]
    )
    
    HISTORY_SNIP = FeatureFlag(
        name="HISTORY_SNIP",
        description="历史裁剪",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context"]
    )
    
    TOKEN_BUDGET = FeatureFlag(
        name="TOKEN_BUDGET",
        description="Token 预算追踪",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["context", "cost"]
    )
    
    # Internal
    VERIFICATION_AGENT = FeatureFlag(
        name="VERIFICATION_AGENT",
        description="Tengu 验证代理",
        flag_type=FlagType.BOOLEAN,
        default_value=True,
        tags=["internal", "quality"]
    )
    
    FORK_SUBAGENT = FeatureFlag(
        name="FORK_SUBAGENT",
        description="基于 Fork 的子代理",
        flag_type=FlagType.BOOLEAN,
        default_value=False,
        tags=["experimental", "subagent"]
    )


# 全局 flag 注册表
_flag_registry: dict[str, FeatureFlag] = {}


def register_flag(flag: FeatureFlag):
    """注册 Flag"""
    _flag_registry[flag.name] = flag


def get_flag(name: str) -> Optional[FeatureFlag]:
    """获取 Flag"""
    return _flag_registry.get(name)
```

### 2. Feature Flag 管理器

```python
class FeatureFlagManager:
    """
    特性开关管理器
    
    支持:
    1. 运行时检查
    2. 环境变量覆盖
    3. 百分比发布
    4. 用户白名单
    5. 依赖检查
    """
    
    def __init__(
        self,
        user_id: Optional[str] = None,
        environment: str = "production"
    ):
        self.user_id = user_id
        self.environment = environment
        self._overrides: dict[str, bool] = {}
        self._cache: dict[str, bool] = {}
        
        # 初始化所有 Flags
        self._init_default_flags()
    
    def _init_default_flags(self):
        """初始化默认 Flags"""
        # 注册 Claude Code 的所有 Flags
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
            ClaudeCodeFlags.FORK_SUBAGENT,
        ]:
            register_flag(flag)
    
    def is_enabled(self, flag_name: str) -> bool:
        """
        检查 Flag 是否启用
        
        优先级:
        1. 运行时覆盖
        2. 环境变量
        3. Flag 配置
        4. 默认值
        """
        # 检查缓存
        if flag_name in self._cache:
            return self._cache[flag_name]
        
        # 1. 运行时覆盖
        if flag_name in self._overrides:
            result = self._overrides[flag_name]
            self._cache[flag_name] = result
            return result
        
        # 2. 环境变量
        env_var = f"FEATURE_{flag_name.upper()}"
        env_value = os.environ.get(env_var)
        if env_value is not None:
            result = env_value.lower() in ("true", "1", "yes")
            self._cache[flag_name] = result
            return result
        
        # 3. Flag 配置
        flag = get_flag(flag_name)
        if not flag:
            logger.warning(f"Unknown flag: {flag_name}")
            return False
        
        # 检查环境
        if self.environment not in flag.allowed_environments:
            self._cache[flag_name] = False
            return False
        
        # 检查百分比发布
        if flag.flag_type == FlagType.PERCENTAGE:
            result = self._check_percentage(flag)
            self._cache[flag_name] = result
            return result
        
        # 检查用户列表
        if flag.flag_type == FlagType.USER_LIST:
            result = self.user_id in flag.user_list if self.user_id else False
            self._cache[flag_name] = result
            return result
        
        # 检查依赖
        for req in flag.requires:
            if not self.is_enabled(req):
                self._cache[flag_name] = False
                return False
        
        # 检查冲突
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
        
        # 基于用户 ID 的确定性哈希
        import hashlib
        hash_value = int(hashlib.md5(self.user_id.encode()).hexdigest()[:8], 16)
        bucket = hash_value % 100
        return bucket < flag.percentage
    
    def set_override(self, flag_name: str, value: bool):
        """设置运行时覆盖"""
        self._overrides[flag_name] = value
        self._cache.pop(flag_name, None)  # 清除缓存
    
    def clear_override(self, flag_name: str):
        """清除运行时覆盖"""
        self._overrides.pop(flag_name, None)
        self._cache.pop(flag_name, None)
    
    def get_all_flags(self) -> dict[str, bool]:
        """获取所有 Flag 状态"""
        return {
            name: self.is_enabled(name)
            for name in _flag_registry.keys()
        }
    
    def get_flags_by_tag(self, tag: str) -> dict[str, bool]:
        """获取指定标签的 Flags"""
        return {
            name: self.is_enabled(name)
            for name, flag in _flag_registry.items()
            if tag in flag.tags
        }
```

### 3. 构建时消除 (模拟)

```python
class BuildTimeFeature:
    """
    构建时特性消除 (Python 模拟)
    
    Claude Code 使用 Bun 的 feature() 函数在编译时移除代码。
    Python 中可以使用条件导入和装饰器模拟。
    """
    
    @staticmethod
    def feature(name: str, enabled: bool = True):
        """
        特性装饰器
        
        如果 enabled=False，函数体将被替换为空实现
        """
        def decorator(func):
            if not enabled:
                # 返回空实现
                def empty_impl(*args, **kwargs):
                    logger.debug(f"Feature {name} is disabled, skipping {func.__name__}")
                    return None
                return empty_impl
            return func
        return decorator
    
    @staticmethod
    def conditional_import(flag_name: str, module_path: str, flag_manager: FeatureFlagManager):
        """
        条件导入
        
        只在 Flag 启用时导入模块
        """
        if flag_manager.is_enabled(flag_name):
            import importlib
            return importlib.import_module(module_path)
        return None


# 使用示例
# @BuildTimeFeature.feature("BUDDY", enabled=False)
# def create_digital_pet():
#     """This code will be completely removed if BUDDY=false"""
#     pass
```

### 4. 特性检查工具

```python
class FeatureCheck:
    """特性检查工具 - 用于条件执行"""
    
    def __init__(self, flag_manager: FeatureFlagManager):
        self.manager = flag_manager
    
    def if_enabled(self, flag_name: str, func, *args, **kwargs):
        """如果 Flag 启用则执行"""
        if self.manager.is_enabled(flag_name):
            return func(*args, **kwargs)
        return None
    
    def require(self, flag_name: str, message: Optional[str] = None):
        """要求 Flag 启用，否则抛出异常"""
        if not self.manager.is_enabled(flag_name):
            msg = message or f"Feature {flag_name} is not enabled"
            raise FeatureDisabledError(msg)
    
    def get_enabled_modules(self, flag_module_map: dict[str, str]) -> list:
        """获取已启用的模块列表"""
        enabled = []
        for flag, module in flag_module_map.items():
            if self.manager.is_enabled(flag):
                enabled.append(module)
        return enabled


class FeatureDisabledError(Exception):
    """特性未启用异常"""
    pass
```

---

## 使用示例

```python
# 创建管理器
manager = FeatureFlagManager(
    user_id="user-123",
    environment="production"
)

# 检查 Flag
if manager.is_enabled("KAIROS"):
    print("Autonomous mode enabled")

if manager.is_enabled("BUDDY"):
    print("Digital pet system available")

# 运行时覆盖
manager.set_override("VOICE_MODE", True)

# 获取所有状态
flags = manager.get_all_flags()
print(flags)

# 获取特定标签
context_flags = manager.get_flags_by_tag("context")
print(context_flags)
```

---

## Claude Code 的 44+ Flags

### Core Flags
| Flag | 说明 | 默认 |
|------|------|------|
| KAIROS | 自主代理模式 | false |
| PROACTIVE | 主动协助 | false |
| BRIDGE_MODE | 远程会话 | false |
| VOICE_MODE | 语音交互 | false |
| BUDDY | 数字宠物 | false |

### Context Flags
| Flag | 说明 | 默认 |
|------|------|------|
| CACHED_MICROCOMPACT | 缓存微压缩 | true |
| CONTEXT_COLLAPSE | 上下文折叠 | true |
| REACTIVE_COMPACT | 反应式压缩 | true |
| HISTORY_SNIP | 历史裁剪 | true |
| TOKEN_BUDGET | Token 预算 | true |

### Internal Flags
| Flag | 说明 | 默认 |
|------|------|------|
| VERIFICATION_AGENT | Tengu 验证 | true |
| FORK_SUBAGENT | Fork 子代理 | false |

---

## 关键要点

| 要点 | 说明 |
|------|------|
| **构建时消除** | 未启用的代码完全从 bundle 中移除 |
| **环境变量** | `FEATURE_XXX=true` 覆盖配置 |
| **百分比发布** | 基于用户 ID 的确定性分桶 |
| **依赖管理** | requires/conflicts 检查 |
| **标签系统** | 按功能分组管理 |

## 相关技能

- `config-management` - 配置管理
- `environment-variables` - 环境变量
- `deployment-strategies` - 部署策略
