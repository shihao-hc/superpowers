---
name: task-management
description: AI Agent 任务管理系统 - TodoWrite 模式、任务持久化、进度追踪
category: ai-agent-productivity
source: Claude Code TodoWrite tool analysis
version: 1.0
tags:
  - todo
  - task-tracking
  - persistence
  - progress
  - workflow
---

# 任务管理系统 - TodoWrite 模式

> Claude Code 的任务追踪机制：JSON 持久化 + 上下文注入

## 设计理念

```
┌─────────────────────────────────────────────────────────────┐
│                   Task Management System                    │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                    Agent Loop                        │ │
│  │  用户请求 → 分解任务 → 创建Todo → 执行 → 更新状态    │ │
│  └───────────────────────────────────────────────────────┘ │
│                           │                                 │
│                           ▼                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │                  TodoWrite Tool                       │ │
│  │  {                                                    │ │
│  │    "todos": [                                         │ │
│  │      {"content": "...", "status": "in_progress"},    │ │
│  │      {"content": "...", "status": "pending"}         │ │
│  │    ]                                                  │ │
│  │  }                                                    │ │
│  └───────────────────────────────────────────────────────┘ │
│                           │                                 │
│                           ▼                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │              ~/.claude/todos/xxx.json                 │ │
│  │              (持久化到文件系统)                        │ │
│  └───────────────────────────────────────────────────────┘ │
│                           │                                 │
│                           ▼                                 │
│  ┌───────────────────────────────────────────────────────┐ │
│  │          System Reminder End (自动注入)               │ │
│  │  "Your current todo list: ..."                        │ │
│  └───────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## 核心实现

```python
from typing import Optional
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from datetime import datetime
import json
import uuid
import logging

logger = logging.getLogger(__name__)


class TodoStatus(Enum):
    """任务状态"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TodoPriority(Enum):
    """任务优先级"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class Todo:
    """单个 Todo 项"""
    content: str
    status: TodoStatus = TodoStatus.PENDING
    priority: TodoPriority = TodoPriority.MEDIUM
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    parent_id: Optional[str] = None  # 子任务的父任务 ID
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "content": self.content,
            "status": self.status.value,
            "priority": self.priority.value,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "parent_id": self.parent_id,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Todo":
        return cls(
            id=data["id"],
            content=data["content"],
            status=TodoStatus(data["status"]),
            priority=TodoPriority(data.get("priority", "medium")),
            created_at=datetime.fromisoformat(data["created_at"]),
            completed_at=datetime.fromisoformat(data["completed_at"]) if data.get("completed_at") else None,
            parent_id=data.get("parent_id"),
        )


class TodoManager:
    """
    Todo 管理器 - Claude Code 风格
    
    特点:
    1. JSON 文件持久化
    2. 自动生成上下文注入
    3. 与 Agent 循环集成
    4. 支持子任务
    """
    
    def __init__(
        self,
        storage_dir: Optional[Path] = None,
        max_todos: int = 20,
        auto_persist: bool = True
    ):
        self.storage_dir = storage_dir or Path.home() / ".claude" / "todos"
        self.max_todos = max_todos
        self.auto_persist = auto_persist
        
        self._todos: dict[str, Todo] = {}
        self._session_id: str = str(uuid.uuid4())[:8]
        
        # 确保存储目录存在
        self.storage_dir.mkdir(parents=True, exist_ok=True)
    
    # ================================================================
    # CRUD 操作
    # ================================================================
    
    def add(
        self,
        content: str,
        priority: TodoPriority = TodoPriority.MEDIUM,
        parent_id: Optional[str] = None
    ) -> Todo:
        """添加新 Todo"""
        
        # 检查数量限制
        if len(self._todos) >= self.max_todos:
            # 移除已完成的
            self._cleanup_completed()
        
        todo = Todo(
            content=content,
            priority=priority,
            parent_id=parent_id
        )
        self._todos[todo.id] = todo
        
        if self.auto_persist:
            self._persist()
        
        return todo
    
    def update(
        self,
        todo_id: str,
        status: Optional[TodoStatus] = None,
        content: Optional[str] = None
    ) -> Optional[Todo]:
        """更新 Todo"""
        todo = self._todos.get(todo_id)
        if not todo:
            logger.warning(f"Todo not found: {todo_id}")
            return None
        
        if status:
            todo.status = status
            if status == TodoStatus.COMPLETED:
                todo.completed_at = datetime.now()
        
        if content:
            todo.content = content
        
        if self.auto_persist:
            self._persist()
        
        return todo
    
    def complete(self, todo_id: str) -> Optional[Todo]:
        """标记为完成"""
        return self.update(todo_id, status=TodoStatus.COMPLETED)
    
    def remove(self, todo_id: str) -> bool:
        """删除 Todo"""
        if todo_id in self._todos:
            del self._todos[todo_id]
            if self.auto_persist:
                self._persist()
            return True
        return False
    
    def get(self, todo_id: str) -> Optional[Todo]:
        """获取单个 Todo"""
        return self._todos.get(todo_id)
    
    def list_all(
        self,
        status_filter: Optional[TodoStatus] = None
    ) -> list[Todo]:
        """列出所有 Todo"""
        todos = list(self._todos.values())
        
        if status_filter:
            todos = [t for t in todos if t.status == status_filter]
        
        # 按优先级和创建时间排序
        priority_order = {
            TodoPriority.HIGH: 0,
            TodoPriority.MEDIUM: 1,
            TodoPriority.LOW: 2,
        }
        
        return sorted(
            todos,
            key=lambda t: (priority_order.get(t.priority, 99), t.created_at)
        )
    
    # ================================================================
    # 上下文注入 (Claude Code 关键特性)
    # ================================================================
    
    def get_context_prompt(self) -> str:
        """
        生成上下文注入提示
        
        这是 Claude Code 的核心特性：
        在每次 LLM 调用前，自动注入当前 Todo 状态
        让 LLM 知道当前进度和待办事项
        """
        active_todos = self.list_all(status_filter=TodoStatus.PENDING)
        in_progress = self.list_all(status_filter=TodoStatus.IN_PROGRESS)
        
        if not active_todos and not in_progress:
            return ""
        
        parts = ["## Current Todo List\n"]
        
        if in_progress:
            parts.append("### In Progress:")
            for todo in in_progress:
                parts.append(f"- [ ] {todo.content} ({todo.priority.value})")
            parts.append("")
        
        if active_todos:
            parts.append("### Pending:")
            for todo in active_todos:
                parts.append(f"- [ ] {todo.content} ({todo.priority.value})")
            parts.append("")
        
        parts.append("Use TodoWrite tool to update task status as you progress.")
        
        return "\n".join(parts)
    
    # ================================================================
    # 与 Agent 循环集成
    # ================================================================
    
    def create_todos_from_task(self, task: str, subtasks: list[str]) -> list[Todo]:
        """
        从任务描述创建 Todo 列表
        
        Agent 可以调用此方法将复杂任务分解为子任务
        """
        todos = []
        
        for subtask in subtasks:
            todo = self.add(content=subtask)
            todos.append(todo)
        
        return todos
    
    def get_next_action(self) -> Optional[Todo]:
        """获取下一个应该执行的任务"""
        # 优先获取进行中的
        in_progress = self.list_all(TodoStatus.IN_PROGRESS)
        if in_progress:
            return in_progress[0]
        
        # 否则获取待办的
        pending = self.list_all(TodoStatus.PENDING)
        if pending:
            return pending[0]
        
        return None
    
    def get_progress_summary(self) -> dict:
        """获取进度摘要"""
        all_todos = list(self._todos.values())
        total = len(all_todos)
        
        if total == 0:
            return {"total": 0, "completed": 0, "progress": 0}
        
        completed = sum(1 for t in all_todos if t.status == TodoStatus.COMPLETED)
        in_progress = sum(1 for t in all_todos if t.status == TodoStatus.IN_PROGRESS)
        pending = sum(1 for t in all_todos if t.status == TodoStatus.PENDING)
        
        return {
            "total": total,
            "completed": completed,
            "in_progress": in_progress,
            "pending": pending,
            "progress": completed / total * 100,
        }
    
    # ================================================================
    # 持久化
    # ================================================================
    
    def _persist(self):
        """持久化到文件"""
        file_path = self.storage_dir / f"{self._session_id}.json"
        
        data = {
            "session_id": self._session_id,
            "updated_at": datetime.now().isoformat(),
            "todos": [todo.to_dict() for todo in self._todos.values()]
        }
        
        try:
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to persist todos: {e}")
    
    def load(self, session_id: str) -> bool:
        """从文件加载"""
        file_path = self.storage_dir / f"{session_id}.json"
        
        if not file_path.exists():
            return False
        
        try:
            with open(file_path) as f:
                data = json.load(f)
            
            self._session_id = session_id
            self._todos = {
                t["id"]: Todo.from_dict(t)
                for t in data["todos"]
            }
            return True
        except Exception as e:
            logger.error(f"Failed to load todos: {e}")
            return False
    
    def _cleanup_completed(self):
        """清理已完成的 Todo"""
        completed_ids = [
            todo_id for todo_id, todo in self._todos.items()
            if todo.status == TodoStatus.COMPLETED
        ]
        
        # 只保留最近 5 个已完成的
        if len(completed_ids) > 5:
            for todo_id in completed_ids[:-5]:
                del self._todos[todo_id]
```

---

## Tool 集成

```python
class TodoWriteTool:
    """
    TodoWrite 工具 - 供 Agent 使用
    
    这是 Claude Code 中 Agent 管理任务的核心工具
    """
    
    name = "TodoWrite"
    description = "Manage todo list for task tracking. Update status as you progress."
    
    def __init__(self, manager: TodoManager):
        self.manager = manager
    
    def get_schema(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "inputSchema": {
                "type": "object",
                "properties": {
                    "todos": {
                        "type": "array",
                        "description": "List of todos to update",
                        "items": {
                            "type": "object",
                            "properties": {
                                "content": {
                                    "type": "string",
                                    "description": "Todo description"
                                },
                                "status": {
                                    "type": "string",
                                    "enum": ["pending", "in_progress", "completed"],
                                    "description": "Todo status"
                                },
                                "priority": {
                                    "type": "string",
                                    "enum": ["high", "medium", "low"],
                                    "description": "Todo priority"
                                }
                            },
                            "required": ["content", "status"]
                        }
                    }
                },
                "required": ["todos"]
            }
        }
    
    async def execute(self, params: dict) -> str:
        """执行 Todo 更新"""
        todos_data = params.get("todos", [])
        results = []
        
        for todo_data in todos_data:
            content = todo_data["content"]
            status = TodoStatus(todo_data["status"])
            priority = TodoPriority(todo_data.get("priority", "medium"))
            
            # 查找是否已存在
            existing = None
            for todo in self.manager.list_all():
                if todo.content == content:
                    existing = todo
                    break
            
            if existing:
                # 更新现有
                self.manager.update(existing.id, status=status)
                results.append(f"Updated: {content} → {status.value}")
            else:
                # 创建新
                self.manager.add(content, priority=priority)
                if status == TodoStatus.IN_PROGRESS:
                    # 需要再更新一次状态
                    new_todos = self.manager.list_all()
                    for t in new_todos:
                        if t.content == content:
                            self.manager.update(t.id, status=status)
                            break
                results.append(f"Created: {content} ({status.value})")
        
        progress = self.manager.get_progress_summary()
        summary = f"\nProgress: {progress['completed']}/{progress['total']} ({progress['progress']:.0f}%)"
        
        return "\n".join(results) + summary
```

---

## 与 Agent 循环集成

```python
class TodoAwareAgent:
    """带 Todo 管理的 Agent"""
    
    def __init__(self, llm_client, todo_manager: TodoManager):
        self.llm = llm_client
        self.todo_manager = todo_manager
        self.todo_tool = TodoWriteTool(todo_manager)
    
    async def run(self, task: str) -> str:
        """执行任务"""
        
        # 1. 分解任务为子任务
        subtasks = await self._decompose_task(task)
        
        # 2. 创建 Todo
        self.todo_manager.create_todos_from_task(task, subtasks)
        
        # 3. 执行循环
        while True:
            todo = self.todo_manager.get_next_action()
            if not todo:
                break
            
            # 标记为进行中
            self.todo_manager.update(todo.id, status=TodoStatus.IN_PROGRESS)
            
            # 执行子任务
            result = await self._execute_subtask(todo.content)
            
            # 标记为完成
            self.todo_manager.complete(todo.id)
        
        return "All tasks completed!"
    
    async def _decompose_task(self, task: str) -> list[str]:
        """使用 LLM 分解任务"""
        prompt = f"""Break down this task into specific subtasks:
        
Task: {task}

Return a JSON list of subtasks, each being a specific action.
Example: ["Read the main.py file", "Identify the bug", "Fix the bug", "Run tests"]
"""
        
        response = await self.llm.complete([
            {"role": "user", "content": prompt}
        ])
        
        # 解析响应
        import json
        try:
            return json.loads(response.content)
        except:
            return [task]
    
    async def _execute_subtask(self, subtask: str) -> str:
        """执行单个子任务"""
        # ... 执行逻辑 ...
        return f"Completed: {subtask}"
```

---

## 使用示例

```python
# 创建 Todo 管理器
todo_mgr = TodoManager()

# 添加任务
todo_mgr.add("分析项目结构", priority=TodoPriority.HIGH)
todo_mgr.add("修复登录 bug", priority=TodoPriority.HIGH)
todo_mgr.add("编写单元测试", priority=TodoPriority.MEDIUM)
todo_mgr.add("更新文档", priority=TodoPriority.LOW)

# 获取上下文提示（注入到 LLM）
context = todo_mgr.get_context_prompt()
print(context)

# 更新状态
todo_mgr.update("todo-123", status=TodoStatus.IN_PROGRESS)
todo_mgr.complete("todo-123")

# 获取进度
progress = todo_mgr.get_progress_summary()
print(f"Progress: {progress['progress']:.0f}%")
```

**输出**:
```
## Current Todo List

### In Progress:
- [ ] 修复登录 bug (high)

### Pending:
- [ ] 分析项目结构 (high)
- [ ] 编写单元测试 (medium)
- [ ] 更新文档 (low)

Use TodoWrite tool to update task status as you progress.
```

---

## 关键要点

| 要点 | 说明 |
|------|------|
| **持久化** | JSON 文件存储，支持会话恢复 |
| **上下文注入** | 自动注入 Todo 状态到 LLM 提示 |
| **任务分解** | LLM 将复杂任务分解为子任务 |
| **进度追踪** | 实时进度百分比和统计 |
| **优先级** | HIGH/MEDIUM/LOW 三级优先级 |

## 相关技能

- `agent-loop-patterns` - Agent 循环模式
- `kanban-dashboard` - 看板仪表盘
- `task-scheduling` - 任务调度
