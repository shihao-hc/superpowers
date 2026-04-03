"""
TradingAgents-CN Tavily Search Tool
支持 Tavily AI 搜索 API，用于 RAG 增强检索
"""

import re
import hashlib
from typing import Optional, Dict, Any, List
import os
import asyncio

try:
    from tavily import TavilyClient
    TAVILY_AVAILABLE = True
except ImportError:
    TAVILY_AVAILABLE = False

from .cache import CacheManager


def _sanitize_cache_key(value: str, max_length: int = 64) -> str:
    clean = re.sub(r'[^\w\s-]', '', value)
    clean = clean.strip()[:max_length]
    return hashlib.sha256(clean.encode()).hexdigest()[:16]


class TavilySearchTool:
    """Tavily AI 搜索工具"""

    DEFAULT_BASE_URL = "https://api.tavily.com"

    def __init__(
        self,
        api_key: Optional[str] = None,
        cache_manager: Optional[CacheManager] = None,
        base_url: Optional[str] = None
    ):
        self.api_key = api_key or os.getenv("TAVILY_API_KEY")
        self.base_url = base_url or self.DEFAULT_BASE_URL
        self.cache = cache_manager or CacheManager()
        self.client = None
        
        if self.api_key and TAVILY_AVAILABLE:
            self.client = TavilyClient(api_key=self.api_key)

    def is_available(self) -> bool:
        """检查 Tavily 是否可用"""
        return TAVILY_AVAILABLE and self.client is not None

    async def search(
        self,
        query: str,
        search_depth: str = "basic",
        max_results: int = 5,
        include_answer: bool = True,
        include_raw_content: bool = False,
        include_images: bool = False,
        **kwargs
    ) -> Dict[str, Any]:
        """
        执行搜索

        Args:
            query: 搜索查询
            search_depth: 搜索深度 "basic" 或 "advanced"
            max_results: 最大结果数
            include_answer: 是否包含 AI 生成的答案
            include_raw_content: 是否包含原始内容
            include_images: 是否包含图片
            **kwargs: 其他参数

        Returns:
            搜索结果
        """
        if not self.is_available():
            return {
                "error": "Tavily API not available. Please install tavily-python and set TAVILY_API_KEY.",
                "query": "[redacted]" if query else "",
                "results": [],
            }

        safe_query = query[:500] if query else ""
        cache_key = f"tavily:{_sanitize_cache_key(safe_query)}:{search_depth}:{max_results}"

        @self.cache.cached(key_prefix="tavily", ttl=1800)
        async def _search():
            try:
                response = await asyncio.to_thread(
                    self.client.search,
                    query=safe_query,
                    search_depth=search_depth,
                    max_results=max_results,
                    include_answer=include_answer,
                    include_raw_content=include_raw_content,
                    include_images=include_images,
                    **kwargs
                )
                return response
            except Exception as e:
                return {"error": "Search service temporarily unavailable", "query": "", "results": []}

        return await _search()

    async def search_finance(
        self,
        query: str,
        max_results: int = 5
    ) -> Dict[str, Any]:
        """
        金融领域搜索（使用金融过滤器）

        Args:
            query: 搜索查询
            max_results: 最大结果数

        Returns:
            搜索结果
        """
        return await self.search(
            query=query,
            search_depth="advanced",
            max_results=max_results,
            include_answer=True,
            topic="finance"
        )

    async def search_news(
        self,
        query: str,
        max_results: int = 5,
        days: int = 7
    ) -> Dict[str, Any]:
        """
        新闻搜索

        Args:
            query: 搜索查询
            max_results: 最大结果数
            days: 搜索范围（天数）

        Returns:
            搜索结果
        """
        return await self.search(
            query=query,
            search_depth="advanced",
            max_results=max_results,
            include_answer=True,
            topic="news",
            days=days
        )

    def format_results(self, results: Dict[str, Any], max_length: int = 500) -> str:
        """
        格式化搜索结果为文本

        Args:
            results: 搜索结果
            max_length: 每个结果的最大长度

        Returns:
            格式化文本
        """
        if "error" in results:
            return f"搜索失败: {results['error']}"

        answer = results.get("answer", "")
        if answer:
            formatted = f"AI 摘要: {answer}\n\n"
        else:
            formatted = ""

        formatted += "相关结果:\n"
        for i, result in enumerate(results.get("results", [])[:5], 1):
            title = result.get("title", "无标题")
            url = result.get("url", "")
            snippet = result.get("content", "")[:max_length]
            
            formatted += f"\n{i}. {title}\n"
            formatted += f"   来源: {url}\n"
            formatted += f"   摘要: {snippet}..."
            
        return formatted

    def extract_context(self, results: Dict[str, Any], max_chars: int = 4000) -> str:
        """
        提取搜索结果作为 LLM 上下文

        Args:
            results: 搜索结果
            max_chars: 最大字符数

        Returns:
            上下文文本
        """
        if "error" in results:
            return ""

        context_parts = []
        total_chars = 0

        for result in results.get("results", []):
            title = result.get("title", "")
            content = result.get("content", "")
            source = result.get("source", "")

            part = f"来源: {source}\n标题: {title}\n内容: {content}"
            
            if total_chars + len(part) > max_chars:
                remaining = max_chars - total_chars
                if remaining > 100:
                    context_parts.append(part[:remaining])
                break

            context_parts.append(part)
            total_chars += len(part)

        return "\n\n---\n\n".join(context_parts)


class TavilyRAGTool:
    """Tavily RAG 增强工具"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        cache_manager: Optional[CacheManager] = None
    ):
        self.search_tool = TavilySearchTool(api_key=api_key, cache_manager=cache_manager)

    async def enhance_with_search(
        self,
        query: str,
        context: str,
        max_search_results: int = 3
    ) -> str:
        """
        使用搜索结果增强现有上下文

        Args:
            query: 搜索查询
            context: 现有上下文
            max_search_results: 最大搜索结果数

        Returns:
            增强后的上下文
        """
        search_results = await self.search_tool.search(
            query=query,
            max_results=max_search_results,
            include_answer=True
        )

        search_context = self.search_tool.extract_context(search_results)
        
        if search_context:
            enhanced = f"{context}\n\n=== 相关网络信息 ===\n\n{search_context}"
        else:
            enhanced = context

        return enhanced

    async def rag_query(
        self,
        query: str,
        max_results: int = 5
    ) -> str:
        """
        直接 RAG 查询

        Args:
            query: 查询
            max_results: 最大结果数

        Returns:
            RAG 结果文本
        """
        results = await self.search_tool.search(
            query=query,
            max_results=max_results,
            include_answer=True
        )
        return self.search_tool.format_results(results)


def create_tavily_tool(
    api_key: Optional[str] = None,
    cache_manager: Optional[CacheManager] = None
) -> TavilySearchTool:
    """创建 Tavily 搜索工具"""
    return TavilySearchTool(api_key=api_key, cache_manager=cache_manager)


def create_tavily_rag_tool(
    api_key: Optional[str] = None,
    cache_manager: Optional[CacheManager] = None
) -> TavilyRAGTool:
    """创建 Tavily RAG 工具"""
    return TavilyRAGTool(api_key=api_key, cache_manager=cache_manager)
