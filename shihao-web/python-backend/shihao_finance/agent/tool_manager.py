"""
工具系统架构 - Claude Code 模式
基于 Claude Code 源码分析实现的工具注册与执行系统
"""

import re
import os
import asyncio
import logging
from typing import Any, Optional, AsyncIterator, Callable
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod

logger = logging.getLogger(__name__)


class ToolStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    ERROR = "error"


@dataclass
class ToolResult:
    """工具执行结果"""

    success: bool
    output: str
    error: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    execution_time: float = 0.0


@dataclass
class ToolProgress:
    """工具执行进度"""

    status: ToolStatus
    message: str
    percentage: Optional[int] = None
    data: Optional[dict] = None


@dataclass
class ToolParameter:
    """工具参数定义 (类似 Zod schema)"""

    name: str
    type: str
    description: str
    required: bool = False
    default: Any = None
    enum: Optional[list] = None
    pattern: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class BaseTool(ABC):
    """工具基类 - Claude Code 风格"""

    name: str = ""
    description: str = ""
    parameters: list[ToolParameter] = []

    def __init__(self, config: Optional[dict] = None):
        self.config = config or {}
        self._progress_callback: Optional[Callable] = None

    def set_progress_callback(self, callback: Callable):
        """设置进度回调"""
        self._progress_callback = callback

    async def _emit_progress(
        self, status: ToolStatus, message: str, percentage: Optional[int] = None
    ):
        """发送进度事件"""
        if self._progress_callback:
            await self._progress_callback(
                ToolProgress(status=status, message=message, percentage=percentage)
            )

    def validate_params(self, params: dict) -> tuple[bool, Optional[str]]:
        """验证参数 (类似 Zod validation)"""
        for param_def in self.parameters:
            value = params.get(param_def.name)

            if param_def.required and value is None:
                if param_def.default is None:
                    return False, f"Missing required parameter: {param_def.name}"
                value = param_def.default

            if value is None:
                continue

            # 空字符串验证
            if param_def.required and isinstance(value, str) and value == "":
                return False, f"Parameter {param_def.name} cannot be empty"

            if param_def.type == "string" and not isinstance(value, str):
                return False, f"Parameter {param_def.name} must be a string"
            elif param_def.type == "number" and not isinstance(value, (int, float)):
                return False, f"Parameter {param_def.name} must be a number"
            elif param_def.type == "boolean" and not isinstance(value, bool):
                return False, f"Parameter {param_def.name} must be a boolean"

            if param_def.enum and value not in param_def.enum:
                return (
                    False,
                    f"Parameter {param_def.name} must be one of {param_def.enum}",
                )

            if param_def.pattern and isinstance(value, str):
                if not re.match(param_def.pattern, value):
                    return False, f"Parameter {param_def.name} does not match pattern"

            if isinstance(value, (int, float)):
                if param_def.min_value is not None and value < param_def.min_value:
                    return (
                        False,
                        f"Parameter {param_def.name} must be >= {param_def.min_value}",
                    )
                if param_def.max_value is not None and value > param_def.max_value:
                    return (
                        False,
                        f"Parameter {param_def.name} must be <= {param_def.max_value}",
                    )

        return True, None

    @abstractmethod
    async def execute(self, params: dict) -> ToolResult:
        """执行工具"""
        pass

    async def execute_streaming(self, params: dict) -> AsyncIterator[ToolProgress]:
        """流式执行工具"""
        await self._emit_progress(ToolStatus.RUNNING, "Starting...")

        try:
            result = await self.execute(params)

            if result.success:
                await self._emit_progress(ToolStatus.SUCCESS, "Completed")
            else:
                await self._emit_progress(ToolStatus.ERROR, result.error or "Failed")

        except Exception as e:
            await self._emit_progress(ToolStatus.ERROR, str(e))


class ToolRegistry:
    """工具注册表 - 管理所有可用工具"""

    def __init__(self):
        self._tools: dict[str, type] = {}
        self._instances: dict[str, BaseTool] = {}

    def register(self, tool_class: type):
        """注册工具类"""
        name = tool_class.name or tool_class.__name__
        self._tools[name] = tool_class
        logger.info(f"Registered tool: {name}")
        return tool_class

    def get(self, name: str, config: Optional[dict] = None) -> Optional[BaseTool]:
        """获取工具实例"""
        if name not in self._tools:
            return None

        if name not in self._instances:
            self._instances[name] = self._tools[name](config)

        return self._instances[name]

    def list_tools(self) -> list[dict]:
        """列出所有工具"""
        return [
            {
                "name": name,
                "description": cls.description,
                "parameters": [
                    {
                        "name": p.name,
                        "type": p.type,
                        "description": p.description,
                        "required": p.required,
                    }
                    for p in cls.parameters
                ],
            }
            for name, cls in self._tools.items()
        ]

    def to_mcp_format(self) -> list[dict]:
        """转换为 MCP 工具格式"""
        return [
            {
                "name": name,
                "description": cls.description,
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        p.name: {
                            "type": p.type,
                            "description": p.description,
                            **({"enum": p.enum} if p.enum else {}),
                        }
                        for p in cls.parameters
                    },
                    "required": [p.name for p in cls.parameters if p.required],
                },
            }
            for name, cls in self._tools.items()
        ]


tool_registry = ToolRegistry()


@tool_registry.register
class ReadTool(BaseTool):
    """读取文件工具"""

    name = "Read"
    description = "Read file contents with line numbers"
    parameters = [
        ToolParameter(
            name="file_path",
            type="string",
            description="Path to the file",
            required=True,
        ),
        ToolParameter(
            name="offset",
            type="number",
            description="Line number to start from",
            default=0,
            min_value=0,
        ),
        ToolParameter(
            name="limit",
            type="number",
            description="Number of lines to read",
            default=1000,
            min_value=1,
            max_value=10000,
        ),
    ]

    async def execute(self, params: dict) -> ToolResult:
        file_path = params["file_path"]
        offset = params.get("offset", 0)
        limit = params.get("limit", 1000)

        await self._emit_progress(ToolStatus.RUNNING, f"Reading {file_path}")

        try:
            if not os.path.exists(file_path):
                return ToolResult(
                    success=False, output="", error=f"File not found: {file_path}"
                )

            with open(file_path, "r", encoding="utf-8") as f:
                lines = f.readlines()[offset : offset + limit]

            numbered = "\n".join(
                f"{i + offset + 1}: {line.rstrip()}" for i, line in enumerate(lines)
            )

            return ToolResult(
                success=True,
                output=numbered,
                metadata={"lines": len(lines), "path": file_path},
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))


@tool_registry.register
class GrepTool(BaseTool):
    """正则搜索工具"""

    name = "Grep"
    description = "Search for patterns in files"
    parameters = [
        ToolParameter(
            name="pattern",
            type="string",
            description="Regex pattern to search for",
            required=True,
        ),
        ToolParameter(
            name="path",
            type="string",
            description="Directory to search in",
            default=".",
        ),
        ToolParameter(
            name="file_pattern",
            type="string",
            description="File name pattern (e.g., *.py)",
            default=None,
        ),
        ToolParameter(
            name="case_insensitive",
            type="boolean",
            description="Case insensitive search",
            default=True,
        ),
    ]

    async def execute(self, params: dict) -> ToolResult:
        import glob

        pattern = params["pattern"]
        path = params.get("path", ".")
        file_pattern = params.get("file_pattern")
        case_insensitive = params.get("case_insensitive", True)

        flags = re.IGNORECASE if case_insensitive else 0
        regex = re.compile(pattern, flags)

        results = []
        files_searched = 0

        if file_pattern:
            files = glob.glob(os.path.join(path, "**", file_pattern), recursive=True)
        else:
            files = glob.glob(os.path.join(path, "**", "*"), recursive=True)

        for file_path in files[:100]:
            if not os.path.isfile(file_path):
                continue

            files_searched += 1

            try:
                with open(file_path, "r", errors="ignore") as f:
                    for i, line in enumerate(f, 1):
                        if regex.search(line):
                            results.append(
                                {"file": file_path, "line": i, "content": line.rstrip()}
                            )
            except Exception:
                continue

        output = "\n".join(
            f"{r['file']}:{r['line']}: {r['content']}" for r in results[:50]
        )

        return ToolResult(
            success=True,
            output=output or "No matches found",
            metadata={"matches": len(results), "files_searched": files_searched},
        )


@tool_registry.register
class BashTool(BaseTool):
    """Shell 执行工具"""

    name = "Bash"
    description = "Execute shell commands"
    parameters = [
        ToolParameter(
            name="command",
            type="string",
            description="Command to execute",
            required=True,
        ),
        ToolParameter(
            name="timeout",
            type="number",
            description="Timeout in seconds",
            default=30,
            min_value=1,
            max_value=300,
        ),
    ]

    async def execute(self, params: dict) -> ToolResult:
        import subprocess
        import shlex

        command = params["command"]
        timeout = params.get("timeout", 30)

        allowed_commands = {
            "ls",
            "cat",
            "head",
            "tail",
            "grep",
            "find",
            "pwd",
            "echo",
            "date",
            "wc",
            "sort",
            "uniq",
        }
        cmd_parts = command.strip().split()
        if cmd_parts and cmd_parts[0] not in allowed_commands:
            return ToolResult(
                success=False,
                output="",
                error=f"Command '{cmd_parts[0]}' not allowed. Use: {', '.join(allowed_commands)}",
            )

        await self._emit_progress(ToolStatus.RUNNING, f"Executing: {command[:50]}...")

        try:
            safe_cmd = shlex.split(command)
            result = subprocess.run(
                safe_cmd, capture_output=True, text=True, timeout=timeout
            )

            return ToolResult(
                success=result.returncode == 0,
                output=result.stdout or result.stderr,
                metadata={"exit_code": result.returncode},
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False, output="", error=f"Command timed out after {timeout}s"
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))


@tool_registry.register
class GlobTool(BaseTool):
    """文件搜索工具"""

    name = "Glob"
    description = "Find files by pattern"
    parameters = [
        ToolParameter(
            name="pattern",
            type="string",
            description="Glob pattern (e.g., **/*.py)",
            required=True,
        ),
        ToolParameter(
            name="path", type="string", description="Base directory", default="."
        ),
    ]

    async def execute(self, params: dict) -> ToolResult:
        import glob

        pattern = params["pattern"]
        path = params.get("path", ".")

        files = glob.glob(os.path.join(path, pattern), recursive=True)

        return ToolResult(
            success=True, output="\n".join(files[:100]), metadata={"count": len(files)}
        )


class ParallelToolExecutor:
    """并行工具执行器 - Claude Code 核心"""

    def __init__(
        self,
        registry: Optional[ToolRegistry] = None,
        max_concurrent: int = 5,
        permission_check: Optional[Callable] = None,
    ):
        self.registry = registry or tool_registry
        self.max_concurrent = max_concurrent
        self.permission_check = permission_check
        self._semaphore = asyncio.Semaphore(max_concurrent)

    async def execute_batch(
        self, tool_calls: list[dict], context: Optional[dict] = None
    ) -> list[ToolResult]:
        """批量执行工具调用"""
        tasks = [self._execute_one(call, context) for call in tool_calls]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        return [
            r
            if isinstance(r, ToolResult)
            else ToolResult(success=False, output="", error=str(r))
            for r in results
        ]

    async def _execute_one(
        self, tool_call: dict, context: Optional[dict]
    ) -> ToolResult:
        """执行单个工具调用"""
        async with self._semaphore:
            name = tool_call.get("name", "")
            params = tool_call.get("params", {}) or tool_call.get("args", {})

            tool = self.registry.get(name)
            if not tool:
                return ToolResult(
                    success=False, output="", error=f"Unknown tool: {name}"
                )

            valid, error = tool.validate_params(params)
            if not valid:
                return ToolResult(
                    success=False, output="", error=f"Invalid params: {error}"
                )

            if self.permission_check:
                allowed = await self.permission_check(name, params, context)
                if not allowed:
                    return ToolResult(
                        success=False, output="", error=f"Permission denied for {name}"
                    )

            try:
                start_time = asyncio.get_event_loop().time()
                result = await tool.execute(params)
                result.execution_time = asyncio.get_event_loop().time() - start_time
                return result
            except Exception as e:
                return ToolResult(
                    success=False, output="", error=f"Execution error: {e}"
                )

    async def execute(
        self, tool_name: str, params: dict, context: Optional[dict] = None
    ) -> ToolResult:
        """执行单个工具"""
        result = await self.execute_batch(
            [{"name": tool_name, "params": params}], context
        )
        return result[0]


def create_tool_executor(
    max_concurrent: int = 5, permission_check: Optional[Callable] = None
) -> ParallelToolExecutor:
    """创建工具执行器"""
    return ParallelToolExecutor(
        registry=tool_registry,
        max_concurrent=max_concurrent,
        permission_check=permission_check,
    )
