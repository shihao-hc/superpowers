from typing import List, Optional
import logging

from ..types import CrawlResult, CrawlerStrategy
from ..scrapers.base import BaseScraper
from ..scrapers.registry import ScraperRegistry, register_default_scrapers
from ..config import CrawlerConfig
from ..exceptions import FallbackExhaustedError, ScraperError
from ..security.url_validator import validate_url, is_url_safe

logger = logging.getLogger(__name__)

register_default_scrapers()


class FallbackChain:
    """Executes multiple scrapers in sequence, falling back on failure."""

    DEFAULT_SCRAPERS = [
        CrawlerStrategy.SCRAPLING,
        CrawlerStrategy.BROWSER_USE,
    ]

    def __init__(
        self,
        config: Optional[CrawlerConfig] = None,
        scrapers: Optional[List[CrawlerStrategy]] = None,
    ):
        self.config = config or CrawlerConfig()
        self.scrapers: List[BaseScraper] = self._create_scrapers(
            scrapers or self.DEFAULT_SCRAPERS
        )

    def _create_scrapers(self, strategies: List[CrawlerStrategy]) -> List[BaseScraper]:
        """Create scraper instances from strategies using registry."""
        scrapers = []
        for strategy in strategies:
            try:
                scraper = ScraperRegistry.create(strategy, self.config)
                scrapers.append(scraper)
            except ValueError:
                pass
        return scrapers

    def set_scrapers(self, scrapers: List[BaseScraper]) -> None:
        """Set the scraper chain (in order of preference)."""
        self.scrapers = scrapers

    def set_strategies(self, strategies: List[CrawlerStrategy]) -> None:
        """Set scraper strategies (will be created via registry)."""
        self.scrapers = self._create_scrapers(strategies)

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Try each scraper in order until one succeeds.

        Args:
            url: Target URL
            **kwargs: Options passed to each scraper

        Returns:
            CrawlResult from first successful scraper

        Raises:
            ScraperError: If URL is invalid
            FallbackExhaustedError: All scrapers failed
        """
        try:
            validate_url(url)
        except ValueError as e:
            raise ScraperError(str(e))

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
