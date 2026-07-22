"""Direct crawler test without scrapling adapter."""

import requests
from bs4 import BeautifulSoup


def test_basic_crawler():
    print("🧪 Testing Basic HTTP Crawler...\n")

    test_urls = [
        ("https://example.com", "静态页面"),
        ("https://httpbin.org/html", "HTTP测试页"),
        ("https://jsonplaceholder.typicode.com/posts/1", "JSON API"),
    ]

    for url, desc in test_urls:
        print(f"📄 {desc}: {url}")
        print("-" * 50)

        try:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
            response = requests.get(url, headers=headers, timeout=10)

            print(f"✅ Status: {response.status_code}")
            print(f"   Content-Type: {response.headers.get('content-type', 'N/A')}")
            print(f"   Size: {len(response.content)} bytes")

            if "html" in response.headers.get("content-type", ""):
                soup = BeautifulSoup(response.text, "html.parser")
                title = soup.find("title")
                if title:
                    print(f"   Title: {title.text}")

                text = soup.get_text()[:150].replace("\n", " ").strip()
                print(f"   Preview: {text}...")

            elif "json" in response.headers.get("content-type", ""):
                print(f"   JSON: {response.json()}")

            print()

        except Exception as e:
            print(f"❌ Error: {e}\n")


if __name__ == "__main__":
    test_basic_crawler()
