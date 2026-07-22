"""
自然语言爬虫演示

演示如何使用自然语言驱动的自动化爬虫功能
"""

import sys

sys.path.insert(0, "src")

from crawler.auto_crawler import smart_crawl, parse_intent, IntentType


def demo_intent_parsing():
    """演示意图解析"""
    print("=" * 60)
    print("意图解析演示")
    print("=" * 60)

    test_inputs = [
        "帮我爬取B站视频《原神》",
        "采集小红书上关于AI的帖子",
        "提取网页中的图片 https://example.com",
        "监控抖音热门视频",
        "爬取这个链接 https://github.com",
        "提取视频内容 https://youtube.com/watch?v=xxx",
        "帮我找一下关于Python教程的内容",
    ]

    for text in test_inputs:
        print(f"\n输入: {text}")
        result = parse_intent(text)
        print(f"  意图: {result.intent.value}")
        print(f"  置信度: {result.confidence:.0%}")
        if result.entities:
            print(f"  实体: {result.entities}")
        if result.suggestions:
            print(f"  建议: {result.suggestions[0]}")


def demo_platform_recognition():
    """演示平台识别"""
    print("\n" + "=" * 60)
    print("平台识别演示")
    print("=" * 60)

    test_platforms = [
        "爬取抖音视频",
        "采集B站UP主的内容",
        "小红书笔记",
        "微信公众号文章",
        "知乎问答",
        "GitHub仓库",
    ]

    for text in test_platforms:
        result = parse_intent(text)
        platform = result.entities.get("platform_name", "未知")
        print(f"'{text}' -> {platform}")


def demo_keyword_extraction():
    """演示关键词提取"""
    print("\n" + "=" * 60)
    print("关键词提取演示")
    print("=" * 60)

    test_keywords = [
        "帮我搜索关于'机器学习'的内容",
        "找一下Python教程",
        '采集"深度学习"相关的帖子',
    ]

    for text in test_keywords:
        result = parse_intent(text)
        keyword = result.entities.get("keyword", "无")
        print(f"'{text}' -> 关键词: '{keyword}'")


def demo_action_recognition():
    """演示动作识别"""
    print("\n" + "=" * 60)
    print("动作识别演示")
    print("=" * 60)

    test_actions = [
        "提取这个页面的图片",
        "下载视频内容",
        "爬取网页文字",
        "批量采集数据",
        "监控更新",
    ]

    action_map = {
        IntentType.IMAGE_EXTRACT: "图片提取",
        IntentType.VIDEO_EXTRACT: "视频提取",
        IntentType.TEXT_EXTRACT: "文字提取",
        IntentType.BATCH_CRAWL: "批量爬取",
        IntentType.MONITOR: "监控",
    }

    for text in test_actions:
        result = parse_intent(text)
        action = action_map.get(result.intent, result.intent.value)
        print(f"'{text}' -> {action}")


def demo_usage_examples():
    """演示使用示例"""
    print("\n" + "=" * 60)
    print("使用示例")
    print("=" * 60)

    examples = """
    # 方式1: 一句话爬取
    from crawler_shihao import smart_crawl
    
    result = smart_crawl("帮我爬取B站视频《原神》")
    
    # 方式2: 带URL
    result = smart_crawl("提取图片 https://example.com/gallery")
    
    # 方式3: 平台+关键词
    result = smart_crawl("搜索小红书上的AI教程")
    
    # 方式4: 预览解析结果
    from crawler_shihao import parse_intent
    
    result = parse_intent("爬取抖音视频")
    print(f"意图: {result.intent.value}")
    print(f"置信度: {result.confidence}")
    """
    print(examples)


if __name__ == "__main__":
    demo_intent_parsing()
    demo_platform_recognition()
    demo_keyword_extraction()
    demo_action_recognition()
    demo_usage_examples()

    print("\n" + "=" * 60)
    print("演示完成!")
    print("=" * 60)
