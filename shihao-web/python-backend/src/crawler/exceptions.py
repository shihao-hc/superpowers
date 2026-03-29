class CrawlerError(Exception):
    """Base exception for crawler errors."""

    pass


class ScraperError(CrawlerError):
    """Scraper-specific error."""

    pass


class ComplexityAnalysisError(CrawlerError):
    """Error during complexity analysis."""

    pass


class FallbackExhaustedError(CrawlerError):
    """All fallback scrapers failed."""

    pass
