from typing import Optional, Any
from ..types import CrawlResult, CrawlerStrategy


def normalize_scrapling_result(
    content: str, strategy: CrawlerStrategy, metadata: dict, success: bool = True
) -> CrawlResult:
    """Normalize scrapling result to standard format."""
    return CrawlResult(
        success=success and bool(content),
        content=content or "",
        strategy_used=strategy.value,
        metadata=metadata,
    )


def normalize_browser_use_result(
    content: str, strategy: CrawlerStrategy, metadata: dict, success: bool = True
) -> CrawlResult:
    """Normalize browser-use result to standard format."""
    return CrawlResult(
        success=success and bool(content),
        content=content or "",
        strategy_used=strategy.value,
        metadata=metadata,
    )
