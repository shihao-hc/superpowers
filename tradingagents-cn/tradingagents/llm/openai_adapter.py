"""
TradingAgents-CN OpenAI Adapter
支持 OpenAI API 和兼容 API (如 Groq, Fireworks AI 等)
"""

from typing import AsyncIterator, Optional, Dict, Any
from openai import AsyncOpenAI
from .base_llm import BaseLLMAdapter, LLMResponse


class OpenAIAdapter(BaseLLMAdapter):
    """OpenAI API 适配器"""

    def __init__(
        self,
        api_key: str,
        model: str = "gpt-4o",
        base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None
    ):
        super().__init__(api_key, model, base_url, config)
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
            timeout=self.config.get("timeout", 120),
            max_retries=self.config.get("max_retries", 3),
        )
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

    async def ainvoke_with_functions(
        self,
        prompt: str,
        functions: list,
        **kwargs
    ) -> LLMResponse:
        """带函数调用的异步调用"""
        messages = [{"role": "user", "content": prompt}]

        if "system" in kwargs:
            messages.insert(0, {"role": "system", "content": kwargs["system"]})

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            tools=functions,
            temperature=kwargs.get("temperature", self.temperature),
            tool_choice=kwargs.get("tool_choice", "auto"),
        )

        message = response.choices[0].message
        if message.tool_calls:
            return LLMResponse(
                content=message.content or "",
                raw_response=message,
                usage={
                    "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
                    "completion_tokens": response.usage.completion_tokens if response.usage else 0,
                    "total_tokens": response.usage.total_tokens if response.usage else 0,
                },
                model=self.model,
            )
        else:
            return LLMResponse(content=message.content or "", model=self.model)
