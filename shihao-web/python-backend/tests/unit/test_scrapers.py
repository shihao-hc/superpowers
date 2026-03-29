import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import pytest
from crawler.scrapers import BaseScraper, ScraplingAdapter, BrowserUseAdapter
from crawler.scrapers.result import (
    normalize_scrapling_result,
    normalize_browser_use_result,
)
from crawler.types import CrawlResult, CrawlerStrategy
from crawler.config import CrawlerConfig
from crawler.exceptions import ScraperError


class TestBaseScraperAbstract:
    """Test BaseScraper cannot be instantiated."""

    def test_base_scraper_is_abc(self):
        """BaseScraper cannot be instantiated directly."""
        with pytest.raises(TypeError):
            BaseScraper()

    def test_base_scraper_with_config(self):
        """BaseScraper cannot be instantiated even with config."""
        config = CrawlerConfig()
        with pytest.raises(TypeError):
            BaseScraper(config)


class TestScraplingAdapter:
    """Test ScraplingAdapter implementation."""

    def test_scrapling_adapter_instantiates(self):
        """ScraplingAdapter can be instantiated."""
        adapter = ScraplingAdapter()
        assert adapter is not None

    def test_scrapling_adapter_with_config(self):
        """ScraplingAdapter accepts config."""
        config = CrawlerConfig(default_timeout=60)
        adapter = ScraplingAdapter(config)
        assert adapter.config.default_timeout == 60

    def test_supports_method_exists(self):
        """ScraplingAdapter has supports method."""
        adapter = ScraplingAdapter()
        assert hasattr(adapter, "supports")
        assert callable(adapter.supports)

    def test_supports_static_url(self):
        """ScraplingAdapter.supports returns True for static URLs."""
        adapter = ScraplingAdapter()
        assert adapter.supports("https://example.com/page.html") is True

    def test_supports_api_url(self):
        """ScraplingAdapter.supports returns False for API URLs."""
        adapter = ScraplingAdapter()
        assert adapter.supports("https://api.example.com/data") is False

    def test_supports_json_url(self):
        """ScraplingAdapter.supports returns False for JSON URLs."""
        adapter = ScraplingAdapter()
        assert adapter.supports("https://example.com/data.json") is False

    def test_crawl_method_exists(self):
        """ScraplingAdapter has crawl method."""
        adapter = ScraplingAdapter()
        assert hasattr(adapter, "crawl")
        assert callable(adapter.crawl)

    @pytest.mark.asyncio
    async def test_crawl_returns_crawl_result(self):
        """ScraplingAdapter.crawl returns CrawlResult."""
        adapter = ScraplingAdapter()
        result = await adapter.crawl("https://example.com")
        assert isinstance(result, dict)
        assert "success" in result
        assert "content" in result
        assert "strategy_used" in result
        assert "metadata" in result


class TestBrowserUseAdapter:
    """Test BrowserUseAdapter implementation."""

    def test_browser_use_adapter_instantiates(self):
        """BrowserUseAdapter can be instantiated."""
        adapter = BrowserUseAdapter()
        assert adapter is not None

    def test_browser_use_adapter_with_config(self):
        """BrowserUseAdapter accepts config."""
        config = CrawlerConfig(default_timeout=60)
        adapter = BrowserUseAdapter(config)
        assert adapter.config.default_timeout == 60

    def test_supports_method_exists(self):
        """BrowserUseAdapter has supports method."""
        adapter = BrowserUseAdapter()
        assert hasattr(adapter, "supports")
        assert callable(adapter.supports)

    def test_supports_complex_url(self):
        """BrowserUseAdapter.supports returns True for complex URLs."""
        adapter = BrowserUseAdapter()
        assert adapter.supports("https://example.com/react-app") is True
        assert adapter.supports("https://example.com/vue-spa") is True
        assert adapter.supports("https://example.com/angular") is True

    def test_supports_any_url(self):
        """BrowserUseAdapter.supports returns True for any URL (fallback)."""
        adapter = BrowserUseAdapter()
        assert adapter.supports("https://example.com/page.html") is True

    def test_crawl_method_exists(self):
        """BrowserUseAdapter has crawl method."""
        adapter = BrowserUseAdapter()
        assert hasattr(adapter, "crawl")
        assert callable(adapter.crawl)

    @pytest.mark.asyncio
    async def test_crawl_returns_crawl_result(self):
        """BrowserUseAdapter.crawl returns CrawlResult."""
        adapter = BrowserUseAdapter()
        result = await adapter.crawl("https://example.com")
        assert isinstance(result, dict)
        assert "success" in result
        assert "content" in result
        assert "strategy_used" in result
        assert "metadata" in result


class TestNormalizers:
    """Test result normalizer functions."""

    def test_normalize_scrapling_result_success(self):
        """normalize_scrapling_result creates valid CrawlResult."""
        result = normalize_scrapling_result(
            content="<html>test</html>",
            strategy=CrawlerStrategy.SCRAPLING,
            metadata={"selector": "body"},
        )
        assert result["success"] is True
        assert result["content"] == "<html>test</html>"
        assert result["strategy_used"] == "scrapling"
        assert result["metadata"]["selector"] == "body"

    def test_normalize_scrapling_result_empty_content(self):
        """normalize_scrapling_result handles empty content."""
        result = normalize_scrapling_result(
            content="",
            strategy=CrawlerStrategy.SCRAPLING,
            metadata={"url": "https://example.com"},
        )
        assert result["success"] is False
        assert result["content"] == ""

    def test_normalize_browser_use_result_success(self):
        """normalize_browser_use_result creates valid CrawlResult."""
        result = normalize_browser_use_result(
            content="Extracted content",
            strategy=CrawlerStrategy.BROWSER_USE,
            metadata={"task": "Extract text"},
        )
        assert result["success"] is True
        assert result["content"] == "Extracted content"
        assert result["strategy_used"] == "browser_use"

    def test_normalize_browser_use_result_empty_content(self):
        """normalize_browser_use_result handles empty content."""
        result = normalize_browser_use_result(
            content="",
            strategy=CrawlerStrategy.BROWSER_USE,
            metadata={"url": "https://example.com"},
        )
        assert result["success"] is False
        assert result["content"] == ""

    def test_normalizers_produce_identical_format(self):
        """Both normalizers produce identical output format."""
        scrapling_result = normalize_scrapling_result(
            content="test", strategy=CrawlerStrategy.SCRAPLING, metadata={}
        )
        browser_result = normalize_browser_use_result(
            content="test", strategy=CrawlerStrategy.BROWSER_USE, metadata={}
        )
        assert set(scrapling_result.keys()) == set(browser_result.keys())
        assert "success" in scrapling_result
        assert "content" in scrapling_result
        assert "strategy_used" in scrapling_result
        assert "metadata" in scrapling_result


class TestAdapterErrorHandling:
    """Test adapter error handling."""

    @pytest.mark.asyncio
    async def test_scrapling_import_error_returns_failure_result(self):
        """ScraplingAdapter handles ImportError gracefully."""
        import sys
        from unittest.mock import patch

        adapter = ScraplingAdapter()

        with patch.dict(sys.modules, {"scrapling": None}):
            pass

        result = await adapter.crawl("https://example.com")
        assert isinstance(result, dict)
