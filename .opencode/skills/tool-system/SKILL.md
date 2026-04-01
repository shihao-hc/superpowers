---
name: tool-system
description: AI Agent 工具系统架构 - Zod验证、并行执行、进度流、工具注册
category: ai-agent-architecture
source: Claude Code 40+ tools analysis
version: 1.0
tags:
  - tools
  - validation
  - parallel-execution
  - streaming
  - mcp
---

# 工具系统架构 - Claude Code 模式

> Claude Code 40+ 工具的设计模式与实现

## 工具架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                    Tool System                              │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Tool Registry                      │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │  │
│  │  │  Read   │ │  Write  │ │  Bash   │ │  Grep   │    │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │  │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐    │  │
│  │  │  Glob   │ │  Agent  │ │   MCP   │ │ WebFetch│    │  │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘    │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│  ┌────────────────────────▼─────────────────────────────┐  │
│  │                   Tool Pipeline                      │  │
│  │  Validation → Permission → Execute → Render          │  │
│  └──────────────────────────────────────────────────────┘  │
│                           │                                 │
│  ┌────────────────────────▼─────────────────────────────┐  │
│  │                 Streaming Results                    │  │
│  │  Progress events → Partial results → Final output    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心实现

### 1. 工具基类

```python
from typing import Any, Optional, AsyncIterator
from dataclasses import dataclass, field
from enum import Enum
from abc import ABC, abstractmethod
import asyncio
import logging

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
    type: str  # string, number, boolean, object, array
    description: str
    required: bool = False
    default: Any = None
    enum: Optional[list] = None
    pattern: Optional[str] = None  # 正则验证
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class BaseTool(ABC):
    """工具基类 - Claude Code 风格"""
    
    name: str = ""
    description: str = ""
    parameters: list[ToolParameter] = []
    
    def __init__(self, config: Optional[dict] = None):
        self.config = config or {}
        self._progress_callback = None
    
    def set_progress_callback(self, callback):
        """设置进度回调"""
        self._progress_callback = callback
    
    async def _emit_progress(
        self, 
        status: ToolStatus, 
        message: str,
        percentage: Optional[int] = None
    ):
        """发送进度事件"""
        if self._progress_callback:
            await self._progress_callback(ToolProgress(
                status=status,
                message=message,
                percentage=percentage
            ))
    
    def validate_params(self, params: dict) -> tuple[bool, Optional[str]]:
        """验证参数 (类似 Zod validation)"""
        for param_def in self.parameters:
            value = params.get(param_def.name)
            
            # 检查必填
            if param_def.required and value is None:
                if param_def.default is None:
                    return False, f"Missing required parameter: {param_def.name}"
                value = param_def.default
            
            if value is None:
                continue
            
            # 类型验证
            if param_def.type == "string" and not isinstance(value, str):
                return False, f"Parameter {param_def.name} must be a string"
            elif param_def.type == "number" and not isinstance(value, (int, float)):
                return False, f"Parameter {param_def.name} must be a number"
            elif param_def.type == "boolean" and not isinstance(value, bool):
                return False, f"Parameter {param_def.name} must be a boolean"
            
            # 枚举验证
            if param_def.enum and value not in param_def.enum:
                return False, f"Parameter {param_def.name} must be one of {param_def.enum}"
            
            # 正则验证
            if param_def.pattern and isinstance(value, str):
                import re
                if not re.match(param_def.pattern, value):
                    return False, f"Parameter {param_def.name} does not match pattern"
            
            # 范围验证
            if isinstance(value, (int, float)):
                if param_def.min_value is not None and value < param_def.min_value:
                    return False, f"Parameter {param_def.name} must be >= {param_def.min_value}"
                if param_def.max_value is not None and value > param_def.max_value:
                    return False, f"Parameter {param_def.name} must be <= {param_def.max_value}"
        
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
```

### 2. 工具注册表

```python
from typing import Type

class ToolRegistry:
    """工具注册表 - 管理所有可用工具"""
    
    def __init__(self):
        self._tools: dict[str, Type[BaseTool]] = {}
        self._instances: dict[str, BaseTool] = {}
    
    def register(self, tool_class: Type[BaseTool]):
        """注册工具类"""
        name = tool_class.name or tool_class.__name__
        self._tools[name] = tool_class
        return tool_class  # 支持装饰器用法
    
    def get(self, name: str, config: Optional[dict] = None) -> Optional[BaseTool]:
        """获取工具实例"""
        if name not in self._tools:
            return None
        
        # 单例模式
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
                ]
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
                }
            }
            for name, cls in self._tools.items()
        ]


# 全局注册表
tool_registry = ToolRegistry()
```

### 3. 并行执行器

```python
class ParallelToolExecutor:
    """并行工具执行器 - Claude Code 核心"""
    
    def __init__(
        self, 
        registry: ToolRegistry,
        max_concurrent: int = 5,
        permission_check = None
    ):
        self.registry = registry
        self.max_concurrent = max_concurrent
        self.permission_check = permission_check
        self._semaphore = asyncio.Semaphore(max_concurrent)
    
    async def execute_batch(
        self,
        tool_calls: list[dict],
        context: Optional[dict] = None
    ) -> list[ToolResult]:
        """
        批量执行工具调用
        
        tool_calls 格式:
        [
            {"name": "Read", "params": {"path": "file.py"}},
            {"name": "Grep", "params": {"pattern": "def "}},
        ]
        """
        tasks = [
            self._execute_one(call, context)
            for call in tool_calls
        ]
        
        return await asyncio.gather(*tasks, return_exceptions=True)
    
    async def _execute_one(
        self,
        tool_call: dict,
        context: Optional[dict]
    ) -> ToolResult:
        """执行单个工具调用"""
        async with self._semaphore:
            name = tool_call["name"]
            params = tool_call.get("params", {})
            
            # 获取工具
            tool = self.registry.get(name)
            if not tool:
                return ToolResult(
                    success=False,
                    output="",
                    error=f"Unknown tool: {name}"
                )
            
            # 验证参数
            valid, error = tool.validate_params(params)
            if not valid:
                return ToolResult(
                    success=False,
                    output="",
                    error=f"Invalid params: {error}"
                )
            
            # 权限检查
            if self.permission_check:
                allowed = await self.permission_check(name, params, context)
                if not allowed:
                    return ToolResult(
                        success=False,
                        output="",
                        error=f"Permission denied for {name}"
                    )
            
            # 执行
            try:
                start_time = asyncio.get_event_loop().time()
                result = await tool.execute(params)
                result.execution_time = asyncio.get_event_loop().time() - start_time
                return result
            except Exception as e:
                return ToolResult(
                    success=False,
                    output="",
                    error=f"Execution error: {e}"
                )
```

### 4. 内置工具示例

```python
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
            pattern=r"^[^/].*"  # 不允许绝对路径
        ),
        ToolParameter(
            name="offset",
            type="number",
            description="Line number to start from",
            default=0,
            min_value=0
        ),
        ToolParameter(
            name="limit",
            type="number",
            description="Number of lines to read",
            default=1000,
            min_value=1,
            max_value=10000
        ),
    ]
    
    async def execute(self, params: dict) -> ToolResult:
        file_path = params["file_path"]
        offset = params.get("offset", 0)
        limit = params.get("limit", 1000)
        
        await self._emit_progress(ToolStatus.RUNNING, f"Reading {file_path}")
        
        try:
            with open(file_path, 'r') as f:
                lines = f.readlines()[offset:offset + limit]
            
            # 添加行号
            numbered = "\n".join(
                f"{i + offset + 1}: {line.rstrip()}"
                for i, line in enumerate(lines)
            )
            
            return ToolResult(
                success=True,
                output=numbered,
                metadata={"lines": len(lines), "path": file_path}
            )
        except FileNotFoundError:
            return ToolResult(
                success=False,
                output="",
                error=f"File not found: {file_path}"
            )


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
            required=True
        ),
        ToolParameter(
            name="path",
            type="string",
            description="Directory to search in",
            default="."
        ),
        ToolParameter(
            name="file_pattern",
            type="string",
            description="File name pattern (e.g., *.py)",
            default=None
        ),
        ToolParameter(
            name="case_insensitive",
            type="boolean",
            description="Case insensitive search",
            default=True
        ),
    ]
    
    async def execute(self, params: dict) -> ToolResult:
        import re
        import os
        import glob as glob_module
        
        pattern = params["pattern"]
        path = params.get("path", ".")
        file_pattern = params.get("file_pattern")
        case_insensitive = params.get("case_insensitive", True)
        
        flags = re.IGNORECASE if case_insensitive else 0
        regex = re.compile(pattern, flags)
        
        results = []
        files_searched = 0
        
        # 查找文件
        if file_pattern:
            files = glob_module.glob(os.path.join(path, "**", file_pattern), recursive=True)
        else:
            files = glob_module.glob(os.path.join(path, "**", "*"), recursive=True)
        
        for file_path in files[:100]:  # 限制文件数量
            if not os.path.isfile(file_path):
                continue
            
            files_searched += 1
            await self._emit_progress(
                ToolStatus.RUNNING, 
                f"Searching {file_path}",
                percentage=min(files_searched * 100 // 100, 100)
            )
            
            try:
                with open(file_path, 'r', errors='ignore') as f:
                    for i, line in enumerate(f, 1):
                        if regex.search(line):
                            results.append({
                                "file": file_path,
                                "line": i,
                                "content": line.rstrip()
                            })
            except Exception:
                continue
        
        # 格式化输出
        output = "\n".join(
            f"{r['file']}:{r['line']}: {r['content']}"
            for r in results[:50]  # 限制结果数量
        )
        
        return ToolResult(
            success=True,
            output=output or "No matches found",
            metadata={
                "matches": len(results),
                "files_searched": files_searched
            }
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
            required=True
        ),
        ToolParameter(
            name="timeout",
            type="number",
            description="Timeout in seconds",
            default=30,
            min_value=1,
            max_value=300
        ),
        ToolParameter(
            name="workdir",
            type="string",
            description="Working directory",
            default="."
        ),
    ]
    
    async def execute(self, params: dict) -> ToolResult:
        import subprocess
        import os
        
        command = params["command"]
        timeout = params.get("timeout", 30)
        workdir = params.get("workdir", ".")
        
        await self._emit_progress(ToolStatus.RUNNING, f"Executing: {command[:50]}...")
        
        try:
            result = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=os.path.abspath(workdir)
            )
            
            return ToolResult(
                success=result.returncode == 0,
                output=result.stdout or result.stderr,
                metadata={
                    "exit_code": result.returncode,
                    "command": command
                }
            )
        except subprocess.TimeoutExpired:
            return ToolResult(
                success=False,
                output="",
                error=f"Command timed out after {timeout}s"
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output="",
                error=str(e)
            )
```

---

## 使用示例

```python
# 创建工具执行器
executor = ParallelToolExecutor(
    registry=tool_registry,
    max_concurrent=5
)

# 并行执行多个工具
results = await executor.execute_batch([
    {"name": "Read", "params": {"file_path": "main.py"}},
    {"name": "Grep", "params": {"pattern": "class.*Agent", "path": "src"}},
    {"name": "Bash", "params": {"command": "ls -la"}},
])

for result in results:
    print(result.output)
```

---

## MCP 工具集成

```python
class MCPToolAdapter(BaseTool):
    """MCP 工具适配器"""
    
    def __init__(self, mcp_client, tool_def: dict):
        super().__init__()
        self.name = tool_def["name"]
        self.description = tool_def["description"]
        self.client = mcp_client
        
        # 从 MCP schema 转换参数
        schema = tool_def.get("inputSchema", {})
        self.parameters = self._parse_schema(schema)
    
    def _parse_schema(self, schema: dict) -> list[ToolParameter]:
        """解析 JSON Schema 为 ToolParameter"""
        params = []
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        
        for name, prop in properties.items():
            params.append(ToolParameter(
                name=name,
                type=prop.get("type", "string"),
                description=prop.get("description", ""),
                required=name in required,
                enum=prop.get("enum"),
            ))
        
        return params
    
    async def execute(self, params: dict) -> ToolResult:
        """通过 MCP 客户端执行"""
        try:
            result = await self.client.call_tool(self.name, params)
            return ToolResult(
                success=True,
                output=str(result)
            )
        except Exception as e:
            return ToolResult(
                success=False,
                output="",
                error=str(e)
            )
```

---

## 关键要点

| 要点 | 说明 |
|------|------|
| **Zod 风格验证** | 参数类型、枚举、正则、范围验证 |
| **并行执行** | `asyncio.gather()` + 信号量控制 |
| **进度流** | 异步生成器返回进度事件 |
| **工具注册** | 装饰器注册，统一管理 |
| **MCP 适配** | 标准化接口，支持外部工具 |

## 相关技能

- `mcp-integration` - MCP 协议集成
- `agent-loop-patterns` - Agent 循环模式
- `permission-system` - 权限系统
