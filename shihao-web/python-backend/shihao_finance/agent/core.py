import os
from typing import Optional
from datetime import datetime

from shihao_finance.agent.memory.core import CoreMemory
from shihao_finance.agent.memory.recall import RecallMemory
from shihao_finance.agent.memory.archival import ArchivalMemory


class AgentMemory:
    """记忆管理器"""
    
    def __init__(self, archival_db_path: str = None):
        self.core = CoreMemory()
        self.recall = RecallMemory()
        self.archival = ArchivalMemory(db_path=archival_db_path)
        self._initialized = False
    
    async def initialize(self):
        """初始化所有记忆层"""
        await self.recall.initialize()
        await self.archival.initialize()
        self._initialized = True
    
    async def cleanup(self):
        """清理资源"""
        await self.recall.cleanup()
        await self.archival.cleanup()
        self._initialized = False


class ShiHaoAgent:
    """
    拾号金融AI Agent
    
    核心Agent类，集成三层记忆系统，支持金融分析和决策。
    """
    
    def __init__(self, config: dict = None):
        self.config = config or {}
        self.memory = AgentMemory(
            archival_db_path=self.config.get("archival_db_path")
        )
        self._initialized = False
        
        self.llm_provider = self.config.get("llm_provider", "ollama")
        self.llm_model = self.config.get("llm_model", os.getenv("OLLAMA_MODEL", "llama3"))
    
    async def initialize(self):
        """初始化Agent"""
        await self.memory.initialize()
        self._initialized = True
        print(f"[ShiHaoAgent] Initialized with {self.llm_provider}/{self.llm_model}")
    
    async def cleanup(self):
        """清理资源"""
        await self.memory.cleanup()
        self._initialized = False
    
    def get_context(self) -> str:
        """获取当前上下文 (Core Memory编译)"""
        return self.memory.core.compile()
    
    async def update_core_memory(self, label: str, value: str):
        """更新核心记忆"""
        self.memory.core.update_block(label, value)
    
    async def recall_search(self, query: str, user_id: str, 
                            limit: int = 10) -> list[dict]:
        """搜索会话记忆"""
        return await self.memory.recall.search(query, user_id, limit)
    
    async def add_recall_memory(self, text: str, user_id: str,
                                categories: list[str] = None):
        """添加会话记忆"""
        return await self.memory.recall.add(text, user_id, categories=categories)
    
    async def archive_document(self, title: str, content: str,
                               doc_type: str = "general",
                               tags: list[str] = None):
        """归档文档"""
        return await self.memory.archival.add(title, content, doc_type, tags)
    
    async def search_archive(self, query: str, limit: int = 10) -> list[dict]:
        """搜索归档"""
        return await self.memory.archival.search(query, limit)
    
    def _ensure_initialized(self):
        if not self._initialized:
            raise RuntimeError("ShiHaoAgent not initialized. Call initialize() first.")