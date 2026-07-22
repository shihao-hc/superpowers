"""Quick test for scrapling."""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scrapling import Fetcher


def test_scrapling():
    print("🧪 Testing Scrapling...\n")

    test_urls = [
        "https://example.com",
        "https://httpbin.org/html",
    ]

    for url in test_urls:
        print(f"📄 Crawling: {url}")
        print("-" * 40)

        try:
            fetcher = Fetcher()
            page = fetcher.get(url)

            content = page.extract("body")
            print(f"✅ Success: True")
            print(f"   Strategy: scrapling")
            print(f"   Content length: {len(content)} chars")

            if content:
                preview = content[:200].replace("\n", " ").strip()
                print(f"   Preview: {preview}...")
            print()

        except Exception as e:
            print(f"❌ Error: {e}\n")
            import traceback

            traceback.print_exc()


if __name__ == "__main__":
    test_scrapling()
