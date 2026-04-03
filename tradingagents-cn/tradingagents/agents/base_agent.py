"""
TradingAgents-CN Base Agent
Base class for all agents
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, Optional


class BaseAgent(ABC):
    """所有智能体的基类"""

    def __init__(
        self,
        llm: Any,
        config: Optional[Dict[str, Any]] = None,
        name: str = "Agent"
    ):
        self.llm = llm
        self.config = config or {}
        self.name = name

    @abstractmethod
    async def analyze(self, *args, **kwargs) -> str:
        """执行分析或决策"""
        pass

    async def ainvoke(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """LangGraph兼容的异步调用"""
        raise NotImplementedError

    def get_info(self) -> Dict[str, Any]:
        """获取智能体信息"""
        return {
            "name": self.name,
            "type": self.__class__.__name__,
            "llm": getattr(self.llm, "model", "unknown"),
        }
