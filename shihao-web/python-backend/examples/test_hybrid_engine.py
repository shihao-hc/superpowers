"""Test hybrid crawler engine."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.crawler.core import CrawlerEngine
from src.crawler.config import CrawlerConfig
from src.crawler.types import CrawlerStrategy


async def test_hybrid_crawler():
    print("🧪 Testing Hybrid Crawler Engine...\n")

    config = CrawlerConfig(default_timeout=30, max_retries=2)
    engine = CrawlerEngine(config)

    test_cases = [
        ("https://httpbin.org/html", "静态页面", CrawlerStrategy.AUTO),
        (
            "https://jsonplaceholder.typicode.com/posts/1",
            "JSON API",
            CrawlerStrategy.SCRAPLING,
        ),
        ("https://www.bilibili.com", "动态页面 (Crawl4AI)", CrawlerStrategy.CRAWL4AI),
    ]

    for url, desc, strategy in test_cases:
        print(f"📄 {desc}: {url}")
        print("-" * 50)

        try:
            result = await engine.crawl(
                url=url, strategy=strategy, use_fallback=True, use_retry=True
            )

            print(f"✅ Success: {result['success']}")
            print(f"   Strategy: {result['strategy_used']}")

            if result["content"]:
                preview = result["content"][:150].replace("\n", " ").strip()
                print(f"   Preview: {preview}...")

            print()

        except Exception as e:
            print(f"❌ Error: {e}\n")
            import traceback

            traceback.print_exc()

    print("🏁 Tests completed!")


if __name__ == "__main__":
    asyncio.run(test_hybrid_crawler())
