"""
拾号-爬虫 (ShiHao-Crawler)

混合多策略爬虫系统 - 集静态抓取、动态渲染、深度爬取于一体

v1.3.0 新增: 自然语言驱动自动化爬虫
"""

__version__ = "1.3.0"
__author__ = "ShiHao Team"

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))

from src.crawler.core import CrawlerEngine
from src.crawler.config import CrawlerConfig
from src.crawler.types import CrawlerStrategy, CrawlResult
from src.crawler.router import CrawlerRouter
from src.crawler.scrapers import (
    StdlibAdapter,
    ScraplingAdapter,
    Crawl4AIAdapter,
    BrowserUseAdapter,
    FirecrawlAdapter,
    PydollScraper,
    SeleniumBaseScraper,
    ScraperRegistry,
)
from src.crawler.scrapers.node_playwright_adapter import NodePlaywrightAdapter
from src.crawler.multimodal import (
    MultimodalExtractor,
    MultimodalExtractOptions,
    MultimodalResult,
    TextExtractor,
    ImageExtractor,
    VideoExtractor,
    AudioExtractor,
    ImageExtractOptions,
    ImageInfo,
    VideoExtractOptions,
    VideoInfo,
    AudioExtractOptions,
    AudioInfo,
)
from src.crawler.platforms import (
    PlatformManager,
    PlatformType,
    PlatformPost,
    BasePlatformAdapter,
    DouyinAdapter,
    BilibiliAdapter,
    XiaohongshuAdapter,
    WechatAdapter,
    extract_from_url,
)
from src.crawler.ai_analysis import (
    OCRResult,
    OCREngine,
    SimpleOCREngine,
    batch_ocr,
    KeyFrame,
    KeyFrameExtractor,
    CaptionResult,
    ImageCaptioner,
    OllamaVision,
    VideoAnalysisResult,
    VideoAnalyzer,
    SpeechTranscriber,
)
from src.crawler.anti_crawl import (
    Proxy,
    ProxyPool,
    CookieJar,
    CookieRotator,
    UserAgentPool,
    BrowserFingerprint,
    RateLimitConfig,
    DomainRateLimiter,
    AdaptiveRateLimiter,
    CaptchaType,
    CaptchaChallenge,
    CaptchaDetector,
    CaptchaSolver,
)
from src.crawler.automation import (
    WorkflowEngine,
    SmartCrawlWorkflow,
    quick_crawl_workflow,
    SmartStrategySelector,
    auto_crawl_recommend,
    SiteComplexity,
    ContentType,
    StrategyRecommendation,
    Deduplicator,
    IncrementalCrawler,
    URLNormalizer,
)
from src.crawler.structured import (
    StructuredDataExtractor,
    JSONLDExtractor,
    MicrodataExtractor,
    DataValidator,
    ConfidenceScorer,
    DataCleaner,
    ValidationResult,
    FieldSchema,
)
from src.crawler.auto_crawler import (
    AutoCrawler,
    IntentParser,
    IntentResult,
    IntentType,
    smart_crawl,
    smart_crawl_async,
    parse_intent,
)

__all__ = [
    # 版本
    "__version__",
    # 核心
    "CrawlerEngine",
    "CrawlerConfig",
    "CrawlerRouter",
    "CrawlResult",
    # 策略
    "CrawlerStrategy",
    # 适配器
    "StdlibAdapter",
    "ScraplingAdapter",
    "Crawl4AIAdapter",
    "NodePlaywrightAdapter",
    "BrowserUseAdapter",
    "FirecrawlAdapter",
    "PydollScraper",
    "SeleniumBaseScraper",
    "ScraperRegistry",
    # 多模态提取
    "MultimodalExtractor",
    "MultimodalExtractOptions",
    "MultimodalResult",
    "TextExtractor",
    "ImageExtractor",
    "VideoExtractor",
    "AudioExtractor",
    # 平台适配器
    "PlatformManager",
    "PlatformType",
    "PlatformPost",
    "DouyinAdapter",
    "BilibiliAdapter",
    "XiaohongshuAdapter",
    "WechatAdapter",
    "extract_from_url",
    # AI分析
    "OCRResult",
    "OCREngine",
    "SimpleOCREngine",
    "batch_ocr",
    "KeyFrame",
    "KeyFrameExtractor",
    "CaptionResult",
    "ImageCaptioner",
    "OllamaVision",
    "VideoAnalysisResult",
    "VideoAnalyzer",
    "SpeechTranscriber",
    # 反爬取
    "Proxy",
    "ProxyPool",
    "CookieJar",
    "CookieRotator",
    "UserAgentPool",
    "BrowserFingerprint",
    "RateLimitConfig",
    "DomainRateLimiter",
    "AdaptiveRateLimiter",
    "CaptchaType",
    "CaptchaChallenge",
    "CaptchaDetector",
    "CaptchaSolver",
    # 自动化
    "WorkflowEngine",
    "SmartCrawlWorkflow",
    "quick_crawl_workflow",
    "SmartStrategySelector",
    "auto_crawl_recommend",
    "SiteComplexity",
    "ContentType",
    "StrategyRecommendation",
    # 增量爬取
    "Deduplicator",
    "IncrementalCrawler",
    "URLNormalizer",
    # 结构化数据
    "StructuredDataExtractor",
    "JSONLDExtractor",
    "MicrodataExtractor",
    "DataValidator",
    "ConfidenceScorer",
    "DataCleaner",
    "ValidationResult",
    "FieldSchema",
    # 自然语言爬虫
    "AutoCrawler",
    "IntentParser",
    "IntentResult",
    "IntentType",
    "smart_crawl",
    "smart_crawl_async",
    "parse_intent",
]

# ============== 快速使用 ==============


def _get_strategy(s: str):
    """Convert string to CrawlerStrategy."""
    if s == "scrapling":
        return CrawlerStrategy.SCRAPLING
    elif s == "crawl4ai":
        return CrawlerStrategy.CRAWL4AI
    elif s == "stdio":
        return CrawlerStrategy.STDIO
    elif s == "node":
        return CrawlerStrategy.CRAWL4AI
    return CrawlerStrategy.AUTO


def crawl_sync(url: str, strategy: str = "auto", **kwargs) -> CrawlResult:
    """
    同步快速爬取

    Args:
        url: 目标URL
        strategy: auto/scrapling/crawl4ai/stdio/node
        **kwargs: 其他选项

    Returns:
        CrawlResult
    """
    import asyncio

    async def _crawl():
        engine = CrawlerEngine()
        s = _get_strategy(strategy)
        return await engine.crawl(url, strategy=s, **kwargs)

    return asyncio.run(_crawl())


async def crawl_async(url: str, strategy: str = "auto", **kwargs) -> CrawlResult:
    """
    异步快速爬取
    """
    engine = CrawlerEngine()
    s = _get_strategy(strategy)
    return await engine.crawl(url, strategy=s, **kwargs)
