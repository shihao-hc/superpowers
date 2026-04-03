"""
TradingAgents-CN Multi-Level Cache
L1: Memory cache (LRU)
L2: Redis cache
L3: File cache
"""

import hashlib
import json
import os
import time
from typing import Any, Optional, Dict
from collections import OrderedDict
import threading


class MemoryCache:
    """L1: 内存缓存 (LRU)"""

    def __init__(self, max_size: int = 1000, ttl: int = 3600):
        self.cache: OrderedDict = OrderedDict()
        self.timestamps: Dict[str, float] = {}
        self.max_size = max_size
        self.ttl = ttl
        self.lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self.lock:
            if key in self.cache:
                if time.time() - self.timestamps[key] < self.ttl:
                    self.cache.move_to_end(key)
                    return self.cache[key]
                else:
                    del self.cache[key]
                    del self.timestamps[key]
            return None

    def set(self, key: str, value: Any) -> None:
        with self.lock:
            if key in self.cache:
                self.cache.move_to_end(key)
            else:
                if len(self.cache) >= self.max_size:
                    oldest = next(iter(self.cache))
                    del self.cache[oldest]
                    del self.timestamps[oldest]
            self.cache[key] = value
            self.timestamps[key] = time.time()

    def delete(self, key: str) -> None:
        with self.lock:
            if key in self.cache:
                del self.cache[key]
                del self.timestamps[key]

    def clear(self) -> None:
        with self.lock:
            self.cache.clear()
            self.timestamps.clear()


class FileCache:
    """L3: 文件缓存"""

    def __init__(self, cache_dir: str = ".cache", ttl: int = 86400):
        self.cache_dir = cache_dir
        self.ttl = ttl
        os.makedirs(cache_dir, exist_ok=True)

    def _get_path(self, key: str) -> str:
        hash_key = hashlib.sha256(key.encode()).hexdigest()[:32]
        return os.path.join(self.cache_dir, f"{hash_key}.json")

    def get(self, key: str) -> Optional[Any]:
        path = self._get_path(key)
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if time.time() - data["timestamp"] < self.ttl:
                    return data["value"]
                else:
                    os.remove(path)
            except (json.JSONDecodeError, KeyError):
                pass
        return None

    def set(self, key: str, value: Any) -> None:
        path = self._get_path(key)
        data = {
            "value": value,
            "timestamp": time.time(),
        }
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except (IOError, TypeError):
            pass

    def delete(self, key: str) -> None:
        path = self._get_path(key)
        if os.path.exists(path):
            os.remove(path)

    def clear(self) -> None:
        for filename in os.listdir(self.cache_dir):
            if filename.endswith(".json"):
                os.remove(os.path.join(self.cache_dir, filename))


class MultiLevelCache:
    """
    多级缓存系统
    L1 -> L2 -> L3
    """

    def __init__(
        self,
        memory_cache: Optional[MemoryCache] = None,
        file_cache: Optional[FileCache] = None,
        redis_client: Optional[Any] = None,
        enable_redis: bool = False
    ):
        self.memory_cache = memory_cache or MemoryCache()
        self.file_cache = file_cache or FileCache()
        self.redis_client = redis_client
        self.enable_redis = enable_redis and redis_client is not None

    def get(self, key: str) -> Optional[Any]:
        if self.enable_redis:
            try:
                value = self.redis_client.get(key)
                if value:
                    return json.loads(value)
            except Exception:
                pass

        value = self.memory_cache.get(key)
        if value is not None:
            return value

        value = self.file_cache.get(key)
        if value is not None:
            self.memory_cache.set(key, value)
            return value

        return None

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        self.memory_cache.set(key, value)

        if self.enable_redis:
            try:
                import redis
                self.redis_client.setex(
                    key,
                    ttl or 3600,
                    json.dumps(value, ensure_ascii=False)
                )
            except Exception:
                pass

        self.file_cache.set(key, value)

    def delete(self, key: str) -> None:
        self.memory_cache.delete(key)
        self.file_cache.delete(key)
        if self.enable_redis:
            try:
                self.redis_client.delete(key)
            except Exception:
                pass

    def clear(self) -> None:
        self.memory_cache.clear()
        self.file_cache.clear()
        if self.enable_redis:
            try:
                self.redis_client.flushdb()
            except Exception:
                pass

    def generate_key(self, *args, **kwargs) -> str:
        data = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True)
        return hashlib.sha256(data.encode()).hexdigest()[:32]


class CacheManager:
    """
    缓存管理器
    提供便捷的缓存装饰器和上下文管理器
    """

    def __init__(self, cache: Optional[MultiLevelCache] = None):
        self.cache = cache or MultiLevelCache()

    def cached(self, key_prefix: str = "", ttl: int = 3600):
        def decorator(func):
            async def async_wrapper(*args, **kwargs):
                cache_key = f"{key_prefix}:{func.__name__}:{self.cache.generate_key(*args, **kwargs)}"
                cached_value = self.cache.get(cache_key)
                if cached_value is not None:
                    return cached_value
                result = await func(*args, **kwargs)
                self.cache.set(cache_key, result, ttl)
                return result

            def sync_wrapper(*args, **kwargs):
                cache_key = f"{key_prefix}:{func.__name__}:{self.cache.generate_key(*args, **kwargs)}"
                cached_value = self.cache.get(cache_key)
                if cached_value is not None:
                    return cached_value
                result = func(*args, **kwargs)
                self.cache.set(cache_key, result, ttl)
                return result

            import asyncio
            if asyncio.iscoroutinefunction(func):
                return async_wrapper
            return sync_wrapper

        return decorator

    def clear_all(self) -> None:
        self.cache.clear()
