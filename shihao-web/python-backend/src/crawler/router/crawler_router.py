from typing import Optional, Union
from ..config import CrawlerConfig
from ..types import CrawlerStrategy, CrawlResult
from .complexity_analyzer import ComplexityAnalyzer
from .enhanced_complexity_analyzer import (
    EnhancedComplexityAnalyzer,
    HybridComplexityAnalyzer,
)
from .rules import RuleSelector
from .strategy import get_scraper_for_strategy


class CrawlerRouter:
    """Routes crawl requests to appropriate scraper."""

    def __init__(
        self, config: Optional[CrawlerConfig] = None, use_enhanced: bool = True
    ):
        self.config = config or CrawlerConfig()
        self.analyzer = ComplexityAnalyzer()
        self.enhanced_analyzer = EnhancedComplexityAnalyzer()
        self.hybrid_analyzer = HybridComplexityAnalyzer()
        self.rule_selector = RuleSelector()
        self.use_enhanced = use_enhanced

    async def route(
        self,
        url: str,
        strategy: Optional[CrawlerStrategy] = None,
        deep_analysis: bool = False,
    ) -> CrawlResult:
        """Route URL to appropriate scraper.

        Args:
            url: Target URL
            strategy: Optional explicit strategy (overrides routing)
            deep_analysis: Whether to perform deep page analysis

        Returns:
            CrawlResult from selected scraper
        """
        if strategy and strategy != CrawlerStrategy.AUTO:
            scraper = get_scraper_for_strategy(strategy, self.config)
            return await scraper.crawl(url)

        rule_strategy = self.rule_selector.select(url)
        if rule_strategy:
            scraper = get_scraper_for_strategy(rule_strategy, self.config)
            return await scraper.crawl(url)

        if deep_analysis and self.use_enhanced:
            complexity = await self.enhanced_analyzer.analyze_page(url)
        elif self.use_enhanced:
            complexity = await self.hybrid_analyzer.analyze_with_fallback(url)
        else:
            complexity = await self.analyzer.analyze_url(url)

        scraper = get_scraper_for_strategy(
            self._get_strategy_from_complexity(complexity.level), self.config
        )

        return await scraper.crawl(url)

    def _get_strategy_from_complexity(self, level: str) -> CrawlerStrategy:
        """Map complexity level to scraper strategy."""
        if level == "simple":
            return CrawlerStrategy.SCRAPLING
        else:
            return CrawlerStrategy.BROWSER_USE

    async def analyze_url(self, url: str, deep: bool = False):
        """Analyze URL complexity without crawling.

        Args:
            url: Target URL
            deep: Whether to perform deep page analysis

        Returns:
            Complexity analysis result
        """
        if deep:
            return await self.enhanced_analyzer.analyze_page(url)
        return await self.hybrid_analyzer.analyze_with_fallback(url)
