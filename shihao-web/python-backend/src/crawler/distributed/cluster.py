"""Distributed crawler manager."""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
from .celery_tasks import DistributedJob, DistributedCrawler, JobStatus

logger = logging.getLogger(__name__)


@dataclass
class ClusterConfig:
    """Cluster configuration."""

    redis_url: str = "redis://localhost:6379/0"
    celery_broker: str = "redis://localhost:6379/1"
    celery_backend: str = "redis://localhost:6379/2"
    max_workers: int = 4
    rate_limit_per_worker: int = 10
    job_timeout: float = 300.0
    retry_attempts: int = 3
    retry_delay: float = 60.0


class CrawlCluster:
    """Manages a cluster of distributed crawlers.

    Features:
    - Job submission and tracking
    - Worker health monitoring
    - Load balancing
    - Result aggregation
    - Error handling
    """

    def __init__(self, config: Optional[ClusterConfig] = None):
        self.config = config or ClusterConfig()
        self.crawler = DistributedCrawler(
            redis_url=self.config.redis_url,
            celery_broker=self.config.celery_broker,
            celery_backend=self.config.celery_backend,
            max_workers=self.config.max_workers,
            rate_limit=self.config.rate_limit_per_worker,
        )
        self._workers: dict[str, dict] = {}
        self._jobs: dict[str, DistributedJob] = {}

    async def submit(
        self,
        urls: list[str],
        strategy: str = "auto",
        priority: int = 0,
        callback: Optional[callable] = None,
    ) -> list[str]:
        """Submit crawl jobs to cluster.

        Args:
            urls: List of URLs to crawl
            strategy: Crawling strategy
            priority: Job priority (higher = more important)
            callback: Optional callback for results

        Returns:
            List of job IDs
        """
        job_ids = await self.crawler.submit_batch(urls, strategy=strategy)
        for job_id in job_ids:
            self._jobs[job_id] = DistributedJob(
                job_id=job_id,
                url="",
                strategy=strategy,
                metadata={"priority": priority, "callback": callback},
            )
        return job_ids

    async def get_status(self, job_id: str) -> Optional[DistributedJob]:
        """Get job status."""
        return await self.crawler.get_job_status(job_id)

    async def get_batch_status(self, job_ids: list[str]) -> dict[str, DistributedJob]:
        """Get status of multiple jobs."""
        results = {}
        for job_id in job_ids:
            status = await self.get_status(job_id)
            if status:
                results[job_id] = status
        return results

    async def wait_all(
        self,
        job_ids: list[str],
        timeout: Optional[float] = None,
        progress_callback: Optional[callable] = None,
    ) -> dict[str, dict]:
        """Wait for all jobs to complete.

        Args:
            job_ids: List of job IDs
            timeout: Maximum wait time per job
            progress_callback: Optional callback for progress updates

        Returns:
            Dict mapping job_id to result
        """
        timeout = timeout or self.config.job_timeout
        results = {}
        pending = set(job_ids)

        while pending:
            completed = []
            for job_id in pending:
                status = await self.get_status(job_id)
                if status:
                    if status.status == JobStatus.SUCCESS:
                        results[job_id] = status.result or {}
                        completed.append(job_id)
                    elif status.status == JobStatus.FAILURE:
                        results[job_id] = {"error": status.error}
                        completed.append(job_id)

            for job_id in completed:
                pending.discard(job_id)

            if pending:
                if progress_callback:
                    progress_callback(len(job_ids) - len(pending), len(job_ids))
                await asyncio.sleep(1)

        return results

    async def aggregate_results(
        self, job_ids: list[str], merge_strategy: str = "concat"
    ) -> dict:
        """Aggregate results from multiple jobs.

        Args:
            job_ids: List of job IDs
            merge_strategy: How to merge results (concat, merge, first)

        Returns:
            Aggregated result
        """
        results = await self.wait_all(job_ids)

        if merge_strategy == "concat":
            return self._concat_results(results)
        elif merge_strategy == "merge":
            return self._merge_results(results)
        elif merge_strategy == "first":
            return self._first_result(results)
        else:
            return {"jobs": results}

    def _concat_results(self, results: dict) -> dict:
        """Concatenate all results."""
        combined = {
            "success": True,
            "urls": [],
            "contents": [],
            "errors": [],
        }
        for job_id, result in results.items():
            if "error" in result:
                combined["errors"].append({"job_id": job_id, "error": result["error"]})
            else:
                combined["urls"].append(result.get("url", ""))
                combined["contents"].append(result.get("content", ""))

        combined["total"] = len(results)
        combined["successful"] = len(combined["contents"])
        combined["failed"] = len(combined["errors"])
        return combined

    def _merge_results(self, results: dict) -> dict:
        """Merge results into single document."""
        merged = {
            "success": True,
            "pages": [],
            "metadata": {"total": len(results)},
        }
        for job_id, result in results.items():
            if "error" not in result:
                merged["pages"].append(
                    {
                        "url": result.get("url", ""),
                        "content": result.get("content", ""),
                        "metadata": result.get("metadata", {}),
                    }
                )
        return merged

    def _first_result(self, results: dict) -> dict:
        """Return first successful result."""
        for result in results.values():
            if "error" not in result:
                return result
        return {"error": "No successful results"}


class WorkerPool:
    """Manages a pool of crawler workers."""

    def __init__(self, cluster: CrawlCluster, num_workers: int = 4):
        self.cluster = cluster
        self.num_workers = num_workers
        self._workers: list = []
        self._running = False

    async def start(self):
        """Start all workers."""
        from .celery_tasks import CrawlWorker

        self._running = True
        for i in range(self.num_workers):
            worker = CrawlWorker(
                worker_id=f"worker-{i}",
                redis_url=self.cluster.config.redis_url,
            )
            self._workers.append(worker)
            asyncio.create_task(worker.start())

    async def stop(self):
        """Stop all workers."""
        self._running = False
        for worker in self._workers:
            worker._active_jobs.clear()


async def create_cluster(config: Optional[ClusterConfig] = None) -> CrawlCluster:
    """Create and initialize a crawl cluster."""
    cluster = CrawlCluster(config)
    logger.info(f"Created crawl cluster with config: {cluster.config}")
    return cluster
