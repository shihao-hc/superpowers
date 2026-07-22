"""拾号-爬虫测试"""

from crawler_shihao import crawl_sync, __version__

print("=" * 50)
print("拾号-爬虫 (ShiHao-Crawler) v" + __version__)
print("=" * 50)
print()

urls = [
    ("https://example.com", "简单页面"),
    ("https://httpbin.org/html", "HTTP测试"),
    ("https://jsonplaceholder.typicode.com/posts/1", "JSON API"),
]

success = 0
for url, desc in urls:
    print(f"{desc}: {url}")
    result = crawl_sync(url)
    print(f"  Success: {result['success']}")
    print(f"  Strategy: {result['strategy_used']}")
    print(f"  Content: {len(result['content'])} chars")
    print()
    if result["success"]:
        success += 1

print("=" * 50)
print(f"结果: {success}/{len(urls)} 成功")
print("=" * 50)
