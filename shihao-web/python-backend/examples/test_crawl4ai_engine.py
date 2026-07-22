"""Test hybrid crawler - Crawl4AI focus."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.crawler.core import CrawlerEngine
from src.crawler.config import CrawlerConfig
from src.crawler.types import CrawlerStrategy


async def test_crawl4ai():
    print("🧪 Testing Hybrid Crawler (Crawl4AI)...\n")
    print("=" * 60)

    config = CrawlerConfig(default_timeout=60, max_retries=2)
    engine = CrawlerEngine(config)

    test_cases = [
        ("https://example.com", "简单页面"),
        ("https://www.bilibili.com", "哔哩哔哩 (动态)"),
        ("https://www.github.com", "GitHub (动态)"),
        ("https://news.ycombinator.com", "Hacker News"),
    ]

    success_count = 0

    for url, desc in test_cases:
        print(f"\n📄 {desc}")
        print(f"   URL: {url}")
        print("-" * 50)

        try:
            result = await engine.crawl(
                url=url,
                strategy=CrawlerStrategy.CRAWL4AI,
                use_fallback=False,
                use_retry=True,
            )

            if result["success"]:
                success_count += 1
                print(f"✅ Success")
                print(f"   Strategy: {result['strategy_used']}")
                content = result.get("content", "") or ""
                preview = content[:120].replace("\n", " ").strip()
                print(f"   Content: {len(content)} chars")
                print(f"   Preview: {preview}...")
            else:
                print(
                    f"❌ Failed: {result.get('metadata', {}).get('error', 'Unknown')}"
                )

        except Exception as e:
            print(f"❌ Error: {str(e)[:100]}")

    print("\n" + "=" * 60)
    print(f"🏁 Results: {success_count}/{len(test_cases)} successful")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_crawl4ai())
