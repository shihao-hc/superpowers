"""
自然语言驱动的自动化爬虫入口

用户只需输入自然语言描述，系统自动识别意图并调用相应功能。

示例:
    > 帮我爬取B站视频《原神》
    > 采集小红书上关于AI的帖子
    > 监控抖音热门视频
    > 提取网页中的图片
"""

import re
import asyncio
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from enum import Enum


class IntentType(Enum):
    """用户意图类型"""

    UNKNOWN = "unknown"
    SINGLE_URL = "single_url"
    PLATFORM_CRAWL = "platform_crawl"
    KEYWORD_SEARCH = "keyword_search"
    CONTENT_EXTRACT = "content_extract"
    MONITOR = "monitor"
    BATCH_CRAWL = "batch_crawl"
    IMAGE_EXTRACT = "image_extract"
    VIDEO_EXTRACT = "video_extract"
    TEXT_EXTRACT = "text_extract"


@dataclass
class IntentResult:
    """意图解析结果"""

    intent: IntentType
    confidence: float
    entities: Dict[str, Any] = field(default_factory=dict)
    suggestions: List[str] = field(default_factory=list)
    original_text: str = ""


@dataclass
class CrawlTask:
    """爬虫任务"""

    task_id: str
    intent: IntentResult
    url: Optional[str] = None
    keyword: Optional[str] = None
    platform: Optional[str] = None
    options: Dict[str, Any] = field(default_factory=dict)


class IntentParser:
    """
    自然语言意图解析器

    解析用户输入，识别意图和实体
    """

    PLATFORM_PATTERNS = {
        "抖音": {
            "patterns": [r"抖音", r"douyin", r"tiktok"],
            "intent": IntentType.PLATFORM_CRAWL,
            "platform": "douyin",
        },
        "B站": {
            "patterns": [r"b站", r"bilibili", r"b站", r"哔哩哔哩"],
            "intent": IntentType.PLATFORM_CRAWL,
            "platform": "bilibili",
        },
        "小红书": {
            "patterns": [r"小红书", r"xhs", r"xiaohongshu"],
            "intent": IntentType.PLATFORM_CRAWL,
            "platform": "xiaohongshu",
        },
        "微信公众号": {
            "patterns": [r"微信", r"公众号", r"wechat", r"weixin"],
            "intent": IntentType.PLATFORM_CRAWL,
            "platform": "wechat",
        },
        "微博": {
            "patterns": [r"微博", r"weibo"],
            "intent": IntentType.PLATFORM_CRAWL,
            "platform": "weibo",
        },
        "GitHub": {
            "patterns": [r"github", r"git hub"],
            "intent": IntentType.SINGLE_URL,
            "platform": "github",
        },
        "知乎": {
            "patterns": [r"知乎", r"zhihu"],
            "intent": IntentType.PLATFORM_CRAWL,
            "platform": "zhihu",
        },
    }

    ACTION_PATTERNS = {
        "爬取": {"patterns": [r"爬[取虫]", r"采集", r"抓取", r"获取"], "weight": 1.0},
        "搜索": {
            "patterns": [r"搜索", r"查找", r"找.*关于", r"搜索.*关于"],
            "weight": 0.9,
        },
        "监控": {"patterns": [r"监控", r"监测", r"跟踪"], "weight": 0.8},
        "提取图片": {
            "patterns": [r"提取?图片", r"下载?图片", r"获取?图片"],
            "weight": 1.0,
        },
        "提取视频": {
            "patterns": [r"提取?视频", r"下载?视频", r"获取?视频"],
            "weight": 1.0,
        },
        "提取文字": {
            "patterns": [r"提取?文字", r"获取?文本", r"抓取?内容"],
            "weight": 1.0,
        },
        "批量": {"patterns": [r"批量", r"多个", r"很多"], "weight": 0.7},
    }

    URL_PATTERN = re.compile(r"https?://[^\s<>\"]*", re.IGNORECASE)

    def parse(self, text: str) -> IntentResult:
        """
        解析用户输入

        Args:
            text: 用户输入的自然语言

        Returns:
            IntentResult: 解析结果
        """
        text = text.strip()
        entities = {}
        suggestions = []

        # 1. 提取URL (仅完整URL)
        all_urls = self.URL_PATTERN.findall(text)
        valid_urls = [u for u in all_urls if self._is_valid_url(u)]
        if valid_urls:
            entities["urls"] = valid_urls
            entities["primary_url"] = valid_urls[0]

        # 记录无效URL用于过滤
        invalid_urls = [u for u in all_urls if not self._is_valid_url(u)]

        # 2. 识别平台
        platform = None
        for name, config in self.PLATFORM_PATTERNS.items():
            for pattern in config["patterns"]:
                if re.search(pattern, text, re.IGNORECASE):
                    platform = config["platform"]
                    entities["platform"] = platform
                    entities["platform_name"] = name
                    break
            if platform:
                break

        # 3. 识别动作
        actions = []
        for action, config in self.ACTION_PATTERNS.items():
            for pattern in config["patterns"]:
                if re.search(pattern, text, re.IGNORECASE):
                    actions.append(action)
                    break

        # 4. 提取关键词
        keyword = self._extract_keyword(text, invalid_urls)
        if keyword:
            entities["keyword"] = keyword

        # 5. 确定意图
        intent = self._determine_intent(text, entities, actions)

        # 6. 计算置信度
        confidence = self._calculate_confidence(intent, entities, actions)

        # 7. 生成建议
        suggestions = self._generate_suggestions(intent, entities)

        return IntentResult(
            intent=intent,
            confidence=confidence,
            entities=entities,
            suggestions=suggestions,
            original_text=text,
        )

    def _extract_keyword(self, text: str, invalid_urls: list = None) -> Optional[str]:
        """提取搜索关键词"""
        # 移除URL
        text = self.URL_PATTERN.sub("", text)

        # 移除无效URL
        if invalid_urls:
            for url in invalid_urls:
                text = text.replace(url, "")

        # 移除平台名
        for name in self.PLATFORM_PATTERNS:
            text = re.sub(name, "", text, flags=re.IGNORECASE)

        # 移除动作词
        for action in self.ACTION_PATTERNS:
            text = re.sub(action, "", text)

        # 提取引号内的内容（优先）
        quotes = re.findall(r"[\"'](.+?)[\"']", text)
        if quotes:
            return quotes[0]

        # 移除停用词
        stopwords = [
            "帮我",
            "请",
            "一下",
            "关于",
            "的",
            "和",
            "或者",
            "还有",
            "找一下",
            "找",
            "搜索",
            "查一下",
            "获取",
            "提取",
            "采集",
            "这个",
            "这些",
            "内容",
            "的",
            "相关",
            "帖子",
            "文章",
            "视频",
        ]
        for sw in stopwords:
            text = re.sub(sw, " ", text)

        keyword = text.strip()
        # 清理多余空格
        keyword = re.sub(r"\s+", " ", keyword)

        if not keyword or len(keyword) <= 1:
            return None

        # 检查关键词是否有意义
        if not self._is_meaningful_text(keyword):
            return None

        return keyword

    def _is_valid_url(self, url: str) -> bool:
        """验证URL是否完整有效"""
        if not url:
            return False
        if len(url) < 10:
            return False
        return True

    def _is_meaningful_text(self, text: str) -> bool:
        """检查文本是否有意义"""
        if not text:
            return False

        chinese_chars = re.findall(r"[\u4e00-\u9fff]", text)
        english_chars = re.findall(r"[a-zA-Z]", text)
        digits = re.findall(r"\d", text)

        # 检查是否有意义的中文（至少2个不同字符）
        if len(chinese_chars) >= 2:
            unique_chars = set(chinese_chars)
            if len(unique_chars) >= 2:
                return True
            return False

        # 英文和数字
        meaningful = len(english_chars) + len(digits)
        if meaningful >= 2:
            return True

        return False

    def _determine_intent(
        self, text: str, entities: Dict, actions: List[str]
    ) -> IntentType:
        """确定用户意图"""
        # 有URL的情况优先
        if entities.get("urls"):
            # 检查具体动作
            if "图片" in text and any(
                p in text for p in ["提取", "下载", "获取", "爬取"]
            ):
                return IntentType.IMAGE_EXTRACT
            if "视频" in text and any(
                p in text for p in ["提取", "下载", "获取", "爬取"]
            ):
                return IntentType.VIDEO_EXTRACT
            if any(p in text for p in ["文字", "文本", "内容"]):
                return IntentType.TEXT_EXTRACT
            return IntentType.SINGLE_URL

        # 有平台的情况
        if entities.get("platform"):
            if "监控" in text:
                return IntentType.MONITOR
            if entities.get("keyword"):
                return IntentType.KEYWORD_SEARCH
            return IntentType.PLATFORM_CRAWL

        # 无URL/平台，根据动作判断
        if "图片" in text and any(p in text for p in ["提取", "下载", "获取", "爬取"]):
            return IntentType.IMAGE_EXTRACT
        if "视频" in text and any(p in text for p in ["提取", "下载", "获取", "爬取"]):
            return IntentType.VIDEO_EXTRACT
        if "文字" in text and any(p in text for p in ["提取", "下载", "获取", "爬取"]):
            return IntentType.TEXT_EXTRACT
        if any(p in text for p in ["批量", "多个", "很多"]):
            return IntentType.BATCH_CRAWL
        if "监控" in text:
            return IntentType.MONITOR

        # 有关键词（需要是有意义的关键词）
        keyword = entities.get("keyword")
        if keyword and self._is_meaningful_text(keyword):
            return IntentType.KEYWORD_SEARCH

        return IntentType.UNKNOWN

    def _calculate_confidence(
        self, intent: IntentType, entities: Dict, actions: List[str]
    ) -> float:
        """计算意图置信度"""
        base = 0.5

        if intent == IntentType.UNKNOWN:
            return 0.3

        if entities.get("urls"):
            base += 0.2

        if entities.get("platform"):
            base += 0.15

        if entities.get("keyword"):
            base += 0.1

        if actions:
            base += 0.1 * len(actions)

        return min(1.0, base)

    def _generate_suggestions(self, intent: IntentType, entities: Dict) -> List[str]:
        """生成建议"""
        suggestions = []

        if intent == IntentType.UNKNOWN:
            suggestions = [
                "请提供要爬取的网址",
                "或者告诉我想要采集的平台和内容",
                "例如: 帮我爬取这个链接 https://...",
            ]
        elif intent == IntentType.SINGLE_URL:
            if entities.get("platform"):
                suggestions.append(f"检测到平台: {entities['platform_name']}")
        elif intent == IntentType.KEYWORD_SEARCH:
            if entities.get("keyword"):
                suggestions.append(f"将搜索关键词: {entities['keyword']}")

        return suggestions


class AutoCrawler:
    """
    自然语言驱动的自动化爬虫

    使用方法:
        crawler = AutoCrawler()
        result = crawler.run("帮我爬取B站视频《原神》")
        print(result)
    """

    def __init__(self):
        self.intent_parser = IntentParser()
        self._init_components()

    def _init_components(self):
        """初始化组件"""
        try:
            from ..core.crawler_engine import CrawlerEngine
            from ..platforms.manager import PlatformManager
            from ..multimodal.multimodal_extractor import MultimodalExtractor

            self.crawler_engine = CrawlerEngine()
            self.platform_manager = PlatformManager()
            self.multimodal_extractor = MultimodalExtractor()
            self._initialized = True
        except ImportError as e:
            print(f"警告: 部分模块导入失败 - {e}")
            self._initialized = False

    async def _execute_single_url(
        self, url: str, options: Dict = None
    ) -> Dict[str, Any]:
        """执行单URL爬取"""
        result = await self.crawler_engine.crawl(url)
        return {
            "success": result.get("success", False),
            "url": url,
            "content": result.get("content", ""),
            "strategy": result.get("strategy_used", "unknown"),
            "metadata": result.get("metadata", {}),
        }

    async def _execute_platform_crawl(
        self, platform: str, keyword: str = None, **options
    ) -> Dict[str, Any]:
        """执行平台爬取"""
        from ..platforms.base_adapter import PlatformType

        platform_map = {
            "douyin": PlatformType.DOUYIN,
            "bilibili": PlatformType.BILIBILI,
            "xiaohongshu": PlatformType.XIAOHONGSHU,
            "wechat": PlatformType.WECHAT_PUBLIC,
        }

        platform_type = platform_map.get(platform)
        if not platform_type:
            return {"success": False, "error": f"不支持的平台: {platform}"}

        if keyword:
            return await self.platform_manager.extract_user_posts(
                platform_type, keyword, limit=options.get("limit", 20)
            )

        return {"success": False, "error": "请提供要搜索的关键词"}

    async def _execute_content_extract(
        self, url: str, extract_type: str
    ) -> Dict[str, Any]:
        """执行内容提取"""
        content = await self.crawler_engine.crawl(url)
        if not content.get("success"):
            return {"success": False, "error": "爬取失败"}

        if extract_type == "image":
            result = self.multimodal_extractor.extract_images(
                content.get("content", "")
            )
        elif extract_type == "video":
            result = self.multimodal_extractor.extract_videos(
                content.get("content", "")
            )
        else:
            result = self.multimodal_extractor.extract_text(content.get("content", ""))

        return {"success": True, "type": extract_type, "data": result}

    def run(self, task: str, **kwargs) -> Dict[str, Any]:
        """
        执行自然语言任务

        Args:
            task: 自然语言描述
            **kwargs: 额外参数

        Returns:
            执行结果
        """
        return asyncio.run(self.run_async(task, **kwargs))

    async def run_async(self, task: str, **kwargs) -> Dict[str, Any]:
        """
        异步执行自然语言任务

        Args:
            task: 自然语言描述
            **kwargs: 额外参数

        Returns:
            执行结果
        """
        # 1. 解析意图
        intent_result = self.intent_parser.parse(task)

        result = {
            "task": task,
            "intent": intent_result.intent.value,
            "confidence": intent_result.confidence,
            "entities": intent_result.entities,
            "suggestions": intent_result.suggestions,
        }

        if not self._initialized:
            result["error"] = "模块未完全初始化"
            result["help"] = intent_result.suggestions
            return result

        # 2. 执行任务
        try:
            if intent_result.intent == IntentType.SINGLE_URL:
                url = intent_result.entities.get("primary_url")
                if url:
                    result["data"] = await self._execute_single_url(url, kwargs)

            elif intent_result.intent == IntentType.PLATFORM_CRAWL:
                platform = intent_result.entities.get("platform")
                keyword = intent_result.entities.get("keyword")
                result["data"] = await self._execute_platform_crawl(
                    platform, keyword, **kwargs
                )

            elif intent_result.intent == IntentType.KEYWORD_SEARCH:
                keyword = intent_result.entities.get("keyword")
                platform = intent_result.entities.get("platform", "general")
                result["data"] = await self._execute_platform_crawl(
                    platform, keyword, **kwargs
                )

            elif intent_result.intent == IntentType.IMAGE_EXTRACT:
                url = intent_result.entities.get("primary_url")
                if url:
                    result["data"] = await self._execute_content_extract(url, "image")
                else:
                    result["error"] = "请提供要提取图片的URL"

            elif intent_result.intent == IntentType.VIDEO_EXTRACT:
                url = intent_result.entities.get("primary_url")
                if url:
                    result["data"] = await self._execute_content_extract(url, "video")
                else:
                    result["error"] = "请提供要提取视频的URL"

            elif intent_result.intent == IntentType.TEXT_EXTRACT:
                url = intent_result.entities.get("primary_url")
                if url:
                    result["data"] = await self._execute_content_extract(url, "text")
                else:
                    result["error"] = "请提供要提取文字的URL"

            else:
                result["error"] = "无法理解任务"
                result["help"] = intent_result.suggestions

        except Exception as e:
            result["error"] = str(e)

        return result


# 全局实例
_default_crawler: Optional[AutoCrawler] = None


def smart_crawl(task: str, **kwargs) -> Dict[str, Any]:
    """
    自然语言驱动的智能爬取

    只需输入自然语言描述，系统自动识别意图并执行。

    Examples:
        >>> smart_crawl("帮我爬取B站视频《原神》")
        >>> smart_crawl("提取网页中的图片 https://example.com")
        >>> smart_crawl("采集小红书上关于AI的帖子")
        >>> smart_crawl("监控抖音热门视频")

    Args:
        task: 自然语言任务描述
        **kwargs: 额外参数

    Returns:
        执行结果字典
    """
    global _default_crawler
    if _default_crawler is None:
        _default_crawler = AutoCrawler()
    return _default_crawler.run(task, **kwargs)


async def smart_crawl_async(task: str, **kwargs) -> Dict[str, Any]:
    """异步版本"""
    global _default_crawler
    if _default_crawler is None:
        _default_crawler = AutoCrawler()
    return await _default_crawler.run_async(task, **kwargs)


def parse_intent(text: str) -> IntentResult:
    """
    解析用户意图（不执行）

    用于预览系统如何理解你的输入

    Examples:
        >>> result = parse_intent("帮我爬取B站视频")
        >>> print(f"意图: {result.intent.value}")
        >>> print(f"置信度: {result.confidence}")
        >>> print(f"实体: {result.entities}")
    """
    parser = IntentParser()
    return parser.parse(text)
