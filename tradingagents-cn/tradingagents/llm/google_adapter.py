"""
TradingAgents-CN Google Adapter
支持 Google Gemini API
"""

from typing import AsyncIterator, Optional, Dict, Any, List
from .base_llm import BaseLLMAdapter, LLMResponse


class GoogleAdapter(BaseLLMAdapter):
    """Google Gemini API 适配器"""

    DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

    def __init__(
        self,
        api_key: str,
        model: str = "gemini-1.5-flash",
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
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            self.client = genai
        except ImportError:
            raise ImportError("请安装 google-generativeai 包: pip install google-generativeai")

        self.temperature = self.config.get("temperature", 0.7)
        self.max_tokens = self.config.get("max_tokens", 4096)
        self._model = None

    def _get_model(self):
        """获取或创建模型实例"""
        if self._model is None:
            generation_config = {
                "temperature": self.temperature,
                "max_output_tokens": self.max_tokens,
            }
            self._model = self.client.GenerativeModel(
                self.model,
                generation_config=generation_config
            )
        return self._model

    async def ainvoke(self, prompt: str, **kwargs) -> LLMResponse:
        """异步调用"""
        model = self._get_model()

        generation_config = {
            "temperature": kwargs.get("temperature", self.temperature),
            "max_output_tokens": kwargs.get("max_tokens", self.max_tokens),
        }

        try:
            response = await model.generate_content_async(
                prompt,
                generation_config=generation_config
            )
            return LLMResponse(
                content=response.text,
                raw_response=response,
                usage={
                    "prompt_tokens": 0,
                    "completion_tokens": 0,
                    "total_tokens": 0,
                },
                model=self.model,
            )
        except Exception as e:
            raise RuntimeError(f"Google API 调用失败: {str(e)}")

    async def astream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        """异步流式调用"""
        model = self._get_model()

        generation_config = {
            "temperature": kwargs.get("temperature", self.temperature),
            "max_output_tokens": kwargs.get("max_tokens", self.max_tokens),
        }

        stream = await model.generate_content_async(
            prompt,
            generation_config=generation_config,
            stream=True
        )

        async for chunk in stream:
            if chunk.text:
                yield chunk.text

    def supports_streaming(self) -> bool:
        return True

    def supports_function_calling(self) -> bool:
        return False
