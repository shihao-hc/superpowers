from .base import BaseScraper
from .scrapling_adapter import ScraplingAdapter
from .browser_use_adapter import BrowserUseAdapter
from .firecrawl_adapter import FirecrawlAdapter
from .crawl4ai_adapter import Crawl4AIAdapter
from .pydoll_adapter import PydollScraper
from .seleniumbase_adapter import SeleniumBaseScraper
from .registry import ScraperRegistry, register_default_scrapers

__all__ = [
    "BaseScraper",
    "ScraplingAdapter",
    "BrowserUseAdapter",
    "FirecrawlAdapter",
    "Crawl4AIAdapter",
    "PydollScraper",
    "SeleniumBaseScraper",
    "ScraperRegistry",
    "register_default_scrapers",
]
