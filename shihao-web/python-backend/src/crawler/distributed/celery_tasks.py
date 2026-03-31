"""Distributed crawler tasks using Celery + Redis."""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Any
from ..types import CrawlResult, CrawlerStrategy

logger = logging.getLogger(__name__)


class JobStatus(Enum):
    PENDING = "pending"
    STARTED = "started"
    PROGRESS = "progress"
    SUCCESS = "success"
    FAILURE = "failure"
    RETRY = "retry"


@dataclass
class DistributedJob:
    """Distributed crawl job."""

    job_id: str
    url: str
    strategy: CrawlerStrategy
    status: JobStatus = JobStatus.PENDING
    progress: float = 0.0
    result: Optional[CrawlResult] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    metadata: dict = field(default_factory=dict)


class DistributedCrawler:
    """Distributed crawler with Celery + Redis backend.

    Features:
    - Async task submission
    - Progress tracking
    - Result aggregation
    - Retry logic
    - Rate limiting per worker
    """

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        celery_broker: str = "redis://localhost:6379/1",
        celery_backend: str = "redis://localhost:6379/2",
        max_workers: int = 4,
        rate_limit: int = 10,
    ):
        self.redis_url = redis_url
        self.celery_broker = celery_broker
        self.celery_backend = celery_backend
        self.max_workers = max_workers
        self.rate_limit = rate_limit
        self._jobs: dict[str, DistributedJob] = {}
        self._celery_app = None
        self._semaphore: Optional[asyncio.Semaphore] = None

    def _get_celery_app(self):
        """Lazy initialization of Celery app."""
        if self._celery_app is None:
            try:
                from celery import Celery

                self._celery_app = Celery(
                    "crawler",
                    broker=self.celery_broker,
                    backend=self.celery_backend,
                )
                self._celery_app.conf.update(
                    task_serializer="json",
                    accept_content=["json"],
                    result_serializer="json",
                    timezone="UTC",
                    enable_utc=True,
                    task_track_started=True,
                    task_acks_late=True,
                    worker_prefetch_multiplier=1,
                )
            except ImportError:
                logger.warning("Celery not installed, using local execution")
                return None
        return self._celery_app

    @property
    def semaphore(self) -> asyncio.Semaphore:
        """Get or create semaphore for concurrency control."""
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self.max_workers)
        return self._semaphore

    async def submit_job(
        self, url: str, strategy: CrawlerStrategy = CrawlerStrategy.AUTO, **kwargs
    ) -> str:
        """Submit a crawl job for distributed execution.

        Args:
            url: Target URL
            strategy: Crawling strategy
            **kwargs: Additional crawl options

        Returns:
            Job ID for tracking
        """
        import uuid

        job_id = str(uuid.uuid4())

        job = DistributedJob(job_id=job_id, url=url, strategy=strategy, metadata=kwargs)
        self._jobs[job_id] = job

        celery = self._get_celery_app()
        if celery:
            celery.send_task(
                "crawler.tasks.crawl_url",
                args=[job_id, url, strategy.value],
                kwargs=kwargs,
            )
        else:
            asyncio.create_task(
                self._execute_with_semaphore(job_id, url, strategy, **kwargs)
            )

        return job_id

    async def _execute_with_semaphore(
        self, job_id: str, url: str, strategy: CrawlerStrategy, **kwargs
    ):
        """Execute job with semaphore concurrency control."""
        async with self.semaphore:
            await self._execute_local(job_id, url, strategy, **kwargs)

    async def submit_batch(
        self,
        urls: list[str],
        strategy: CrawlerStrategy = CrawlerStrategy.AUTO,
        **kwargs,
    ) -> list[str]:
        """Submit multiple crawl jobs.

        Args:
            urls: List of target URLs
            strategy: Crawling strategy
            **kwargs: Additional crawl options

        Returns:
            List of job IDs
        """
        job_ids = []
        for url in urls:
            job_id = await self.submit_job(url, strategy, **kwargs)
            job_ids.append(job_id)
        return job_ids

    async def get_job_status(self, job_id: str) -> Optional[DistributedJob]:
        """Get job status and result.

        Args:
            job_id: Job ID

        Returns:
            DistributedJob or None if not found
        """
        if job_id in self._jobs:
            return self._jobs[job_id]

        celery = self._get_celery_app()
        if celery:
            try:
                result = celery.AsyncResult(job_id)
                if result.state == "PENDING":
                    return None
                job = DistributedJob(
                    job_id=job_id,
                    url="",
                    strategy=CrawlerStrategy.AUTO,
                    status=JobStatus(result.state),
                )
                if result.ready():
                    job.completed_at = datetime.now()
                    try:
                        job.result = result.get(timeout=1)
                    except Exception as e:
                        job.error = str(e)
                return job
            except Exception:
                return None
        return None

    async def wait_for_job(
        self, job_id: str, timeout: float = 60.0
    ) -> Optional[CrawlResult]:
        """Wait for job completion and return result.

        Args:
            job_id: Job ID
            timeout: Maximum wait time in seconds

        Returns:
            CrawlResult or None on timeout/error
        """
        try:
            import aioredis
        except ImportError:
            start_time = asyncio.get_event_loop().time()
            while asyncio.get_event_loop().time() - start_time < timeout:
                job = await self.get_job_status(job_id)
                if job and job.status in (JobStatus.SUCCESS, JobStatus.FAILURE):
                    return job.result if job.status == JobStatus.SUCCESS else None
                await asyncio.sleep(0.5)
            return None

        try:
            redis = await aioredis.create_redis_pool(self.redis_url)
            pubsub = redis.pubsub()
            channel = f"crawler:results:{job_id}"
            await pubsub.subscribe(channel)

            try:
                message = await asyncio.wait_for(
                    pubsub.get(encoding="utf-8"), timeout=timeout
                )
                if message and message["type"] == "message":
                    import json

                    data = json.loads(message["data"])
                    return data.get("result")
            except asyncio.TimeoutError:
                pass
            finally:
                await pubsub.unsubscribe(channel)
                redis.close()
        except Exception:
            start_time = asyncio.get_event_loop().time()
            while asyncio.get_event_loop().time() - start_time < timeout:
                job = await self.get_job_status(job_id)
                if job and job.status in (JobStatus.SUCCESS, JobStatus.FAILURE):
                    return job.result if job.status == JobStatus.SUCCESS else None
                await asyncio.sleep(0.5)

        return None

    async def _execute_local(
        self, job_id: str, url: str, strategy: CrawlerStrategy, **kwargs
    ):
        """Execute crawl locally (fallback when Celery unavailable)."""
        job = self._jobs.get(job_id)
        if not job:
            return

        job.status = JobStatus.STARTED
        job.started_at = datetime.now()

        try:
            from ..core.crawler_engine import CrawlerEngine

            engine = CrawlerEngine()
            result = await engine.crawl(url, strategy=strategy, **kwargs)
            job.result = result
            job.status = JobStatus.SUCCESS
        except Exception as e:
            job.error = str(e)
            job.status = JobStatus.FAILURE
            logger.error(f"Job {job_id} failed: {e}")
        finally:
            job.completed_at = datetime.now()


class CrawlTask:
    """Celery task wrapper for crawl operations."""

    def __init__(self):
        self._celery_task = None

    def register(self, celery_app):
        """Register as Celery task."""

        @celery_app.task(bind=True, name="crawler.tasks.crawl_url", max_retries=3)
        def crawl_url(self, job_id: str, url: str, strategy: str, **kwargs):
            """Celery task for crawling URL."""
            from ..core.crawler_engine import CrawlerEngine

            try:
                engine = CrawlerEngine()
                result = asyncio.run(
                    engine.crawl(url, strategy=CrawlerStrategy(strategy), **kwargs)
                )
                return result
            except Exception as e:
                self.retry(exc=e, countdown=60)


class CrawlWorker:
    """Worker process for distributed crawling."""

    def __init__(self, worker_id: str, redis_url: str = "redis://localhost:6379/0"):
        self.worker_id = worker_id
        self.redis_url = redis_url
        self._active_jobs: set[str] = set()
        self._rate_limiter = RateLimiter(redis_url)

    async def start(self):
        """Start worker."""
        import aioredis

        redis = await aioredis.create_redis_pool(self.redis_url)
        pubsub = redis.pubsub()
        await pubsub.subscribe("crawler:jobs")

        try:
            async for message in pubsub.iter():
                if message.type == "message":
                    await self._handle_job(message.data)
        finally:
            pubsub.close()
            redis.close()

    async def _handle_job(self, job_data: dict):
        """Handle incoming job."""
        job_id = job_data.get("job_id")
        if job_id in self._active_jobs:
            return

        if not await self._rate_limiter.acquire(self.worker_id):
            return

        self._active_jobs.add(job_id)
        try:
            result = await self._execute_job(job_data)
            await self._publish_result(job_id, result)
        finally:
            self._active_jobs.discard(job_id)
            await self._rate_limiter.release(self.worker_id)

    async def _execute_job(self, job_data: dict) -> CrawlResult:
        """Execute crawl job."""
        from ..core.crawler_engine import CrawlerEngine

        url = job_data["url"]
        strategy = CrawlerStrategy(job_data.get("strategy", "auto"))

        engine = CrawlerEngine()
        return await engine.crawl(url, strategy=strategy)

    async def _publish_result(self, job_id: str, result: CrawlResult):
        """Publish job result."""
        import aioredis
        import json

        redis = await aioredis.create_redis_pool(self.redis_url)
        try:
            await redis.publish(
                f"crawler:results:{job_id}",
                json.dumps({"job_id": job_id, "result": result}),
            )
        finally:
            redis.close()


class RateLimiter:
    """Redis-based distributed rate limiter."""

    def __init__(self, redis_url: str, max_calls: int = 10, window: int = 60):
        self.redis_url = redis_url
        self.max_calls = max_calls
        self.window = window

    async def acquire(self, key: str) -> bool:
        """Acquire rate limit permit."""
        import aioredis
        import time

        redis = await aioredis.create_redis_pool(self.redis_url)
        try:
            now = time.time()
            window_start = now - self.window

            pipe = redis.pipeline()
            pipe.zremrangebyscore(key, 0, window_start)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, self.window)
            results = await pipe.execute()

            count = results[1]
            return count < self.max_calls
        finally:
            redis.close()

    async def release(self, key: str):
        """Release rate limiter (cleanup old entries)."""
        import aioredis
        import time

        redis = await aioredis.create_redis_pool(self.redis_url)
        try:
            now = time.time()
            window_start = now - self.window
            await redis.zremrangebyscore(key, 0, window_start)
        finally:
            redis.close()
