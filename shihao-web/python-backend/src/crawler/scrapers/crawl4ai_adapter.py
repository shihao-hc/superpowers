"""Crawl4AI adapter for LLM-friendly web crawling."""

import logging
from dataclasses import dataclass, field
from typing import Optional, Any
from .base import BaseScraper
from ..types import CrawlResult, CrawlerStrategy
from ..config import CrawlerConfig
from ..exceptions import ScraperError

logger = logging.getLogger(__name__)


@dataclass
class Crawl4AIDefaults:
    """Default configurations for Crawl4AI."""

    markdown_generator: str = "default"
    content_filter: str = "pruning"
    filter_threshold: float = 0.48
    word_count_threshold: int = 1
    cache_mode: str = "bypass"


class Crawl4AIAdapter(BaseScraper):
    """Adapter for Crawl4AI - LLM-friendly web crawler.

    Features:
    - Smart Markdown generation with BM25 filtering
    - LLM-based structured data extraction
    - CSS/XPath schema extraction
    - Deep crawling with BFS/DFS strategies
    - Shadow DOM flattening
    - Anti-bot detection with proxy escalation
    - Crash recovery with state persistence
    """

    def __init__(self, config: Optional[CrawlerConfig] = None):
        super().__init__(config)
        self.defaults = Crawl4AIDefaults()
        self._browser_config = None
        self._crawler_config = None

    def supports(self, url: str) -> bool:
        """Crawl4AI supports all URLs."""
        return True

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Crawl using Crawl4AI.

        Args:
            url: Target URL
            **kwargs: Crawl4AI-specific options
                - extract_schema: JSON schema for structured extraction
                - llm_prompt: LLM extraction prompt
                - filter_content: Whether to use content filtering
                - screenshot: Whether to capture screenshot
                - deep_crawl: Enable deep crawling
                - max_depth: Max crawl depth
                - max_pages: Max pages to crawl

        Returns:
            CrawlResult with content and metadata
        """
        try:
            from crawl4ai import (
                AsyncWebCrawler,
                BrowserConfig,
                CrawlerRunConfig,
                CacheMode,
            )
        except ImportError:
            return self._error_result("crawl4ai not installed", url)

        try:
            browser_config = self._create_browser_config(kwargs)
            crawl_config = self._create_crawl_config(kwargs)

            async with AsyncWebCrawler(config=browser_config) as crawler:
                result = await crawler.arun(url=url, config=crawl_config)

                return self._normalize_result(result, url)

        except Exception as e:
            logger.error(f"Crawl4AI crawl failed for {url}: {e}")
            return self._error_result(str(e), url)

    def _create_browser_config(self, kwargs: dict) -> Any:
        """Create browser configuration."""
        try:
            from crawl4ai import BrowserConfig

            headless = kwargs.get("headless", True)
            verbose = kwargs.get("verbose", False)

            return BrowserConfig(
                headless=headless,
                verbose=verbose,
            )
        except ImportError:
            return None

    def _create_crawl_config(self, kwargs: dict) -> Any:
        """Create crawl configuration."""
        try:
            from crawl4ai import CrawlerRunConfig, CacheMode
            from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator
            from crawl4ai.content_filter_strategy import PruningContentFilter

            config_options = {}

            if kwargs.get("filter_content", True):
                config_options["markdown_generator"] = DefaultMarkdownGenerator(
                    content_filter=PruningContentFilter(
                        threshold=self.defaults.filter_threshold,
                        threshold_type="fixed",
                        min_word_threshold=0,
                    )
                )

            if kwargs.get("llm_prompt") and kwargs.get("extract_schema"):
                from crawl4ai import LLMExtractionStrategy, LLMConfig
                from crawl4ai.extraction_strategy import JsonCssExtractionStrategy

                schema = kwargs.get("extract_schema")
                if isinstance(schema, dict):
                    config_options["extraction_strategy"] = JsonCssExtractionStrategy(
                        schema=schema, verbose=False
                    )

            config_options["word_count_threshold"] = kwargs.get(
                "word_count_threshold", self.defaults.word_count_threshold
            )

            cache_mode = kwargs.get("cache_mode", "bypass")
            cache_mode_map = {
                "bypass": CacheMode.BYPASS,
                "enabled": CacheMode.ENABLED,
                "only": CacheMode.ONLY,
            }
            config_options["cache_mode"] = cache_mode_map.get(
                cache_mode, CacheMode.BYPASS
            )

            if kwargs.get("screenshot"):
                config_options["screenshot"] = True

            if kwargs.get("prefetch"):
                config_options["prefetch"] = True

            return CrawlerRunConfig(**config_options)

        except ImportError:
            return None

    def _normalize_result(self, result: Any, url: str) -> CrawlResult:
        """Normalize Crawl4AI result to standard format."""
        try:
            markdown = ""
            fit_markdown = ""
            html = ""
            links = []
            screenshot = None

            if hasattr(result, "markdown"):
                if hasattr(result.markdown, "raw_markdown"):
                    markdown = result.markdown.raw_markdown or ""
                if hasattr(result.markdown, "fit_markdown"):
                    fit_markdown = result.markdown.fit_markdown or ""

            if hasattr(result, "html"):
                html = result.html or ""

            if hasattr(result, "links"):
                links = [
                    link.get("href", "")
                    for link in (result.links or [])
                    if link.get("href")
                ]

            if hasattr(result, "screenshot"):
                screenshot = result.screenshot

            content = fit_markdown or markdown

            return CrawlResult(
                success=bool(content),
                content=content,
                strategy_used=CrawlerStrategy.CRAWL4AI.value,
                metadata={
                    "url": url,
                    "raw_markdown": markdown,
                    "html": html,
                    "links": links,
                    "screenshot": screenshot is not None,
                    "fit_markdown": fit_markdown,
                },
            )
        except Exception as e:
            logger.error(f"Failed to normalize Crawl4AI result: {e}")
            return self._error_result(str(e), url)

    def _error_result(self, error: str, url: str) -> CrawlResult:
        """Create error result."""
        return CrawlResult(
            success=False,
            content="",
            strategy_used=CrawlerStrategy.CRAWL4AI.value,
            metadata={"url": url, "error": error},
        )

    async def deep_crawl(
        self,
        url: str,
        strategy: str = "bfs",
        max_depth: int = 3,
        max_pages: int = 100,
        **kwargs,
    ) -> dict:
        """Perform deep crawling.

        Args:
            url: Starting URL
            strategy: Crawling strategy (bfs, dfs, best_first)
            max_depth: Maximum crawl depth
            max_pages: Maximum pages to crawl
            **kwargs: Additional options

        Returns:
            Deep crawl results
        """
        try:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
            from crawl4ai.deep_crawling import (
                BFSDeepCrawlStrategy,
                DFSDeepCrawlStrategy,
                BestFirstDeepCrawlStrategy,
            )
        except ImportError:
            return {"error": "crawl4ai not installed"}

        strategy_map = {
            "bfs": BFSDeepCrawlStrategy,
            "dfs": DFSDeepCrawlStrategy,
            "best_first": BestFirstDeepCrawlStrategy,
        }

        deep_strategy_class = strategy_map.get(strategy.lower(), BFSDeepCrawlStrategy)

        try:
            async with AsyncWebCrawler() as crawler:
                result = await crawler.arun(
                    url=url,
                    config=CrawlerRunConfig(
                        deep_crawl_strategy=deep_strategy_class(
                            max_depth=max_depth,
                            max_pages=max_pages,
                            include_external=kwargs.get("include_external", False),
                        ),
                        **kwargs,
                    ),
                )

                return {
                    "success": True,
                    "url": url,
                    "strategy": strategy,
                    "max_depth": max_depth,
                    "pages_crawled": len(result.links)
                    if hasattr(result, "links")
                    else 0,
                    "content": result.markdown.fit_markdown
                    if hasattr(result, "markdown")
                    else "",
                    "links": [link.get("href", "") for link in (result.links or [])],
                }
        except Exception as e:
            logger.error(f"Deep crawl failed: {e}")
            return {"error": str(e)}

    async def extract_structured(self, url: str, schema: dict, **kwargs) -> dict:
        """Extract structured data using CSS selectors.

        Args:
            url: Target URL
            schema: JSON schema for extraction
            **kwargs: Additional options

        Returns:
            Extracted structured data
        """
        try:
            from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig
            from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
        except ImportError:
            return {"error": "crawl4ai not installed"}

        try:
            async with AsyncWebCrawler() as crawler:
                result = await crawler.arun(
                    url=url,
                    config=CrawlerRunConfig(
                        extraction_strategy=JsonCssExtractionStrategy(
                            schema=schema, verbose=kwargs.get("verbose", False)
                        )
                    ),
                )

                if hasattr(result, "extracted_content"):
                    return {
                        "success": True,
                        "data": result.extracted_content,
                    }
                return {"success": False, "error": "No extracted content"}

        except Exception as e:
            logger.error(f"Structured extraction failed: {e}")
            return {"error": str(e)}
