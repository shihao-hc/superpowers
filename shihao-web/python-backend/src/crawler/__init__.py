"""Hybrid Crawler Package - scrapling + browser-use + Firecrawl integration.

Features:
- Multi-format output (markdown, html, json, links, screenshot)
- Async job queue with status polling
- Page interaction actions (click, type, scroll, wait)
- URL discovery (site mapping)
- Structured data extraction
- Firecrawl cloud API integration
"""

__version__ = "0.2.0"

from .types import (
    CrawlerStrategy,
    PageComplexity,
    OutputFormat,
    ActionStep,
    CrawlResult,
    AsyncJobStatus,
    AsyncJob,
    MapResult,
    StructuredSchema,
)
from .config import (
    CrawlerConfig,
    ComplexityThresholds,
    ScraperConfig,
    AsyncJobConfig,
    ActionConfig,
)
from .core.crawler_engine import CrawlerEngine
from .core.enhanced_engine import EnhancedCrawlerEngine
from .router import CrawlerRouter
from .exceptions import (
    CrawlerError,
    ScraperError,
    ComplexityAnalysisError,
    FallbackExhaustedError,
)

__all__ = [
    "CrawlerStrategy",
    "PageComplexity",
    "OutputFormat",
    "ActionStep",
    "CrawlResult",
    "AsyncJobStatus",
    "AsyncJob",
    "MapResult",
    "StructuredSchema",
    "CrawlerConfig",
    "ComplexityThresholds",
    "ScraperConfig",
    "AsyncJobConfig",
    "ActionConfig",
    "CrawlerEngine",
    "EnhancedCrawlerEngine",
    "CrawlerRouter",
    "CrawlerError",
    "ScraperError",
    "ComplexityAnalysisError",
    "FallbackExhaustedError",
]
