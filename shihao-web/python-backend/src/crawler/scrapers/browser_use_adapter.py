from typing import Optional
from .base import BaseScraper
from .result import normalize_browser_use_result
from ..types import CrawlResult, CrawlerStrategy
from ..config import CrawlerConfig
from ..exceptions import ScraperError


class BrowserUseAdapter(BaseScraper):
    """Adapter for browser-use library (AI-driven scraping)."""

    def supports(self, url: str) -> bool:
        """Browser-use handles complex/dynamic pages."""
        complex_indicators = ["javascript", "spa", "react", "vue", "angular"]
        return any(ind in url.lower() for ind in complex_indicators)

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Crawl using browser-use."""
        try:
            from browser_use import Agent
            from langchain_openai import ChatOpenAI

            task = kwargs.get("task", "Extract all text content from this page")
            model = kwargs.get("model") or ChatOpenAI(model="gpt-4o")

            agent = Agent(task=task, llm=model)
            result = await agent.run(url)

            return normalize_browser_use_result(
                content=str(result),
                strategy=CrawlerStrategy.BROWSER_USE,
                metadata={"task": task, "url": url},
            )
        except ImportError:
            return normalize_browser_use_result(
                content="",
                strategy=CrawlerStrategy.BROWSER_USE,
                metadata={"error": "browser-use not installed", "url": url},
                success=False,
            )
        except Exception as e:
            raise ScraperError(f"Browser-use failed for {url}: {e}") from e
