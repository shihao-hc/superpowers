from typing import Optional
from ..types import CrawlerStrategy


class RuleSelector:
    """Rule-based URL to strategy mapping."""

    SCRAPLING_PATTERNS = [
        ".html",
        ".htm",
        ".xml",
        "blog",
        "news",
        "article",
        "wiki",
        "docs",
        "documentation",
    ]

    BROWSER_USE_PATTERNS = [
        "dashboard",
        "app.",
        "webapp",
        "admin",
        "login",
        "javascript",
        "spa",
        "react",
        "vue",
        "angular",
    ]

    def select(self, url: str) -> Optional[CrawlerStrategy]:
        """Select strategy based on URL patterns.

        Returns:
            CrawlerStrategy if pattern matches, None for AUTO/unknown
        """
        url_lower = url.lower()

        for pattern in self.BROWSER_USE_PATTERNS:
            if pattern in url_lower:
                return CrawlerStrategy.BROWSER_USE

        for pattern in self.SCRAPLING_PATTERNS:
            if pattern in url_lower:
                return CrawlerStrategy.SCRAPLING

        return None
