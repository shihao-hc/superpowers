from typing import Optional
import asyncio
from concurrent.futures import ThreadPoolExecutor
from .base import BaseScraper
from ..types import CrawlResult, CrawlerStrategy
from ..config import CrawlerConfig
from ..exceptions import ScraperError


class ScraplingAdapter(BaseScraper):
    """Adapter for static HTTP scraping using requests + BeautifulSoup."""

    def __init__(self, config: Optional[CrawlerConfig] = None):
        super().__init__(config)
        self._executor = ThreadPoolExecutor(max_workers=4)

    def supports(self, url: str) -> bool:
        """Works for most static pages."""
        return "api." not in url and not url.endswith(".json")

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Crawl using requests + BeautifulSoup."""
        loop = asyncio.get_event_loop()

        def _fetch():
            import requests
            from bs4 import BeautifulSoup

            selector = kwargs.get("selector", "body")
            timeout = self.config.default_timeout if self.config else 30

            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }

            response = requests.get(url, headers=headers, timeout=timeout)
            response.raise_for_status()

            soup = BeautifulSoup(response.text, "html.parser")

            if selector == "body":
                content = soup.get_text(separator="\n", strip=True)
            else:
                elements = soup.select(selector)
                content = "\n".join(
                    el.get_text(separator=" ", strip=True) for el in elements
                )

            return content

        try:
            content = await loop.run_in_executor(self._executor, _fetch)

            return {
                "success": bool(content),
                "content": content or "",
                "strategy_used": CrawlerStrategy.SCRAPLING.value,
                "metadata": {
                    "selector": kwargs.get("selector", "body"),
                    "url": url,
                    "method": "requests+beautifulsoup",
                },
            }
        except Exception as e:
            raise ScraperError(f"Static crawl failed for {url}: {e}") from e
