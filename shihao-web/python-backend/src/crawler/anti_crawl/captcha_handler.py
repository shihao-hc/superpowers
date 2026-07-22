"""Captcha detection and solving utilities."""

from dataclasses import dataclass
from typing import Optional, Callable
from enum import Enum
import re


class CaptchaType(Enum):
    """Types of captchas."""

    RECAPTCHA_V2 = "recaptcha_v2"
    RECAPTCHA_V3 = "recaptcha_v3"
    HCAPTCHA = "hcaptcha"
    TURNSTILE = "turnstile"
    IMAGE_CAPTCHA = "image_captcha"
    SLIDER_CAPTCHA = "slider_captcha"
    TEXT_CAPTCHA = "text_captcha"
    UNKNOWN = "unknown"


@dataclass
class CaptchaChallenge:
    """Detected captcha challenge."""

    captcha_type: CaptchaType
    site_key: Optional[str] = None
    page_url: Optional[str] = None
    data_site_key: Optional[str] = None
    challenge_id: Optional[str] = None

    def __post_init__(self):
        if isinstance(self.captcha_type, str):
            self.captcha_type = CaptchaType(self.captcha_type)


@dataclass
class CaptchaSolution:
    """Captcha solution."""

    captcha_type: CaptchaType
    solution: str
    confidence: float = 1.0
    expires_in: int = 120


class CaptchaDetector:
    """
    Detect captchas in HTML/responses.

    Supports detection of:
    - reCAPTCHA (v2/v3)
    - hCaptcha
    - Cloudflare Turnstile
    - Image captchas
    - Custom captcha forms
    """

    RECAPTCHA_V2_PATTERNS = [
        r"g-recaptcha",
        r'data-sitekey="([^"]+)"',
        r'class="g-recaptcha"',
        r"grecaptcha\.render",
    ]

    RECAPTCHA_V3_PATTERNS = [
        r'data-sitekey="([^"]+)"[^>]*data-size="[^"]*invisible[^"]*"',
        r"grecaptcha\.execute",
    ]

    HCAPTCHA_PATTERNS = [
        r"h-captcha",
        r'data-sitekey="([^"]+)"[^>]*class="h-captcha"',
        r'class="h-captcha"[^>]*data-sitekey',
    ]

    TURNSTILE_PATTERNS = [
        r"cf-challenge",
        r'class="cf-turnstile"',
        r'data-sitekey="([^"]+)"[^>]*data-theme',
    ]

    SLIDER_PATTERNS = [
        r"slider",
        r"drag",
        r"拼图",
        r"请拖动",
        r"验证",
        r"验证滑块",
        r"captcha-slider",
    ]

    IMAGE_CAPTCHA_PATTERNS = [
        r"captcha",
        r"verification",
        r"verify",
        r"请输入",
        r"输入验证码",
    ]

    def __init__(self):
        self._custom_detectors: list[Callable] = []

    def detect(
        self, content: str, url: Optional[str] = None
    ) -> Optional[CaptchaChallenge]:
        """
        Detect captcha in content.

        Args:
            content: HTML or page content
            url: Page URL for context

        Returns:
            CaptchaChallenge or None
        """
        content_lower = content.lower()

        if self._detect_recaptcha_v3(content, content_lower, url):
            return self._detect_recaptcha_v3(content, content_lower, url)

        if self._detect_recaptcha_v2(content, content_lower, url):
            return self._detect_recaptcha_v2(content, content_lower, url)

        if self._detect_hcaptcha(content, content_lower, url):
            return self._detect_hcaptcha(content, content_lower, url)

        if self._detect_turnstile(content, content_lower, url):
            return self._detect_turnstile(content, content_lower, url)

        if self._detect_slider(content, content_lower):
            return CaptchaChallenge(
                captcha_type=CaptchaType.SLIDER_CAPTCHA,
                page_url=url,
            )

        if self._detect_image_captcha(content, content_lower):
            return CaptchaChallenge(
                captcha_type=CaptchaType.IMAGE_CAPTCHA,
                page_url=url,
            )

        for detector in self._custom_detectors:
            result = detector(content, url)
            if result:
                return result

        return None

    def _detect_recaptcha_v2(
        self, content: str, content_lower: str, url: Optional[str]
    ) -> Optional[CaptchaChallenge]:
        for pattern in self.RECAPTCHA_V2_PATTERNS:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                if (
                    pattern == r'data-sitekey="([^"]+)"'
                    and "recaptcha" in content_lower
                ):
                    site_key = match.group(1)
                    return CaptchaChallenge(
                        captcha_type=CaptchaType.RECAPTCHA_V2,
                        site_key=site_key,
                        page_url=url,
                    )
                elif "recaptcha" in content_lower:
                    site_key_match = re.search(r'data-sitekey="([^"]+)"', content)
                    site_key = site_key_match.group(1) if site_key_match else None
                    return CaptchaChallenge(
                        captcha_type=CaptchaType.RECAPTCHA_V2,
                        site_key=site_key,
                        page_url=url,
                    )
        return None

    def _detect_recaptcha_v3(
        self, content: str, content_lower: str, url: Optional[str]
    ) -> Optional[CaptchaChallenge]:
        for pattern in self.RECAPTCHA_V3_PATTERNS:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                site_key_match = re.search(r'data-sitekey="([^"]+)"', content)
                site_key = site_key_match.group(1) if site_key_match else None
                return CaptchaChallenge(
                    captcha_type=CaptchaType.RECAPTCHA_V3,
                    site_key=site_key,
                    page_url=url,
                )
        return None

    def _detect_hcaptcha(
        self, content: str, content_lower: str, url: Optional[str]
    ) -> Optional[CaptchaChallenge]:
        for pattern in self.HCAPTCHA_PATTERNS:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                site_key_match = re.search(r'data-sitekey="([^"]+)"', content)
                site_key = site_key_match.group(1) if site_key_match else None
                return CaptchaChallenge(
                    captcha_type=CaptchaType.HCAPTCHA,
                    site_key=site_key,
                    page_url=url,
                )
        return None

    def _detect_turnstile(
        self, content: str, content_lower: str, url: Optional[str]
    ) -> Optional[CaptchaChallenge]:
        for pattern in self.TURNSTILE_PATTERNS:
            match = re.search(pattern, content_lower)
            if match:
                site_key_match = re.search(r'data-sitekey="([^"]+)"', content)
                site_key = site_key_match.group(1) if site_key_match else None
                return CaptchaChallenge(
                    captcha_type=CaptchaType.TURNSTILE,
                    site_key=site_key,
                    page_url=url,
                )
        return None

    def _detect_slider(self, content: str, content_lower: str) -> bool:
        for pattern in self.SLIDER_PATTERNS:
            if re.search(pattern, content_lower):
                return True
        return False

    def _detect_image_captcha(self, content: str, content_lower: str) -> bool:
        has_captcha_text = False
        for pattern in self.IMAGE_CAPTCHA_PATTERNS:
            if re.search(pattern, content_lower):
                has_captcha_text = True
                break

        has_input = bool(re.search(r'<input[^>]+type="text"', content, re.IGNORECASE))
        has_image = bool(
            re.search(r"<img[^>]*(captcha|verify|validation)", content, re.IGNORECASE)
        )

        return has_captcha_text and (has_input or has_image)

    def add_detector(self, detector: Callable) -> None:
        """
        Add custom captcha detector.

        Args:
            detector: Function(content, url) -> CaptchaChallenge or None
        """
        self._custom_detectors.append(detector)


class CaptchaSolver:
    """
    Captcha solving interface.

    Supports multiple solving services.
    """

    def __init__(
        self,
        service: str = "manual",
        service_key: Optional[str] = None,
        timeout: float = 120.0,
    ):
        """
        Initialize captcha solver.

        Args:
            service: Solving service (2captcha, anticaptcha, manual)
            service_key: API key for solving service
            timeout: Timeout for API calls in seconds
        """
        self.service = service
        self.service_key = service_key
        self.timeout = timeout

    async def solve(self, challenge: CaptchaChallenge) -> Optional[CaptchaSolution]:
        """
        Solve captcha challenge.

        Args:
            challenge: Detected captcha challenge

        Returns:
            CaptchaSolution or None
        """
        try:
            async with asyncio.timeout(self.timeout):
                if self.service == "manual":
                    return await self._solve_manual(challenge)
                elif self.service == "2captcha":
                    return await self._solve_2captcha(challenge)
                elif self.service == "anticaptcha":
                    return await self._solve_anticaptcha(challenge)

                return None
        except asyncio.TimeoutError:
            return None

    async def _solve_manual(
        self, challenge: CaptchaChallenge
    ) -> Optional[CaptchaSolution]:
        """
        Manual solving (requires human intervention).

        In production, this could trigger a notification or UI.
        """
        return None

    async def _solve_2captcha(
        self, challenge: CaptchaChallenge
    ) -> Optional[CaptchaSolution]:
        """Solve using 2Captcha service."""
        if not self.service_key:
            return None

        import httpx

        try:
            if challenge.captcha_type == CaptchaType.RECAPTCHA_V2:
                url = "http://2captcha.com/in.php"
                data = {
                    "key": self.service_key,
                    "method": "userrecaptcha",
                    "googlekey": challenge.site_key,
                    "pageurl": challenge.page_url,
                    "json": 1,
                }

                async with httpx.AsyncClient(timeout=30.0) as client:
                    response = await client.post(url, data=data)
                    result = response.json()

                    if result.get("status") != 1:
                        return None

                    captcha_id = result.get("request")

                    for _ in range(30):
                        await asyncio.sleep(5)

                        check_url = f"http://2captcha.com/res.php?key={self.api_key}&action=get&id={captcha_id}&json=1"
                        response = await client.get(check_url)
                        result = response.json()

                        if result.get("status") == 1:
                            return CaptchaSolution(
                                captcha_type=challenge.captcha_type,
                                solution=result.get("request"),
                            )

        except Exception:
            pass

        return None

    async def _solve_anticaptcha(
        self, challenge: CaptchaChallenge
    ) -> Optional[CaptchaSolution]:
        """Solve using Anti-Captcha service."""
        return None


import asyncio
