"""Checkpoint and resume system for long-running tasks."""

import json
import os
import re
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional, Any
from pathlib import Path


@dataclass
class Checkpoint:
    """Checkpoint data for task state."""

    task_id: str
    step: int
    url_index: int
    timestamp: str
    data_count: int
    metadata: dict = field(default_factory=dict)


class CheckpointManager:
    """Manage task checkpoints for pause/resume."""

    MAX_TASK_ID_LENGTH = 128
    TASK_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")

    def __init__(self, task_id: str, data_dir: str = "Data"):
        import re

        if not task_id or len(task_id) > self.MAX_TASK_ID_LENGTH:
            raise ValueError(
                f"Invalid task_id: must be 1-{self.MAX_TASK_ID_LENGTH} chars"
            )
        if not self.TASK_ID_PATTERN.match(task_id):
            raise ValueError(
                f"Invalid task_id: only alphanumeric, underscore, hyphen allowed"
            )
        self.task_id = task_id
        self.data_dir = Path(data_dir).resolve()
        if not self.data_dir.exists():
            self.data_dir.mkdir(parents=True, exist_ok=True)
        self.task_dir = self._safe_join(self.data_dir, f"Task_{task_id}")
        self.checkpoint_file = self.task_dir / "checkpoint.json"
        self.steps_file = self.task_dir / "steps.txt"
        self._ensure_dirs()

    def _safe_join(self, base: Path, *parts: str) -> Path:
        """Safely join paths, preventing directory traversal."""
        result = base
        for part in parts:
            part_clean = (
                part.replace("..", "").replace("/", os.sep).replace("\\", os.sep)
            )
            result = result / part_clean
        if not str(result).startswith(str(base)):
            raise ValueError("Path traversal detected")
        return result

    def _ensure_dirs(self) -> None:
        """Ensure directories exist."""
        self.task_dir.mkdir(parents=True, exist_ok=True)
        (self.task_dir / "files").mkdir(exist_ok=True)
        (self.task_dir / "images").mkdir(exist_ok=True)
        (self.task_dir / "screenshots").mkdir(exist_ok=True)

    def save_checkpoint(
        self,
        step: int,
        url_index: int,
        data_count: int,
        metadata: Optional[dict] = None,
    ) -> None:
        """Save checkpoint to disk."""
        checkpoint = Checkpoint(
            task_id=self.task_id,
            step=step,
            url_index=url_index,
            timestamp=datetime.now().isoformat(),
            data_count=data_count,
            metadata=metadata or {},
        )

        tmp_file = self.checkpoint_file.with_suffix(".tmp")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(asdict(checkpoint), f, indent=2, ensure_ascii=False)

        tmp_file.replace(self.checkpoint_file)

        with open(self.steps_file, "w", encoding="utf-8") as f:
            f.write(str(step))

    def load_checkpoint(self) -> Optional[Checkpoint]:
        """Load checkpoint from disk."""
        if not self.checkpoint_file.exists():
            return None

        try:
            with open(self.checkpoint_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return Checkpoint(**data)
        except Exception:
            return None

    def get_start_step(self) -> int:
        """Get the starting step from checkpoint."""
        if self.steps_file.exists():
            try:
                with open(self.steps_file, "r", encoding="utf-8") as f:
                    return int(f.read().strip())
            except Exception:
                pass
        return 0

    def clear_checkpoint(self) -> None:
        """Clear checkpoint files."""
        if self.checkpoint_file.exists():
            self.checkpoint_file.unlink()
        if self.steps_file.exists():
            self.steps_file.unlink()

    def get_checkpoint_info(self) -> dict:
        """Get checkpoint information."""
        checkpoint = self.load_checkpoint()
        if checkpoint:
            return {
                "exists": True,
                "task_id": checkpoint.task_id,
                "step": checkpoint.step,
                "url_index": checkpoint.url_index,
                "data_count": checkpoint.data_count,
                "timestamp": checkpoint.timestamp,
                "metadata": checkpoint.metadata,
            }
        return {"exists": False}

    @property
    def download_folder(self) -> Path:
        """Get download folder path."""
        return self.task_dir / "files"

    @property
    def images_folder(self) -> Path:
        """Get images folder path."""
        return self.task_dir / "images"

    @property
    def screenshots_folder(self) -> Path:
        """Get screenshots folder path."""
        return self.task_dir / "screenshots"


class CheckpointAwareExecution:
    """Mixin for execution engines that support checkpoints."""

    def __init__(self):
        self._checkpoint_manager: Optional[CheckpointManager] = None
        self._last_save_time = 0
        self._save_interval = 10

    def enable_checkpoint(
        self,
        task_id: str,
        data_dir: str = "Data",
        save_interval: int = 10,
    ) -> None:
        """Enable checkpoint saving."""
        self._checkpoint_manager = CheckpointManager(task_id, data_dir)
        self._save_interval = save_interval

    def disable_checkpoint(self) -> None:
        """Disable checkpoint saving."""
        self._checkpoint_manager = None

    def _should_save_checkpoint(self) -> bool:
        """Check if checkpoint should be saved."""
        if not self._checkpoint_manager:
            return False

        current_time = time.time()
        if current_time - self._last_save_time >= self._save_interval:
            self._last_save_time = current_time
            return True
        return False

    def _save_checkpoint(
        self,
        step: int,
        url_index: int,
        data_count: int,
        metadata: Optional[dict] = None,
    ) -> None:
        """Save checkpoint if enabled."""
        if self._checkpoint_manager:
            self._checkpoint_manager.save_checkpoint(
                step, url_index, data_count, metadata
            )

    def _load_checkpoint(self) -> Optional[Checkpoint]:
        """Load checkpoint if exists."""
        if self._checkpoint_manager:
            return self._checkpoint_manager.load_checkpoint()
        return None
