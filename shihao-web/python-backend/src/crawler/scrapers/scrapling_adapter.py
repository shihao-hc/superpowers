from typing import Optional
from .base import BaseScraper
from .result import normalize_scrapling_result
from ..types import CrawlResult, CrawlerStrategy
from ..config import CrawlerConfig
from ..exceptions import ScraperError


class ScraplingAdapter(BaseScraper):
    """Adapter for scrapling library (rule-based scraping)."""

    def supports(self, url: str) -> bool:
        """Scrapling works for most static pages."""
        # Simple heuristic: no JS indicators in URL
        return "api." not in url and not url.endswith(".json")

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Crawl using scrapling."""
        try:
            import scrapling

            selector = kwargs.get("selector", "body")
            page = await scrapling.async_get(url, timeout=self.config.default_timeout)
            content = page.extract(selector)

            return normalize_scrapling_result(
                content=content,
                strategy=CrawlerStrategy.SCRAPLING,
                metadata={"selector": selector, "url": url},
            )
        except ImportError:
            return normalize_scrapling_result(
                content="",
                strategy=CrawlerStrategy.SCRAPLING,
                metadata={"error": "scrapling not installed", "url": url},
                success=False,
            )
        except Exception as e:
            raise ScraperError(f"Scrapling failed for {url}: {e}") from e
