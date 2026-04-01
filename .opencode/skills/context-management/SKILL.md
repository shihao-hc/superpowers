---
name: context-management
description: AI Agent 上下文管理策略 - 5层级联压缩、历史管理、Token优化
category: ai-agent-architecture
source: Claude Code context compaction analysis
version: 1.0
tags:
  - context
  - compaction
  - token-optimization
  - memory
  - history
---

# 上下文管理策略 - 5层级联压缩

> 解决 AI Agent 最大痛点：上下文窗口限制

## 问题定义

```
┌─────────────────────────────────────────────────────────────┐
│                    Context Window                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  System Prompt: 2K tokens                            │  │
│  │  History: 50K tokens                                 │  │
│  │  Tools: 10K tokens                                   │  │
│  │  Current: 20K tokens                                 │  │
│  │  ─────────────────────────────────────────────────── │  │
│  │  Total: 82K / 100K (82%)                             │  │
│  │                                                       │  │
│  │  ⚠️ Warning: Approaching limit!                      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

**传统做法**: 报错 "上下文超出限制"
**Claude Code 做法**: 5层级联压缩，用户永远看不到错误

---

## 5层级联压缩架构

```
Token 使用率
    │
100%├─────────────────────────────────────────────
    │  L5: Reactive Compact (紧急压缩)
    │  触发：收到 413 错误
    │  策略：激进压缩，保留最小上下文
    │
 95%├─────────────────────────────────────────────
    │  L4: Auto-Compact (主动压缩)
    │  触发：Token > 90%
    │  策略：LLM 生成摘要
    │
 85%├─────────────────────────────────────────────
    │  L3: Context Collapse (上下文折叠)
    │  触发：Token > 85%
    │  策略：分段摘要
    │
 80%├─────────────────────────────────────────────
    │  L2: Microcompact (微压缩)
    │  触发：Token > 80%
    │  策略：压缩工具输出
    │
 70%├─────────────────────────────────────────────
    │  L1: History Snip (历史裁剪)
    │  触发：Token > 70%
    │  策略：删除旧对话
    │
  0%└─────────────────────────────────────────────
```

---

## 完整实现

```python
from typing import Optional, Callable
from dataclasses import dataclass, field
from collections import deque
import asyncio
import logging

logger = logging.getLogger(__name__)

@dataclass
class TokenUsage:
    """Token 使用情况"""
    system: int = 0
    history: int = 0
    tools: int = 0
    current: int = 0
    
    @property
    def total(self) -> int:
        return self.system + self.history + self.tools + self.current
    
    def ratio(self, limit: int) -> float:
        return self.total / limit if limit > 0 else 0

@dataclass
class CompactionResult:
    """压缩结果"""
    messages: list[dict]
    original_tokens: int
    compacted_tokens: int
    strategy: str
    
    @property
    def reduction(self) -> float:
        if self.original_tokens == 0:
            return 0
        return 1 - (self.compacted_tokens / self.original_tokens)


class ContextManager:
    """5层级联上下文管理器"""
    
    def __init__(
        self,
        max_tokens: int = 100000,
        llm_client = None,
        tokenizer: Optional[Callable] = None
    ):
        self.max_tokens = max_tokens
        self.llm = llm_client
        self.tokenizer = tokenizer or self._default_tokenizer
        
        # 消息历史
        self.system_prompt: str = ""
        self.messages: list[dict] = []
        self._tool_outputs: dict[str, str] = {}
        
        # 统计
        self._compaction_count: int = 0
        self._last_compaction: Optional[str] = None
    
    # ============================================================
    # L1: History Snip - 历史裁剪
    # ============================================================
    
    def _history_snip(self, messages: list[dict]) -> list[dict]:
        """
        最简单的策略：删除最旧的消息
        
        保留：
        - System prompt
        - 最近 N 条消息
        - 未完成的任务
        """
        if not messages:
            return messages
        
        # 保留最近 20 条消息
        KEEP_RECENT = 20
        
        # 分离系统消息和对话
        system_msgs = [m for m in messages if m.get("role") == "system"]
        other_msgs = [m for m in messages if m.get("role") != "system"]
        
        # 裁剪
        if len(other_msgs) > KEEP_RECENT:
            # 添加裁剪标记
            trimmed = len(other_msgs) - KEEP_RECENT
            other_msgs = other_msgs[-KEEP_RECENT:]
            other_msgs.insert(0, {
                "role": "system",
                "content": f"[{trimmed} earlier messages trimmed]"
            })
        
        return system_msgs + other_msgs
    
    # ============================================================
    # L2: Microcompact - 微压缩
    # ============================================================
    
    def _microcompact(self, messages: list[dict]) -> list[dict]:
        """
        压缩冗长的工具输出
        
        策略：
        - 保留工具调用的请求
        - 截断工具输出（保留开头和结尾）
        - 对于搜索结果，只保留匹配项
        """
        result = []
        
        for msg in messages:
            if msg.get("role") == "tool":
                content = msg.get("content", "")
                
                # 如果输出太长，截断
                if len(content) > 5000:
                    # 保留开头 2000 字符和结尾 1000 字符
                    truncated = (
                        content[:2000] +
                        f"\n\n[... {len(content) - 3000} characters omitted ...]\n\n" +
                        content[-1000:]
                    )
                    msg = {**msg, "content": truncated}
            
            result.append(msg)
        
        return result
    
    # ============================================================
    # L3: Context Collapse - 上下文折叠
    # ============================================================
    
    async def _context_collapse(self, messages: list[dict]) -> list[dict]:
        """
        分段摘要 - 将长对话分成多个段落，每段生成摘要
        
        策略：
        - 将历史分成多个段落（每 10-15 条消息）
        - 对每段生成摘要
        - 保留最近的原始消息
        """
        if not self.llm:
            return self._history_snip(messages)
        
        # 分离系统消息
        system_msgs = [m for m in messages if m.get("role") == "system"]
        other_msgs = [m for m in messages if m.get("role") != "system"]
        
        if len(other_msgs) < 15:
            return messages
        
        # 分段
        SEGMENT_SIZE = 15
        segments = [
            other_msgs[i:i + SEGMENT_SIZE]
            for i in range(0, len(other_msgs) - 10, SEGMENT_SIZE)
        ]
        recent = other_msgs[-10:]  # 保留最近 10 条原始消息
        
        # 并行生成段落摘要
        summary_tasks = [
            self._summarize_segment(segment)
            for segment in segments
        ]
        summaries = await asyncio.gather(*summary_tasks)
        
        # 重建消息列表
        collapsed = system_msgs.copy()
        for summary in summaries:
            collapsed.append({
                "role": "system",
                "content": f"[Summary of earlier conversation]: {summary}"
            })
        collapsed.extend(recent)
        
        return collapsed
    
    async def _summarize_segment(self, segment: list[dict]) -> str:
        """生成段落摘要"""
        prompt = """Summarize this conversation segment concisely:
- Main topics discussed
- Decisions made
- Files created/modified
- Current state

Keep it under 200 words."""
        
        segment_text = self._format_messages(segment)
        
        response = await self.llm.complete([
            {"role": "system", "content": prompt},
            {"role": "user", "content": segment_text}
        ])
        
        return response.content
    
    # ============================================================
    # L4: Auto-Compact - 主动压缩
    # ============================================================
    
    async def _auto_compact(self, messages: list[dict]) -> list[dict]:
        """
        LLM 驱动的智能压缩
        
        使用 LLM 生成整个对话的摘要，
        保留最重要的信息。
        """
        if not self.llm:
            return self._history_snip(messages)
        
        compact_prompt = """Your task is to create a detailed summary of the conversation.

Focus on preserving:
1. User's original request and goals
2. Key decisions and approaches taken
3. Files created or modified (with paths)
4. Errors encountered and solutions
5. Current state of the task
6. Next steps if task is incomplete

IMPORTANT: Preserve all specific technical details, file paths, code snippets, and configuration values.
The summary should be comprehensive enough to continue the task without loss of context."""
        
        # 构建对话文本
        conversation = self._format_messages(messages)
        
        # 生成摘要
        response = await self.llm.complete([
            {"role": "system", "content": compact_prompt},
            {"role": "user", "content": f"Summarize this conversation:\n\n{conversation}"}
        ])
        
        # 返回压缩后的上下文
        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "system", "content": f"Previous conversation summary:\n{response.content}"},
            {"role": "system", "content": "Continue from where we left off."}
        ]
    
    # ============================================================
    # L5: Reactive Compact - 反应式压缩
    # ============================================================
    
    async def _reactive_compact(self, messages: list[dict]) -> list[dict]:
        """
        紧急压缩 - 当 API 返回 413 错误时触发
        
        比 Auto-Compact 更激进：
        - 只保留系统提示和最近 5 条消息
        - 摘要更短
        - 删除所有工具输出
        """
        logger.warning("Reactive compaction triggered - context exceeded limit")
        
        if not self.llm:
            # 极端情况：直接截断
            system_msgs = [m for m in messages if m.get("role") == "system"]
            other_msgs = [m for m in messages if m.get("role") != "system"]
            return system_msgs + other_msgs[-5:]
        
        # 快速摘要
        quick_prompt = """Create a very brief summary (100 words max).
Focus only on:
- Current task
- Last action taken
- Immediate next step"""
        
        conversation = self._format_messages(messages[-20:])  # 只看最近 20 条
        
        response = await self.llm.complete([
            {"role": "system", "content": quick_prompt},
            {"role": "user", "content": conversation}
        ])
        
        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "system", "content": f"Quick summary: {response.content}"},
            messages[-1]  # 保留最后一条用户消息
        ]
    
    # ============================================================
    # 主接口
    # ============================================================
    
    async def compact_if_needed(self) -> Optional[CompactionResult]:
        """
        根据当前 Token 使用率选择压缩策略
        
        返回 None 表示无需压缩
        """
        usage = self._calculate_usage()
        ratio = usage.ratio(self.max_tokens)
        
        # 选择策略
        if ratio >= 0.95:
            strategy = "reactive_compact"
            compacted = await self._reactive_compact(self.messages)
        elif ratio >= 0.90:
            strategy = "auto_compact"
            compacted = await self._auto_compact(self.messages)
        elif ratio >= 0.85:
            strategy = "context_collapse"
            compacted = await self._context_collapse(self.messages)
        elif ratio >= 0.80:
            strategy = "microcompact"
            compacted = self._microcompact(self.messages)
        elif ratio >= 0.70:
            strategy = "history_snip"
            compacted = self._history_snip(self.messages)
        else:
            return None  # 无需压缩
        
        # 计算结果
        original_tokens = usage.history
        compacted_tokens = sum(
            self.tokenizer(m.get("content", "")) 
            for m in compacted
        )
        
        self._compaction_count += 1
        self._last_compaction = strategy
        self.messages = compacted
        
        logger.info(
            f"Compaction [{strategy}]: {original_tokens} → {compacted_tokens} tokens "
            f"({1 - compacted_tokens/original_tokens:.1%} reduction)"
        )
        
        return CompactionResult(
            messages=compacted,
            original_tokens=original_tokens,
            compacted_tokens=compacted_tokens,
            strategy=strategy
        )
    
    def _calculate_usage(self) -> TokenUsage:
        """计算 Token 使用情况"""
        system_tokens = sum(
            self.tokenizer(m.get("content", ""))
            for m in self.messages
            if m.get("role") == "system"
        )
        history_tokens = sum(
            self.tokenizer(m.get("content", ""))
            for m in self.messages
            if m.get("role") != "system"
        )
        
        return TokenUsage(
            system=system_tokens,
            history=history_tokens,
        )
    
    def _format_messages(self, messages: list[dict]) -> str:
        """格式化消息为文本"""
        parts = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            parts.append(f"[{role}]: {content}")
        return "\n\n".join(parts)
    
    def _default_tokenizer(self, text: str) -> int:
        """默认 tokenizer（粗略估计）"""
        return len(text) // 4  # 平均每 token 约 4 字符
```

---

## 使用示例

```python
# 创建上下文管理器
context = ContextManager(
    max_tokens=100_000,
    llm_client=my_llm
)

# 设置系统提示
context.system_prompt = "You are a helpful assistant."

# 添加消息
context.messages.append({"role": "user", "content": "分析这个项目"})

# 在每次添加消息后检查
for i in range(100):
    context.messages.append({"role": "assistant", "content": response})
    context.messages.append({"role": "user", "content": next_question})
    
    # 自动压缩
    result = await context.compact_if_needed()
    if result:
        print(f"压缩: {result.strategy}, 减少 {result.reduction:.1%}")
```

---

## Token 估算策略

```python
class TokenEstimator:
    """Token 估算器"""
    
    @staticmethod
    def estimate(text: str, language: str = "en") -> int:
        """估算文本的 token 数"""
        if language == "zh":
            # 中文：每个字符约 1-2 tokens
            return len(text) * 1.5
        else:
            # 英文：每 4 个字符约 1 token
            return len(text) // 4
    
    @staticmethod
    def estimate_messages(messages: list[dict]) -> int:
        """估算消息列表的 token 数"""
        total = 0
        for msg in messages:
            # 消息格式开销
            total += 10
            # 内容
            total += TokenEstimator.estimate(msg.get("content", ""))
        return total
    
    @staticmethod
    def estimate_tools(tools: list[dict]) -> int:
        """估算工具定义的 token 数"""
        import json
        total = 0
        for tool in tools:
            total += len(json.dumps(tool))
        return total // 4
```

---

## 最佳实践

| 实践 | 说明 |
|------|------|
| **设置阈值** | 70% 开始轻度压缩，90% 开始重度压缩 |
| **保留关键信息** | 用户目标、文件路径、当前状态 |
| **并行压缩** | 多段摘要并行生成 |
| **分级策略** | 轻量级任务用 L1-L2，重量级任务用 L3-L5 |
| **记录统计** | 记录压缩次数、减少比例，用于优化 |

## 相关技能

- `agent-loop-patterns` - Agent 循环模式
- `llm-client-patterns` - LLM 客户端
- `semantic-memory-system` - 语义记忆
