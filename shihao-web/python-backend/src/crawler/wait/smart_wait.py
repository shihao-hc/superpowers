"""Smart wait strategies for dynamic content loading."""

import asyncio
import random
import time
from enum import Enum
from dataclasses import dataclass
from typing import Optional, Any, Callable


class WaitStrategy(str, Enum):
    """Wait strategy types."""

    VISIBLE = "visible"
    CLICKABLE = "clickable"
    PRESENT = "present"
    HIDDEN = "hidden"
    DETACHED = "detached"
    NETWORK_IDLE = "network_idle"


@dataclass
class WaitConfig:
    """Configuration for wait operations."""

    timeout: float = 10.0
    interval: float = 0.1
    strategy: WaitStrategy = WaitStrategy.VISIBLE
    random_delay: bool = False
    min_delay: float = 0.5
    max_delay: float = 2.0


class SmartWait:
    """Smart wait utilities for dynamic content."""

    def __init__(self, default_timeout: float = 10.0):
        self.default_timeout = default_timeout

    async def wait_for_selector(
        self,
        page: Any,
        selector: str,
        config: Optional[WaitConfig] = None,
    ) -> Optional[Any]:
        """Wait for selector to appear.

        Args:
            page: Playwright page object
            selector: CSS or XPath selector
            config: Wait configuration

        Returns:
            Element if found, None otherwise
        """
        config = config or WaitConfig(timeout=self.default_timeout)

        try:
            if config.random_delay:
                await asyncio.sleep(random.uniform(config.min_delay, config.max_delay))

            timeout_ms = int(config.timeout * 1000)

            if selector.startswith("xpath="):
                xpath = selector[6:]
                if config.strategy == WaitStrategy.VISIBLE:
                    return await page.wait_for_selector(
                        f"xpath={xpath}",
                        state="visible",
                        timeout=timeout_ms,
                    )
                elif config.strategy == WaitStrategy.PRESENT:
                    return await page.wait_for_selector(
                        f"xpath={xpath}",
                        state="attached",
                        timeout=timeout_ms,
                    )
                elif config.strategy == WaitStrategy.HIDDEN:
                    return await page.wait_for_selector(
                        f"xpath={xpath}",
                        state="hidden",
                        timeout=timeout_ms,
                    )
            else:
                if config.strategy == WaitStrategy.VISIBLE:
                    return await page.wait_for_selector(
                        selector,
                        state="visible",
                        timeout=timeout_ms,
                    )
                elif config.strategy == WaitStrategy.PRESENT:
                    return await page.wait_for_selector(
                        selector,
                        state="attached",
                        timeout=timeout_ms,
                    )
                elif config.strategy == WaitStrategy.HIDDEN:
                    return await page.wait_for_selector(
                        selector,
                        state="hidden",
                        timeout=timeout_ms,
                    )

        except Exception:
            pass

        return None

    async def wait_random(
        self,
        min_sec: float = 0.5,
        max_sec: float = 2.0,
    ) -> None:
        """Wait for random duration (human-like behavior).

        Args:
            min_sec: Minimum seconds
            max_sec: Maximum seconds
        """
        await asyncio.sleep(random.uniform(min_sec, max_sec))

    async def wait_for_content_change(
        self,
        page: Any,
        selector: str,
        original_value: str,
        timeout: float = 30.0,
    ) -> bool:
        """Wait for content to change.

        Args:
            page: Playwright page object
            selector: Selector for element
            original_value: Original content value
            timeout: Maximum wait time

        Returns:
            True if content changed, False otherwise
        """
        start = time.time()

        while time.time() - start < timeout:
            try:
                element = await page.query_selector(selector)
                if element:
                    current_value = await element.inner_text()
                    if current_value != original_value:
                        return True
            except Exception:
                pass

            await asyncio.sleep(0.5)

        return False

    async def wait_for_network_idle(
        self,
        page: Any,
        timeout: float = 30.0,
    ) -> bool:
        """Wait for network to be idle.

        Args:
            page: Playwright page object
            timeout: Maximum wait time

        Returns:
            True if network idle, False otherwise
        """
        try:
            await page.wait_for_load_state("networkidle", timeout=timeout)
            return True
        except Exception:
            return False

    async def wait_for_element_count(
        self,
        page: Any,
        selector: str,
        min_count: int,
        timeout: float = 30.0,
    ) -> bool:
        """Wait for element count to reach minimum.

        Args:
            page: Playwright page object
            selector: Selector for elements
            min_count: Minimum required count
            timeout: Maximum wait time

        Returns:
            True if count reached, False otherwise
        """
        start = time.time()

        while time.time() - start < timeout:
            try:
                elements = await page.query_selector_all(selector)
                if len(elements) >= min_count:
                    return True
            except Exception:
                pass

            await asyncio.sleep(0.5)

        return False

    async def wait_with_retry(
        self,
        page: Any,
        selector: str,
        max_retries: int = 3,
        delay: float = 1.0,
    ) -> Optional[Any]:
        """Wait with retry on failure.

        Args:
            page: Playwright page object
            selector: Selector for element
            max_retries: Maximum retry attempts
            delay: Delay between retries

        Returns:
            Element if found, None otherwise
        """
        for attempt in range(max_retries):
            element = await self.wait_for_selector(page, selector)
            if element:
                return element

            if attempt < max_retries - 1:
                await asyncio.sleep(delay * (attempt + 1))

        return None

    async def wait_for_any_selector(
        self,
        page: Any,
        selectors: list[str],
        timeout: float = 30.0,
    ) -> tuple[Optional[str], Optional[Any]]:
        """Wait for any of multiple selectors to appear.

        Args:
            page: Playwright page object
            selectors: List of selectors to try
            timeout: Maximum wait time

        Returns:
            Tuple of (selector, element) that appeared first
        """
        start = time.time()

        while time.time() - start < timeout:
            for selector in selectors:
                try:
                    if selector.startswith("xpath="):
                        element = await page.query_selector(selector)
                    else:
                        element = await page.query_selector(selector)

                    if element:
                        return selector, element
                except Exception:
                    pass

            await asyncio.sleep(0.2)

        return None, None


def create_wait_config(
    timeout: float = 10.0,
    strategy: WaitStrategy = WaitStrategy.VISIBLE,
    random_delay: bool = False,
) -> WaitConfig:
    """Create wait configuration.

    Args:
        timeout: Timeout in seconds
        strategy: Wait strategy
        random_delay: Whether to add random delay

    Returns:
        WaitConfig instance
    """
    return WaitConfig(
        timeout=timeout,
        strategy=strategy,
        random_delay=random_delay,
    )
