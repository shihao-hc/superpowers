from typing import Optional
from ..config import CrawlerConfig
from ..types import CrawlerStrategy, CrawlResult
from .complexity_analyzer import ComplexityAnalyzer
from .rules import RuleSelector
from .strategy import get_scraper_for_strategy


class CrawlerRouter:
    """Routes crawl requests to appropriate scraper."""

    def __init__(self, config: Optional[CrawlerConfig] = None):
        self.config = config or CrawlerConfig()
        self.analyzer = ComplexityAnalyzer()
        self.rule_selector = RuleSelector()

    async def route(
        self, url: str, strategy: Optional[CrawlerStrategy] = None
    ) -> CrawlResult:
        """Route URL to appropriate scraper.

        Args:
            url: Target URL
            strategy: Optional explicit strategy (overrides routing)

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

        complexity = self.analyzer.analyze_url(url)

        if complexity.level == "simple":
            scraper = get_scraper_for_strategy(CrawlerStrategy.SCRAPLING, self.config)
        else:
            scraper = get_scraper_for_strategy(CrawlerStrategy.BROWSER_USE, self.config)

        return await scraper.crawl(url)
