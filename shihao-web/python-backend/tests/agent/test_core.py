import pytest
import pytest_asyncio
import asyncio
from shihao_finance.agent.core import ShiHaoAgent


@pytest_asyncio.fixture
async def agent():
    a = ShiHaoAgent(config={
        "archival_db_path": ":memory:"
    })
    await a.initialize()
    yield a
    await a.cleanup()


class TestShiHaoAgent:
    def test_initialization(self, agent):
        """测试初始化"""
        assert agent.memory is not None
        assert agent.memory.core is not None
        assert agent.memory.recall is not None
        assert agent.memory.archival is not None
    
    def test_get_context(self, agent):
        """测试获取上下文"""
        context = agent.get_context()
        assert "[PERSONA]" in context
        assert "[RISK_PROFILE]" in context
    
    @pytest.mark.asyncio
    async def test_update_memory(self, agent):
        """测试更新记忆"""
        await agent.update_core_memory("user_preferences", "偏好测试")
        assert agent.memory.core.get_block("user_preferences") == "偏好测试"
    
    @pytest.mark.asyncio
    async def test_recall_search(self, agent):
        """测试记忆搜索"""
        await agent.memory.recall.add("测试记忆", user_id="test")
        results = await agent.recall_search("测试", user_id="test")
        assert len(results) > 0