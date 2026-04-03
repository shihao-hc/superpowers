"""Anti-detection package for stealth web crawling."""

from .stealth import (
    AntiDetectionManager,
    StealthBrowser,
    ProxyConfig,
    DetectionLevel,
    DetectionResult,
    with_proxy_rotation,
)

__all__ = [
    "AntiDetectionManager",
    "StealthBrowser",
    "ProxyConfig",
    "DetectionLevel",
    "DetectionResult",
    "with_proxy_rotation",
]
