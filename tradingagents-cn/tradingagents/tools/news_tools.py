"""
TradingAgents-CN News Tools
新闻数据获取工具
"""

from typing import Optional, Dict, Any, List
import asyncio

try:
    import akshare as ak
    AKSHARE_AVAILABLE = True
except ImportError:
    AKSHARE_AVAILABLE = False

from .cache import CacheManager


class NewsTools:
    """新闻工具集"""

    def __init__(self, cache_manager: Optional[CacheManager] = None):
        self.cache = cache_manager or CacheManager()

    async def get_stock_news(self, symbol: str, limit: int = 20) -> List[Dict[str, Any]]:
        """
        获取个股新闻

        Args:
            symbol: 股票代码
            limit: 新闻数量

        Returns:
            新闻列表
        """
        if not AKSHARE_AVAILABLE:
            return [{"error": "akshare not installed"}]

        cache_key = f"stock_news:{symbol}:{limit}"

        @self.cache.cached(key_prefix="news", ttl=600)
        async def _fetch():
            try:
                df = await asyncio.to_thread(
                    ak.stock_news_em,
                    symbol=symbol
                )
                return df.head(limit).to_dict("records")
            except Exception as e:
                return [{"error": str(e)}]

        return await _fetch()

    async def get_market_news(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        获取市场新闻

        Args:
            limit: 新闻数量

        Returns:
            新闻列表
        """
        if not AKSHARE_AVAILABLE:
            return [{"error": "akshare not installed"}]

        cache_key = f"market_news:{limit}"

        @self.cache.cached(key_prefix="news", ttl=600)
        async def _fetch():
            try:
                df = await asyncio.to_thread(ak.stock_tele_list)
                return df.head(limit).to_dict("records")
            except Exception as e:
                return [{"error": str(e)}]

        return await _fetch()

    async def search_news(self, keyword: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        搜索新闻

        Args:
            keyword: 搜索关键词
            limit: 结果数量

        Returns:
            相关新闻列表
        """
        cache_key = f"search_news:{keyword}:{limit}"

        @self.cache.cached(key_prefix="news", ttl=300)
        async def _fetch():
            try:
                df = await asyncio.to_thread(
                    ak.stock_tele_list
                )
                filtered = df[df["新闻标题"].str.contains(keyword, na=False)]
                return filtered.head(limit).to_dict("records")
            except Exception as e:
                return [{"error": str(e)}]

        return await _fetch()

    def format_news_summary(self, news_list: List[Dict[str, Any]]) -> str:
        """
        格式化新闻为摘要文本

        Args:
            news_list: 新闻列表

        Returns:
            格式化文本
        """
        if not news_list or (len(news_list) == 1 and "error" in news_list[0]):
            return "暂无相关新闻"

        lines = []
        for i, news in enumerate(news_list[:10], 1):
            title = news.get("新闻标题", "无标题")
            content = news.get("新闻内容", "")[:100]
            source = news.get("文章来源", "未知来源")
            lines.append(f"{i}. {title}\n   来源: {source}\n   摘要: {content}...")

        return "\n\n".join(lines)


def create_news_tools(cache_manager: Optional[CacheManager] = None) -> NewsTools:
    """创建新闻工具"""
    return NewsTools(cache_manager)
