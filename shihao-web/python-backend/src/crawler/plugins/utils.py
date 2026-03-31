from typing import Optional

from ..types import CrawlerStrategy
from ..security.url_validator import validate_url, is_url_safe


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
    """Validate URL to prevent SSRF attacks.

    Uses centralized URL validation from security.url_validator module.

    Args:
        url: URL to validate

    Raises:
        ValueError: If URL is invalid or potentially dangerous
    """
    validate_url(url)
