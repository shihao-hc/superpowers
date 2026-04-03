"""
TradingAgents-CN Base LLM Adapter
定义LLM适配器接口
"""

from abc import ABC, abstractmethod
from typing import AsyncIterator, Optional, Dict, Any, List, Union
import asyncio


class BaseLLMAdapter(ABC):
    """LLM适配器基类"""

    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None
    ):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url
        self.config = config or {}

    @abstractmethod
    async def ainvoke(self, prompt: str, **kwargs) -> Any:
        """异步调用LLM"""
        pass

    @abstractmethod
    async def astream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        """异步流式调用LLM"""
        pass

    def supports_streaming(self) -> bool:
        """是否支持流式输出"""
        return True

    def supports_function_calling(self) -> bool:
        """是否支持函数调用"""
        return False

    def get_model_name(self) -> str:
        """获取模型名称"""
        return self.model

    def get_provider_name(self) -> str:
        """获取提供商名称"""
        return self.__class__.__name__.replace("Adapter", "").lower()


class Message:
    """消息对象"""

    def __init__(
        self,
        content: str,
        role: str = "user",
        name: Optional[str] = None,
        **kwargs
    ):
        self.content = content
        self.role = role
        self.name = name
        self.additional_kwargs = kwargs

    def to_dict(self) -> Dict[str, Any]:
        result = {"role": self.role, "content": self.content}
        if self.name:
            result["name"] = self.name
        result.update(self.additional_kwargs)
        return result


class AIMessage:
    """AI响应消息"""

    def __init__(
        self,
        content: str,
        role: str = "assistant",
        **kwargs
    ):
        self.content = content
        self.role = role
        self.additional_kwargs = kwargs

    def to_dict(self) -> Dict[str, Any]:
        result = {"role": self.role, "content": self.content}
        result.update(self.additional_kwargs)
        return result


class LLMResponse:
    """LLM响应封装"""

    def __init__(
        self,
        content: str,
        raw_response: Optional[Any] = None,
        usage: Optional[Dict[str, Any]] = None,
        model: Optional[str] = None
    ):
        self.content = content
        self.raw_response = raw_response
        self.usage = usage or {}
        self.model = model

    def __str__(self) -> str:
        return self.content

    def __repr__(self) -> str:
        return f"LLMResponse(content='{self.content[:50]}...', model={self.model})"


class ChatHistory:
    """对话历史"""

    def __init__(self):
        self.messages: List[Message] = []

    def add_user_message(self, content: str, name: Optional[str] = None) -> None:
        self.messages.append(Message(content=content, role="user", name=name))

    def add_ai_message(self, content: str) -> None:
        self.messages.append(Message(content=content, role="assistant"))

    def add_system_message(self, content: str) -> None:
        self.messages.append(Message(content=content, role="system"))

    def get_messages(self) -> List[Dict[str, Any]]:
        return [msg.to_dict() for msg in self.messages]

    def clear(self) -> None:
        self.messages = []

    def __len__(self) -> int:
        return len(self.messages)
