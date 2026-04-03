"""
TradingAgents-CN 单元测试
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

import sys
sys.path.insert(0, "tradingagents-cn")

from tradingagents.agents.utils.agent_states import (
    create_initial_state,
    AgentState,
    InvestDebateState,
)
from tradingagents.agents.researchers.researcher import BullResearcher, BearResearcher, Judge
from tradingagents.llm.factory import create_llm_adapter, list_supported_providers
from tradingagents.tools.cache import MultiLevelCache, MemoryCache, FileCache, CacheManager


class MockLLM:
    """模拟LLM用于测试"""
    
    def __init__(self, response_content: str = "Mock response"):
        self.response_content = response_content
        self.call_count = 0
        self.last_prompt = None
        self.call_history = []
    
    async def ainvoke(self, prompt: str, **kwargs):
        self.call_count += 1
        self.last_prompt = prompt
        self.call_history.append({
            "prompt": prompt,
            "timestamp": datetime.now().isoformat(),
            "kwargs": kwargs
        })
        
        class MockResponse:
            content = self.response_content
            raw_response = None
            usage = {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
        
        return MockResponse()


class TestAgentStates:
    """测试状态模型"""
    
    def test_create_initial_state(self):
        """测试初始状态创建"""
        state = create_initial_state("平安银行", "2024-01-15")
        
        assert state["company_of_interest"] == "平安银行"
        assert state["trade_date"] == "2024-01-15"
        assert state["status"] == "initialized"
        assert "id" in state
        assert "created_at" in state
        
        assert state["market_report"] == ""
        assert state["sentiment_report"] == ""
        assert state["news_report"] == ""
        assert state["fundamentals_report"] == ""
        
        assert "investment_debate_state" in state
        assert "risk_debate_state" in state
        
    def test_initial_state_with_task_id(self):
        """测试带任务ID的初始状态"""
        state = create_initial_state("平安银行", "2024-01-15", task_id="test-123")
        assert state["id"] == "test-123"


class TestResearchers:
    """测试研究员智能体"""
    
    @pytest.mark.asyncio
    async def test_bull_researcher(self):
        """测试看涨研究员"""
        mock_llm = MockLLM("看涨理由：\n1. 业绩增长\n2. 政策利好")
        bull = BullResearcher(mock_llm)
        
        context = {
            "company": "平安银行",
            "date": "2024-01-15",
            "market_report": "市场报告",
            "fundamentals_report": "基本面报告",
            "news_report": "新闻报告",
            "sentiment_report": "情绪报告",
        }
        state = create_initial_state("平安银行", "2024-01-15")
        
        result = await bull.research(context, state)
        
        assert "看涨" in result
        assert mock_llm.call_count == 1
        assert "平安银行" in mock_llm.last_prompt
    
    @pytest.mark.asyncio
    async def test_bear_researcher(self):
        """测试看跌研究员"""
        mock_llm = MockLLM("看跌理由：\n1. 风险因素\n2. 市场压力")
        bear = BearResearcher(mock_llm)
        
        context = {
            "company": "平安银行",
            "date": "2024-01-15",
        }
        state = create_initial_state("平安银行", "2024-01-15")
        
        result = await bear.research(context, state)
        
        assert "看跌" in result
        assert mock_llm.call_count == 1
    
    @pytest.mark.asyncio
    async def test_judge_decision(self):
        """测试裁判决策"""
        mock_llm = MockLLM("决策：proceed\n置信度：0.8")
        judge = Judge(mock_llm)
        
        result = await judge.decide(
            bull_argument="看涨论点",
            bear_argument="看跌论点",
            context={"company": "平安银行"},
            state=create_initial_state("平安银行", "2024-01-15")
        )
        
        assert "proceed" in result.lower() or "决策" in result
        assert mock_llm.call_count == 1


class TestLLMFactory:
    """测试LLM工厂"""
    
    def test_list_supported_providers(self):
        """测试支持的提供商列表"""
        providers = list_supported_providers()
        assert "openai" in providers
        assert "deepseek" in providers
        assert "google" in providers
        assert "dashscope" in providers
    
    def test_create_llm_without_api_key_raises(self):
        """测试未提供API密钥时抛出异常"""
        with patch.dict("os.environ", {}, clear=True):
            with pytest.raises(ValueError, match="API"):
                create_llm_adapter("openai")


class TestCache:
    """测试缓存系统"""
    
    def test_memory_cache_basic(self):
        """测试内存缓存基本功能"""
        cache = MemoryCache(max_size=10, ttl=60)
        
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"
        
        cache.delete("key1")
        assert cache.get("key1") is None
    
    def test_memory_cache_lru(self):
        """测试LRU淘汰"""
        cache = MemoryCache(max_size=3, ttl=60)
        
        cache.set("a", 1)
        cache.set("b", 2)
        cache.set("c", 3)
        cache.set("d", 4)  # 应该淘汰 'a'
        
        assert cache.get("a") is None
        assert cache.get("d") == 4
    
    def test_memory_cache_ttl(self):
        """测试TTL过期"""
        cache = MemoryCache(max_size=10, ttl=-1)  # 立即过期
        
        cache.set("key1", "value1")
        assert cache.get("key1") is None
    
    def test_file_cache_basic(self, tmp_path):
        """测试文件缓存"""
        cache = FileCache(cache_dir=str(tmp_path / ".cache"), ttl=60)
        
        cache.set("key1", {"data": "value1"})
        result = cache.get("key1")
        
        assert result is not None
        assert result["data"] == "value1"
    
    def test_multi_level_cache(self, tmp_path):
        """测试多级缓存"""
        cache = MultiLevelCache(
            memory_cache=MemoryCache(),
            file_cache=FileCache(cache_dir=str(tmp_path / ".cache")),
        )
        
        cache.set("key1", "value1")
        
        assert cache.get("key1") == "value1"
        assert cache.memory_cache.get("key1") == "value1"
    
    def test_cache_generate_key(self):
        """测试缓存键生成"""
        cache = MultiLevelCache()
        
        key1 = cache.generate_key("arg1", "arg2")
        key2 = cache.generate_key("arg1", "arg2")
        key3 = cache.generate_key("arg1", "arg3")
        
        assert key1 == key2
        assert key1 != key3


class TestCacheDecorator:
    """测试缓存装饰器"""
    
    @pytest.mark.asyncio
    async def test_cached_decorator_sync(self):
        """测试同步函数缓存"""
        cache_manager = CacheManager()
        call_count = 0
        
        @cache_manager.cached(key_prefix="test", ttl=60)
        def expensive_function(x, y):
            nonlocal call_count
            call_count += 1
            return x + y
        
        assert expensive_function(1, 2) == 3
        assert expensive_function(1, 2) == 3
        assert expensive_function(1, 2) == 3
        assert call_count == 1  # 只调用一次
    
    @pytest.mark.asyncio
    async def test_cached_decorator_async(self):
        """测试异步函数缓存"""
        cache_manager = CacheManager()
        call_count = 0
        
        @cache_manager.cached(key_prefix="async_test", ttl=60)
        async def async_function(x):
            nonlocal call_count
            call_count += 1
            await asyncio.sleep(0.01)
            return x * 2
        
        result1 = await async_function(5)
        result2 = await async_function(5)
        
        assert result1 == 10
        assert result2 == 10
        assert call_count == 1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
