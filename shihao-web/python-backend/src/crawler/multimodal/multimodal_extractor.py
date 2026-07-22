"""Multimodal extractor - Unified interface for extracting all content types."""

from dataclasses import dataclass, field
from typing import Optional, Union
from lxml import html

from .text_extractor import TextExtractor, TextExtractOptions
from .image_extractor import ImageExtractor, ImageExtractOptions, ImageInfo
from .video_extractor import VideoExtractor, VideoExtractOptions, VideoInfo
from .audio_extractor import AudioExtractor, AudioExtractOptions, AudioInfo


@dataclass
class MultimodalResult:
    """Combined extraction result."""

    text: str = ""
    images: list[ImageInfo] = field(default_factory=list)
    videos: list[VideoInfo] = field(default_factory=list)
    audio: list[AudioInfo] = field(default_factory=list)

    urls: list[str] = field(default_factory=list)
    links: list[dict] = field(default_factory=list)

    title: Optional[str] = None
    description: Optional[str] = None
    author: Optional[str] = None
    published_time: Optional[str] = None

    raw_content: str = ""
    content_type: str = "html"

    @property
    def has_multimedia(self) -> bool:
        """Check if content has any multimedia."""
        return bool(self.images or self.videos or self.audio)

    @property
    def media_count(self) -> int:
        """Total count of media items."""
        return len(self.images) + len(self.videos) + len(self.audio)

    def to_dict(self) -> dict:
        """Convert to dictionary."""
        return {
            "text": self.text,
            "images": [
                {
                    "url": img.url,
                    "alt": img.alt,
                    "title": img.title,
                    "width": img.width,
                    "height": img.height,
                }
                for img in self.images
            ],
            "videos": [
                {
                    "url": vid.url,
                    "thumbnail_url": vid.thumbnail_url,
                    "platform": vid.platform,
                    "duration": vid.duration,
                }
                for vid in self.videos
            ],
            "audio": [
                {
                    "url": aud.url,
                    "title": aud.title,
                    "platform": aud.platform,
                    "duration": aud.duration,
                }
                for aud in self.audio
            ],
            "urls": self.urls,
            "links": self.links,
            "metadata": {
                "title": self.title,
                "description": self.description,
                "author": self.author,
                "published_time": self.published_time,
            },
        }


@dataclass
class MultimodalExtractOptions:
    """Options for multimodal extraction."""

    extract_text: bool = True
    extract_images: bool = True
    extract_videos: bool = True
    extract_audio: bool = True
    extract_links: bool = True
    extract_metadata: bool = True

    text_options: Optional[TextExtractOptions] = None
    image_options: Optional[ImageExtractOptions] = None
    video_options: Optional[VideoExtractOptions] = None
    audio_options: Optional[AudioExtractOptions] = None

    base_url: Optional[str] = None


class MultimodalExtractor:
    """
    Unified extractor for all content types.

    Extracts text, images, videos, audio, links, and metadata
    from HTML, markdown, and other formats in a single pass.

    Example:
        extractor = MultimodalExtractor()
        result = extractor.extract(html_content, base_url="https://example.com")

        print(f"Text: {result.text[:100]}...")
        print(f"Images: {len(result.images)}")
        print(f"Videos: {len(result.videos)}")
    """

    def __init__(self, options: Optional[MultimodalExtractOptions] = None):
        """
        Initialize multimodal extractor.

        Args:
            options: Global extraction options
        """
        self.options = options or MultimodalExtractOptions()

    def extract(
        self,
        content: str,
        content_type: str = "html",
        base_url: Optional[str] = None,
        options: Optional[MultimodalExtractOptions] = None,
    ) -> MultimodalResult:
        """
        Extract all content types from input.

        Args:
            content: Raw content to extract from
            content_type: Content type (html, markdown, text)
            base_url: Base URL for resolving relative links
            options: Override global options

        Returns:
            MultimodalResult with all extracted content
        """
        opts = options or self.options
        base_url = base_url or opts.base_url

        result = MultimodalResult(
            raw_content=content,
            content_type=content_type,
        )

        if opts.extract_text:
            result.text = TextExtractor.extract(
                content,
                content_type=content_type,
                options=opts.text_options,
            )

        if opts.extract_images:
            image_opts = opts.image_options or ImageExtractOptions(base_url=base_url)
            if not image_opts.base_url:
                image_opts.base_url = base_url
            result.images = ImageExtractor.extract(
                content,
                content_type=content_type,
                options=image_opts,
            )

        if opts.extract_videos:
            video_opts = opts.video_options or VideoExtractOptions(base_url=base_url)
            if not video_opts.base_url:
                video_opts.base_url = base_url
            result.videos = VideoExtractor.extract(
                content,
                content_type=content_type,
                options=video_opts,
            )

        if opts.extract_audio:
            audio_opts = opts.audio_options or AudioExtractOptions(base_url=base_url)
            if not audio_opts.base_url:
                audio_opts.base_url = base_url
            result.audio = AudioExtractor.extract(
                content,
                content_type=content_type,
                options=audio_opts,
            )

        if opts.extract_links:
            result.links = self._extract_links(content, base_url)
            result.urls = [link["href"] for link in result.links]

        if opts.extract_metadata:
            metadata = self._extract_metadata(content, base_url)
            result.title = metadata.get("title")
            result.description = metadata.get("description")
            result.author = metadata.get("author")
            result.published_time = metadata.get("published_time")

        return result

    def _extract_links(self, content: str, base_url: Optional[str]) -> list[dict]:
        """Extract all links from HTML."""
        if not content:
            return []

        from urllib.parse import urljoin

        links: list[dict] = []

        try:
            tree = html.fromstring(content)

            for a in tree.xpath(".//a[@href]"):
                try:
                    href = a.get("href", "")
                    if not href or href.startswith(("javascript:", "mailto:", "#")):
                        continue

                    if base_url and not href.startswith("http"):
                        href = urljoin(base_url, href)

                    text = a.text_content().strip()

                    links.append(
                        {
                            "href": href,
                            "text": text or None,
                            "title": a.get("title") or None,
                            "rel": a.get("rel") or None,
                        }
                    )
                except Exception:
                    continue

        except Exception:
            pass

        return links

    def _extract_metadata(self, content: str, base_url: Optional[str]) -> dict:
        """Extract metadata from HTML."""
        if not content:
            return {}

        metadata: dict = {}

        try:
            tree = html.fromstring(content)

            title_elem = tree.xpath("//title")
            if title_elem:
                metadata["title"] = title_elem[0].text_content().strip()

            for meta in tree.xpath(".//meta"):
                name = meta.get("name") or meta.get("property", "")
                content_val = meta.get("content", "")

                name_lower = name.lower()

                if name_lower in (
                    "description",
                    "og:description",
                    "twitter:description",
                ):
                    metadata["description"] = content_val
                elif name_lower in ("author", "article:author", "twitter:creator"):
                    metadata["author"] = content_val
                elif name_lower in (
                    "published_time",
                    "article:published_time",
                    "datePublished",
                ):
                    metadata["published_time"] = content_val
                elif name_lower in ("og:title", "twitter:title"):
                    if "title" not in metadata:
                        metadata["title"] = content_val

            author_elem = tree.xpath('.//*[@itemprop="author"]//*[@itemprop="name"]')
            if author_elem:
                metadata["author"] = author_elem[0].text_content().strip()

            time_elem = tree.xpath(".//time[@datetime]/@datetime")
            if time_elem and "published_time" not in metadata:
                metadata["published_time"] = time_elem[0]

        except Exception:
            pass

        return metadata

    @staticmethod
    def quick(content: str, content_type: str = "html") -> MultimodalResult:
        """
        Quick extraction with sensible defaults.

        Args:
            content: Raw content
            content_type: Content type

        Returns:
            MultimodalResult
        """
        extractor = MultimodalExtractor()
        return extractor.extract(content, content_type=content_type)
