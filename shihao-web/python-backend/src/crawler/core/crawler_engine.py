from typing import Optional
from ..config import CrawlerConfig
from ..types import CrawlerStrategy, CrawlResult
from ..router import CrawlerRouter
from ..exceptions import FallbackExhaustedError, ScraperError
from .fallback_chain import FallbackChain
from .retry_handler import RetryHandler


class CrawlerEngine:
    """High-level API for crawling with fallback and retry."""

    def __init__(self, config: Optional[CrawlerConfig] = None):
        self.config = config or CrawlerConfig()
        self.router = CrawlerRouter(self.config)
        self.fallback_chain = FallbackChain(self.config)
        self.retry_handler = RetryHandler(
            max_retries=self.config.max_retries, backoff=self.config.retry_backoff
        )

    async def crawl(
        self,
        url: str,
        strategy: Optional[CrawlerStrategy] = None,
        use_fallback: bool = True,
        use_retry: bool = True,
    ) -> CrawlResult:
        """High-level crawl with optional fallback and retry.

        Args:
            url: Target URL
            strategy: Optional explicit strategy
            use_fallback: Use fallback chain on failure
            use_retry: Retry on failure

        Returns:
            CrawlResult
        """
        try:
            if use_retry:
                return await self.retry_handler.execute(
                    self._do_crawl, url, strategy, use_fallback
                )
            return await self._do_crawl(url, strategy, use_fallback)
        except ScraperError as e:
            return {
                "success": False,
                "content": "",
                "strategy_used": "none",
                "metadata": {"error": str(e), "error_type": "validation"},
            }
        except FallbackExhaustedError as e:
            return {
                "success": False,
                "content": "",
                "strategy_used": "none",
                "metadata": {"error": str(e)},
            }

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
            return await self.router.route(url, strategy)
