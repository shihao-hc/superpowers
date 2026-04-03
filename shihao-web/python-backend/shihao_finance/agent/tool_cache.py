"""
Tool Call Cache System
工具调用缓存系统 - 缓存工具调用结果，提高响应速度
支持内存缓存和 Redis 分布式缓存
"""

import json
import time
import hashlib
import pickle
import redis
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass, field
from threading import Lock
import os
from functools import wraps
from pathlib import Path


@dataclass
class CacheEntry:
    """缓存条目"""

    key: str
    value: Any
    created_at: float
    accessed_at: float
    access_count: int = 0
    ttl: Optional[float] = None  # 生存时间（秒）
    tool_name: str = ""
    parameters: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_expired(self) -> bool:
        """检查是否过期"""
        if self.ttl is None:
            return False
        return time.time() - self.created_at > self.ttl

    def touch(self):
        """更新访问时间"""
        self.accessed_at = time.time()
        self.access_count += 1


class ToolCallCache:
    """
    工具调用缓存系统

    功能:
    1. 缓存工具调用结果
    2. 支持TTL过期机制
    3. LRU淘汰策略
    4. 持久化存储 (磁盘 + Redis)
    5. 缓存统计
    6. Redis 分布式缓存支持
    """

    def __init__(
        self,
        max_size: int = 1000,
        default_ttl: float = 300,  # 默认5分钟
        cache_dir: str = "cache/tools",
        enable_persistence: bool = True,
        redis_host: str = "localhost",
        redis_port: int = 6379,
        redis_db: int = 0,
        redis_enabled: bool = False,
    ):
        self.max_size = max_size
        self.default_ttl = default_ttl
        self.cache_dir = cache_dir
        self.enable_persistence = enable_persistence
        self.redis_enabled = redis_enabled

        # 内存缓存
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = Lock()

        # Redis 客户端
        self._redis_client: Optional[redis.Redis] = None
        if redis_enabled:
            try:
                self._redis_client = redis.Redis(
                    host=redis_host,
                    port=redis_port,
                    db=redis_db,
                    decode_responses=False,
                    socket_connect_timeout=2,
                )
                self._redis_client.ping()
            except Exception:
                self._redis_client = None
                self.redis_enabled = False

        # 统计信息
        self.stats = {
            "hits": 0,
            "misses": 0,
            "evictions": 0,
            "expirations": 0,
            "total_calls": 0,
            "redis_hits": 0,
        }

        # 确保缓存目录存在
        if enable_persistence:
            os.makedirs(cache_dir, exist_ok=True)

    def _generate_key(self, tool_name: str, parameters: Dict[str, Any]) -> str:
        """生成缓存键"""
        # 将参数序列化为JSON字符串
        param_str = json.dumps(parameters, sort_keys=True, ensure_ascii=False)
        # 使用MD5生成唯一键
        key_input = f"{tool_name}:{param_str}"
        return hashlib.md5(key_input.encode()).hexdigest()

    def get(self, tool_name: str, parameters: Dict[str, Any]) -> Optional[Any]:
        """获取缓存值"""
        key = self._generate_key(tool_name, parameters)

        with self._lock:
            self.stats["total_calls"] += 1

            # 优先从内存缓存获取
            if key in self._cache:
                entry = self._cache[key]
                if entry.is_expired:
                    del self._cache[key]
                    self.stats["expirations"] += 1
                else:
                    entry.touch()
                    self.stats["hits"] += 1
                    return entry.value

            # 尝试从 Redis 获取
            if self._redis_client and self.redis_enabled:
                try:
                    redis_key = f"tool_cache:{key}"
                    cached_data = self._redis_client.get(redis_key)
                    if cached_data:
                        entry = pickle.loads(cached_data)
                        if not entry.is_expired:
                            # 同步到内存缓存
                            self._cache[key] = entry
                            self.stats["redis_hits"] += 1
                            self.stats["hits"] += 1
                            return entry.value
                except Exception:
                    pass

            self.stats["misses"] += 1
            return None

    def set(
        self,
        tool_name: str,
        parameters: Dict[str, Any],
        value: Any,
        ttl: Optional[float] = None,
    ) -> str:
        """设置缓存值"""
        key = self._generate_key(tool_name, parameters)

        with self._lock:
            # 检查是否需要淘汰
            if len(self._cache) >= self.max_size:
                self._evict_one()

            entry = CacheEntry(
                key=key,
                value=value,
                created_at=time.time(),
                accessed_at=time.time(),
                ttl=ttl or self.default_ttl,
                tool_name=tool_name,
                parameters=parameters,
            )

            self._cache[key] = entry

            # 同步到 Redis
            if self._redis_client and self.redis_enabled:
                try:
                    redis_key = f"tool_cache:{key}"
                    ttl_seconds = int(ttl or self.default_ttl)
                    self._redis_client.setex(
                        redis_key, ttl_seconds, pickle.dumps(entry)
                    )
                except Exception:
                    pass

            return key

    def _evict_one(self):
        """淘汰一个缓存条目（LRU策略）"""
        if not self._cache:
            return

        # 找到最近最少使用的条目
        lru_key = min(self._cache.keys(), key=lambda k: self._cache[k].accessed_at)

        del self._cache[lru_key]
        self.stats["evictions"] += 1

    def invalidate(self, tool_name: str, parameters: Optional[Dict[str, Any]] = None):
        """使缓存失效"""
        with self._lock:
            if parameters is not None:
                # 精确删除
                key = self._generate_key(tool_name, parameters)
                if key in self._cache:
                    del self._cache[key]
                # 删除 Redis
                if self._redis_client and self.redis_enabled:
                    try:
                        self._redis_client.delete(f"tool_cache:{key}")
                    except Exception:
                        pass
            else:
                # 删除该工具的所有缓存
                keys_to_delete = [
                    k for k, v in self._cache.items() if v.tool_name == tool_name
                ]
                for key in keys_to_delete:
                    del self._cache[key]
                # 删除 Redis 中该工具的所有缓存
                if self._redis_client and self.redis_enabled:
                    try:
                        pattern = f"tool_cache:*:{tool_name}:*"
                        keys = self._redis_client.keys(pattern)
                        if keys:
                            self._redis_client.delete(*keys)
                    except Exception:
                        pass

    def clear(self):
        """清空所有缓存"""
        with self._lock:
            self._cache.clear()
        # 清空 Redis
        if self._redis_client and self.redis_enabled:
            try:
                pattern = "tool_cache:*"
                keys = self._redis_client.keys(pattern)
                if keys:
                    self._redis_client.delete(*keys)
            except Exception:
                pass

    def cleanup_expired(self) -> int:
        """清理过期缓存"""
        expired_keys = []

        with self._lock:
            for key, entry in self._cache.items():
                if entry.is_expired:
                    expired_keys.append(key)

            for key in expired_keys:
                del self._cache[key]
                self.stats["expirations"] += 1

        return len(expired_keys)

    def get_stats(self) -> Dict[str, Any]:
        """获取缓存统计"""
        with self._lock:
            total = self.stats["hits"] + self.stats["misses"]
            hit_rate = (self.stats["hits"] / total * 100) if total > 0 else 0

            return {
                "cache_size": len(self._cache),
                "max_size": self.max_size,
                "hits": self.stats["hits"],
                "misses": self.stats["misses"],
                "hit_rate": round(hit_rate, 2),
                "evictions": self.stats["evictions"],
                "expirations": self.stats["expirations"],
                "total_calls": self.stats["total_calls"],
                "redis_enabled": self.redis_enabled,
                "redis_hits": self.stats.get("redis_hits", 0),
            }

    def save_to_disk(self, filename: Optional[str] = None) -> str:
        """保存缓存到磁盘"""
        if not self.enable_persistence:
            return ""

        if filename is None:
            filename = f"cache_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pkl"

        filepath = os.path.join(self.cache_dir, filename)

        with self._lock:
            # 过滤掉过期的条目
            valid_entries = {k: v for k, v in self._cache.items() if not v.is_expired}

            with open(filepath, "wb") as f:
                pickle.dump(valid_entries, f)

        return filepath

    def load_from_disk(self, filename: str) -> bool:
        """从磁盘加载缓存"""
        if not self.enable_persistence:
            return False

        filepath = os.path.join(self.cache_dir, filename)

        if not os.path.exists(filepath):
            return False

        try:
            with open(filepath, "rb") as f:
                entries = pickle.load(f)

            with self._lock:
                # 只加载未过期的条目
                for key, entry in entries.items():
                    if not entry.is_expired:
                        self._cache[key] = entry

            return True
        except Exception:
            return False


# 全局缓存实例
_global_cache: Optional[ToolCallCache] = None


def get_tool_cache() -> ToolCallCache:
    """获取全局工具缓存实例"""
    global _global_cache
    if _global_cache is None:
        _global_cache = ToolCallCache()
    return _global_cache


def cached_tool(
    ttl: Optional[float] = None, cache_instance: Optional[ToolCallCache] = None
):
    """
    工具缓存装饰器

    使用方法:
    @cached_tool(ttl=60)
    def my_tool(param1, param2):
        # 工具逻辑
        return result
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            # 获取缓存实例
            cache = cache_instance or get_tool_cache()

            # 构建参数字典
            import inspect

            sig = inspect.signature(func)
            bound_args = sig.bind(*args, **kwargs)
            bound_args.apply_defaults()
            parameters = dict(bound_args.arguments)

            tool_name = func.__name__

            # 尝试从缓存获取
            cached_value = cache.get(tool_name, parameters)
            if cached_value is not None:
                return cached_value

            # 调用实际函数
            result = func(*args, **kwargs)

            # 存入缓存
            cache.set(tool_name, parameters, result, ttl)

            return result

        # 添加缓存管理方法
        wrapper.invalidate_cache = lambda **params: cache.invalidate(
            func.__name__, params or None
        )
        wrapper.clear_cache = lambda: cache.invalidate(func.__name__)

        return wrapper

    return decorator


def cached_tool_with_fallback(
    ttl: Optional[float] = None,
    cache_instance: Optional[ToolCallCache] = None,
    fallback_value: Any = None,
):
    """
    带降级的工具缓存装饰器

    当缓存未命中且工具调用失败时，返回降级值
    """

    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs):
            cache = cache_instance or get_tool_cache()

            import inspect

            sig = inspect.signature(func)
            bound_args = sig.bind(*args, **kwargs)
            bound_args.apply_defaults()
            parameters = dict(bound_args.arguments)

            tool_name = func.__name__

            # 尝试从缓存获取
            cached_value = cache.get(tool_name, parameters)
            if cached_value is not None:
                return cached_value

            try:
                # 调用实际函数
                result = func(*args, **kwargs)

                # 存入缓存
                cache.set(tool_name, parameters, result, ttl)

                return result
            except Exception:
                # 返回降级值
                return fallback_value

        return wrapper

    return decorator
