"""Test Node.js Playwright adapter."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.crawler.scrapers.node_playwright_adapter import NodePlaywrightAdapter


async def test():
    print("🧪 Testing Node.js Playwright Adapter...\n")
    print("=" * 60)

    adapter = NodePlaywrightAdapter()

    urls = [
        ("https://example.com", "简单页面"),
        ("https://www.bilibili.com", "哔哩哔哩"),
        ("https://github.com", "GitHub"),
        ("https://news.ycombinator.com", "Hacker News"),
    ]

    success = 0

    for url, desc in urls:
        print(f"\n📄 {desc}")
        print(f"   URL: {url}")
        print("-" * 50)

        try:
            result = await adapter.crawl(url)

            if result["success"]:
                success += 1
                print(f"   ✅ Success")
                print(f"   Title: {result['metadata'].get('title', 'N/A')[:50]}")
                print(f"   Content: {len(result['content'])} chars")
                print(f"   Links: {result['metadata'].get('links_count', 0)}")

                if result["metadata"].get("video"):
                    print(f"   🎬 Video found!")
            else:
                print(f"   ❌ Failed")

        except Exception as e:
            print(f"   ❌ Error: {str(e)[:80]}")

    print("\n" + "=" * 60)
    print(f"🏁 Results: {success}/{len(urls)} successful")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test())
