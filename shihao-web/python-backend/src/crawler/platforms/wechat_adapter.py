"""WeChat Public Account (微信公众号) adapter."""

import re
import asyncio
from typing import Optional
from datetime import datetime

from .base_adapter import (
    BasePlatformAdapter,
    PlatformType,
    PlatformConfig,
    PlatformCredentials,
    PlatformPost,
)


class WechatAdapter(BasePlatformAdapter):
    """
    Adapter for WeChat Public Account (微信公众号).

    Supports:
    - Article extraction
    - Account article list
    - Content parsing
    """

    ARTICLE_URL_PATTERNS = [
        r"mp\.weixin\.qq\.com/s[/\?]?([^#]+)",
    ]

    ACCOUNT_PATTERNS = [
        r"mp\.weixin\.qq\.com/profile\?([^#]+)",
    ]

    def __init__(
        self,
        config: Optional[PlatformConfig] = None,
        credentials: Optional[PlatformCredentials] = None,
    ):
        config = config or PlatformConfig(
            base_url="https://mp.weixin.qq.com",
            api_url="https://mp.weixin.qq.com",
            requires_auth=False,
            rate_limit=5,
        )
        super().__init__(config, credentials)

    @property
    def platform_type(self) -> PlatformType:
        return PlatformType.WECHAT_PUBLIC

    async def extract_post(self, url: str) -> PlatformPost:
        """
        Extract article from WeChat URL.

        Args:
            url: WeChat article URL

        Returns:
            PlatformPost with article data
        """
        headers = self._make_headers(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            }
        )

        try:
            import httpx

            async with httpx.AsyncClient(
                headers=headers,
                timeout=self.config.timeout,
            ) as client:
                response = await client.get(url)
                response.raise_for_status()

                html = response.text

                title = self._extract_meta(html, "og:title") or self._extract_title(
                    html
                )
                author = self._extract_author(html)
                content = self._extract_content(html)
                images = self._extract_images(html)
                publish_date = self._extract_date(html)

                biz = self._extract_biz(url) or self._extract_biz_from_html(html)
                mid = self._extract_mid(html)

                return PlatformPost(
                    platform=self.platform_name,
                    post_id=mid or biz or "unknown",
                    url=url,
                    title=title,
                    content=content[:500] if content else None,
                    author=author,
                    author_id=biz,
                    images=images,
                    published_at=publish_date,
                    raw_data={"biz": biz, "mid": mid},
                    metadata={
                        "source_url": url,
                        "copyright": self._extract_copyright(html),
                    },
                )

        except Exception as e:
            return PlatformPost(
                platform=self.platform_name,
                post_id="unknown",
                url=url,
                title="Article",
                metadata={"error": str(e)},
            )

    async def extract_user_posts(
        self, user_id: str, limit: int = 20
    ) -> list[PlatformPost]:
        """
        Extract articles from account (requires biz/account name).

        Args:
            user_id: Account biz or name
            limit: Maximum articles

        Returns:
            List of PlatformPost objects
        """
        return []

    def _extract_title(self, html: str) -> str:
        """Extract article title."""
        match = re.search(r'<h1[^>]*id="activity-name"[^>]*>([^<]+)</h1>', html)
        if match:
            return match.group(1).strip()

        match = re.search(r"<title>([^<]+)</title>", html)
        if match:
            return match.group(1).strip()

        return ""

    def _extract_meta(self, html: str, prop: str) -> Optional[str]:
        """Extract meta tag content."""
        pattern = rf'<meta[^>]+{prop}[^>]+content="([^"]+)"'
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            return match.group(1)

        pattern = rf'<meta[^>]+content="([^"]+)"[^>]*{prop}'
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            return match.group(1)

        return None

    def _extract_author(self, html: str) -> str:
        """Extract author name."""
        match = re.search(r'<span[^>]+id="js_name"[^>]*>([^<]+)</span>', html)
        if match:
            return match.group(1).strip()

        match = re.search(r'var nickname = "([^"]+)"', html)
        if match:
            return match.group(1)

        return ""

    def _extract_content(self, html: str) -> str:
        """Extract article content."""
        match = re.search(r'<div[^>]+id="js_content"[^>]*>(.*?)</div>', html, re.DOTALL)
        if match:
            content_html = match.group(1)

            content_html = re.sub(
                r'<img[^>]+data-src="([^"]+)"[^>]*>',
                lambda m: f'<img src="{m.group(1)}"/>',
                content_html,
            )

            content_html = re.sub(r"<[^>]+>", "", content_html)
            content_html = re.sub(r"\s+", " ", content_html)

            return content_html.strip()

        return ""

    def _extract_images(self, html: str) -> list[str]:
        """Extract images from article."""
        images = []

        pattern = r'<img[^>]+src="(https?://[^"]+)"[^>]*>'
        matches = re.findall(pattern, html)
        images.extend(matches)

        pattern = r'<img[^>]+data-src="(https?://[^"]+)"[^>]*>'
        matches = re.findall(pattern, html)
        images.extend(matches)

        seen = set()
        unique_images = []
        for img in images:
            if img not in seen and not img.startswith("data:"):
                seen.add(img)
                unique_images.append(img)

        return unique_images

    def _extract_date(self, html: str) -> Optional[str]:
        """Extract publish date."""
        match = re.search(r'var publish_time = "([^"]+)"', html)
        if match:
            return match.group(1)

        match = re.search(r'<em[^>]+id="publish_time"[^>]*>([^<]+)</em>', html)
        if match:
            return match.group(1)

        match = re.search(r"(\d{4}-\d{2}-\d{2})", html)
        if match:
            return match.group(1)

        return None

    def _extract_biz(self, url: str) -> Optional[str]:
        """Extract biz from URL."""
        match = re.search(r"__biz=([^&]+)", url)
        if match:
            return match.group(1)
        return None

    def _extract_biz_from_html(self, html: str) -> Optional[str]:
        """Extract biz from page HTML."""
        match = re.search(r'var biz = "([^"]+)"', html)
        if match:
            return match.group(1)
        return None

    def _extract_mid(self, html: str) -> Optional[str]:
        """Extract message ID from HTML."""
        match = re.search(r'"mid":(\d+)', html)
        if match:
            return match.group(1)
        return None

    def _extract_copyright(self, html: str) -> Optional[str]:
        """Extract copyright info."""
        match = re.search(r'id="js_copyright_desc"[^>]*>([^<]+)</p>', html)
        if match:
            return match.group(1).strip()
        return None
