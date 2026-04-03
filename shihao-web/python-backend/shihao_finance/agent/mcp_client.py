"""
MCP (Model Context Protocol) 集成模块
基于 Claude Code MCP 协议实现
"""

import asyncio
import json
import logging
from typing import Optional, Any, Callable, Awaitable
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class MCPTransport(Enum):
    """MCP 传输类型"""

    STDIO = "stdio"
    HTTP = "http"
    WEBSOCKET = "websocket"


@dataclass
class MCPTool:
    """MCP 工具定义"""

    name: str
    description: str
    input_schema: dict
    annotations: dict = field(default_factory=dict)


@dataclass
class MCPResource:
    """MCP 资源"""

    uri: str
    name: str
    description: str
    mime_type: Optional[str] = None


@dataclass
class MCPrompt:
    """MCP 提示"""

    name: str
    description: str
    arguments: list = field(default_factory=list)


class MCPClient:
    """MCP 客户端"""

    def __init__(
        self,
        transport: MCPTransport = MCPTransport.STDIO,
        command: Optional[list] = None,
        url: Optional[str] = None,
    ):
        self.transport = transport
        self.command = command
        self.url = url

        self._tools: list[MCPTool] = []
        self._resources: list[MCPResource] = []
        self._prompts: list[MCPrompt] = []
        self._connected = False
        self._process = None
        self._stdin = None
        self._stdout = None

    async def connect(self):
        """连接 MCP 服务器"""
        if self.transport == MCPTransport.STDIO and self.command:
            import asyncio.subprocess as asp

            self._process = await asp.create_subprocess_exec(
                *self.command, stdin=asp.PIPE, stdout=asp.PIPE, stderr=asp.PIPE
            )
            self._stdin = self._process.stdin
            self._stdout = self._process.stdout
            self._connected = True

            await self._initialize()

            logger.info(f"MCP connected: {' '.join(self.command)}")
        else:
            raise NotImplementedError("Only STDIO transport implemented")

    async def disconnect(self):
        """断开连接"""
        if self._process:
            self._process.terminate()
            await self._process.wait()
            self._connected = False

    async def _send_request(self, method: str, params: dict = None) -> dict:
        """发送请求"""
        if not self._connected:
            raise RuntimeError("Not connected to MCP server")

        request = {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or {}}

        self._stdin.write((json.dumps(request) + "\n").encode())
        await self._stdin.drain()

        response_line = await self._stdout.readline()
        response = json.loads(response_line)

        return response.get("result", {})

    async def _initialize(self):
        """初始化"""
        result = await self._send_request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
                "clientInfo": {"name": "shihao-agent", "version": "1.0.0"},
            },
        )

        self._server_capabilities = result.get("capabilities", {})

        await self._send_request("notifications/initialized")

        await self._list_tools()

    async def _list_tools(self):
        """列出工具"""
        result = await self._send_request("tools/list")
        self._tools = [
            MCPTool(
                name=t["name"],
                description=t.get("description", ""),
                input_schema=t.get("inputSchema", {}),
            )
            for t in result.get("tools", [])
        ]

    async def call_tool(self, name: str, arguments: dict = None) -> Any:
        """调用工具"""
        result = await self._send_request(
            "tools/call", {"name": name, "arguments": arguments or {}}
        )
        return result.get("content", [])

    def get_tools(self) -> list[MCPTool]:
        """获取工具列表"""
        return self._tools

    def get_tools_schema(self) -> list[dict]:
        """获取 MCP 格式的工具定义"""
        return [
            {
                "name": tool.name,
                "description": tool.description,
                "inputSchema": tool.input_schema,
            }
            for tool in self._tools
        ]


class MCPServer:
    """MCP 服务器 (简化版)"""

    def __init__(self):
        self._tools: dict[str, Callable] = {}
        self._resources: dict[str, Callable] = {}
        self._prompts: dict[str, Callable] = {}
        self._request_handlers: dict[str, Callable] = {}

    def tool(self, name: str, description: str, input_schema: dict = None):
        """装饰器：注册工具"""

        def decorator(func: Callable):
            self._tools[name] = {
                "handler": func,
                "description": description,
                "inputSchema": input_schema or {},
            }
            return func

        return decorator

    def resource(self, uri_pattern: str):
        """装饰器：注册资源"""

        def decorator(func: Callable):
            self._resources[uri_pattern] = func
            return func

        return decorator

    def prompt(self, name: str, description: str):
        """装饰器：注册提示"""

        def decorator(func: Callable):
            self._prompts[name] = {"handler": func, "description": description}
            return func

        return decorator

    async def handle_request(self, method: str, params: dict = None) -> dict:
        """处理请求"""
        params = params or {}

        if method == "initialize":
            return {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {"listChanged": True},
                    "resources": {"subscribeChanged": True},
                },
                "serverInfo": {"name": "shihao-mcp-server", "version": "1.0.0"},
            }

        elif method == "tools/list":
            return {
                "tools": [
                    {
                        "name": name,
                        "description": tool["description"],
                        "inputSchema": tool["inputSchema"],
                    }
                    for name, tool in self._tools.items()
                ]
            }

        elif method == "tools/call":
            tool_name = params.get("name")
            arguments = params.get("arguments", {})

            if tool_name not in self._tools:
                return {"error": f"Unknown tool: {tool_name}"}

            handler = self._tools[tool_name]["handler"]

            if asyncio.iscoroutinefunction(handler):
                result = await handler(**arguments)
            else:
                result = handler(**arguments)

            return {
                "content": [
                    {
                        "type": "text",
                        "text": str(result)
                        if not isinstance(result, dict)
                        else json.dumps(result),
                    }
                ]
            }

        elif method == "resources/list":
            return {
                "resources": [
                    {"uri": uri, "name": name} for uri in self._resources.keys()
                ]
            }

        elif method == "resources/read":
            uri = params.get("uri")

            for pattern, handler in self._resources.items():
                if self._match_pattern(pattern, uri):
                    result = (
                        await handler(uri)
                        if asyncio.iscoroutinefunction(handler)
                        else handler(uri)
                    )
                    return {
                        "contents": [
                            {
                                "uri": uri,
                                "mimeType": "application/json",
                                "text": json.dumps(result),
                            }
                        ]
                    }

            return {"error": f"Unknown resource: {uri}"}

        return {"error": f"Unknown method: {method}"}

    def _match_pattern(self, pattern: str, uri: str) -> bool:
        """匹配 URI 模式"""
        if pattern == uri:
            return True
        if pattern.endswith("*"):
            return uri.startswith(pattern[:-1])
        return False


class MCPBridge:
    """MCP 桥接器 - 连接本地工具与 MCP"""

    def __init__(self):
        self._servers: dict[str, MCPClient] = {}
        self._local_tools: dict[str, Callable] = {}

    def register_server(self, name: str, client: MCPClient):
        """注册 MCP 服务器"""
        self._servers[name] = client

    def register_local_tool(self, name: str, handler: Callable, schema: dict = None):
        """注册本地工具"""
        self._local_tools[name] = {"handler": handler, "schema": schema or {}}

    async def call_tool(
        self, name: str, arguments: dict = None, server: Optional[str] = None
    ) -> Any:
        """调用工具"""
        arguments = arguments or {}

        if server and server in self._servers:
            return await self._servers[server].call_tool(name, arguments)

        if name in self._local_tools:
            handler = self._local_tools[name]["handler"]
            if asyncio.iscoroutinefunction(handler):
                return await handler(**arguments)
            return handler(**arguments)

        for client in self._servers.values():
            try:
                return await client.call_tool(name, arguments)
            except Exception:
                continue

        raise ValueError(f"Tool not found: {name}")

    def get_all_tools(self) -> list[dict]:
        """获取所有工具 (本地 + MCP)"""
        tools = []

        for name, tool in self._local_tools.items():
            tools.append(
                {
                    "name": name,
                    "source": "local",
                    "description": tool.get("description", ""),
                    "inputSchema": tool.get("schema", {}),
                }
            )

        for server_name, client in self._servers.items():
            for tool in client.get_tools():
                tools.append(
                    {
                        "name": tool.name,
                        "source": f"mcp:{server_name}",
                        "description": tool.description,
                        "inputSchema": tool.input_schema,
                    }
                )

        return tools


def create_mcp_bridge() -> MCPBridge:
    """创建 MCP 桥接器"""
    return MCPBridge()
