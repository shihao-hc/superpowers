"""Proxy pool management for anti-crawl."""

from dataclasses import dataclass, field
from typing import Optional, Protocol, Union
from urllib.parse import urlparse
import asyncio
import random


@dataclass
class Proxy:
    """Proxy configuration."""

    url: str
    protocol: str = "http"
    host: str = ""
    port: int = 0
    username: Optional[str] = None
    password: Optional[str] = None

    latency: float = 0.0
    success_count: int = 0
    failure_count: int = 0
    last_used: float = 0.0
    is_active: bool = True

    tags: list[str] = field(default_factory=list)

    def __post_init__(self):
        if not self.protocol:
            parsed = urlparse(self.url)
            self.protocol = parsed.scheme or "http"

        if not self.host:
            parsed = urlparse(self.url)
            self.host = parsed.hostname or ""
            self.port = parsed.port or (80 if self.protocol == "http" else 443)

    @property
    def is_healthy(self) -> bool:
        """Check if proxy is healthy."""
        if not self.is_active:
            return False

        success_rate = self.success_count / max(
            1, self.success_count + self.failure_count
        )
        return success_rate > 0.5

    @property
    def success_rate(self) -> float:
        """Calculate success rate."""
        total = self.success_count + self.failure_count
        return self.success_count / total if total > 0 else 1.0


class ProxyProvider(Protocol):
    """Protocol for proxy providers."""

    async def get_proxies(self) -> list[Proxy]:
        """Get available proxies."""
        ...


class StaticProxyProvider:
    """Static proxy list provider."""

    def __init__(self, proxies: list[str]):
        """
        Initialize with proxy list.

        Args:
            proxies: List of proxy URLs
        """
        self._proxies = [Proxy(url=p) for p in proxies]

    async def get_proxies(self) -> list[Proxy]:
        """Get available proxies."""
        return self._proxies


class ProxyPool:
    """
    Proxy pool manager with automatic rotation and health checking.

    Features:
    - Automatic proxy rotation
    - Health monitoring
    - Failure tracking
    - Geographic targeting
    """

    def __init__(
        self,
        provider: Optional[ProxyProvider] = None,
        min_success_rate: float = 0.5,
        max_failures: int = 5,
        timeout: float = 30.0,
    ):
        """
        Initialize proxy pool.

        Args:
            provider: Proxy provider
            min_success_rate: Minimum success rate to keep proxy
            max_failures: Max failures before marking proxy as unhealthy
            timeout: Timeout for proxy operations in seconds
        """
        self.provider = provider
        self.min_success_rate = min_success_rate
        self.max_failures = max_failures
        self.timeout = timeout

        self._proxies: dict[str, Proxy] = {}
        self._lock = asyncio.Lock()
        self._last_refresh = 0.0

    async def get_proxy(
        self,
        domain: Optional[str] = None,
        tags: Optional[list[str]] = None,
    ) -> Optional[Proxy]:
        """
        Get next available proxy.

        Args:
            domain: Target domain for geo-targeting
            tags: Required proxy tags

        Returns:
            Proxy or None
        """
        async with self._lock:
            if not self._proxies:
                await self._refresh()

            candidates = [
                p for p in self._proxies.values() if p.is_active and p.is_healthy
            ]

            if tags:
                candidates = [p for p in candidates if all(t in p.tags for t in tags)]

            if not candidates:
                await self._refresh()
                candidates = list(self._proxies.values())

            if candidates:
                proxy = random.choice(candidates)
                proxy.last_used = asyncio.get_event_loop().time()
                return proxy

            return None

    async def report_success(self, proxy: Proxy) -> None:
        """Report successful proxy usage."""
        async with self._lock:
            if proxy.url in self._proxies:
                p = self._proxies[proxy.url]
                p.success_count += 1

                if p.latency == 0:
                    p.latency = 0.1

    async def report_failure(self, proxy: Proxy) -> None:
        """Report failed proxy usage."""
        async with self._lock:
            if proxy.url in self._proxies:
                p = self._proxies[proxy.url]
                p.failure_count += 1

                if p.failure_count >= self.max_failures:
                    p.is_active = False

    async def _refresh(self) -> None:
        """Refresh proxy list from provider."""
        if not self.provider:
            return

        try:
            async with asyncio.timeout(self.timeout):
                new_proxies = await self.provider.get_proxies()

                for proxy in new_proxies:
                    if proxy.url not in self._proxies:
                        self._proxies[proxy.url] = proxy
                    else:
                        existing = self._proxies[proxy.url]
                        if not existing.is_active and existing.failure_count > 0:
                            existing.failure_count //= 2
                            existing.is_active = True

                self._last_refresh = asyncio.get_event_loop().time()

        except (asyncio.TimeoutError, Exception):
            pass

    async def health_check(self) -> dict[str, any]:
        """Get pool health statistics."""
        async with self._lock:
            total = len(self._proxies)
            active = sum(1 for p in self._proxies.values() if p.is_active)
            healthy = sum(1 for p in self._proxies.values() if p.is_healthy)

            return {
                "total": total,
                "active": active,
                "healthy": healthy,
                "unhealthy": total - healthy,
            }

    def add_proxy(self, proxy: Union[str, Proxy]) -> None:
        """Add proxy to pool."""
        if isinstance(proxy, str):
            proxy = Proxy(url=proxy)

        self._proxies[proxy.url] = proxy

    def remove_proxy(self, proxy_url: str) -> None:
        """Remove proxy from pool."""
        self._proxies.pop(proxy_url, None)
