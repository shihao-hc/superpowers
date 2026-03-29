from dataclasses import dataclass, field
from typing import Optional, Callable


@dataclass
class CrawlerConfig:
    """Main crawler configuration."""

    default_timeout: int = 30
    max_retries: int = 3
    retry_backoff: float = 1.5
    user_agent: Optional[str] = None
    headless: bool = True
    enable_fallback: bool = True
    default_formats: list = field(default_factory=lambda: ["markdown"])
    screenshot_quality: int = 80
    wait_for_selector_timeout: int = 10


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
    firecrawl: dict = field(default_factory=dict)
    impersonate: Optional[str] = None
    proxy: Optional[str] = None
    stealth: bool = False
    solve_cloudflare: bool = False


@dataclass
class AsyncJobConfig:
    """Configuration for async job processing."""

    max_concurrent_jobs: int = 10
    job_timeout: int = 300
    poll_interval: float = 1.0
    redis_url: Optional[str] = None


@dataclass
class ActionConfig:
    """Configuration for page actions."""

    actions: list = field(default_factory=list)
    wait_for_selector: Optional[str] = None
    wait_timeout: int = 10
