from typing import Optional

from ..types import CrawlerStrategy
from ..config import CrawlerConfig
from ..scrapers import (
    ScraplingAdapter,
    BrowserUseAdapter,
    FirecrawlAdapter,
    Crawl4AIAdapter,
    StdlibAdapter,
)


def get_scraper_for_strategy(
    strategy: CrawlerStrategy, config: Optional[CrawlerConfig] = None
):
    """Get scraper instance for strategy."""
    if strategy == CrawlerStrategy.SCRAPLING:
        return ScraplingAdapter(config)
    elif strategy == CrawlerStrategy.BROWSER_USE:
        return BrowserUseAdapter(config)
    elif strategy == CrawlerStrategy.FIRECRAWL:
        return FirecrawlAdapter(config)
    elif strategy == CrawlerStrategy.CRAWL4AI:
        return Crawl4AIAdapter(config)
    elif strategy == CrawlerStrategy.AUTO:
        return StdlibAdapter(config)
    else:
        raise ValueError(f"Unknown strategy: {strategy}")
