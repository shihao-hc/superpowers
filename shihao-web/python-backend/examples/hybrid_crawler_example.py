"""
Hybrid Crawler Example - Demonstrates scrapling + browser-use integration.

Usage:
    python examples/hybrid_crawler_example.py
"""

import asyncio
from src.crawler.core import CrawlerEngine
from src.crawler.config import CrawlerConfig
from src.crawler.types import CrawlerStrategy


async def main():
    """Run example crawls."""
    config = CrawlerConfig(default_timeout=30, max_retries=3, headless=True)
    engine = CrawlerEngine(config)

    print("=" * 60)
    print("Hybrid Crawler Example")
    print("=" * 60)

    # Example 1: Auto-select strategy
    print("\n1. Auto-select strategy (recommended):")
    print("-" * 40)
    result = await engine.crawl(
        url="https://example.com", use_fallback=True, use_retry=True
    )
    print(f"Success: {result['success']}")
    print(f"Strategy: {result['strategy_used']}")
    print(f"Content length: {len(result['content'])} chars")

    # Example 2: Explicit strategy
    print("\n2. Explicit scrapling strategy:")
    print("-" * 40)
    result = await engine.crawl(
        url="https://example.com",
        strategy=CrawlerStrategy.SCRAPLING,
        use_fallback=False,
        use_retry=True,
    )
    print(f"Success: {result['success']}")
    print(f"Strategy: {result['strategy_used']}")

    # Example 3: Explicit browser-use
    print("\n3. Explicit browser-use strategy:")
    print("-" * 40)
    result = await engine.crawl(
        url="https://example.com/spa",  # SPA indicator
        strategy=CrawlerStrategy.BROWSER_USE,
        use_fallback=False,
        use_retry=True,
    )
    print(f"Success: {result['success']}")
    print(f"Strategy: {result['strategy_used']}")

    print("\n" + "=" * 60)
    print("Examples complete!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
