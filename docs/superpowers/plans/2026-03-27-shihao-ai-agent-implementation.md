# 拾号-金融 AI Agent 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将拾号-金融升级为具备自主记忆、自动学习、多Agent协作、主动调度、全渠道接入的AI金融系统

**Architecture:** 渐进式混合方案，集成Letta记忆架构、CrewAI多Agent框架、Mem0向量存储、APScheduler调度引擎

**Tech Stack:** Python 3.11+, FastAPI, CrewAI, Mem0, ChromaDB, APScheduler, python-telegram-bot

---

## 📁 文件结构映射

```
shihao-web/python-backend/
├── shihao_finance/
│   ├── agent/                          # 新增: AI Agent核心
│   │   ├── __init__.py
│   │   ├── core.py                     # ShiHaoAgent主类
│   │   ├── agents.py                   # CrewAI Agent定义
│   │   ├── crew.py                     # Crew编排配置
│   │   ├── learning.py                 # 自动学习系统
│   │   ├── scheduler.py                # 主动调度引擎
│   │   ├── patterns.py                 # 模式提取
│   │   ├── triggers.py                 # 事件触发器
│   │   ├── recovery.py                 # 错误恢复
│   │   ├── memory/                     # 记忆系统
│   │   │   ├── __init__.py
│   │   │   ├── core.py                 # CoreMemory
│   │   │   ├── recall.py               # RecallMemory
│   │   │   └── archival.py             # ArchivalMemory
│   │   ├── channels/                   # 渠道适配器
│   │   │   ├── __init__.py
│   │   │   ├── base.py                 # BaseChannel
│   │   │   ├── telegram.py             # Telegram
│   │   │   ├── discord.py              # Discord
│   │   │   ├── wechat.py               # 微信
│   │   │   ├── email.py                # Email
│   │   │   └── hub.py                  # NotificationHub
│   │   └── tools/                      # Agent工具
│   │       ├── __init__.py
│   │       └── memory_tools.py         # 记忆操作工具
│   └── api/
│       └── agent_api.py                # 新增: Agent API端点
├── tests/
│   └── agent/                          # 新增: Agent测试
│       ├── __init__.py
│       ├── test_core.py
│       ├── test_memory.py
│       ├── test_agents.py
│       ├── test_learning.py
│       ├── test_scheduler.py
│       └── test_channels.py
├── checkpoints/                        # 新增: 状态检查点目录
└── requirements.txt                    # 修改: 添加新依赖
```

---

## 📅 Phase 1: 自主记忆系统 (周1-2)

### Task 1: 项目结构搭建

**Files:**
- Create: `shihao_finance/agent/__init__.py`
- Create: `shihao_finance/agent/memory/__init__.py`
- Create: `shihao_finance/agent/channels/__init__.py`
- Create: `shihao_finance/agent/tools/__init__.py`

- [ ] **Step 1: 创建Agent包目录结构**

```bash
mkdir -p shihao-web/python-backend/shihao_finance/agent/memory
mkdir -p shihao-web/python-backend/shihao_finance/agent/channels
mkdir -p shihao-web/python-backend/shihao_finance/agent/tools
```

- [ ] **Step 2: 创建__init__.py文件**

```bash
touch shihao-web/python-backend/shihao_finance/agent/__init__.py
touch shihao-web/python-backend/shihao_finance/agent/memory/__init__.py
touch shihao-web/python-backend/shihao_finance/agent/channels/__init__.py
touch shihao-web/python-backend/shihao_finance/agent/tools/__init__.py
```

- [ ] **Step 3: 创建测试目录**

```bash
mkdir -p shihao-web/python-backend/tests/agent
touch shihao-web/python-backend/tests/agent/__init__.py
```

- [ ] **Step 4: 提交**

```bash
git add shihao_finance/agent/ tests/agent/
git commit -m "feat: create agent package structure"
```

---

### Task 2: CoreMemory 实现

**Files:**
- Create: `shihao_finance/agent/memory/core.py`
- Create: `tests/agent/test_memory.py`

- [ ] **Step 1: 编写测试**

```python
# tests/agent/test_memory/test_core.py

import pytest
from shihao_finance.agent.memory.core import CoreMemory, MemoryBlock

class TestCoreMemory:
    def test_default_initialization(self):
        """测试默认初始化"""
        memory = CoreMemory()
        assert memory.persona is not None
        assert memory.risk_profile is not None
        assert memory.user_preferences is not None
    
    def test_update_block(self):
        """测试更新记忆块"""
        memory = CoreMemory()
        memory.update_block("persona", "新的人格定义")
        assert memory.get_block("persona") == "新的人格定义"
    
    def test_max_tokens_limit(self):
        """测试Token限制"""
        memory = CoreMemory()
        long_text = "x" * 10000
        with pytest.raises(ValueError):
            memory.update_block("persona", long_text)
    
    def test_export_import(self):
        """测试导出导入"""
        memory = CoreMemory()
        memory.update_block("user_preferences", "偏好科技股")
        
        exported = memory.export()
        new_memory = CoreMemory.from_dict(exported)
        
        assert new_memory.get_block("user_preferences") == "偏好科技股"
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd shihao-web/python-backend
pytest tests/agent/test_memory/test_core.py -v
# 预期: FAILED - ModuleNotFoundError
```

- [ ] **Step 3: 实现CoreMemory**

```python
# shihao_finance/agent/memory/core.py

from dataclasses import dataclass, field
from typing import Optional
import hashlib

@dataclass
class MemoryBlock:
    """记忆块"""
    label: str
    value: str
    max_tokens: int = 2000
    description: str = ""
    
    def validate(self):
        """验证Token限制 (简化: 按字符数估算)"""
        if len(self.value) > self.max_tokens * 4:  # 粗略估算
            raise ValueError(f"Block {self.label} exceeds max tokens")
    
    def to_dict(self) -> dict:
        return {
            "label": self.label,
            "value": self.value,
            "max_tokens": self.max_tokens,
            "description": self.description
        }

class CoreMemory:
    """
    核心记忆 - 常驻Agent上下文
    
    类似于操作系统的RAM，始终可见，存储高优先级信息。
    """
    
    DEFAULT_PERSONA = """
    你是拾号金融AI，一个专业的量化交易助手。
    你擅长：
    - A股和美股市场分析
    - 基本面和技术面研究
    - 风险评估和仓位管理
    - 量化策略开发和回测
    
    你的性格：
    - 理性、客观、数据驱动
    - 风险意识强，不盲目追涨
    - 持续学习，从错误中改进
    """
    
    DEFAULT_RISK_PROFILE = """
    风险等级：中等
    最大单仓位：20%
    最大回撤容忍：15%
    止损规则：单股-10%，整体-8%
    禁止操作：杠杆、期权、ST股
    """
    
    DEFAULT_USER_PREFERENCES = """
    偏好行业：科技、新能源、消费
    关注股票：600519, 300750, 000858
    交易时间偏好：避开开盘前30分钟
    通知偏好：重要事件即时通知
    """
    
    def __init__(self):
        self.blocks: dict[str, MemoryBlock] = {
            "persona": MemoryBlock(
                label="persona",
                value=self.DEFAULT_PERSONA.strip(),
                max_tokens=2000,
                description="Agent人格定义"
            ),
            "risk_profile": MemoryBlock(
                label="risk_profile",
                value=self.DEFAULT_RISK_PROFILE.strip(),
                max_tokens=1000,
                description="风险偏好配置"
            ),
            "user_preferences": MemoryBlock(
                label="user_preferences",
                value=self.DEFAULT_USER_PREFERENCES.strip(),
                max_tokens=1000,
                description="用户偏好"
            )
        }
    
    def get_block(self, label: str) -> Optional[str]:
        """获取记忆块内容"""
        block = self.blocks.get(label)
        return block.value if block else None
    
    def update_block(self, label: str, value: str, description: str = None):
        """更新记忆块"""
        if label not in self.blocks:
            self.blocks[label] = MemoryBlock(
                label=label,
                value=value,
                description=description or ""
            )
        else:
            self.blocks[label].value = value
            if description:
                self.blocks[label].description = description
        
        self.blocks[label].validate()
    
    def list_blocks(self) -> list[str]:
        """列出所有记忆块标签"""
        return list(self.blocks.keys())
    
    def compile(self) -> str:
        """编译所有记忆块为上下文字符串"""
        parts = []
        for label, block in self.blocks.items():
            parts.append(f"[{label.upper()}]\n{block.value}")
        return "\n\n".join(parts)
    
    def export(self) -> dict:
        """导出为字典"""
        return {label: block.to_dict() for label, block in self.blocks.items()}
    
    @classmethod
    def from_dict(cls, data: dict) -> "CoreMemory":
        """从字典创建"""
        memory = cls()
        for label, block_data in data.items():
            memory.blocks[label] = MemoryBlock(**block_data)
        return memory
    
    def get_hash(self) -> str:
        """获取内容哈希 (用于变更检测)"""
        content = self.compile()
        return hashlib.md5(content.encode()).hexdigest()
```

- [ ] **Step 4: 运行测试**

```bash
pytest tests/agent/test_memory/test_core.py -v
# 预期: ALL PASSED
```

- [ ] **Step 5: 提交**

```bash
git add shihao_finance/agent/memory/core.py tests/agent/test_memory/test_core.py
git commit -m "feat: implement CoreMemory with validation and serialization"
```

---

### Task 3: RecallMemory (Mem0集成)

**Files:**
- Create: `shihao_finance/agent/memory/recall.py`
- Modify: `tests/agent/test_memory/test_recall.py`

- [ ] **Step 1: 安装依赖**

```bash
pip install mem0ai chromadb
```

- [ ] **Step 2: 编写测试**

```python
# tests/agent/test_memory/test_recall.py

import pytest
import asyncio
from shihao_finance.agent.memory.recall import RecallMemory

class TestRecallMemory:
    @pytest.fixture
    async def memory(self):
        mem = RecallMemory(collection_name="test_memories")
        await mem.initialize()
        yield mem
        await mem.cleanup()
    
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
            query="投资偏好",
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
```

- [ ] **Step 3: 实现RecallMemory**

```python
# shihao_finance/agent/memory/recall.py

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
    
    async def initialize(self):
        """初始化记忆存储"""
        if not MEM0_AVAILABLE:
            raise ImportError("mem0ai not installed. Run: pip install mem0ai")
        
        # 配置Mem0使用本地ChromaDB
        config = {
            "vector_store": {
                "provider": "chroma",
                "config": {
                    "collection_name": self.collection_name,
                    "path": "./data/chroma_db"
                }
            },
            "llm": {
                "provider": "ollama",
                "config": {
                    "model": os.getenv("OLLAMA_MODEL", "llama3"),
                    "ollama_base_url": os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
                }
            }
        }
        
        self.memory = Memory(config)
        self._initialized = True
    
    async def add(self, text: str, user_id: str, 
                  agent_id: str = "shihao_agent",
                  categories: list[str] = None,
                  metadata: dict = None) -> dict:
        """添加记忆"""
        self._ensure_initialized()
        
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
    
    async def search(self, query: str, user_id: str,
                     limit: int = 10,
                     categories: list[str] = None) -> list[dict]:
        """搜索记忆"""
        self._ensure_initialized()
        
        filters = {"user_id": user_id}
        if categories:
            filters["categories"] = {"in": categories}
        
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
    
    async def get_all(self, user_id: str, limit: int = 100) -> list[dict]:
        """获取所有记忆"""
        self._ensure_initialized()
        
        results = self.memory.get_all(user_id=user_id, limit=limit)
        
        return [
            {
                "text": r.get("memory", ""),
                "created_at": r.get("created_at"),
                "metadata": r.get("metadata", {})
            }
            for r in results
        ]
    
    async def delete(self, memory_id: str) -> bool:
        """删除记忆"""
        self._ensure_initialized()
        
        try:
            self.memory.delete(memory_id)
            return True
        except Exception:
            return False
    
    async def cleanup(self):
        """清理资源"""
        self._initialized = False
    
    def _ensure_initialized(self):
        if not self._initialized:
            raise RuntimeError("RecallMemory not initialized. Call initialize() first.")
```

- [ ] **Step 4: 运行测试**

```bash
pytest tests/agent/test_memory/test_recall.py -v
```

- [ ] **Step 5: 提交**

```bash
git add shihao_finance/agent/memory/recall.py tests/agent/test_memory/test_recall.py
git commit -m "feat: implement RecallMemory with Mem0 integration"
```

---

### Task 4: ArchivalMemory (SQLite存储)

**Files:**
- Create: `shihao_finance/agent/memory/archival.py`
- Create: `tests/agent/test_memory/test_archival.py`

- [ ] **Step 1: 编写测试**

```python
# tests/agent/test_memory/test_archival.py

import pytest
import asyncio
from shihao_finance.agent.memory.archival import ArchivalMemory

class TestArchivalMemory:
    @pytest.fixture
    async def memory(self):
        mem = ArchivalMemory(db_path=":memory:")
        await mem.initialize()
        yield mem
        await mem.cleanup()
    
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
```

- [ ] **Step 2: 实现ArchivalMemory**

```python
# shihao_finance/agent/memory/archival.py

import sqlite3
import json
from datetime import datetime
from typing import Optional
from pathlib import Path

class ArchivalMemory:
    """
    档案记忆 - 冷存储
    
    类似于操作系统磁盘，存储大量历史数据。
    使用SQLite实现，支持全文搜索。
    """
    
    def __init__(self, db_path: str = "./data/archival_memory.db"):
        self.db_path = db_path
        self.conn = None
    
    async def initialize(self):
        """初始化数据库"""
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        
        # 创建表
        self.conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                doc_type TEXT,
                tags TEXT,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # 创建FTS5虚拟表用于全文搜索
        self.conn.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts 
            USING fts5(title, content, tags, content=documents, content_rowid=rowid)
        """)
        
        self.conn.commit()
    
    async def add(self, title: str, content: str, 
                  doc_type: str = "general",
                  tags: list[str] = None,
                  metadata: dict = None) -> str:
        """添加文档"""
        import uuid
        doc_id = str(uuid.uuid4())
        
        self.conn.execute(
            """INSERT INTO documents (id, title, content, doc_type, tags, metadata)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (doc_id, title, content, doc_type, 
             json.dumps(tags or []), json.dumps(metadata or {}))
        )
        self.conn.commit()
        
        return doc_id
    
    async def search(self, query: str, limit: int = 10,
                     doc_type: str = None) -> list[dict]:
        """全文搜索"""
        sql = """
            SELECT d.* FROM documents d
            JOIN documents_fts fts ON d.rowid = fts.rowid
            WHERE documents_fts MATCH ?
        """
        params = [query]
        
        if doc_type:
            sql += " AND d.doc_type = ?"
            params.append(doc_type)
        
        sql += " ORDER BY rank LIMIT ?"
        params.append(limit)
        
        cursor = self.conn.execute(sql, params)
        rows = cursor.fetchall()
        
        return [self._row_to_dict(row) for row in rows]
    
    async def get_by_id(self, doc_id: str) -> Optional[dict]:
        """按ID获取文档"""
        cursor = self.conn.execute(
            "SELECT * FROM documents WHERE id = ?", (doc_id,)
        )
        row = cursor.fetchone()
        
        return self._row_to_dict(row) if row else None
    
    async def update(self, doc_id: str, **kwargs) -> bool:
        """更新文档"""
        updates = []
        params = []
        
        for key, value in kwargs.items():
            if key in ["title", "content", "doc_type"]:
                updates.append(f"{key} = ?")
                params.append(value)
            elif key == "tags":
                updates.append("tags = ?")
                params.append(json.dumps(value))
        
        if not updates:
            return False
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        params.append(doc_id)
        
        sql = f"UPDATE documents SET {', '.join(updates)} WHERE id = ?"
        self.conn.execute(sql, params)
        self.conn.commit()
        
        return True
    
    async def delete(self, doc_id: str) -> bool:
        """删除文档"""
        self.conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        self.conn.commit()
        return True
    
    async def list_by_type(self, doc_type: str, limit: int = 100) -> list[dict]:
        """按类型列出文档"""
        cursor = self.conn.execute(
            "SELECT * FROM documents WHERE doc_type = ? ORDER BY created_at DESC LIMIT ?",
            (doc_type, limit)
        )
        return [self._row_to_dict(row) for row in cursor.fetchall()]
    
    async def cleanup(self):
        """关闭连接"""
        if self.conn:
            self.conn.close()
    
    def _row_to_dict(self, row) -> dict:
        """将行转换为字典"""
        return {
            "id": row["id"],
            "title": row["title"],
            "content": row["content"],
            "doc_type": row["doc_type"],
            "tags": json.loads(row["tags"]) if row["tags"] else [],
            "metadata": json.loads(row["metadata"]) if row["metadata"] else {},
            "created_at": row["created_at"],
            "updated_at": row["updated_at"]
        }
```

- [ ] **Step 3: 运行测试**

```bash
pytest tests/agent/test_memory/test_archival.py -v
```

- [ ] **Step 4: 提交**

```bash
git add shihao_finance/agent/memory/archival.py tests/agent/test_memory/test_archival.py
git commit -m "feat: implement ArchivalMemory with SQLite FTS"
```

---

### Task 5: ShiHaoAgent 主类

**Files:**
- Create: `shihao_finance/agent/core.py`
- Create: `tests/agent/test_core.py`

- [ ] **Step 1: 编写测试**

```python
# tests/agent/test_core.py

import pytest
import asyncio
from shihao_finance.agent.core import ShiHaoAgent

class TestShiHaoAgent:
    @pytest.fixture
    async def agent(self):
        agent = ShiHaoAgent()
        await agent.initialize()
        yield agent
        await agent.cleanup()
    
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
```

- [ ] **Step 2: 实现ShiHaoAgent**

```python
# shihao_finance/agent/core.py

import os
from typing import Optional
from datetime import datetime

from shihao_finance.agent.memory.core import CoreMemory
from shihao_finance.agent.memory.recall import RecallMemory
from shihao_finance.agent.memory.archival import ArchivalMemory

class AgentMemory:
    """记忆管理器"""
    
    def __init__(self):
        self.core = CoreMemory()
        self.recall = RecallMemory()
        self.archival = ArchivalMemory()
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
        self.memory = AgentMemory()
        self._initialized = False
        
        # LLM配置
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
```

- [ ] **Step 3: 运行测试**

```bash
pytest tests/agent/test_core.py -v
```

- [ ] **Step 4: 提交**

```bash
git add shihao_finance/agent/core.py tests/agent/test_core.py
git commit -m "feat: implement ShiHaoAgent with integrated memory system"
```

---

### Task 6: 更新依赖

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: 添加依赖**

```txt
# requirements.txt 追加

# AI Agent
crewai>=1.12.0
mem0ai>=0.1.0
chromadb>=0.4.0

# Scheduler
apscheduler>=3.10.0

# Channels
python-telegram-bot>=20.0
discord.py>=2.0.0
aiosmtplib>=2.0.0
```

- [ ] **Step 2: 安装依赖**

```bash
pip install -r requirements.txt
```

- [ ] **Step 3: 提交**

```bash
git add requirements.txt
git commit -m "chore: add AI agent dependencies"
```

---

## 📅 Phase 2: 多Agent + 学习 (周3-4)

### Task 7: CrewAI Agent定义

**Files:**
- Create: `shihao_finance/agent/agents.py`
- Create: `tests/agent/test_agents.py`

- [ ] **Step 1: 编写测试**

```python
# tests/agent/test_agents.py

import pytest
from shihao_finance.agent.agents import (
    create_market_analyst,
    create_risk_manager,
    create_trade_executor
)

class TestAgents:
    def test_market_analyst_creation(self):
        """测试市场分析师创建"""
        agent = create_market_analyst()
        assert agent.role == "资深市场分析师"
        assert len(agent.tools) > 0
    
    def test_risk_manager_creation(self):
        """测试风险经理创建"""
        agent = create_risk_manager()
        assert agent.role == "风险经理"
        assert agent.allow_delegation == False
    
    def test_trade_executor_creation(self):
        """测试交易执行员创建"""
        agent = create_trade_executor()
        assert agent.role == "交易执行员"
```

- [ ] **Step 2: 实现Agent定义**

```python
# shihao_finance/agent/agents.py

from crewai import Agent
from shihao_finance.agent.tools import (
    ashare_data_tool,
    highfreq_data_tool,
    knowledge_search_tool,
    policy_monitor_tool,
    risk_metrics_tool,
    portfolio_analysis_tool,
    backtest_api_tool,
    trading_api_tool,
    realtime_quote_tool,
)

def create_market_analyst() -> Agent:
    """创建市场分析师Agent"""
    return Agent(
        role="资深市场分析师",
        goal="深入分析市场趋势，提供数据驱动的投资建议",
        backstory="""
        你是一位拥有15年经验的资深市场分析师，曾在华尔街顶级投行工作。
        你擅长基本面分析、技术面分析和行业研究。
        你的分析报告以严谨、客观著称，从不盲目乐观或悲观。
        """,
        tools=[
            ashare_data_tool,
            highfreq_data_tool,
            knowledge_search_tool,
            policy_monitor_tool,
        ],
        verbose=True,
        allow_delegation=True,
    )

def create_risk_manager() -> Agent:
    """创建风险经理Agent"""
    return Agent(
        role="风险经理",
        goal="评估和控制投资风险，确保组合安全",
        backstory="""
        你是量化风险管理专家，精通VaR模型、压力测试和情景分析。
        你从不忽视任何风险信号，总是保守地评估最坏情况。
        你坚信：保住本金是第一要务。
        """,
        tools=[
            risk_metrics_tool,
            portfolio_analysis_tool,
            backtest_api_tool,
        ],
        verbose=True,
        allow_delegation=False,
    )

def create_trade_executor() -> Agent:
    """创建交易执行员Agent"""
    return Agent(
        role="交易执行员",
        goal="最优执行交易，最小化冲击成本",
        backstory="""
        你是高频交易背景的执行专家，精通各种执行算法。
        你知道如何在不影响市场价格的情况下完成大单。
        你总是关注流动性和市场微观结构。
        """,
        tools=[
            trading_api_tool,
            realtime_quote_tool,
        ],
        verbose=True,
        allow_delegation=False,
    )

def create_portfolio_manager() -> Agent:
    """创建投资组合经理Agent (Manager)"""
    return Agent(
        role="投资组合经理",
        goal="协调团队决策，优化整体组合收益",
        backstory="""
        你是投资组合经理，负责协调分析师、风险经理和交易员的工作。
        你有全局视野，能够平衡收益与风险。
        你总是从组合整体出发做决策。
        """,
        verbose=True,
        allow_delegation=True,
    )
```

- [ ] **Step 3: 运行测试**

```bash
pytest tests/agent/test_agents.py -v
```

- [ ] **Step 4: 提交**

```bash
git add shihao_finance/agent/agents.py tests/agent/test_agents.py
git commit -m "feat: define CrewAI trading agents"
```

---

### Task 8: Crew编排

**Files:**
- Create: `shihao_finance/agent/crew.py`
- Create: `tests/agent/test_crew.py`

- [ ] **Step 1: 编写测试**

```python
# tests/agent/test_crew.py

import pytest
from shihao_finance.agent.crew import create_trading_crew

class TestCrew:
    def test_crew_creation(self):
        """测试Crew创建"""
        crew = create_trading_crew()
        assert len(crew.agents) == 4
        assert crew.process.value == "hierarchical"
```

- [ ] **Step 2: 实现Crew编排**

```python
# shihao_finance/agent/crew.py

from crewai import Crew, Process
from shihao_finance.agent.agents import (
    create_market_analyst,
    create_risk_manager,
    create_trade_executor,
    create_portfolio_manager,
)

def create_trading_crew() -> Crew:
    """创建交易分析Crew"""
    
    # 创建Agent
    market_analyst = create_market_analyst()
    risk_manager = create_risk_manager()
    trade_executor = create_trade_executor()
    portfolio_manager = create_portfolio_manager()
    
    # 创建Crew
    crew = Crew(
        agents=[
            market_analyst,
            risk_manager,
            trade_executor,
            portfolio_manager,
        ],
        process=Process.hierarchical,
        manager_agent=portfolio_manager,
        verbose=True,
    )
    
    return crew

def create_research_crew() -> Crew:
    """创建研究分析Crew (简化版)"""
    from crewai import Crew, Process
    
    market_analyst = create_market_analyst()
    
    crew = Crew(
        agents=[market_analyst],
        process=Process.sequential,
        verbose=True,
    )
    
    return crew
```

- [ ] **Step 3: 运行测试**

```bash
pytest tests/agent/test_crew.py -v
```

- [ ] **Step 4: 提交**

```bash
git add shihao_finance/agent/crew.py tests/agent/test_crew.py
git commit -m "feat: implement hierarchical trading crew"
```

---

### Task 9: 自动学习系统

**Files:**
- Create: `shihao_finance/agent/learning.py`
- Create: `shihao_finance/agent/patterns.py`
- Create: `tests/agent/test_learning.py`

- [ ] **Step 1: 编写测试**

```python
# tests/agent/test_learning.py

import pytest
from shihao_finance.agent.learning import SelfImprovingAgent, TradeOutcome, OutcomeType
from shihao_finance.agent.patterns import PatternExtractor

class TestLearning:
    def test_trade_outcome_creation(self):
        """测试交易结果创建"""
        outcome = TradeOutcome(
            ticker="600519",
            action="buy",
            entry_price=1800.0,
            exit_price=1900.0,
            pnl_pct=0.056,
            outcome_type=OutcomeType.SUCCESS
        )
        assert outcome.ticker == "600519"
        assert outcome.outcome_type == OutcomeType.SUCCESS
    
    def test_pattern_extraction(self):
        """测试模式提取"""
        extractor = PatternExtractor()
        
        outcomes = [
            TradeOutcome("600519", "buy", 1800, 1900, 0.056, OutcomeType.SUCCESS),
            TradeOutcome("300750", "buy", 180, 200, 0.11, OutcomeType.SUCCESS),
            TradeOutcome("000858", "buy", 145, 135, -0.069, OutcomeType.FAILURE),
        ]
        
        patterns = extractor.extract(outcomes)
        assert patterns.success_factors is not None
        assert patterns.failure_factors is not None
```

- [ ] **Step 2: 实现学习系统**

```python
# shihao_finance/agent/learning.py

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional

class OutcomeType(Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    NEUTRAL = "neutral"

@dataclass
class TradeOutcome:
    """交易结果记录"""
    ticker: str
    action: str
    entry_price: float
    exit_price: float
    pnl_pct: float
    outcome_type: OutcomeType
    entry_time: Optional[datetime] = None
    exit_time: Optional[datetime] = None
    reasoning: str = ""
    agent_analyses: dict = None

class SelfImprovingAgent:
    """具备自我学习能力的Agent"""
    
    def __init__(self, memory, crew, learning_threshold: float = 0.85):
        self.memory = memory
        self.crew = crew
        self.learning_threshold = learning_threshold
        self.trade_history: list[TradeOutcome] = []
    
    async def analyze(self, tickers: list[str]) -> dict:
        """执行分析"""
        # 使用Crew进行多Agent分析
        result = await self.crew.kickoff({
            "tickers": tickers,
            "context": self.memory.get_context()
        })
        
        # 记录到记忆
        await self.memory.add_recall_memory(
            text=f"分析{tickers}: {result}",
            user_id="system",
            categories=["analysis"]
        )
        
        return result
    
    async def record_outcome(self, outcome: TradeOutcome):
        """记录交易结果"""
        self.trade_history.append(outcome)
        
        # 更新记忆
        await self.memory.add_recall_memory(
            text=f"交易{outcome.ticker}: {'盈利' if outcome.pnl_pct > 0 else '亏损'}{abs(outcome.pnl_pct):.1%}",
            user_id="system",
            categories=["trade_outcome"]
        )
    
    def get_success_rate(self) -> float:
        """计算成功率"""
        if not self.trade_history:
            return 0.0
        
        successes = sum(1 for t in self.trade_history if t.outcome_type == OutcomeType.SUCCESS)
        return successes / len(self.trade_history)
    
    def get_patterns(self) -> dict:
        """获取学习到的模式"""
        from shihao_finance.agent.patterns import PatternExtractor
        extractor = PatternExtractor()
        return extractor.extract(self.trade_history)
```

- [ ] **Step 3: 实现模式提取**

```python
# shihao_finance/agent/patterns.py

from dataclasses import dataclass
from typing import Optional

@dataclass
class Pattern:
    """学习模式"""
    success_factors: list[str]
    failure_factors: list[str]
    confidence: float
    recommendations: list[str]

class PatternExtractor:
    """模式提取器"""
    
    def extract(self, outcomes: list) -> Pattern:
        """从交易结果中提取模式"""
        
        successes = [o for o in outcomes if o.outcome_type.value == "success"]
        failures = [o for o in outcomes if o.outcome_type.value == "failure"]
        
        # 简化的模式提取逻辑
        success_factors = self._extract_success_factors(successes)
        failure_factors = self._extract_failure_factors(failures)
        
        confidence = len(successes) / max(len(outcomes), 1)
        
        return Pattern(
            success_factors=success_factors,
            failure_factors=failure_factors,
            confidence=confidence,
            recommendations=self._generate_recommendations(success_factors, failure_factors)
        )
    
    def _extract_success_factors(self, successes: list) -> list[str]:
        """提取成功因素"""
        factors = []
        
        # 分析成功的共同特征
        avg_pnl = sum(o.pnl_pct for o in successes) / len(successes) if successes else 0
        factors.append(f"平均盈利: {avg_pnl:.1%}")
        
        return factors
    
    def _extract_failure_factors(self, failures: list) -> list[str]:
        """提取失败因素"""
        factors = []
        
        if failures:
            avg_loss = sum(o.pnl_pct for o in failures) / len(failures)
            factors.append(f"平均亏损: {avg_loss:.1%}")
        
        return factors
    
    def _generate_recommendations(self, success_factors: list, failure_factors: list) -> list[str]:
        """生成建议"""
        recommendations = []
        
        if failure_factors:
            recommendations.append("注意控制亏损幅度")
        
        return recommendations
```

- [ ] **Step 4: 运行测试**

```bash
pytest tests/agent/test_learning.py -v
```

- [ ] **Step 5: 提交**

```bash
git add shihao_finance/agent/learning.py shihao_finance/agent/patterns.py tests/agent/test_learning.py
git commit -m "feat: implement self-improving learning system"
```

---

## 📅 Phase 3: 调度 + 渠道 (周5-6)

### Task 10: 调度引擎

**Files:**
- Create: `shihao_finance/agent/scheduler.py`
- Create: `tests/agent/test_scheduler.py`

- [ ] **Step 1: 编写测试**

```python
# tests/agent/test_scheduler.py

import pytest
from shihao_finance.agent.scheduler import ShiHaoScheduler

class TestScheduler:
    def test_scheduler_creation(self):
        """测试调度器创建"""
        scheduler = ShiHaoScheduler()
        assert scheduler is not None
    
    def test_job_registration(self):
        """测试任务注册"""
        scheduler = ShiHaoScheduler()
        
        async def dummy_job():
            pass
        
        scheduler.add_job(
            func=dummy_job,
            trigger="interval",
            minutes=5,
            job_id="test_job"
        )
        
        jobs = scheduler.get_jobs()
        assert "test_job" in [j["id"] for j in jobs]
```

- [ ] **Step 2: 实现调度引擎**

```python
# shihao_finance/agent/scheduler.py

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from typing import Callable

class ShiHaoScheduler:
    """拾号金融主动调度引擎"""
    
    def __init__(self):
        self.scheduler = AsyncIOScheduler()
        self._started = False
    
    def start(self):
        """启动调度器"""
        if not self._started:
            self.scheduler.start()
            self._started = True
    
    def shutdown(self):
        """关闭调度器"""
        if self._started:
            self.scheduler.shutdown()
            self._started = False
    
    def add_job(self, func: Callable, trigger: str, **kwargs):
        """添加任务"""
        self.scheduler.add_job(func, trigger, **kwargs)
    
    def get_jobs(self) -> list[dict]:
        """获取任务列表"""
        return [
            {"id": job.id, "name": job.name, "next_run": str(job.next_run_time)}
            for job in self.scheduler.get_jobs()
        ]
    
    def setup_default_jobs(self, agent):
        """设置默认任务"""
        
        # 每日开盘前分析 (09:25)
        self.scheduler.add_job(
            self._create_morning_analysis(agent),
            CronTrigger(hour=9, minute=25, day_of_week='mon-fri'),
            id='morning_analysis',
            name='开盘前市场分析'
        )
        
        # 盘中实时监控 (每5分钟)
        self.scheduler.add_job(
            self._create_intraday_monitor(agent),
            IntervalTrigger(minutes=5),
            id='intraday_monitor',
            name='盘中实时监控'
        )
        
        # 每日复盘报告 (15:30)
        self.scheduler.add_job(
            self._create_daily_review(agent),
            CronTrigger(hour=15, minute=30, day_of_week='mon-fri'),
            id='daily_review',
            name='每日收盘复盘'
        )
    
    def _create_morning_analysis(self, agent):
        """创建开盘前分析任务"""
        async def morning_analysis():
            print("[Scheduler] 执行开盘前分析...")
            # 实际实现会调用agent.analyze()
        return morning_analysis
    
    def _create_intraday_monitor(self, agent):
        """创建盘中监控任务"""
        async def intraday_monitor():
            print("[Scheduler] 执行盘中监控...")
            # 实际实现会检查价格预警
        return intraday_monitor
    
    def _create_daily_review(self, agent):
        """创建收盘复盘任务"""
        async def daily_review():
            print("[Scheduler] 执行收盘复盘...")
            # 实际实现会生成复盘报告
        return daily_review
```

- [ ] **Step 3: 运行测试**

```bash
pytest tests/agent/test_scheduler.py -v
```

- [ ] **Step 4: 提交**

```bash
git add shihao_finance/agent/scheduler.py tests/agent/test_scheduler.py
git commit -m "feat: implement scheduler engine with APScheduler"
```

---

### Task 11: 渠道适配器

**Files:**
- Create: `shihao_finance/agent/channels/base.py`
- Create: `shihao_finance/agent/channels/telegram.py`
- Create: `shihao_finance/agent/channels/hub.py`
- Create: `tests/agent/test_channels.py`

- [ ] **Step 1: 编写测试**

```python
# tests/agent/test_channels.py

import pytest
from shihao_finance.agent.channels.base import BaseChannel
from shihao_finance.agent.channels.hub import NotificationHub

class MockChannel(BaseChannel):
    """测试用Mock渠道"""
    
    def __init__(self):
        self.sent_messages = []
    
    async def send(self, message: str, priority: str = "normal") -> bool:
        self.sent_messages.append({"message": message, "priority": priority})
        return True
    
    async def receive(self):
        return None

class TestChannels:
    def test_notification_hub(self):
        """测试通知中心"""
        hub = NotificationHub()
        mock = MockChannel()
        
        hub.register("mock", mock)
        assert "mock" in hub.channels
    
    @pytest.mark.asyncio
    async def test_send_notification(self):
        """测试发送通知"""
        hub = NotificationHub()
        mock = MockChannel()
        hub.register("mock", mock)
        
        await hub.send(
            title="测试",
            content="测试内容",
            channels=["mock"]
        )
        
        assert len(mock.sent_messages) == 1
```

- [ ] **Step 2: 实现BaseChannel**

```python
# shihao_finance/agent/channels/base.py

from abc import ABC, abstractmethod
from typing import Optional

class BaseChannel(ABC):
    """渠道基类"""
    
    @abstractmethod
    async def send(self, message: str, priority: str = "normal") -> bool:
        """发送消息"""
        pass
    
    @abstractmethod
    async def receive(self) -> Optional[dict]:
        """接收消息"""
        pass
```

- [ ] **Step 3: 实现Telegram渠道**

```python
# shihao_finance/agent/channels/telegram.py

import os
import httpx
from shihao_finance.agent.channels.base import BaseChannel

class TelegramChannel(BaseChannel):
    """Telegram渠道"""
    
    def __init__(self, token: str = None, chat_id: str = None):
        self.token = token or os.getenv("TELEGRAM_BOT_TOKEN")
        self.chat_id = chat_id or os.getenv("TELEGRAM_CHAT_ID")
        self.api_url = f"https://api.telegram.org/bot{self.token}"
    
    async def send(self, message: str, priority: str = "normal") -> bool:
        """发送消息到Telegram"""
        if not self.token or not self.chat_id:
            print("[Telegram] Token or Chat ID not configured")
            return False
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.api_url}/sendMessage",
                    json={
                        "chat_id": self.chat_id,
                        "text": message,
                        "parse_mode": "Markdown"
                    },
                    timeout=10
                )
                return response.status_code == 200
        except Exception as e:
            print(f"[Telegram] Send failed: {e}")
            return False
    
    async def receive(self):
        """Telegram接收需要webhook/polling，暂不实现"""
        return None
```

- [ ] **Step 4: 实现NotificationHub**

```python
# shihao_finance/agent/channels/hub.py

import asyncio
from typing import Optional
from shihao_finance.agent.channels.base import BaseChannel

class NotificationHub:
    """通知分发中心"""
    
    def __init__(self):
        self.channels: dict[str, BaseChannel] = {}
        self.priority_rules = {
            "critical": ["telegram", "discord", "wechat", "email"],
            "high": ["telegram", "discord"],
            "normal": ["telegram"],
            "low": ["email"]
        }
    
    def register(self, name: str, channel: BaseChannel):
        """注册渠道"""
        self.channels[name] = channel
    
    async def send(self, title: str, content: str,
                   priority: str = "normal",
                   channels: list[str] = None) -> dict:
        """发送通知"""
        
        target_channels = channels or self.priority_rules.get(priority, [])
        
        results = {}
        tasks = []
        
        for channel_name in target_channels:
            if channel_name in self.channels:
                tasks.append(
                    self._send_to_channel(channel_name, f"{title}\n\n{content}", priority)
                )
        
        if tasks:
            outcomes = await asyncio.gather(*tasks, return_exceptions=True)
            for channel_name, outcome in zip(target_channels, outcomes):
                results[channel_name] = not isinstance(outcome, Exception)
        
        return results
    
    async def _send_to_channel(self, channel_name: str, message: str, priority: str):
        """发送到单个渠道"""
        try:
            return await self.channels[channel_name].send(message, priority)
        except Exception as e:
            print(f"[NotificationHub] {channel_name} failed: {e}")
            raise
```

- [ ] **Step 5: 运行测试**

```bash
pytest tests/agent/test_channels.py -v
```

- [ ] **Step 6: 提交**

```bash
git add shihao_finance/agent/channels/ tests/agent/test_channels.py
git commit -m "feat: implement notification channels with hub"
```

---

### Task 12: Agent API端点

**Files:**
- Create: `shihao_finance/api/agent_api.py`
- Modify: `run_simple.py` (添加路由)

- [ ] **Step 1: 实现API端点**

```python
# shihao_finance/api/agent_api.py

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from shihao_finance.agent.core import ShiHaoAgent

router = APIRouter(prefix="/api/agent", tags=["agent"])

# 全局Agent实例 (在run_simple.py中初始化)
agent: Optional[ShiHaoAgent] = None

def init_agent(a: ShiHaoAgent):
    global agent
    agent = a

# ============ 请求模型 ============

class AnalyzeRequest(BaseModel):
    tickers: list[str]
    context: Optional[str] = None

class MemoryUpdateRequest(BaseModel):
    block: str
    value: str

class MemorySearchRequest(BaseModel):
    query: str
    user_id: str = "user"
    limit: int = 10

class NotificationRequest(BaseModel):
    title: str
    content: str
    priority: str = "normal"
    channels: list[str] = ["telegram"]

# ============ API端点 ============

@router.get("/status")
async def get_agent_status():
    """获取Agent状态"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    return {
        "status": "active" if agent._initialized else "inactive",
        "memory_blocks": agent.memory.core.list_blocks(),
        "llm_provider": agent.llm_provider,
        "llm_model": agent.llm_model
    }

@router.get("/memory/core")
async def get_core_memory():
    """获取核心记忆"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    return {
        "blocks": agent.memory.core.export(),
        "hash": agent.memory.core.get_hash()
    }

@router.put("/memory/core")
async def update_core_memory(request: MemoryUpdateRequest):
    """更新核心记忆"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    try:
        await agent.update_core_memory(request.block, request.value)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(400, str(e))

@router.post("/memory/search")
async def search_memory(request: MemorySearchRequest):
    """搜索记忆"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    results = await agent.recall_search(request.query, request.user_id, request.limit)
    return {"results": results, "count": len(results)}

@router.post("/analyze")
async def analyze_tickers(request: AnalyzeRequest):
    """触发AI分析"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    # 这里简化返回，实际会调用Crew
    return {
        "status": "analyzing",
        "tickers": request.tickers,
        "message": "分析任务已启动"
    }

@router.post("/notifications/send")
async def send_notification(request: NotificationRequest):
    """发送通知"""
    # 简化实现
    return {
        "status": "sent",
        "channels": request.channels
    }
```

- [ ] **Step 2: 修改run_simple.py添加路由**

在 `run_simple.py` 中添加:

```python
# 在文件开头添加
from shihao_finance.agent.core import ShiHaoAgent
from shihao_finance.api.agent_api import router as agent_router, init_agent

# 在app初始化后添加
@app.on_event("startup")
async def startup_event():
    # 初始化Agent
    shihao_agent = ShiHaoAgent()
    await shihao_agent.initialize()
    init_agent(shihao_agent)
    
    # 注册Agent路由
    app.include_router(agent_router)

@app.on_event("shutdown")
async def shutdown_event():
    # 清理Agent
    if agent:
        await agent.cleanup()
```

- [ ] **Step 3: 测试API**

```bash
# 启动服务器
python run_simple.py

# 测试端点
curl http://localhost:8000/api/agent/status
curl http://localhost:8000/api/agent/memory/core
```

- [ ] **Step 4: 提交**

```bash
git add shihao_finance/api/agent_api.py run_simple.py
git commit -m "feat: add Agent API endpoints"
```

---

## 📋 完成检查清单

### Phase 1 完成
- [ ] CoreMemory 实现并通过测试
- [ ] RecallMemory (Mem0) 集成并通过测试
- [ ] ArchivalMemory (SQLite) 实现并通过测试
- [ ] ShiHaoAgent 主类完成

### Phase 2 完成
- [ ] CrewAI Agent定义完成
- [ ] Crew编排配置完成
- [ ] 自动学习系统完成
- [ ] 模式提取功能完成

### Phase 3 完成
- [ ] 调度引擎实现
- [ ] 渠道适配器实现
- [ ] Agent API端点完成
- [ ] 端到端测试通过

---

## 🚀 执行选项

**计划完成并保存至** `docs/superpowers/plans/2026-03-27-shihao-ai-agent-implementation.md`

**两种执行方式：**

**1. 子代理驱动 (推荐)** - 每个任务分配独立子代理，任务间审查，快速迭代

**2. 内联执行** - 在当前会话中使用executing-plans技能执行任务，带检查点批处理

请选择执行方式。
