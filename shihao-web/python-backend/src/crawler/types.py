from enum import Enum
from typing import TypedDict, Optional, Any
from dataclasses import dataclass, field


class CrawlerStrategy(Enum):
    """Crawler selection strategy."""

    SCRAPLING = "scrapling"
    BROWSER_USE = "browser_use"
    FIRECRAWL = "firecrawl"
    CRAWL4AI = "crawl4ai"
    PYDOLL = "pydoll"
    SELENIUM_BASE = "selenium_base"
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


class ExecutionNodeType(str, Enum):
    """Node types for tree execution (EasySpider patterns)."""

    SEQUENCE = "sequence"
    LOOP = "loop"
    BRANCH = "branch"
    BRANCH_OPTION = "branch_option"


class LoopIterationType(str, Enum):
    """Loop iteration types (EasySpider patterns)."""

    SINGLE_ELEMENT = "single_element"
    DYNAMIC_LIST = "dynamic_list"
    FIXED_LIST = "fixed_list"
    TEXT_LIST = "text_list"
    URL_LIST = "url_list"
    JS_RETURN = "js_return"
    OS_COMMAND = "os_command"
    PYTHON_EXPR = "python_expr"


class ConditionType(str, Enum):
    """Condition branch types (EasySpider patterns)."""

    NO_CONDITION = "no_condition"
    PAGE_CONTAINS_TEXT = "page_contains_text"
    PAGE_CONTAINS_ELEMENT = "page_contains_element"
    LOOP_ITEM_CONTAINS_TEXT = "loop_item_contains_text"
    LOOP_ITEM_CONTAINS_ELEMENT = "loop_item_contains_element"
    JS_RETURN = "js_return"
    OS_COMMAND = "os_command"
    PYTHON_EXPR = "python_expr"


class ContentExtractType(str, Enum):
    """Content extraction types."""

    TEXT = "text"
    DIRECT_TEXT = "direct_text"
    INNER_HTML = "inner_html"
    OUTER_HTML = "outer_html"
    BACKGROUND_IMAGE = "background_image"
    PAGE_URL = "page_url"
    PAGE_TITLE = "page_title"
    SELECTED_OPTION_VALUE = "selected_option_value"
    SELECTED_OPTION_TEXT = "selected_option_text"


class WaitStrategyType(str, Enum):
    """Wait strategy types."""

    VISIBLE = "visible"
    CLICKABLE = "clickable"
    PRESENT = "present"
    HIDDEN = "hidden"
    NETWORK_IDLE = "network_idle"
