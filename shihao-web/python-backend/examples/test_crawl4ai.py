"""Test crawl4ai for dynamic pages."""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


async def test_crawl4ai():
    print("🧪 Testing Crawl4AI...\n")

    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

        test_urls = [
            "https://example.com",
            "https://www.bilibili.com",
        ]

        browser_config = BrowserConfig(headless=True, verbose=False)
        crawl_config = CrawlerRunConfig(word_count_threshold=1, verbose=False)

        async with AsyncWebCrawler(config=browser_config) as crawler:
            for url in test_urls:
                print(f"📄 Crawling: {url}")
                print("-" * 50)

                try:
                    result = await crawler.arun(url=url, config=crawl_config)

                    print(f"✅ Success: {result.success}")

                    if hasattr(result, "markdown") and result.markdown:
                        md = result.markdown
                        raw = getattr(md, "raw_markdown", "") or str(md)
                        fit = getattr(md, "fit_markdown", "") or ""

                        content = fit or raw
                        print(f"   Strategy: crawl4ai")
                        print(f"   Content length: {len(content)} chars")

                        if content:
                            preview = content[:200].replace("\n", " ").strip()
                            print(f"   Preview: {preview}...")

                    print()

                except Exception as e:
                    print(f"❌ Error: {e}\n")
                    import traceback

                    traceback.print_exc()

    except ImportError as e:
        print(f"❌ Crawl4AI not installed: {e}")
    except Exception as e:
        print(f"❌ Failed to initialize: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(test_crawl4ai())
