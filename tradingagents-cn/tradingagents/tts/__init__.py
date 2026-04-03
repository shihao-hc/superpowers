"""
TradingAgents-CN TTS Module
Text-to-Speech adapters for voice output
"""

from .base_tts import BaseTTSAdapter, TTSResponse, VoiceProfile
from .edge_tts_adapter import EdgeTTSAdapter
from .kokoro_adapter import KokoroTTSAdapter, OllamaTTSAdapter
from .factory import create_tts_adapter, create_tts_from_config, list_supported_providers, get_voice_list

__all__ = [
    "BaseTTSAdapter",
    "TTSResponse",
    "VoiceProfile",
    "EdgeTTSAdapter",
    "KokoroTTSAdapter",
    "OllamaTTSAdapter",
    "create_tts_adapter",
    "create_tts_from_config",
    "list_supported_providers",
    "get_voice_list",
]
