---
name: claude-code-architecture
description: Learn from Claude Code's leaked source code - advanced agent architecture, streaming tool execution, context management, and security patterns
category: ai-agent-architecture
source: Claude Code v2.1.88 source code analysis (March 2026)
version: 1.0
tags:
  - agent-architecture
  - streaming
  - context-management
  - mcp-protocol
  - tool-execution
  - security
---

# Claude Code 架构学习 - 从源码中提取的最佳实践

> 基于 Claude Code v2.1.88 泄露源码（51.2万行 TypeScript）的深度分析

## 📊 概览

| 指标 | 数值 |
|------|------|
| 代码量 | 512,000+ 行 TypeScript |
| 文件数 | 1,900+ 文件 |
| 工具数 | 40+ 专业工具 |
| 命令数 | 85+ 斜杠命令 |
| 特性开关 | 44+ Feature Flags |

---

## 🏗️ 一、核心架构模式

### 1.1 分层架构设计

```
┌─────────────────────────────────────────┐
│           USER INTERFACES               │
│    CLI │ VS Code │ JetBrains │ Web      │
├─────────────────────────────────────────┤
│           TRANSPORT LAYER               │
│    SSE │ WebSocket │ Hybrid             │
├─────────────────────────────────────────┤
│            CORE ENGINE                  │
│  QueryEngine (46K行) │ Tool System      │
│  Permissions │ Context Manager          │
├─────────────────────────────────────────┤
│          EXTERNAL SERVICES              │
│  Anthropic API │ MCP Servers │ Git/FS   │
└─────────────────────────────────────────┘
```

### 1.2 请求处理流水线

```
User Input → Context Setup → API Stream → Tool Dispatch → Loop/Return
```

---

## 🔄 二、Agentic Loop (核心引擎)

### 2.1 异步生成器状态机

**关键创新**: 使用 `async generator` 实现流式 Agent 循环

```typescript
async function* queryLoop(params): AsyncGenerator<Event, Terminal> {
  let state = initialState;
  
  while (true) {
    // 流式调用模型
    for await (const msg of callModel(state)) {
      yield msg;  // 实时返回模型输出
    }
    
    // 并行执行工具
    for await (const result of executeTools()) {
      yield result;  // 流式返回工具结果
    }
    
    // 判断是否需要继续
    if (!needsFollowUp) {
      return { reason: 'completed' };
    }
    
    state = computeNextState(state);
  }
}
```

**学习要点**:
- ✅ 使用 `yield` 实现流式输出，用户实时看到进度
- ✅ 工具在模型仍在生成时就开始执行（流式工具执行）
- ✅ 状态机模式管理复杂状态转换
- ✅ `return` 值携带完成原因，便于调试

### 2.2 流式工具执行 (StreamingToolExecution)

**传统方式**: 模型完成 → 执行工具 → 继续生成
**Claude Code**: 模型生成"让我检查那个文件"时，文件已经在读取

```typescript
// 在模型流式输出时就开始执行工具
for (const block of toolBlocks) {
  executor.addTool(block);  // 立即执行
}

// 获取已完成的结果
for (const r of executor.getCompletedResults()) {
  yield r.message;
}
```

**收益**: 减少感知延迟 30-50%

---

## 📦 三、5层上下文管理

**问题**: 上下文窗口限制是 AI 助手的致命弱点

**解决方案**: 5层级联压缩策略

| 层级 | 策略 | 触发条件 | 作用 |
|------|------|----------|------|
| L1 | History Snip | 上下文 > 70% | 删除旧对话轮次 |
| L2 | Microcompact | L1不够 | 压缩冗长工具结果 |
| L3 | Context Collapse | L2不够 | 摘要部分对话内容 |
| L4 | Auto-Compact | 上下文 > 90% | 主动摘要预防溢出 |
| L5 | Reactive Compact | 收到413错误 | 紧急压缩恢复 |

```python
# Python 实现思路
class ContextManager:
    def __init__(self, max_tokens: int = 100000):
        self.max_tokens = max_tokens
        self.history: list[Message] = []
    
    def compact_if_needed(self, usage: TokenUsage) -> None:
        ratio = usage.current / self.max_tokens
        
        if ratio > 0.9:
            self._reactive_compact()  # L5: 紧急
        elif ratio > 0.8:
            self._auto_compact()      # L4: 主动
        elif ratio > 0.7:
            self._context_collapse()  # L3: 折叠
        elif self._should_microcompact():
            self._microcompact()      # L2: 微压缩
        else:
            self._history_snip()      # L1: 裁剪
    
    def _microcompact(self):
        """压缩冗长的工具输出"""
        for msg in self.history:
            if msg.role == "tool" and len(msg.content) > 1000:
                msg.content = self._summarize_tool_output(msg.content)
    
    def _auto_compact(self):
        """主动摘要保留关键信息"""
        summary = self._generate_summary(self.history)
        self.history = [Message(role="system", content=summary)]
```

---

## 🛠️ 四、工具系统设计

### 4.1 工具分类 (40+ 工具)

| 类别 | 工具 | 用途 |
|------|------|------|
| 文件操作 | FileRead, FileWrite, FileEdit, NotebookEdit | 文件读写编辑 |
| 搜索导航 | GlobTool, GrepTool, LSPTool, ToolSearch | 代码搜索 |
| 执行 | BashTool, PowerShellTool, AgentTool, REPL | 命令执行 |
| Web | WebFetch, WebSearch, MCPTool, ReadMcpResource | 网络请求 |
| 管理 | TodoWrite, AskUser, Schedule | 任务管理 |

### 4.2 工具接口模式

```python
from pydantic import BaseModel, Field
from typing import Optional, Callable, Any
from enum import Enum
import asyncio

class ToolPermission(Enum):
    ALLOW = "allow"
    DENY = "deny"
    ASK = "ask"

class ToolSchema(BaseModel):
    """Zod-like 工具模式定义"""
    name: str
    description: str
    parameters: dict
    permission: ToolPermission = ToolPermission.ASK
    
class BaseTool:
    """Claude Code 工具基类模式"""
    
    def __init__(self, schema: ToolSchema):
        self.schema = schema
        self._denial_count = 0
        self._max_denials = 3
    
    async def execute(self, params: dict, context: Any) -> ToolResult:
        """执行工具"""
        # 1. 验证参数
        validated = self._validate_params(params)
        
        # 2. 检查权限
        if not self._check_permission():
            return ToolResult.error("Permission denied")
        
        # 3. 流式返回进度
        async for progress in self._run_with_progress(validated, context):
            yield progress  # 使用 async generator 实时返回进度
        
        # 4. 返回最终结果
        return ToolResult.success(result)
    
    def _check_permission(self) -> bool:
        """权限检查 + 拒绝追踪"""
        if self._denial_count >= self._max_denials:
            return False  # 多次拒绝后自动拒绝
        return True
```

### 4.3 AgentTool - 子代理生成

**关键能力**: 任务分解，创建专门的子代理执行子任务

```python
class AgentTool(BaseTool):
    """创建子代理执行子任务"""
    
    async def execute(self, task: str, **kwargs) -> ToolResult:
        # 1. 分析任务，确定需要的专家类型
        specialist = self._select_specialist(task)
        
        # 2. 创建子代理上下文（独立对话历史）
        sub_context = AgentContext(
            role=specialist.role,
            system_prompt=specialist.prompt,
            tools=specialist.tools,
        )
        
        # 3. 执行子任务
        result = await specialist.execute(task, sub_context)
        
        # 4. 验证结果
        verified = await self._verify_result(result)
        
        return ToolResult.success(verified)
```

---

## 🔐 五、安全与权限系统

### 5.1 三模式权限系统

| 模式 | 行为 | 适用场景 |
|------|------|----------|
| Default | 每个操作都询问 | 未知代码库 |
| Plan | 只读操作，不执行 | 规划阶段 |
| Auto | 安全操作自动批准 | 受信任项目 |

### 5.2 拒绝追踪机制

```python
class PermissionManager:
    """权限管理 + 拒绝追踪"""
    
    def __init__(self, max_denials: int = 3):
        self.max_denials = max_denials
        self._denial_counts: dict[str, int] = {}
        self._tool_permissions: dict[str, ToolPermission] = {}
    
    async def check_permission(self, tool: str, action: str) -> bool:
        """检查权限，考虑拒绝历史"""
        
        # 检查是否超过最大拒绝次数
        if self._denial_counts.get(tool, 0) >= self.max_denials:
            logger.warning(f"Tool {tool} auto-denied after {self.max_denials} rejections")
            return False
        
        # 检查工具特定规则
        permission = self._tool_permissions.get(tool, ToolPermission.ASK)
        
        if permission == ToolPermission.ALLOW:
            return True
        elif permission == ToolPermission.DENY:
            return False
        else:  # ASK
            granted = await self._ask_user(tool, action)
            if not granted:
                self._denial_counts[tool] = self._denial_counts.get(tool, 0) + 1
            return granted
```

### 5.3 网络风险防护 (cyberRiskInstruction.ts)

内置的安全限制：
- 禁止破坏性技术（如 `rm -rf`）
- 禁止 DoS 攻击
- 禁止大规模目标攻击
- 禁止供应链攻击

---

## 🧠 六、记忆系统 (memdir)

### 6.1 三层记忆架构

```
┌─────────────────────────────────────────┐
│       Project Memory (.claude/)         │
│  - CLAUDE.md (项目规则)                 │
│  - .claude/memory/ (持久记忆)           │
├─────────────────────────────────────────┤
│       User Memory (~/.claude/)          │
│  - 全局偏好设置                          │
│  - 跨项目记忆                            │
├─────────────────────────────────────────┤
│       Session Memory (运行时)           │
│  - 当前对话历史                          │
│  - 临时上下文                            │
└─────────────────────────────────────────┘
```

### 6.2 记忆检索

```python
class MemorySystem:
    """Claude Code 风格的记忆系统"""
    
    def __init__(self, project_root: str):
        self.project_memory = ProjectMemory(project_root)
        self.user_memory = UserMemory()
        self.session_memory = SessionMemory()
    
    async def retrieve(self, query: str, context: Context) -> list[Memory]:
        """智能检索相关记忆"""
        results = []
        
        # 1. 会话记忆（最近的）
        results.extend(self.session_memory.search(query, limit=5))
        
        # 2. 项目记忆（基于语义相关性）
        results.extend(await self.project_memory.semantic_search(query, limit=10))
        
        # 3. 用户记忆（长期偏好）
        results.extend(await self.user_memory.search(query, limit=3))
        
        # 去重 + 排序
        return self._deduplicate_and_rank(results)
```

---

## 🧩 七、Skills 系统

### 7.1 技能文件格式

```markdown
---
name: code-review
description: Systematic code review workflow
tools: [Read, Grep, Glob, Edit]
---

# Code Review Skill

When reviewing code, follow these steps:

1. **Understand the Context**
   - Read related files
   - Check git history

2. **Check Correctness**
   - Logic errors
   - Edge cases
   - Error handling

3. **Check Security**
   - Input validation
   - Authentication
   - SQL injection
```

### 7.2 技能加载优先级

```
1. 项目技能 (.claude/skills/) - 最高优先级
2. 用户技能 (~/.claude/skills/) - 中等优先级
3. 内置技能 (bundled) - 最低优先级
```

---

## ⚡ 八、可直接复用的模式

### 8.1 流式状态机模式

```python
class StreamingAgent:
    """可复用的流式 Agent 模式"""
    
    async def run(self, task: str) -> AsyncIterator[AgentEvent]:
        state = AgentState(task=task)
        
        while True:
            # 流式调用 LLM
            async for chunk in self.llm.stream(state.messages):
                yield AgentEvent(type="text", content=chunk)
            
            # 检查是否有工具调用
            if not state.has_tool_calls():
                yield AgentEvent(type="complete", result=state.result)
                return
            
            # 并行执行工具
            tasks = [self._execute_tool(tc) for tc in state.tool_calls]
            for coro in asyncio.as_completed(tasks):
                result = await coro
                yield AgentEvent(type="tool_result", data=result)
            
            # 更新状态
            state = self._compute_next_state(state)
```

### 8.2 级联压缩模式

```python
class CascadingCompactor:
    """可复用的上下文压缩模式"""
    
    def __init__(self, max_tokens: int):
        self.max_tokens = max_tokens
        self.strategies: list[tuple[float, CompactionStrategy]] = [
            (0.7, HistorySnipStrategy()),
            (0.8, MicrocompactStrategy()),
            (0.85, ContextCollapseStrategy()),
            (0.9, AutoCompactStrategy()),
            (0.95, ReactiveCompactStrategy()),
        ]
    
    def compact(self, context: Context) -> Context:
        ratio = context.token_count / self.max_tokens
        
        for threshold, strategy in self.strategies:
            if ratio >= threshold:
                logger.info(f"Compacting at {ratio:.0%} using {strategy.name}")
                return strategy.apply(context)
        
        return context
```

### 8.3 权限管理器模式

```python
class PermissionGuard:
    """可复用的权限管理器"""
    
    def __init__(self, max_denials: int = 3):
        self.max_denials = max_denials
        self._denials: dict[str, int] = defaultdict(int)
        self._rules: dict[str, PermissionRule] = {}
    
    def require(self, action: str, check: Callable) -> bool:
        """检查权限，记录拒绝次数"""
        if self._denials[action] >= self.max_denials:
            return False
        
        allowed = check()
        if not allowed:
            self._denials[action] += 1
        
        return allowed
    
    def reset(self, action: str):
        """重置拒绝计数"""
        self._denials[action] = 0
```

---

## 📈 九、性能优化技巧

### 9.1 启动优化

- **并行初始化**: 多个模块同时启动
- **延迟导入**: 使用时才加载模块
- **内存预取**: 预测性加载常用模块

### 9.2 构建时特性消除

使用 Bun 的 `feature()` 在编译时移除未使用代码：

```typescript
import { feature } from 'bun:bundle';

// 如果 BUDDY=false，整个模块从 bundle 中移除
const buddyModule = feature('BUDDY') 
  ? require('./commands/buddy/index.js') 
  : null;
```

---

## 🎯 十、对我们的启示

### 立即可做的改进

1. **实现流式 Agent 循环**
   - 将我们的 `CrawlerEngine` 改为 async generator
   - 实时返回处理进度

2. **添加 5 层上下文管理**
   - 当前只有基本缓存
   - 添加级联压缩策略

3. **完善权限系统**
   - 添加拒绝追踪
   - 实现三模式切换

### 中期改进

1. **Skills 系统标准化**
   - 我们已有 SKILL.md，可以学习 Claude Code 的 YAML frontmatter
   - 添加 tools 声明

2. **子代理系统**
   - 学习 AgentTool 的任务分解模式
   - 实现专门化代理

### 长期目标

1. **流式工具执行** - 减少感知延迟
2. **构建时优化** - 使用条件编译
3. **记忆系统** - 三层记忆架构

---

## 📚 参考资源

- [Claude Code 源码分析](https://mimran-khan.github.io/claude-code-source/)
- [架构深度分析 Gist](https://gist.github.com/yanchuk/0c47dd351c2805236e44ec3935e9095d)
- [拆解 Claude Code - Tony Bai](https://tonybai.com/2026/01/08/how-claude-code-works/)
- [Claude Code Deep Dive Report](https://github.com/tvytlx/claude-code-deep-dive)
