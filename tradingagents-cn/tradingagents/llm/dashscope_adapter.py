"""
TradingAgents-CN DashScope Adapter
支持阿里云 DashScope API (通义千问等)
"""

from typing import AsyncIterator, Optional, Dict, Any
from .base_llm import BaseLLMAdapter, LLMResponse


class DashScopeAdapter(BaseLLMAdapter):
    """阿里云 DashScope API 适配器"""

    DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    def __init__(
        self,
        api_key: str,
        model: str = "qwen-plus",
        base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None
    ):
        super().__init__(
            api_key,
            model,
            base_url or self.DEFAULT_BASE_URL,
            config
        )
        try:
            from openai import AsyncOpenAI
            self.client = AsyncOpenAI(
                api_key=api_key,
                base_url=self.base_url,
                timeout=self.config.get("timeout", 120),
                max_retries=self.config.get("max_retries", 3),
            )
        except ImportError:
            raise ImportError("请安装 openai 包: pip install openai")

        self.temperature = self.config.get("temperature", 0.7)
        self.max_tokens = self.config.get("max_tokens", 4096)

    async def ainvoke(self, prompt: str, **kwargs) -> LLMResponse:
        """异步调用"""
        messages = [{"role": "user", "content": prompt}]

        if "system" in kwargs:
            messages.insert(0, {"role": "system", "content": kwargs["system"]})

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=kwargs.get("temperature", self.temperature),
            max_tokens=kwargs.get("max_tokens", self.max_tokens),
            stream=False,
        )

        content = response.choices[0].message.content or ""
        return LLMResponse(
            content=content,
            raw_response=response,
            usage={
                "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                "total_tokens": response.usage.total_tokens if response.usage else 0,
            },
            model=self.model,
        )

    async def astream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        """异步流式调用"""
        messages = [{"role": "user", "content": prompt}]

        if "system" in kwargs:
            messages.insert(0, {"role": "system", "content": kwargs["system"]})

        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=kwargs.get("temperature", self.temperature),
            max_tokens=kwargs.get("max_tokens", self.max_tokens),
            stream=True,
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content

    def supports_function_calling(self) -> bool:
        return True
