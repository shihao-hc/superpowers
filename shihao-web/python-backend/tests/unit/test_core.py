import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from crawler.core import FallbackChain, RetryHandler, with_retry, CrawlerEngine
from crawler.config import CrawlerConfig
from crawler.types import CrawlResult
from crawler.exceptions import FallbackExhaustedError


class MockScraper:
    """Mock scraper for testing."""

    def __init__(self, should_succeed: bool = True, supports_url: bool = True):
        self.should_succeed = should_succeed
        self.supports_url_value = supports_url
        self.call_count = 0

    def supports(self, url: str) -> bool:
        return self.supports_url_value

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        self.call_count += 1
        if self.should_succeed:
            return {
                "success": True,
                "content": "test content",
                "strategy_used": "mock",
                "metadata": {},
            }
        return {
            "success": False,
            "content": "",
            "strategy_used": "mock",
            "metadata": {"error": "mock failed"},
        }


class TestFallbackChain:
    """Test FallbackChain implementation."""

    def test_instantiates_with_default_scrapers(self):
        """FallbackChain initializes with default scrapers."""
        chain = FallbackChain()
        assert chain.scrapers is not None
        assert len(chain.scrapers) == 2

    def test_instantiates_with_custom_config(self):
        """FallbackChain accepts custom config."""
        config = CrawlerConfig(default_timeout=60)
        chain = FallbackChain(config)
        assert chain.config.default_timeout == 60

    def test_set_scrapers(self):
        """FallbackChain.set_scrapers replaces scrapers."""
        chain = FallbackChain()
        custom_scrapers = [MockScraper(), MockScraper()]
        chain.set_scrapers(custom_scrapers)
        assert chain.scrapers == custom_scrapers

    @pytest.mark.asyncio
    async def test_returns_first_successful_result(self):
        """FallbackChain returns first successful scraper result."""
        chain = FallbackChain()
        chain.scrapers = [
            MockScraper(should_succeed=True),
            MockScraper(should_succeed=False),
        ]

        result = await chain.crawl("https://example.com")

        assert result["success"] is True
        assert result["content"] == "test content"

    @pytest.mark.asyncio
    async def test_tries_scrapers_in_order(self):
        """FallbackChain tries scrapers in order."""
        chain = FallbackChain()
        scraper1 = MockScraper(should_succeed=False)
        scraper2 = MockScraper(should_succeed=True)
        chain.scrapers = [scraper1, scraper2]

        result = await chain.crawl("https://example.com")

        assert scraper1.call_count == 1
        assert scraper2.call_count == 1

    @pytest.mark.asyncio
    async def test_skips_unsupported_urls(self):
        """FallbackChain skips scrapers that don't support URL."""
        chain = FallbackChain()
        chain.scrapers = [
            MockScraper(supports_url=False),
            MockScraper(should_succeed=True, supports_url=True),
        ]

        result = await chain.crawl("https://example.com")

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_raises_fallback_exhausted_error(self):
        """FallbackChain raises FallbackExhaustedError when all fail."""
        chain = FallbackChain()
        chain.scrapers = [
            MockScraper(should_succeed=False),
            MockScraper(should_succeed=False),
        ]

        with pytest.raises(FallbackExhaustedError) as exc_info:
            await chain.crawl("https://example.com")

        assert "All scrapers failed" in str(exc_info.value)
        assert "https://example.com" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_includes_all_errors_in_exception(self):
        """FallbackChain includes all errors in exception message."""
        chain = FallbackChain()
        chain.scrapers = [
            MockScraper(should_succeed=False),
            MockScraper(should_succeed=False),
        ]

        with pytest.raises(FallbackExhaustedError) as exc_info:
            await chain.crawl("https://example.com")

        error_msg = str(exc_info.value)
        assert "MockScraper" in error_msg


class TestRetryHandler:
    """Test RetryHandler implementation."""

    def test_instantiates_with_defaults(self):
        """RetryHandler initializes with default values."""
        handler = RetryHandler()
        assert handler.max_retries == 3
        assert handler.backoff == 1.5
        assert handler.initial_delay == 1.0

    def test_instantiates_with_custom_values(self):
        """RetryHandler accepts custom values."""
        handler = RetryHandler(max_retries=5, backoff=2.0, initial_delay=0.5)
        assert handler.max_retries == 5
        assert handler.backoff == 2.0
        assert handler.initial_delay == 0.5

    @pytest.mark.asyncio
    async def test_succeeds_on_first_attempt(self):
        """RetryHandler succeeds if function works on first try."""
        handler = RetryHandler()

        async def success_func():
            return "success"

        result = await handler.execute(success_func)
        assert result == "success"

    @pytest.mark.asyncio
    async def test_retries_on_failure(self):
        """RetryHandler retries on failure."""
        handler = RetryHandler(max_retries=3, initial_delay=0.01)
        call_count = 0

        async def fail_twice():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ValueError("fail")
            return "success"

        result = await handler.execute(fail_twice)
        assert result == "success"
        assert call_count == 3

    @pytest.mark.asyncio
    async def test_raises_last_exception_on_exhausted_retries(self):
        """RetryHandler raises last exception after all retries fail."""
        handler = RetryHandler(max_retries=2, initial_delay=0.01)

        async def always_fails():
            raise ValueError("persistent error")

        with pytest.raises(ValueError) as exc_info:
            await handler.execute(always_fails)

        assert str(exc_info.value) == "persistent error"


class TestWithRetryDecorator:
    """Test with_retry decorator."""

    @pytest.mark.asyncio
    async def test_decorator_retry(self):
        """with_retry decorator retries on failure."""
        call_count = 0

        @with_retry(max_retries=2, backoff=1.0, initial_delay=0.01)
        async def fail_twice():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise ValueError("fail")
            return "success"

        result = await fail_twice()
        assert result == "success"
        assert call_count == 3


class TestCrawlerEngine:
    """Test CrawlerEngine implementation."""

    def test_instantiates(self):
        """CrawlerEngine initializes all components."""
        engine = CrawlerEngine()
        assert engine.router is not None
        assert engine.fallback_chain is not None
        assert engine.retry_handler is not None

    def test_instantiates_with_config(self):
        """CrawlerEngine accepts custom config."""
        config = CrawlerConfig(max_retries=5, retry_backoff=2.0)
        engine = CrawlerEngine(config)
        assert engine.config.max_retries == 5
        assert engine.retry_handler.max_retries == 5

    @pytest.mark.asyncio
    async def test_crawl_with_fallback_and_retry(self):
        """CrawlerEngine.crawl uses both fallback and retry."""
        engine = CrawlerEngine()
        engine.fallback_chain.crawl = AsyncMock(
            return_value={
                "success": True,
                "content": "test",
                "strategy_used": "auto",
                "metadata": {},
            }
        )

        result = await engine.crawl(
            "https://example.com", use_fallback=True, use_retry=True
        )

        assert result["success"] is True
        engine.fallback_chain.crawl.assert_called_once()

    @pytest.mark.asyncio
    async def test_crawl_without_fallback(self):
        """CrawlerEngine.crawl can skip fallback."""
        engine = CrawlerEngine()
        engine.router.route = AsyncMock(
            return_value={
                "success": True,
                "content": "test",
                "strategy_used": "auto",
                "metadata": {},
            }
        )

        result = await engine.crawl(
            "https://example.com", use_fallback=False, use_retry=False
        )

        assert result["success"] is True
        engine.router.route.assert_called_once()

    @pytest.mark.asyncio
    async def test_crawl_without_retry(self):
        """CrawlerEngine.crawl can skip retry."""
        engine = CrawlerEngine()
        engine.fallback_chain.crawl = AsyncMock(
            return_value={
                "success": True,
                "content": "test",
                "strategy_used": "auto",
                "metadata": {},
            }
        )

        result = await engine.crawl("https://example.com", use_retry=False)

        assert result["success"] is True

    @pytest.mark.asyncio
    async def test_crawl_raises_fallback_exhausted_error(self):
        """CrawlerEngine propagates FallbackExhaustedError."""
        engine = CrawlerEngine()
        engine.fallback_chain.crawl = AsyncMock(
            side_effect=FallbackExhaustedError("All scrapers failed")
        )

        with pytest.raises(FallbackExhaustedError):
            await engine.crawl("https://example.com")
