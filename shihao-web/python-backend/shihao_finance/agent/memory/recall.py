import os
from typing import Optional
from datetime import datetime

try:
    from mem0 import Memory
    MEM0_AVAILABLE = True
except ImportError:
    MEM0_AVAILABLE = False


class RecallMemory:
    """
    会话记忆 - 向量检索
    
    类似于操作系统缓存，存储可搜索的近期记忆。
    使用Mem0 + ChromaDB实现语义搜索。
    """
    
    def __init__(self, collection_name: str = "shihao_recall"):
        self.collection_name = collection_name
        self.memory = None
        self._initialized = False
        self._fallback_store = {}
    
    async def initialize(self):
        """初始化记忆存储"""
        if not MEM0_AVAILABLE:
            print("[RecallMemory] mem0ai not installed, using fallback in-memory store")
            self._initialized = True
            return
        
        try:
            from mem0 import MemoryConfig
            
            config = MemoryConfig(
                vector_store={"provider": "chroma", "config": {
                    "collection_name": self.collection_name,
                    "path": "./data/chroma_db"
                }},
                llm={"provider": "ollama", "config": {
                    "model": os.getenv("OLLAMA_MODEL", "llama3"),
                    "ollama_base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
                }}
            )
            
            self.memory = Memory(config)
            self._initialized = True
        except Exception as e:
            print(f"[RecallMemory] Failed to initialize Mem0: {e}, using fallback")
            self._initialized = True
    
    async def add(self, text: str, user_id: str, 
                  agent_id: str = "shihao_agent",
                  categories: list[str] = None,
                  metadata: dict = None) -> dict:
        """添加记忆"""
        self._ensure_initialized()
        
        if MEM0_AVAILABLE and self.memory:
            messages = [{"role": "user", "content": text}]
            
            result = self.memory.add(
                messages=messages,
                user_id=user_id,
                agent_id=agent_id,
                metadata={
                    "categories": categories or [],
                    "timestamp": datetime.now().isoformat(),
                    **(metadata or {})
                }
            )
            
            return {"status": "success", "id": result.get("id")}
        
        memory_id = f"{user_id}_{len(self._fallback_store.get(user_id, []))}"
        if user_id not in self._fallback_store:
            self._fallback_store[user_id] = []
        
        self._fallback_store[user_id].append({
            "id": memory_id,
            "text": text,
            "categories": categories or [],
            "metadata": metadata or {},
            "timestamp": datetime.now().isoformat()
        })
        
        return {"status": "success", "id": memory_id}
    
    async def search(self, query: str, user_id: str,
                     limit: int = 10,
                     categories: list[str] = None) -> list[dict]:
        """搜索记忆"""
        self._ensure_initialized()
        
        if MEM0_AVAILABLE and self.memory:
            results = self.memory.search(
                query=query,
                user_id=user_id,
                limit=limit
            )
            
            return [
                {
                    "text": r.get("memory", ""),
                    "score": r.get("score", 0),
                    "metadata": r.get("metadata", {})
                }
                for r in results
            ]
        
        user_memories = self._fallback_store.get(user_id, [])
        
        if not user_memories:
            return []
        
        query_lower = query.lower()
        filtered = [m for m in user_memories if query_lower in m["text"].lower()]
        
        if categories:
            filtered = [m for m in filtered if any(c in m.get("categories", []) for c in categories)]
        
        return [
            {
                "text": m["text"],
                "score": 1.0,
                "metadata": {"categories": m.get("categories", [])}
            }
            for m in filtered[:limit]
        ]
    
    async def get_all(self, user_id: str, limit: int = 100) -> list[dict]:
        """获取所有记忆"""
        self._ensure_initialized()
        
        if MEM0_AVAILABLE and self.memory:
            results = self.memory.get_all(user_id=user_id, limit=limit)
            
            return [
                {
                    "text": r.get("memory", ""),
                    "created_at": r.get("created_at"),
                    "metadata": r.get("metadata", {})
                }
                for r in results
            ]
        
        user_memories = self._fallback_store.get(user_id, [])[:limit]
        
        return [
            {
                "text": m["text"],
                "created_at": m["timestamp"],
                "metadata": m.get("metadata", {})
            }
            for m in user_memories
        ]
    
    async def delete(self, memory_id: str) -> bool:
        """删除记忆"""
        self._ensure_initialized()
        
        if MEM0_AVAILABLE and self.memory:
            try:
                self.memory.delete(memory_id)
                return True
            except Exception:
                return False
        
        for user_memories in self._fallback_store.values():
            for i, m in enumerate(user_memories):
                if m["id"] == memory_id:
                    user_memories.pop(i)
                    return True
        
        return False
    
    async def cleanup(self):
        """清理资源"""
        self._initialized = False
    
    def _ensure_initialized(self):
        if not self._initialized:
            raise RuntimeError("RecallMemory not initialized. Call initialize() first.")