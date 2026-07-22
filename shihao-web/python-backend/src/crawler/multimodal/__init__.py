"""Multimodal content extraction module.

Extracts text, images, videos, audio, and metadata from HTML/markdown.
"""

from .text_extractor import TextExtractor, TextExtractOptions
from .image_extractor import ImageExtractor, ImageExtractOptions, ImageInfo
from .video_extractor import VideoExtractor, VideoExtractOptions, VideoInfo
from .audio_extractor import AudioExtractor, AudioExtractOptions, AudioInfo
from .multimodal_extractor import (
    MultimodalExtractor,
    MultimodalExtractOptions,
    MultimodalResult,
)

__all__ = [
    # Text
    "TextExtractor",
    "TextExtractOptions",
    # Image
    "ImageExtractor",
    "ImageExtractOptions",
    "ImageInfo",
    # Video
    "VideoExtractor",
    "VideoExtractOptions",
    "VideoInfo",
    # Audio
    "AudioExtractor",
    "AudioExtractOptions",
    "AudioInfo",
    # Unified
    "MultimodalExtractor",
    "MultimodalExtractOptions",
    "MultimodalResult",
]
