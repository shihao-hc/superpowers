"""Zero-dependency crawler using only Python standard library."""

import re
import urllib.request
import urllib.parse
import urllib.error
import html.parser
import http.cookiejar
from typing import Optional, List, Dict, Any
from .base import BaseScraper
from ..types import CrawlResult, CrawlerStrategy
from ..config import CrawlerConfig
from ..exceptions import ScraperError


class HTMLParser(html.parser.HTMLParser):
    """Simple HTML parser for content extraction."""

    def __init__(self):
        super().__init__()
        self.text_parts: List[str] = []
        self.links: Dict[str, str] = {}
        self.current_tag: Optional[str] = None
        self.current_attrs: Dict = {}
        self.in_script = False
        self.in_style = False

    def handle_starttag(self, tag: str, attrs: List[tuple]) -> None:
        self.current_tag = tag
        self.current_attrs = dict(attrs)

        if tag == "a" and attrs:
            href = dict(attrs).get("href", "")
            if href and not href.startswith("javascript:"):
                self.links[href] = ""

        if tag == "script":
            self.in_script = True
        elif tag == "style":
            self.in_style = True

    def handle_endtag(self, tag: str) -> None:
        if tag == "script":
            self.in_script = False
        elif tag == "style":
            self.in_style = False
        self.current_tag = None

    def handle_data(self, data: str) -> None:
        if not self.in_script and not self.in_style:
            text = data.strip()
            if text:
                self.text_parts.append(text)

    def get_text(self) -> str:
        return "\n".join(self.text_parts)


class StdlibAdapter(BaseScraper):
    """Adapter using only Python standard library.

    Features:
    - No external dependencies required
    - Cookie support
    - Basic anti-blocking (User-Agent)
    - Link extraction
    - Text extraction
    """

    def __init__(self, config: Optional[CrawlerConfig] = None):
        super().__init__(config)
        self._cookie_jar = http.cookiejar.CookieJar()
        self._opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self._cookie_jar)
        )
        self._opener.addheaders = [
            (
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            ),
            (
                "Accept",
                "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            ),
            ("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8"),
        ]

    def supports(self, url: str) -> bool:
        """All URLs are supported."""
        return True

    async def crawl(self, url: str, **kwargs) -> CrawlResult:
        """Crawl using stdlib only."""
        try:
            selector = kwargs.get("selector", "body")
            timeout = self.config.default_timeout if self.config else 30

            response = self._fetch(url, timeout)
            content_type = response.headers.get("Content-Type", "")

            if "json" in content_type:
                return self._handle_json(response, url)

            return self._handle_html(response, url, selector)

        except urllib.error.HTTPError as e:
            return self._error_result(f"HTTP {e.code}: {e.reason}", url)
        except urllib.error.URLError as e:
            return self._error_result(f"URL error: {e.reason}", url)
        except Exception as e:
            raise ScraperError(f"Stdlib crawl failed for {url}: {e}") from e

    def _fetch(self, url: str, timeout: int) -> http.client.HTTPResponse:
        """Fetch URL content."""
        request = urllib.request.Request(url)
        for name, value in self._opener.addheaders:
            request.add_header(name, value)

        return self._opener.open(request, timeout=timeout)

    def _handle_html(self, response, url: str, selector: str) -> CrawlResult:
        """Parse and extract HTML content."""
        html_content = response.read().decode("utf-8", errors="replace")

        parser = HTMLParser()
        parser.feed(html_content)

        links = [{"href": href, "text": text} for href, text in parser.links.items()]

        content = parser.get_text()

        if selector and selector != "body":
            content = self._extract_by_selector(html_content, selector)

        return {
            "success": bool(content),
            "content": content or "",
            "strategy_used": "stdlib",
            "metadata": {
                "url": url,
                "selector": selector,
                "links_count": len(links),
                "links": links[:50],
                "html_length": len(html_content),
            },
        }

    def _handle_json(self, response, url: str) -> CrawlResult:
        """Handle JSON responses."""
        import json

        content = response.read().decode("utf-8", errors="replace")
        data = json.loads(content)

        return {
            "success": True,
            "content": json.dumps(data, indent=2, ensure_ascii=False),
            "strategy_used": "stdlib",
            "metadata": {
                "url": url,
                "format": "json",
                "keys": list(data.keys())
                if isinstance(data, dict)
                else type(data).__name__,
            },
        }

    def _extract_by_selector(self, html: str, selector: str) -> str:
        """Simple CSS-like selector extraction."""
        if selector.startswith("."):
            class_name = selector[1:]
            pattern = rf'<[^>]*class=["\'][^"\']*{re.escape(class_name)}[^"\']*["\'][^>]*>(.*?)</[^>]+>'
            matches = re.findall(pattern, html, re.DOTALL)
            return " ".join(matches)[:5000]

        if selector.startswith("#"):
            id_name = selector[1:]
            pattern = rf'<[^>]*id=["\']?{re.escape(id_name)}["\']?[^>]*>(.*?)</[^>]+>'
            match = re.search(pattern, html, re.DOTALL)
            return match.group(1) if match else ""

        pattern = rf"<{re.escape(selector)}[^>]*>(.*?)</{re.escape(selector)}>"
        matches = re.findall(pattern, html, re.DOTALL)
        return " ".join(matches)[:5000]

    def _error_result(self, error: str, url: str) -> CrawlResult:
        """Create error result."""
        return {
            "success": False,
            "content": "",
            "strategy_used": "stdlib",
            "metadata": {"url": url, "error": error},
        }

    def set_cookies(self, cookies: Dict[str, str]) -> None:
        """Set cookies for requests."""
        for name, value in cookies.items():
            self._opener.addheaders.append(("Cookie", f"{name}={value}"))

    def set_proxy(self, proxy: str) -> None:
        """Set proxy server."""
        proxy_handler = urllib.request.ProxyHandler(
            {
                "http": proxy,
                "https": proxy,
            }
        )
        self._opener.add_handler(proxy_handler)
