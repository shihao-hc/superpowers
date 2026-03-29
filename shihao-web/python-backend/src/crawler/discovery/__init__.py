"""URL discovery module - site mapping functionality."""

import asyncio
import logging
import re
from urllib.parse import urljoin, urlparse
from typing import Optional, Any
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


@dataclass
class LinkInfo:
    """Information about a discovered link."""

    url: str
    title: Optional[str] = None
    description: Optional[str] = None
    text: Optional[str] = None
    rel: Optional[str] = None
    is_internal: bool = False
    depth: int = 0


@dataclass
class MapResult:
    """Result of site mapping operation."""

    base_url: str
    links: list[LinkInfo]
    total_count: int
    internal_count: int
    external_count: int
    duration_seconds: float
    search_query: Optional[str] = None


class SiteMapper:
    """Discover and map URLs on a website."""

    def __init__(
        self,
        max_depth: int = 2,
        max_links: int = 1000,
        respect_robots_txt: bool = True,
        include_external: bool = False,
    ):
        self.max_depth = max_depth
        self.max_links = max_links
        self.respect_robots_txt = respect_robots_txt
        self.include_external = include_external
        self._visited: set[str] = set()
        self._robots_txt: dict[str, set[str]] = {}

    def _parse_base_url(self, url: str) -> tuple[str, str]:
        """Parse URL to get base domain and path prefix."""
        parsed = urlparse(url)
        base = f"{parsed.scheme}://{parsed.netloc}"
        return base, parsed.path.rsplit("/", 1)[0] + "/" if parsed.path else "/"

    def _is_internal(self, url: str, base_url: str) -> bool:
        """Check if URL belongs to the same domain."""
        parsed = urlparse(url)
        base_parsed = urlparse(base_url)
        return parsed.netloc == base_parsed.netloc

    def _is_allowed_by_robots(self, url: str, base_url: str) -> bool:
        """Check if URL is allowed by robots.txt."""
        if not self.respect_robots_txt:
            return True

        parsed = urlparse(base_url)
        robots_key = f"{parsed.scheme}://{parsed.netloc}"

        if robots_key not in self._robots_txt:
            return True

        return url in self._robots_txt[robots_key]

    def _extract_links(self, html: str, base_url: str) -> list[LinkInfo]:
        """Extract links from HTML content."""
        import html.parser

        class LinkExtractor(html.parser.HTMLParser):
            def __init__(parser_self):
                super().__init__()
                parser_self.links = []
                parser_self.current_text = ""
                parser_self.current_href = None

            def handle_starttag(parser_self, tag, attrs):
                attrs_dict = dict(attrs)
                if tag == "a":
                    href = attrs_dict.get("href", "")
                    rel = attrs_dict.get("rel", "")
                    parser_self.current_href = href
                    parser_self.current_text = ""
                elif tag == "meta":
                    desc = attrs_dict.get("content")
                    name = attrs_dict.get("name", "")
                    if name == "description" and desc:
                        for link in parser_self.links:
                            if link.url == parser_self.current_href:
                                link.description = desc[:200]
                                break

            def handle_data(parser_self, data):
                if parser_self.current_href:
                    parser_self.current_text += data

            def handle_endtag(parser_self, tag):
                if tag == "a" and parser_self.current_href:
                    for link in parser_self.links:
                        if link.url == parser_self.current_href:
                            link.text = parser_self.current_text.strip()[:200]
                            break
                    parser_self.current_href = None
                    parser_self.current_text = ""

        extractor = LinkExtractor()
        try:
            extractor.feed(html)
        except Exception as e:
            logger.warning(f"Failed to parse HTML for links: {e}")

        links = []
        for raw_url in extractor.links:
            if not raw_url or raw_url.startswith(
                ("#", "javascript:", "mailto:", "tel:")
            ):
                continue

            full_url = urljoin(base_url, raw_url)
            if full_url in self._visited:
                continue

            parsed = urlparse(full_url)
            if not parsed.scheme or not parsed.netloc:
                continue

            is_internal = self._is_internal(full_url, base_url)

            link = LinkInfo(
                url=full_url,
                text=raw_url.strip() if raw_url else None,
                is_internal=is_internal,
            )
            links.append(link)

        return links

    def _fetch_page(self, url: str) -> Optional[str]:
        """Fetch page content using scrapling."""
        try:
            import scrapling

            page = scrapling.Fetcher.get(url, timeout=10)
            return page.body
        except ImportError:
            try:
                import requests

                resp = requests.get(
                    url,
                    timeout=10,
                    headers={"User-Agent": "Mozilla/5.0 (compatible; SiteMapper/1.0)"},
                )
                return resp.text
            except Exception as e:
                logger.warning(f"Failed to fetch {url}: {e}")
                return None
        except Exception as e:
            logger.warning(f"Failed to fetch {url}: {e}")
            return None

    async def map_url(self, url: str, search: Optional[str] = None) -> MapResult:
        """Map all URLs on a website starting from given URL."""
        import time

        start_time = time.time()
        self._visited.clear()

        base_url, _ = self._parse_base_url(url)
        self._visited.add(url)

        all_links: list[LinkInfo] = []
        to_visit: list[tuple[str, int]] = [(url, 0)]
        seen_urls: set[str] = {url}

        while to_visit and len(all_links) < self.max_links:
            current_url, current_depth = to_visit.pop(0)

            if current_depth >= self.max_depth:
                continue

            html = await asyncio.to_thread(self._fetch_page, current_url)
            if not html:
                continue

            links = self._extract_links(html, base_url)

            for link in links:
                if link.url in seen_urls:
                    continue
                seen_urls.add(link.url)
                self._visited.add(link.url)

                if self._is_internal(link.url, base_url):
                    all_links.append(
                        LinkInfo(
                            url=link.url,
                            title=link.title,
                            description=link.description,
                            text=link.text,
                            is_internal=True,
                            depth=current_depth + 1,
                        )
                    )

                    if (
                        current_depth + 1 < self.max_depth
                        and len(all_links) < self.max_links
                    ):
                        to_visit.append((link.url, current_depth + 1))
                elif self.include_external:
                    all_links.append(
                        LinkInfo(
                            url=link.url,
                            title=link.title,
                            description=link.description,
                            text=link.text,
                            is_internal=False,
                            depth=current_depth + 1,
                        )
                    )

        internal_links = [l for l in all_links if l.is_internal]
        external_links = [l for l in all_links if not l.is_internal]

        return MapResult(
            base_url=url,
            links=all_links,
            total_count=len(all_links),
            internal_count=len(internal_links),
            external_count=len(external_links),
            duration_seconds=time.time() - start_time,
            search_query=search,
        )

    async def search_links(self, links: list[LinkInfo], query: str) -> list[LinkInfo]:
        """Search for links matching a query."""
        query_lower = query.lower()
        scored_links: list[tuple[int, LinkInfo]] = []

        for link in links:
            score = 0
            url_lower = link.url.lower()
            text_lower = (link.text or "").lower()
            desc_lower = (link.description or "").lower()

            if query_lower in url_lower:
                score += 5
            if query_lower in text_lower:
                score += 10
            if query_lower in desc_lower:
                score += 8

            if score > 0:
                scored_links.append((score, link))

        scored_links.sort(key=lambda x: x[0], reverse=True)
        return [link for _, link in scored_links]


def create_map_result_dict(result: MapResult) -> dict:
    """Convert MapResult to dictionary for JSON serialization."""
    return {
        "base_url": result.base_url,
        "links": [
            {
                "url": link.url,
                "title": link.title,
                "description": link.description,
                "text": link.text,
                "is_internal": link.is_internal,
                "depth": link.depth,
            }
            for link in result.links
        ],
        "total_count": result.total_count,
        "internal_count": result.internal_count,
        "external_count": result.external_count,
        "duration_seconds": round(result.duration_seconds, 2),
        "search_query": result.search_query,
    }
