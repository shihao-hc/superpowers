"""
TradingAgents-CN Edge TTS Adapter
微软Edge浏览器的TTS服务，无需API密钥
"""

from typing import Optional, Dict, Any, AsyncIterator
import asyncio
import os

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False

from .base_tts import BaseTTSAdapter, TTSResponse


class EdgeTTSAdapter(BaseTTSAdapter):
    """Edge TTS 适配器"""

    VOICE_LIST = {
        "en-US": [
            "en-US-AriaNeural",
            "en-US-GuyNeural",
            "en-US-JennyNeural",
            "en-US-SaraNeural",
            "en-US-AnaNeural",
            "en-US-BrandonNeural",
        ],
        "zh-CN": [
            "zh-CN-XiaoxiaoNeural",
            "zh-CN-YunxiNeural",
            "zh-CN-YunyangNeural",
            "zh-CN-XiaoyiNeural",
            "zh-CN-YunhaoNeural",
        ],
        "ja-JP": [
            "ja-JP-NanamiNeural",
            "ja-JP-KeitaNeural",
        ],
        "ko-KR": [
            "ko-KR-SunhiNeural",
            "ko-KR-JunwooNeural",
        ],
        "fr-FR": [
            "fr-FR-DeniseNeural",
            "fr-FR-HenriNeural",
        ],
        "de-DE": [
            "de-DE-KatjaNeural",
            "de-DE-ConradNeural",
        ],
        "es-ES": [
            "es-ES-ElviraNeural",
            "es-ES-AlvaroNeural",
        ],
        "it-IT": [
            "it-IT-ElsaNeural",
            "it-IT-DiegoNeural",
        ],
    }

    def __init__(
        self,
        voice: str = "en-US-AriaNeural",
        rate: str = "+0%",
        volume: str = "+0%",
        pitch: str = "+0Hz",
        config: Optional[Dict[str, Any]] = None
    ):
        super().__init__(voice, rate, volume, pitch, config)
        if not EDGE_TTS_AVAILABLE:
            raise ImportError(
                "edge-tts 未安装。请运行: pip install edge-tts"
            )

    async def synthesize(self, text: str, **kwargs) -> bytes:
        """
        使用Edge TTS将文本转换为语音

        Args:
            text: 要转换的文本
            **kwargs: 额外参数
                - voice: 覆盖默认语音
                - rate: 语速调整
                - volume: 音量调整
                - pitch: 音调调整

        Returns:
            音频数据 (mp3格式)
        """
        voice = kwargs.get("voice", self.voice)
        rate = kwargs.get("rate", self.rate)
        volume = kwargs.get("volume", self.volume)
        pitch = kwargs.get("pitch", self.pitch)

        communicate = edge_tts.Communicate(
            text,
            voice=voice,
            rate=rate,
            volume=volume,
            pitch=pitch
        )

        audio_buffer = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_buffer.extend(chunk["data"])

        return bytes(audio_buffer)

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
        rate = kwargs.get("rate", self.rate)
        volume = kwargs.get("volume", self.volume)
        pitch = kwargs.get("pitch", self.pitch)

        communicate = edge_tts.Communicate(
            text,
            voice=voice,
            rate=rate,
            volume=volume,
            pitch=pitch
        )

        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                yield chunk["data"]

    def supports_ssml(self) -> bool:
        """Edge TTS支持SSML"""
        return True

    @staticmethod
    def list_available_voices() -> Dict[str, list]:
        """列出所有可用语音"""
        return EdgeTTSAdapter.VOICE_LIST.copy()

    @staticmethod
    async def get_all_voices() -> list:
        """
        从Edge服务获取所有可用语音

        Returns:
            语音列表
        """
        if not EDGE_TTS_AVAILABLE:
            raise ImportError("edge-tts 未安装")
        return await edge_tts.list_voices()


class EdgeTTSWebSocket:
    """Edge TTS WebSocket 服务"""

    def __init__(self, adapter: Optional[EdgeTTSAdapter] = None):
        self.adapter = adapter or EdgeTTSAdapter()

    async def synthesize_ws(self, text: str, **kwargs) -> TTSResponse:
        """
        通过WebSocket合成语音

        Args:
            text: 要转换的文本
            **kwargs: 额外参数

        Returns:
            TTS响应
        """
        audio_data = await self.adapter.synthesize(text, **kwargs)
        return TTSResponse(
            audio_data=audio_data,
            format="mp3",
            provider="edge-tts"
        )
