from typing import List, Optional
from urllib.parse import urlparse
import ipaddress
import socket
import logging

from ..types import CrawlResult, CrawlerStrategy
from ..scrapers.base import BaseScraper
from ..scrapers.registry import ScraperRegistry, register_default_scrapers
from ..config import CrawlerConfig
from ..exceptions import FallbackExhaustedError, ScraperError

logger = logging.getLogger(__name__)

register_default_scrapers()


ALLOWED_URL_SCHEMES = ("http", "https")
BLOCKED_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1")
BLOCKED_DOMAINS = {
    "169.254.169.254",
    "metadata.google.internal",
    "metadata.azure.com",
    "metadata.internal",
    "kubernetes.default.svc",
}

PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8", strict=False),
    ipaddress.ip_network("172.16.0.0/12", strict=False),
    ipaddress.ip_network("192.168.0.0/16", strict=False),
    ipaddress.ip_network("127.0.0.0/8", strict=False),
    ipaddress.ip_network("0.0.0.0/8", strict=False),
    ipaddress.ip_network("169.254.0.0/16", strict=False),
    ipaddress.ip_network("::1/128", strict=False),
    ipaddress.ip_network("fc00::/7", strict=False),
    ipaddress.ip_network("fe80::/10", strict=False),
]


def validate_url(url: str) -> bool:
    """Validate URL to prevent SSRF attacks (multi-layer protection).

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

    if not _validate_dns_resolution(hostname):
        raise ScraperError(f"DNS resolution blocked for: {hostname}")

    return True


def _validate_dns_resolution(hostname: str) -> bool:
    """Validate DNS resolution to prevent DNS rebinding attacks.

    Args:
        hostname: Hostname to validate

    Returns:
        True if DNS resolution is safe
    """
    if hostname in BLOCKED_DOMAINS:
        return False

    try:
        infos = socket.getaddrinfo(hostname, None)
        for family, _, _, _, sockaddr in infos:
            ip_str = sockaddr[0]
            try:
                if ":" in ip_str:
                    addr = ipaddress.ip_address(ip_str)
                else:
                    addr = ipaddress.ip_address(ip_str)
                for network in PRIVATE_NETWORKS:
                    if addr in network:
                        logger.warning(f"SSRF attempt blocked: {ip_str} in {network}")
                        return False
            except ValueError:
                continue
    except socket.gaierror:
        pass

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
