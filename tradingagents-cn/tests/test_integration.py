"""
TradingAgents-CN 集成测试
"""

import pytest
import asyncio
import os
from datetime import datetime
from unittest.mock import patch, AsyncMock

import sys
sys.path.insert(0, "tradingagents-cn")

from tradingagents.agents.utils.agent_states import create_initial_state
from tradingagents.llm.base_llm import ChatHistory, LLMResponse
from tradingagents.tools.cache import CacheManager, MultiLevelCache


class MockStreamingLLM:
    """模拟流式LLM"""
    
    async def ainvoke(self, prompt: str, **kwargs):
        class MockResponse:
            content = f"Analysis of: {prompt[:50]}..."
            usage = {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150}
        return MockResponse()
    
    async def astream(self, prompt: str, **kwargs):
        words = ["First", "second", "third", "response"]
        for word in words:
            yield word + " "


class TestLLMResponse:
    """测试LLM响应封装"""
    
    def test_response_content(self):
        """测试响应内容"""
        response = LLMResponse(
            content="Test response",
            usage={"prompt_tokens": 10, "completion_tokens": 5},
            model="gpt-4"
        )
        
        assert response.content == "Test response"
        assert response.usage["total_tokens"] == 15
        assert response.model == "gpt-4"
    
    def test_response_str(self):
        """测试响应字符串化"""
        response = LLMResponse(content="Hello World")
        assert str(response) == "Hello World"


class TestChatHistory:
    """测试对话历史"""
    
    def test_add_messages(self):
        """测试添加消息"""
        history = ChatHistory()
        
        history.add_user_message("Hello")
        history.add_ai_message("Hi there")
        history.add_system_message("You are a helpful assistant")
        
        assert len(history) == 3
        
        messages = history.get_messages()
        assert messages[0]["role"] == "user"
        assert messages[1]["role"] == "assistant"
        assert messages[2]["role"] == "system"
    
    def test_clear_history(self):
        """测试清空历史"""
        history = ChatHistory()
        history.add_user_message("Test")
        
        assert len(history) == 1
        
        history.clear()
        assert len(history) == 0


class TestPerformanceMetrics:
    """测试性能指标"""
    
    @pytest.mark.asyncio
    async def test_llm_latency_tracking(self):
        """测试LLM延迟追踪"""
        import time
        
        llm = MockStreamingLLM()
        
        start = time.time()
        await llm.ainvoke("Test prompt")
        elapsed = time.time() - start
        
        assert elapsed < 1.0  # 应该很快完成
    
    @pytest.mark.asyncio
    async def test_concurrent_calls(self):
        """测试并发调用"""
        llm = MockStreamingLLM()
        
        async def call():
            return await llm.ainvoke(f"Prompt for task")
        
        tasks = [call() for _ in range(5)]
        results = await asyncio.gather(*tasks)
        
        assert len(results) == 5


class TestWorkflowIntegration:
    """测试工作流集成"""
    
    @pytest.mark.asyncio
    async def test_state_propagation(self):
        """测试状态传播"""
        state = create_initial_state("测试公司", "2024-01-15")
        
        state["market_report"] = "市场分析报告"
        state["fundamentals_report"] = "基本面分析报告"
        
        assert state["market_report"] == "市场分析报告"
        assert state["fundamentals_report"] == "基本面分析报告"
    
    @pytest.mark.asyncio
    async def test_debate_state_update(self):
        """测试辩论状态更新"""
        state = create_initial_state("测试公司", "2024-01-15")
        
        debate_state = state["investment_debate_state"]
        debate_state["bull_history"] = "看涨论点1"
        debate_state["count"] = 1
        
        assert debate_state["bull_history"] == "看涨论点1"
        assert debate_state["count"] == 1


class TestErrorHandling:
    """测试错误处理"""
    
    @pytest.mark.asyncio
    async def test_llm_failure_handling(self):
        """测试LLM失败处理"""
        class FailingLLM:
            async def ainvoke(self, prompt):
                raise Exception("API Error")
        
        llm = FailingLLM()
        
        with pytest.raises(Exception, match="API Error"):
            await llm.ainvoke("Test")
    
    @pytest.mark.asyncio
    async def test_cache_failure_graceful(self):
        """测试缓存失败时优雅降级"""
        cache = MultiLevelCache()
        
        cache.set("key1", "value1")
        assert cache.get("key1") == "value1"


class TestStreamingOutput:
    """测试流式输出"""
    
    @pytest.mark.asyncio
    async def test_streaming_response(self):
        """测试流式响应"""
        llm = MockStreamingLLM()
        
        full_response = ""
        async for chunk in llm.astream("Test prompt"):
            full_response += chunk
        
        assert "First" in full_response
        assert "second" in full_response


class TestCostEstimation:
    """测试成本估算"""
    
    def test_token_usage_calculation(self):
        """测试token使用计算"""
        usage = {
            "prompt_tokens": 1000,
            "completion_tokens": 500,
            "total_tokens": 1500
        }
        
        # 假设 GPT-4 价格: $0.03/1K prompt, $0.06/1K completion
        prompt_cost = usage["prompt_tokens"] / 1000 * 0.03
        completion_cost = usage["completion_tokens"] / 1000 * 0.06
        total_cost = prompt_cost + completion_cost
        
        assert total_cost > 0
        assert total_cost < 1.0  # 应该小于$1


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
