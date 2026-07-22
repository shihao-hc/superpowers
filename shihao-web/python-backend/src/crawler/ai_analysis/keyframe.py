"""Video keyframe extraction module."""

from dataclasses import dataclass, field
from typing import Optional, Union
import io


@dataclass
class KeyFrame:
    """Single keyframe from video."""

    frame_index: int
    timestamp: float
    image_data: Optional[bytes] = None
    image_path: Optional[str] = None
    features: dict = field(default_factory=dict)


@dataclass
class KeyFrameExtractionResult:
    """Result of keyframe extraction."""

    video_path: Optional[str]
    frame_count: int
    keyframes: list[KeyFrame]
    method: str
    extraction_time: float = 0.0


class KeyFrameExtractor:
    """
    Extract keyframes from videos.

    Methods:
    - Uniform sampling
    - Scene change detection
    - Shot boundary detection
    - Content-based selection
    """

    def __init__(self):
        self._ffmpeg_available = self._check_ffmpeg()

    def _check_ffmpeg(self) -> bool:
        """Check if ffmpeg is available."""
        try:
            import subprocess

            result = subprocess.run(
                ["ffmpeg", "-version"],
                capture_output=True,
                timeout=5,
            )
            return result.returncode == 0
        except Exception:
            return False

    def extract_uniform(
        self,
        video_path: str,
        num_frames: int = 10,
        output_dir: Optional[str] = None,
    ) -> KeyFrameExtractionResult:
        """
        Extract keyframes using uniform sampling.

        Args:
            video_path: Path to video file
            num_frames: Number of frames to extract
            output_dir: Directory to save frames

        Returns:
            KeyFrameExtractionResult
        """
        import time
        import os

        start_time = time.time()
        keyframes = []

        if not self._ffmpeg_available:
            return KeyFrameExtractionResult(
                video_path=video_path,
                frame_count=0,
                keyframes=[],
                method="uniform",
                extraction_time=time.time() - start_time,
            )

        try:
            import subprocess

            duration = self._get_video_duration(video_path)
            interval = duration / num_frames if duration > 0 else 1

            for i in range(num_frames):
                timestamp = i * interval

                output_path = None
                if output_dir:
                    filename = f"frame_{i:04d}.jpg"
                    output_path = os.path.join(output_dir, filename)

                frame_data = self._extract_frame(video_path, timestamp, output_path)

                keyframe = KeyFrame(
                    frame_index=i,
                    timestamp=timestamp,
                    image_data=frame_data if not output_path else None,
                    image_path=output_path,
                )
                keyframes.append(keyframe)

        except Exception:
            pass

        return KeyFrameExtractionResult(
            video_path=video_path,
            frame_count=len(keyframes),
            keyframes=keyframes,
            method="uniform",
            extraction_time=time.time() - start_time,
        )

    def extract_scene_changes(
        self,
        video_path: str,
        threshold: float = 30.0,
        min_distance: float = 1.0,
        max_frames: int = 50,
    ) -> KeyFrameExtractionResult:
        """
        Extract keyframes at scene changes.

        Args:
            video_path: Path to video file
            threshold: Scene change threshold
            min_distance: Minimum seconds between keyframes
            max_frames: Maximum keyframes to extract

        Returns:
            KeyFrameExtractionResult
        """
        import time

        start_time = time.time()
        keyframes = []

        if not self._ffmpeg_available:
            return KeyFrameExtractionResult(
                video_path=video_path,
                frame_count=0,
                keyframes=[],
                method="scene_change",
                extraction_time=time.time() - start_time,
            )

        try:
            frame_data_list = self._extract_all_frames(video_path)

            if not frame_data_list:
                return KeyFrameExtractionResult(
                    video_path=video_path,
                    frame_count=0,
                    keyframes=[],
                    method="scene_change",
                    extraction_time=time.time() - start_time,
                )

            import numpy as np
            from PIL import Image

            prev_hist = None
            keyframe_timestamps = []

            for idx, frame_bytes in enumerate(frame_data_list):
                frame = Image.open(io.BytesIO(frame_bytes))
                frame = frame.convert("RGB")

                hist = np.array(frame.histogram())
                hist = hist / hist.sum()

                if prev_hist is not None:
                    diff = np.sqrt(((hist - prev_hist) ** 2).sum())

                    if diff > threshold / 1000:
                        timestamp = idx * (1.0 / 30)

                        if (
                            not keyframe_timestamps
                            or (timestamp - keyframe_timestamps[-1]) >= min_distance
                        ):
                            keyframe_timestamps.append(timestamp)

                prev_hist = hist

                if len(keyframe_timestamps) >= max_frames:
                    break

            for i, timestamp in enumerate(keyframe_timestamps):
                keyframe = KeyFrame(
                    frame_index=i,
                    timestamp=timestamp,
                )
                keyframes.append(keyframe)

        except Exception:
            pass

        return KeyFrameExtractionResult(
            video_path=video_path,
            frame_count=len(keyframes),
            keyframes=keyframes,
            method="scene_change",
            extraction_time=time.time() - start_time,
        )

    def _get_video_duration(self, video_path: str) -> float:
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

    def _extract_frame(
        self,
        video_path: str,
        timestamp: float,
        output_path: Optional[str] = None,
    ) -> Optional[bytes]:
        """Extract single frame at timestamp."""
        try:
            import subprocess

            if output_path:
                cmd = [
                    "ffmpeg",
                    "-ss",
                    str(timestamp),
                    "-i",
                    video_path,
                    "-frames:v",
                    "1",
                    "-q:v",
                    "2",
                    "-y",
                    output_path,
                ]
                subprocess.run(cmd, capture_output=True, timeout=30)
                return None
            else:
                cmd = [
                    "ffmpeg",
                    "-ss",
                    str(timestamp),
                    "-i",
                    video_path,
                    "-frames:v",
                    "1",
                    "-f",
                    "image2pipe",
                    "-vcodec",
                    "png",
                    "-",
                ]

                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    timeout=30,
                )

                return result.stdout if result.returncode == 0 else None

        except Exception:
            return None

    def _extract_all_frames(
        self, video_path: str, max_frames: int = 300
    ) -> list[bytes]:
        """Extract frames for analysis."""
        try:
            import subprocess

            cmd = [
                "ffmpeg",
                "-i",
                video_path,
                "-vf",
                f"select=not(mod(n\\,{max_frames}))",
                "-vsync",
                "0",
                "-f",
                "image2pipe",
                "-vcodec",
                "png",
                "-",
            ]

            import numpy as np
            from PIL import Image
            import io

            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=60,
            )

            frames = []
            data = result.stdout

            png_signature = b"\x89PNG"
            positions = []

            pos = 0
            while True:
                pos = data.find(png_signature, pos)
                if pos == -1:
                    break
                positions.append(pos)
                pos += 1

            for i in range(len(positions) - 1):
                frame_data = data[positions[i] : positions[i + 1]]
                try:
                    Image.open(io.BytesIO(frame_data))
                    frames.append(frame_data)
                except Exception:
                    pass

            return frames

        except Exception:
            return []
