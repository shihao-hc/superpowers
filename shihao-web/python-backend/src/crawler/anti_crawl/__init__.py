"""Anti-crawl module - Complete anti-detection and rate limiting."""

from .proxy_pool import (
    Proxy,
    ProxyPool,
    ProxyProvider,
    StaticProxyProvider,
)
from .cookie_manager import (
    CookieJar,
    CookieConfig,
    CookieRotator,
)
from .user_agent import (
    UserAgent,
    UserAgentPool,
    BrowserFingerprint,
)
from .rate_limiter import (
    RateLimitConfig,
    TokenBucket,
    SlidingWindowRateLimiter,
    DomainRateLimiter,
    AdaptiveRateLimiter,
)
from .captcha_handler import (
    CaptchaType,
    CaptchaChallenge,
    CaptchaSolution,
    CaptchaDetector,
    CaptchaSolver,
)

__all__ = [
    # Proxy
    "Proxy",
    "ProxyPool",
    "ProxyProvider",
    "StaticProxyProvider",
    # Cookie
    "CookieJar",
    "CookieConfig",
    "CookieRotator",
    # User Agent
    "UserAgent",
    "UserAgentPool",
    "BrowserFingerprint",
    # Rate Limiter
    "RateLimitConfig",
    "TokenBucket",
    "SlidingWindowRateLimiter",
    "DomainRateLimiter",
    "AdaptiveRateLimiter",
    # Captcha
    "CaptchaType",
    "CaptchaChallenge",
    "CaptchaSolution",
    "CaptchaDetector",
    "CaptchaSolver",
]
