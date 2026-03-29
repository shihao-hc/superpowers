"""Enhanced crawler engine with all advanced features."""

import asyncio
import logging
import time
from typing import Optional, Any, Callable
from ..config import CrawlerConfig, AsyncJobConfig
from ..types import CrawlerStrategy, CrawlResult, OutputFormat, AsyncJob, AsyncJobStatus
from ..router import CrawlerRouter
from ..exceptions import FallbackExhaustedError
from ..core.fallback_chain import FallbackChain
from ..core.retry_handler import RetryHandler
from ..jobs import JobQueue, Job
from ..actions import Action, ActionExecutor, parse_actions
from ..discovery import SiteMapper, create_map_result_dict
from ..formatters import FormatterFactory
from ..scrapers import ScraplingAdapter, BrowserUseAdapter, FirecrawlAdapter

logger = logging.getLogger(__name__)


class EnhancedCrawlerEngine:
    """Enhanced crawler with multi-format output, async jobs, and actions."""

    def __init__(
        self,
        config: Optional[CrawlerConfig] = None,
        job_config: Optional[AsyncJobConfig] = None,
    ):
        self.config = config or CrawlerConfig()
        self.job_config = job_config or AsyncJobConfig()

        self.router = CrawlerRouter(self.config)
        self.fallback_chain = FallbackChain(self.config)
        self.retry_handler = RetryHandler(
            max_retries=self.config.max_retries, backoff=self.config.retry_backoff
        )

        self.job_queue = JobQueue(max_concurrent=self.job_config.max_concurrent_jobs)

        self.scrapers = {
            "scrapling": ScraplingAdapter(self.config),
            "browser_use": BrowserUseAdapter(self.config),
            "firecrawl": FirecrawlAdapter(self.config),
        }

    async def crawl(
        self,
        url: str,
        strategy: Optional[CrawlerStrategy] = None,
        formats: Optional[list[str]] = None,
        use_fallback: bool = True,
        use_retry: bool = True,
        prompt: Optional[str] = None,
        schema: Optional[dict] = None,
        actions: Optional[list[Action]] = None,
        **kwargs,
    ) -> dict:
        """Enhanced crawl with multi-format support.

        Args:
            url: Target URL
            strategy: Crawler strategy (scrapling/browser_use/firecrawl/auto)
            formats: Output formats (markdown, html, json, etc.)
            use_fallback: Use fallback chain on failure
            use_retry: Retry on failure
            prompt: Prompt for JSON extraction
            schema: JSON Schema for structured extraction
            actions: List of actions to perform before scraping

        Returns:
            Enhanced crawl result with multiple formats
        """
        formats = formats or self.config.default_formats
        result = {"url": url, "success": False, "formats": {}}

        try:
            if use_retry:
                crawl_result = await self.retry_handler.execute(
                    self._do_crawl, url, strategy, use_fallback
                )
            else:
                crawl_result = await self._do_crawl(url, strategy, use_fallback)

            result["success"] = crawl_result.get("success", False)
            result["strategy_used"] = crawl_result.get("strategy_used", "unknown")

            for fmt in formats:
                if fmt == "markdown":
                    result["formats"]["markdown"] = crawl_result.get("content", "")
                elif fmt == "html":
                    result["formats"]["html"] = crawl_result.get("content", "")
                elif fmt == "json":
                    result["formats"]["json"] = {
                        "status": "requires_llm_extraction",
                        "prompt": prompt,
                        "schema": schema,
                        "note": "Use LLM to extract structured data",
                    }
                elif fmt == "links":
                    result["formats"]["links"] = crawl_result.get("metadata", {}).get(
                        "links", []
                    )
                elif fmt == "screenshot":
                    result["formats"]["screenshot"] = crawl_result.get(
                        "metadata", {}
                    ).get("screenshot")

            result["metadata"] = crawl_result.get("metadata", {})

        except FallbackExhaustedError as e:
            result["error"] = str(e)
            logger.error(f"Crawl failed for {url}: {e}")

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Crawl error for {url}: {e}")

        return result

    async def _do_crawl(
        self,
        url: str,
        strategy: Optional[CrawlerStrategy] = None,
        use_fallback: bool = True,
    ) -> CrawlResult:
        """Internal crawl implementation."""
        if strategy and strategy != CrawlerStrategy.AUTO:
            return await self.router.route(url, strategy)
        elif use_fallback:
            return await self.fallback_chain.crawl(url)
        else:
            return await self.router.route(url, CrawlerStrategy.SCRAPLING)

    async def start_crawl_job(
        self,
        url: str,
        max_depth: int = 2,
        max_pages: int = 100,
        formats: Optional[list[str]] = None,
        **kwargs,
    ) -> str:
        """Start an async crawl job and return job ID.

        Args:
            url: Starting URL
            max_depth: Maximum crawl depth
            max_pages: Maximum pages to crawl
            formats: Output formats

        Returns:
            Job ID for status checking
        """
        job_id = self.job_queue.create_job(
            url,
            metadata={
                "max_depth": max_depth,
                "max_pages": max_pages,
                "formats": formats or self.config.default_formats,
            },
        )

        asyncio.create_task(
            self.job_queue.submit(
                job_id,
                lambda jid: self._run_crawl_job(
                    jid, url, max_depth, max_pages, formats, **kwargs
                ),
            )
        )

        return job_id

    async def _run_crawl_job(
        self,
        job_id: str,
        url: str,
        max_depth: int,
        max_pages: int,
        formats: Optional[list[str]],
        **kwargs,
    ) -> dict:
        """Internal job execution."""
        results = []
        mapper = SiteMapper(max_depth=max_depth, max_links=max_pages)

        self.job_queue.update_job(job_id, total_pages=max_pages)

        map_result = await mapper.map_url(url)
        map_dict = create_map_result_dict(map_result)

        for i, link in enumerate(map_result.links[:max_pages]):
            self.job_queue.update_job(
                job_id,
                completed_pages=i + 1,
                progress=(i + 1) / min(len(map_result.links), max_pages),
            )

            page_result = await self.crawl(link.url, formats=formats, **kwargs)
            results.append({"url": link.url, "result": page_result})

        final_result = {
            "url": url,
            "total_pages": len(results),
            "map": map_dict,
            "pages": results,
        }

        return final_result

    def get_job_status(self, job_id: str) -> Optional[dict]:
        """Get status of an async job."""
        return self.job_queue.get_status(job_id)

    def get_job_result(self, job_id: str) -> Optional[Any]:
        """Get result of a completed job."""
        return self.job_queue.get_result(job_id)

    async def map_url(
        self,
        url: str,
        search: Optional[str] = None,
        max_depth: int = 2,
        max_links: int = 1000,
    ) -> dict:
        """Map URLs on a website.

        Args:
            url: Starting URL
            search: Optional search query to filter links
            max_depth: Maximum crawl depth
            max_links: Maximum links to discover

        Returns:
            Map result with discovered links
        """
        mapper = SiteMapper(max_depth=max_depth, max_links=max_links)
        result = await mapper.map_url(url, search)

        if search:
            filtered_links = await mapper.search_links(result.links, search)
            result.links = filtered_links

        return create_map_result_dict(result)

    async def extract_structured(
        self,
        url: str,
        prompt: str,
        schema: Optional[dict] = None,
        strategy: Optional[CrawlerStrategy] = None,
    ) -> dict:
        """Extract structured data from URL using LLM.

        Args:
            url: Target URL
            prompt: Prompt for extraction
            schema: JSON Schema for structured output
            strategy: Crawler strategy

        Returns:
            Extracted structured data
        """
        result = await self.crawl(url, formats=["markdown"], strategy=strategy)

        if not result.get("success"):
            return {"success": False, "error": result.get("error", "Crawl failed")}

        content = result.get("formats", {}).get("markdown", "")

        return {
            "success": True,
            "content": content,
            "prompt": prompt,
            "schema": schema,
            "note": "Use LLM to extract structured data based on prompt/schema",
        }

    @property
    def stats(self) -> dict:
        """Get engine statistics."""
        return {
            "job_queue": self.job_queue.stats,
            "config": {
                "max_retries": self.config.max_retries,
                "default_formats": self.config.default_formats,
                "enable_fallback": self.config.enable_fallback,
            },
        }
