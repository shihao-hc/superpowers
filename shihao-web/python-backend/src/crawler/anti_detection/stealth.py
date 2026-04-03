"""Anti-bot detection and bypass strategies."""

import asyncio
import logging
import random
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Callable, Any
from urllib.parse import urlparse

logger = logging.getLogger(__name__)


class DetectionLevel(Enum):
    """Bot detection level."""

    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    BLOCKED = "blocked"


@dataclass
class DetectionResult:
    """Result of bot detection analysis."""

    level: DetectionLevel
    score: float
    indicators: list[str]
    recommendations: list[str]


@dataclass
class ProxyConfig:
    """Proxy configuration for rotation."""

    server: str
    username: Optional[str] = None
    password: Optional[str] = None
    protocol: str = "http"


class AntiDetectionManager:
    """Manages anti-bot detection and bypass.

    Features:
    - 3-tier detection analysis
    - Proxy rotation
    - Fingerprint management
    - Stealth headers
    """

    KNOWN_VENDORS = [
        "cloudflare",
        "akamai",
        "imperva",
        "incapsula",
        "datadome",
        "perimeterx",
        "threatrix",
        "botscout",
        "badbot",
        "crawlprotect",
        "mod_security",
    ]

    BLOCK_INDICATORS = [
        "access denied",
        "forbidden",
        "blocked",
        "blocked by",
        "rate limit",
        "too many requests",
        "captcha",
        "security check",
        "unusual traffic",
        "please verify",
    ]

    GENERIC_PATTERNS = [
        r"window\.location\s*=\s*['\"]/?['\"]",
        r"setTimeout\s*\(\s*function\s*\(\s*\)\s*{\s*window\.location",
        r"cf-challenge",
        r"challenges\.cloudflare\.com",
        r"__cf_challenge",
        r"g-recaptcha",
        r"data-sitekey",
        r"turnstile\.render",
    ]

    def __init__(
        self,
        proxy_configs: Optional[list[ProxyConfig]] = None,
        user_agents: Optional[list[str]] = None,
        fallback_fetch: Optional[Callable] = None,
    ):
        self.proxy_configs = proxy_configs or []
        self.user_agents = user_agents or self._default_user_agents
        self.fallback_fetch = fallback_fetch
        self._current_proxy_index = 0
        self._detection_history: list[DetectionResult] = []

    async def analyze_page(
        self, html: str, status_code: int, headers: dict, url: str
    ) -> DetectionResult:
        """Analyze page for bot detection.

        Returns:
            DetectionResult with level and recommendations
        """
        indicators = []
        recommendations = []
        score = 0.0

        if status_code in (403, 429, 503):
            score += 0.5
            indicators.append(f"HTTP {status_code} status code")
            recommendations.append("Use proxy rotation")

        html_lower = html.lower()
        for vendor in self.KNOWN_VENDORS:
            if vendor in html_lower:
                score += 0.3
                indicators.append(f"Known anti-bot vendor: {vendor}")
                recommendations.append(f"Implement {vendor} bypass")

        for pattern in self.GENERIC_PATTERNS:
            if re.search(pattern, html, re.IGNORECASE):
                score += 0.2
                indicators.append(f"Generic bot protection pattern: {pattern[:30]}...")
                recommendations.append("Use stealth browser")

        for indicator in self.BLOCK_INDICATORS:
            if indicator in html_lower:
                score += 0.3
                indicators.append(f"Block indicator: {indicator}")
                recommendations.append("Implement retry with proxy")

        if "captcha" in html_lower:
            score += 0.4
            indicators.append("CAPTCHA detected")
            recommendations.append("Use CAPTCHA solving service")

        if self._check_structural_integrity(html):
            score += 0.1
            indicators.append("Possible headless browser detection")

        score = min(1.0, score)

        if score >= 0.8:
            level = DetectionLevel.BLOCKED
        elif score >= 0.5:
            level = DetectionLevel.HIGH
        elif score >= 0.3:
            level = DetectionLevel.MEDIUM
        elif score >= 0.1:
            level = DetectionLevel.LOW
        else:
            level = DetectionLevel.NONE

        result = DetectionResult(
            level=level,
            score=score,
            indicators=indicators,
            recommendations=recommendations,
        )
        self._detection_history.append(result)
        return result

    def _check_structural_integrity(self, html: str) -> bool:
        """Check for structural integrity issues."""
        issues = 0

        if html.count("<") != html.count(">"):
            issues += 1

        if "navigator" in html and "webdriver" in html:
            issues += 1

        if "Chrome-Lighthouse" in html or "HeadlessChrome" in html:
            issues += 1

        return issues > 0

    async def get_next_proxy(self) -> Optional[ProxyConfig]:
        """Get next proxy with rotation."""
        if not self.proxy_configs:
            return None

        proxy = self.proxy_configs[self._current_proxy_index]
        self._current_proxy_index = (self._current_proxy_index + 1) % len(
            self.proxy_configs
        )
        return proxy

    def get_stealth_headers(self, url: str) -> dict:
        """Generate stealth headers for request."""
        user_agent = random.choice(self.user_agents)
        parsed = urlparse(url)

        return {
            "User-Agent": user_agent,
            "Accept": random.choice(
                [
                    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                ]
            ),
            "Accept-Language": random.choice(
                [
                    "en-US,en;q=0.9",
                    "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
                    "en-GB,en;q=0.9",
                ]
            ),
            "Accept-Encoding": "gzip, deflate, br",
            "DNT": random.choice(["1", "0"]),
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Cache-Control": "max-age=0",
            "Referer": f"{parsed.scheme}://{parsed.netloc}/",
        }

    def get_detection_stats(self) -> dict:
        """Get detection statistics."""
        if not self._detection_history:
            return {"total": 0}

        levels = [r.level for r in self._detection_history]
        return {
            "total": len(self._detection_history),
            "blocked": levels.count(DetectionLevel.BLOCKED),
            "high": levels.count(DetectionLevel.HIGH),
            "medium": levels.count(DetectionLevel.MEDIUM),
            "low": levels.count(DetectionLevel.LOW),
            "none": levels.count(DetectionLevel.NONE),
            "avg_score": sum(r.score for r in self._detection_history)
            / len(self._detection_history),
        }

    @property
    def _default_user_agents(self) -> list[str]:
        """Default list of realistic user agents."""
        return [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/122.0.0.0",
        ]


class StealthBrowser:
    """Stealth browser configuration for avoiding detection."""

    def __init__(
        self,
        manager: Optional[AntiDetectionManager] = None,
        randomize_viewport: bool = True,
        emulate_device_scale: bool = True,
    ):
        self.manager = manager or AntiDetectionManager()
        self.randomize_viewport = randomize_viewport
        self.emulate_device_scale = emulate_device_scale

    def get_viewport_config(self) -> dict:
        """Get randomized viewport configuration."""
        viewports = [
            {"width": 1920, "height": 1080},
            {"width": 1366, "height": 768},
            {"width": 1536, "height": 864},
            {"width": 1440, "height": 900},
            {"width": 1280, "height": 720},
        ]

        viewport = random.choice(viewports) if self.randomize_viewport else viewports[0]

        if self.emulate_device_scale:
            viewport["deviceScaleFactor"] = random.choice([1, 2, 3])
        else:
            viewport["deviceScaleFactor"] = 1

        return viewport

    def get_stealth_options(self) -> dict:
        """Get stealth browser options."""
        return {
            "headless": True,
            "args": [
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-web-security",
                "--disable-features=IsolateOrigins,site-per-process",
                "--window-size=1920,1080",
                "--start-maximized",
            ],
            "viewport": self.get_viewport_config(),
            "user_agent": random.choice(self.manager.user_agents),
        }


async def with_proxy_rotation(
    url: str, manager: AntiDetectionManager, fetch_fn: Callable, max_retries: int = 3
) -> tuple[str, int, dict]:
    """Fetch URL with automatic proxy rotation on detection.

    Args:
        url: Target URL
        manager: AntiDetectionManager instance
        fetch_fn: Function to perform actual fetch (url, headers, proxy) -> (html, status, headers)
        max_retries: Maximum retry attempts

    Returns:
        Tuple of (html, status_code, headers)
    """
    last_error = None

    for attempt in range(max_retries + 1):
        proxy = await manager.get_next_proxy()
        headers = manager.get_stealth_headers(url)

        try:
            html, status, response_headers = await fetch_fn(url, headers, proxy)

            detection = await manager.analyze_page(html, status, response_headers, url)

            if detection.level == DetectionLevel.NONE:
                return html, status, response_headers

            if detection.level == DetectionLevel.BLOCKED and attempt < max_retries:
                logger.warning(f"Blocked on attempt {attempt + 1}, rotating proxy")
                continue

            if detection.level in (DetectionLevel.HIGH, DetectionLevel.MEDIUM):
                if attempt < max_retries and manager.fallback_fetch:
                    logger.info(
                        f"Detection level {detection.level.value}, trying fallback"
                    )
                    html, status, response_headers = await manager.fallback_fetch(url)
                    return html, status, response_headers

            return html, status, response_headers

        except Exception as e:
            last_error = e
            logger.error(f"Fetch attempt {attempt + 1} failed: {e}")
            if attempt < max_retries:
                await asyncio.sleep(2**attempt)

    if last_error:
        raise last_error
    raise RuntimeError("Max retries exceeded")
