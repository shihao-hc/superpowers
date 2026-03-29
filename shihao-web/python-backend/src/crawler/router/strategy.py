from ..types import CrawlerStrategy
from ..config import CrawlerConfig
from ..scrapers import ScraplingAdapter, BrowserUseAdapter

_scraper_cache: dict = {}


def get_scraper_for_strategy(strategy: CrawlerStrategy, config: CrawlerConfig = None):
    """Get scraper instance for strategy."""
    cache_key = (strategy, id(config))

    if cache_key not in _scraper_cache:
        if strategy == CrawlerStrategy.SCRAPLING:
            _scraper_cache[cache_key] = ScraplingAdapter(config)
        elif strategy == CrawlerStrategy.BROWSER_USE:
            _scraper_cache[cache_key] = BrowserUseAdapter(config)
        else:
            raise ValueError(f"Unknown strategy: {strategy}")

    return _scraper_cache[cache_key]
