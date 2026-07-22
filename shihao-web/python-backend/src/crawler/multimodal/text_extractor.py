"""Text extractor - Extract text content from HTML/markdown."""

from typing import Optional, Protocol
from dataclasses import dataclass
from lxml import html


@dataclass
class TextExtractOptions:
    """Options for text extraction."""

    strip_html: bool = True
    remove_scripts: bool = True
    remove_styles: bool = True
    min_length: int = 0
    max_length: Optional[int] = None
    preserve_whitespace: bool = False


class TextExtractorProtocol(Protocol):
    """Protocol for text extraction implementations."""

    def extract(
        self, content: str, options: Optional[TextExtractOptions] = None
    ) -> str:
        """Extract text from content."""
        ...


class TextExtractor:
    """
    Extract text content from HTML, markdown, and other formats.

    Supports:
    - HTML text extraction
    - Markdown text extraction
    - Plain text processing
    - Configurable options
    """

    @staticmethod
    def extract_from_html(
        html_content: str,
        options: Optional[TextExtractOptions] = None,
    ) -> str:
        """
        Extract text from HTML content.

        Args:
            html_content: Raw HTML string
            options: Extraction options

        Returns:
            Extracted text content
        """
        if not html_content:
            return ""

        options = options or TextExtractOptions()

        try:
            tree = html.fromstring(html_content)

            if options.remove_scripts:
                for script in tree.xpath(".//script"):
                    parent = script.getparent()
                    if parent is not None:
                        parent.remove(script)

            if options.remove_styles:
                for style in tree.xpath(".//style"):
                    parent = style.getparent()
                    if parent is not None:
                        parent.remove(style)

            text = tree.text_content() or ""

            if not options.preserve_whitespace:
                text = " ".join(text.split())

            if options.min_length and len(text) < options.min_length:
                return ""

            if options.max_length:
                text = text[: options.max_length]

            return text.strip()

        except Exception:
            return ""

    @staticmethod
    def extract_from_markdown(
        markdown_content: str,
        options: Optional[TextExtractOptions] = None,
    ) -> str:
        """
        Extract text from markdown content.

        Args:
            markdown_content: Markdown string
            options: Extraction options

        Returns:
            Extracted text content
        """
        if not markdown_content:
            return ""

        import re

        options = options or TextExtractOptions()

        text = markdown_content

        text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)

        text = re.sub(r"!\[([^\]]*)\]\([^\)]+\)", "", text)

        text = re.sub(r"#{1,6}\s+", "", text)

        text = re.sub(r"[*_]{1,2}([^*_]+)[*_]{1,2}", r"\1", text)

        text = re.sub(r"```[\s\S]*?```", "", text)

        text = re.sub(r"`([^`]+)`", r"\1", text)

        text = re.sub(r"\|[^|]+\|", "", text)

        if not options.preserve_whitespace:
            text = " ".join(text.split())

        if options.max_length:
            text = text[: options.max_length]

        return text.strip()

    @staticmethod
    def extract(
        content: str,
        content_type: str = "html",
        options: Optional[TextExtractOptions] = None,
    ) -> str:
        """
        Extract text from any content type.

        Args:
            content: Raw content
            content_type: Content type (html, markdown, text)
            options: Extraction options

        Returns:
            Extracted text content
        """
        content_type = content_type.lower()

        if content_type in ("html", "htm"):
            return TextExtractor.extract_from_html(content, options)
        elif content_type in ("md", "markdown"):
            return TextExtractor.extract_from_markdown(content, options)
        else:
            options = options or TextExtractOptions()
            if options.max_length:
                return content[: options.max_length]
            return content.strip()

    @staticmethod
    def extract_structured(
        html_content: str,
        selectors: dict[str, str],
    ) -> dict[str, str]:
        """
        Extract structured text fields from HTML.

        Args:
            html_content: Raw HTML string
            selectors: Dict of field_name -> CSS selector

        Returns:
            Dict of extracted field values
        """
        if not html_content:
            return {name: "" for name in selectors}

        try:
            tree = html.fromstring(html_content)
            result = {}

            for field_name, selector in selectors.items():
                try:
                    elements = tree.cssselect(selector)
                    if elements:
                        result[field_name] = elements[0].text_content().strip()
                    else:
                        result[field_name] = ""
                except Exception:
                    result[field_name] = ""

            return result

        except Exception:
            return {name: "" for name in selectors}
