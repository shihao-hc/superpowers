from enum import Enum
from typing import TypedDict, Optional, Any
from dataclasses import dataclass, field


class CrawlerStrategy(Enum):
    """Crawler selection strategy."""

    SCRAPLING = "scrapling"
    BROWSER_USE = "browser_use"
    FIRECRAWL = "firecrawl"
    AUTO = "auto"


class PageComplexity(Enum):
    """Detected page complexity level."""

    SIMPLE = "simple"
    COMPLEX = "complex"
    DYNAMIC = "dynamic"


class OutputFormat(Enum):
    """Supported output formats."""

    MARKDOWN = "markdown"
    HTML = "html"
    RAW_HTML = "rawHtml"
    JSON = "json"
    SCREENSHOT = "screenshot"
    LINKS = "links"
    BRANDING = "branding"


@dataclass
class ActionStep:
    """Single action step for page interaction."""

    action_type: str
    value: Optional[str] = None
    selector: Optional[str] = None
    key: Optional[str] = None
    milliseconds: Optional[int] = None


class CrawlResult(TypedDict):
    """Normalized crawl result."""

    success: bool
    content: str
    strategy_used: str
    metadata: dict
    format: str = "markdown"


class AsyncJobStatus(Enum):
    """Async job status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class AsyncJob:
    """Async crawl job."""

    job_id: str
    status: AsyncJobStatus
    url: str
    created_at: float
    completed_at: Optional[float] = None
    result: Optional[dict] = None
    error: Optional[str] = None
    progress: float = 0.0
    total_pages: int = 0
    completed_pages: int = 0


@dataclass
class MapResult:
    """URL map discovery result."""

    url: str
    title: Optional[str] = None
    description: Optional[str] = None


@dataclass
class StructuredSchema:
    """Schema for structured data extraction."""

    type: str = "object"
    properties: dict = field(default_factory=dict)
    required: list = field(default_factory=list)
