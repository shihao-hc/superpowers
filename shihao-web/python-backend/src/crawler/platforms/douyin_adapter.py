"""Douyin (抖音) platform adapter."""

import re
import asyncio
from typing import Optional
from urllib.parse import urlparse, parse_qs

from .base_adapter import (
    BasePlatformAdapter,
    PlatformType,
    PlatformConfig,
    PlatformCredentials,
    PlatformPost,
)


class DouyinAdapter(BasePlatformAdapter):
    """
    Adapter for Douyin (抖音) video platform.

    Supports:
    - Video extraction
    - User profile posts
    - Comments extraction
    - Trending content
    """

    VIDEO_URL_PATTERNS = [
        r"douyin\.com/video/(\d+)",
        r"www\.douyin\.com/(\d+)",
        r"v\.douyin\.com/([a-zA-Z0-9]+)",
    ]

    USER_URL_PATTERNS = [
        r"douyin\.com/user/([a-zA-Z0-9_-]+)",
        r"www\.douyin\.com/discover\?search_id=([^&]+)",
    ]

    def __init__(
        self,
        config: Optional[PlatformConfig] = None,
        credentials: Optional[PlatformCredentials] = None,
    ):
        config = config or PlatformConfig(
            base_url="https://www.douyin.com",
            api_url="https://www.iesdouyin.com/web/api/v2",
            requires_auth=False,
            rate_limit=5,
        )
        super().__init__(config, credentials)

    @property
    def platform_type(self) -> PlatformType:
        return PlatformType.DOUYIN

    async def extract_post(self, url: str) -> PlatformPost:
        """
        Extract video post from Douyin URL.

        Args:
            url: Douyin video URL

        Returns:
            PlatformPost with video data
        """
        video_id = self._extract_video_id(url)

        if not video_id:
            raise ValueError(f"Invalid Douyin URL: {url}")

        headers = self._make_headers(
            {
                "Referer": self.config.base_url,
            }
        )

        try:
            import httpx

            async with httpx.AsyncClient(
                headers=headers,
                timeout=self.config.timeout,
            ) as client:
                api_url = f"{self.config.api_url}/aweme/detail/?aweme_id={video_id}"
                response = await client.get(api_url)
                response.raise_for_status()
                data = response.json()

                aweme = data.get("aweme_detail", {})

                video_url = ""
                if aweme.get("video", {}).get("play_addr", {}).get("url_list"):
                    video_url = aweme["video"]["play_addr"]["url_list"][0]

                images = []
                if aweme.get("image_post_info", {}).get("images"):
                    images = [
                        img.get("display_url", "")
                        for img in aweme["image_post_info"]["images"]
                    ]

                author = aweme.get("author", {})

                return PlatformPost(
                    platform=self.platform_name,
                    post_id=str(video_id),
                    url=url,
                    title=aweme.get("desc", ""),
                    content=aweme.get("desc", ""),
                    author=author.get("nickname", ""),
                    author_id=author.get("uid", ""),
                    videos=[video_url] if video_url else [],
                    images=images,
                    likes=aweme.get("statistics", {}).get("digg_count"),
                    comments=aweme.get("statistics", {}).get("comment_count"),
                    shares=aweme.get("statistics", {}).get("share_count"),
                    views=aweme.get("statistics", {}).get("play_count"),
                    published_at=aweme.get("create_time"),
                    raw_data=aweme,
                )

        except Exception as e:
            return PlatformPost(
                platform=self.platform_name,
                post_id=str(video_id),
                url=url,
                title=f"Video {video_id}",
                metadata={"error": str(e)},
            )

    async def extract_user_posts(
        self, user_id: str, limit: int = 20
    ) -> list[PlatformPost]:
        """
        Extract posts from user profile.

        Args:
            user_id: User unique ID or short ID
            limit: Maximum posts to retrieve

        Returns:
            List of PlatformPost objects
        """
        headers = self._make_headers(
            {
                "Referer": self.config.base_url,
            }
        )

        posts = []

        try:
            import httpx

            async with httpx.AsyncClient(
                headers=headers,
                timeout=self.config.timeout,
            ) as client:
                cursor = 0
                count = 0

                while count < limit:
                    page_size = min(18, limit - count)

                    api_url = (
                        f"{self.config.api_url}/user/profile/other/"
                        f"?user_id={user_id}&max_cursor=0&count={page_size}"
                    )

                    response = await client.get(api_url)
                    response.raise_for_status()
                    data = response.json()

                    aweme_list = data.get("aweme_list", [])

                    if not aweme_list:
                        break

                    for aweme in aweme_list:
                        video_url = ""
                        if aweme.get("video", {}).get("play_addr", {}).get("url_list"):
                            video_url = aweme["video"]["play_addr"]["url_list"][0]

                        post = PlatformPost(
                            platform=self.platform_name,
                            post_id=str(aweme.get("aweme_id", "")),
                            url=f"{self.config.base_url}/video/{aweme.get('aweme_id')}",
                            title=aweme.get("desc", ""),
                            content=aweme.get("desc", ""),
                            author=aweme.get("author", {}).get("nickname", ""),
                            author_id=user_id,
                            videos=[video_url] if video_url else [],
                            likes=aweme.get("statistics", {}).get("digg_count"),
                            comments=aweme.get("statistics", {}).get("comment_count"),
                            shares=aweme.get("statistics", {}).get("share_count"),
                            views=aweme.get("statistics", {}).get("play_count"),
                            raw_data=aweme,
                        )
                        posts.append(post)
                        count += 1

                    has_more = data.get("has_more", 0)
                    if not has_more:
                        break

                    await asyncio.sleep(0.5)

        except Exception:
            pass

        return posts[:limit]

    def _extract_video_id(self, url: str) -> Optional[str]:
        """Extract video ID from URL."""
        for pattern in self.VIDEO_URL_PATTERNS:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        return None

    @staticmethod
    def extract_video_url_from_share(share_url: str) -> Optional[str]:
        """
        Extract original video URL from share link.

        Args:
            share_url: Douyin share URL

        Returns:
            Original video URL or None
        """
        try:
            import httpx

            async def _extract():
                async with httpx.AsyncClient(follow_redirects=True) as client:
                    response = await client.head(share_url, timeout=10)
                    return str(response.url)

            return asyncio.run(_extract())
        except Exception:
            return None
