"""Audio extractor - Extract audio from HTML/content."""

from typing import Optional
from dataclasses import dataclass, field
from urllib.parse import urljoin
import re


@dataclass
class AudioInfo:
    """Information about an extracted audio."""

    url: str
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    duration: Optional[float] = None
    mime_type: Optional[str] = None
    source: Optional[str] = None
    platform: Optional[str] = None
    is_lazy_loaded: bool = False
    transcript: Optional[str] = None


@dataclass
class AudioExtractOptions:
    """Options for audio extraction."""

    base_url: Optional[str] = None
    include_audio_tag: bool = True
    include_podcast_embeds: bool = True
    max_audio: Optional[int] = None
    platforms: list[str] = field(default_factory=list)


PLATFORM_AUDIO_PATTERNS = {
    "spotify": {
        "pattern": r"(?:spotify\.com/(?:embed/|track/|episode/)|open\.spotify\.com/embed/)([a-zA-Z0-9]+)",
        "embed_url": "https://open.spotify.com/embed/{audio_id}",
    },
    "soundcloud": {
        "pattern": r"soundcloud\.com/([a-zA-Z0-9-]+/[a-zA-Z0-9-]+)",
        "embed_url": "https://w.soundcloud.com/player/?url={encoded_url}&color=%23ff5500&auto_play=false&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false",
    },
    "apple_podcasts": {
        "pattern": r"podcasts\.apple\.com/[a-z]{2}/podcast/[^/]+/id(\d+)",
        "embed_url": None,
    },
    "喜马拉雅": {
        "pattern": r"ximalaya\.com/(\d+)/(\d+)",
        "embed_url": None,
    },
    "网易云音乐": {
        "pattern": r"music\.163\.com/#/song\?id=(\d+)",
        "embed_url": None,
    },
}


class AudioExtractor:
    """
    Extract audio from HTML, markdown, and other content.

    Supports:
    - <audio> tag extraction
    - <source> tag parsing
    - Podcast embeds
    - Platform-specific audio URLs
    - Transcript extraction (when available)
    """

    @staticmethod
    def extract_from_html(
        html_content: str,
        options: Optional[AudioExtractOptions] = None,
    ) -> list[AudioInfo]:
        """
        Extract audio from HTML content.

        Args:
            html_content: Raw HTML string
            options: Extraction options

        Returns:
            List of AudioInfo objects
        """
        if not html_content:
            return []

        options = options or AudioExtractOptions()
        from lxml import html

        try:
            tree = html.fromstring(html_content)
            audio_list: list[AudioInfo] = []

            if options.include_audio_tag:
                audio_elements = tree.xpath(".//audio")

                for audio in audio_elements:
                    try:
                        url = audio.get("src") or audio.get("data-src") or ""

                        if not url:
                            sources = audio.xpath(".//source[@src]")
                            if sources:
                                url = sources[0].get("src")

                        if not url:
                            continue

                        if options.base_url and not url.startswith(
                            ("http://", "https://")
                        ):
                            url = urljoin(options.base_url, url)

                        title_elem = audio.xpath("./@title")
                        title = title_elem[0] if title_elem else None

                        duration = audio.get("duration")
                        try:
                            duration = float(duration) if duration else None
                        except (ValueError, TypeError):
                            duration = None

                        is_lazy = bool(
                            audio.get("preload") == "none" or audio.get("data-src")
                        )

                        audio_list.append(
                            AudioInfo(
                                url=url,
                                title=title,
                                duration=duration,
                                mime_type=audio.get("type"),
                                is_lazy_loaded=is_lazy,
                            )
                        )

                    except Exception:
                        continue

                iframes = tree.xpath(".//iframe[@src]")

                for iframe in iframes:
                    src = iframe.get("src", "")

                    for plat_name, plat_info in PLATFORM_AUDIO_PATTERNS.items():
                        if options.platforms and plat_name not in options.platforms:
                            continue

                        match = re.search(plat_info["pattern"], src)
                        if match:
                            if options.base_url and not src.startswith("http"):
                                src = urljoin(options.base_url, src)

                            audio_list.append(
                                AudioInfo(
                                    url=src,
                                    platform=plat_name,
                                    source="iframe",
                                )
                            )
                            break

            if options.include_podcast_embeds:
                podcast_audio = AudioExtractor._extract_podcast_links(
                    html_content, options
                )
                audio_list.extend(podcast_audio)

            if options.max_audio:
                audio_list = audio_list[: options.max_audio]

            return audio_list

        except Exception:
            return []

    @staticmethod
    def _extract_podcast_links(
        html_content: str,
        options: AudioExtractOptions,
    ) -> list[AudioInfo]:
        """Extract podcast/audio platform links."""
        audio_list: list[AudioInfo] = []

        for plat_name, plat_info in PLATFORM_AUDIO_PATTERNS.items():
            if options.platforms and plat_name not in options.platforms:
                continue

            matches = re.finditer(plat_info["pattern"], html_content)

            for match in matches:
                try:
                    url = match.group(0)
                    audio_id = match.group(1) if match.lastindex >= 1 else None

                    embed_url = None
                    if plat_info.get("embed_url") and audio_id:
                        if plat_name == "soundcloud":
                            from urllib.parse import quote

                            embed_url = plat_info["embed_url"].format(
                                encoded_url=quote(url, safe="")
                            )
                        else:
                            embed_url = plat_info["embed_url"].format(audio_id=audio_id)

                    audio_list.append(
                        AudioInfo(
                            url=url,
                            platform=plat_name,
                            source="link",
                        )
                    )
                except Exception:
                    continue

        return audio_list

    @staticmethod
    def extract_from_markdown(
        markdown_content: str,
        options: Optional[AudioExtractOptions] = None,
    ) -> list[AudioInfo]:
        """
        Extract audio from markdown content.

        Args:
            markdown_content: Markdown string
            options: Extraction options

        Returns:
            List of AudioInfo objects
        """
        if not markdown_content:
            return []

        options = options or AudioExtractOptions()
        audio_list: list[AudioInfo] = []

        audio_pattern = (
            r"!\[([^\]]*)\]\(([^\)]+\.(?:mp3|wav|ogg|m4a|aac|flac)(?:\?[^\)]+)?)\)"
        )
        matches = re.findall(audio_pattern, markdown_content, re.IGNORECASE)

        for alt, url in matches:
            if options.base_url and not url.startswith("http"):
                url = urljoin(options.base_url, url)

            audio_list.append(
                AudioInfo(
                    url=url,
                    title=alt or None,
                    is_lazy_loaded=False,
                )
            )

        link_pattern = r"\[([^\]]+)\]\(([^\)]+)\)"
        link_matches = re.findall(link_pattern, markdown_content)

        for text, url in link_matches:
            for plat_name, plat_info in PLATFORM_AUDIO_PATTERNS.items():
                if options.platforms and plat_name not in options.platforms:
                    continue

                if re.search(plat_info["pattern"], url):
                    audio_list.append(
                        AudioInfo(
                            url=url,
                            title=text,
                            platform=plat_name,
                        )
                    )
                    break

        if options.max_audio:
            audio_list = audio_list[: options.max_audio]

        return audio_list

    @staticmethod
    def extract(
        content: str,
        content_type: str = "html",
        options: Optional[AudioExtractOptions] = None,
    ) -> list[AudioInfo]:
        """
        Extract audio from any content type.

        Args:
            content: Raw content
            content_type: Content type (html, markdown)
            options: Extraction options

        Returns:
            List of AudioInfo objects
        """
        content_type = content_type.lower()

        if content_type in ("html", "htm"):
            return AudioExtractor.extract_from_html(content, options)
        elif content_type in ("md", "markdown"):
            return AudioExtractor.extract_from_markdown(content, options)

        return []

    @staticmethod
    def get_embed_url(audio_url: str) -> Optional[str]:
        """
        Get embeddable URL for audio.

        Args:
            audio_url: Original audio URL

        Returns:
            Embed URL or None
        """
        for plat_name, plat_info in PLATFORM_AUDIO_PATTERNS.items():
            match = re.search(plat_info["pattern"], audio_url)
            if match:
                audio_id = match.group(1) if match.lastindex >= 1 else None
                if plat_info.get("embed_url") and audio_id:
                    if plat_name == "soundcloud":
                        from urllib.parse import quote

                        return plat_info["embed_url"].format(
                            encoded_url=quote(audio_url, safe="")
                        )
                    return plat_info["embed_url"].format(audio_id=audio_id)
                return None

        return None
