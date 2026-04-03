"""
TradingAgents-CN TTS API Routes
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
import logging

from ..tts import create_tts_adapter, list_supported_providers, get_voice_list

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tts", tags=["TTS"])

_tts_adapter = None

def get_tts_adapter() = _tts_adapter


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=5000)
    voice: Optional[str] = Field(None, max_length=100)
    provider: Optional[str] = Field("edge", max_length=50)
    rate: Optional[str] = Field("+0%", max_length=20)
    volume: Optional[str] = Field("+0%", max_length=20)
    pitch: Optional[str] = Field("+0Hz", max_length=20)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("文本不能为空")
        return v


class TTSResponse(BaseModel):
    audio_base64: str
    format: str
    provider: str
    voice: str


class VoiceListResponse(BaseModel):
    provider: str
    voices: dict


def init_tts_adapter(provider: str = "edge", voice: Optional[str] = None):
    """初始化TTS适配器"""
    global _tts_adapter
    try:
        _tts_adapter = create_tts_adapter(provider=provider, voice=voice)
        logger.info(f"TTS适配器初始化成功: {provider}")
    except Exception as e:
        logger.error(f"TTS适配器初始化失败: {e}")
        _tts_adapter = None


@router.post("/synthesize", response_model=TTSResponse)
async def synthesize_speech(request: TTSRequest):
    """
    将文本转换为语音

    - **text**: 要转换的文本 (最多5000字符)
    - **voice**: 语音名称 (可选)
    - **provider**: TTS提供商 (默认edge)
    - **rate**: 语速调整 (如 "+10%", "-20%")
    - **volume**: 音量调整 (如 "+10%", "-20%")
    - **pitch**: 音调调整 (如 "+5Hz", "-10Hz")
    """
    try:
        adapter = create_tts_adapter(
            provider=request.provider or "edge",
            voice=request.voice
        )

        audio_data = await adapter.synthesize(
            request.text,
            rate=request.rate,
            volume=request.volume,
            pitch=request.pitch
        )

        import base64
        audio_base64 = base64.b64encode(audio_data).decode("utf-8")

        return TTSResponse(
            audio_base64=audio_base64,
            format="mp3",
            provider=adapter.get_provider_name(),
            voice=adapter.get_voice_name()
        )

    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"TTS依赖未安装: {str(e)}"
        )
    except Exception as e:
        logger.error(f"TTS合成失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"TTS合成失败: {str(e)}"
        )


@router.post("/synthesize/stream")
async def synthesize_speech_stream(request: TTSRequest):
    """
    流式合成语音

    返回流式音频数据
    """
    try:
        adapter = create_tts_adapter(
            provider=request.provider or "edge",
            voice=request.voice
        )

        async def generate():
            async for chunk in adapter.synthesize_stream(
                request.text,
                rate=request.rate,
                volume=request.volume,
                pitch=request.pitch
            ):
                yield chunk

        return StreamingResponse(
            generate(),
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f"attachment; filename=speech.mp3",
                "X-TTS-Provider": adapter.get_provider_name(),
                "X-TTS-Voice": adapter.get_voice_name(),
            }
        )

    except ImportError as e:
        raise HTTPException(
            status_code=503,
            detail=f"TTS依赖未安装: {str(e)}"
        )
    except Exception as e:
        logger.error(f"TTS流式合成失败: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"TTS流式合成失败: {str(e)}"
        )


@router.get("/voices", response_model=VoiceListResponse)
async def list_voices(provider: str = "edge"):
    """
    获取可用语音列表

    - **provider**: TTS提供商 (默认edge)
    """
    providers = list_supported_providers()
    if provider not in providers:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的提供商: {provider}。支持的: {providers}"
        )

    voices = get_voice_list(provider)
    return VoiceListResponse(provider=provider, voices=voices)


@router.get("/providers")
async def list_providers():
    """获取支持的TTS提供商列表"""
    return {
        "providers": list_supported_providers(),
        "default": "edge"
    }


@router.get("/health")
async def tts_health():
    """TTS服务健康检查"""
    try:
        adapter = create_tts_adapter(provider="edge")
        return {
            "status": "healthy",
            "provider": "edge",
            "voice": adapter.get_voice_name()
        }
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"TTS服务不可用: {str(e)}"
        )
