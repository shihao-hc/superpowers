"""
TradingAgents-CN LLM Factory
创建LLM适配器的工厂函数
"""

from typing import Optional, Dict, Any
import os

from .base_llm import BaseLLMAdapter
from .openai_adapter import OpenAIAdapter
from .deepseek_adapter import DeepSeekAdapter
from .google_adapter import GoogleAdapter
from .dashscope_adapter import DashScopeAdapter
from .ollama_adapter import OllamaAdapter
from .vllm_adapter import VLLMAdapter


PROVIDER_MAP = {
    "openai": OpenAIAdapter,
    "deepseek": DeepSeekAdapter,
    "google": GoogleAdapter,
    "gemini": GoogleAdapter,
    "dashscope": DashScopeAdapter,
    "qwen": DashScopeAdapter,
    "aliyun": DashScopeAdapter,
    "ollama": OllamaAdapter,
    "local": OllamaAdapter,
    "vllm": VLLMAdapter,
    "mock": None,
}


def _get_mock_adapter(model: Optional[str] = None) -> BaseLLMAdapter:
    """获取 Mock LLM 适配器"""
    from .mock_adapter import MockLLMAdapter
    return MockLLMAdapter(model=model or "mock-model")


def create_llm_adapter(
    provider: str,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    base_url: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None
) -> BaseLLMAdapter:
    """
    创建LLM适配器

    Args:
        provider: 提供商名称 (openai, deepseek, google, dashscope, mock等)
        api_key: API密钥，默认从环境变量读取
        model: 模型名称
        base_url: API基础URL
        config: 额外配置

    Returns:
        LLM适配器实例

    Raises:
        ValueError: 不支持的提供商
        ImportError: 缺少依赖
    """
    provider = provider.lower()
    config = config or {}
    
    if os.getenv("USE_MOCK_LLM", "").lower() == "true" and provider != "mock":
        return _get_mock_adapter(model)
    
    if provider == "mock":
        return _get_mock_adapter(model)
    
    adapter_class = PROVIDER_MAP.get(provider)
    if not adapter_class:
        raise ValueError(
            f"不支持的LLM提供商: {provider}。"
            f"支持的提供商: {list(PROVIDER_MAP.keys())}"
        )

    if api_key is None:
        env_vars = {
            "openai": "OPENAI_API_KEY",
            "deepseek": "DEEPSEEK_API_KEY",
            "google": "GOOGLE_API_KEY",
            "gemini": "GOOGLE_API_KEY",
            "dashscope": "DASHSCOPE_API_KEY",
            "qwen": "DASHSCOPE_API_KEY",
            "aliyun": "DASHSCOPE_API_KEY",
            "ollama": None,
            "local": None,
            "vllm": None,
        }
        default_api_keys = {
            "ollama": "ollama",
            "local": "ollama",
            "vllm": "EMPTY",
        }
        env_var = env_vars.get(provider)
        if env_var is None:
            api_key = default_api_keys.get(provider, "EMPTY")
        else:
            api_key = os.getenv(env_var)
            if not api_key:
                raise ValueError(f"请提供 {provider} 的 API密钥，或设置环境变量 {env_var}")

    default_models = {
        "openai": "gpt-4o",
        "deepseek": "deepseek-chat",
        "google": "gemini-1.5-flash",
        "gemini": "gemini-1.5-flash",
        "dashscope": "qwen-plus",
        "qwen": "qwen-plus",
        "aliyun": "qwen-plus",
        "ollama": "llama3",
        "local": "llama3",
        "vllm": "meta-llama/Llama-2-7b-chat-hf",
    }

    model = model or default_models.get(provider, "gpt-4o")

    resolved_base_url = base_url
    if resolved_base_url is None and provider in ("ollama", "local"):
        resolved_base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    elif resolved_base_url is None and provider == "vllm":
        resolved_base_url = os.getenv("VLLM_BASE_URL", "http://localhost:8000/v1")

    return adapter_class(
        api_key=api_key,
        model=model,
        base_url=resolved_base_url,
        config=config
    )


def create_llm_from_config(config: Dict[str, Any]) -> BaseLLMAdapter:
    """
    从配置字典创建LLM适配器

    Args:
        config: 配置字典，应包含:
            - provider: 提供商名称
            - api_key: API密钥 (可选)
            - model: 模型名称 (可选)
            - base_url: API基础URL (可选)
            - temperature: 温度参数 (可选)
            - max_tokens: 最大token数 (可选)

    Returns:
        LLM适配器实例
    """
    return create_llm_adapter(
        provider=config.get("provider", "openai"),
        api_key=config.get("api_key"),
        model=config.get("model"),
        base_url=config.get("base_url"),
        config={
            "temperature": config.get("temperature", 0.7),
            "max_tokens": config.get("max_tokens", 4096),
            "timeout": config.get("timeout", 120),
            "max_retries": config.get("max_retries", 3),
        }
    )


def list_supported_providers() -> list:
    """列出支持的LLM提供商"""
    return list(set(PROVIDER_MAP.keys()))
