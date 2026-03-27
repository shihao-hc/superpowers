import pytest
import pytest_asyncio
import asyncio
from shihao_finance.agent.memory.archival import ArchivalMemory


@pytest_asyncio.fixture
async def memory():
    mem = ArchivalMemory(db_path=":memory:")
    await mem.initialize()
    yield mem
    await mem.cleanup()


class TestArchivalMemory:
    @pytest.mark.asyncio
    async def test_add_document(self, memory):
        """测试添加文档"""
        doc_id = await memory.add(
            title="茅台分析报告",
            content="贵州茅台基本面分析...",
            doc_type="research",
            tags=["600519", "消费"]
        )
        assert doc_id is not None
    
    @pytest.mark.asyncio
    async def test_search(self, memory):
        """测试搜索文档"""
        await memory.add("茅台分析", "贵州茅台PE估值...", "research", ["600519"])
        await memory.add("宁德时代分析", "宁德时代技术面...", "research", ["300750"])
        
        results = await memory.search("估值", limit=5)
        assert len(results) > 0
    
    @pytest.mark.asyncio
    async def test_get_by_id(self, memory):
        """测试按ID获取"""
        doc_id = await memory.add("测试文档", "内容", "test")
        doc = await memory.get_by_id(doc_id)
        assert doc["title"] == "测试文档"