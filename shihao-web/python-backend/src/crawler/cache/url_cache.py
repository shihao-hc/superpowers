"""URL content cache with Redis backend."""

import hashlib
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, Any, AsyncIterator

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """Cache entry metadata."""

    url: str
    content: str
    strategy: str
    created_at: float
    expires_at: float
    size: int
    hit_count: int = 0
    last_accessed: Optional[float] = None
    metadata: dict = field(default_factory=dict)

    def is_expired(self, current_time: Optional[float] = None) -> bool:
        """Check if entry is expired."""
        current_time = current_time or time.time()
        return current_time > self.expires_at

    def touch(self):
        """Update last accessed time."""
        self.last_accessed = time.time()
        self.hit_count += 1


class URLCache:
    """URL content cache with TTL and size limits.

    Features:
    - TTL-based expiration
    - LRU eviction
    - Size limits
    - Statistics tracking
    """

    DEFAULT_TTL = 3600
    MAX_ENTRY_SIZE = 10 * 1024 * 1024
    CLEANUP_INTERVAL = 300

    def __init__(
        self,
        redis_url: Optional[str] = None,
        ttl: int = DEFAULT_TTL,
        max_size: int = 1000,
        max_memory_mb: int = 512,
    ):
        self.redis_url = redis_url
        self.ttl = ttl
        self.max_size = max_size
        self.max_memory = max_memory_mb * 1024 * 1024
        self._memory_used = 0
        self._redis = None
        self._local_cache: dict[str, CacheEntry] = {}
        self._last_cleanup = time.time()
        self._stats = {
            "hits": 0,
            "misses": 0,
            "evictions": 0,
            "errors": 0,
        }

    async def _get_redis(self):
        """Get Redis connection."""
        if self._redis is None and self.redis_url:
            try:
                import aioredis

                self._redis = await aioredis.create_redis_pool(self.redis_url)
            except ImportError:
                logger.warning("aioredis not installed, using local cache")
        return self._redis

    def _make_key(self, url: str, strategy: str = "") -> str:
        """Generate cache key from URL."""
        url_hash = hashlib.sha256(url.encode()).hexdigest()[:32]
        return f"crawl_cache:{url_hash}:{strategy}"

    async def get(self, url: str, strategy: str = "") -> Optional[str]:
        """Get cached content for URL.

        Args:
            url: Target URL
            strategy: Crawling strategy

        Returns:
            Cached content or None if not found
        """
        key = self._make_key(url, strategy)

        try:
            redis = await self._get_redis()
            if redis:
                data = await redis.get(key)
                if data:
                    entry = json.loads(data)
                    if not self._is_expired(entry):
                        entry["hit_count"] += 1
                        entry["last_accessed"] = time.time()
                        await redis.setex(key, self.ttl, json.dumps(entry))
                        self._stats["hits"] += 1
                        return entry.get("content")

            elif key in self._local_cache:
                entry = self._local_cache[key]
                if not entry.is_expired():
                    entry.touch()
                    self._stats["hits"] += 1
                    return entry.content

        except Exception as e:
            logger.error(f"Cache get error: {e}")
            self._stats["errors"] += 1

        self._stats["misses"] += 1
        return None

    async def set(
        self,
        url: str,
        content: str,
        strategy: str = "",
        ttl: Optional[int] = None,
        metadata: Optional[dict] = None,
    ) -> bool:
        """Cache content for URL.

        Args:
            url: Target URL
            content: Content to cache
            strategy: Crawling strategy
            ttl: TTL in seconds
            metadata: Additional metadata

        Returns:
            True if cached successfully
        """
        if len(content) > self.MAX_ENTRY_SIZE:
            logger.warning(f"Content too large to cache: {len(content)} bytes")
            return False

        key = self._make_key(url, strategy)
        ttl = ttl or self.ttl
        current_time = time.time()

        entry = CacheEntry(
            url=url,
            content=content,
            strategy=strategy,
            created_at=current_time,
            expires_at=current_time + ttl,
            size=len(content),
            metadata=metadata or {},
        )

        try:
            redis = await self._get_redis()
            if redis:
                await redis.setex(
                    key,
                    ttl,
                    json.dumps(
                        {
                            "url": entry.url,
                            "content": entry.content,
                            "strategy": entry.strategy,
                            "created_at": entry.created_at,
                            "expires_at": entry.expires_at,
                            "size": entry.size,
                            "hit_count": entry.hit_count,
                            "metadata": entry.metadata,
                        }
                    ),
                )
                return True

            else:
                await self._evict_if_needed(entry.size)
                self._local_cache[key] = entry
                self._memory_used += entry.size
                return True

        except Exception as e:
            logger.error(f"Cache set error: {e}")
            self._stats["errors"] += 1
            return False

    async def delete(self, url: str, strategy: str = "") -> bool:
        """Delete cached entry."""
        key = self._make_key(url, strategy)

        try:
            redis = await self._get_redis()
            if redis:
                await redis.delete(key)
            else:
                if key in self._local_cache:
                    entry = self._local_cache.pop(key)
                    self._memory_used -= entry.size

            return True
        except Exception as e:
            logger.error(f"Cache delete error: {e}")
            return False

    async def clear(self):
        """Clear all cached entries."""
        try:
            redis = await self._get_redis()
            if redis:
                async for key in redis.scan_iter(match="crawl_cache:*"):
                    await redis.delete(key)
            else:
                self._local_cache.clear()
                self._memory_used = 0
        except Exception as e:
            logger.error(f"Cache clear error: {e}")

    async def cleanup(self) -> int:
        """Remove expired entries.

        Returns:
            Number of entries removed
        """
        if time.time() - self._last_cleanup < self.CLEANUP_INTERVAL:
            return 0

        self._last_cleanup = time.time()
        removed = 0

        try:
            redis = await self._get_redis()
            if redis:
                current_time = time.time()
                async for key in redis.scan_iter(match="crawl_cache:*"):
                    data = await redis.get(key)
                    if data:
                        entry = json.loads(data)
                        if current_time > entry.get("expires_at", 0):
                            await redis.delete(key)
                            removed += 1
            else:
                expired = [k for k, v in self._local_cache.items() if v.is_expired()]
                for key in expired:
                    entry = self._local_cache.pop(key)
                    self._memory_used -= entry.size
                    removed += 1

        except Exception as e:
            logger.error(f"Cache cleanup error: {e}")

        return removed

    async def _evict_if_needed(self, new_size: int) -> bool:
        """Evict entries if cache is full."""
        if len(self._local_cache) < self.max_size:
            return True
        if self._memory_used + new_size <= self.max_memory:
            return True

        sorted_entries = sorted(
            self._local_cache.items(),
            key=lambda x: x[1].last_accessed or x[1].created_at,
        )

        for key, entry in sorted_entries:
            self._local_cache.pop(key)
            self._memory_used -= entry.size
            self._stats["evictions"] += 1

            if self._memory_used + new_size <= self.max_memory:
                return True

        return False

    def _is_expired(self, entry: dict) -> bool:
        """Check if entry dict is expired."""
        return time.time() > entry.get("expires_at", 0)

    def get_stats(self) -> dict:
        """Get cache statistics."""
        total = self._stats["hits"] + self._stats["misses"]
        hit_rate = self._stats["hits"] / total if total > 0 else 0

        return {
            **self._stats,
            "total_requests": total,
            "hit_rate": hit_rate,
            "memory_used_mb": self._memory_used / (1024 * 1024),
            "memory_limit_mb": self.max_memory / (1024 * 1024),
            "entries": len(self._local_cache),
            "max_entries": self.max_size,
        }

    async def iterate(self) -> AsyncIterator[tuple[str, CacheEntry]]:
        """Iterate over cache entries."""
        redis = await self._get_redis()
        if redis:
            async for key in redis.scan_iter(match="crawl_cache:*"):
                data = await redis.get(key)
                if data:
                    entry_dict = json.loads(data)
                    entry = CacheEntry(
                        url=entry_dict["url"],
                        content=entry_dict["content"],
                        strategy=entry_dict["strategy"],
                        created_at=entry_dict["created_at"],
                        expires_at=entry_dict["expires_at"],
                        size=entry_dict["size"],
                        hit_count=entry_dict.get("hit_count", 0),
                        metadata=entry_dict.get("metadata", {}),
                    )
                    yield entry_dict["url"], entry
        else:
            for key, entry in self._local_cache.items():
                yield entry.url, entry


class CacheMiddleware:
    """Middleware to add caching to crawler operations."""

    def __init__(self, cache: URLCache, skip_on_error: bool = True):
        self.cache = cache
        self.skip_on_error = skip_on_error

    async def get_cached(
        self,
        url: str,
        strategy: str,
        fetch_fn: callable,
        ttl: Optional[int] = None,
    ) -> Optional[str]:
        """Get content with cache support.

        Args:
            url: Target URL
            strategy: Crawling strategy
            fetch_fn: Async function to fetch content if not cached
            ttl: Cache TTL

        Returns:
            Content string
        """
        cached = await self.cache.get(url, strategy)
        if cached is not None:
            return cached

        try:
            content = await fetch_fn()
            if content:
                await self.cache.set(url, content, strategy, ttl)
            return content
        except Exception as e:
            if self.skip_on_error:
                logger.error(f"Fetch failed, skipping cache: {e}")
                return None
            raise
