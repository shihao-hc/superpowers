from typing import Optional
from urllib.parse import urlparse
import ipaddress
import socket
import logging

from ..types import CrawlerStrategy

logger = logging.getLogger(__name__)

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
]


def parse_strategy(strategy: Optional[str]) -> Optional[CrawlerStrategy]:
    """Parse strategy string to enum.

    Args:
        strategy: Strategy string ("scrapling", "browser_use", "auto")

    Returns:
        CrawlerStrategy enum value or None
    """
    if not strategy:
        return None
    strategy_map = {
        "scrapling": CrawlerStrategy.SCRAPLING,
        "browser_use": CrawlerStrategy.BROWSER_USE,
        "auto": CrawlerStrategy.AUTO,
    }
    return strategy_map.get(strategy.lower(), CrawlerStrategy.AUTO)


def validate_url(url: str) -> None:
    """Validate URL to prevent SSRF attacks.

    Args:
        url: URL to validate

    Raises:
        ValueError: If URL is invalid or potentially dangerous
    """
    if not url or not url.startswith(("http://", "https://")):
        raise ValueError(f"Invalid URL scheme: {url}")

    try:
        parsed = urlparse(url)
    except Exception as e:
        raise ValueError(f"Invalid URL format: {e}")

    hostname = parsed.hostname or ""
    if hostname.lower() in BLOCKED_HOSTS:
        raise ValueError(f"localhost access not allowed: {hostname}")

    if hostname in BLOCKED_DOMAINS:
        raise ValueError(f"Metadata endpoint not allowed: {hostname}")

    if hostname.startswith("169.254."):
        raise ValueError(f"AWS metadata endpoint not allowed: {hostname}")

    if parsed.netloc.startswith("10.") or parsed.netloc.startswith("192.168."):
        raise ValueError(f"Private IP range not allowed: {parsed.netloc}")

    if parsed.netloc.startswith("172."):
        try:
            parts = parsed.netloc.split(".")
            if len(parts) >= 2:
                second_octet = int(parts[1])
                if 16 <= second_octet <= 31:
                    raise ValueError(f"Private IP range (172.16-31.x.x) not allowed")
        except (ValueError, IndexError):
            pass

    try:
        infos = socket.getaddrinfo(hostname, None)
        for family, _, _, _, sockaddr in infos:
            ip_str = sockaddr[0]
            try:
                addr = ipaddress.ip_address(ip_str)
                for network in PRIVATE_NETWORKS:
                    if addr in network:
                        raise ValueError(f"Private IP access not allowed: {ip_str}")
            except ValueError:
                continue
    except socket.gaierror:
        pass
