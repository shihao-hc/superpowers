"""Scraper registry for dynamic scraper management."""

from typing import Dict, Type, Optional, List, Callable
from .base import BaseScraper
from ..types import CrawlerStrategy
from ..config import CrawlerConfig


class ScraperRegistry:
    """Central registry for scraper adapters.

    This allows dynamic registration and instantiation of scrapers
    without hardcoded dependencies.

    Usage:
        @ScraperRegistry.register(CrawlerStrategy.SCRAPLING)
        class MyScraper(BaseScraper):
            ...

        scraper = ScraperRegistry.create(CrawlerStrategy.SCRAPLING, config)
    """

    _scrapers: Dict[CrawlerStrategy, Type[BaseScraper]] = {}
    _factories: Dict[CrawlerStrategy, Callable[[CrawlerConfig], BaseScraper]] = {}

    @classmethod
    def register(
        cls,
        strategy: CrawlerStrategy,
        factory: Optional[Callable[[CrawlerConfig], BaseScraper]] = None,
    ):
        """Register a scraper adapter.

        Can be used as a decorator:
            @ScraperRegistry.register(CrawlerStrategy.SCRAPLING)
            class MyScraper(BaseScraper):
                ...

        Or with a custom factory:
            def custom_factory(config):
                return CustomScraper(config, extra_arg=True)
            ScraperRegistry.register(CrawlerStrategy.MY_SCRAPER, custom_factory)
        """

        def decorator(klass: Type[BaseScraper]) -> Type[BaseScraper]:
            cls._scrapers[strategy] = klass
            return klass

        if factory is not None:
            cls._factories[strategy] = factory
            return lambda k: k
        return decorator

    @classmethod
    def create(cls, strategy: CrawlerStrategy, config: CrawlerConfig) -> BaseScraper:
        """Create a scraper instance.

        Args:
            strategy: The scraper strategy to create
            config: Configuration for the scraper

        Returns:
            Instance of the scraper

        Raises:
            ValueError: If strategy is AUTO or not registered
        """
        if strategy == CrawlerStrategy.AUTO:
            raise ValueError("Cannot create AUTO strategy directly, use router")

        if strategy not in cls._scrapers:
            raise ValueError(f"Scraper not registered: {strategy}")

        if strategy in cls._factories:
            return cls._factories[strategy](config)

        return cls._scrapers[strategy](config)

    @classmethod
    def get_registered_strategies(cls) -> List[CrawlerStrategy]:
        """Get list of registered scraper strategies."""
        return list(cls._scrapers.keys())

    @classmethod
    def is_registered(cls, strategy: CrawlerStrategy) -> bool:
        """Check if a strategy is registered."""
        return strategy in cls._scrapers


def register_default_scrapers():
    """Register all default scrapers."""
    from .scrapling_adapter import ScraplingAdapter
    from .browser_use_adapter import BrowserUseAdapter

    ScraperRegistry.register(CrawlerStrategy.SCRAPLING)(ScraplingAdapter)
    ScraperRegistry.register(CrawlerStrategy.BROWSER_USE)(BrowserUseAdapter)

    try:
        from .firecrawl_adapter import FirecrawlAdapter

        ScraperRegistry.register(CrawlerStrategy.FIRECRAWL)(FirecrawlAdapter)
    except ImportError:
        pass

    try:
        from .crawl4ai_adapter import Crawl4AIAdapter

        ScraperRegistry.register(CrawlerStrategy.CRAWL4AI)(Crawl4AIAdapter)
    except ImportError:
        pass

    try:
        from .pydoll_adapter import PydollScraper

        ScraperRegistry.register(CrawlerStrategy.PYDOLL)(PydollScraper)
    except ImportError:
        pass

    try:
        from .seleniumbase_adapter import SeleniumBaseScraper

        ScraperRegistry.register(CrawlerStrategy.SELENIUM_BASE)(SeleniumBaseScraper)
    except ImportError:
        pass
