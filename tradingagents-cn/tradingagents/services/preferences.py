"""
User Preferences Service - 用户偏好持久化服务

支持模型选择、会话历史等用户偏好的存储和检索
"""

import json
import os
from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum


class PreferenceKey(str, Enum):
    """偏好配置键"""
    LLM_PROVIDER = "llm_provider"
    LLM_MODEL = "llm_model"
    THEME = "theme"
    LANGUAGE = "language"
    DEFAULT_DEPTH = "default_depth"
    AUTO_RETRY = "auto_retry"
    NOTIFICATION_ENABLED = "notification_enabled"


class UserPreferencesService:
    """
    用户偏好服务
    
    使用 Redis 存储用户偏好，支持：
    - LLM 模型选择持久化
    - 界面主题
    - 分析参数默认值
    """

    def __init__(self, redis_client=None):
        self.redis = redis_client
        self._memory_store: Dict[str, Dict[str, Any]] = {}

    def _get_key(self, user_id: str, preference_key: str) -> str:
        """生成 Redis 键"""
        return f"user_prefs:{user_id}:{preference_key}"

    def _get_all_key(self, user_id: str) -> str:
        """生成用户所有偏好的键"""
        return f"user_prefs:{user_id}:*"

    def save_preference(
        self,
        user_id: str,
        preference_key: str,
        value: Any,
        ttl: int = 86400 * 30  # 30天过期
    ) -> bool:
        """
        保存用户偏好
        
        Args:
            user_id: 用户ID
            preference_key: 偏好键 (使用 PreferenceKey 枚举)
            value: 偏好值
            ttl: 过期时间(秒)，默认30天
            
        Returns:
            bool: 是否保存成功
        """
        key = self._get_key(user_id, preference_key)
        
        data = {
            "value": value,
            "updated_at": datetime.now().isoformat(),
            "user_id": user_id,
        }
        
        try:
            if self.redis:
                self.redis.setex(key, ttl, json.dumps(data))
            else:
                self._memory_store[key] = data
            return True
        except Exception as e:
            print(f"Failed to save preference: {e}")
            return False

    def get_preference(
        self,
        user_id: str,
        preference_key: str,
        default: Any = None
    ) -> Any:
        """
        获取用户偏好
        
        Args:
            user_id: 用户ID
            preference_key: 偏好键
            default: 默认值
            
        Returns:
            偏好值或默认值
        """
        key = self._get_key(user_id, preference_key)
        
        try:
            if self.redis:
                data = self.redis.get(key)
                if data:
                    return json.loads(data).get("value", default)
            else:
                data = self._memory_store.get(key)
                if data:
                    return data.get("value", default)
        except Exception as e:
            print(f"Failed to get preference: {e}")
        
        return default

    def get_all_preferences(self, user_id: str) -> Dict[str, Any]:
        """
        获取用户所有偏好
        
        Args:
            user_id: 用户ID
            
        Returns:
            所有偏好字典
        """
        preferences = {}
        pattern = f"user_prefs:{user_id}:*"
        
        try:
            if self.redis:
                keys = self.redis.keys(pattern)
                for key in keys:
                    preference_key = key.decode().split(":")[-1]
                    data = self.redis.get(key)
                    if data:
                        preferences[preference_key] = json.loads(data).get("value")
            else:
                for key, data in self._memory_store.items():
                    if key.startswith(f"user_prefs:{user_id}:"):
                        preference_key = key.split(":")[-1]
                        preferences[preference_key] = data.get("value")
        except Exception as e:
            print(f"Failed to get all preferences: {e}")
        
        return preferences

    def delete_preference(self, user_id: str, preference_key: str) -> bool:
        """删除用户偏好"""
        key = self._get_key(user_id, preference_key)
        
        try:
            if self.redis:
                self.redis.delete(key)
            else:
                self._memory_store.pop(key, None)
            return True
        except Exception:
            return False

    def save_model_selection(
        self,
        user_id: str,
        provider: str,
        model: str,
        depth: int = 3
    ) -> bool:
        """保存用户模型选择"""
        success = True
        success &= self.save_preference(user_id, PreferenceKey.LLM_PROVIDER.value, provider)
        success &= self.save_preference(user_id, PreferenceKey.LLM_MODEL.value, model)
        success &= self.save_preference(user_id, PreferenceKey.DEFAULT_DEPTH.value, depth)
        return success

    def get_model_selection(self, user_id: str) -> Dict[str, Any]:
        """获取用户模型选择"""
        return {
            "provider": self.get_preference(user_id, PreferenceKey.LLM_PROVIDER.value, "deepseek"),
            "model": self.get_preference(user_id, PreferenceKey.LLM_MODEL.value, "deepseek-chat"),
            "depth": self.get_preference(user_id, PreferenceKey.DEFAULT_DEPTH.value, 3),
        }


class SessionHistoryService:
    """
    会话历史服务
    
    管理用户的分析历史记录
    """

    def __init__(self, redis_client=None, max_history: int = 100):
        self.redis = redis_client
        self.max_history = max_history
        self._memory_store: Dict[str, List[Dict]] = {}

    def _get_key(self, user_id: str) -> str:
        return f"session_history:{user_id}"

    def add_session(
        self,
        user_id: str,
        task_id: str,
        company: str,
        result_summary: str,
        status: str = "completed"
    ) -> bool:
        """
        添加会话记录
        
        Args:
            user_id: 用户ID
            task_id: 任务ID
            company: 股票代码
            result_summary: 结果摘要
            status: 状态 (completed/failed/running)
            
        Returns:
            bool: 是否添加成功
        """
        session = {
            "task_id": task_id,
            "company": company,
            "result_summary": result_summary,
            "status": status,
            "created_at": datetime.now().isoformat(),
        }
        
        key = self._get_key(user_id)
        
        try:
            if self.redis:
                self.redis.lpush(key, json.dumps(session))
                self.redis.ltrim(key, 0, self.max_history - 1)
            else:
                if user_id not in self._memory_store:
                    self._memory_store[user_id] = []
                self._memory_store[user_id].insert(0, session)
                self._memory_store[user_id] = self._memory_store[user_id][:self.max_history]
            return True
        except Exception:
            return False

    def get_history(
        self,
        user_id: str,
        limit: int = 20,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        获取会话历史
        
        Args:
            user_id: 用户ID
            limit: 返回数量
            offset: 偏移量
            
        Returns:
            会话历史列表
        """
        key = self._get_key(user_id)
        
        try:
            if self.redis:
                sessions = self.redis.lrange(key, offset, offset + limit - 1)
                return [json.loads(s) for s in sessions]
            else:
                return self._memory_store.get(user_id, [])[offset:offset + limit]
        except Exception:
            return []

    def clear_history(self, user_id: str) -> bool:
        """清空用户历史"""
        key = self._get_key(user_id)
        
        try:
            if self.redis:
                self.redis.delete(key)
            else:
                self._memory_store.pop(user_id, None)
            return True
        except Exception:
            return False


preferences_service = UserPreferencesService()
history_service = SessionHistoryService()
