import shlex
import logging
from typing import Optional, Callable, Awaitable
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
import json

from shihao_finance.agent.permission import PermissionMode

logger = logging.getLogger(__name__)


class CommandCategory(Enum):
    """命令分类"""

    SESSION = "session"
    GIT = "git"
    CONFIG = "config"
    DEVELOPMENT = "development"
    MODE = "mode"
    UTILITIES = "utilities"
    HIDDEN = "hidden"


@dataclass
class CommandArg:
    """命令参数定义"""

    name: str
    type: str
    description: str
    required: bool = False
    default: Optional[str] = None
    short: Optional[str] = None


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
                arg_name = part[2:]
                arg_def = next((a for a in self.args if a.name == arg_name), None)

                if not arg_def:
                    return {}, f"Unknown option: {part}"

                if arg_def.type == "boolean":
                    parsed[arg_name] = True
                else:
                    i += 1
                    if i >= len(parts):
                        return {}, f"Missing value for {part}"
                    parsed[arg_name] = parts[i]

            elif part.startswith("-") and len(part) == 2:
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
                positional = [a for a in self.args if a.name.startswith("_")]
                if positional:
                    parsed[positional[0].name] = part

            i += 1

        for arg in self.args:
            if arg.name not in parsed and arg.default is not None:
                parsed[arg.name] = arg.default

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
                lines.append(
                    f"  --{arg.name}{short}: {arg.description}{required}{default}"
                )

        return "\n".join(lines)


class CommandRegistry:
    """命令注册表"""

    def __init__(self):
        self._commands: dict[str, BaseCommand] = {}
        self._aliases: dict[str, str] = {}

    def register(self, command: BaseCommand) -> None:
        """注册命令"""
        self._commands[command.name] = command

        for alias in command.aliases:
            self._aliases[alias] = command.name

    def get(self, name: str) -> Optional[BaseCommand]:
        """获取命令"""
        if name in self._commands:
            return self._commands[name]

        if name in self._aliases:
            return self._commands[self._aliases[name]]

        return None

    def list_commands(
        self,
        include_hidden: bool = False,
        category_filter: Optional[CommandCategory] = None,
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
            cmd
            for cmd in self._commands.values()
            if query in cmd.name.lower() or query in cmd.description.lower()
        ]


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

        return CommandResult(success=True, output=f"Cleared {count} messages")


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
            short="f",
        ),
    ]

    async def execute(self, args: dict, context: dict) -> CommandResult:
        context_manager = context.get("context_manager")
        if not context_manager:
            return CommandResult(success=False, output="No context manager available")

        try:
            messages = context.get("messages", [])
            result = await context_manager.compact(messages)
            return CommandResult(
                success=True,
                output=f"Compacted using {result.strategy}: {result.original_tokens} → {result.compacted_tokens} tokens ({result.reduction:.1%} reduction)",
            )
        except Exception as e:
            return CommandResult(success=False, output=str(e))


class ExportCommand(BaseCommand):
    """导出会话"""

    name = "export"
    description = "Export conversation to file"
    category = CommandCategory.SESSION
    args = [
        CommandArg(
            name="path",
            type="string",
            description="Export file path",
            required=True,
            short="p",
        ),
        CommandArg(
            name="format",
            type="string",
            description="Export format",
            default="markdown",
            short="f",
        ),
    ]

    async def execute(self, args: dict, context: dict) -> CommandResult:
        path = args["path"]
        format_type = args["format"]
        messages = context.get("messages", [])

        if format_type == "markdown":
            content = self._to_markdown(messages)
        elif format_type == "json":
            content = json.dumps(messages, indent=2, ensure_ascii=False)
        else:
            return CommandResult(success=False, output=f"Unknown format: {format_type}")

        try:
            with open(path, "w", encoding="utf-8") as f:
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


class ConfigCommand(BaseCommand):
    """配置管理"""

    name = "config"
    description = "Manage configuration"
    category = CommandCategory.CONFIG
    args = [
        CommandArg(
            name="get", type="string", description="Get config value", short="g"
        ),
        CommandArg(name="set", type="string", description="Set config key", short="s"),
        CommandArg(name="value", type="string", description="Config value to set"),
        CommandArg(
            name="list", type="boolean", description="List all config", short="l"
        ),
    ]

    async def execute(self, args: dict, context: dict) -> CommandResult:
        config = context.get("config", {})

        if args.get("list"):
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

            config[key] = value
            context["config"] = config

            return CommandResult(success=True, output=f"Set {key} = {value}")

        return CommandResult(success=False, output="Use --get, --set, or --list")


class HelpCommand(BaseCommand):
    """帮助命令"""

    name = "help"
    description = "Show available commands"
    category = CommandCategory.UTILITIES
    aliases = ["?"]
    args = [
        CommandArg(
            name="command", type="string", description="Command name to get help for"
        ),
    ]

    async def execute(self, args: dict, context: dict) -> CommandResult:
        registry = context.get("command_registry")
        if not registry:
            return CommandResult(success=False, output="Command registry not available")

        cmd_name = args.get("command")
        if cmd_name:
            command = registry.get(cmd_name)
            if command:
                return CommandResult(success=True, output=command.get_help())
            return CommandResult(success=False, output=f"Unknown command: /{cmd_name}")

        lines = ["Available commands:\n"]

        by_category = {}
        for cmd in registry.list_commands():
            by_category.setdefault(cmd.category.value, []).append(cmd)

        for category, commands in sorted(by_category.items()):
            lines.append(f"\n## {category.title()}")
            for cmd in commands:
                aliases = f" (/{', /'.join(cmd.aliases)})" if cmd.aliases else ""
                lines.append(f"  /{cmd.name}{aliases}: {cmd.description}")

        return CommandResult(success=True, output="\n".join(lines))


class PlanCommand(BaseCommand):
    """进入计划模式"""

    name = "plan"
    description = "Enter plan mode (read-only, no file modifications)"
    category = CommandCategory.MODE

    async def execute(self, args: dict, context: dict) -> CommandResult:
        permissions = context.get("permissions")
        if permissions and hasattr(permissions, "set_mode"):
            try:
                permissions.set_mode(PermissionMode.PLAN)
                return CommandResult(
                    success=True, output="Entered plan mode (read-only)"
                )
            except Exception as e:
                return CommandResult(success=False, output=str(e))
        return CommandResult(success=False, output="Permission system not available")


class AutoCommand(BaseCommand):
    """进入自动模式"""

    name = "auto"
    description = "Enter auto mode (auto-approve safe actions)"
    category = CommandCategory.MODE

    async def execute(self, args: dict, context: dict) -> CommandResult:
        permissions = context.get("permissions")
        if permissions and hasattr(permissions, "set_mode"):
            try:
                permissions.set_mode(PermissionMode.AUTO)
                return CommandResult(
                    success=True,
                    output="Entered auto mode (safe actions auto-approved)",
                )
            except Exception as e:
                return CommandResult(success=False, output=str(e))
        return CommandResult(success=False, output="Permission system not available")


class DefaultCommand(BaseCommand):
    """默认模式"""

    name = "default"
    description = "Enter default mode (ask permission for actions)"
    category = CommandCategory.MODE

    async def execute(self, args: dict, context: dict) -> CommandResult:
        permissions = context.get("permissions")
        if permissions and hasattr(permissions, "set_mode"):
            try:
                permissions.set_mode(PermissionMode.DEFAULT)
                return CommandResult(
                    success=True, output="Entered default mode (ask permission)"
                )
            except Exception as e:
                return CommandResult(success=False, output=str(e))
        return CommandResult(success=False, output="Permission system not available")


class ModelCommand(BaseCommand):
    """切换模型"""

    name = "model"
    description = "Switch LLM model"
    category = CommandCategory.CONFIG
    args = [
        CommandArg(
            name="model",
            type="string",
            description="Model name (haiku/sonnet/claude)",
            required=True,
        ),
    ]

    async def execute(self, args: dict, context: dict) -> CommandResult:
        model = args.get("model", "").lower()
        valid_models = ["haiku", "sonnet", "claude", "llama3", "qwen"]

        if model not in valid_models:
            return CommandResult(
                success=False,
                output=f"Invalid model. Available: {', '.join(valid_models)}",
            )

        agent = context.get("agent")
        if agent and hasattr(agent, "llm_model"):
            agent.llm_model = model
            return CommandResult(success=True, output=f"Switched to model: {model}")

        return CommandResult(success=False, output="Agent not available")


class GitCommitCommand(BaseCommand):
    """Git 提交"""

    name = "commit"
    description = "Create a git commit"
    category = CommandCategory.GIT
    aliases = ["ci"]
    args = [
        CommandArg(
            name="message", type="string", description="Commit message", short="m"
        ),
        CommandArg(
            name="all", type="boolean", description="Stage all changes", short="a"
        ),
    ]

    async def execute(self, args: dict, context: dict) -> CommandResult:
        import subprocess

        message = args.get("message")
        stage_all = args.get("all", False)

        if not message:
            return CommandResult(success=False, output="Commit message required (-m)")

        if len(message) > 500:
            return CommandResult(
                success=False, output="Commit message too long (max 500 chars)"
            )

        if stage_all:
            subprocess.run(["git", "add", "-A"], capture_output=True)
        else:
            subprocess.run(["git", "add", "-u"], capture_output=True)

        result = subprocess.run(
            ["git", "commit", "-m", message], capture_output=True, text=True
        )

        if result.returncode != 0:
            return CommandResult(success=False, output=result.stderr)

        return CommandResult(success=True, output=f"Committed: {message}")


class GitStatusCommand(BaseCommand):
    """Git 状态"""

    name = "status"
    description = "Show git status"
    category = CommandCategory.GIT
    aliases = ["stat"]

    async def execute(self, args: dict, context: dict) -> CommandResult:
        import subprocess

        result = subprocess.run(
            ["git", "status", "--short"], capture_output=True, text=True
        )

        if result.returncode != 0:
            return CommandResult(success=False, output="Not a git repository")

        output = result.stdout or "No changes"
        return CommandResult(success=True, output=output)


class GitLogCommand(BaseCommand):
    """Git 日志"""

    name = "log"
    description = "Show git commit history"
    category = CommandCategory.GIT
    args = [
        CommandArg(
            name="limit", type="number", description="Number of commits", default=10
        ),
    ]

    async def execute(self, args: dict, context: dict) -> CommandResult:
        import subprocess

        limit = args.get("limit", 10)

        result = subprocess.run(
            ["git", "log", f"--max-count={limit}", "--oneline"],
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            return CommandResult(success=False, output="No commits yet")

        return CommandResult(success=True, output=result.stdout or "No commits")


class GitDiffCommand(BaseCommand):
    """Git 差异"""

    name = "diff"
    description = "Show git diff"
    category = CommandCategory.GIT

    async def execute(self, args: dict, context: dict) -> CommandResult:
        import subprocess

        result = subprocess.run(
            ["git", "diff", "--stat"], capture_output=True, text=True
        )

        return CommandResult(success=True, output=result.stdout or "No changes")


class CommandHandler:
    """命令处理器 - 解析和执行命令"""

    def __init__(self, registry: CommandRegistry):
        self.registry = registry
        self.history: list[str] = []

    async def handle(self, input_text: str, context: dict) -> Optional[CommandResult]:
        """处理用户输入"""
        if not input_text.startswith("/"):
            return None

        self.history.append(input_text)

        parts = input_text[1:].split(maxsplit=1)
        command_name = parts[0].lower()
        raw_args = parts[1] if len(parts) > 1 else ""

        command = self.registry.get(command_name)
        if not command:
            return CommandResult(
                success=False,
                output=f"Unknown command: /{command_name}. Type /help for available commands.",
            )

        args, error = command.parse_args(raw_args)
        if error:
            return CommandResult(success=False, output=error)

        try:
            result = await command.execute(args, context)
            return result
        except Exception as e:
            logger.error(f"Command execution failed: {e}")
            return CommandResult(success=False, output=f"Command failed: {e}")

    def get_help(self, command_name: Optional[str] = None) -> str:
        """获取帮助"""
        if command_name:
            command = self.registry.get(command_name)
            if command:
                return command.get_help()
            return f"Unknown command: /{command_name}"

        lines = ["Available commands:\n"]

        by_category = {}
        for cmd in self.registry.list_commands():
            by_category.setdefault(cmd.category.value, []).append(cmd)

        for category, commands in sorted(by_category.items()):
            lines.append(f"\n## {category.title()}")
            for cmd in commands:
                aliases = f" (/{', /'.join(cmd.aliases)})" if cmd.aliases else ""
                lines.append(f"  /{cmd.name}{aliases}: {cmd.description}")
            lines.append("")

        return "\n".join(lines)


def create_default_registry() -> CommandRegistry:
    """创建默认命令注册表"""
    registry = CommandRegistry()

    registry.register(ClearCommand())
    registry.register(CompactCommand())
    registry.register(ExportCommand())
    registry.register(ConfigCommand())
    registry.register(HelpCommand())
    registry.register(PlanCommand())
    registry.register(AutoCommand())
    registry.register(DefaultCommand())
    registry.register(ModelCommand())

    registry.register(GitCommitCommand())
    registry.register(GitStatusCommand())
    registry.register(GitLogCommand())
    registry.register(GitDiffCommand())

    return registry
