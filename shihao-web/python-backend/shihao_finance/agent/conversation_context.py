"""
Conversation Context Manager
多轮对话上下文管理器 - 管理和维护对话历史与上下文
"""

import json
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from threading import Lock
from enum import Enum
import hashlib


class Role(Enum):
    """对话角色"""

    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    AGENT = "agent"  # 内部Agent


@dataclass
class ConversationMessage:
    """对话消息"""

    role: str
    content: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)
    token_count: int = 0

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "content": self.content,
            "timestamp": self.timestamp,
            "metadata": self.metadata,
            "token_count": self.token_count,
        }

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """估算token数量（简化版）"""
        # 中文字符约等于1-2个token
        # 英文单词约等于1个token
        chinese_chars = sum(1 for c in text if "\u4e00" <= c <= "\u9fff")
        english_words = len(text.split()) - chinese_chars
        return chinese_chars + english_words


@dataclass
class ConversationContext:
    """对话上下文"""

    conversation_id: str
    user_id: str
    title: str = "新对话"
    messages: List[ConversationMessage] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)

    # 上下文摘要
    summary: Optional[str] = None
    key_points: List[str] = field(default_factory=list)
    entities: Dict[str, Any] = field(default_factory=dict)

    def add_message(
        self, role: str, content: str, metadata: Optional[Dict[str, Any]] = None
    ) -> ConversationMessage:
        """添加消息"""
        message = ConversationMessage(
            role=role,
            content=content,
            metadata=metadata or {},
            token_count=ConversationMessage.estimate_tokens(content),
        )
        self.messages.append(message)
        self.updated_at = datetime.now().isoformat()
        return message

    def get_recent_messages(self, count: int = 10) -> List[ConversationMessage]:
        """获取最近的消息"""
        return self.messages[-count:] if self.messages else []

    def get_context_window(self, max_tokens: int = 4000) -> List[ConversationMessage]:
        """获取符合token限制的上下文窗口"""
        total_tokens = 0
        context_messages = []

        # 从最新的消息开始向前取
        for msg in reversed(self.messages):
            if total_tokens + msg.token_count > max_tokens:
                break
            context_messages.insert(0, msg)
            total_tokens += msg.token_count

        return context_messages

    def to_dict(self) -> dict:
        return {
            "conversation_id": self.conversation_id,
            "user_id": self.user_id,
            "title": self.title,
            "messages": [m.to_dict() for m in self.messages],
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "metadata": self.metadata,
            "tags": self.tags,
            "summary": self.summary,
            "key_points": self.key_points,
            "entities": self.entities,
            "message_count": len(self.messages),
            "total_tokens": sum(m.token_count for m in self.messages),
        }


class ConversationContextManager:
    """
    多轮对话上下文管理器

    功能:
    1. 多会话管理
    2. 上下文窗口优化
    3. 对话摘要生成
    4. 实体提取与追踪
    5. 对话历史持久化
    """

    def __init__(self, storage_dir: str = "memory/conversations"):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)

        # 活跃会话
        self.active_conversations: Dict[str, ConversationContext] = {}

        # 用户会话索引
        self.user_sessions: Dict[str, List[str]] = {}

        self._lock = Lock()

    def _generate_conversation_id(self, user_id: str) -> str:
        """生成会话ID"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_hash = hashlib.md5(f"{user_id}_{timestamp}".encode()).hexdigest()[:8]
        return f"conv_{user_id}_{timestamp}_{random_hash}"

    def create_conversation(
        self,
        user_id: str,
        title: str = "新对话",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """创建新会话"""
        with self._lock:
            conversation_id = self._generate_conversation_id(user_id)

            context = ConversationContext(
                conversation_id=conversation_id,
                user_id=user_id,
                title=title,
                metadata=metadata or {},
            )

            self.active_conversations[conversation_id] = context

            # 更新用户会话索引
            if user_id not in self.user_sessions:
                self.user_sessions[user_id] = []
            self.user_sessions[user_id].append(conversation_id)

            return conversation_id

    def get_conversation(self, conversation_id: str) -> Optional[ConversationContext]:
        """获取会话上下文"""
        with self._lock:
            return self.active_conversations.get(conversation_id)

    def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[ConversationMessage]:
        """添加消息到会话"""
        with self._lock:
            context = self.active_conversations.get(conversation_id)
            if not context:
                return None

            return context.add_message(role, content, metadata)

    def get_context_messages(
        self, conversation_id: str, max_tokens: int = 4000, include_summary: bool = True
    ) -> List[Dict[str, Any]]:
        """获取上下文消息（优化后的窗口）"""
        context = self.get_conversation(conversation_id)
        if not context:
            return []

        messages = []

        # 添加摘要（如果启用）
        if include_summary and context.summary:
            messages.append(
                {"role": "system", "content": f"对话摘要: {context.summary}"}
            )

        # 获取上下文窗口
        window_messages = context.get_context_window(max_tokens)
        messages.extend([m.to_dict() for m in window_messages])

        return messages

    def get_user_conversations(
        self, user_id: str, limit: int = 10
    ) -> List[Dict[str, Any]]:
        """获取用户的所有会话"""
        with self._lock:
            conversation_ids = self.user_sessions.get(user_id, [])

            conversations = []
            for conv_id in conversation_ids[-limit:]:
                context = self.active_conversations.get(conv_id)
                if context:
                    conversations.append(
                        {
                            "conversation_id": context.conversation_id,
                            "title": context.title,
                            "message_count": len(context.messages),
                            "created_at": context.created_at,
                            "updated_at": context.updated_at,
                        }
                    )

            return list(reversed(conversations))

    def update_conversation_summary(
        self,
        conversation_id: str,
        summary: str,
        key_points: Optional[List[str]] = None,
        entities: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """更新会话摘要"""
        with self._lock:
            context = self.active_conversations.get(conversation_id)
            if not context:
                return False

            context.summary = summary
            if key_points:
                context.key_points = key_points
            if entities:
                context.entities.update(entities)

            return True

    def search_conversations(
        self, user_id: str, query: str, limit: int = 5
    ) -> List[Dict[str, Any]]:
        """搜索会话（基于内容关键词）"""
        with self._lock:
            conversation_ids = self.user_sessions.get(user_id, [])
            results = []

            for conv_id in conversation_ids:
                context = self.active_conversations.get(conv_id)
                if not context:
                    continue

                # 简单关键词搜索
                query_lower = query.lower()

                # 搜索标题
                if query_lower in context.title.lower():
                    results.append(self._create_search_result(context, "title"))
                    continue

                # 搜索消息内容
                for msg in context.messages[-10:]:  # 只搜索最近10条
                    if query_lower in msg.content.lower():
                        results.append(self._create_search_result(context, "content"))
                        break

                if len(results) >= limit:
                    break

            return results

    def _create_search_result(
        self, context: ConversationContext, match_type: str
    ) -> Dict[str, Any]:
        """创建搜索结果"""
        return {
            "conversation_id": context.conversation_id,
            "title": context.title,
            "match_type": match_type,
            "message_count": len(context.messages),
            "updated_at": context.updated_at,
        }

    def archive_conversation(self, conversation_id: str) -> bool:
        """归档会话"""
        with self._lock:
            context = self.active_conversations.get(conversation_id)
            if not context:
                return False

            # 保存到磁盘
            self._save_conversation(context)

            # 从活跃会话中移除
            del self.active_conversations[conversation_id]

            return True

    def _save_conversation(self, context: ConversationContext):
        """保存会话到磁盘"""
        filepath = os.path.join(self.storage_dir, f"{context.conversation_id}.json")

        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(context.to_dict(), f, ensure_ascii=False, indent=2)

    def load_conversation(self, conversation_id: str) -> bool:
        """从磁盘加载会话"""
        filepath = os.path.join(self.storage_dir, f"{conversation_id}.json")

        if not os.path.exists(filepath):
            return False

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            with self._lock:
                context = ConversationContext(
                    conversation_id=data["conversation_id"],
                    user_id=data["user_id"],
                    title=data.get("title", "新对话"),
                    created_at=data.get("created_at", ""),
                    updated_at=data.get("updated_at", ""),
                    metadata=data.get("metadata", {}),
                    tags=data.get("tags", []),
                    summary=data.get("summary"),
                    key_points=data.get("key_points", []),
                    entities=data.get("entities", {}),
                )

                # 恢复消息
                for msg_data in data.get("messages", []):
                    context.messages.append(
                        ConversationMessage(
                            role=msg_data["role"],
                            content=msg_data["content"],
                            timestamp=msg_data.get("timestamp", ""),
                            metadata=msg_data.get("metadata", {}),
                            token_count=msg_data.get("token_count", 0),
                        )
                    )

                self.active_conversations[conversation_id] = context

            return True
        except Exception as e:
            print(f"Error loading conversation: {e}")
            return False

    def delete_conversation(self, conversation_id: str) -> bool:
        """删除会话"""
        with self._lock:
            if conversation_id in self.active_conversations:
                context = self.active_conversations[conversation_id]
                user_id = context.user_id

                # 从活跃会话中移除
                del self.active_conversations[conversation_id]

                # 从用户索引中移除
                if user_id in self.user_sessions:
                    if conversation_id in self.user_sessions[user_id]:
                        self.user_sessions[user_id].remove(conversation_id)

            # 删除磁盘文件
            filepath = os.path.join(self.storage_dir, f"{conversation_id}.json")
            if os.path.exists(filepath):
                os.remove(filepath)

            return True

    def get_statistics(self) -> Dict[str, Any]:
        """获取统计信息"""
        with self._lock:
            total_messages = sum(
                len(c.messages) for c in self.active_conversations.values()
            )
            total_tokens = sum(
                sum(m.token_count for m in c.messages)
                for c in self.active_conversations.values()
            )

            return {
                "active_conversations": len(self.active_conversations),
                "total_users": len(self.user_sessions),
                "total_messages": total_messages,
                "total_tokens": total_tokens,
                "avg_messages_per_conversation": (
                    total_messages / len(self.active_conversations)
                    if self.active_conversations
                    else 0
                ),
            }


# 全局上下文管理器实例
_global_context_manager: Optional[ConversationContextManager] = None


def get_conversation_manager() -> ConversationContextManager:
    """获取全局对话上下文管理器实例"""
    global _global_context_manager
    if _global_context_manager is None:
        _global_context_manager = ConversationContextManager()
    return _global_context_manager


def create_chat_session(user_id: str, title: str = "新对话") -> str:
    """便捷函数：创建聊天会话"""
    manager = get_conversation_manager()
    return manager.create_conversation(user_id, title)


def add_chat_message(
    conversation_id: str, role: str, content: str
) -> Optional[ConversationMessage]:
    """便捷函数：添加聊天消息"""
    manager = get_conversation_manager()
    return manager.add_message(conversation_id, role, content)


def get_chat_context(conversation_id: str) -> List[Dict[str, Any]]:
    """便捷函数：获取聊天上下文"""
    manager = get_conversation_manager()
    return manager.get_context_messages(conversation_id)
