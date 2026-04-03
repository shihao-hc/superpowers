"""XPath fallback strategies - Try multiple XPaths until one works."""

from typing import Optional, Any, Callable
from dataclasses import dataclass


@dataclass
class XPathAttempt:
    """Record of XPath attempt."""

    xpath: str
    success: bool
    duration_ms: float
    error: Optional[str] = None


class XPathFallback:
    """Try multiple XPaths with fallback strategies."""

    def __init__(
        self,
        timeout_per_xpath: float = 3.0,
        max_attempts: int = 10,
    ):
        self.timeout_per_xpath = timeout_per_xpath
        self.max_attempts = max_attempts
        self.attempts: list[XPathAttempt] = []

    async def try_xpaths(
        self,
        page: Any,
        xpaths: list[str],
        iframe: bool = False,
    ) -> Optional[Any]:
        """Try XPaths in order until one succeeds.

        Args:
            page: Playwright page object
            xpaths: List of XPaths to try
            iframe: Whether to handle iframe context

        Returns:
            Element if found, None otherwise
        """
        self.attempts = []
        iframe_handles = []

        if iframe:
            try:
                iframe_handles = await page.query_selector_all("iframe")
            except Exception:
                pass

        for i, xpath in enumerate(xpaths[: self.max_attempts]):
            if not xpath:
                continue

            import time

            start = time.time()

            try:
                if iframe and iframe_handles:
                    for iframe_handle in iframe_handles:
                        try:
                            frame = await iframe_handle.content_frame()
                            element = await frame.wait_for_selector(
                                f"xpath={xpath}",
                                timeout=int(self.timeout_per_xpath * 1000),
                            )
                            if element:
                                duration = (time.time() - start) * 1000
                                self.attempts.append(
                                    XPathAttempt(
                                        xpath=xpath,
                                        success=True,
                                        duration_ms=duration,
                                    )
                                )
                                return element
                        except Exception:
                            continue
                else:
                    element = await page.wait_for_selector(
                        f"xpath={xpath}", timeout=int(self.timeout_per_xpath * 1000)
                    )
                    if element:
                        duration = (time.time() - start) * 1000
                        self.attempts.append(
                            XPathAttempt(
                                xpath=xpath,
                                success=True,
                                duration_ms=duration,
                            )
                        )
                        return element

            except Exception as e:
                duration = (time.time() - start) * 1000
                self.attempts.append(
                    XPathAttempt(
                        xpath=xpath,
                        success=False,
                        duration_ms=duration,
                        error=str(e),
                    )
                )

        return None

    def get_best_xpath(self) -> Optional[str]:
        """Get the first successful XPath.

        Returns:
            Best XPath or None
        """
        for attempt in self.attempts:
            if attempt.success:
                return attempt.xpath
        return None

    def get_attempt_summary(self) -> dict:
        """Get summary of all attempts."""
        successful = [a for a in self.attempts if a.success]
        return {
            "total_attempts": len(self.attempts),
            "successful": len(successful),
            "failed": len(self.attempts) - len(successful),
            "best_xpath": self.get_best_xpath(),
            "attempts": [
                {
                    "xpath": a.xpath[:50] + "..." if len(a.xpath) > 50 else a.xpath,
                    "success": a.success,
                    "duration_ms": round(a.duration_ms, 2),
                    "error": a.error[:50] if a.error else None,
                }
                for a in self.attempts
            ],
        }


async def try_xpath_with_fallback(
    page: Any,
    xpaths: list[str],
    iframe: bool = False,
    timeout_per_xpath: float = 3.0,
) -> tuple[Optional[Any], dict]:
    """Convenience function to try XPaths with fallback.

    Args:
        page: Playwright page object
        xpaths: List of XPaths to try
        iframe: Whether to handle iframe context
        timeout_per_xpath: Timeout for each XPath attempt

    Returns:
        Tuple of (element, summary)
    """
    fallback = XPathFallback(timeout_per_xpath=timeout_per_xpath)
    element = await fallback.try_xpaths(page, xpaths, iframe)
    summary = fallback.get_attempt_summary()
    return element, summary
