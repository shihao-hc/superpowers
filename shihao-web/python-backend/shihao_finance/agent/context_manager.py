"""
5层上下文压缩系统 - Claude Code 模式
基于 Claude Code 源码分析实现的上下文管理
"""

import logging
from typing import Optional, Callable, Any
from dataclasses import dataclass, field
from enum import Enum
import asyncio

logger = logging.getLogger(__name__)


class CompactionLevel(Enum):
    """压缩级别"""

    NONE = "none"
    L1_HISTORY_SNIP = "l1_history_snip"  # 70%
    L2_MICROCOMPACT = "l2_microcompact"  # 80%
    L3_CONTEXT_COLLAPSE = "l3_context_collapse"  # 85%
    L4_AUTO_COMPACT = "l4_auto_compact"  # 90%
    L5_REACTIVE_COMPACT = "l5_reactive_compact"  # 95%+ / 413错误


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

    messages: list
    original_tokens: int
    compacted_tokens: int
    strategy: str
    level: CompactionLevel

    @property
    def reduction(self) -> float:
        if self.original_tokens == 0:
            return 0
        return 1 - (self.compacted_tokens / self.original_tokens)


class ContextManager:
    """
    5层级联上下文管理器

    Claude Code 模式：
    - L1: 70% - History Snip (历史裁剪)
    - L2: 80% - Microcompact (微压缩)
    - L3: 85% - Context Collapse (上下文折叠)
    - L4: 90% - Auto-Compact (主动压缩)
    - L5: 95%+ / 413 - Reactive Compact (紧急压缩)
    """

    def __init__(
        self,
        max_tokens: int = 100000,
        llm_client: Any = None,
        tokenizer: Optional[Callable] = None,
    ):
        self.max_tokens = max_tokens
        self.llm = llm_client
        self.tokenizer = tokenizer or self._default_tokenizer

        # 配置阈值
        self.thresholds = {
            CompactionLevel.L1_HISTORY_SNIP: 0.70,
            CompactionLevel.L2_MICROCOMPACT: 0.80,
            CompactionLevel.L3_CONTEXT_COLLAPSE: 0.85,
            CompactionLevel.L4_AUTO_COMPACT: 0.90,
            CompactionLevel.L5_REACTIVE_COMPACT: 0.95,
        }

        # 消息历史
        self.system_prompt: str = ""
        self.messages: list[dict] = []

        # 统计
        self._compaction_count = 0
        self._last_compaction: Optional[CompactionLevel] = None

    def _default_tokenizer(self, text: str) -> int:
        """默认token计算 - 简单估算"""
        return len(text) // 4

    def _get_usage(self) -> TokenUsage:
        """计算当前token使用"""
        usage = TokenUsage(
            system=self.tokenizer(self.system_prompt) if self.system_prompt else 0,
            history=sum(self.tokenizer(m.get("content", "")) for m in self.messages),
            current=0,
        )
        return usage

    def _get_level(self, usage: TokenUsage) -> CompactionLevel:
        """根据使用率确定压缩级别"""
        ratio = usage.total / self.max_tokens

        for level, threshold in sorted(
            self.thresholds.items(), key=lambda x: x[1], reverse=True
        ):
            if ratio >= threshold:
                return level

        return CompactionLevel.NONE

    # ============================================================
    # L1: History Snip - 历史裁剪 (70%)
    # ============================================================

    def _history_snip(self, messages: list[dict]) -> list[dict]:
        """
        最简单的策略：删除最旧的消息
        保留：System prompt + 最近 N 条消息
        """
        if not messages:
            return messages

        KEEP_RECENT = 20

        system_msgs = [m for m in messages if m.get("role") == "system"]
        other_msgs = [m for m in messages if m.get("role") != "system"]

        if len(other_msgs) > KEEP_RECENT:
            trimmed = len(other_msgs) - KEEP_RECENT
            other_msgs = other_msgs[-KEEP_RECENT:]
            other_msgs.insert(
                0,
                {"role": "system", "content": f"[{trimmed} earlier messages trimmed]"},
            )

        return system_msgs + other_msgs

    # ============================================================
    # L2: Microcompact - 微压缩 (80%)
    # ============================================================

    def _microcompact(self, messages: list[dict]) -> list[dict]:
        """
        压缩冗长的工具输出
        策略：保留开头和结尾，截断中间
        """
        result = []

        for msg in messages:
            if msg.get("role") == "tool":
                content = msg.get("content", "")

                if len(content) > 5000:
                    truncated = (
                        content[:2000]
                        + f"\n\n[... {len(content) - 3000} characters omitted ...]\n\n"
                        + content[-1000:]
                    )
                    msg = {**msg, "content": truncated}

            result.append(msg)

        return result

    # ============================================================
    # L3: Context Collapse - 上下文折叠 (85%)
    # ============================================================

    async def _context_collapse(self, messages: list[dict]) -> list[dict]:
        """
        分段摘要 - 将长对话分成多个段落，每段生成摘要
        """
        if not self.llm:
            return self._history_snip(messages)

        system_msgs = [m for m in messages if m.get("role") == "system"]
        other_msgs = [m for m in messages if m.get("role") != "system"]

        if len(other_msgs) < 15:
            return messages

        SEGMENT_SIZE = 15
        segments = [
            other_msgs[i : i + SEGMENT_SIZE]
            for i in range(0, len(other_msgs) - 10, SEGMENT_SIZE)
        ]
        recent = other_msgs[-10:]

        # 并行生成段落摘要
        summary_tasks = [self._summarize_segment(segment) for segment in segments]
        summaries = await asyncio.gather(*summary_tasks, return_exceptions=True)

        # 重建消息列表
        collapsed = system_msgs.copy()
        for summary in summaries:
            if isinstance(summary, str):
                collapsed.append({"role": "system", "content": f"[Summary]: {summary}"})
        collapsed.extend(recent)

        return collapsed

    async def _summarize_segment(self, segment: list[dict]) -> str:
        """生成段落摘要"""
        prompt = """Summarize this conversation segment concisely (under 200 words):
- Main topics
- Decisions made
- Files created/modified
- Current state"""

        segment_text = "\n".join(
            f"{m.get('role')}: {m.get('content', '')[:500]}" for m in segment
        )

        try:
            response = await self.llm.chat(
                [
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": segment_text},
                ]
            )
            return (
                response if isinstance(response, str) else response.get("content", "")
            )
        except Exception as e:
            logger.warning(f"Summarize failed: {e}")
            return "[Summary failed]"

    # ============================================================
    # L4: Auto-Compact - 主动压缩 (90%)
    # ============================================================

    async def _auto_compact(self, messages: list[dict]) -> list[dict]:
        """
        LLM 驱动的智能压缩 - 生成整个对话摘要
        """
        if not self.llm:
            return self._history_snip(messages)

        compact_prompt = """Create a comprehensive summary preserving:
1. User's original request and goals
2. Key decisions and approaches
3. Files created or modified (with paths)
4. Errors and solutions
5. Current task state
6. Next steps if incomplete

Preserve all technical details and file paths."""

        conversation = "\n".join(
            f"{m.get('role')}: {m.get('content', '')}" for m in messages
        )

        try:
            response = await self.llm.chat(
                [
                    {"role": "system", "content": compact_prompt},
                    {"role": "user", "content": f"Summarize: {conversation}"},
                ]
            )
            summary = (
                response if isinstance(response, str) else response.get("content", "")
            )
        except:
            return self._history_snip(messages)

        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "system", "content": f"Previous conversation summary:\n{summary}"},
            {"role": "system", "content": "Continue from where we left off."},
        ]

    # ============================================================
    # L5: Reactive Compact - 紧急压缩 (95%+ / 413)
    # ============================================================

    async def _reactive_compact(self, messages: list[dict]) -> list[dict]:
        """
        紧急压缩 - 最激进，只保留最小上下文
        """
        logger.warning("Reactive compaction triggered")

        if not self.llm:
            system_msgs = [m for m in messages if m.get("role") == "system"]
            other_msgs = [m for m in messages if m.get("role") != "system"]
            return system_msgs + other_msgs[-5:]

        quick_prompt = """Create a very brief summary (100 words max):
- Current task
- Last action
- Immediate next step"""

        conversation = "\n".join(
            f"{m.get('role')}: {m.get('content', '')}" for m in messages[-20:]
        )

        try:
            response = await self.llm.chat(
                [
                    {"role": "system", "content": quick_prompt},
                    {"role": "user", "content": conversation},
                ]
            )
            summary = (
                response if isinstance(response, str) else response.get("content", "")
            )
        except:
            summary = "Task in progress"

        return [
            {"role": "system", "content": self.system_prompt},
            {"role": "system", "content": f"Quick summary: {summary}"},
            messages[-1] if messages else {"role": "user", "content": ""},
        ]

    # ============================================================
    # 主接口
    # ============================================================

    async def compact(
        self, messages: list[dict] = None, force_level: CompactionLevel = None
    ) -> CompactionResult:
        """
        自动压缩 - 根据token使用率选择合适的压缩级别
        """
        msgs = messages or self.messages

        # 计算使用率
        usage = TokenUsage(
            system=self.tokenizer(self.system_prompt) if self.system_prompt else 0,
            history=sum(self.tokenizer(m.get("content", "")) for m in msgs),
        )

        original_tokens = usage.total

        # 确定压缩级别
        level = force_level or self._get_level(usage)

        if level == CompactionLevel.NONE:
            return CompactionResult(
                messages=msgs,
                original_tokens=original_tokens,
                compacted_tokens=original_tokens,
                strategy="No compaction needed",
                level=level,
            )

        # 执行对应压缩
        if level == CompactionLevel.L1_HISTORY_SNIP:
            compacted = self._history_snip(msgs)
            strategy = "Trimmed old messages, kept recent 20"
        elif level == CompactionLevel.L2_MICROCOMPACT:
            compacted = self._microcompact(msgs)
            strategy = "Compressed long tool outputs"
        elif level == CompactionLevel.L3_CONTEXT_COLLAPSE:
            compacted = await self._context_collapse(msgs)
            strategy = "Segmented and summarized old messages"
        elif level == CompactionLevel.L4_AUTO_COMPACT:
            compacted = await self._auto_compact(msgs)
            strategy = "LLM generated full summary"
        elif level == CompactionLevel.L5_REACTIVE_COMPACT:
            compacted = await self._reactive_compact(msgs)
            strategy = "Emergency compression - minimal context"
        else:
            compacted = msgs
            strategy = "Unknown strategy"

        compacted_tokens = sum(self.tokenizer(m.get("content", "")) for m in compacted)

        # 更新统计
        self._compaction_count += 1
        self._last_compaction = level

        logger.info(f"[ContextManager] Compaction {level.value}: {strategy}")

        return CompactionResult(
            messages=compacted,
            original_tokens=original_tokens,
            compacted_tokens=compacted_tokens,
            strategy=strategy,
            level=level,
        )

    async def compact_if_needed(self, messages: list[dict] = None) -> list[dict]:
        """压缩如果需要，返回压缩后的消息"""
        result = await self.compact(messages)
        return result.messages

    def set_system_prompt(self, prompt: str):
        """设置系统提示"""
        self.system_prompt = prompt

    def add_message(self, role: str, content: str):
        """添加消息"""
        self.messages.append({"role": role, "content": content})

    def get_messages(self) -> list[dict]:
        """获取当前消息"""
        return self.messages

    def clear(self):
        """清空历史"""
        self.messages = []
        self._compaction_count = 0
