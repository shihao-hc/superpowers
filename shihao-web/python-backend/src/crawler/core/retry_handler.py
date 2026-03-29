import asyncio
from typing import Optional, Callable, Any
from functools import wraps


def with_retry(max_retries: int = 3, backoff: float = 1.5, initial_delay: float = 1.0):
    """Decorator for retrying async functions with exponential backoff.

    Args:
        max_retries: Maximum number of retry attempts
        backoff: Multiplier for delay between retries
        initial_delay: Initial delay in seconds
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            delay = initial_delay
            last_error = None

            for attempt in range(max_retries + 1):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    if attempt < max_retries:
                        await asyncio.sleep(delay)
                        delay *= backoff

            raise last_error

        return wrapper

    return decorator


class RetryHandler:
    """Handles retry logic with exponential backoff."""

    def __init__(
        self, max_retries: int = 3, backoff: float = 1.5, initial_delay: float = 1.0
    ):
        self.max_retries = max_retries
        self.backoff = backoff
        self.initial_delay = initial_delay

    async def execute(self, func: Callable, *args, **kwargs) -> Any:
        """Execute function with retry logic.

        Args:
            func: Async function to execute
            *args, **kwargs: Arguments passed to func

        Returns:
            Result of func

        Raises:
            Last exception if all retries fail
        """
        delay = self.initial_delay
        last_error = None

        for attempt in range(self.max_retries + 1):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                last_error = e
                if attempt < self.max_retries:
                    await asyncio.sleep(delay)
                    delay *= self.backoff

        raise last_error
