from dataclasses import dataclass, field
from typing import Optional


@dataclass
class CrawlerConfig:
    """Main crawler configuration."""

    default_timeout: int = 30
    max_retries: int = 3
    retry_backoff: float = 1.5
    user_agent: Optional[str] = None
    headless: bool = True


@dataclass
class ComplexityThresholds:
    """Thresholds for complexity detection."""

    simple_max: float = 0.3
    complex_min: float = 0.7


@dataclass
class ScraperConfig:
    """Scraper-specific configuration."""

    scrapling: dict = field(default_factory=dict)
    browser_use: dict = field(default_factory=dict)
