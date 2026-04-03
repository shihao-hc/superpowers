"""
TradingAgents-CN Ollama Adapter
支持本地 Ollama 模型
"""

import json
import re
import time
from typing import AsyncIterator, Optional, Dict, Any
import httpx

from .base_llm import BaseLLMAdapter, LLMResponse

try:
    from prometheus_client import Histogram, Counter, Gauge
    _PROMETHEUS_AVAILABLE = True
except ImportError:
    _PROMETHEUS_AVAILABLE = False

if _PROMETHEUS_AVAILABLE:
    ollama_inference_seconds = Histogram(
        'ollama_inference_seconds',
        'Time taken for Ollama inference',
        ['model'],
        buckets=(0.1, 0.5, 1, 2, 5, 10, 30, 60)
    )
    ollama_requests_total = Counter(
        'ollama_requests_total',
        'Total number of Ollama requests',
        ['model', 'status']
    )
    ollama_tokens_total = Counter(
        'ollama_tokens_total',
        'Total number of tokens processed',
        ['model', 'type']
    )
    ollama_streaming_seconds = Histogram(
        'ollama_streaming_seconds',
        'Time taken for Ollama streaming',
        ['model'],
        buckets=(0.1, 0.5, 1, 2, 5, 10, 30, 60)
    )


class OllamaAdapter(BaseLLMAdapter):
    """Ollama 本地模型适配器"""

    DEFAULT_BASE_URL = "http://localhost:11434"
    DEFAULT_MODEL = "llama3"
    ALLOWED_SCHEMES = {"http", "https"}

    def __init__(
        self,
        api_key: str = "ollama",
        model: str = DEFAULT_MODEL,
        base_url: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None
    ):
        super().__init__(api_key, model, base_url, config)
        self.base_url = self._validate_url(base_url or self.DEFAULT_BASE_URL)
        self.timeout = self.config.get("timeout", 300)
        self.temperature = self.config.get("temperature", 0.7)
        self.num_ctx = self.config.get("num_ctx", 4096)
        self.num_keep = self.config.get("num_keep", 24)
        self.seed = self.config.get("seed", 0)
        self.tfs_z = self.config.get("tfs_z", 2)
        self.repeat_last_n = self.config.get("repeat_last_n", 64)
        self.repeat_penalty = self.config.get("repeat_penalty", 1.1)
        self.presence_penalty = self.config.get("presence_penalty", 0.0)
        self.frequency_penalty = self.config.get("frequency_penalty", 0.0)
        self.top_p = self.config.get("top_p", 0.9)
        self.top_k = self.config.get("top_k", 40)
        self._model = model

    def _validate_url(self, url: str) -> str:
        parsed = httpx.URL(url)
        if parsed.scheme not in self.ALLOWED_SCHEMES:
            raise ValueError(f"Invalid URL scheme: {parsed.scheme}. Allowed: {self.ALLOWED_SCHEMES}")
        return str(parsed)

    def _get_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)

    async def ainvoke(self, prompt: str, **kwargs) -> LLMResponse:
        """异步调用"""
        messages = [{"role": "user", "content": prompt}]

        if "system" in kwargs:
            messages.insert(0, {"role": "system", "content": kwargs["system"]})

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": kwargs.get("temperature", self.temperature),
                "num_ctx": self.num_ctx,
                "seed": self.seed if self.seed > 0 else None,
                "tfs_z": self.tfs_z,
                "repeat_last_n": self.repeat_last_n,
                "repeat_penalty": self.repeat_penalty,
                "presence_penalty": self.presence_penalty,
                "frequency_penalty": self.frequency_penalty,
                "top_p": kwargs.get("top_p", self.top_p),
                "top_k": kwargs.get("top_k", self.top_k),
            },
        }

        client = self._get_client()
        start_time = time.time()
        try:
            response = await client.post("/api/chat", json=payload)
            response.raise_for_status()
            data = response.json()

            duration = time.time() - start_time

            if _PROMETHEUS_AVAILABLE:
                ollama_inference_seconds.labels(model=self._model).observe(duration)
                ollama_requests_total.labels(model=self._model, status='success').inc()
                ollama_tokens_total.labels(model=self._model, type='prompt').inc(data.get("prompt_eval_count", 0))
                ollama_tokens_total.labels(model=self._model, type='completion').inc(data.get("eval_count", 0))

            content = data.get("message", {}).get("content", "")
            return LLMResponse(
                content=content,
                raw_response=data,
                usage={
                    "prompt_tokens": data.get("prompt_eval_count", 0),
                    "completion_tokens": data.get("eval_count", 0),
                    "total_tokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0),
                },
                model=self.model,
            )
        except httpx.HTTPError as e:
            if _PROMETHEUS_AVAILABLE:
                ollama_requests_total.labels(model=self._model, status='error').inc()
            raise RuntimeError(f"Ollama API request failed: {type(e).__name__}") from e
        except json.JSONDecodeError as e:
            if _PROMETHEUS_AVAILABLE:
                ollama_requests_total.labels(model=self._model, status='error').inc()
            raise RuntimeError("Invalid JSON response from Ollama API") from e
        finally:
            await client.aclose()

    async def astream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        """异步流式调用"""
        messages = [{"role": "user", "content": prompt}]

        if "system" in kwargs:
            messages.insert(0, {"role": "system", "content": kwargs["system"]})

        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": kwargs.get("temperature", self.temperature),
                "num_ctx": self.num_ctx,
                "top_p": kwargs.get("top_p", self.top_p),
                "top_k": kwargs.get("top_k", self.top_k),
            },
        }

        client = self._get_client()
        try:
            async with await client.stream("POST", "/api/chat", json=payload) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            if "message" in data and "content" in data["message"]:
                                yield data["message"]["content"]
                        except json.JSONDecodeError:
                            continue
        except httpx.HTTPError as e:
            raise RuntimeError(f"Ollama streaming failed: {type(e).__name__}") from e
        finally:
            await client.aclose()

    def supports_streaming(self) -> bool:
        return True

    def supports_function_calling(self) -> bool:
        return False

    def get_provider_name(self) -> str:
        return "ollama"

    @staticmethod
    async def list_models(base_url: str = DEFAULT_BASE_URL) -> list:
        """列出 Ollama 可用的模型"""
        client = httpx.AsyncClient(base_url=base_url, timeout=30)
        try:
            response = await client.get("/api/tags")
            response.raise_for_status()
            data = response.json()
            return [m.get("name") for m in data.get("models", [])]
        finally:
            await client.aclose()

    @staticmethod
    async def check_health(base_url: str = DEFAULT_BASE_URL) -> bool:
        """检查 Ollama 服务是否可用"""
        client = httpx.AsyncClient(base_url=base_url, timeout=10)
        try:
            response = await client.get("/api/tags")
            return response.status_code == 200
        except Exception:
            return False
        finally:
            await client.aclose()

    async def pull_model(self) -> AsyncIterator[str]:
        """拉取模型到本地"""
        client = self._get_client()
        try:
            async with client.stream("POST", "/api/pull", json={"name": self.model}) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            status = data.get("status", "")
                            yield status
                        except json.JSONDecodeError:
                            continue
        except httpx.HTTPError as e:
            raise RuntimeError(f"Model pull failed: {type(e).__name__}") from e
        finally:
            await client.aclose()
