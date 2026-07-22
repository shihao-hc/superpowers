"""Image extractor - Extract images from HTML/content."""

from typing import Optional, TypedDict
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse
import re


@dataclass
class ImageInfo:
    """Information about an extracted image."""

    url: str
    alt: Optional[str] = None
    title: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    file_size: Optional[int] = None
    mime_type: Optional[str] = None
    srcset: Optional[str] = None
    is_lazy_loaded: bool = False
    context: Optional[str] = None


@dataclass
class ImageExtractOptions:
    """Options for image extraction."""

    base_url: Optional[str] = None
    min_width: Optional[int] = None
    min_height: Optional[int] = None
    max_images: Optional[int] = None
    include_lazy_loaded: bool = True
    include_icons: bool = False
    include_backgrounds: bool = True
    exclude_domains: list[str] = field(default_factory=list)


class ImageExtractor:
    """
    Extract images from HTML, markdown, and other content.

    Supports:
    - <img> tag extraction
    - srcset parsing
    - Lazy-loaded images
    - Background images
    - Relative URL resolution
    - Size filtering
    """

    @staticmethod
    def extract_from_html(
        html_content: str,
        options: Optional[ImageExtractOptions] = None,
    ) -> list[ImageInfo]:
        """
        Extract images from HTML content.

        Args:
            html_content: Raw HTML string
            options: Extraction options

        Returns:
            List of ImageInfo objects
        """
        if not html_content:
            return []

        options = options or ImageExtractOptions()
        from lxml import html

        try:
            tree = html.fromstring(html_content)
            images: list[ImageInfo] = []

            for img in tree.xpath(".//img"):
                try:
                    url = img.get("src", "")

                    if not url:
                        data_src = img.get("data-src") or img.get("data-lazy-src")
                        if data_src:
                            url = data_src

                    if not url:
                        continue

                    if options.base_url and not url.startswith(
                        ("http://", "https://", "//")
                    ):
                        url = urljoin(options.base_url, url)

                    if url.startswith("//"):
                        url = "https:" + url

                    if options.exclude_domains:
                        parsed = urlparse(url)
                        if any(
                            domain in parsed.netloc
                            for domain in options.exclude_domains
                        ):
                            continue

                    alt = img.get("alt", "")
                    title = img.get("title", "")
                    width = img.get("width")
                    height = img.get("height")
                    srcset = img.get("srcset", "")

                    is_lazy = bool(
                        img.get("loading") == "lazy"
                        or "lazy" in (img.get("class") or "").lower()
                        or img.get("data-src")
                    )

                    try:
                        width = int(width) if width else None
                        height = int(height) if height else None
                    except (ValueError, TypeError):
                        width = None
                        height = None

                    if options.min_width and width and width < options.min_width:
                        continue
                    if options.min_height and height and height < options.min_height:
                        continue
                    if (
                        not options.include_icons
                        and width
                        and width < 64
                        and height
                        and height < 64
                    ):
                        continue

                    img_info = ImageInfo(
                        url=url,
                        alt=alt or None,
                        title=title or None,
                        width=width,
                        height=height,
                        srcset=srcset or None,
                        is_lazy_loaded=is_lazy,
                    )
                    images.append(img_info)

                except Exception:
                    continue

            if options.include_backgrounds:
                bg_images = ImageExtractor._extract_background_images(tree, options)
                images.extend(bg_images)

            if options.max_images:
                images = images[: options.max_images]

            return images

        except Exception:
            return []

    @staticmethod
    def _extract_background_images(
        tree,
        options: ImageExtractOptions,
    ) -> list[ImageInfo]:
        """Extract background images from CSS."""
        images: list[ImageInfo] = []

        for elem in tree.xpath(".//*[@style]"):
            try:
                style = elem.get("style", "")
                matches = re.findall(r'url\(["\']?([^"\'()]+)["\']?\)', style)

                for url in matches:
                    if url.startswith(("data:", "blob:")):
                        continue

                    if options.base_url and not url.startswith(("http://", "https://")):
                        url = urljoin(options.base_url, url)

                    images.append(
                        ImageInfo(
                            url=url,
                            is_lazy_loaded=False,
                            context="background-image",
                        )
                    )
            except Exception:
                continue

        return images

    @staticmethod
    def extract_from_markdown(
        markdown_content: str,
        options: Optional[ImageExtractOptions] = None,
    ) -> list[ImageInfo]:
        """
        Extract images from markdown content.

        Args:
            markdown_content: Markdown string
            options: Extraction options

        Returns:
            List of ImageInfo objects
        """
        if not markdown_content:
            return []

        options = options or ImageExtractOptions()
        images: list[ImageInfo] = []

        pattern = r"!\[([^\]]*)\]\(([^\)]+)\)"
        matches = re.findall(pattern, markdown_content)

        for alt, url in matches:
            if url.startswith(("data:", "blob:")):
                continue

            if options.base_url and not url.startswith(("http://", "https://")):
                url = urljoin(options.base_url, url)

            images.append(
                ImageInfo(
                    url=url,
                    alt=alt or None,
                    is_lazy_loaded=False,
                )
            )

        if options.max_images:
            images = images[: options.max_images]

        return images

    @staticmethod
    def extract(
        content: str,
        content_type: str = "html",
        options: Optional[ImageExtractOptions] = None,
    ) -> list[ImageInfo]:
        """
        Extract images from any content type.

        Args:
            content: Raw content
            content_type: Content type (html, markdown)
            options: Extraction options

        Returns:
            List of ImageInfo objects
        """
        content_type = content_type.lower()

        if content_type in ("html", "htm"):
            return ImageExtractor.extract_from_html(content, options)
        elif content_type in ("md", "markdown"):
            return ImageExtractor.extract_from_markdown(content, options)

        return []

    @staticmethod
    def resolve_srcset(srcset: str) -> list[dict]:
        """
        Parse srcset attribute and return available image URLs.

        Args:
            srcset: srcset attribute value

        Returns:
            List of dicts with url, width, and height
        """
        if not srcset:
            return []

        images = []
        parts = srcset.split(",")

        for part in parts:
            part = part.strip()
            if not part:
                continue

            tokens = part.split()
            if not tokens:
                continue

            url = tokens[0]

            width = None
            height = None

            for token in tokens[1:]:
                if token.endswith("w"):
                    try:
                        width = int(token[:-1])
                    except ValueError:
                        pass
                elif token.endswith("h"):
                    try:
                        height = int(token[:-1])
                    except ValueError:
                        pass
                elif "x" in token:
                    try:
                        density = float(token.replace("x", ""))
                    except ValueError:
                        pass

            images.append(
                {
                    "url": url,
                    "width": width,
                    "height": height,
                }
            )

        return images
