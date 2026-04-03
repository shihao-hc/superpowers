"""
User Feedback Learning System
用户反馈学习机制 - 从用户反馈中学习并优化系统
"""

import json
import os
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from threading import Lock
from enum import Enum
import statistics


class FeedbackType(Enum):
    """反馈类型"""

    RATING = "rating"  # 评分
    CORRECTION = "correction"  # 纠正
    SUGGESTION = "suggestion"  # 建议
    COMPLAINT = "complaint"  # 投诉
    PRAISE = "praise"  # 表扬
    PREFERENCE = "preference"  # 偏好


class FeedbackSentiment(Enum):
    """反馈情感"""

    POSITIVE = "positive"
    NEGATIVE = "negative"
    NEUTRAL = "neutral"


@dataclass
class UserFeedback:
    """用户反馈"""

    feedback_id: str
    user_id: str
    feedback_type: str
    content: str
    rating: Optional[int] = None  # 1-5
    target_type: str = ""  # agent/tool/response
    target_id: str = ""
    conversation_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    sentiment: str = FeedbackSentiment.NEUTRAL.value
    processed: bool = False
    learning_applied: bool = False

    def to_dict(self) -> dict:
        return {
            "feedback_id": self.feedback_id,
            "user_id": self.user_id,
            "feedback_type": self.feedback_type,
            "content": self.content,
            "rating": self.rating,
            "target_type": self.target_type,
            "target_id": self.target_id,
            "conversation_id": self.conversation_id,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "sentiment": self.sentiment,
            "processed": self.processed,
            "learning_applied": self.learning_applied,
        }


@dataclass
class LearningPattern:
    """学习模式"""

    pattern_id: str
    pattern_type: str
    description: str
    trigger_conditions: Dict[str, Any]
    suggested_action: Dict[str, Any]
    confidence: float = 0.5
    occurrences: int = 0
    last_applied: Optional[str] = None
    effectiveness: float = 0.0  # 0-1

    def to_dict(self) -> dict:
        return {
            "pattern_id": self.pattern_id,
            "pattern_type": self.pattern_type,
            "description": self.description,
            "trigger_conditions": self.trigger_conditions,
            "suggested_action": self.suggested_action,
            "confidence": self.confidence,
            "occurrences": self.occurrences,
            "last_applied": self.last_applied,
            "effectiveness": self.effectiveness,
        }


class FeedbackLearningSystem:
    """
    用户反馈学习系统

    功能:
    1. 收集和存储用户反馈
    2. 分析反馈模式
    3. 提取学习规律
    4. 生成改进建议
    5. 追踪学习效果
    """

    def __init__(self, storage_dir: str = "memory/feedback"):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)

        # 反馈存储
        self.feedbacks: Dict[str, UserFeedback] = {}

        # 学习模式
        self.learning_patterns: Dict[str, LearningPattern] = {}

        # 用户偏好缓存
        self.user_preferences: Dict[str, Dict[str, Any]] = {}

        self._lock = Lock()

    def _generate_id(self, prefix: str) -> str:
        """生成唯一ID"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        import hashlib

        random_hash = hashlib.md5(f"{prefix}_{timestamp}".encode()).hexdigest()[:8]
        return f"{prefix}_{timestamp}_{random_hash}"

    def _analyze_sentiment(self, content: str) -> str:
        """分析反馈情感（简化版）"""
        positive_words = [
            "好",
            "棒",
            "感谢",
            "满意",
            "喜欢",
            "优秀",
            "great",
            "good",
            "thanks",
            "like",
        ]
        negative_words = [
            "差",
            "不好",
            "失望",
            "问题",
            "错误",
            "垃圾",
            "bad",
            "wrong",
            "error",
            "hate",
        ]

        content_lower = content.lower()

        pos_count = sum(1 for word in positive_words if word in content_lower)
        neg_count = sum(1 for word in negative_words if word in content_lower)

        if pos_count > neg_count:
            return FeedbackSentiment.POSITIVE.value
        elif neg_count > pos_count:
            return FeedbackSentiment.NEGATIVE.value
        return FeedbackSentiment.NEUTRAL.value

    def add_feedback(
        self,
        user_id: str,
        content: str,
        feedback_type: FeedbackType,
        rating: Optional[int] = None,
        target_type: str = "",
        target_id: str = "",
        conversation_id: str = "",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """添加用户反馈"""
        with self._lock:
            feedback_id = self._generate_id("feedback")

            # 分析情感
            sentiment = self._analyze_sentiment(content)

            feedback = UserFeedback(
                feedback_id=feedback_id,
                user_id=user_id,
                feedback_type=feedback_type.value,
                content=content,
                rating=rating,
                target_type=target_type,
                target_id=target_id,
                conversation_id=conversation_id,
                metadata=metadata or {},
                sentiment=sentiment,
            )

            self.feedbacks[feedback_id] = feedback

            # 更新用户偏好
            self._update_user_preferences(user_id, feedback)

            return feedback_id

    def _update_user_preferences(self, user_id: str, feedback: UserFeedback):
        """更新用户偏好"""
        if user_id not in self.user_preferences:
            self.user_preferences[user_id] = {
                "total_feedbacks": 0,
                "avg_rating": 0,
                "ratings": [],
                "sentiment_history": [],
                "preferred_topics": {},
                "disliked_topics": {},
            }

        prefs = self.user_preferences[user_id]
        prefs["total_feedbacks"] += 1

        # 更新评分
        if feedback.rating:
            prefs["ratings"].append(feedback.rating)
            prefs["avg_rating"] = statistics.mean(prefs["ratings"])

        # 更新情感历史
        prefs["sentiment_history"].append(feedback.sentiment)
        if len(prefs["sentiment_history"]) > 100:
            prefs["sentiment_history"] = prefs["sentiment_history"][-100:]

        # 更新话题偏好
        if feedback.target_type and feedback.sentiment:
            topics = (
                prefs["preferred_topics"]
                if feedback.sentiment == FeedbackSentiment.POSITIVE.value
                else prefs["disliked_topics"]
            )
            topics[feedback.target_type] = topics.get(feedback.target_type, 0) + 1

    def get_user_preferences(self, user_id: str) -> Dict[str, Any]:
        """获取用户偏好"""
        with self._lock:
            return self.user_preferences.get(user_id, {})

    def get_feedbacks(
        self,
        user_id: Optional[str] = None,
        feedback_type: Optional[FeedbackType] = None,
        sentiment: Optional[FeedbackSentiment] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """获取反馈列表"""
        with self._lock:
            results = []

            for feedback in self.feedbacks.values():
                # 过滤条件
                if user_id and feedback.user_id != user_id:
                    continue
                if feedback_type and feedback.feedback_type != feedback_type.value:
                    continue
                if sentiment and feedback.sentiment != sentiment.value:
                    continue

                results.append(feedback.to_dict())

            # 按时间排序
            results.sort(key=lambda x: x["created_at"], reverse=True)

            return results[:limit]

    def analyze_patterns(self) -> List[LearningPattern]:
        """分析反馈模式"""
        with self._lock:
            patterns = []

            # 按目标类型分组
            target_groups = {}
            for feedback in self.feedbacks.values():
                key = f"{feedback.target_type}_{feedback.sentiment}"
                if key not in target_groups:
                    target_groups[key] = []
                target_groups[key].append(feedback)

            # 创建模式
            for key, feedbacks in target_groups.items():
                if len(feedbacks) >= 3:  # 至少3个反馈才形成模式
                    target_type, sentiment = key.split("_", 1)

                    pattern_id = self._generate_id("pattern")

                    # 提取常见内容关键词
                    common_content = self._extract_common_content(feedbacks)

                    pattern = LearningPattern(
                        pattern_id=pattern_id,
                        pattern_type="feedback_pattern",
                        description=f"用户对{target_type}的{sentiment}反馈模式",
                        trigger_conditions={
                            "target_type": target_type,
                            "sentiment": sentiment,
                            "min_occurrences": 3,
                        },
                        suggested_action={
                            "action": "review_and_improve"
                            if sentiment == "negative"
                            else "maintain",
                            "target": target_type,
                            "common_issues": common_content[:5],
                        },
                        confidence=min(len(feedbacks) / 10, 1.0),
                        occurrences=len(feedbacks),
                    )

                    patterns.append(pattern)
                    self.learning_patterns[pattern_id] = pattern

            return patterns

    def _extract_common_content(self, feedbacks: List[UserFeedback]) -> List[str]:
        """提取常见内容"""
        # 简化版：提取高频词
        word_counts = {}
        for feedback in feedbacks:
            words = feedback.content.split()
            for word in words:
                if len(word) > 1:  # 忽略单字符
                    word_counts[word] = word_counts.get(word, 0) + 1

        # 按频率排序
        sorted_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        return [word for word, count in sorted_words[:10]]

    def generate_improvement_suggestions(self) -> List[Dict[str, Any]]:
        """生成改进建议"""
        suggestions = []

        # 分析负面反馈
        negative_feedbacks = [
            f
            for f in self.feedbacks.values()
            if f.sentiment == FeedbackSentiment.NEGATIVE.value
        ]

        if negative_feedbacks:
            # 按目标类型分组
            target_issues = {}
            for feedback in negative_feedbacks:
                target = feedback.target_type or "general"
                if target not in target_issues:
                    target_issues[target] = []
                target_issues[target].append(feedback.content)

            for target, issues in target_issues.items():
                if len(issues) >= 2:  # 至少2个问题才生成建议
                    suggestions.append(
                        {
                            "type": "improvement",
                            "target": target,
                            "priority": "high" if len(issues) >= 5 else "medium",
                            "description": f"需要改进{target}，共有{len(issues)}个负面反馈",
                            "sample_issues": issues[:3],
                            "suggested_action": f"审查{target}的实现，解决用户反馈的问题",
                        }
                    )

        # 分析评分趋势
        rating_feedbacks = [f for f in self.feedbacks.values() if f.rating]
        if len(rating_feedbacks) >= 10:
            recent_ratings = [f.rating for f in rating_feedbacks[-10:]]
            avg_rating = statistics.mean(recent_ratings)

            if avg_rating < 3.5:
                suggestions.append(
                    {
                        "type": "alert",
                        "target": "overall",
                        "priority": "high",
                        "description": f"近期平均评分较低: {avg_rating:.2f}",
                        "suggested_action": "全面审查系统响应质量",
                    }
                )

        return suggestions

    def get_learning_statistics(self) -> Dict[str, Any]:
        """获取学习统计"""
        with self._lock:
            total_feedbacks = len(self.feedbacks)

            # 情感分布
            sentiment_dist = {}
            for feedback in self.feedbacks.values():
                sentiment_dist[feedback.sentiment] = (
                    sentiment_dist.get(feedback.sentiment, 0) + 1
                )

            # 评分统计
            ratings = [f.rating for f in self.feedbacks.values() if f.rating]
            avg_rating = statistics.mean(ratings) if ratings else 0

            # 处理状态
            processed_count = sum(1 for f in self.feedbacks.values() if f.processed)

            return {
                "total_feedbacks": total_feedbacks,
                "sentiment_distribution": sentiment_dist,
                "avg_rating": round(avg_rating, 2),
                "total_ratings": len(ratings),
                "processed_count": processed_count,
                "processing_rate": (processed_count / total_feedbacks * 100)
                if total_feedbacks
                else 0,
                "total_patterns": len(self.learning_patterns),
                "total_users": len(self.user_preferences),
            }

    def mark_as_processed(
        self, feedback_id: str, learning_applied: bool = False
    ) -> bool:
        """标记反馈为已处理"""
        with self._lock:
            if feedback_id not in self.feedbacks:
                return False

            self.feedbacks[feedback_id].processed = True
            self.feedbacks[feedback_id].learning_applied = learning_applied

            return True

    def save(self, filename: Optional[str] = None) -> str:
        """保存反馈数据"""
        if filename is None:
            filename = f"feedback_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        filepath = os.path.join(self.storage_dir, filename)

        with self._lock:
            data = {
                "feedbacks": {k: v.to_dict() for k, v in self.feedbacks.items()},
                "learning_patterns": {
                    k: v.to_dict() for k, v in self.learning_patterns.items()
                },
                "user_preferences": self.user_preferences,
            }

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        return filepath

    def load(self, filename: str) -> bool:
        """加载反馈数据"""
        filepath = os.path.join(self.storage_dir, filename)

        if not os.path.exists(filepath):
            return False

        try:
            with open(filepath, "r", encoding="utf-8") as f:
                data = json.load(f)

            with self._lock:
                # 恢复反馈
                for k, v in data.get("feedbacks", {}).items():
                    self.feedbacks[k] = UserFeedback(**v)

                # 恢复学习模式
                for k, v in data.get("learning_patterns", {}).items():
                    self.learning_patterns[k] = LearningPattern(**v)

                # 恢复用户偏好
                self.user_preferences = data.get("user_preferences", {})

            return True
        except Exception as e:
            print(f"Error loading feedback: {e}")
            return False


# 全局反馈学习系统实例
_global_feedback_system: Optional[FeedbackLearningSystem] = None


def get_feedback_system() -> FeedbackLearningSystem:
    """获取全局反馈学习系统实例"""
    global _global_feedback_system
    if _global_feedback_system is None:
        _global_feedback_system = FeedbackLearningSystem()
    return _global_feedback_system


def submit_feedback(
    user_id: str,
    content: str,
    feedback_type: FeedbackType = FeedbackType.SUGGESTION,
    rating: Optional[int] = None,
    target_type: str = "",
    target_id: str = "",
) -> str:
    """便捷函数：提交用户反馈"""
    system = get_feedback_system()
    return system.add_feedback(
        user_id=user_id,
        content=content,
        feedback_type=feedback_type,
        rating=rating,
        target_type=target_type,
        target_id=target_id,
    )
