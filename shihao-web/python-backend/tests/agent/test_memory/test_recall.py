import pytest
import pytest_asyncio
import asyncio
from shihao_finance.agent.memory.recall import RecallMemory


@pytest_asyncio.fixture
async def memory():
    mem = RecallMemory(collection_name="test_memories")
    await mem.initialize()
    yield mem
    await mem.cleanup()


class TestRecallMemory:
    @pytest.mark.asyncio
    async def test_add_memory(self, memory):
        """测试添加记忆"""
        result = await memory.add(
            text="用户偏好科技股",
            user_id="test_user",
            categories=["preference"]
        )
        assert result["status"] == "success"
    
    @pytest.mark.asyncio
    async def test_search_memory(self, memory):
        """测试搜索记忆"""
        await memory.add("用户喜欢新能源板块", user_id="test_user")
        await memory.add("用户关注宁德时代", user_id="test_user")
        
        results = await memory.search(
            query="新能源",
            user_id="test_user",
            limit=5
        )
        assert len(results) > 0
    
    @pytest.mark.asyncio
    async def test_get_all(self, memory):
        """测试获取全部记忆"""
        await memory.add("记忆1", user_id="test_user")
        await memory.add("记忆2", user_id="test_user")
        
        all_memories = await memory.get_all(user_id="test_user")
        assert len(all_memories) >= 2