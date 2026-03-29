from typing import Optional
from urllib.parse import urlparse

from ..types import CrawlerStrategy


def parse_strategy(strategy: Optional[str]) -> Optional[CrawlerStrategy]:
    """Parse strategy string to enum.

    Args:
        strategy: Strategy string ("scrapling", "browser_use", "auto")

    Returns:
        CrawlerStrategy enum value or None
    """
    if not strategy:
        return None
    strategy_map = {
        "scrapling": CrawlerStrategy.SCRAPLING,
        "browser_use": CrawlerStrategy.BROWSER_USE,
        "auto": CrawlerStrategy.AUTO,
    }
    return strategy_map.get(strategy.lower(), CrawlerStrategy.AUTO)


def validate_url(url: str) -> None:
    """Validate that URL has proper scheme.

    Args:
        url: URL to validate

    Raises:
        ValueError: If URL is invalid
    """
    if not url or not url.startswith(("http://", "https://")):
        raise ValueError(f"Invalid URL: {url}")
