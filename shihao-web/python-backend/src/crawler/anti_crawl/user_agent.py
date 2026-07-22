"""User-Agent rotation and browser fingerprint management."""

from dataclasses import dataclass, field
from typing import Optional
import random
import hashlib


@dataclass
class UserAgent:
    """Browser user agent string."""

    ua_string: str
    browser: str
    version: str
    os: str
    os_version: str
    device_type: str
    is_mobile: bool = False

    screen_resolution: Optional[str] = None
    color_depth: Optional[int] = None
    timezone: Optional[str] = None
    language: str = "en-US,en;q=0.9"
    platform: str = "Win32"


class UserAgentPool:
    """
    User-Agent rotation pool.

    Features:
    - Multiple browser profiles
    - Realistic UA strings
    - Device type variation
    - Mobile/desktop rotation
    """

    DESKTOP_UA_STRINGS = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0",
    ]

    MOBILE_UA_STRINGS = [
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3.1 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
        "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    ]

    def __init__(
        self,
        mobile_ratio: float = 0.2,
        cache_size: int = 100,
    ):
        """
        Initialize UA pool.

        Args:
            mobile_ratio: Ratio of mobile UAs to return
            cache_size: Max cached unique UAs
        """
        self.mobile_ratio = mobile_ratio
        self.cache_size = cache_size
        self._cache: list[UserAgent] = []
        self._last_rotation = 0

    def get(self, prefer_mobile: Optional[bool] = None) -> str:
        """
        Get random user agent.

        Args:
            prefer_mobile: Force mobile or desktop

        Returns:
            User agent string
        """
        if prefer_mobile is None:
            prefer_mobile = random.random() < self.mobile_ratio

        if prefer_mobile:
            return random.choice(self.MOBILE_UA_STRINGS)
        else:
            return random.choice(self.DESKTOP_UA_STRINGS)

    def get_with_fingerprint(self) -> dict:
        """
        Get UA with full browser fingerprint.

        Returns:
            Dict with UA and fingerprint data
        """
        is_mobile = random.random() < self.mobile_ratio

        if is_mobile:
            ua_string = random.choice(self.MOBILE_UA_STRINGS)
        else:
            ua_string = random.choice(self.DESKTOP_UA_STRINGS)

        resolutions = [
            ("1920x1080", 24),
            ("2560x1440", 24),
            ("1366x768", 24),
            ("1536x864", 24),
            ("1440x900", 24),
        ]

        screen_res = random.choice(resolutions)

        timezones = [
            "America/New_York",
            "America/Los_Angeles",
            "Europe/London",
            "Europe/Paris",
            "Asia/Shanghai",
            "Asia/Tokyo",
        ]

        return {
            "user_agent": ua_string,
            "accept_language": random.choice(
                [
                    "en-US,en;q=0.9",
                    "zh-CN,zh;q=0.9,en;q=0.8",
                    "en-GB,en;q=0.9,zh-CN;q=0.8",
                    "ja-JP,ja;q=0.9,en;q=0.8",
                ]
            ),
            "screen_resolution": screen_res[0],
            "color_depth": screen_res[1],
            "timezone": random.choice(timezones),
            "platform": "Win32"
            if not is_mobile
            else random.choice(
                [
                    "iPhone",
                    "iPad",
                    "Linux armv8l",
                ]
            ),
            "touch_points": random.randint(1, 10) if is_mobile else 0,
            "device_memory": random.choice([2, 4, 8]),
            "hardware_concurrency": random.randint(2, 8),
        }


class BrowserFingerprint:
    """
    Generate realistic browser fingerprints.

    Used to avoid fingerprinting detection.
    """

    CANVAS_EXTENSIONS = [
        "WEBGL_debug_renderer_info",
        "WEBGL_debug_shaders",
        "WEBGL_lose_context",
    ]

    def __init__(self, seed: Optional[str] = None):
        """
        Initialize fingerprint generator.

        Args:
            seed: Optional seed for deterministic fingerprints
        """
        self.seed = seed
        if seed:
            random.seed(seed)

    def generate(self) -> dict:
        """
        Generate complete browser fingerprint.

        Returns:
            Dict with all fingerprint parameters
        """
        fp = UserAgentPool().get_with_fingerprint()

        fp["canvas_hash"] = self._generate_canvas_hash()
        fp["webgl_vendor"] = random.choice(
            [
                "Intel Inc.",
                "NVIDIA Corporation",
                "AMD",
                "Apple Inc.",
            ]
        )
        fp["webgl_renderer"] = random.choice(
            [
                "Intel Iris OpenGL Engine",
                "NVIDIA GeForce GTX 1060",
                "AMD Radeon Pro 5500M",
                "Apple M1",
            ]
        )

        fp["audio_context"] = round(random.uniform(1.0, 2.0), 3)

        fp["fonts"] = random.sample(
            [
                "Arial",
                "Verdana",
                "Times New Roman",
                "Courier New",
                "Georgia",
                "Trebuchet MS",
                "Comic Sans MS",
            ],
            k=random.randint(3, 6),
        )

        fp["plugins"] = random.sample(
            [
                "Chrome PDF Plugin",
                "Chrome PDF Viewer",
                "Native Client",
            ],
            k=random.randint(1, 3),
        )

        fp["languages"] = random.sample(
            [
                "en-US",
                "en",
                "zh-CN",
                "zh",
                "ja",
                "ko",
            ],
            k=random.randint(1, 3),
        )

        fp["do_not_track"] = random.choice(["1", "0", "unspecified"])
        fp["gpc"] = str(random.randint(0, 1))
        fp["ad_block"] = random.choice([True, False])

        return fp

    def _generate_canvas_hash(self) -> str:
        """Generate deterministic canvas hash."""
        data = str(random.random()).encode()
        return hashlib.md5(data).hexdigest()[:16]

    def apply_to_headers(self, headers: dict) -> dict:
        """
        Apply fingerprint to request headers.

        Args:
            headers: Base headers dict

        Returns:
            Enhanced headers
        """
        fp = self.generate()

        headers["User-Agent"] = fp["user_agent"]
        headers["Accept-Language"] = fp["accept_language"]

        headers["Sec-Ch-Ua"] = (
            '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"'
        )
        headers["Sec-Ch-Ua-Mobile"] = "?0" if not fp.get("touch_points") else "?1"
        headers["Sec-Ch-Ua-Platform"] = '"Windows"'
        headers["Sec-Ch-Ua-Platform-Version"] = '"15.0.0"'
        headers["Sec-Ch-Ua-Full-Version-List"] = (
            '"Chromium";v="122.0.0.0", "Not(A:Brand";v="24.0.0.0", "Google Chrome";v="122.0.0.0"'
        )

        headers["Sec-Fetch-Dest"] = "document"
        headers["Sec-Fetch-Mode"] = "navigate"
        headers["Sec-Fetch-Site"] = "none"
        headers["Sec-Fetch-User"] = "?1"
        headers["Upgrade-Insecure-Requests"] = "1"

        return headers
