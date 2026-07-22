"""Xiaohongshu (小红书) platform adapter."""

import re
import asyncio
import hashlib
import time
from typing import Optional
from urllib.parse import urlencode

from .base_adapter import (
    BasePlatformAdapter,
    PlatformType,
    PlatformConfig,
    PlatformCredentials,
    PlatformPost,
)


class XiaohongshuAdapter(BasePlatformAdapter):
    """
    Adapter for Xiaohongshu (小红书) platform.

    Supports:
    - Note extraction (图文/视频)
    - User profile notes
    - Comments extraction
    - Search results
    """

    NOTE_URL_PATTERNS = [
        r"xiaohongshu\.com/explore/([a-zA-Z0-9]+)",
        r"xhslink\.com/([a-zA-Z0-9]+)",
        r"www\.xiaohongshu\.com/discovery/item/([a-zA-Z0-9]+)",
    ]

    USER_URL_PATTERNS = [
        r"xiaohongshu\.com/user/profile/([a-zA-Z0-9-]+)",
    ]

    def __init__(
        self,
        config: Optional[PlatformConfig] = None,
        credentials: Optional[PlatformCredentials] = None,
    ):
        config = config or PlatformConfig(
            base_url="https://www.xiaohongshu.com",
            api_url="https://edith.xiaohongshu.com",
            requires_auth=True,
            rate_limit=3,
        )
        super().__init__(config, credentials)

    @property
    def platform_type(self) -> PlatformType:
        return PlatformType.XIAOHONGSHU

    async def extract_post(self, url: str) -> PlatformPost:
        """
        Extract note from Xiaohongshu URL.

        Args:
            url: Xiaohongshu note URL

        Returns:
            PlatformPost with note data
        """
        note_id = self._extract_note_id(url)

        if not note_id:
            raise ValueError(f"Invalid Xiaohongshu URL: {url}")

        if not self._check_auth():
            return await self._extract_from_webpage(url, note_id)

        return await self._extract_from_api(note_id, url)

    async def _extract_from_api(self, note_id: str, url: str) -> PlatformPost:
        """Extract note using official API."""
        headers = self._make_headers(
            {
                "Referer": self.config.base_url,
                "X-S": self._generate_signature(),
            }
        )

        if self.credentials and self.credentials.cookies:
            headers["Cookie"] = self._format_cookies(self.credentials.cookies)

        try:
            import httpx

            async with httpx.AsyncClient(
                headers=headers,
                timeout=self.config.timeout,
            ) as client:
                api_url = f"{self.config.api_url}/api/sns/web/v1/feed"

                payload = {
                    "source_note_id": note_id,
                    "image_formats": ["jpg", "webp", "avif"],
                }

                response = await client.post(api_url, json=payload)
                response.raise_for_status()
                data = response.json()

                items = data.get("data", {}).get("items", [])

                if not items:
                    raise Exception("No note found")

                note = items[0].get("note_card", {})

                return self._parse_note_card(note, url)

        except Exception as e:
            return PlatformPost(
                platform=self.platform_name,
                post_id=note_id,
                url=url,
                title="Note",
                metadata={"error": str(e)},
            )

    async def _extract_from_webpage(self, url: str, note_id: str) -> PlatformPost:
        """Extract note from webpage (fallback when no auth)."""
        headers = self._make_headers(
            {
                "User-Agent": (
                    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) "
                    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 "
                    "Mobile/15E148 Safari/604.1"
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

                title_match = re.search(r'"title":"([^"]+)"', html)
                title = title_match.group(1) if title_match else ""

                author_match = re.search(r'"nickname":"([^"]+)"', html)
                author = author_match.group(1) if author_match else ""

                image_pattern = r'"url":"(https://sns-img[^"]+)"'
                images = re.findall(image_pattern, html)

                desc_pattern = r'"desc":"([^"]+)"'
                desc_match = re.search(desc_pattern, html)
                content = desc_match.group(1) if desc_match else ""

                return PlatformPost(
                    platform=self.platform_name,
                    post_id=note_id,
                    url=url,
                    title=title,
                    content=content,
                    author=author,
                    images=images,
                )

        except Exception as e:
            return PlatformPost(
                platform=self.platform_name,
                post_id=note_id,
                url=url,
                title="Note",
                metadata={"error": str(e)},
            )

    def _parse_note_card(self, note_card: dict, url: str) -> PlatformPost:
        """Parse note card from API response."""
        note_id = note_card.get("note_id", "")
        interact_info = note_card.get("interact_info", {})

        images = []
        image_list = note_card.get("image_list", [])
        for img in image_list:
            if img.get("url_default"):
                images.append(img["url_default"])
            elif img.get("url_preraw"):
                images.append(img["url_preraw"])

        videos = []
        video_url = note_card.get("video", {}).get("master_url")
        if video_url:
            videos.append(video_url)

        return PlatformPost(
            platform=self.platform_name,
            post_id=note_id,
            url=url,
            title=note_card.get("title", ""),
            content=note_card.get("desc", ""),
            author=note_card.get("user", {}).get("nickname", ""),
            author_id=note_card.get("user", {}).get("user_id", ""),
            images=images,
            videos=videos,
            likes=interact_info.get("liked_count"),
            comments=interact_info.get("comment_count"),
            shares=interact_info.get("share_count"),
            published_at=note_card.get("time"),
            raw_data=note_card,
        )

    async def extract_user_posts(
        self, user_id: str, limit: int = 20
    ) -> list[PlatformPost]:
        """
        Extract notes from user profile.

        Args:
            user_id: User identifier
            limit: Maximum notes to retrieve

        Returns:
            List of PlatformPost objects
        """
        if not self._check_auth():
            return []

        headers = self._make_headers(
            {
                "Referer": f"{self.config.base_url}/user/profile/{user_id}",
                "X-S": self._generate_signature(),
            }
        )

        if self.credentials and self.credentials.cookies:
            headers["Cookie"] = self._format_cookies(self.credentials.cookies)

        posts = []

        try:
            import httpx

            async with httpx.AsyncClient(
                headers=headers,
                timeout=self.config.timeout,
            ) as client:
                cursor = ""
                count = 0

                while count < limit:
                    api_url = (
                        f"{self.config.api_url}/api/sns/web/v1/user_post"
                        f"?user_id={user_id}&cursor={cursor}&num=30&image_formats=jpg,webp,avif"
                    )

                    response = await client.get(api_url)
                    response.raise_for_status()
                    data = response.json()

                    notes = data.get("data", {}).get("notes", [])

                    if not notes:
                        break

                    for note in notes:
                        post = PlatformPost(
                            platform=self.platform_name,
                            post_id=note.get("note_id", ""),
                            url=f"{self.config.base_url}/discovery/item/{note.get('note_id')}",
                            title=note.get("title", ""),
                            content=note.get("desc", ""),
                            author=note.get("user", {}).get("nickname", ""),
                            author_id=user_id,
                            images=[
                                img.get("url_default", "")
                                for img in note.get("image_list", [])
                            ],
                            likes=note.get("interact_info", {}).get("liked_count"),
                            comments=note.get("interact_info", {}).get("comment_count"),
                            published_at=note.get("time"),
                            raw_data=note,
                        )
                        posts.append(post)
                        count += 1

                    has_more = data.get("data", {}).get("has_more", False)
                    cursor = data.get("data", {}).get("cursor", "")

                    if not has_more:
                        break

                    await asyncio.sleep(0.5)

        except Exception:
            pass

        return posts[:limit]

    def _extract_note_id(self, url: str) -> Optional[str]:
        """Extract note ID from URL."""
        for pattern in self.NOTE_URL_PATTERNS:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None

    def _generate_signature(self) -> str:
        """Generate X-S header for API auth."""
        timestamp = int(time.time())
        return f"{timestamp}"

    def _format_cookies(self, cookies: dict) -> str:
        """Format cookies dict to string."""
        return "; ".join(f"{k}={v}" for k, v in cookies.items())
