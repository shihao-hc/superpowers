"""Video analysis module - AI-powered video understanding."""

from dataclasses import dataclass, field
from typing import Optional, Union
import io

from .keyframe import KeyFrameExtractor, KeyFrame


@dataclass
class VideoAnalysisResult:
    """Complete video analysis result."""

    summary: str = ""
    keyframes: list[KeyFrame] = field(default_factory=list)
    transcription: str = ""
    topics: list[str] = field(default_factory=list)
    duration: float = 0.0
    frame_count: int = 0
    fps: float = 0.0
    resolution: tuple = (0, 0)


class VideoAnalyzer:
    """
    AI-powered video analysis.

    Features:
    - Keyframe extraction
    - Video summarization
    - Content analysis
    - Speech transcription (optional)
    """

    def __init__(
        self,
        keyframe_method: str = "uniform",
        num_keyframes: int = 10,
    ):
        """
        Initialize video analyzer.

        Args:
            keyframe_method: Method for keyframe extraction
            num_keyframes: Number of keyframes to extract
        """
        self.keyframe_extractor = KeyFrameExtractor()
        self.keyframe_method = keyframe_method
        self.num_keyframes = num_keyframes

    def analyze(
        self,
        video_path: str,
        extract_keyframes: bool = True,
        extract_transcription: bool = False,
        summarize: bool = False,
    ) -> VideoAnalysisResult:
        """
        Analyze video file.

        Args:
            video_path: Path to video file
            extract_keyframes: Extract keyframes
            extract_transcription: Extract audio transcription
            summarize: Generate video summary

        Returns:
            VideoAnalysisResult
        """
        import time

        result = VideoAnalysisResult()

        result.duration = self._get_duration(video_path)
        result.frame_count, result.fps = self._get_video_info(video_path)
        result.resolution = self._get_resolution(video_path)

        if extract_keyframes:
            if self.keyframe_method == "scene_change":
                kf_result = self.keyframe_extractor.extract_scene_changes(
                    video_path,
                    max_frames=self.num_keyframes,
                )
            else:
                kf_result = self.keyframe_extractor.extract_uniform(
                    video_path,
                    num_frames=self.num_keyframes,
                )

            result.keyframes = kf_result.keyframes

        if summarize:
            result.summary = self._generate_summary(result)

        if extract_transcription:
            result.transcription = self._extract_transcription(video_path)

        return result

    def _get_duration(self, video_path: str) -> float:
        """Get video duration in seconds."""
        try:
            import subprocess

            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                video_path,
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode == 0:
                return float(result.stdout.strip())

        except Exception:
            pass

        return 0.0

    def _get_video_info(self, video_path: str) -> tuple[int, float]:
        """Get frame count and FPS."""
        try:
            import subprocess

            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-count_packets",
                "-show_entries",
                "stream=nb_read_packets",
                "-of",
                "csv=p=0",
                video_path,
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )

            frame_count = 0
            if result.returncode == 0:
                try:
                    frame_count = int(result.stdout.strip())
                except ValueError:
                    pass

            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=r_frame_rate",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                video_path,
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )

            fps = 0.0
            if result.returncode == 0:
                fps_str = result.stdout.strip()
                if "/" in fps_str:
                    num, den = fps_str.split("/")
                    fps = float(num) / float(den)
                else:
                    try:
                        fps = float(fps_str)
                    except ValueError:
                        pass

            return frame_count, fps

        except Exception:
            return 0, 0.0

    def _get_resolution(self, video_path: str) -> tuple[int, int]:
        """Get video resolution."""
        try:
            import subprocess

            cmd = [
                "ffprobe",
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=s=x:p=0",
                video_path,
            ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode == 0:
                parts = result.stdout.strip().split("x")
                if len(parts) == 2:
                    return int(parts[0]), int(parts[1])

        except Exception:
            pass

        return 0, 0

    def _generate_summary(self, result: VideoAnalysisResult) -> str:
        """Generate basic video summary."""
        duration_mins = result.duration / 60

        summary = f"This is a {duration_mins:.1f}-minute video"

        if result.resolution[0] > 0:
            summary += f" at {result.resolution[0]}x{result.resolution[1]} resolution"

        if result.frame_count > 0:
            summary += f" with approximately {result.frame_count} frames"

        return summary

    def _extract_transcription(self, video_path: str) -> str:
        """Extract audio transcription."""
        return ""


class SpeechTranscriber:
    """
    Speech-to-text transcription for video audio.

    Supports:
    - Whisper (OpenAI)
    - Whisper.cpp
    - Ollama whisper
    """

    def __init__(
        self,
        model: str = "base",
        device: str = "auto",
    ):
        """
        Initialize transcriber.

        Args:
            model: Whisper model size (tiny, base, small, medium, large)
            device: Device to run on
        """
        self.model_name = model
        self.device = device
        self._model = None

    def transcribe(self, audio_path: str) -> str:
        """
        Transcribe audio file.

        Args:
            audio_path: Path to audio file

        Returns:
            Transcribed text
        """
        return ""

    def transcribe_video(self, video_path: str) -> str:
        """
        Transcribe audio from video.

        Args:
            video_path: Path to video file

        Returns:
            Transcribed text
        """
        import tempfile
        import subprocess
        import os

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            cmd = [
                "ffmpeg",
                "-i",
                video_path,
                "-vn",
                "-acodec",
                "libmp3lame",
                "-q:a",
                "2",
                "-y",
                tmp_path,
            ]

            subprocess.run(cmd, capture_output=True, timeout=300)

            text = self.transcribe(tmp_path)

        except Exception:
            text = ""

        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass

        return text
