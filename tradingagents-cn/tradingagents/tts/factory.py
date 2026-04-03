"""
TradingAgents-CN TTS Factory
创建TTS适配器的工厂函数
"""

from typing import Optional, Dict, Any
import os

from .base_tts import BaseTTSAdapter
from .edge_tts_adapter import EdgeTTSAdapter
from .kokoro_adapter import KokoroTTSAdapter


PROVIDER_MAP = {
    "edge": EdgeTTSAdapter,
    "edge-tts": EdgeTTSAdapter,
    "kokoro": KokoroTTSAdapter,
    "local": None,
}


def create_tts_adapter(
    provider: str = "edge",
    voice: Optional[str] = None,
    base_url: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None
) -> BaseTTSAdapter:
    """
    创建TTS适配器

    Args:
        provider: 提供商名称 (edge, kokoro)
        voice: 语音名称
        base_url: API基础URL (用于kokoro等需要本地服务的)
        config: 额外配置

    Returns:
        TTS适配器实例

    Raises:
        ValueError: 不支持的提供商
        ImportError: 缺少依赖
    """
    provider = provider.lower()
    config = config or {}

    adapter_class = PROVIDER_MAP.get(provider)
    if not adapter_class:
        raise ValueError(
            f"不支持的TTS提供商: {provider}。"
            f"支持的提供商: {list(PROVIDER_MAP.keys())}"
        )

    default_voices = {
        "edge": os.getenv("TTS_VOICE", "en-US-AriaNeural"),
        "edge-tts": os.getenv("TTS_VOICE", "en-US-AriaNeural"),
        "kokoro": os.getenv("KOKORO_VOICE", "af_heart"),
        "local": os.getenv("TTS_VOICE", "en-US-AriaNeural"),
    }

    voice = voice or default_voices.get(provider, "en-US-AriaNeural")

    if provider in ("edge", "edge-tts"):
        return EdgeTTSAdapter(
            voice=voice,
            rate=config.get("rate", "+0%"),
            volume=config.get("volume", "+0%"),
            pitch=config.get("pitch", "+0Hz"),
            config=config
        )
    elif provider == "kokoro":
        kokoro_url = base_url or os.getenv(
            "KOKORO_BASE_URL", "http://localhost:5002"
        )
        return KokoroTTSAdapter(
            voice=voice,
            rate=config.get("rate", "+0%"),
            volume=config.get("volume", "+0%"),
            pitch=config.get("pitch", "+0Hz"),
            base_url=kokoro_url,
            config=config
        )
    else:
        raise ValueError(f"不支持的TTS提供商: {provider}")


def create_tts_from_config(config: Dict[str, Any]) -> BaseTTSAdapter:
    """
    从配置字典创建TTS适配器

    Args:
        config: 配置字典，应包含:
            - provider: 提供商名称
            - voice: 语音名称 (可选)
            - base_url: API基础URL (可选)
            - rate: 语速 (可选)
            - volume: 音量 (可选)
            - pitch: 音调 (可选)

    Returns:
        TTS适配器实例
    """
    return create_tts_adapter(
        provider=config.get("provider", "edge"),
        voice=config.get("voice"),
        base_url=config.get("base_url"),
        config={
            "rate": config.get("rate", "+0%"),
            "volume": config.get("volume", "+0%"),
            "pitch": config.get("pitch", "+0Hz"),
            "timeout": config.get("timeout", 60),
        }
    )


def list_supported_providers() -> list:
    """列出支持的TTS提供商"""
    return [p for p in PROVIDER_MAP.keys() if PROVIDER_MAP[p] is not None]


def get_voice_list(provider: str = "edge") -> Dict[str, str]:
    """
    获取指定提供商的可用语音列表

    Args:
        provider: 提供商名称

    Returns:
        语音字典 {voice_id: description}
    """
    if provider.lower() in ("edge", "edge-tts"):
        return EdgeTTSAdapter.VOICE_LIST
    elif provider.lower() == "kokoro":
        return KokoroTTSAdapter.DEFAULT_VOICES
    else:
        return {}
