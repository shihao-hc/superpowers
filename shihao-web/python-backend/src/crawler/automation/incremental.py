"""Incremental crawling and deduplication."""

from dataclasses import dataclass, field
from typing import Optional, Set
import asyncio
import hashlib
import json
import time
from pathlib import Path


@dataclass
class ContentHash:
    """Content hash for deduplication."""

    url: str
    content_hash: str
    timestamp: float
    size: int
    version: int = 1


@dataclass
class ChangeDetection:
    """Content change detection result."""

    url: str
    changed: bool
    change_type: str
    old_hash: Optional[str] = None
    new_hash: Optional[str] = None
    change_ratio: float = 0.0


class Deduplicator:
    """
    Content deduplication system.

    Features:
    - URL deduplication
    - Content deduplication (simhash/minhash)
    - Near-duplicate detection
    - Cache management
    """

    def __init__(
        self,
        cache_dir: Optional[str] = None,
        similarity_threshold: float = 0.95,
    ):
        """
        Initialize deduplicator.

        Args:
            cache_dir: Directory for persistent cache
            similarity_threshold: Threshold for near-duplicate (0-1)
        """
        self.cache_dir = Path(cache_dir) if cache_dir else None
        self.similarity_threshold = similarity_threshold
        self._url_cache: dict[str, ContentHash] = {}
        self._content_cache: dict[str, str] = {}
        self._lock = asyncio.Lock()

        if self.cache_dir:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            self._load_cache()

    def _load_cache(self) -> None:
        """Load cache from disk."""
        if not self.cache_dir:
            return

        cache_file = self.cache_dir / "dedup_cache.json"
        if cache_file.exists():
            try:
                with open(cache_file, "r") as f:
                    data = json.load(f)
                    self._url_cache = {k: ContentHash(**v) for k, v in data.items()}
            except Exception:
                pass

    def _save_cache(self) -> None:
        """Save cache to disk."""
        if not self.cache_dir:
            return

        cache_file = self.cache_dir / "dedup_cache.json"
        try:
            data = {
                k: {
                    "url": v.url,
                    "content_hash": v.content_hash,
                    "timestamp": v.timestamp,
                    "size": v.size,
                    "version": v.version,
                }
                for k, v in self._url_cache.items()
            }
            with open(cache_file, "w") as f:
                json.dump(data, f)
        except Exception:
            pass

    def _compute_hash(self, content: str) -> str:
        """Compute content hash."""
        return hashlib.sha256(content.encode()).hexdigest()

    def _compute_simhash(self, content: str) -> int:
        """Compute simhash for near-duplicate detection."""
        import hashlib

        words = content.split()
        v = [0] * 64

        for word in words:
            h = int(hashlib.md5(word.encode()).hexdigest(), 16)
            for i in range(64):
                v[i] += 1 if (h >> i) & 1 else -1

        result = 0
        for i in range(64):
            if v[i] > 0:
                result |= 1 << i

        return result

    async def is_duplicate(self, url: str, content: str) -> bool:
        """
        Check if content is duplicate.

        Args:
            url: Content URL
            content: Content to check

        Returns:
            True if duplicate
        """
        async with self._lock:
            content_hash = self._compute_hash(content)

            if url in self._url_cache:
                existing = self._url_cache[url]
                if existing.content_hash == content_hash:
                    return True

            return False

    async def check_near_duplicate(self, content: str) -> Optional[str]:
        """
        Check for near-duplicate content.

        Args:
            content: Content to check

        Returns:
            URL of near-duplicate or None
        """
        async with self._lock:
            content_simhash = self._compute_simhash(content)

            for url, hash_obj in self._url_cache.items():
                if url in self._content_cache:
                    cached_simhash = self._compute_simhash(self._content_cache[url])
                    similarity = self._calculate_similarity(
                        content_simhash, cached_simhash
                    )
                    if similarity >= self.similarity_threshold:
                        return url

            return None

    def _calculate_similarity(self, hash1: int, hash2: int) -> float:
        """Calculate hamming similarity between hashes."""
        xor = hash1 ^ hash2
        distance = bin(xor).count("1")
        return 1.0 - (distance / 64.0)

    async def add(self, url: str, content: str) -> None:
        """
        Add content to deduplication cache.

        Args:
            url: Content URL
            content: Content to cache
        """
        async with self._lock:
            content_hash = self._compute_hash(content)

            if url in self._url_cache:
                self._url_cache[url].version += 1
                self._url_cache[url].content_hash = content_hash
                self._url_cache[url].timestamp = time.time()
            else:
                self._url_cache[url] = ContentHash(
                    url=url,
                    content_hash=content_hash,
                    timestamp=time.time(),
                    size=len(content),
                )

            self._content_cache[url] = content
            self._save_cache()

    async def remove(self, url: str) -> None:
        """Remove URL from cache."""
        async with self._lock:
            self._url_cache.pop(url, None)
            self._content_cache.pop(url, None)
            self._save_cache()

    async def clear(self) -> None:
        """Clear all caches."""
        async with self._lock:
            self._url_cache.clear()
            self._content_cache.clear()
            self._save_cache()

    def get_stats(self) -> dict:
        """Get deduplication stats."""
        return {
            "cached_urls": len(self._url_cache),
            "cached_content": len(self._content_cache),
            "similarity_threshold": self.similarity_threshold,
        }


class IncrementalCrawler:
    """
    Incremental crawling system.

    Features:
    - Change detection
    - Delta extraction
    - ETag/Last-Modified support
    - Conditional requests
    """

    def __init__(
        self,
        deduplicator: Optional[Deduplicator] = None,
        check_interval: int = 3600,
    ):
        """
        Initialize incremental crawler.

        Args:
            deduplicator: Deduplicator instance
            check_interval: Default check interval in seconds
        """
        self.dedup = deduplicator or Deduplicator()
        self.check_interval = check_interval
        self._last_check: dict[str, float] = {}
        self._etag: dict[str, str] = {}
        self._last_modified: dict[str, str] = {}
        self._content_hashes: dict[str, str] = {}
        self._lock = asyncio.Lock()

    async def check_changes(
        self,
        url: str,
        content: str,
        headers: Optional[dict] = None,
    ) -> ChangeDetection:
        """
        Check if content has changed since last crawl.

        Args:
            url: Content URL
            content: New content
            headers: Response headers

        Returns:
            ChangeDetection result
        """
        async with self._lock:
            new_hash = self.dedup._compute_hash(content)

            is_dup = await self.dedup.is_duplicate(url, content)

            if url in self._content_hashes:
                old_hash = self._content_hashes[url]
                changed = old_hash != new_hash
                change_ratio = self._calculate_change_ratio(old_hash, new_hash, content)

                change_type = "modified" if changed else "unchanged"

                if is_dup and not changed:
                    change_type = "duplicate"

                return ChangeDetection(
                    url=url,
                    changed=changed,
                    change_type=change_type,
                    old_hash=old_hash,
                    new_hash=new_hash,
                    change_ratio=change_ratio,
                )
            else:
                await self.dedup.add(url, content)
                self._content_hashes[url] = new_hash

                return ChangeDetection(
                    url=url,
                    changed=True,
                    change_type="new",
                    new_hash=new_hash,
                    change_ratio=1.0,
                )

    def _calculate_change_ratio(
        self,
        old_hash: str,
        new_hash: str,
        new_content: str,
    ) -> float:
        """Calculate how much content changed (0-1)."""
        old_content = self.dedup._content_cache.get(
            self._content_hashes.get(self._content_hashes.keys()[0], "")
        )

        if not old_content:
            return 0.5

        min_len = min(len(old_content), len(new_content))
        max_len = max(len(old_content), len(new_content))

        if max_len == 0:
            return 0.0

        matching = sum(1 for a, b in zip(old_content, new_content) if a == b)

        return 1.0 - (matching / max_len)

    def get_conditional_headers(self, url: str) -> dict:
        """
        Get conditional request headers.

        Args:
            url: Target URL

        Returns:
            Headers dict for conditional request
        """
        headers = {}

        if url in self._etag and self._etag[url]:
            headers["If-None-Match"] = self._etag[url]

        if url in self._last_modified and self._last_modified[url]:
            headers["If-Modified-Since"] = self._last_modified[url]

        return headers

    def update_metadata(
        self,
        url: str,
        headers: dict,
    ) -> None:
        """
        Update metadata from response headers.

        Args:
            url: Content URL
            headers: Response headers
        """
        if "etag" in headers:
            self._etag[url] = headers["etag"]

        if "last-modified" in headers:
            self._last_modified[url] = headers["last-modified"]

    async def should_crawl(self, url: str) -> bool:
        """
        Check if URL should be crawled based on interval.

        Args:
            url: URL to check

        Returns:
            True if should crawl
        """
        if url not in self._last_check:
            return True

        elapsed = time.time() - self._last_check[url]
        return elapsed >= self.check_interval

    async def mark_crawled(self, url: str) -> None:
        """Mark URL as crawled."""
        self._last_check[url] = time.time()

    def get_crawl_stats(self) -> dict:
        """Get crawling statistics."""
        return {
            "tracked_urls": len(self._content_hashes),
            "last_check": self._last_check,
            "dedup_stats": self.dedup.get_stats(),
        }


class URLNormalizer:
    """URL normalization for deduplication."""

    @staticmethod
    def normalize(url: str) -> str:
        """
        Normalize URL for comparison.

        Args:
            url: URL to normalize

        Returns:
            Normalized URL
        """
        url = url.strip().lower()

        url = re.sub(r"^https?://(www\.)?", "", url)

        url = re.sub(r"/+$", "", url)

        url = re.sub(r"#.*", "", url)

        url = re.sub(r"\?utm_[^=&]+=[^=&]+", "", url)
        url = re.sub(r"\?fbclid=[^=&]+", "", url)
        url = re.sub(r"\?ref=[^=&]+", "", url)

        url = re.sub(r"__fbclid=[^&]+", "", url)

        url = re.sub(r"&+", "&", url)
        url = re.sub(r"\?&", "?", url)
        url = re.sub(r"\?$", "", url)

        return url

    @staticmethod
    def extract_key(url: str) -> str:
        """
        Extract deduplication key from URL.

        Args:
            url: URL

        Returns:
            Deduplication key
        """
        normalized = URLNormalizer.normalize(url)

        return hashlib.md5(normalized.encode()).hexdigest()[:16]


import re
