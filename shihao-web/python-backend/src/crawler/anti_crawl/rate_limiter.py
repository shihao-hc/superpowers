"""Rate limiting for anti-crawl."""

from dataclasses import dataclass
from typing import Optional
import time
import asyncio
from collections import defaultdict


@dataclass
class RateLimitConfig:
    """Rate limit configuration."""

    requests_per_second: float = 1.0
    requests_per_minute: Optional[int] = None
    requests_per_hour: Optional[int] = None
    burst_size: int = 3
    delay_mode: str = "uniform"


class TokenBucket:
    """Token bucket algorithm for rate limiting."""

    def __init__(
        self,
        rate: float,
        capacity: int,
    ):
        """
        Initialize token bucket.

        Args:
            rate: Tokens added per second
            capacity: Maximum tokens
        """
        self.rate = rate
        self.capacity = capacity
        self.tokens = capacity
        self.last_update = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, tokens: int = 1) -> float:
        """
        Acquire tokens, waiting if necessary.

        Args:
            tokens: Number of tokens to acquire

        Returns:
            Time waited
        """
        wait_time = 0.0
        async with self._lock:
            while self.tokens < tokens:
                self._refill()
                if self.tokens >= tokens:
                    break
                wait_time += 0.1
                await asyncio.sleep(0.1)

            self.tokens -= tokens
            return wait_time

    def _refill(self) -> None:
        """Refill tokens based on elapsed time."""
        now = time.monotonic()
        elapsed = now - self.last_update
        self.tokens = min(
            self.capacity,
            self.tokens + elapsed * self.rate,
        )
        self.last_update = now


class SlidingWindowRateLimiter:
    """Sliding window rate limiter."""

    def __init__(
        self,
        max_requests: int,
        window_seconds: float,
    ):
        """
        Initialize sliding window limiter.

        Args:
            max_requests: Max requests in window
            window_seconds: Window size in seconds
        """
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: list[float] = []
        self._lock = asyncio.Lock()

    async def acquire(self) -> bool:
        """
        Try to acquire permission to make request.

        Returns:
            True if allowed, False if rate limited
        """
        async with self._lock:
            now = time.monotonic()

            cutoff = now - self.window_seconds
            self.requests = [r for r in self.requests if r > cutoff]

            if len(self.requests) < self.max_requests:
                self.requests.append(now)
                return True

            return False

    async def wait_and_acquire(self) -> float:
        """
        Wait until request is allowed.

        Returns:
            Time waited
        """
        start = time.monotonic()

        while True:
            if await self.acquire():
                return time.monotonic() - start
            await asyncio.sleep(0.1)


class DomainRateLimiter:
    """
    Per-domain rate limiting.

    Manages multiple domains with different rate limits.
    """

    def __init__(
        self,
        default_config: Optional[RateLimitConfig] = None,
    ):
        """
        Initialize domain rate limiter.

        Args:
            default_config: Default rate limit config
        """
        self.default_config = default_config or RateLimitConfig()
        self._limiters: dict[str, SlidingWindowRateLimiter] = {}
        self._configs: dict[str, RateLimitConfig] = {}
        self._lock = asyncio.Lock()

    async def acquire(self, domain: str) -> bool:
        """
        Try to acquire rate limit slot for domain.

        Args:
            domain: Target domain

        Returns:
            True if allowed
        """
        async with self._lock:
            if domain not in self._limiters:
                config = self._configs.get(domain, self.default_config)

                rpm = config.requests_per_minute or int(config.requests_per_second * 60)

                self._limiters[domain] = SlidingWindowRateLimiter(
                    max_requests=rpm,
                    window_seconds=60.0,
                )

            return await self._limiters[domain].acquire()

    async def wait_and_acquire(self, domain: str) -> float:
        """
        Wait until request is allowed.

        Args:
            domain: Target domain

        Returns:
            Time waited
        """
        async with self._lock:
            if domain not in self._limiters:
                config = self._configs.get(domain, self.default_config)

                rpm = config.requests_per_minute or int(config.requests_per_second * 60)

                self._limiters[domain] = SlidingWindowRateLimiter(
                    max_requests=rpm,
                    window_seconds=60.0,
                )

            return await self._limiters[domain].wait_and_acquire()

    def set_config(self, domain: str, config: RateLimitConfig) -> None:
        """Set rate limit config for domain."""
        self._configs[domain] = config

        if domain in self._limiters:
            del self._limiters[domain]

    def get_wait_time(self, domain: str) -> float:
        """
        Get estimated wait time for domain.

        Args:
            domain: Target domain

        Returns:
            Estimated wait time in seconds
        """
        if domain not in self._limiters:
            return 0.0

        limiter = self._limiters[domain]
        if len(limiter.requests) < limiter.max_requests:
            return 0.0

        oldest = min(limiter.requests)
        return max(0, oldest + limiter.window_seconds - time.monotonic())


class AdaptiveRateLimiter:
    """
    Adaptive rate limiter with automatic adjustment.

    Increases/decreases rate based on response status.
    """

    def __init__(
        self,
        initial_rate: float = 1.0,
        min_rate: float = 0.1,
        max_rate: float = 10.0,
        increase_factor: float = 1.1,
        decrease_factor: float = 0.5,
        timeout: float = 60.0,
    ):
        """
        Initialize adaptive rate limiter.

        Args:
            initial_rate: Starting requests per second
            min_rate: Minimum rate
            max_rate: Maximum rate
            increase_factor: Multiplier when successful
            decrease_factor: Multiplier when throttled
            timeout: Timeout for acquire operation in seconds
        """
        self.current_rate = initial_rate
        self.min_rate = min_rate
        self.max_rate = max_rate
        self.increase_factor = increase_factor
        self.decrease_factor = decrease_factor
        self.timeout = timeout

        self._bucket = TokenBucket(initial_rate, int(initial_rate * 2))
        self._last_adjustment = time.monotonic()
        self._consecutive_success = 0
        self._consecutive_failures = 0

    async def acquire(self) -> float:
        """Acquire rate limit slot with timeout."""
        try:
            async with asyncio.timeout(self.timeout):
                wait_time = await self._bucket.acquire()
                return wait_time
        except asyncio.TimeoutError:
            return self.timeout

    def report_success(self) -> None:
        """Report successful request."""
        self._consecutive_success += 1
        self._consecutive_failures = 0

        if self._consecutive_success >= 10:
            self._increase_rate()

    def report_throttled(self) -> None:
        """Report rate limit hit."""
        self._consecutive_failures += 1
        self._consecutive_success = 0

        if self._consecutive_failures >= 1:
            self._decrease_rate()

    def _increase_rate(self) -> None:
        """Increase rate limit."""
        new_rate = min(
            self.max_rate,
            self.current_rate * self.increase_factor,
        )

        if new_rate != self.current_rate:
            self.current_rate = new_rate
            self._bucket = TokenBucket(new_rate, int(new_rate * 2))
            self._consecutive_success = 0

    def _decrease_rate(self) -> None:
        """Decrease rate limit."""
        new_rate = max(
            self.min_rate,
            self.current_rate * self.decrease_factor,
        )

        if new_rate != self.current_rate:
            self.current_rate = new_rate
            self._bucket = TokenBucket(new_rate, int(new_rate * 2))
            self._consecutive_failures = 0

    @property
    def status(self) -> dict:
        """Get current status."""
        return {
            "current_rate": self.current_rate,
            "min_rate": self.min_rate,
            "max_rate": self.max_rate,
            "consecutive_success": self._consecutive_success,
            "consecutive_failures": self._consecutive_failures,
        }
