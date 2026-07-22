"""Cookie management for maintaining sessions."""

from dataclasses import dataclass, field
from typing import Optional, TypedDict
import time
import json
import asyncio
import http.cookiejar


@dataclass
class CookieConfig:
    """Cookie configuration."""

    domain: str
    name: str
    value: str
    path: str = "/"
    expires: Optional[float] = None
    secure: bool = False
    http_only: bool = False
    same_site: Optional[str] = None


class CookieJar:
    """
    Cookie management for maintaining sessions.

    Features:
    - Session persistence
    - Domain-specific cookies
    - Automatic expiration
    - Cookie rotation
    """

    def __init__(self, storage_path: Optional[str] = None):
        """
        Initialize cookie jar.

        Args:
            storage_path: Path to persist cookies
        """
        self.storage_path = storage_path
        self._cookies: dict[str, dict[str, CookieConfig]] = {}
        self._lock = asyncio.Lock()

        if storage_path:
            self._load()

    async def set(
        self,
        domain: str,
        name: str,
        value: str,
        **kwargs,
    ) -> None:
        """
        Set a cookie.

        Args:
            domain: Cookie domain
            name: Cookie name
            value: Cookie value
            **kwargs: Additional cookie attributes
        """
        async with self._lock:
            if domain not in self._cookies:
                self._cookies[domain] = {}

            self._cookies[domain][name] = CookieConfig(
                domain=domain,
                name=name,
                value=value,
                **kwargs,
            )

            if self.storage_path:
                await self._save_async()

    async def get(self, domain: str, name: str) -> Optional[str]:
        """
        Get cookie value.

        Args:
            domain: Cookie domain
            name: Cookie name

        Returns:
            Cookie value or None
        """
        async with self._lock:
            cookie = self._cookies.get(domain, {}).get(name)

            if cookie and cookie.expires:
                if time.time() > cookie.expires:
                    del self._cookies[domain][name]
                    return None

            return cookie.value if cookie else None

    async def get_all(self, domain: str) -> dict[str, str]:
        """
        Get all cookies for domain.

        Args:
            domain: Cookie domain

        Returns:
            Dict of cookie name -> value
        """
        async with self._lock:
            domain_cookies = self._cookies.get(domain, {})

            result = {}
            current_time = time.time()

            for name, cookie in domain_cookies.items():
                if cookie.expires and current_time > cookie.expires:
                    continue
                result[name] = cookie.value

            return result

    async def delete(self, domain: str, name: str) -> None:
        """Delete a cookie."""
        async with self._lock:
            if domain in self._cookies and name in self._cookies[domain]:
                del self._cookies[domain][name]

                if self.storage_path:
                    await self._save_async()

    async def clear(self, domain: Optional[str] = None) -> None:
        """
        Clear cookies.

        Args:
            domain: Specific domain or None for all
        """
        async with self._lock:
            if domain:
                self._cookies.pop(domain, None)
            else:
                self._cookies.clear()

            if self.storage_path:
                await self._save_async()

    def _load(self) -> None:
        """Load cookies from storage."""
        if not self.storage_path:
            return

        try:
            with open(self.storage_path, "r") as f:
                data = json.load(f)

                for domain, cookies in data.items():
                    self._cookies[domain] = {
                        name: CookieConfig(**cookie) for name, cookie in cookies.items()
                    }
        except Exception:
            pass

    async def _save_async(self) -> None:
        """Save cookies to storage asynchronously."""
        await asyncio.to_thread(self._save)

    def _save(self) -> None:
        """Save cookies to storage."""
        if not self.storage_path:
            return

        try:
            data = {}

            for domain, cookies in self._cookies.items():
                data[domain] = {
                    name: {
                        "domain": c.domain,
                        "name": c.name,
                        "value": c.value,
                        "path": c.path,
                        "expires": c.expires,
                        "secure": c.secure,
                        "http_only": c.http_only,
                        "same_site": c.same_site,
                    }
                    for name, c in cookies.items()
                }

            with open(self.storage_path, "w") as f:
                json.dump(data, f)

        except Exception:
            pass

    def to_httpx_cookies(self, domain: str) -> http.cookiejar.CookieJar:
        """Convert to httpx CookieJar."""
        jar = http.cookiejar.CookieJar()

        for name, cookie in self._cookies.get(domain, {}).items():
            import http.cookie as cookie_module

            c = cookie_module.Cookie(
                version=0,
                name=cookie.name,
                value=cookie.value,
                port=None,
                port_specified=False,
                domain=cookie.domain,
                domain_specified=True,
                domain_initial_dot=False,
                path=cookie.path,
                path_specified=True,
                secure=cookie.secure,
                expires=cookie.expires,
                discard=True,
                comment=None,
                comment_url=None,
                rest={},
                rfc2109=False,
            )

            jar.set_cookie(c)

        return jar


class CookieRotator:
    """
    Rotate between multiple cookie sessions.

    Useful for avoiding rate limits by rotating sessions.
    """

    def __init__(
        self,
        cookies_per_domain: int = 3,
        rotation_interval: float = 300.0,
    ):
        """
        Initialize cookie rotator.

        Args:
            cookies_per_domain: Number of cookie sessions per domain
            rotation_interval: Seconds between rotations
        """
        self.cookies_per_domain = cookies_per_domain
        self.rotation_interval = rotation_interval

        self._jars: dict[str, list[CookieJar]] = {}
        self._current_index: dict[str, int] = {}
        self._last_rotation: dict[str, float] = {}
        self._lock = asyncio.Lock()

    async def register_session(self, domain: str, jar: CookieJar) -> None:
        """Register a cookie session."""
        async with self._lock:
            if domain not in self._jars:
                self._jars[domain] = []
                self._current_index[domain] = 0

            self._jars[domain].append(jar)

    async def get_session(self, domain: str) -> Optional[CookieJar]:
        """Get current session for domain."""
        async with self._lock:
            if domain not in self._jars or not self._jars[domain]:
                return None

            current_time = time.time()
            last_rot = self._last_rotation.get(domain, 0)

            if current_time - last_rot > self.rotation_interval:
                self._current_index[domain] = (
                    self._current_index.get(domain, 0) + 1
                ) % len(self._jars[domain])
                self._last_rotation[domain] = current_time

            idx = self._current_index.get(domain, 0)
            return self._jars[domain][idx]
