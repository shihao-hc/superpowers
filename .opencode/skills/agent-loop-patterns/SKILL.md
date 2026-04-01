---
name: agent-loop-patterns
description: AI Agent 循环执行模式 - 基于 Claude Code 源码分析的流式异步 Agent 架构
category: ai-agent-architecture
source: Claude Code v2.1.88 QueryEngine analysis
version: 1.0
tags:
  - agent
  - async-generator
  - streaming
  - tool-execution
  - state-machine
---

# Agent 循环模式 - 流式异步架构

> 基于 Claude Code QueryEngine (46,000行) 的核心模式提取

## 核心概念

Claude Code 的 Agent 不是简单的 "请求→响应" 模式，而是一个 **持续运行的异步循环**，使用 **async generator** 实现流式输出和工具执行。

```
┌─────────────────────────────────────────────────────────────┐
│                    Agent Loop                               │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  while (needsMoreWork) {                              │  │
│  │    // 1. 流式调用 LLM                                  │  │
│  │    for await (chunk of streamLLM()) { yield chunk; }  │  │
│  │                                                       │  │
│  │    // 2. 检查工具调用                                   │  │
│  │    if (hasToolCalls()) {                              │  │
│  │      // 3. 并行执行工具                                 │  │
│  │      for await (result of executeTools()) { yield; }  │  │
│  │    } else {                                           │  │
│  │      needsMoreWork = false;                           │  │
│  │    }                                                  │  │
│  │  }                                                    │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 模式一：基础流式 Agent

### Python 实现

```python
from typing import AsyncIterator, Any
from dataclasses import dataclass
from enum import Enum

class EventType(Enum):
    TEXT = "text"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    COMPLETE = "complete"
    ERROR = "error"

@dataclass
class AgentEvent:
    type: EventType
    content: str = ""
    tool_name: str = ""
    tool_args: dict = None
    tool_result: str = ""
    
class StreamingAgent:
    """基础流式 Agent - Claude Code 核心模式"""
    
    def __init__(self, llm_client, tools: dict):
        self.llm = llm_client
        self.tools = tools
        self.messages: list[dict] = []
    
    async def run(self, user_message: str) -> AsyncIterator[AgentEvent]:
        """运行 Agent 循环，流式返回事件"""
        
        # 添加用户消息
        self.messages.append({"role": "user", "content": user_message})
        
        while True:
            # 1. 流式调用 LLM
            response_content = ""
            tool_calls = []
            
            async for chunk in self.llm.stream(self.messages):
                if chunk.type == "text":
                    response_content += chunk.content
                    yield AgentEvent(type=EventType.TEXT, content=chunk.content)
                elif chunk.type == "tool_call":
                    tool_calls.append(chunk)
                    yield AgentEvent(
                        type=EventType.TOOL_CALL,
                        tool_name=chunk.name,
                        tool_args=chunk.args
                    )
            
            # 添加助手响应到历史
            self.messages.append({
                "role": "assistant",
                "content": response_content,
                "tool_calls": tool_calls
            })
            
            # 2. 如果没有工具调用，任务完成
            if not tool_calls:
                yield AgentEvent(type=EventType.COMPLETE)
                return
            
            # 3. 并行执行工具
            for result in await self._execute_tools_parallel(tool_calls):
                self.messages.append({
                    "role": "tool",
                    "tool_call_id": result.id,
                    "content": result.output
                })
                yield AgentEvent(
                    type=EventType.TOOL_RESULT,
                    tool_name=result.name,
                    tool_result=result.output
                )
    
    async def _execute_tools_parallel(self, tool_calls: list) -> list:
        """并行执行多个工具调用"""
        import asyncio
        
        tasks = [
            self._execute_single_tool(call)
            for call in tool_calls
        ]
        return await asyncio.gather(*tasks)
    
    async def _execute_single_tool(self, tool_call) -> Any:
        """执行单个工具"""
        tool = self.tools.get(tool_call.name)
        if not tool:
            return ToolResult(error=f"Unknown tool: {tool_call.name}")
        
        try:
            result = await tool.execute(tool_call.args)
            return ToolResult(id=tool_call.id, name=tool_call.name, output=result)
        except Exception as e:
            return ToolResult(id=tool_call.id, name=tool_call.name, output=f"Error: {e}")
```

---

## 模式二：状态机 Agent

### 使用状态机管理复杂流程

```python
from enum import Enum, auto
from dataclasses import dataclass
from typing import Optional

class AgentState(Enum):
    IDLE = auto()
    THINKING = auto()
    EXECUTING_TOOL = auto()
    WAITING_INPUT = auto()
    COMPACTING = auto()
    COMPLETE = auto()
    ERROR = auto()

@dataclass
class AgentContext:
    """Agent 上下文 - 贯穿整个会话"""
    task: str
    messages: list[dict]
    state: AgentState = AgentState.IDLE
    tools_used: list[str] = None
    error_count: int = 0
    max_errors: int = 3
    
    def __post_init__(self):
        if self.tools_used is None:
            self.tools_used = []

class StateMachineAgent:
    """状态机驱动的 Agent"""
    
    def __init__(self, llm_client, tools: dict):
        self.llm = llm_client
        self.tools = tools
        self.state_handlers = {
            AgentState.THINKING: self._handle_thinking,
            AgentState.EXECUTING_TOOL: self._handle_executing_tool,
            AgentState.WAITING_INPUT: self._handle_waiting_input,
            AgentState.COMPACTING: self._handle_compacting,
        }
    
    async def run(self, task: str) -> AgentResult:
        """主运行循环"""
        context = AgentContext(
            task=task,
            messages=[{"role": "user", "content": task}]
        )
        
        while context.state != AgentState.COMPLETE:
            handler = self.state_handlers.get(context.state)
            if handler:
                await handler(context)
            else:
                break
        
        return AgentResult(
            success=context.state == AgentState.COMPLETE,
            messages=context.messages,
            tools_used=context.tools_used
        )
    
    async def _handle_thinking(self, context: AgentContext):
        """思考状态 - 调用 LLM"""
        response = await self.llm.complete(context.messages)
        
        if response.tool_calls:
            context.pending_tool_calls = response.tool_calls
            context.state = AgentState.EXECUTING_TOOL
        elif response.needs_input:
            context.state = AgentState.WAITING_INPUT
        else:
            context.state = AgentState.COMPLETE
        
        context.messages.append({
            "role": "assistant",
            "content": response.content
        })
    
    async def _handle_executing_tool(self, context: AgentContext):
        """执行工具状态"""
        for call in context.pending_tool_calls:
            result = await self._execute_tool(call)
            context.tools_used.append(call.name)
            context.messages.append({
                "role": "tool",
                "tool_call_id": call.id,
                "content": result
            })
        
        # 检查是否需要压缩
        if self._should_compact(context):
            context.state = AgentState.COMPACTING
        else:
            context.state = AgentState.THINKING
    
    async def _handle_compacting(self, context: AgentContext):
        """压缩上下文状态"""
        compacted = await self._compact_context(context.messages)
        context.messages = compacted
        context.state = AgentState.THINKING
```

---

## 模式三：流式工具执行

### Claude Code 独创：边生成边执行

```python
class StreamingToolExecutor:
    """流式工具执行器 - Claude Code 核心创新"""
    
    def __init__(self, tools: dict):
        self.tools = tools
        self._pending: dict[str, asyncio.Task] = {}
        self._completed: dict[str, ToolResult] = {}
    
    async def stream_and_execute(
        self,
        llm_stream: AsyncIterator[str],
        tool_parser: ToolParser
    ) -> AsyncIterator[StreamEvent]:
        """
        一边流式接收 LLM 输出，一边开始执行已识别的工具
        
        核心思想：当 LLM 还在说 "让我检查那个文件" 时，
        文件已经在读取了。等 LLM 说完，结果已经准备好。
        """
        
        buffer = ""
        
        async for chunk in llm_stream:
            buffer += chunk
            
            # 检查是否有完整的工具调用
            while tool_call := tool_parser.try_parse(buffer):
                # 立即开始执行，不等待 LLM 完成
                task = asyncio.create_task(
                    self._execute_tool(tool_call)
                )
                self._pending[tool_call.id] = task
                buffer = ""
            
            # 如果有已完成的工具结果，立即返回
            for tool_id, task in list(self._pending.items()):
                if task.done():
                    result = await task
                    self._completed[tool_id] = result
                    del self._pending[tool_id]
                    yield StreamEvent(type="tool_result", data=result)
            
            # 返回文本内容
            yield StreamEvent(type="text", data=chunk)
        
        # 等待所有剩余工具完成
        for tool_id, task in self._pending.items():
            result = await task
            yield StreamEvent(type="tool_result", data=result)
```

---

## 模式四：Sub-Agent 生成

### Claude Code 的上下文隔离策略

```python
class SubAgentManager:
    """子代理管理器 - Claude Code 模式"""
    
    def __init__(self, agent_factory):
        self.agent_factory = agent_factory
    
    async def execute_task(
        self,
        main_context: list[dict],
        task_description: str,
        specialist_role: str = "general"
    ) -> str:
        """
        在子上下文中执行独立任务
        
        优势：
        1. 主上下文不被 "脏数据" 污染
        2. 子任务失败不影响主任务
        3. 主上下文只保留最终结果
        """
        
        # 1. 从主上下文中提取任务相关信息
        task_context = self._extract_relevant_context(
            main_context, 
            task_description
        )
        
        # 2. 创建子代理（独立上下文）
        sub_agent = self.agent_factory.create(
            role=specialist_role,
            context=[]  # 空的独立上下文
        )
        
        # 3. 在子上下文中执行任务
        result = await sub_agent.run(
            task=task_description,
            initial_context=task_context
        )
        
        # 4. 只返回结果，不返回中间过程
        return result.summary  # 只有摘要，没有完整对话历史
    
    def _extract_relevant_context(
        self, 
        main_context: list[dict], 
        task: str
    ) -> list[dict]:
        """提取与任务相关的上下文"""
        relevant = []
        
        # 提取任务描述
        relevant.append({"role": "user", "content": task})
        
        # 提取相关文件路径
        for msg in main_context:
            if self._is_relevant(msg, task):
                relevant.append(self._summarize(msg))
        
        return relevant
```

---

## 模式五：异步生成器组合

### 组合多个异步流

```python
from typing import AsyncIterator
import asyncio

class AgentOrchestrator:
    """Agent 编排器 - 组合多个异步流"""
    
    async def run_parallel(
        self,
        agents: list[StreamingAgent],
        task: str
    ) -> AsyncIterator[AgentEvent]:
        """并行运行多个 Agent，合并输出"""
        
        # 创建多个异步迭代器
        streams = [agent.run(task) for agent in agents]
        
        # 使用 asyncio.as_completed 获取完成的流
        pending = [asyncio.create_task(self._anext(s)) for s in streams]
        
        while pending:
            done, pending = await asyncio.wait(
                pending, 
                return_when=asyncio.FIRST_COMPLETED
            )
            
            for task in done:
                try:
                    event = task.result()
                    yield event
                    
                    # 重新添加流到 pending
                    stream_idx = self._find_stream_index(task, streams)
                    if stream_idx is not None:
                        pending.add(
                            asyncio.create_task(self._anext(streams[stream_idx]))
                        )
                except StopAsyncIteration:
                    pass
    
    async def _anext(self, stream):
        return await stream.__anext__()
```

---

## 实战示例

### 完整的 Agent 实现

```python
from typing import AsyncIterator, Optional
from dataclasses import dataclass

@dataclass
class AgentConfig:
    max_iterations: int = 50
    max_tools_per_turn: int = 10
    enable_streaming: bool = True
    context_limit: int = 100000

class ClaudeStyleAgent:
    """Claude Code 风格的完整 Agent 实现"""
    
    def __init__(
        self,
        llm_client,
        tools: dict[str, "Tool"],
        config: Optional[AgentConfig] = None
    ):
        self.llm = llm_client
        self.tools = tools
        self.config = config or AgentConfig()
        self.history: list[dict] = []
        self.iteration = 0
    
    async def chat(self, message: str) -> AsyncIterator[str]:
        """聊天接口 - 流式返回"""
        
        # 添加系统提示
        if not self.history:
            self.history.append({
                "role": "system",
                "content": self._build_system_prompt()
            })
        
        # 添加用户消息
        self.history.append({"role": "user", "content": message})
        
        # Agent 循环
        while self.iteration < self.config.max_iterations:
            self.iteration += 1
            
            # 流式调用 LLM
            full_response = ""
            tool_calls = []
            
            async for event in self._stream_llm():
                if event.type == "text":
                    full_response += event.content
                    yield event.content
                elif event.type == "tool_call":
                    tool_calls.append(event)
            
            # 添加到历史
            self.history.append({
                "role": "assistant",
                "content": full_response,
                "tool_calls": [tc.to_dict() for tc in tool_calls]
            })
            
            # 如果没有工具调用，退出循环
            if not tool_calls:
                break
            
            # 执行工具并添加结果
            for result in await self._execute_tools(tool_calls):
                self.history.append({
                    "role": "tool",
                    "tool_call_id": result.id,
                    "content": result.output
                })
                yield f"\n[Tool: {result.name}] {result.output[:100]}...\n"
            
            # 检查是否需要压缩
            if self._should_compact():
                self.history = await self._compact_context()
    
    def _build_system_prompt(self) -> str:
        """构建系统提示"""
        tool_descriptions = "\n".join([
            f"- {name}: {tool.description}"
            for name, tool in self.tools.items()
        ])
        
        return f"""You are a helpful AI assistant with access to tools.

Available tools:
{tool_descriptions}

Guidelines:
1. Use tools when needed to complete the task
2. Be concise in your responses
3. Verify results before declaring success
4. Break complex tasks into smaller steps

Current date: {datetime.now().isoformat()}
Working directory: {os.getcwd()}"""
```

---

## 使用示例

```python
# 创建 Agent
agent = ClaudeStyleAgent(
    llm_client=llm,
    tools={
        "read_file": ReadFileTool(),
        "write_file": WriteFileTool(),
        "execute": ExecuteTool(),
        "search": SearchTool(),
    }
)

# 流式使用
async for chunk in agent.chat("分析项目结构并生成报告"):
    print(chunk, end="", flush=True)
```

---

## 关键要点

| 要点 | 说明 |
|------|------|
| **Async Generator** | 使用 `async for` 实现流式输出 |
| **并行工具执行** | `asyncio.gather()` 同时执行多个工具 |
| **状态管理** | 维护 messages 列表作为对话历史 |
| **上下文压缩** | 达到限制时自动压缩历史 |
| **Sub-Agent** | 独立上下文执行子任务 |

## 相关技能

- `context-management` - 上下文压缩策略
- `permission-system` - 权限控制系统
- `claude-code-architecture` - 完整架构分析
