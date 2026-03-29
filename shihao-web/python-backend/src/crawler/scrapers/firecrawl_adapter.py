"""Firecrawl adapter for cloud-based web scraping."""

import os
import logging
from typing import Optional, Any
from .base import BaseScraper
from ..types import CrawlResult, CrawlerStrategy
from ..config import CrawlerConfig
from ..exceptions import ScraperError

logger = logging.getLogger(__name__)


class FirecrawlAdapter(BaseScraper):
    """Adapter for Firecrawl cloud API."""

    def __init__(self, config: Optional[CrawlerConfig] = None):
        super().__init__(config)
        self._api_key = os.getenv("FIRECRAWL_API_KEY", "")
        self._base_url = os.getenv("FIRECRAWL_API_URL", "https://api.firecrawl.dev")

    def supports(self, url: str) -> bool:
        """Firecrawl supports all URLs."""
        return True

    def _make_request(self, endpoint: str, data: dict) -> dict:
        """Make request to Firecrawl API."""
        try:
            import requests
        except ImportError:
            raise ScraperError("requests library not installed")

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        url = f"{self._base_url}/{endpoint.lstrip('/')}"

        try:
            response = requests.post(url, json=data, headers=headers, timeout=60)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            raise ScraperError(f"Firecrawl API error: {e}") from e

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Crawl using Firecrawl API."""
        if not self._api_key:
            return {
                "success": False,
                "content": "",
                "strategy_used": CrawlerStrategy.FIRECRAWL.value,
                "metadata": {"error": "FIRECRAWL_API_KEY not set"},
                "format": "markdown",
            }

        try:
            formats = kwargs.get("formats", ["markdown"])
            only_main_content = kwargs.get("only_main_content", True)

            data = {
                "url": url,
                "formats": formats,
                "onlyMainContent": only_main_content,
            }

            if "json" in formats and kwargs.get("schema"):
                data["schema"] = kwargs.get("schema")

            if "json" in formats and kwargs.get("prompt"):
                data["prompt"] = kwargs.get("prompt")

            result = await self._async_make_request("v1/scrape", data)

            if result.get("success"):
                content = result.get("data", {}).get("markdown", "")
                for fmt in formats:
                    if fmt in result.get("data", {}):
                        if fmt != "markdown":
                            content = result.get("data", {}).get(fmt, content)

                return {
                    "success": True,
                    "content": content,
                    "strategy_used": CrawlerStrategy.FIRECRAWL.value,
                    "metadata": {
                        "url": url,
                        "title": result.get("data", {})
                        .get("metadata", {})
                        .get("title"),
                        "status_code": result.get("data", {})
                        .get("metadata", {})
                        .get("statusCode"),
                    },
                    "format": formats[0] if formats else "markdown",
                }
            else:
                return {
                    "success": False,
                    "content": "",
                    "strategy_used": CrawlerStrategy.FIRECRAWL.value,
                    "metadata": {"error": result.get("error", "Unknown error")},
                    "format": "markdown",
                }

        except Exception as e:
            raise ScraperError(f"Firecrawl crawl failed for {url}: {e}") from e

    async def _async_make_request(self, endpoint: str, data: dict) -> dict:
        """Make async request to Firecrawl API."""
        import asyncio

        try:
            import aiohttp
        except ImportError:
            return self._make_request(endpoint, data)

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        url = f"{self._base_url}/{endpoint.lstrip('/')}"

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url, json=data, headers=headers, timeout=60
                ) as resp:
                    return await resp.json()
        except Exception as e:
            logger.error(f"Firecrawl async request failed: {e}")
            return {"success": False, "error": str(e)}

    async def batch_scrape(self, urls: list[str], **kwargs) -> dict:
        """Batch scrape multiple URLs."""
        if not self._api_key:
            return {"success": False, "error": "FIRECRAWL_API_KEY not set"}

        data = {"urls": urls, "scrapeOptions": kwargs.get("scrape_options", {})}

        result = await self._async_make_request("v1/batch_scrape", data)
        return result

    async def map(self, url: str, **kwargs) -> dict:
        """Map URLs on a website."""
        if not self._api_key:
            return {"success": False, "error": "FIRECRAWL_API_KEY not set"}

        data = {
            "url": url,
        }

        if kwargs.get("search"):
            data["search"] = kwargs.get("search")

        result = await self._async_make_request("v1/map", data)
        return result

    async def search(self, query: str, **kwargs) -> dict:
        """Search the web."""
        if not self._api_key:
            return {"success": False, "error": "FIRECRAWL_API_KEY not set"}

        data = {"query": query, "limit": kwargs.get("limit", 10)}

        if kwargs.get("scrape_options"):
            data["scrapeOptions"] = kwargs.get("scrape_options")

        result = await self._async_make_request("v1/search", data)
        return result

    async def crawl_website(self, url: str, **kwargs) -> dict:
        """Start a crawl job for a website."""
        if not self._api_key:
            return {"success": False, "error": "FIRECRAWL_API_KEY not set"}

        data = {
            "url": url,
            "limit": kwargs.get("limit", 100),
            "scrapeOptions": kwargs.get("scrape_options", {}),
        }

        if kwargs.get("max_depth"):
            data["maxDepth"] = kwargs.get("max_depth")

        result = await self._async_make_request("v1/crawl", data)
        return result

    def get_crawl_status(self, job_id: str) -> dict:
        """Get status of a crawl job."""
        if not self._api_key:
            return {"status": "error", "error": "FIRECRAWL_API_KEY not set"}

        import requests

        headers = {"Authorization": f"Bearer {self._api_key}"}
        url = f"{self._base_url}/v1/crawl/{job_id}"

        try:
            response = requests.get(url, headers=headers, timeout=30)
            return response.json()
        except Exception as e:
            return {"status": "error", "error": str(e)}
