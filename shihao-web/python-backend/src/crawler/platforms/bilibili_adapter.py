"""Bilibili (B站) platform adapter."""

import re
import asyncio
from typing import Optional
from urllib.parse import urlparse

from .base_adapter import (
    BasePlatformAdapter,
    PlatformType,
    PlatformConfig,
    PlatformCredentials,
    PlatformPost,
)


class BilibiliAdapter(BasePlatformAdapter):
    """
    Adapter for Bilibili (B站) video platform.

    Supports:
    - Video extraction
    - User profile posts
    - Comments extraction
    - Subtitle extraction
    """

    VIDEO_URL_PATTERNS = [
        r"bilibili\.com/video/([Bb][Vv][a-zA-Z0-9]+)",
        r"b23\.tv/([a-zA-Z0-9]+)",
    ]

    USER_URL_PATTERNS = [
        r"bilibili\.com/([a-zA-Z0-9_-]+)/[a-z]+",
    ]

    def __init__(
        self,
        config: Optional[PlatformConfig] = None,
        credentials: Optional[PlatformCredentials] = None,
    ):
        config = config or PlatformConfig(
            base_url="https://www.bilibili.com",
            api_url="https://api.bilibili.com",
            requires_auth=False,
            rate_limit=10,
        )
        super().__init__(config, credentials)

    @property
    def platform_type(self) -> PlatformType:
        return PlatformType.BILIBILI

    async def extract_post(self, url: str) -> PlatformPost:
        """
        Extract video post from Bilibili URL.

        Args:
            url: Bilibili video URL

        Returns:
            PlatformPost with video data
        """
        bvid = self._extract_bvid(url)

        if not bvid:
            raise ValueError(f"Invalid Bilibili URL: {url}")

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
                api_url = f"{self.config.api_url}/x/web-interface/view?bvid={bvid}"
                response = await client.get(api_url)
                response.raise_for_status()
                data = response.json()

                if data.get("code") != 0:
                    raise Exception(data.get("message", "API error"))

                video_data = data.get("data", {})

                cid = video_data.get("cid")
                uploader_mid = video_data.get("owner", {}).get("mid")

                subtitle_url = None
                if cid and uploader_mid:
                    subtitle_url = (
                        f"{self.config.api_url}/x/player/v2?bvid={bvid}&cid={cid}"
                    )

                videos = []
                if video_data.get("pages"):
                    for page in video_data["pages"]:
                        page_url = f"{url}?p={page['page']}"
                        videos.append(page_url)

                return PlatformPost(
                    platform=self.platform_name,
                    post_id=bvid,
                    url=url,
                    title=video_data.get("title", ""),
                    content=video_data.get("desc", ""),
                    author=video_data.get("owner", {}).get("name", ""),
                    author_id=str(uploader_mid) if uploader_mid else None,
                    videos=videos if videos else [url],
                    images=[video_data.get("pic", "")] if video_data.get("pic") else [],
                    likes=video_data.get("stat", {}).get("like"),
                    comments=video_data.get("stat", {}).get("reply"),
                    shares=video_data.get("stat", {}).get("share"),
                    views=video_data.get("stat", {}).get("view"),
                    published_at=video_data.get("pubdate"),
                    raw_data=video_data,
                    metadata={
                        "duration": video_data.get("duration"),
                        "dimension": video_data.get("dimension", {}),
                        "tname": video_data.get("tname"),
                        "subtitle_url": subtitle_url,
                    },
                )

        except Exception as e:
            return PlatformPost(
                platform=self.platform_name,
                post_id=bvid or "unknown",
                url=url,
                title=f"Video {bvid}",
                metadata={"error": str(e)},
            )

    async def extract_user_posts(
        self, user_id: str, limit: int = 20
    ) -> list[PlatformPost]:
        """
        Extract videos from user profile.

        Args:
            user_id: User mid
            limit: Maximum videos to retrieve

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
                pn = 1
                count = 0

                while count < limit:
                    page_size = min(30, limit - count)

                    api_url = (
                        f"{self.config.api_url}/x/space/wbi/arc/search"
                        f"?mid={user_id}&pn={pn}&ps={page_size}&jsonp=jsonp"
                    )

                    response = await client.get(api_url)
                    response.raise_for_status()
                    data = response.json()

                    vlist = data.get("data", {}).get("list", {}).get("vlist", [])

                    if not vlist:
                        break

                    for video in vlist:
                        bvid = video.get("bvid", "")

                        post = PlatformPost(
                            platform=self.platform_name,
                            post_id=bvid,
                            url=f"{self.config.base_url}/video/{bvid}",
                            title=video.get("title", ""),
                            content=video.get("description", ""),
                            author=video.get("author", ""),
                            author_id=str(user_id),
                            videos=[f"{self.config.base_url}/video/{bvid}"],
                            images=[video.get("pic", "")] if video.get("pic") else [],
                            likes=video.get("like"),
                            comments=video.get("comment"),
                            shares=video.get("share"),
                            views=video.get("view"),
                            published_at=video.get("created"),
                            raw_data=video,
                        )
                        posts.append(post)
                        count += 1

                    has_more = data.get("data", {}).get("pagecount", 1)
                    if pn >= has_more:
                        break

                    pn += 1
                    await asyncio.sleep(0.3)

        except Exception:
            pass

        return posts[:limit]

    def _extract_bvid(self, url: str) -> Optional[str]:
        """Extract BVID from URL."""
        if "b23.tv" in url.lower():
            return self._resolve_short_url(url)

        for pattern in self.VIDEO_URL_PATTERNS:
            match = re.search(pattern, url)
            if match:
                return match.group(1).upper()
        return None

    def _resolve_short_url(self, short_url: str) -> Optional[str]:
        """Resolve b23.tv short URL to BVID."""
        try:
            import httpx

            with httpx.Client(follow_redirects=False) as client:
                response = client.head(short_url, timeout=10)
                location = response.headers.get("location", "")

                if location:
                    return self._extract_bvid(location)

        except Exception:
            pass

        return None

    async def get_comments(
        self, bvid: str, oid: Optional[str] = None, limit: int = 20
    ) -> list[dict]:
        """
        Get comments for a video.

        Args:
            bvid: Video BVID
            oid: Comment root ID (usually same as cid)
            limit: Maximum comments

        Returns:
            List of comment data
        """
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
                pn = 1
                comments = []

                while len(comments) < limit:
                    api_url = (
                        f"{self.config.api_url}/x/v2/reply"
                        f"?type=1&oid={bvid}&pn={pn}&ps=20&jsonp=jsonp"
                    )

                    response = await client.get(api_url)
                    response.raise_for_status()
                    data = response.json()

                    replies = data.get("data", {}).get("replies", []) or []

                    if not replies:
                        break

                    for reply in replies:
                        comments.append(
                            {
                                "rpid": reply.get("rpid"),
                                "uname": reply.get("member", {}).get("uname", ""),
                                "content": reply.get("content", {}).get("message", ""),
                                "like": reply.get("like", 0),
                                "ctime": reply.get("ctime"),
                            }
                        )

                    has_more = (
                        data.get("data", {}).get("cursor", {}).get("is_end", True)
                    )
                    if has_more:
                        break

                    pn += 1

                return comments[:limit]

        except Exception:
            return []
