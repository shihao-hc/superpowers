from typing import List, Optional
from urllib.parse import urlparse
from ..types import CrawlResult, CrawlerStrategy
from ..scrapers.base import BaseScraper
from ..scrapers.registry import ScraperRegistry, register_default_scrapers
from ..config import CrawlerConfig
from ..exceptions import FallbackExhaustedError, ScraperError

register_default_scrapers()


ALLOWED_URL_SCHEMES = ("http", "https")
BLOCKED_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1")


def validate_url(url: str) -> bool:
    """Validate URL to prevent SSRF attacks.

    Args:
        url: URL to validate

    Returns:
        True if URL is safe

    Raises:
        ScraperError: If URL is invalid or potentially dangerous
    """
    try:
        parsed = urlparse(url)
    except Exception as e:
        raise ScraperError(f"Invalid URL format: {e}")

    if not parsed.scheme:
        raise ScraperError("URL must have a scheme (http:// or https://)")

    if parsed.scheme not in ALLOWED_URL_SCHEMES:
        raise ScraperError(f"URL scheme must be http or https, got: {parsed.scheme}")

    if not parsed.netloc:
        raise ScraperError("URL must have a host")

    hostname = parsed.hostname or ""
    if hostname.lower() in BLOCKED_HOSTS:
        raise ScraperError(f"URL host not allowed: {hostname}")

    if hostname.startswith("169.254.169.254"):
        raise ScraperError("AWS metadata endpoint not allowed")

    if parsed.netloc.startswith("10.") or parsed.netloc.startswith("192.168."):
        raise ScraperError("Private IP range not allowed")

    return True


class FallbackChain:
    """Executes multiple scrapers in sequence, falling back on failure."""

    DEFAULT_SCRAPERS = [
        CrawlerStrategy.SCRAPLING,
        CrawlerStrategy.BROWSER_USE,
    ]

    def __init__(
        self,
        config: Optional[CrawlerConfig] = None,
        scrapers: Optional[List[CrawlerStrategy]] = None,
    ):
        self.config = config or CrawlerConfig()
        self.scrapers: List[BaseScraper] = self._create_scrapers(
            scrapers or self.DEFAULT_SCRAPERS
        )

    def _create_scrapers(self, strategies: List[CrawlerStrategy]) -> List[BaseScraper]:
        """Create scraper instances from strategies using registry."""
        scrapers = []
        for strategy in strategies:
            try:
                scraper = ScraperRegistry.create(strategy, self.config)
                scrapers.append(scraper)
            except ValueError:
                pass
        return scrapers

    def set_scrapers(self, scrapers: List[BaseScraper]) -> None:
        """Set the scraper chain (in order of preference)."""
        self.scrapers = scrapers

    def set_strategies(self, strategies: List[CrawlerStrategy]) -> None:
        """Set scraper strategies (will be created via registry)."""
        self.scrapers = self._create_scrapers(strategies)

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Try each scraper in order until one succeeds.

        Args:
            url: Target URL
            **kwargs: Options passed to each scraper

        Returns:
            CrawlResult from first successful scraper

        Raises:
            ScraperError: If URL is invalid
            FallbackExhaustedError: All scrapers failed
        """
        validate_url(url)

        errors = []

        for scraper in self.scrapers:
            if not scraper.supports(url):
                continue

            try:
                result = await scraper.crawl(url, **kwargs)
                if result["success"]:
                    return result
                errors.append(
                    f"{type(scraper).__name__}: {result['metadata'].get('error', 'unknown')}"
                )
            except Exception as e:
                errors.append(f"{type(scraper).__name__}: {str(e)}")

        raise FallbackExhaustedError(
            f"All scrapers failed for {url}. Errors: {'; '.join(errors)}"
        )
