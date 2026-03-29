from typing import List, Optional
from ..types import CrawlResult, CrawlerStrategy
from ..scrapers import BaseScraper, ScraplingAdapter, BrowserUseAdapter
from ..config import CrawlerConfig
from ..exceptions import FallbackExhaustedError


class FallbackChain:
    """Executes multiple scrapers in sequence, falling back on failure."""

    def __init__(self, config: Optional[CrawlerConfig] = None):
        self.config = config or CrawlerConfig()
        self.scrapers: List[BaseScraper] = [
            ScraplingAdapter(self.config),
            BrowserUseAdapter(self.config),
        ]

    def set_scrapers(self, scrapers: List[BaseScraper]) -> None:
        """Set the scraper chain (in order of preference)."""
        self.scrapers = scrapers

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Try each scraper in order until one succeeds.

        Args:
            url: Target URL
            **kwargs: Options passed to each scraper

        Returns:
            CrawlResult from first successful scraper

        Raises:
            FallbackExhaustedError: All scrapers failed
        """
        errors = []

        for scraper in self.scrapers:
            if not scraper.supports(url):
                continue

            try:
                result = await scraper.crawl(url, **kwargs)
                if result["success"]:
                    return result
                errors.append(
                    f"{type(scraper).__name__}: {result['metadata'].get('error', 'unknown')}"
                )
            except Exception as e:
                errors.append(f"{type(scraper).__name__}: {str(e)}")

        raise FallbackExhaustedError(
            f"All scrapers failed for {url}. Errors: {'; '.join(errors)}"
        )
