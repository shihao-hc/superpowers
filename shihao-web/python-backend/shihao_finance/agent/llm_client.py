"""
真实 LLM 客户端
支持 Ollama 和 OpenAI API
"""

import os
import json
import logging
from typing import AsyncIterator, Optional, Dict, Any
import asyncio

logger = logging.getLogger(__name__)


class LLMClientError(Exception):
    """LLM 客户端错误"""

    pass


class BaseLLMClient:
    """LLM 客户端基类"""

    async def stream(self, messages: list[dict]) -> AsyncIterator[dict]:
        """流式生成"""
        raise NotImplementedError

    async def chat(self, messages: list[dict]) -> str:
        """非流式调用"""
        raise NotImplementedError

    async def complete(self, messages: list[dict], **kwargs) -> str:
        """补全"""
        raise NotImplementedError


class OllamaClient(BaseLLMClient):
    """Ollama 客户端"""

    def __init__(
        self,
        model: str = "llama3.2",
        base_url: str = "http://localhost:11434",
        timeout: int = 120,
    ):
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client = None

    async def _get_client(self):
        """获取 HTTP 客户端"""
        if self._client is None:
            import httpx

            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers={"Content-Type": "application/json"},
            )
        return self._client

    async def stream(self, messages: list[dict]) -> AsyncIterator[dict]:
        """流式生成"""
        client = await self._get_client()

        try:
            response = await client.post(
                "/api/chat",
                json={"model": self.model, "messages": messages, "stream": True},
                timeout=None,
            )

            if response.status_code != 200:
                raise LLMClientError(
                    f"Ollama error: {response.status_code} {response.text}"
                )

            async for line in response.aiter_lines():
                if not line.strip():
                    continue

                try:
                    data = json.loads(line)

                    if "error" in data:
                        raise LLMClientError(f"Ollama error: {data['error']}")

                    if data.get("done", False):
                        break

                    content = data.get("message", {}).get("content", "")

                    if content:
                        yield {"type": "text", "content": content}

                except json.JSONDecodeError:
                    continue

        except httpx.ConnectError as e:
            raise LLMClientError(f"Cannot connect to Ollama: {e}")
        except httpx.TimeoutException:
            raise LLMClientError(f"Ollama request timeout")

    async def chat(self, messages: list[dict]) -> str:
        """非流式调用"""
        client = await self._get_client()

        try:
            response = await client.post(
                "/api/chat",
                json={"model": self.model, "messages": messages, "stream": False},
            )

            if response.status_code != 200:
                raise LLMClientError(f"Ollama error: {response.status_code}")

            data = response.json()
            return data.get("message", {}).get("content", "")

        except httpx.ConnectError as e:
            raise LLMClientError(f"Cannot connect to Ollama: {e}")

    async def complete(self, messages: list[dict], **kwargs) -> str:
        """补全"""
        return await self.chat(messages)

    async def close(self):
        """关闭客户端"""
        if self._client:
            await self._client.aclose()
            self._client = None


class OpenAIClient(BaseLLMClient):
    """OpenAI 客户端"""

    def __init__(
        self,
        model: str = "gpt-4",
        api_key: str = None,
        base_url: str = "https://api.openai.com/v1",
        timeout: int = 120,
    ):
        self.model = model
        self.api_key = api_key or os.getenv("OPENAI_API_KEY")
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client = None

    async def _get_client(self):
        """获取 HTTP 客户端"""
        if self._client is None:
            import httpx

            self._client = httpx.AsyncClient(
                base_url=self.base_url,
                timeout=self.timeout,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
            )
        return self._client

    async def stream(self, messages: list[dict]) -> AsyncIterator[dict]:
        """流式生成"""
        client = await self._get_client()

        try:
            response = await client.post(
                "/chat/completions",
                json={"model": self.model, "messages": messages, "stream": True},
                timeout=None,
            )

            if response.status_code != 200:
                raise LLMClientError(
                    f"OpenAI error: {response.status_code} {response.text}"
                )

            async for line in response.aiter_lines():
                if not line.strip() or line.strip() == "data: [DONE]":
                    continue

                if line.startswith("data: "):
                    data = json.loads(line[6:])

                    delta = data.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")

                    if content:
                        yield {"type": "text", "content": content}

        except httpx.ConnectError as e:
            raise LLMClientError(f"Cannot connect to OpenAI: {e}")

    async def chat(self, messages: list[dict]) -> str:
        """非流式调用"""
        client = await self._get_client()

        response = await client.post(
            "/chat/completions", json={"model": self.model, "messages": messages}
        )

        if response.status_code != 200:
            raise LLMClientError(f"OpenAI error: {response.status_code}")

        data = response.json()
        return data.get("choices", [{}])[0].get("message", {}).get("content", "")

    async def complete(self, messages: list[dict], **kwargs) -> str:
        """补全"""
        return await self.chat(messages)

    async def close(self):
        """关闭客户端"""
        if self._client:
            await self._client.aclose()
            self._client = None


def create_llm_client(
    provider: str = "ollama", model: str = "llama3.2", **kwargs
) -> BaseLLMClient:
    """创建 LLM 客户端工厂"""

    if provider.lower() == "ollama":
        return OllamaClient(
            model=model,
            base_url=kwargs.get("base_url", "http://localhost:11434"),
            timeout=kwargs.get("timeout", 120),
        )
    elif provider.lower() in ("openai", "gpt"):
        return OpenAIClient(
            model=model,
            api_key=kwargs.get("api_key"),
            base_url=kwargs.get("base_url", "https://api.openai.com/v1"),
            timeout=kwargs.get("timeout", 120),
        )
    else:
        raise ValueError(f"Unknown provider: {provider}")


class StreamingLLMClient(BaseLLMClient):
    """兼容旧接口的包装器"""

    def __init__(self, provider: str = "ollama", model: str = "llama3"):
        self._client = create_llm_client(provider, model)
        self.provider = provider
        self.model = model

    async def stream(self, messages: list[dict]) -> AsyncIterator[dict]:
        return self._client.stream(messages)

    async def chat(self, messages: list[dict]) -> str:
        return await self._client.chat(messages)

    async def complete(self, messages: list[dict], **kwargs) -> str:
        return await self._client.complete(messages, **kwargs)
