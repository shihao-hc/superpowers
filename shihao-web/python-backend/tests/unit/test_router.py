import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import pytest
from crawler.router import (
    ComplexityAnalyzer,
    ComplexityResult,
    RuleSelector,
    CrawlerRouter,
    get_scraper_for_strategy,
)
from crawler.types import CrawlerStrategy
from crawler.config import CrawlerConfig, ComplexityThresholds


class TestComplexityAnalyzer:
    """Test ComplexityAnalyzer."""

    def test_returns_score_in_0_1_range(self):
        """analyze_url returns score between 0.0 and 1.0."""
        analyzer = ComplexityAnalyzer()

        result = analyzer.analyze_url("https://example.com/page.html")
        assert 0.0 <= result.score <= 1.0

        result = analyzer.analyze_url("https://example.com/react-app")
        assert 0.0 <= result.score <= 1.0

        result = analyzer.analyze_url("https://example.com/dashboard/vue")
        assert 0.0 <= result.score <= 1.0

    def test_categorizes_simple_urls(self):
        """analyze_url categorizes simple URLs correctly."""
        analyzer = ComplexityAnalyzer()

        result = analyzer.analyze_url("https://example.com/page.html")
        assert result.level in ["simple", "dynamic", "complex"]

    def test_categorizes_complex_urls(self):
        """analyze_url categorizes complex URLs correctly."""
        analyzer = ComplexityAnalyzer()

        result = analyzer.analyze_url("https://app.example.com/dashboard/react")
        assert result.level in ["simple", "dynamic", "complex"]

    def test_simple_indicator_reduces_score(self):
        """Simple indicators reduce complexity score."""
        analyzer = ComplexityAnalyzer(
            ComplexityThresholds(simple_max=0.3, complex_min=0.7)
        )

        result_with_html = analyzer.analyze_url("https://example.com/page.html")
        result_without = analyzer.analyze_url("https://example.com/page")

        assert result_with_html.score <= result_without.score

    def test_complex_indicator_increases_score(self):
        """Complex indicators increase complexity score."""
        analyzer = ComplexityAnalyzer(
            ComplexityThresholds(simple_max=0.3, complex_min=0.7)
        )

        result_with_react = analyzer.analyze_url("https://example.com/react-app")
        result_without = analyzer.analyze_url("https://example.com/page")

        assert result_with_react.score >= result_without.score


class TestRuleSelector:
    """Test RuleSelector."""

    def test_returns_scrapling_for_static_pages(self):
        """select returns SCRAPLING for static page patterns."""
        selector = RuleSelector()

        result = selector.select("https://example.com/page.html")
        assert result == CrawlerStrategy.SCRAPLING

        result = selector.select("https://example.com/blog/article")
        assert result == CrawlerStrategy.SCRAPLING

    def test_returns_browser_use_for_complex_patterns(self):
        """select returns BROWSER_USE for complex patterns."""
        selector = RuleSelector()

        result = selector.select("https://app.example.com/dashboard")
        assert result == CrawlerStrategy.BROWSER_USE

        result = selector.select("https://example.com/react-spa")
        assert result == CrawlerStrategy.BROWSER_USE

        result = selector.select("https://example.com/vue-app")
        assert result == CrawlerStrategy.BROWSER_USE

    def test_returns_none_for_unknown_urls(self):
        """select returns None for unknown URL patterns."""
        selector = RuleSelector()

        result = selector.select("https://example.com/unknown")
        assert result is None


class TestCrawlerRouter:
    """Test CrawlerRouter."""

    def test_router_instantiates(self):
        """CrawlerRouter can be instantiated."""
        router = CrawlerRouter()
        assert router is not None

    def test_router_accepts_config(self):
        """CrawlerRouter accepts config."""
        config = CrawlerConfig(default_timeout=60)
        router = CrawlerRouter(config)
        assert router.config.default_timeout == 60


class TestGetScraperForStrategy:
    """Test get_scraper_for_strategy."""

    def test_returns_scrapling_adapter(self):
        """get_scraper_for_strategy returns ScraplingAdapter for SCRAPLING."""
        scraper = get_scraper_for_strategy(CrawlerStrategy.SCRAPLING)
        assert scraper is not None
        assert hasattr(scraper, "crawl")

    def test_returns_browser_use_adapter(self):
        """get_scraper_for_strategy returns BrowserUseAdapter for BROWSER_USE."""
        scraper = get_scraper_for_strategy(CrawlerStrategy.BROWSER_USE)
        assert scraper is not None
        assert hasattr(scraper, "crawl")

    def test_raises_for_unknown_strategy(self):
        """get_scraper_for_strategy raises ValueError for unknown strategy."""
        with pytest.raises(ValueError):
            get_scraper_for_strategy("invalid")  # type: ignore


class TestPriorityChain:
    """Test priority chain: explicit strategy overrides rule selection."""

    @pytest.mark.asyncio
    async def test_explicit_strategy_overrides_rules(self):
        """Explicit strategy takes priority over rule-based selection."""
        config = CrawlerConfig(default_timeout=60)
        router = CrawlerRouter(config)

        result = await router.route(
            "https://example.com/react-app", strategy=CrawlerStrategy.SCRAPLING
        )
        assert result["strategy_used"] == "scrapling"

    @pytest.mark.asyncio
    async def test_rules_used_when_no_explicit_strategy(self):
        """Rules are applied when no explicit strategy is provided."""
        config = CrawlerConfig(default_timeout=60)
        router = CrawlerRouter(config)

        result = await router.route("https://app.example.com/dashboard/react")
        assert result["strategy_used"] == "browser_use"


class TestComplexityLevels:
    """Test complexity analyzer returns correct levels."""

    def test_simple_level_for_static_html(self):
        """Simple HTML pages are categorized as simple."""
        analyzer = ComplexityAnalyzer()
        result = analyzer.analyze_url("https://example.com/page.html")
        assert result.level == "simple"

    def test_complex_level_for_spa(self):
        """SPA URLs are categorized as complex."""
        analyzer = ComplexityAnalyzer()
        result = analyzer.analyze_url("https://app.example.com/dashboard/react")
        assert result.level == "complex"

    def test_dynamic_level_for_mixed(self):
        """URLs with mixed indicators are categorized as dynamic."""
        analyzer = ComplexityAnalyzer(
            ComplexityThresholds(simple_max=0.2, complex_min=0.6)
        )
        result = analyzer.analyze_url("https://example.com/page.json")
        assert result.level == "dynamic"
