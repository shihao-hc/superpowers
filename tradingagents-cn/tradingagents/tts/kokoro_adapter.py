"""
TradingAgents-CN Kokoro TTS Adapter
Kokoro is a fast, local TTS model
"""

from typing import Optional, Dict, Any, AsyncIterator
import os
import aiohttp
import json

from .base_tts import BaseTTSAdapter, TTSResponse


class KokoroTTSAdapter(BaseTTSAdapter):
    """Kokoro TTS 适配器"""

    DEFAULT_VOICES = {
        "af_heart": "American Female - Heart",
        "af_bella": "American Female - Bella",
        "af_nicole": "American Female - Nicole",
        "af_sarah": "American Female - Sarah",
        "af_sky": "American Female - Sky",
        "bf_emma": "British Female - Emma",
        "bf_isabella": "British Female - Isabella",
        "bf_lily": "British Female - Lily",
        "bm_george": "British Male - George",
        "bm_lewis": "British Male - Lewis",
        "zf_xi": "Chinese Female - Xi",
        "zf_mei": "Chinese Female - Mei",
    }

    def __init__(
        self,
        voice: str = "af_heart",
        rate: str = "+0%",
        volume: str = "+0%",
        pitch: str = "+0Hz",
        base_url: str = "http://localhost:5002",
        config: Optional[Dict[str, Any]] = None
    ):
        super().__init__(voice, rate, volume, pitch, config)
        self.base_url = base_url.rstrip("/")
        self.timeout = config.get("timeout", 60) if config else 60

    async def synthesize(self, text: str, **kwargs) -> bytes:
        """
        使用Kokoro TTS将文本转换为语音

        Args:
            text: 要转换的文本
            **kwargs: 额外参数
                - voice: 覆盖默认语音
                - speed: 语速 (0.5-2.0)

        Returns:
            音频数据 (wav格式)
        """
        voice = kwargs.get("voice", self.voice)
        speed = kwargs.get("speed", 1.0)

        async with aiohttp.ClientSession() as session:
            payload = {
                "text": text,
                "voice": voice,
                "speed": speed,
            }

            async with session.post(
                f"{self.base_url}/v1/audio/speech",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    raise RuntimeError(
                        f"Kokoro TTS请求失败: {response.status} - {error_text}"
                    )
                return await response.read()

    async def synthesize_stream(self, text: str, **kwargs) -> AsyncIterator[bytes]:
        """
        流式合成语音

        Args:
            text: 要转换的文本
            **kwargs: 额外参数

        Yields:
            音频数据块
        """
        voice = kwargs.get("voice", self.voice)
        speed = kwargs.get("speed", 1.0)

        async with aiohttp.ClientSession() as session:
            payload = {
                "text": text,
                "voice": voice,
                "speed": speed,
            }

            async with session.post(
                f"{self.base_url}/v1/audio/speech",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=self.timeout)
            ) as response:
                if response.status != 200:
                    raise RuntimeError(f"Kokoro TTS请求失败: {response.status}")

                async for chunk in response.content.iter_chunked(8192):
                    if chunk:
                        yield chunk

    def supports_ssml(self) -> bool:
        """Kokoro TTS不支持SSML"""
        return False

    def supports_streaming(self) -> bool:
        """Kokoro TTS支持流式输出"""
        return True

    @staticmethod
    def list_available_voices() -> Dict[str, str]:
        """列出所有可用语音"""
        return KokoroTTSAdapter.DEFAULT_VOICES.copy()

    async def health_check(self) -> bool:
        """
        检查Kokoro服务是否可用

        Returns:
            服务是否健康
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    f"{self.base_url}/health",
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    return response.status == 200
        except Exception:
            return False


class OllamaTTSAdapter(BaseTTSAdapter):
    """Ollama TTS 适配器 (使用llama3.3-vision等模型)"""

    def __init__(
        self,
        voice: str = "llama3.2",
        rate: str = "+0%",
        volume: str = "+0%",
        pitch: str = "+0Hz",
        base_url: str = "http://localhost:11434",
        config: Optional[Dict[str, Any]] = None
    ):
        super().__init__(voice, rate, volume, pitch, config)
        self.base_url = base_url.rstrip("/")
        self.timeout = config.get("timeout", 120) if config else 120

    async def synthesize(self, text: str, **kwargs) -> bytes:
        """
        通过Ollama的TTS功能合成语音

        注意: Ollama本身不直接支持TTS，这里使用第三方扩展
        常见方案:
        1. 使用Ollama +xtts 模型
        2. 使用Ollama作为后端调用edge-tts

        Args:
            text: 要转换的文本
            **kwargs: 额外参数

        Returns:
            音频数据
        """
        raise NotImplementedError(
            "Ollama TTS需要额外配置。"
            "建议使用 EdgeTTSAdapter 或 KokoroTTSAdapter"
        )
