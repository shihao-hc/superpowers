"""Video extractor - Extract videos from HTML/content."""

from typing import Optional
from dataclasses import dataclass, field
from urllib.parse import urljoin
import re


@dataclass
class VideoInfo:
    """Information about an extracted video."""

    url: str
    thumbnail_url: Optional[str] = None
    poster_url: Optional[str] = None
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    mime_type: Optional[str] = None
    source: Optional[str] = None
    platform: Optional[str] = None
    is_embeddable: bool = True
    is_lazy_loaded: bool = False
    subtitles: list[dict] = field(default_factory=list)


@dataclass
class VideoExtractOptions:
    """Options for video extraction."""

    base_url: Optional[str] = None
    include_iframes: bool = True
    include_direct: bool = True
    include_social_embeds: bool = True
    max_videos: Optional[int] = None
    platforms: list[str] = field(default_factory=list)


PLATFORM_PATTERNS = {
    "youtube": {
        "pattern": r"(?:youtube\.com/(?:watch\?v=|embed/|v/)|youtu\.be/)([a-zA-Z0-9_-]{11})",
        "embed_url": "https://www.youtube.com/embed/{video_id}",
        "thumbnail_url": "https://img.youtube.com/vi/{video_id}/maxresdefault.jpg",
    },
    "bilibili": {
        "pattern": r"bilibili\.com/video/([Bb][Vv][a-zA-Z0-9]+)",
        "embed_url": "https://player.bilibili.com/player.html?bvid={video_id}",
    },
    "douyin": {
        "pattern": r"douyin\.com/video/(\d+)",
        "embed_url": None,
    },
    "xiaohongshu": {
        "pattern": r"xiaohongshu\.com/explore/([a-zA-Z0-9]+)",
        "embed_url": None,
    },
    "vimeo": {
        "pattern": r"vimeo\.com/(\d+)",
        "embed_url": "https://player.vimeo.com/video/{video_id}",
    },
    "twitter": {
        "pattern": r"(?:twitter|x)\.com/\w+/status/(\d+)",
        "embed_url": None,
    },
}


class VideoExtractor:
    """
    Extract videos from HTML, markdown, and other content.

    Supports:
    - <video> tag extraction
    - <source> tag parsing
    - <iframe> embeds for social platforms
    - Platform-specific video URLs
    - Thumbnail extraction
    """

    @staticmethod
    def extract_from_html(
        html_content: str,
        options: Optional[VideoExtractOptions] = None,
    ) -> list[VideoInfo]:
        """
        Extract videos from HTML content.

        Args:
            html_content: Raw HTML string
            options: Extraction options

        Returns:
            List of VideoInfo objects
        """
        if not html_content:
            return []

        options = options or VideoExtractOptions()
        from lxml import html

        try:
            tree = html.fromstring(html_content)
            videos: list[VideoInfo] = []

            if options.include_direct:
                video_elements = tree.xpath(".//video")

                for video in video_elements:
                    try:
                        url = video.get("src") or video.get("data-src") or ""

                        if not url:
                            sources = video.xpath(".//source[@src]")
                            if sources:
                                url = sources[0].get("src")

                        if not url:
                            continue

                        if options.base_url and not url.startswith(
                            ("http://", "https://")
                        ):
                            url = urljoin(options.base_url, url)

                        poster = video.get("poster") or ""
                        if (
                            options.base_url
                            and poster
                            and not poster.startswith("http")
                        ):
                            poster = urljoin(options.base_url, poster)

                        duration = video.get("duration")
                        try:
                            duration = float(duration) if duration else None
                        except (ValueError, TypeError):
                            duration = None

                        is_lazy = bool(
                            video.get("preload") == "none"
                            or video.get("loading") == "lazy"
                            or video.get("data-src")
                        )

                        videos.append(
                            VideoInfo(
                                url=url,
                                poster_url=poster or None,
                                duration=duration,
                                width=video.get("width"),
                                height=video.get("height"),
                                mime_type=video.get("type"),
                                is_embeddable=True,
                                is_lazy_loaded=is_lazy,
                            )
                        )

                    except Exception:
                        continue

                iframe_elements = tree.xpath(".//iframe[@src]")

                for iframe in iframe_elements:
                    try:
                        src = iframe.get("src", "")

                        if not options.include_social_embeds:
                            if any(
                                pattern in src.lower()
                                for pattern in [
                                    "youtube",
                                    "bilibili",
                                    "vimeo",
                                    "douyin",
                                ]
                            ):
                                continue

                        platform = None
                        video_id = None

                        for plat_name, plat_info in PLATFORM_PATTERNS.items():
                            if options.platforms and plat_name not in options.platforms:
                                continue

                            match = re.search(plat_info["pattern"], src)
                            if match:
                                platform = plat_name
                                video_id = match.group(1)
                                break

                        if platform or options.include_iframes:
                            if options.base_url and not src.startswith("http"):
                                src = urljoin(options.base_url, src)

                            videos.append(
                                VideoInfo(
                                    url=src,
                                    platform=platform,
                                    is_embeddable=iframe.get("allowfullscreen")
                                    is not None,
                                )
                            )

                    except Exception:
                        continue

            if options.include_social_embeds:
                social_videos = VideoExtractor._extract_social_videos(
                    html_content, options
                )
                videos.extend(social_videos)

            if options.max_videos:
                videos = videos[: options.max_videos]

            return videos

        except Exception:
            return []

    @staticmethod
    def _extract_social_videos(
        html_content: str,
        options: VideoExtractOptions,
    ) -> list[VideoInfo]:
        """Extract social platform video links."""
        videos: list[VideoInfo] = []

        for plat_name, plat_info in PLATFORM_PATTERNS.items():
            if options.platforms and plat_name not in options.platforms:
                continue

            matches = re.finditer(plat_info["pattern"], html_content)

            for match in matches:
                try:
                    url = match.group(0)
                    video_id = match.group(1)

                    embed_url = None
                    if plat_info.get("embed_url"):
                        embed_url = plat_info["embed_url"].format(video_id=video_id)

                    thumbnail_url = None
                    if plat_info.get("thumbnail_url"):
                        thumbnail_url = plat_info["thumbnail_url"].format(
                            video_id=video_id
                        )

                    videos.append(
                        VideoInfo(
                            url=url,
                            thumbnail_url=thumbnail_url,
                            platform=plat_name,
                            is_embeddable=embed_url is not None,
                        )
                    )
                except Exception:
                    continue

        return videos

    @staticmethod
    def extract_from_markdown(
        markdown_content: str,
        options: Optional[VideoExtractOptions] = None,
    ) -> list[VideoInfo]:
        """
        Extract videos from markdown content.

        Args:
            markdown_content: Markdown string
            options: Extraction options

        Returns:
            List of VideoInfo objects
        """
        if not markdown_content:
            return []

        options = options or VideoExtractOptions()
        videos: list[VideoInfo] = []

        video_pattern = r"!\[([^\]]*)\]\(([^\)]+\.(?:mp4|webm|ogg|mov)(?:\?[^\)]+)?)\)"
        matches = re.findall(video_pattern, markdown_content, re.IGNORECASE)

        for alt, url in matches:
            if options.base_url and not url.startswith("http"):
                url = urljoin(options.base_url, url)

            videos.append(
                VideoInfo(
                    url=url,
                    is_lazy_loaded=False,
                )
            )

        link_pattern = r"\[([^\]]+)\]\(([^\)]+)\)"
        link_matches = re.findall(link_pattern, markdown_content)

        for text, url in link_matches:
            if any(platform in url.lower() for platform in PLATFORM_PATTERNS.keys()):
                platform = next(
                    (
                        p
                        for p, info in PLATFORM_PATTERNS.items()
                        if re.search(info["pattern"], url)
                    ),
                    None,
                )

                videos.append(
                    VideoInfo(
                        url=url,
                        platform=platform,
                        is_embeddable=True,
                    )
                )

        if options.max_videos:
            videos = videos[: options.max_videos]

        return videos

    @staticmethod
    def extract(
        content: str,
        content_type: str = "html",
        options: Optional[VideoExtractOptions] = None,
    ) -> list[VideoInfo]:
        """
        Extract videos from any content type.

        Args:
            content: Raw content
            content_type: Content type (html, markdown)
            options: Extraction options

        Returns:
            List of VideoInfo objects
        """
        content_type = content_type.lower()

        if content_type in ("html", "htm"):
            return VideoExtractor.extract_from_html(content, options)
        elif content_type in ("md", "markdown"):
            return VideoExtractor.extract_from_markdown(content, options)

        return []

    @staticmethod
    def get_embed_url(video_url: str) -> Optional[str]:
        """
        Get embeddable URL for a video.

        Args:
            video_url: Original video URL

        Returns:
            Embed URL or None
        """
        for plat_name, plat_info in PLATFORM_PATTERNS.items():
            match = re.search(plat_info["pattern"], video_url)
            if match:
                video_id = match.group(1)
                if plat_info.get("embed_url"):
                    return plat_info["embed_url"].format(video_id=video_id)
                return None

        return None
