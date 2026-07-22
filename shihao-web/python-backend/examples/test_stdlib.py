"""Test stdlib-only crawler (zero dependencies)."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.crawler.scrapers.stdlib_adapter import StdlibAdapter


async def test_stdlib():
    print("🧪 Testing Stdlib Adapter (Zero Dependencies)...\n")
    print("=" * 60)

    adapter = StdlibAdapter()

    test_cases = [
        ("https://example.com", "简单页面"),
        ("https://httpbin.org/html", "HTTP测试页"),
        ("https://httpbin.org/json", "JSON API"),
    ]

    success = 0

    for url, desc in test_cases:
        print(f"\n📄 {desc}")
        print(f"   URL: {url}")
        print("-" * 50)

        try:
            result = await adapter.crawl(url)

            if result["success"]:
                success += 1
                print(f"✅ Success")
                print(f"   Strategy: {result['strategy_used']}")

                content = result.get("content", "") or ""
                preview = content[:100].replace("\n", " ").strip()
                print(f"   Content: {len(content)} chars")
                print(f"   Preview: {preview}...")

                links_count = result.get("metadata", {}).get("links_count", 0)
                if links_count:
                    print(f"   Links found: {links_count}")
            else:
                error = result.get("metadata", {}).get("error", "Unknown")
                print(f"❌ Failed: {error}")

        except Exception as e:
            print(f"❌ Error: {str(e)[:80]}")

    print("\n" + "=" * 60)
    print(f"🏁 Results: {success}/{len(test_cases)} successful")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(test_stdlib())
