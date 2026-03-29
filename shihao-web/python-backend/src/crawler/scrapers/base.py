from abc import ABC, abstractmethod
from typing import Optional
from ..types import CrawlResult
from ..config import CrawlerConfig


class BaseScraper(ABC):
    """Abstract base class for all scrapers."""

    def __init__(self, config: Optional[CrawlerConfig] = None):
        self.config = config or CrawlerConfig()

    @abstractmethod
    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Crawl a URL and return normalized result.

        Args:
            url: Target URL to crawl
            **kwargs: Scraper-specific options

        Returns:
            CrawlResult with success status, content, and metadata
        """
        pass

    @abstractmethod
    def supports(self, url: str) -> bool:
        """Check if this scraper can handle the given URL.

        Args:
            url: URL to check

        Returns:
            True if scraper can handle this URL
        """
        pass
