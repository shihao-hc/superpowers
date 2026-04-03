"""
子 Agent 上下文隔离系统
基于 Claude Code Fork 子代理模式
"""

import uuid
import logging
from typing import Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from datetime import datetime

logger = logging.getLogger(__name__)


class SubAgentState(Enum):
    """子代理状态"""

    IDLE = "idle"
    RUNNING = "running"
    WAITING = "waiting"
    COMPLETED = "completed"
    ERROR = "error"


@dataclass
class SubAgentContext:
    """子代理上下文"""

    agent_id: str
    name: str
    parent_id: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)

    messages: list[dict] = field(default_factory=list)
    variables: dict[str, Any] = field(default_factory=dict)

    state: SubAgentState = SubAgentState.IDLE
    result: Optional[dict] = None

    max_turns: int = 10
    current_turn: int = 0

    isolation_level: str = "strict"  # strict, moderate, loose

    def can_continue(self) -> bool:
        """检查是否可以继续"""
        return self.current_turn < self.max_turns and self.state != SubAgentState.ERROR

    def add_message(self, role: str, content: str):
        """添加消息"""
        self.messages.append(
            {"role": role, "content": content, "timestamp": datetime.now().isoformat()}
        )
        self.current_turn += 1

    def clear_messages(self):
        """清空消息"""
        self.messages = []
        self.current_turn = 0


class SubAgentPool:
    """子代理池 - 管理多个子代理"""

    def __init__(self, max_agents: int = 10):
        self.max_agents = max_agents
        self._agents: dict[str, SubAgentContext] = {}
        self._parent_map: dict[str, str] = {}

    def create_agent(
        self,
        name: str,
        parent_id: Optional[str] = None,
        isolation_level: str = "strict",
        max_turns: int = 10,
        initial_context: Optional[dict] = None,
    ) -> SubAgentContext:
        """创建子代理"""
        if len(self._agents) >= self.max_agents:
            raise RuntimeError(f"Max agents ({self.max_agents}) reached")

        agent_id = f"subagent_{uuid.uuid4().hex[:8]}"

        context = SubAgentContext(
            agent_id=agent_id,
            name=name,
            parent_id=parent_id,
            isolation_level=isolation_level,
            max_turns=max_turns,
        )

        if initial_context:
            context.messages = initial_context.get("messages", [])
            context.variables = initial_context.get("variables", {})

        self._agents[agent_id] = context

        if parent_id:
            self._parent_map[agent_id] = parent_id

        logger.info(f"Created sub-agent: {agent_id} ({name})")

        return context

    def get_agent(self, agent_id: str) -> Optional[SubAgentContext]:
        """获取子代理"""
        return self._agents.get(agent_id)

    def list_agents(self, parent_id: Optional[str] = None) -> list[SubAgentContext]:
        """列出子代理"""
        if parent_id:
            return [a for a in self._agents.values() if a.parent_id == parent_id]
        return list(self._agents.values())

    def remove_agent(self, agent_id: str) -> bool:
        """移除子代理"""
        if agent_id in self._agents:
            del self._agents[agent_id]
            self._parent_map.pop(agent_id, None)
            logger.info(f"Removed sub-agent: {agent_id}")
            return True
        return False

    def get_active_agents(self) -> list[SubAgentContext]:
        """获取活跃子代理"""
        return [
            a
            for a in self._agents.values()
            if a.state in (SubAgentState.RUNNING, SubAgentState.WAITING)
        ]


class ContextIsolation:
    """上下文隔离器"""

    def __init__(self, isolation_level: str = "strict"):
        self.isolation_level = isolation_level

    def isolate_messages(
        self, parent_messages: list[dict], agent_context: SubAgentContext
    ) -> list[dict]:
        """隔离消息"""

        if self.isolation_level == "strict":
            return self._strict_isolation(parent_messages, agent_context)
        elif self.isolation_level == "moderate":
            return self._moderate_isolation(parent_messages, agent_context)
        else:
            return self._loose_isolation(parent_messages, agent_context)

    def _strict_isolation(
        self, parent_messages: list[dict], agent_context: SubAgentContext
    ) -> list[dict]:
        """严格隔离 - 只保留系统提示"""
        system_messages = [m for m in parent_messages if m.get("role") == "system"]
        return system_messages

    def _moderate_isolation(
        self, parent_messages: list[dict], agent_context: SubAgentContext
    ) -> list[dict]:
        """适度隔离 - 保留系统提示 + 最近N条"""
        system_messages = [m for m in parent_messages if m.get("role") == "system"]

        recent_count = 5
        recent_messages = (
            parent_messages[-recent_count:]
            if len(parent_messages) > recent_count
            else parent_messages
        )

        non_system = [m for m in recent_messages if m.get("role") != "system"]

        return system_messages + non_system

    def _loose_isolation(
        self, parent_messages: list[dict], agent_context: SubAgentContext
    ) -> list[dict]:
        """宽松隔离 - 保留所有系统消息 + 工具调用历史"""
        system_messages = [m for m in parent_messages if m.get("role") == "system"]

        tool_messages = [
            m
            for m in parent_messages
            if m.get("role") in ("tool", "assistant") and m.get("tool_calls")
        ]

        return system_messages + tool_messages[-10:]

    def merge_results(self, agent_result: dict, parent_context: dict) -> dict:
        """合并结果到父上下文"""

        if self.isolation_level == "strict":
            return {
                "summary": agent_result.get("summary", ""),
                "artifacts": [],
            }
        elif self.isolation_level == "moderate":
            return {
                "summary": agent_result.get("summary", ""),
                "artifacts": agent_result.get("artifacts", [])[:3],
                "decisions": agent_result.get("decisions", [])[:5],
            }
        else:
            return {
                "summary": agent_result.get("summary", ""),
                "artifacts": agent_result.get("artifacts", []),
                "decisions": agent_result.get("decisions", []),
                "full_messages": agent_result.get("messages", [])[-20:],
            }


class ForkedSubAgent:
    """
    Fork 子代理 - 基于 Claude Code Fork 模式

    特性:
    1. 独立的执行上下文
    2. 隔离的消息历史
    3. 独立的变量空间
    4. 结果可合并回父代理
    """

    def __init__(
        self,
        name: str,
        parent_agent_id: Optional[str] = None,
        isolation_level: str = "strict",
        max_turns: int = 10,
        executor: Optional[Callable] = None,
    ):
        self.pool = SubAgentPool()

        self._context = self.pool.create_agent(
            name=name,
            parent_id=parent_agent_id,
            isolation_level=isolation_level,
            max_turns=max_turns,
        )

        self._isolation = ContextIsolation(isolation_level)
        self._executor = executor

    @property
    def agent_id(self) -> str:
        return self._context.agent_id

    @property
    def state(self) -> SubAgentState:
        return self._context.state

    async def run(self, task: str, parent_messages: list[dict] = None) -> dict:
        """运行子代理"""

        self._context.state = SubAgentState.RUNNING

        isolated_messages = []
        if parent_messages:
            isolated_messages = self._isolation.isolate_messages(
                parent_messages, self._context
            )

        isolated_messages.append({"role": "user", "content": task})

        self._context.messages = isolated_messages

        result = {
            "agent_id": self.agent_id,
            "name": self._context.name,
            "state": "completed",
            "messages": [],
            "summary": "",
            "artifacts": [],
            "decisions": [],
        }

        if self._executor:
            try:
                async for event in self._executor(isolated_messages):
                    self._context.add_message(
                        event.get("role", "assistant"), event.get("content", "")
                    )

                    result["messages"].append(event)

                    if event.get("type") == "complete":
                        result["summary"] = event.get("content", "")
                        self._context.state = SubAgentState.COMPLETED
                    elif event.get("type") == "error":
                        result["error"] = event.get("error")
                        self._context.state = SubAgentState.ERROR

            except Exception as e:
                logger.error(f"Sub-agent execution error: {e}")
                result["error"] = str(e)
                self._context.state = SubAgentState.ERROR
        else:
            result["summary"] = f"Task completed: {task[:50]}..."
            self._context.state = SubAgentState.COMPLETED

        self._context.result = result

        return result

    def get_context(self) -> SubAgentContext:
        """获取上下文"""
        return self._context

    def get_isolated_messages(self, parent_messages: list[dict]) -> list[dict]:
        """获取隔离后的消息"""
        return self._isolation.isolate_messages(parent_messages, self._context)


def create_forked_agent(
    name: str,
    parent_agent_id: str = None,
    isolation_level: str = "strict",
    max_turns: int = 10,
    executor: Callable = None,
) -> ForkedSubAgent:
    """创建 Fork 子代理"""
    return ForkedSubAgent(
        name=name,
        parent_agent_id=parent_agent_id,
        isolation_level=isolation_level,
        max_turns=max_turns,
        executor=executor,
    )
