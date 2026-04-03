"""
内置 MCP 工具
提供常用工具的 MCP 协议封装
"""

import os
import json
import logging
from typing import Any, Optional
from shihao_finance.agent.mcp_client import MCPServer, MCPrompt, MCPResource
from shihao_finance.agent.tool_manager import tool_registry

logger = logging.getLogger(__name__)


def create_mcp_server() -> MCPServer:
    """创建内置 MCP 服务器"""
    server = MCPServer()

    @server.tool(
        name="read_file",
        description="Read contents of a file",
        input_schema={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path to file"},
                "offset": {"type": "number", "description": "Line offset"},
                "limit": {"type": "number", "description": "Line limit"},
            },
            "required": ["path"],
        },
    )
    async def read_file(path: str, offset: int = 0, limit: int = 1000) -> dict:
        """读取文件"""
        try:
            with open(path, "r", encoding="utf-8") as f:
                lines = f.readlines()[offset : offset + limit]
            return {"success": True, "content": "".join(lines), "lines": len(lines)}
        except FileNotFoundError:
            return {"success": False, "error": f"File not found: {path}"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @server.tool(
        name="list_directory",
        description="List files in a directory",
        input_schema={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path"},
            },
            "required": ["path"],
        },
    )
    async def list_directory(path: str) -> dict:
        """列出目录"""
        try:
            files = []
            for item in os.listdir(path):
                full_path = os.path.join(path, item)
                files.append(
                    {
                        "name": item,
                        "type": "dir" if os.path.isdir(full_path) else "file",
                        "size": os.path.getsize(full_path)
                        if os.path.isfile(full_path)
                        else 0,
                    }
                )
            return {"success": True, "files": files}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @server.tool(
        name="search_code",
        description="Search for text in files",
        input_schema={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "path": {"type": "string", "description": "Directory to search"},
                "file_pattern": {"type": "string", "description": "File pattern"},
            },
            "required": ["query"],
        },
    )
    async def search_code(
        query: str, path: str = ".", file_pattern: str = None
    ) -> dict:
        """搜索代码"""
        import glob
        import re

        results = []
        pattern = re.compile(query, re.IGNORECASE)

        files = glob.glob(
            os.path.join(path, "**", file_pattern or "*"), recursive=True
        )[:100]

        for filepath in files:
            if not os.path.isfile(filepath):
                continue
            try:
                with open(filepath, "r", errors="ignore") as f:
                    for i, line in enumerate(f, 1):
                        if pattern.search(line):
                            results.append(
                                {"file": filepath, "line": i, "content": line.strip()}
                            )
            except:
                continue

        return {"success": True, "results": results[:50]}

    @server.tool(
        name="get_time",
        description="Get current time",
        input_schema={"type": "object", "properties": {}},
    )
    async def get_time() -> dict:
        """获取时间"""
        from datetime import datetime

        return {"success": True, "time": datetime.now().isoformat()}

    @server.tool(
        name="calculate",
        description="Perform calculations",
        input_schema={
            "type": "object",
            "properties": {
                "expression": {"type": "string", "description": "Math expression"}
            },
            "required": ["expression"],
        },
    )
    async def calculate(expression: str) -> dict:
        """计算"""
        import ast

        try:
            tree = ast.parse(expression, mode="eval")

            def safe_eval(node):
                if isinstance(node, ast.Num):
                    return node.n
                elif isinstance(node, ast.BinOp):
                    left = safe_eval(node.left)
                    right = safe_eval(node.right)
                    if isinstance(node.op, ast.Add):
                        return left + right
                    elif isinstance(node.op, ast.Sub):
                        return left - right
                    elif isinstance(node.op, ast.Mult):
                        return left * right
                    elif isinstance(node.op, ast.Div):
                        return left / right if right != 0 else 0
                return 0

            result = safe_eval(tree.body)
            return {"success": True, "result": result}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @server.resource("memory://summary")
    async def get_memory_summary() -> dict:
        """获取内存摘要"""
        return {"summary": "Memory summary placeholder"}

    @server.prompt(name="analyze_code", description="Analyze code structure")
    def analyze_code_prompt(code: str) -> str:
        return f"""Analyze this code and provide insights:

{code}

Focus on:
1. Code quality
2. Potential bugs
3. Optimization opportunities
4. Security concerns"""

    return server


def get_mcp_tools_schema() -> list:
    """获取 MCP 工具 schema"""
    server = create_mcp_server()
    return [
        {
            "name": name,
            "description": tool["description"],
            "inputSchema": tool.get("inputSchema", {}),
        }
        for name, tool in server._tools.items()
    ]
