import os
import json
from typing import AsyncIterator, Optional, Any
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
import asyncio

from shihao_finance.agent.memory.core import CoreMemory
from shihao_finance.agent.memory.recall import RecallMemory
from shihao_finance.agent.memory.archival import ArchivalMemory
from shihao_finance.agent.commands import (
    CommandHandler,
    create_default_registry,
    CommandResult,
)
from shihao_finance.agent.permission import PermissionManager, PermissionMode


class EventType(Enum):
    """Agent事件类型 - 对应 Claude Code 流式输出"""

    TEXT = "text"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    COMPLETE = "complete"
    ERROR = "error"
    THINKING = "thinking"


@dataclass
class AgentEvent:
    """Agent事件 - 流式输出的基本单元"""

    type: EventType
    content: str = ""
    tool_name: str = ""
    tool_args: dict = field(default_factory=dict)
    tool_result: str = ""
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "type": self.type.value,
            "content": self.content,
            "tool_name": self.tool_name,
            "tool_args": self.tool_args,
            "tool_result": self.tool_result,
            "error": self.error,
        }


class ToolDefinition:
    """工具定义 - 类似 Claude Code 的工具注册"""

    def __init__(self, name: str, description: str, parameters: dict = None):
        self.name = name
        self.description = description
        self.parameters = parameters or {}

    def validate_args(self, args: dict) -> bool:
        """验证工具参数"""
        required = self.parameters.get("required", [])
        for req in required:
            if req not in args:
                return False
        return True


class AgentMemory:
    """记忆管理器"""

    def __init__(self, archival_db_path: str = None):
        self.core = CoreMemory()
        self.recall = RecallMemory()
        self.archival = ArchivalMemory(db_path=archival_db_path)
        self._initialized = False

    async def initialize(self):
        """初始化所有记忆层"""
        await self.recall.initialize()
        await self.archival.initialize()
        self._initialized = True

    async def cleanup(self):
        """清理资源"""
        await self.recall.cleanup()
        await self.archival.cleanup()
        self._initialized = False


class StreamingLLMClient:
    """流式LLM客户端 - 可替换为实际实现"""

    def __init__(self, provider: str = "ollama", model: str = "llama3"):
        self.provider = provider
        self.model = model

    async def stream(self, messages: list[dict]) -> AsyncIterator[dict]:
        """
        流式生成 - 模拟实现
        实际使用时替换为真实的 LLM API 调用
        """
        # 模拟流式输出
        response = "这是模拟的流式响应..."

        for char in response:
            yield {"type": "text", "content": char}
            await asyncio.sleep(0.01)

    async def chat(self, messages: list[dict]) -> str:
        """非流式调用"""
        return "这是响应内容"


class ToolExecutor:
    """工具执行器 - 类似 Claude Code 的并行工具执行"""

    def __init__(self):
        self.tools: dict[str, ToolDefinition] = {}
        self._handlers: dict[str, callable] = {}

    def register_tool(self, tool: ToolDefinition, handler: callable):
        """注册工具"""
        self.tools[tool.name] = tool
        self._handlers[tool.name] = handler

    async def execute(self, tool_name: str, args: dict) -> str:
        """执行工具"""
        if tool_name not in self.tools:
            return f"Error: Tool '{tool_name}' not found"

        tool = self.tools[tool_name]
        if not tool.validate_args(args):
            return f"Error: Invalid arguments for tool '{tool_name}'"

        handler = self._handlers.get(tool_name)
        if handler:
            try:
                result = await handler(args)
                return json.dumps(result) if isinstance(result, dict) else str(result)
            except Exception as e:
                return f"Error executing tool: {str(e)}"

        return f"Tool '{tool_name}' executed (no handler)"

    async def execute_parallel(self, tool_calls: list[dict]) -> list[dict]:
        """并行执行多个工具 - Claude Code 核心模式"""
        tasks = []
        for call in tool_calls:
            tasks.append(self.execute(call["name"], call.get("args", {})))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        return [
            {
                "tool": call["name"],
                "result": str(r),
                "error": str(r) if isinstance(r, Exception) else None,
            }
            for call, r in zip(tool_calls, results)
        ]


class ShiHaoAgent:
    """
    拾号金融AI Agent - 增强版流式Agent

    基于 Claude Code QueryEngine 模式，支持：
    - 流式输出 (streaming)
    - 工具并行执行
    - 状态机管理
    - 事件驱动架构
    """

    def __init__(self, config: dict = None):
        self.config = config or {}

        # 记忆系统
        self.memory = AgentMemory(archival_db_path=self.config.get("archival_db_path"))

        # LLM 客户端
        self.llm_provider = self.config.get("llm_provider", "ollama")
        self.llm_model = self.config.get(
            "llm_model", os.getenv("OLLAMA_MODEL", "llama3")
        )
        self.llm_client = StreamingLLMClient(self.llm_provider, self.llm_model)

        # 工具系统
        self.tool_executor = ToolExecutor()

        # 命令系统
        self.command_registry = create_default_registry()
        self.command_handler = CommandHandler(self.command_registry)

        # 权限系统
        self.permissions = PermissionManager(mode=PermissionMode.DEFAULT)

        # 消息历史
        self.messages: list[dict] = []

        # 配置
        self.max_iterations = self.config.get("max_iterations", 10)
        self._initialized = False

    async def initialize(self):
        """初始化Agent"""
        await self.memory.initialize()

        # 注册默认工具
        self._register_default_tools()

        self._initialized = True
        print(f"[ShiHaoAgent] Initialized with streaming support")
        print(f"[ShiHaoAgent] Provider: {self.llm_provider}, Model: {self.llm_model}")
        print(
            f"[ShiHaoAgent] Tools registered: {list(self.tool_executor.tools.keys())}"
        )

    def _register_default_tools(self):
        """注册默认工具"""

        # 示例工具：搜索
        search_tool = ToolDefinition(
            name="search",
            description="搜索金融信息",
            parameters={
                "type": "object",
                "properties": {"query": {"type": "string"}},
                "required": ["query"],
            },
        )
        self.tool_executor.register_tool(search_tool, self._handle_search)

        # 示例工具：计算
        calc_tool = ToolDefinition(
            name="calculate",
            description="执行金融计算",
            parameters={
                "type": "object",
                "properties": {"expression": {"type": "string"}},
                "required": ["expression"],
            },
        )
        self.tool_executor.register_tool(calc_tool, self._handle_calculate)

        # 示例工具：获取时间
        time_tool = ToolDefinition(name="get_time", description="获取当前时间")
        self.tool_executor.register_tool(time_tool, self._handle_get_time)

    async def _handle_search(self, args: dict) -> dict:
        """搜索处理"""
        return {"results": f"搜索: {args.get('query', '')}", "count": 0}

    async def _handle_calculate(self, args: dict) -> dict:
        """计算处理 - 使用安全计算器"""
        try:
            import ast

            expr = args.get("expression", "0")

            def safe_eval(node):
                if isinstance(node, ast.Num):
                    return node.n
                elif isinstance(node, ast.BinOp):
                    left = safe_eval(node.left)
                    right = safe_eval(node.right)
                    if isinstance(left, (int, float)) and isinstance(
                        right, (int, float)
                    ):
                        if isinstance(node.op, ast.Add):
                            return left + right
                        elif isinstance(node.op, ast.Sub):
                            return left - right
                        elif isinstance(node.op, ast.Mult):
                            return left * right
                        elif isinstance(node.op, ast.Div):
                            return left / right if right != 0 else 0
                return 0

            tree = ast.parse(expr, mode="eval")
            result = safe_eval(tree.body)
            return {"expression": expr, "result": result}
        except Exception as e:
            return {"error": f"计算错误: {str(e)}"}

    async def _handle_get_time(self, args: dict) -> dict:
        """获取时间"""
        return {"time": datetime.now().isoformat()}

    async def cleanup(self):
        """清理资源"""
        await self.memory.cleanup()
        self._initialized = False

    def _ensure_initialized(self):
        if not self._initialized:
            raise RuntimeError("ShiHaoAgent not initialized. Call initialize() first.")

    # ========== 核心流式循环 - Claude Code 模式 ==========

    async def run_stream(self, user_message: str) -> AsyncIterator[AgentEvent]:
        """
        流式运行Agent - 核心模式来自 Claude Code QueryEngine

        工作流程:
        1. 检查命令 (以 / 开头)
        2. 流式调用 LLM
        3. 检查工具调用
        4. 并行执行工具
        5. 将结果返回给 LLM
        6. 重复直到完成
        """
        self._ensure_initialized()

        # 检查是否是命令
        if user_message.startswith("/"):
            context = {
                "messages": self.messages,
                "command_registry": self.command_registry,
                "permissions": self.permissions,
                "context_manager": self.config.get("context_manager"),
                "agent": self,
                "config": self.config,
            }
            result = await self.command_handler.handle(user_message, context)

            if result:
                yield AgentEvent(
                    type=EventType.TEXT if result.success else EventType.ERROR,
                    content=result.output,
                )
                yield AgentEvent(type=EventType.COMPLETE, content=result.output)
                return

        # 添加用户消息
        self.messages.append({"role": "user", "content": user_message})

        iteration = 0

        while iteration < self.max_iterations:
            iteration += 1

            # 流式调用 LLM
            response_content = ""
            tool_calls = []

            async for chunk in self.llm_client.stream(self.messages):
                if chunk.get("type") == "text":
                    content = chunk.get("content", "")
                    response_content += content
                    yield AgentEvent(type=EventType.TEXT, content=content)
                elif chunk.get("type") == "tool_call":
                    tool_calls.append(chunk.get("tool_call"))
                    yield AgentEvent(
                        type=EventType.TOOL_CALL,
                        tool_name=chunk.get("tool_call", {}).get("name", ""),
                        tool_args=chunk.get("tool_call", {}).get("args", {}),
                    )

            # 添加助手响应到历史
            self.messages.append(
                {
                    "role": "assistant",
                    "content": response_content,
                    "tool_calls": tool_calls if tool_calls else None,
                }
            )

            # 检查是否有工具调用
            if not tool_calls:
                # 没有工具调用，任务完成
                yield AgentEvent(type=EventType.COMPLETE, content=response_content)
                break

            # 权限检查 + 并行执行工具
            approved_calls = []
            for call in tool_calls:
                tool_name = call.get("name", "")
                tool_args = call.get("args", {})

                decision = await self.permissions.check_permission(
                    tool_name=tool_name, action="execute", parameters=tool_args
                )

                if decision.granted:
                    approved_calls.append(call)
                else:
                    yield AgentEvent(
                        type=EventType.ERROR,
                        content=f"Permission denied for {tool_name}: {decision.reason}",
                    )

            # 执行批准的工具
            if approved_calls:
                tool_results = await self.tool_executor.execute_parallel(approved_calls)

            # 记录工具结果
            for result in tool_results:
                yield AgentEvent(
                    type=EventType.TOOL_RESULT,
                    tool_name=result["tool"],
                    tool_result=result["result"],
                )

                # 将工具结果添加到消息历史
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": result["tool"],
                        "content": result["result"],
                    }
                )

        if iteration >= self.max_iterations:
            yield AgentEvent(
                type=EventType.ERROR,
                content=f"Max iterations ({self.max_iterations}) reached",
            )

    async def run(self, user_message: str) -> dict:
        """
        非流式运行 - 返回完整结果
        """
        events = []

        async for event in self.run_stream(user_message):
            events.append(event)

        # 返回最后一个文本事件的内容
        for event in reversed(events):
            if event.type == EventType.TEXT:
                return {
                    "content": event.content,
                    "events": [e.to_dict() for e in events],
                }

        return {"content": "", "events": [e.to_dict() for e in events]}

    # ========== 原有接口保持兼容 ==========

    def get_context(self) -> str:
        """获取当前上下文 (Core Memory编译)"""
        return self.memory.core.compile()

    async def update_core_memory(self, label: str, value: str):
        """更新核心记忆"""
        self.memory.core.update_block(label, value)

    async def recall_search(
        self, query: str, user_id: str, limit: int = 10
    ) -> list[dict]:
        """搜索会话记忆"""
        return await self.memory.recall.search(query, user_id, limit)

    async def add_recall_memory(
        self, text: str, user_id: str, categories: list[str] = None
    ):
        """添加会话记忆"""
        return await self.memory.recall.add(text, user_id, categories=categories)

    async def archive_document(
        self,
        title: str,
        content: str,
        doc_type: str = "general",
        tags: list[str] = None,
    ):
        """归档文档"""
        return await self.memory.archival.add(title, content, doc_type, tags)

    async def search_archive(self, query: str, limit: int = 10) -> list[dict]:
        """搜索归档"""
        return await self.memory.archival.search(query, limit)

    def register_tool(self, tool: ToolDefinition, handler: callable):
        """注册自定义工具"""
        self.tool_executor.register_tool(tool, handler)


# 使用示例
async def main():
    agent = ShiHaoAgent(
        {"llm_provider": "ollama", "llm_model": "llama3", "max_iterations": 5}
    )

    await agent.initialize()

    print("\n=== 流式测试 ===")
    async for event in agent.run_stream("帮我搜索最新的科技股新闻"):
        if event.type == EventType.TEXT:
            print(f"TEXT: {event.content}", end="")
        elif event.type == EventType.TOOL_CALL:
            print(f"\nTOOL_CALL: {event.tool_name}")
        elif event.type == EventType.TOOL_RESULT:
            print(f"TOOL_RESULT: {event.tool_result}")
        elif event.type == EventType.COMPLETE:
            print(f"\nCOMPLETE")

    print("\n=== 非流式测试 ===")
    result = await agent.run("计算 10 + 20")
    print(f"Result: {result['content']}")

    await agent.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
