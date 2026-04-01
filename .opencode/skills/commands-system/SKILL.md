---
name: commands-system
description: AI Agent 斜杠命令系统 - 命令注册、执行、权限、快捷操作
category: ai-agent-infrastructure
source: Claude Code 85+ commands analysis
version: 1.0
tags:
  - commands
  - slash-commands
  - registry
  - execution
  - cli
---

# 斜杠命令系统 - 85+ 命令框架

> Claude Code 的命令系统：用户交互、会话管理、快捷操作

## 命令架构

```
┌─────────────────────────────────────────────────────────────┐
│                   Command System                            │
│                                                             │
│  User Input: "/commit --message 'fix bug'"                 │
│       │                                                     │
│       ▼                                                     │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                  Command Parser                       │ │
│  │  Parse: command="commit", args=["--message", "..."]  │ │
│  └───────────────────────────────────────────────────────┘ │
│       │                                                     │
│       ▼                                                     │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                Command Registry                       │ │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │ │
│  │  │ /commit │ │ /review │ │ /config │ │ /clear  │    │ │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │ │
│  └───────────────────────────────────────────────────────┘ │
│       │                                                     │
│       ▼                                                     │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              Command Execution                        │ │
│  │  validate → check_permission → execute → render      │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心实现

### 1. 命令基础类

```python
from typing import Optional, Callable, Awaitable
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
import shlex
import logging

logger = logging.getLogger(__name__)


class CommandCategory(Enum):
    """命令分类"""
    SESSION = "session"          # 会话管理
    GIT = "git"                  # Git 操作
    CONFIG = "config"            # 配置管理
    DEVELOPMENT = "development"  # 开发工具
    MODE = "mode"                # 模式切换
    UTILITIES = "utilities"      # 实用工具
    HIDDEN = "hidden"            # 隐藏命令


@dataclass
class CommandArg:
    """命令参数定义"""
    name: str
    type: str  # string, number, boolean, flag
    description: str
    required: bool = False
    default: Optional[str] = None
    short: Optional[str] = None  # 短选项，如 -m


@dataclass
class CommandResult:
    """命令执行结果"""
    success: bool
    output: str
    error: Optional[str] = None
    data: Optional[dict] = None


class BaseCommand(ABC):
    """命令基类"""
    
    name: str = ""
    description: str = ""
    category: CommandCategory = CommandCategory.UTILITIES
    aliases: list[str] = []
    args: list[CommandArg] = []
    hidden: bool = False
    requires_args: bool = False
    
    def parse_args(self, raw_args: str) -> tuple[dict, Optional[str]]:
        """解析命令参数"""
        if not raw_args and self.requires_args:
            return {}, f"Command /{self.name} requires arguments"
        
        if not raw_args:
            return {arg.name: arg.default for arg in self.args}, None
        
        try:
            parts = shlex.split(raw_args)
        except ValueError as e:
            return {}, f"Failed to parse arguments: {e}"
        
        parsed = {}
        i = 0
        
        while i < len(parts):
            part = parts[i]
            
            if part.startswith("--"):
                # 长选项
                arg_name = part[2:]
                arg_def = next((a for a in self.args if a.name == arg_name), None)
                
                if not arg_def:
                    return {}, f"Unknown option: {part}"
                
                if arg_def.type == "boolean":
                    parsed[arg_name] = True
                elif arg_def.type == "flag":
                    parsed[arg_name] = True
                else:
                    i += 1
                    if i >= len(parts):
                        return {}, f"Missing value for {part}"
                    parsed[arg_name] = parts[i]
                    
            elif part.startswith("-") and len(part) == 2:
                # 短选项
                short = part[1:]
                arg_def = next((a for a in self.args if a.short == short), None)
                
                if not arg_def:
                    return {}, f"Unknown option: {part}"
                
                if arg_def.type == "boolean":
                    parsed[arg_def.name] = True
                else:
                    i += 1
                    if i >= len(parts):
                        return {}, f"Missing value for {part}"
                    parsed[arg_def.name] = parts[i]
            else:
                # 位置参数
                positional = [a for a in self.args if not a.name.startswith("-")]
                if positional:
                    parsed[positional[0].name] = part
            
            i += 1
        
        # 填充默认值
        for arg in self.args:
            if arg.name not in parsed and arg.default is not None:
                parsed[arg.name] = arg.default
        
        # 检查必填参数
        for arg in self.args:
            if arg.required and arg.name not in parsed:
                return {}, f"Missing required argument: {arg.name}"
        
        return parsed, None
    
    @abstractmethod
    async def execute(self, args: dict, context: dict) -> CommandResult:
        """执行命令"""
        pass
    
    def get_help(self) -> str:
        """获取帮助信息"""
        lines = [f"/{self.name} - {self.description}"]
        
        if self.aliases:
            lines.append(f"Aliases: {', '.join(self.aliases)}")
        
        if self.args:
            lines.append("\nArguments:")
            for arg in self.args:
                required = " (required)" if arg.required else ""
                default = f" [default: {arg.default}]" if arg.default else ""
                short = f", -{arg.short}" if arg.short else ""
                lines.append(f"  --{arg.name}{short}: {arg.description}{required}{default}")
        
        return "\n".join(lines)
```

### 2. 命令注册表

```python
class CommandRegistry:
    """命令注册表"""
    
    def __init__(self):
        self._commands: dict[str, BaseCommand] = {}
        self._aliases: dict[str, str] = {}
    
    def register(self, command: BaseCommand) -> None:
        """注册命令"""
        self._commands[command.name] = command
        
        # 注册别名
        for alias in command.aliases:
            self._aliases[alias] = command.name
    
    def get(self, name: str) -> Optional[BaseCommand]:
        """获取命令"""
        # 直接查找
        if name in self._commands:
            return self._commands[name]
        
        # 通过别名查找
        if name in self._aliases:
            return self._commands[self._aliases[name]]
        
        return None
    
    def list_commands(
        self,
        include_hidden: bool = False,
        category_filter: Optional[CommandCategory] = None
    ) -> list[BaseCommand]:
        """列出所有命令"""
        commands = list(self._commands.values())
        
        if not include_hidden:
            commands = [c for c in commands if not c.hidden]
        
        if category_filter:
            commands = [c for c in commands if c.category == category_filter]
        
        return sorted(commands, key=lambda c: c.name)
    
    def search(self, query: str) -> list[BaseCommand]:
        """搜索命令"""
        query = query.lower()
        return [
            cmd for cmd in self._commands.values()
            if query in cmd.name.lower() or query in cmd.description.lower()
        ]


# 全局注册表
command_registry = CommandRegistry()
```

---

## 内置命令实现

### 会话管理命令

```python
@command_registry.register
class ClearCommand(BaseCommand):
    """清空对话历史"""
    name = "clear"
    description = "Clear conversation history"
    category = CommandCategory.SESSION
    aliases = ["cls"]
    
    async def execute(self, args: dict, context: dict) -> CommandResult:
        messages = context.get("messages", [])
        count = len(messages)
        messages.clear()
        
        return CommandResult(
            success=True,
            output=f"Cleared {count} messages"
        )


@command_registry.register
class CompactCommand(BaseCommand):
    """压缩上下文"""
    name = "compact"
    description = "Compact conversation context to save tokens"
    category = CommandCategory.SESSION
    args = [
        CommandArg(
            name="force",
            type="boolean",
            description="Force compaction even if not needed",
            short="f"
        ),
    ]
    
    async def execute(self, args: dict, context: dict) -> CommandResult:
        context_manager = context.get("context_manager")
        if not context_manager:
            return CommandResult(success=False, output="No context manager available")
        
        result = await context_manager.compact_if_needed()
        
        if result:
            return CommandResult(
                success=True,
                output=f"Compacted using {result.strategy}: {result.original_tokens} → {result.compacted_tokens} tokens ({result.reduction:.1%} reduction)"
            )
        else:
            return CommandResult(
                success=True,
                output="Context is already optimized"
            )


@command_registry.register
class ExportCommand(BaseCommand):
    """导出会话"""
    name = "export"
    description = "Export conversation to file"
    category = CommandCategory.SESSION
    args = [
        CommandArg(name="path", type="string", description="Export file path", required=True, short="p"),
        CommandArg(name="format", type="string", description="Export format", default="markdown", short="f"),
    ]
    
    async def execute(self, args: dict, context: dict) -> CommandResult:
        path = args["path"]
        format_type = args["format"]
        messages = context.get("messages", [])
        
        if format_type == "markdown":
            content = self._to_markdown(messages)
        elif format_type == "json":
            import json
            content = json.dumps(messages, indent=2, ensure_ascii=False)
        else:
            return CommandResult(success=False, output=f"Unknown format: {format_type}")
        
        try:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(content)
            return CommandResult(success=True, output=f"Exported to {path}")
        except Exception as e:
            return CommandResult(success=False, output=str(e))
    
    def _to_markdown(self, messages: list[dict]) -> str:
        parts = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            parts.append(f"## {role.title()}\n\n{content}\n")
        return "\n".join(parts)
```

### Git 命令

```python
@command_registry.register
class CommitCommand(BaseCommand):
    """创建 Git 提交"""
    name = "commit"
    description = "Create a git commit"
    category = CommandCategory.GIT
    aliases = ["ci"]
    args = [
        CommandArg(name="message", type="string", description="Commit message", short="m"),
        CommandArg(name="all", type="boolean", description="Stage all changes", short="a"),
        CommandArg(name="push", type="boolean", description="Push after commit", short="p"),
    ]
    
    async def execute(self, args: dict, context: dict) -> CommandResult:
        import subprocess
        import os
        
        message = args.get("message")
        stage_all = args.get("all", False)
        do_push = args.get("push", False)
        
        # 如果没有消息，让 LLM 生成
        if not message:
            llm = context.get("llm_client")
            if llm:
                diff = subprocess.run(
                    ["git", "diff", "--cached"],
                    capture_output=True,
                    text=True
                ).stdout
                
                response = await llm.complete([
                    {"role": "system", "content": "Generate a concise git commit message based on the changes."},
                    {"role": "user", "content": f"Changes:\n{diff[:2000]}"}
                ])
                message = response.content
        
        if not message:
            return CommandResult(success=False, output="Commit message required")
        
        # Stage changes
        if stage_all:
            subprocess.run(["git", "add", "."], capture_output=True)
        else:
            subprocess.run(["git", "add", "-u"], capture_output=True)
        
        # Commit
        result = subprocess.run(
            ["git", "commit", "-m", message],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            return CommandResult(success=False, output=result.stderr)
        
        # Push if requested
        if do_push:
            push_result = subprocess.run(
                ["git", "push"],
                capture_output=True,
                text=True
            )
            if push_result.returncode != 0:
                return CommandResult(success=True, output=f"Committed but push failed: {push_result.stderr}")
        
        return CommandResult(success=True, output=f"Committed: {message}")


@command_registry.register
class ReviewCommand(BaseCommand):
    """代码审查"""
    name = "review"
    description = "Review code changes"
    category = CommandCategory.GIT
    args = [
        CommandArg(name="base", type="string", description="Base branch", default="main", short="b"),
    ]
    
    async def execute(self, args: dict, context: dict) -> CommandResult:
        import subprocess
        
        base = args.get("base", "main")
        
        # 获取 diff
        result = subprocess.run(
            ["git", "diff", f"{base}...HEAD"],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            return CommandResult(success=False, output=result.stderr)
        
        diff = result.stdout
        if not diff:
            return CommandResult(success=True, output="No changes to review")
        
        # 让 LLM 审查
        llm = context.get("llm_client")
        if llm:
            response = await llm.complete([
                {"role": "system", "content": "You are a code reviewer. Review the following code changes for bugs, security issues, and best practices."},
                {"role": "user", "content": f"Review these changes:\n{diff[:5000]}"}
            ])
            return CommandResult(success=True, output=response.content)
        
        return CommandResult(success=True, output=diff[:2000])
```

### 配置命令

```python
@command_registry.register
class ConfigCommand(BaseCommand):
    """配置管理"""
    name = "config"
    description = "Manage configuration"
    category = CommandCategory.CONFIG
    args = [
        CommandArg(name="get", type="string", description="Get config value", short="g"),
        CommandArg(name="set", type="string", description="Set config key", short="s"),
        CommandArg(name="value", type="string", description="Config value to set"),
        CommandArg(name="list", type="boolean", description="List all config", short="l"),
    ]
    
    async def execute(self, args: dict, context: dict) -> CommandResult:
        config = context.get("config", {})
        
        if args.get("list"):
            import json
            return CommandResult(success=True, output=json.dumps(config, indent=2))
        
        if args.get("get"):
            key = args["get"]
            value = config.get(key, "Not set")
            return CommandResult(success=True, output=f"{key} = {value}")
        
        if args.get("set"):
            key = args["set"]
            value = args.get("value")
            if value is None:
                return CommandResult(success=False, output="Value required")
            
            # 更新配置
            config[key] = value
            context["config"] = config
            
            return CommandResult(success=True, output=f"Set {key} = {value}")
        
        return CommandResult(success=False, output="Use --get, --set, or --list")
```

### 模式命令

```python
@command_registry.register
class PlanCommand(BaseCommand):
    """进入计划模式"""
    name = "plan"
    description = "Enter plan mode (read-only)"
    category = CommandCategory.MODE
    
    async def execute(self, args: dict, context: dict) -> CommandResult:
        permissions = context.get("permissions")
        if permissions:
            permissions.set_mode(PermissionMode.PLAN)
            return CommandResult(success=True, output="Entered plan mode (read-only)")
        return CommandResult(success=False, output="Permission system not available")


@command_registry.register
class AutoCommand(BaseCommand):
    """进入自动模式"""
    name = "auto"
    description = "Enter auto mode (auto-approve safe actions)"
    category = CommandCategory.MODE
    
    async def execute(self, args: dict, context: dict) -> CommandResult:
        permissions = context.get("permissions")
        if permissions:
            permissions.set_mode(PermissionMode.AUTO)
            return CommandResult(success=True, output="Entered auto mode (safe actions auto-approved)")
        return CommandResult(success=False, output="Permission system not available")
```

---

## 命令处理器

```python
class CommandHandler:
    """命令处理器 - 解析和执行命令"""
    
    def __init__(self, registry: CommandRegistry):
        self.registry = registry
        self.history: list[str] = []
    
    async def handle(self, input_text: str, context: dict) -> Optional[CommandResult]:
        """
        处理用户输入
        
        如果是命令（以 / 开头），执行并返回结果
        否则返回 None
        """
        if not input_text.startswith("/"):
            return None
        
        # 记录历史
        self.history.append(input_text)
        
        # 解析命令
        parts = input_text[1:].split(maxsplit=1)
        command_name = parts[0].lower()
        raw_args = parts[1] if len(parts) > 1 else ""
        
        # 查找命令
        command = self.registry.get(command_name)
        if not command:
            return CommandResult(
                success=False,
                output=f"Unknown command: /{command_name}. Type /help for available commands."
            )
        
        # 解析参数
        args, error = command.parse_args(raw_args)
        if error:
            return CommandResult(success=False, output=error)
        
        # 执行命令
        try:
            result = await command.execute(args, context)
            return result
        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            return CommandResult(
                success=False,
                output=f"Command failed: {e}"
            )
    
    def get_help(self, command_name: Optional[str] = None) -> str:
        """获取帮助"""
        if command_name:
            command = self.registry.get(command_name)
            if command:
                return command.get_help()
            return f"Unknown command: /{command_name}"
        
        # 显示所有命令
        lines = ["Available commands:\n"]
        
        by_category = {}
        for cmd in self.registry.list_commands():
            by_category.setdefault(cmd.category.value, []).append(cmd)
        
        for category, commands in sorted(by_category.items()):
            lines.append(f"## {category.title()}")
            for cmd in commands:
                aliases = f" (/{', /'.join(cmd.aliases)})" if cmd.aliases else ""
                lines.append(f"  /{cmd.name}{aliases}: {cmd.description}")
            lines.append("")
        
        return "\n".join(lines)
```

---

## 使用示例

```python
# 创建命令系统
registry = CommandRegistry()

# 注册内置命令
registry.register(ClearCommand())
registry.register(CompactCommand())
registry.register(CommitCommand())
registry.register(ConfigCommand())
# ... 注册更多命令

# 创建处理器
handler = CommandHandler(registry)

# 处理命令
context = {
    "messages": [],
    "permissions": permission_manager,
    "llm_client": llm,
}

result = await handler.handle("/commit -m 'fix login bug' --push", context)
print(result.output)

# 帮助
print(handler.get_help())
```

---

## Claude Code 命令分类

### 会话管理
| 命令 | 说明 |
|------|------|
| `/session` | 管理会话 |
| `/resume` | 恢复之前会话 |
| `/clear` | 清空对话 |
| `/compact` | 压缩上下文 |
| `/export` | 导出会话 |

### Git 操作
| 命令 | 说明 |
|------|------|
| `/commit` | 创建提交 |
| `/commit-push-pr` | 完整工作流 |
| `/branch` | 分支管理 |
| `/diff` | 查看差异 |
| `/review` | 代码审查 |

### 配置
| 命令 | 说明 |
|------|------|
| `/config` | 编辑配置 |
| `/permissions` | 权限管理 |
| `/theme` | 主题切换 |
| `/vim` | Vim 模式 |
| `/model` | 模型切换 |

### 开发
| 命令 | 说明 |
|------|------|
| `/doctor` | 运行诊断 |
| `/init` | 初始化项目 |
| `/mcp` | MCP 管理 |
| `/skills` | 列出技能 |
| `/agents` | 列出代理 |

### 模式切换
| 命令 | 说明 |
|------|------|
| `/plan` | 计划模式 |
| `/fast` | 快速模式 |
| `/voice` | 语音模式 |
| `/proactive` | 主动模式 |

---

## 关键要点

| 要点 | 说明 |
|------|------|
| **命令注册** | 装饰器注册，统一管理 |
| **参数解析** | 支持长/短选项，位置参数 |
| **分类管理** | 8 个命令分类 |
| **别名支持** | 快捷命令 |
| **LLM 集成** | 智能命令（如自动生成提交信息） |

## 相关技能

- `agent-loop-patterns` - Agent 循环
- `permission-system` - 权限系统
- `git-workflow` - Git 工作流
