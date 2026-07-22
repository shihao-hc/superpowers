"""AI analysis module - OCR, keyframes, captions, video analysis."""

from .ocr import (
    OCRResult,
    OCREngine,
    SimpleOCREngine,
    batch_ocr,
)
from .keyframe import (
    KeyFrame,
    KeyFrameExtractor,
    KeyFrameExtractionResult,
)
from .image_caption import (
    CaptionResult,
    ImageCaptioner,
    OllamaVision,
)
from .video_analysis import (
    VideoAnalysisResult,
    VideoAnalyzer,
    SpeechTranscriber,
)

__all__ = [
    # OCR
    "OCRResult",
    "OCREngine",
    "SimpleOCREngine",
    "batch_ocr",
    # Keyframe
    "KeyFrame",
    "KeyFrameExtractor",
    "KeyFrameExtractionResult",
    # Caption
    "CaptionResult",
    "ImageCaptioner",
    "OllamaVision",
    # Video
    "VideoAnalysisResult",
    "VideoAnalyzer",
    "SpeechTranscriber",
]
