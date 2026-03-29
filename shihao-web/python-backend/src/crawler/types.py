from enum import Enum
from typing import TypedDict


class CrawlerStrategy(Enum):
    """Crawler selection strategy."""

    SCRAPLING = "scrapling"
    BROWSER_USE = "browser_use"
    AUTO = "auto"


class PageComplexity(Enum):
    """Detected page complexity level."""

    SIMPLE = "simple"
    COMPLEX = "complex"
    DYNAMIC = "dynamic"


class CrawlResult(TypedDict):
    """Normalized crawl result."""

    success: bool
    content: str
    strategy_used: str
    metadata: dict
