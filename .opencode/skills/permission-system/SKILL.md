---
name: permission-system
description: AI Agent 权限控制系统 - 三模式权限、拒绝追踪、安全分类
category: ai-agent-security
source: Claude Code permission system analysis
version: 1.0
tags:
  - security
  - permissions
  - agent-safety
  - rate-limiting
  - audit
---

# 权限控制系统 - Agent 安全防护

> 基于 Claude Code 三层权限系统 + 拒绝追踪机制

## 设计理念

AI Agent 可以执行代码 → **必须有严格的安全控制**

```
┌─────────────────────────────────────────────────────────────┐
│                    Permission System                        │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   DEFAULT   │  │    PLAN     │  │    AUTO     │        │
│  │   模式      │  │    模式     │  │    模式     │        │
│  │             │  │             │  │             │        │
│  │  每次询问   │  │  只读操作   │  │  安全自动   │        │
│  │  用户确认   │  │  禁止执行   │  │  批准       │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│         │                │                │                 │
│         └────────────────┼────────────────┘                 │
│                          │                                  │
│                   ┌──────▼──────┐                          │
│                   │ Denial     │                           │
│                   │ Tracking   │                           │
│                   │ 拒绝追踪   │                           │
│                   └────────────┘                           │
└─────────────────────────────────────────────────────────────┘
```

---

## 完整实现

```python
from enum import Enum, auto
from dataclasses import dataclass, field
from typing import Optional, Callable, Awaitable
from collections import defaultdict
from datetime import datetime, timedelta
import asyncio
import logging

logger = logging.getLogger(__name__)


class PermissionMode(Enum):
    """权限模式"""
    DEFAULT = "default"   # 每次询问
    PLAN = "plan"         # 只读模式
    AUTO = "auto"         # 安全自动批准


class ToolCategory(Enum):
    """工具安全分类"""
    READONLY = "readonly"      # 只读操作
    SAFE = "safe"              # 安全操作
    MODERATE = "moderate"      # 中等风险
    DESTRUCTIVE = "destructive" # 破坏性操作
    DANGEROUS = "dangerous"    # 危险操作


@dataclass
class ToolDefinition:
    """工具定义"""
    name: str
    category: ToolCategory
    description: str
    confirmation_message: Optional[str] = None
    always_ask: bool = False  # 即使在 AUTO 模式也询问
    auto_deny: bool = False   # 总是拒绝


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


# ================================================================
# 安全分类器
# ================================================================

class SecurityClassifier:
    """工具安全分类器"""
    
    # 预定义的安全规则
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
        
        # 检查工具名称
        if tool_name in ["Read", "Grep", "Glob", "Ls"]:
            return ToolCategory.READONLY
        
        if tool_name in ["Write", "Edit"]:
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
        import re
        
        # 检查危险模式
        for pattern in cls.DANGEROUS_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return ToolCategory.DANGEROUS
        
        # 检查破坏性模式
        for pattern in cls.DESTRUCTIVE_PATTERNS:
            if re.search(pattern, command, re.IGNORECASE):
                return ToolCategory.DESTRUCTIVE
        
        # 读取命令
        if any(cmd in command for cmd in ["cat ", "head ", "tail ", "ls ", "pwd"]):
            return ToolCategory.READONLY
        
        return ToolCategory.MODERATE


# ================================================================
# 拒绝追踪器
# ================================================================

class DenialTracker:
    """拒绝追踪器 - Claude Code 核心创新"""
    
    def __init__(self, max_denials: int = 3, reset_hours: int = 24):
        self.max_denials = max_denials
        self.reset_hours = reset_hours
        
        # 拒绝记录: {(tool, action): [timestamps]}
        self._denials: dict[tuple[str, str], list[datetime]] = defaultdict(list)
        
        # 自动拒绝列表
        self._auto_deny_list: set[tuple[str, str]] = set()
    
    def record_denial(self, tool: str, action: str):
        """记录一次拒绝"""
        key = (tool, action)
        now = datetime.now()
        
        # 清理过期记录
        cutoff = now - timedelta(hours=self.reset_hours)
        self._denials[key] = [
            ts for ts in self._denials[key] if ts > cutoff
        ]
        
        # 添加新记录
        self._denials[key].append(now)
        
        # 检查是否超过阈值
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
            # 重置该工具的所有记录
            keys_to_remove = [k for k in self._denials if k[0] == tool]
            for key in keys_to_remove:
                del self._denials[key]
                self._auto_deny_list.discard(key)
        else:
            self._denials.clear()
            self._auto_deny_list.clear()


# ================================================================
# 权限管理器
# ================================================================

class PermissionManager:
    """权限管理器 - Claude Code 风格"""
    
    def __init__(
        self,
        mode: PermissionMode = PermissionMode.DEFAULT,
        max_denials: int = 3,
        ask_callback: Optional[Callable[[PermissionRequest], Awaitable[bool]]] = None
    ):
        self.mode = mode
        self.denial_tracker = DenialTracker(max_denials=max_denials)
        self._ask_callback = ask_callback
        
        # 工具注册表
        self._tools: dict[str, ToolDefinition] = {}
        
        # 安全分类器
        self.classifier = SecurityClassifier()
        
        # 审计日志
        self._audit_log: list[dict] = []
        self._max_audit_entries = 10000
    
    def register_tool(self, definition: ToolDefinition):
        """注册工具"""
        self._tools[definition.name] = definition
    
    async def check_permission(
        self,
        tool_name: str,
        action: str,
        parameters: dict,
        context: Optional[dict] = None
    ) -> PermissionDecision:
        """
        检查权限
        
        返回：是否允许执行
        """
        
        # 1. 检查自动拒绝
        if self.denial_tracker.should_auto_deny(tool_name, action):
            return PermissionDecision(
                granted=False,
                reason=f"Auto-denied after {self.denial_tracker.max_denials} previous rejections",
                mode=self.mode
            )
        
        # 2. 获取工具定义
        tool_def = self._tools.get(tool_name)
        
        # 3. 检查工具级别的自动拒绝
        if tool_def and tool_def.auto_deny:
            return PermissionDecision(
                granted=False,
                reason=f"Tool {tool_name} is blocked",
                mode=self.mode
            )
        
        # 4. 检查工具的 always_ask 标志
        if tool_def and tool_def.always_ask:
            return await self._ask_user(
                tool_name, action, parameters, context,
                reason="Tool requires explicit approval"
            )
        
        # 5. 根据模式处理
        if self.mode == PermissionMode.PLAN:
            # PLAN 模式：只允许只读操作
            category = self.classifier.classify(tool_name, parameters)
            if category != ToolCategory.READONLY:
                return PermissionDecision(
                    granted=False,
                    reason="Plan mode only allows read-only operations",
                    mode=self.mode
                )
            return PermissionDecision(
                granted=True,
                reason="Read-only operation allowed in plan mode",
                mode=self.mode
            )
        
        elif self.mode == PermissionMode.AUTO:
            # AUTO 模式：安全操作自动批准
            category = self.classifier.classify(tool_name, parameters)
            
            if category in (ToolCategory.READONLY, ToolCategory.SAFE):
                return PermissionDecision(
                    granted=True,
                    reason=f"Auto-approved: {category.value} operation",
                    mode=self.mode
                )
            else:
                # 中等风险以上仍需确认
                return await self._ask_user(
                    tool_name, action, parameters, context,
                    reason=f"{category.value} operation requires confirmation"
                )
        
        else:  # DEFAULT
            # DEFAULT 模式：根据风险级别决定
            category = self.classifier.classify(tool_name, parameters)
            
            if category == ToolCategory.READONLY:
                return PermissionDecision(
                    granted=True,
                    reason="Read-only operation auto-approved",
                    mode=self.mode
                )
            else:
                return await self._ask_user(
                    tool_name, action, parameters, context,
                    reason=f"{category.value} operation"
                )
    
    async def _ask_user(
        self,
        tool_name: str,
        action: str,
        parameters: dict,
        context: Optional[dict],
        reason: str
    ) -> PermissionDecision:
        """询问用户"""
        
        request = PermissionRequest(
            tool_name=tool_name,
            action=action,
            parameters=parameters,
            context=context
        )
        
        # 使用回调或默认行为
        if self._ask_callback:
            granted = await self._ask_callback(request)
        else:
            # 默认：打印并等待（实际实现中应该是交互式的）
            print(f"\n⚠️ Permission Request: {tool_name}")
            print(f"   Action: {action}")
            print(f"   Reason: {reason}")
            granted = False  # 默认拒绝
        
        # 记录决策
        self._record_decision(request, granted, reason)
        
        if not granted:
            self.denial_tracker.record_denial(tool_name, action)
        
        return PermissionDecision(
            granted=granted,
            reason=reason,
            mode=self.mode,
            requires_confirmation=True
        )
    
    def _record_decision(
        self,
        request: PermissionRequest,
        granted: bool,
        reason: str
    ):
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
            )
        }
        
        self._audit_log.append(entry)
        
        # 限制审计日志大小
        if len(self._audit_log) > self._max_audit_entries:
            self._audit_log = self._audit_log[-self._max_audit_entries // 2:]
    
    def set_mode(self, mode: PermissionMode):
        """切换权限模式"""
        logger.info(f"Permission mode changed: {self.mode.value} → {mode.value}")
        self.mode = mode
    
    def get_audit_log(
        self,
        limit: int = 100,
        tool_filter: Optional[str] = None
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
```

---

## 使用示例

### 基本使用

```python
# 创建权限管理器
perm = PermissionManager(
    mode=PermissionMode.DEFAULT,
    max_denials=3
)

# 注册工具
perm.register_tool(ToolDefinition(
    name="Read",
    category=ToolCategory.READONLY,
    description="Read file contents"
))

perm.register_tool(ToolDefinition(
    name="Bash",
    category=ToolCategory.MODERATE,
    description="Execute shell commands"
))

perm.register_tool(ToolDefinition(
    name="Write",
    category=ToolCategory.SAFE,
    description="Write file contents",
    always_ask=True  # 写入操作总是询问
))

# 检查权限
decision = await perm.check_permission(
    tool_name="Read",
    action="read_file",
    parameters={"path": "/etc/passwd"}
)

if decision.granted:
    # 执行操作
    pass
else:
    print(f"Denied: {decision.reason}")
```

### 集成到 Agent

```python
class SecureAgent:
    """带权限控制的 Agent"""
    
    def __init__(self, llm_client, tools: dict):
        self.llm = llm_client
        self.tools = tools
        self.permissions = PermissionManager(
            mode=PermissionMode.DEFAULT,
            ask_callback=self._handle_permission_request
        )
    
    async def run(self, task: str):
        async for event in self._agent_loop(task):
            if event.type == "tool_call":
                # 检查权限
                decision = await self.permissions.check_permission(
                    tool_name=event.tool_name,
                    action="execute",
                    parameters=event.tool_args
                )
                
                if not decision.granted:
                    yield {
                        "type": "permission_denied",
                        "tool": event.tool_name,
                        "reason": decision.reason
                    }
                    continue
            
            yield event
    
    async def _handle_permission_request(
        self, 
        request: PermissionRequest
    ) -> bool:
        """处理权限请求"""
        print(f"\n🔐 {request.tool_name}: {request.action}")
        print(f"   Parameters: {request.parameters}")
        
        # 实际应用中应该是交互式提示
        # 这里简化为返回 False
        return False
```

---

## 安全最佳实践

### 1. 白名单优先

```python
ALLOWED_COMMANDS = {
    "ls", "cat", "head", "tail", "grep", "find", "pwd", "echo", "date"
}

def validate_command(command: str) -> bool:
    cmd = command.split()[0] if command else ""
    return cmd in ALLOWED_COMMANDS
```

### 2. 参数验证

```python
def sanitize_path(path: str) -> Optional[str]:
    """验证路径安全"""
    import os
    
    # 解析真实路径
    real_path = os.path.realpath(path)
    
    # 检查是否在允许的目录中
    allowed_dirs = ["/home", "/tmp", "/var/project"]
    
    for allowed in allowed_dirs:
        if real_path.startswith(allowed):
            return real_path
    
    return None
```

### 3. 超时控制

```python
async def execute_with_timeout(
    command: str,
    timeout: int = 30
) -> str:
    """带超时的命令执行"""
    try:
        result = await asyncio.wait_for(
            subprocess.run(command, shell=True),
            timeout=timeout
        )
        return result.stdout
    except asyncio.TimeoutError:
        return "Error: Command timed out"
```

---

## 最佳实践

| 实践 | 说明 |
|------|------|
| **默认拒绝** | 不确定时拒绝，而非允许 |
| **最小权限** | 只授予完成任务所需的最小权限 |
| **拒绝追踪** | 多次拒绝后自动拒绝，防止绕过 |
| **审计日志** | 记录所有权限决策，便于审计 |
| **模式切换** | 受信任环境用 AUTO，未知环境用 DEFAULT |
| **白名单** | 明确允许的命令列表，而非黑名单 |

## 相关技能

- `security-hardening` - 安全加固
- `cli-tool-security` - CLI 工具安全
- `agent-loop-patterns` - Agent 循环模式
