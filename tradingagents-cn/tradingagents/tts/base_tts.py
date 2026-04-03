"""
TradingAgents-CN Base TTS Adapter
定义TTS适配器接口
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, AsyncIterator
import asyncio
import base64
import io


class BaseTTSAdapter(ABC):
    """TTS适配器基类"""

    def __init__(
        self,
        voice: str = "en-US-AriaNeural",
        rate: str = "+0%",
        volume: str = "+0%",
        pitch: str = "+0Hz",
        config: Optional[Dict[str, Any]] = None
    ):
        self.voice = voice
        self.rate = rate
        self.volume = volume
        self.pitch = pitch
        self.config = config or {}

    @abstractmethod
    async def synthesize(self, text: str, **kwargs) -> bytes:
        """
        将文本转换为语音

        Args:
            text: 要转换的文本
            **kwargs: 额外参数

        Returns:
            音频数据 (bytes)
        """
        pass

    async def synthesize_stream(self, text: str, **kwargs) -> AsyncIterator[bytes]:
        """
        流式合成语音

        Args:
            text: 要转换的文本
            **kwargs: 额外参数

        Yields:
            音频数据块 (bytes)
        """
        audio = await self.synthesize(text, **kwargs)
        yield audio

    def get_voice_name(self) -> str:
        """获取语音名称"""
        return self.voice

    def get_provider_name(self) -> str:
        """获取提供商名称"""
        return self.__class__.__name__.replace("TTSAdapter", "").lower()

    def supports_streaming(self) -> bool:
        """是否支持流式输出"""
        return True

    def supports_ssml(self) -> bool:
        """是否支持SSML"""
        return False


class TTSResponse:
    """TTS响应封装"""

    def __init__(
        self,
        audio_data: bytes,
        format: str = "mp3",
        duration: Optional[float] = None,
        provider: Optional[str] = None
    ):
        self.audio_data = audio_data
        self.format = format
        self.duration = duration
        self.provider = provider

    def to_base64(self) -> str:
        """转换为Base64编码"""
        return base64.b64encode(self.audio_data).decode("utf-8")

    def to_data_url(self) -> str:
        """转换为Data URL"""
        mime_types = {
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "ogg": "audio/ogg",
            "opus": "audio/opus",
        }
        mime_type = mime_types.get(self.format, "application/octet-stream")
        return f"data:{mime_type};base64,{self.to_base64()}"

    def save_to_file(self, filepath: str) -> None:
        """保存到文件"""
        with open(filepath, "wb") as f:
            f.write(self.audio_data)

    def __len__(self) -> int:
        return len(self.audio_data)

    def __repr__(self) -> str:
        return f"TTSResponse(format={self.format}, size={len(self)} bytes, provider={self.provider})"


class VoiceProfile:
    """语音配置"""

    PRESET_VOICES = {
        "en-US-Aria": "en-US-AriaNeural",
        "en-US-Guy": "en-US-GuyNeural",
        "en-US-Jenny": "en-US-JennyNeural",
        "zh-CN-Xiaoxiao": "zh-CN-XiaoxiaoNeural",
        "zh-CN-Yunxi": "zh-CN-YunxiNeural",
        "ja-JP-Nanami": "ja-JP-NanamiNeural",
        "ko-KR-Sunhi": "ko-KR-SunhiNeural",
    }

    @classmethod
    def list_voices(cls) -> Dict[str, str]:
        """列出预设语音"""
        return cls.PRESET_VOICES.copy()

    @classmethod
    def get_voice(cls, name: str) -> str:
        """获取语音名称"""
        return cls.PRESET_VOICES.get(name, name)
