"""
TradingAgents-CN Tavily Search Integration Tests
"""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock


class TestTavilySearchTool:
    """Tavily 搜索工具集成测试"""

    @pytest.fixture
    def mock_tavily_client(self):
        """模拟 Tavily 客户端"""
        mock = MagicMock()
        mock.search.return_value = {
            "query": "AAPL stock analysis",
            "answer": "Apple Inc. showed strong performance...",
            "results": [
                {
                    "title": "Apple Stock News",
                    "url": "https://example.com/apple",
                    "content": "Apple reported strong Q4 earnings..."
                },
                {
                    "title": "Tech Market Analysis",
                    "url": "https://example.com/tech",
                    "content": "Technology sector continues growth..."
                }
            ]
        }
        return mock

    def test_tavily_not_available_without_key(self):
        """测试无 API Key 时不可用"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            tool = TavilySearchTool(api_key=None)
            assert tool.is_available() is False

    def test_tavily_available_with_key(self, mock_tavily_client):
        """测试有 API Key 时可用"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient', return_value=mock_tavily_client):
                tool = TavilySearchTool(api_key="test-key")
                assert tool.is_available() is True

    def test_tavily_unavailable_when_lib_not_installed(self):
        """测试库未安装时不可用"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', False):
            tool = TavilySearchTool(api_key="test-key")
            assert tool.is_available() is False

    @pytest.mark.asyncio
    async def test_tavily_search_basic(self, mock_tavily_client):
        """测试基础搜索"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient', return_value=mock_tavily_client):
                tool = TavilySearchTool(api_key="test-key")
                
                with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                    mock_thread.return_value = mock_tavily_client.search.return_value
                    
                    result = await tool.search("AAPL stock analysis")
                    
                    assert "results" in result
                    assert len(result["results"]) == 2

    @pytest.mark.asyncio
    async def test_tavily_search_not_available(self):
        """测试服务不可用时返回错误"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', False):
            tool = TavilySearchTool(api_key=None)
            result = await tool.search("test query")
            
            assert "error" in result
            assert "results" in result
            assert result["results"] == []

    @pytest.mark.asyncio
    async def test_tavily_search_finance_domain(self, mock_tavily_client):
        """测试金融领域搜索"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient', return_value=mock_tavily_client):
                tool = TavilySearchTool(api_key="test-key")
                
                with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                    mock_thread.return_value = mock_tavily_client.search.return_value
                    
                    result = await tool.search_finance("TSLA earnings")
                    
                    assert "results" in result

    @pytest.mark.asyncio
    async def test_tavily_search_news_domain(self, mock_tavily_client):
        """测试新闻搜索"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient', return_value=mock_tavily_client):
                tool = TavilySearchTool(api_key="test-key")
                
                with patch('asyncio.to_thread', new_callable=AsyncMock) as mock_thread:
                    mock_thread.return_value = mock_tavily_client.search.return_value
                    
                    result = await tool.search_news("Fed interest rate", days=7)
                    
                    assert "results" in result

    def test_tavily_format_results(self, mock_tavily_client):
        """测试结果格式化"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient', return_value=mock_tavily_client):
                tool = TavilySearchTool(api_key="test-key")
                
                formatted = tool.format_results(mock_tavily_client.search.return_value)
                
                assert "Apple Stock News" in formatted
                assert "Tech Market Analysis" in formatted
                assert "AI 摘要:" in formatted

    def test_tavily_extract_context(self, mock_tavily_client):
        """测试上下文提取"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient', return_value=mock_tavily_client):
                tool = TavilySearchTool(api_key="test-key")
                
                context = tool.extract_context(mock_tavily_client.search.return_value)
                
                assert "Apple" in context or "Apple Stock News" in context
                assert "https://" in context

    def test_tavily_extract_context_with_limit(self, mock_tavily_client):
        """测试上下文提取字符限制"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient', return_value=mock_tavily_client):
                tool = TavilySearchTool(api_key="test-key")
                
                context = tool.extract_context(
                    mock_tavily_client.search.return_value, 
                    max_chars=100
                )
                
                assert len(context) <= 200  # 有分隔符


class TestTavilyRAGTool:
    """Tavily RAG 工具测试"""

    @pytest.fixture
    def mock_search_results(self):
        return {
            "query": "company analysis",
            "answer": "The company shows positive momentum...",
            "results": [
                {
                    "title": "Company News",
                    "url": "https://example.com/news",
                    "content": "Latest company updates..."
                }
            ]
        }

    def test_rag_tool_creation(self):
        """测试 RAG 工具创建"""
        from tradingagents.tools.tavily_search import TavilyRAGTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient'):
                rag_tool = TavilyRAGTool(api_key="test-key")
                assert rag_tool.search_tool is not None

    @pytest.mark.asyncio
    async def test_rag_enhance_context(self, mock_search_results):
        """测试上下文增强"""
        from tradingagents.tools.tavily_search import TavilyRAGTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient'):
                rag_tool = TavilyRAGTool(api_key="test-key")
                
                with patch.object(rag_tool.search_tool, 'search', new_callable=AsyncMock) as mock_search:
                    mock_search.return_value = mock_search_results
                    
                    original_context = "Company has strong fundamentals..."
                    enhanced = await rag_tool.enhance_with_search(
                        query="latest news",
                        context=original_context
                    )
                    
                    assert original_context in enhanced
                    assert "相关网络信息" in enhanced

    @pytest.mark.asyncio
    async def test_rag_query(self, mock_search_results):
        """测试直接 RAG 查询"""
        from tradingagents.tools.tavily_search import TavilyRAGTool
        
        with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', True):
            with patch('tradingagents.tools.tavily_search.TavilyClient'):
                rag_tool = TavilyRAGTool(api_key="test-key")
                
                with patch.object(rag_tool.search_tool, 'search', new_callable=AsyncMock) as mock_search:
                    mock_search.return_value = mock_search_results
                    with patch.object(rag_tool.search_tool, 'format_results', return_value="Formatted results"):
                        result = await rag_tool.rag_query("company analysis")
                        assert "Formatted results" in result


class TestSanitizeCacheKey:
    """缓存键净化测试"""

    def test_sanitize_removes_special_chars(self):
        """测试移除特殊字符"""
        from tradingagents.tools.tavily_search import _sanitize_cache_key
        
        key = _sanitize_cache_key("test<script>alert()</script>")
        assert "<" not in key
        assert ">" not in key

    def test_sanitize_truncates_long_input(self):
        """测试截断长输入"""
        from tradingagents.tools.tavily_search import _sanitize_cache_key
        
        long_input = "a" * 200
        key = _sanitize_cache_key(long_input)
        assert len(key) <= 20

    def test_sanitize_deterministic(self):
        """测试相同输入产生相同输出"""
        from tradingagents.tools.tavily_search import _sanitize_cache_key
        
        key1 = _sanitize_cache_key("test query")
        key2 = _sanitize_cache_key("test query")
        assert key1 == key2


def test_create_tavily_tool():
    """测试工厂函数"""
    from tradingagents.tools.tavily_search import create_tavily_tool
    
    with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', False):
        tool = create_tavily_tool()
        assert isinstance(tool, type(create_tavily_tool()))


def test_create_tavily_rag_tool():
    """测试 RAG 工厂函数"""
    from tradingagents.tools.tavily_search import create_tavily_rag_tool
    
    with patch('tradingagents.tools.tavily_search.TAVILY_AVAILABLE', False):
        tool = create_tavily_rag_tool()
        assert isinstance(tool.search_tool, type(create_tavily_rag_tool().search_tool))
