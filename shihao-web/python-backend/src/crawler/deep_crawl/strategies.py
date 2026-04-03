"""Deep crawling strategies - BFS, DFS, Best-First."""

import asyncio
import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Callable, Any, AsyncIterator
from urllib.parse import urljoin, urlparse

logger = logging.getLogger(__name__)


@dataclass
class CrawlState:
    """State for deep crawling."""

    visited_urls: set = field(default_factory=set)
    pending_urls: list = field(default_factory=list)
    depth_map: dict = field(default_factory=dict)
    state_data: dict = field(default_factory=dict)


@dataclass
class DeepCrawlResult:
    """Result from deep crawling."""

    url: str
    content: str
    depth: int
    links: list[str]
    success: bool
    error: Optional[str] = None


class DeepCrawlStrategy(ABC):
    """Base class for deep crawling strategies."""

    def __init__(
        self,
        max_depth: int = 3,
        max_pages: int = 100,
        include_external: bool = False,
        same_domain_only: bool = True,
        url_filter: Optional[Callable[[str], bool]] = None,
    ):
        self.max_depth = max_depth
        self.max_pages = max_pages
        self.include_external = include_external
        self.same_domain_only = same_domain_only
        self.url_filter = url_filter or (lambda x: True)

    @abstractmethod
    async def select_next(self, state: CrawlState) -> Optional[tuple[str, int]]:
        """Select next URL to crawl.

        Returns:
            Tuple of (url, depth) or None if done
        """
        pass

    @abstractmethod
    def discover_urls(
        self, html: str, base_url: str, current_depth: int
    ) -> list[tuple[str, int]]:
        """Discover URLs from HTML content.

        Returns:
            List of (url, depth) tuples
        """
        pass

    def should_crawl(self, url: str, depth: int) -> bool:
        """Check if URL should be crawled."""
        if depth > self.max_depth:
            return False
        if self.max_pages and len(state.visited_urls) >= self.max_pages:
            return False
        if not self.url_filter(url):
            return False
        return True


class BFSDeepCrawlStrategy(DeepCrawlStrategy):
    """Breadth-First Search deep crawling.

    Visits pages level by level (all depth 1, then all depth 2, etc.)
    """

    async def select_next(self, state: CrawlState) -> Optional[tuple[str, int]]:
        """Select next URL using BFS order."""
        for url, depth in state.pending_urls:
            if url not in state.visited_urls:
                return url, depth
        return None

    def discover_urls(
        self, html: str, base_url: str, current_depth: int
    ) -> list[tuple[str, int]]:
        """Discover URLs and add them to pending queue."""
        base_domain = urlparse(base_url).netloc
        new_urls = []

        link_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
        for match in link_pattern.finditer(html):
            href = match.group(1)
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue

            full_url = urljoin(base_url, href)
            parsed = urlparse(full_url)

            if parsed.scheme not in ("http", "https"):
                continue

            if self.same_domain_only and parsed.netloc != base_domain:
                if not self.include_external:
                    continue

            normalized = self._normalize_url(full_url)
            new_depth = current_depth + 1
            new_urls.append((normalized, new_depth))

        return new_urls

    def _normalize_url(self, url: str) -> str:
        """Normalize URL for deduplication."""
        parsed = urlparse(url)
        normalized = parsed._replace(
            fragment="",
            query="&".join(sorted(parsed.query.split("&"))) if parsed.query else "",
        )
        return normalized.geturl()


class DFSDeepCrawlStrategy(DeepCrawlStrategy):
    """Depth-First Search deep crawling.

    Goes as deep as possible before backtracking.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._url_stack: list[tuple[str, int]] = []

    async def select_next(self, state: CrawlState) -> Optional[tuple[str, int]]:
        """Select next URL using DFS order."""
        if self._url_stack:
            return self._url_stack.pop()
        for url, depth in reversed(state.pending_urls):
            if url not in state.visited_urls:
                return url, depth
        return None

    def discover_urls(
        self, html: str, base_url: str, current_depth: int
    ) -> list[tuple[str, int]]:
        """Discover URLs and add them to stack (LIFO)."""
        base_domain = urlparse(base_url).netloc
        new_urls = []

        link_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
        for match in link_pattern.finditer(html):
            href = match.group(1)
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue

            full_url = urljoin(base_url, href)
            parsed = urlparse(full_url)

            if parsed.scheme not in ("http", "https"):
                continue

            if self.same_domain_only and parsed.netloc != base_domain:
                if not self.include_external:
                    continue

            normalized = self._normalize_url(full_url)
            new_depth = current_depth + 1
            new_urls.insert(0, (normalized, new_depth))

        return new_urls


class BestFirstDeepCrawlStrategy(DeepCrawlStrategy):
    """Best-First deep crawling.

    Prioritizes URLs based on relevance heuristics.
    """

    def __init__(
        self, *args, relevance_fn: Optional[Callable[[str], float]] = None, **kwargs
    ):
        super().__init__(*args, **kwargs)
        self.relevance_fn = relevance_fn or self._default_relevance
        self._priority_queue: list[tuple[float, str, int]] = []

    async def select_next(self, state: CrawlState) -> Optional[tuple[str, int]]:
        """Select next URL based on relevance score."""
        if self._priority_queue:
            _, url, depth = self._priority_queue.pop(0)
            return url, depth
        return None

    def discover_urls(
        self, html: str, base_url: str, current_depth: int
    ) -> list[tuple[str, int]]:
        """Discover URLs and score by relevance."""
        base_domain = urlparse(base_url).netloc
        new_urls = []

        link_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
        for match in link_pattern.finditer(html):
            href = match.group(1)
            if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
                continue

            full_url = urljoin(base_url, href)
            parsed = urlparse(full_url)

            if parsed.scheme not in ("http", "https"):
                continue

            if self.same_domain_only and parsed.netloc != base_domain:
                if not self.include_external:
                    continue

            normalized = self._normalize_url(full_url)
            relevance = self.relevance_fn(normalized)
            new_depth = current_depth + 1
            new_urls.append((normalized, new_depth))
            self._priority_queue.append((1 - relevance, normalized, new_depth))

        self._priority_queue.sort(key=lambda x: x[0])
        return new_urls

    def _default_relevance(self, url: str) -> float:
        """Default URL relevance scoring."""
        score = 0.5
        url_lower = url.lower()

        positive = ["product", "article", "post", "page", "detail", "item"]
        for term in positive:
            if term in url_lower:
                score += 0.1

        negative = ["login", "signup", "register", "auth", "cart", "checkout"]
        for term in negative:
            if term in url_lower:
                score -= 0.2

        return max(0.0, min(1.0, score))


class DeepCrawler:
    """Deep crawler with state persistence."""

    def __init__(
        self,
        strategy: DeepCrawlStrategy,
        fetcher: Optional[Callable] = None,
        on_state_change: Optional[Callable] = None,
        resume_state: Optional[dict] = None,
    ):
        self.strategy = strategy
        self.fetcher = fetcher or self._default_fetcher
        self.on_state_change = on_state_change
        self.state = CrawlState()

        if resume_state:
            self._restore_state(resume_state)

    def _restore_state(self, state_data: dict):
        """Restore state from saved data."""
        self.state.visited_urls = set(state_data.get("visited_urls", []))
        self.state.pending_urls = state_data.get("pending_urls", [])
        self.state.depth_map = state_data.get("depth_map", {})
        self.state.state_data = state_data

    def get_state(self) -> dict:
        """Get current state for persistence."""
        return {
            "visited_urls": list(self.state.visited_urls),
            "pending_urls": self.state.pending_urls,
            "depth_map": self.state.depth_map,
        }

    async def crawl(self, start_url: str) -> AsyncIterator[DeepCrawlResult]:
        """Perform deep crawl starting from URL."""
        if start_url not in self.state.visited_urls:
            self.state.pending_urls.append((start_url, 0))
            self.state.depth_map[start_url] = 0

        while True:
            next_item = await self.strategy.select_next(self.state)
            if not next_item:
                break

            url, depth = next_item
            if url in self.state.visited_urls:
                continue

            self.state.visited_urls.add(url)
            self.state.depth_map[url] = depth

            if self.on_state_change:
                await self.on_state_change(self.get_state())

            try:
                content, links = await self.fetcher(url)
                self.state.pending_urls.extend(
                    self.strategy.discover_urls(content, url, depth)
                )

                yield DeepCrawlResult(
                    url=url,
                    content=content,
                    depth=depth,
                    links=links,
                    success=True,
                )

            except Exception as e:
                logger.error(f"Failed to crawl {url}: {e}")
                yield DeepCrawlResult(
                    url=url,
                    content="",
                    depth=depth,
                    links=[],
                    success=False,
                    error=str(e),
                )

            if (
                self.strategy.max_pages
                and len(self.state.visited_urls) >= self.strategy.max_pages
            ):
                break

    async def _default_fetcher(self, url: str) -> tuple[str, list[str]]:
        """Default URL fetcher."""
        import aiohttp

        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=30) as response:
                html = await response.text()

        link_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)
        links = [m.group(1) for m in link_pattern.finditer(html)]

        return html, links
