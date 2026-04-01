---
name: memdir-memory
description: AI Agent 记忆系统 - 三层记忆(memdir)、项目/用户/会话持久化
category: ai-agent-memory
source: Claude Code memdir memory system analysis
version: 1.0
tags:
  - memory
  - persistence
  - memdir
  - project-knowledge
  - user-preferences
---

# 记忆系统 - 三层 Memdir 架构

> Claude Code 的记忆系统：项目知识、用户偏好、会话历史

## 记忆架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Memory System                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Project Memory (.claude/)              │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  CLAUDE.md          - 项目规则和配置        │   │   │
│  │  │  .claude/memory/    - 项目特定记忆          │   │   │
│  │  │  .claude/settings/  - 项目设置              │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │  优先级: 高 (项目级别)                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              User Memory (~/.claude/)               │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  .claude/CLAUDE.md   - 全局用户偏好        │   │   │
│  │  │  .claude/memory/     - 跨项目记忆          │   │   │
│  │  │  .claude/projects/   - 项目索引            │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │  优先级: 中 (用户级别)                             │   │
│  └─────────────────────────────────────────────────────┘   │
│                          │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Session Memory (Runtime)               │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  messages         - 对话历史                │   │   │
│  │  │  todo_list        - 当前任务                │   │   │
│  │  │  context_summary  - 上下文摘要              │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  │  优先级: 最高 (会话级别)                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心实现

```python
from pathlib import Path
from typing import Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import json
import hashlib
import logging

logger = logging.getLogger(__name__)


class MemoryLevel(Enum):
    """记忆层级"""
    PROJECT = "project"    # 项目记忆
    USER = "user"          # 用户记忆
    SESSION = "session"    # 会话记忆


@dataclass
class MemoryEntry:
    """记忆条目"""
    content: str
    level: MemoryLevel
    tags: list[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    accessed_at: datetime = field(default_factory=datetime.now)
    access_count: int = 0
    importance: float = 0.5  # 0-1
    
    def to_dict(self) -> dict:
        return {
            "content": self.content,
            "level": self.level.value,
            "tags": self.tags,
            "created_at": self.created_at.isoformat(),
            "accessed_at": self.accessed_at.isoformat(),
            "access_count": self.access_count,
            "importance": self.importance,
        }


class MemdirStorage:
    """
    Memdir 存储 - Claude Code 风格的文件系统记忆
    
    目录结构:
    .claude/
    ├── CLAUDE.md          # 主要配置和规则
    ├── memory/
    │   ├── 2026-03-31.md  # 日期索引
    │   ├── topic-auth.md  # 主题索引
    │   └── ...
    └── settings/
        └── preferences.json
    """
    
    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.memory_dir = base_dir / "memory"
        self.settings_dir = base_dir / "settings"
        
        # 确保目录存在
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.settings_dir.mkdir(parents=True, exist_ok=True)
    
    def save(self, key: str, content: str, tags: Optional[list[str]] = None):
        """保存记忆"""
        # 创建记忆文件
        safe_key = self._sanitize_key(key)
        file_path = self.memory_dir / f"{safe_key}.md"
        
        entry = MemoryEntry(
            content=content,
            level=MemoryLevel.SESSION,
            tags=tags or []
        )
        
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(f"# {key}\n\n")
            f.write(f"Created: {entry.created_at.isoformat()}\n")
            f.write(f"Tags: {', '.join(entry.tags)}\n\n")
            f.write(content)
    
    def load(self, key: str) -> Optional[str]:
        """加载记忆"""
        safe_key = self._sanitize_key(key)
        file_path = self.memory_dir / f"{safe_key}.md"
        
        if not file_path.exists():
            return None
        
        try:
            with open(file_path, encoding='utf-8') as f:
                content = f.read()
            
            # 跳过元数据行
            lines = content.split('\n')
            body_lines = []
            in_body = False
            
            for line in lines:
                if line.startswith('Created:') or line.startswith('Tags:'):
                    continue
                if line.startswith('# '):
                    continue
                if line.strip() == '':
                    if not in_body:
                        continue
                in_body = True
                body_lines.append(line)
            
            return '\n'.join(body_lines).strip()
        except Exception as e:
            logger.error(f"Failed to load memory {key}: {e}")
            return None
    
    def search(self, query: str, tags: Optional[list[str]] = None) -> list[tuple[str, str]]:
        """搜索记忆"""
        results = []
        
        for file_path in self.memory_dir.glob("*.md"):
            try:
                with open(file_path, encoding='utf-8') as f:
                    content = f.read()
                
                # 简单的文本匹配
                if query.lower() in content.lower():
                    key = file_path.stem
                    
                    # 检查标签
                    if tags:
                        if not any(tag in content for tag in tags):
                            continue
                    
                    results.append((key, content[:200]))
            except Exception:
                continue
        
        return results
    
    def list_all(self) -> list[str]:
        """列出所有记忆键"""
        return [f.stem for f in self.memory_dir.glob("*.md")]
    
    def _sanitize_key(self, key: str) -> str:
        """清理键名"""
        # 替换不安全字符
        safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in key)
        # 限制长度
        return safe[:100]


class ProjectMemory:
    """项目记忆"""
    
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.claude_dir = project_root / ".claude"
        self.claude_md = project_root / "CLAUDE.md"
        self.storage = MemdirStorage(self.claude_dir)
        
        self.claude_dir.mkdir(parents=True, exist_ok=True)
    
    def get_rules(self) -> str:
        """获取项目规则 (CLAUDE.md)"""
        if self.claude_md.exists():
            return self.claude_md.read_text(encoding='utf-8')
        return ""
    
    def save_rules(self, rules: str):
        """保存项目规则"""
        self.claude_md.write_text(rules, encoding='utf-8')
    
    def add_memory(self, content: str, tags: Optional[list[str]] = None):
        """添加项目记忆"""
        key = hashlib.md5(content[:100].encode()).hexdigest()[:8]
        self.storage.save(f"project-{key}", content, tags)
    
    def get_context(self) -> str:
        """获取项目上下文"""
        parts = []
        
        # CLAUDE.md 规则
        rules = self.get_rules()
        if rules:
            parts.append(f"## Project Rules\n\n{rules}")
        
        # 最近的记忆
        memories = self.storage.list_all()
        if memories:
            recent = memories[-5:]  # 最近 5 条
            for key in recent:
                content = self.storage.load(key)
                if content:
                    parts.append(f"## Memory: {key}\n\n{content[:500]}")
        
        return "\n\n".join(parts)


class UserMemory:
    """用户记忆"""
    
    def __init__(self, home_dir: Optional[Path] = None):
        self.claude_dir = (home_dir or Path.home()) / ".claude"
        self.claude_md = self.claude_dir / "CLAUDE.md"
        self.storage = MemdirStorage(self.claude_dir)
        
        self.claude_dir.mkdir(parents=True, exist_ok=True)
    
    def get_preferences(self) -> str:
        """获取用户偏好"""
        if self.claude_md.exists():
            return self.claude_md.read_text(encoding='utf-8')
        return ""
    
    def save_preferences(self, preferences: str):
        """保存用户偏好"""
        self.claude_md.write_text(preferences, encoding='utf-8')
    
    def add_memory(self, content: str, tags: Optional[list[str]] = None):
        """添加用户记忆"""
        key = hashlib.md5(content[:100].encode()).hexdigest()[:8]
        self.storage.save(f"user-{key}", content, tags)
    
    def get_context(self) -> str:
        """获取用户上下文"""
        prefs = self.get_preferences()
        if prefs:
            return f"## User Preferences\n\n{prefs}"
        return ""


class SessionMemory:
    """会话记忆"""
    
    def __init__(self):
        self.messages: list[dict] = []
        self.todo_list: list[dict] = []
        self.context_summary: str = ""
        self.variables: dict[str, Any] = {}
    
    def add_message(self, role: str, content: str):
        """添加消息"""
        self.messages.append({
            "role": role,
            "content": content,
            "timestamp": datetime.now().isoformat()
        })
    
    def get_messages(self) -> list[dict]:
        """获取消息"""
        return self.messages
    
    def clear(self):
        """清空会话"""
        self.messages = []
        self.todo_list = []
        self.context_summary = ""


class MemorySystem:
    """
    完整的记忆系统
    
    三层记忆:
    1. Project Memory - 项目级别
    2. User Memory - 用户级别
    3. Session Memory - 会话级别
    """
    
    def __init__(
        self,
        project_root: Optional[Path] = None,
        user_home: Optional[Path] = None
    ):
        self.project_memory = ProjectMemory(project_root) if project_root else None
        self.user_memory = UserMemory(user_home)
        self.session_memory = SessionMemory()
    
    def get_full_context(self) -> str:
        """获取完整上下文（优先级：会话 > 项目 > 用户）"""
        parts = []
        
        # 用户记忆
        user_context = self.user_memory.get_context()
        if user_context:
            parts.append(user_context)
        
        # 项目记忆
        if self.project_memory:
            project_context = self.project_memory.get_context()
            if project_context:
                parts.append(project_context)
        
        # 会话摘要
        if self.session_memory.context_summary:
            parts.append(f"## Session Summary\n\n{self.session_memory.context_summary}")
        
        return "\n\n---\n\n".join(parts)
    
    def search(self, query: str) -> list[tuple[str, str]]:
        """跨层搜索"""
        results = []
        
        if self.project_memory:
            results.extend(self.project_memory.storage.search(query))
        
        results.extend(self.user_memory.storage.search(query))
        
        return results
    
    def add_to_session(self, content: str):
        """添加到会话记忆"""
        self.session_memory.add_message("system", content)
    
    def add_to_project(self, content: str, tags: Optional[list[str]] = None):
        """添加到项目记忆"""
        if self.project_memory:
            self.project_memory.add_memory(content, tags)
    
    def add_to_user(self, content: str, tags: Optional[list[str]] = None):
        """添加到用户记忆"""
        self.user_memory.add_memory(content, tags)
```

---

## 智能记忆检索

```python
class MemoryRetriever:
    """智能记忆检索"""
    
    def __init__(self, memory_system: MemorySystem, llm_client=None):
        self.memory = memory_system
        self.llm = llm_client
    
    async def retrieve(
        self,
        query: str,
        max_results: int = 5
    ) -> list[MemoryEntry]:
        """
        智能检索相关记忆
        
        优先级:
        1. 会话内最近的
        2. 项目相关的
        3. 用户偏好的
        """
        results = []
        
        # 1. 会话内搜索
        for msg in self.memory.session_memory.messages[-20:]:
            if query.lower() in msg.get("content", "").lower():
                results.append(MemoryEntry(
                    content=msg["content"],
                    level=MemoryLevel.SESSION,
                    importance=0.9
                ))
        
        # 2. 项目记忆搜索
        if self.memory.project_memory:
            project_results = self.memory.project_memory.storage.search(query)
            for key, content in project_results:
                results.append(MemoryEntry(
                    content=content,
                    level=MemoryLevel.PROJECT,
                    tags=["project"],
                    importance=0.7
                ))
        
        # 3. 用户记忆搜索
        user_results = self.memory.user_memory.storage.search(query)
        for key, content in user_results:
            results.append(MemoryEntry(
                content=content,
                level=MemoryLevel.USER,
                tags=["user"],
                importance=0.5
            ))
        
        # 按重要性排序
        results.sort(key=lambda x: x.importance, reverse=True)
        
        return results[:max_results]
    
    def build_context_prompt(
        self,
        query: str,
        relevant_memories: list[MemoryEntry]
    ) -> str:
        """构建上下文提示"""
        if not relevant_memories:
            return ""
        
        parts = ["## Relevant Context from Memory\n"]
        
        for i, memory in enumerate(relevant_memories, 1):
            parts.append(f"### [{memory.level.value}] {i}")
            parts.append(memory.content[:500])
            parts.append("")
        
        return "\n".join(parts)
```

---

## 使用示例

```python
# 创建记忆系统
memory = MemorySystem(
    project_root=Path("./my-project"),
    user_home=Path.home()
)

# 保存项目规则
memory.project_memory.save_rules("""
# Project Rules

## Code Style
- Use type hints
- Follow PEP 8
- Maximum line length: 88

## Testing
- Write tests for all new features
- Use pytest

## Git
- Conventional commits
- No direct pushes to main
""")

# 添加记忆
memory.add_to_project("Bug fix: login redirect issue", tags=["bugfix", "auth"])
memory.add_to_user("User prefers TypeScript over JavaScript", tags=["preference"])

# 获取上下文
context = memory.get_full_context()
print(context)

# 智能检索
retriever = MemoryRetriever(memory)
results = await retriever.retrieve("login authentication")
```

---

## 关键要点

| 要点 | 说明 |
|------|------|
| **三层架构** | Project > User > Session |
| **CLAUDE.md** | 项目规则文件 |
| **Memdir** | 基于文件的记忆存储 |
| **搜索** | 跨层智能检索 |
| **优先级** | 会话 > 项目 > 用户 |

## 相关技能

- `semantic-memory-system` - 语义记忆
- `graph-memory` - 图记忆
- `task-management` - 任务管理
