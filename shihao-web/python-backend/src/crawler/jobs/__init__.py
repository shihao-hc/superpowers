"""Async job queue for long-running crawl operations."""

import asyncio
import uuid
import time
import logging
from typing import Optional, Callable, Awaitable, Any
from dataclasses import dataclass, field
from enum import Enum
from threading import Lock

logger = logging.getLogger(__name__)


class JobStatus(str, Enum):
    """Job status enum."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Job:
    """Crawl job representation."""

    job_id: str
    status: JobStatus
    url: str
    created_at: float
    completed_at: Optional[float] = None
    result: Optional[Any] = None
    error: Optional[str] = None
    progress: float = 0.0
    total_pages: int = 0
    completed_pages: int = 0
    metadata: dict = field(default_factory=dict)


class JobQueue:
    """In-memory job queue for async crawl operations."""

    def __init__(self, max_concurrent: int = 10):
        self._jobs: dict[str, Job] = {}
        self._lock = Lock()
        self._max_concurrent = max_concurrent
        self._semaphore = asyncio.Semaphore(max_concurrent)
        self._active_tasks: dict[str, asyncio.Task] = {}

    def create_job(self, url: str, metadata: dict = None) -> str:
        """Create a new job and return job ID."""
        job_id = str(uuid.uuid4())
        with self._lock:
            self._jobs[job_id] = Job(
                job_id=job_id,
                status=JobStatus.PENDING,
                url=url,
                created_at=time.time(),
                metadata=metadata or {},
            )
        logger.info(f"Created job {job_id} for URL: {url}")
        return job_id

    def get_job(self, job_id: str) -> Optional[Job]:
        """Get job by ID."""
        with self._lock:
            return self._jobs.get(job_id)

    def update_job(
        self,
        job_id: str,
        status: Optional[JobStatus] = None,
        result: Any = None,
        error: Optional[str] = None,
        progress: Optional[float] = None,
        total_pages: Optional[int] = None,
        completed_pages: Optional[int] = None,
    ) -> bool:
        """Update job status and progress."""
        with self._lock:
            job = self._jobs.get(job_id)
            if not job:
                return False

            if status:
                job.status = status
            if result is not None:
                job.result = result
            if error is not None:
                job.error = error
            if progress is not None:
                job.progress = progress
            if total_pages is not None:
                job.total_pages = total_pages
            if completed_pages is not None:
                job.completed_pages = completed_pages

            if status in (JobStatus.COMPLETED, JobStatus.FAILED):
                job.completed_at = time.time()

            return True

    def list_jobs(
        self, status: Optional[JobStatus] = None, limit: int = 100
    ) -> list[Job]:
        """List jobs, optionally filtered by status."""
        with self._lock:
            jobs = list(self._jobs.values())
            if status:
                jobs = [j for j in jobs if j.status == status]
            jobs.sort(key=lambda j: j.created_at, reverse=True)
            return jobs[:limit]

    async def submit(
        self,
        job_id: str,
        coro: Callable[[str], Awaitable[Any]],
        on_progress: Optional[Callable[[str, float, int, int], None]] = None,
    ) -> None:
        """Submit job for async execution."""
        async with self._semaphore:
            self.update_job(job_id, status=JobStatus.PROCESSING)

            try:
                logger.info(f"Starting job {job_id}")
                result = await coro(job_id)

                self.update_job(
                    job_id, status=JobStatus.COMPLETED, result=result, progress=1.0
                )
                logger.info(f"Job {job_id} completed successfully")

            except asyncio.CancelledError:
                self.update_job(job_id, status=JobStatus.CANCELLED)
                logger.info(f"Job {job_id} was cancelled")

            except Exception as e:
                self.update_job(job_id, status=JobStatus.FAILED, error=str(e))
                logger.error(f"Job {job_id} failed: {e}")

    def get_status(self, job_id: str) -> Optional[dict]:
        """Get job status as dict for API response."""
        job = self.get_job(job_id)
        if not job:
            return None

        return {
            "id": job.job_id,
            "status": job.status.value,
            "url": job.url,
            "created_at": job.created_at,
            "completed_at": job.completed_at,
            "progress": job.progress,
            "total_pages": job.total_pages,
            "completed_pages": job.completed_pages,
            "error": job.error,
            "metadata": job.metadata,
        }

    def get_result(self, job_id: str) -> Optional[Any]:
        """Get job result if completed."""
        job = self.get_job(job_id)
        if job and job.status == JobStatus.COMPLETED:
            return job.result
        return None

    def cancel_job(self, job_id: str) -> bool:
        """Cancel a pending or processing job."""
        job = self.get_job(job_id)
        if not job:
            return False

        if job.status in (JobStatus.PENDING, JobStatus.PROCESSING):
            self.update_job(job_id, status=JobStatus.CANCELLED)
            return True
        return False

    def cleanup_old_jobs(self, max_age_seconds: int = 3600) -> int:
        """Remove completed/failed jobs older than max_age."""
        current_time = time.time()
        removed = 0

        with self._lock:
            to_remove = [
                job_id
                for job_id, job in self._jobs.items()
                if job.completed_at
                and (current_time - job.completed_at) > max_age_seconds
            ]
            for job_id in to_remove:
                del self._jobs[job_id]
                removed += 1

        if removed:
            logger.info(f"Cleaned up {removed} old jobs")
        return removed

    @property
    def stats(self) -> dict:
        """Get queue statistics."""
        with self._lock:
            stats = {"total": len(self._jobs)}
            for status in JobStatus:
                stats[status.value] = len(
                    [j for j in self._jobs.values() if j.status == status]
                )
            return stats
