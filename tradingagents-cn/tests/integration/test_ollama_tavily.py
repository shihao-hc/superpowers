"""
TradingAgents-CN Ollama & Tavily Integration Tests
Real environment tests for Ollama and Tavily services
"""

import os
import pytest
import asyncio


class TestOllamaRealEnvironment:
    """Ollama 真实环境集成测试"""

    @pytest.fixture
    def ollama_url(self):
        return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    @pytest.fixture
    def ollama_model(self):
        return os.getenv("OLLAMA_MODEL", "llama3")

    @pytest.mark.asyncio
    async def test_ollama_health(self, ollama_url):
        """测试 Ollama 服务健康状态"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        is_healthy = await OllamaAdapter.check_health(ollama_url)
        
        if not is_healthy:
            pytest.skip(f"Ollama not available at {ollama_url}")
        
        assert is_healthy is True

    @pytest.mark.asyncio
    async def test_ollama_list_models(self, ollama_url):
        """测试列出可用模型"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        models = await OllamaAdapter.list_models(ollama_url)
        
        assert isinstance(models, list)
        if len(models) == 0:
            pytest.skip("No models available in Ollama")

    @pytest.mark.asyncio
    async def test_ollama_generate(self, ollama_url, ollama_model):
        """测试 Ollama 生成响应"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(
            model=ollama_model,
            base_url=ollama_url
        )
        
        response = await adapter.ainvoke("What is the current PE ratio of Apple?")
        
        assert response is not None
        assert isinstance(response.content, str)
        assert len(response.content) > 0
        print(f"\nOllama response: {response.content[:200]}...")

    @pytest.mark.asyncio
    async def test_ollama_with_system_prompt(self, ollama_url, ollama_model):
        """测试带系统提示的生成"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(
            model=ollama_model,
            base_url=ollama_url
        )
        
        response = await adapter.ainvoke(
            "Explain stock market to a beginner",
            system="You are a financial advisor. Keep answers concise."
        )
        
        assert response is not None
        assert len(response.content) > 0
        print(f"\nWith system prompt: {response.content[:200]}...")

    @pytest.mark.asyncio
    async def test_ollama_streaming(self, ollama_url, ollama_model):
        """测试流式输出"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(
            model=ollama_model,
            base_url=ollama_url
        )
        
        chunks = []
        async for chunk in adapter.astream("Count from 1 to 3"):
            chunks.append(chunk)
            print(f"Chunk: {chunk}", end="")
        
        full_response = "".join(chunks)
        assert len(full_response) > 0
        print(f"\nFull streaming response: {full_response}")

    @pytest.mark.asyncio
    async def test_ollama_in_trading_context(self, ollama_url, ollama_model):
        """测试在股票分析场景中使用"""
        from tradingagents.llm.ollama_adapter import OllamaAdapter
        
        adapter = OllamaAdapter(
            model=ollama_model,
            base_url=ollama_url
        )
        
        analysis_prompt = """
Analyze the following stock investment opportunity:

Stock: Apple Inc. (AAPL)
Current Price: $175.50
PE Ratio: 28.5
Market Cap: $2.7T
Revenue Growth: 8.1%

Please provide:
1. A brief investment thesis
2. Key risks
3. Recommendation (Buy/Hold/Sell)
"""
        
        response = await adapter.ainvoke(analysis_prompt)
        
        assert response is not None
        content_lower = response.content.lower()
        assert any(word in content_lower for word in ["buy", "hold", "sell", "recommend", "risk"])
        print(f"\nTrading analysis: {response.content[:300]}...")


class TestTavilyRealEnvironment:
    """Tavily 真实环境集成测试"""

    @pytest.fixture
    def tavily_api_key(self):
        key = os.getenv("TAVILY_API_KEY")
        if not key:
            pytest.skip("TAVILY_API_KEY not set")
        return key

    @pytest.mark.asyncio
    async def test_tavily_basic_search(self, tavily_api_key):
        """测试基础搜索"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        tool = TavilySearchTool(api_key=tavily_api_key)
        
        results = await tool.search("Apple stock news")
        
        assert "results" in results or "error" in results
        if "error" in results:
            pytest.skip(f"Tavily error: {results['error']}")
        
        print(f"\nFound {len(results.get('results', []))} results")
        if results.get("answer"):
            print(f"AI Answer: {results['answer'][:200]}...")

    @pytest.mark.asyncio
    async def test_tavily_finance_search(self, tavily_api_key):
        """测试金融领域搜索"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        tool = TavilySearchTool(api_key=tavily_api_key)
        
        results = await tool.search_finance("Tesla Q4 2025 earnings")
        
        assert "results" in results
        print(f"\nFinance search: {len(results.get('results', []))} results")

    @pytest.mark.asyncio
    async def test_tavily_news_search(self, tavily_api_key):
        """测试新闻搜索"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        tool = TavilySearchTool(api_key=tavily_api_key)
        
        results = await tool.search_news("Federal Reserve interest rate decision", days=7)
        
        assert "results" in results
        print(f"\nNews search: {len(results.get('results', []))} results")

    @pytest.mark.asyncio
    async def test_tavily_format_results(self, tavily_api_key):
        """测试结果格式化"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        tool = TavilySearchTool(api_key=tavily_api_key)
        
        results = await tool.search("AAPL stock analysis")
        
        if "error" in results:
            pytest.skip(f"Tavily error: {results['error']}")
        
        formatted = tool.format_results(results)
        
        assert isinstance(formatted, str)
        assert len(formatted) > 0
        print(f"\nFormatted results:\n{formatted[:500]}...")

    @pytest.mark.asyncio
    async def test_tavily_extract_context(self, tavily_api_key):
        """测试上下文提取"""
        from tradingagents.tools.tavily_search import TavilySearchTool
        
        tool = TavilySearchTool(api_key=tavily_api_key)
        
        results = await tool.search("Microsoft Azure cloud growth")
        
        if "error" in results:
            pytest.skip(f"Tavily error: {results['error']}")
        
        context = tool.extract_context(results, max_chars=1000)
        
        assert isinstance(context, str)
        assert len(context) <= 1500
        print(f"\nExtracted context length: {len(context)}")


class TestTavilyRAGIntegration:
    """Tavily RAG 集成测试"""

    @pytest.fixture
    def tavily_api_key(self):
        key = os.getenv("TAVILY_API_KEY")
        if not key:
            pytest.skip("TAVILY_API_KEY not set")
        return key

    @pytest.fixture
    def ollama_url(self):
        return os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    @pytest.mark.asyncio
    async def test_rag_enhance_context(self, tavily_api_key):
        """测试 RAG 上下文增强"""
        from tradingagents.tools.tavily_search import TavilyRAGTool
        
        rag_tool = TavilyRAGTool(api_key=tavily_api_key)
        
        original_context = "Company ABC shows strong fundamentals with consistent revenue growth."
        
        enhanced = await rag_tool.enhance_with_search(
            query="Company ABC latest news",
            context=original_context,
            max_search_results=3
        )
        
        assert original_context in enhanced
        assert "相关网络信息" in enhanced or "网络信息" in enhanced
        print(f"\nEnhanced context length: {len(enhanced)}")

    @pytest.mark.asyncio
    async def test_rag_direct_query(self, tavily_api_key):
        """测试直接 RAG 查询"""
        from tradingagents.tools.tavily_search import TavilyRAGTool
        
        rag_tool = TavilyRAGTool(api_key=tavily_api_key)
        
        result = await rag_tool.rag_query("NVIDIA AI chip market share", max_results=5)
        
        assert isinstance(result, str)
        assert len(result) > 0
        print(f"\nRAG query result:\n{result[:300]}...")


class TestOllamaFactoryIntegration:
    """Ollama 工厂集成测试"""

    @pytest.mark.skipif(
        os.getenv("OLLAMA_BASE_URL") is None,
        reason="OLLAMA_BASE_URL not set"
    )
    @pytest.mark.asyncio
    async def test_factory_create_ollama(self):
        """测试工厂创建 Ollama 适配器"""
        from tradingagents.llm.factory import create_llm_adapter
        
        adapter = create_llm_adapter(
            provider="ollama",
            model="llama3",
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
        )
        
        assert adapter is not None
        assert adapter.get_provider_name() == "ollama"
        
        response = await adapter.ainvoke("Hello")
        assert response is not None

    @pytest.mark.asyncio
    async def test_factory_create_with_env_fallback(self):
        """测试工厂环境变量回退"""
        from tradingagents.llm.factory import create_llm_adapter
        
        original_provider = os.getenv("LLM_PROVIDER")
        
        try:
            os.environ["LLM_PROVIDER"] = "ollama"
            
            adapter = create_llm_adapter(provider="ollama")
            assert adapter is not None
        finally:
            if original_provider:
                os.environ["LLM_PROVIDER"] = original_provider
            else:
                os.environ.pop("LLM_PROVIDER", None)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
