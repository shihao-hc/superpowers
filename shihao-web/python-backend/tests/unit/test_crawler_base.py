import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import pytest
from crawler import __version__
from crawler.config import CrawlerConfig, ComplexityThresholds, ScraperConfig
from crawler.types import CrawlerStrategy, PageComplexity, CrawlResult
from crawler.exceptions import (
    CrawlerError,
    ScraperError,
    ComplexityAnalysisError,
    FallbackExhaustedError,
)


class TestPackageImports:
    """Test package imports correctly."""

    def test_version_accessible(self):
        """Version is accessible."""
        assert __version__ == "0.1.0"


class TestConfigDataclasses:
    """Test config dataclasses."""

    def test_crawler_config_defaults(self):
        """CrawlerConfig has correct defaults."""
        config = CrawlerConfig()
        assert config.default_timeout == 30
        assert config.max_retries == 3
        assert config.retry_backoff == 1.5
        assert config.user_agent is None
        assert config.headless is True

    def test_crawler_config_custom(self):
        """CrawlerConfig accepts custom values."""
        config = CrawlerConfig(
            default_timeout=60, max_retries=5, user_agent="TestAgent"
        )
        assert config.default_timeout == 60
        assert config.max_retries == 5
        assert config.user_agent == "TestAgent"

    def test_complexity_thresholds_defaults(self):
        """ComplexityThresholds has correct defaults."""
        thresholds = ComplexityThresholds()
        assert thresholds.simple_max == 0.3
        assert thresholds.complex_min == 0.7

    def test_scraper_config_defaults(self):
        """ScraperConfig has correct defaults."""
        config = ScraperConfig()
        assert config.scrapling == {}
        assert config.browser_use == {}


class TestEnumValues:
    """Test enum values are correct strings."""

    def test_crawler_strategy_values(self):
        """CrawlerStrategy enum values are strings."""
        assert CrawlerStrategy.SCRAPLING.value == "scrapling"
        assert CrawlerStrategy.BROWSER_USE.value == "browser_use"
        assert CrawlerStrategy.AUTO.value == "auto"

    def test_page_complexity_values(self):
        """PageComplexity enum values are strings."""
        assert PageComplexity.SIMPLE.value == "simple"
        assert PageComplexity.COMPLEX.value == "complex"
        assert PageComplexity.DYNAMIC.value == "dynamic"


class TestTypedDict:
    """Test TypedDict structure."""

    def test_crawl_result_structure(self):
        """CrawlResult has expected keys."""
        result: CrawlResult = {
            "success": True,
            "content": "test content",
            "strategy_used": "scrapling",
            "metadata": {},
        }
        assert result["success"] is True
        assert result["content"] == "test content"
        assert result["strategy_used"] == "scrapling"
        assert result["metadata"] == {}


class TestExceptions:
    """Test exceptions can be caught properly."""

    def test_crawler_error_base(self):
        """CrawlerError can be caught as base."""
        with pytest.raises(CrawlerError):
            raise CrawlerError("base error")

    def test_scraper_error_inherits(self):
        """ScraperError inherits from CrawlerError."""
        with pytest.raises(CrawlerError):
            raise ScraperError("scraper error")

    def test_scraper_error_specific(self):
        """ScraperError can be caught specifically."""
        with pytest.raises(ScraperError):
            raise ScraperError("specific error")

    def test_complexity_analysis_error_inherits(self):
        """ComplexityAnalysisError inherits from CrawlerError."""
        with pytest.raises(CrawlerError):
            raise ComplexityAnalysisError("analysis error")

    def test_fallback_exhausted_error_inherits(self):
        """FallbackExhaustedError inherits from CrawlerError."""
        with pytest.raises(CrawlerError):
            raise FallbackExhaustedError("fallback failed")

    def test_exception_hierarchy(self):
        """All exceptions are in correct hierarchy."""
        assert issubclass(ScraperError, CrawlerError)
        assert issubclass(ComplexityAnalysisError, CrawlerError)
        assert issubclass(FallbackExhaustedError, CrawlerError)
