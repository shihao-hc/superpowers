"""Output formatters for different content formats."""

from abc import ABC, abstractmethod
from typing import Optional, Any
import re


class BaseFormatter(ABC):
    """Base formatter interface."""

    @abstractmethod
    def format(self, html_content: str, **kwargs) -> str:
        """Format HTML content to target format."""
        pass


class MarkdownFormatter(BaseFormatter):
    """Format HTML to Markdown."""

    def __init__(self):
        self._tag_stack = []
        self._text_parts = []
        self._list_stack = []
        self._in_code_block = False
        self._code_block_lang = ""

    def format(self, html_content: str, **kwargs) -> str:
        """Convert HTML to Markdown."""
        import html.parser

        class MarkdownHTMLParser(html.parser.HTMLParser):
            def __init__(parser_self):
                super().__init__()
                parser_self.result = []
                parser_self.tag_stack = []
                parser_self.text_parts = []
                parser_self.in_code_block = False
                parser_self.code_lang = ""
                parser_self.list_stack = []
                parser_self.in_list_item = False
                parser_self.list_type = "ul"

            def handle_starttag(parser_self, tag, attrs):
                attr_str = ""
                if attrs:
                    attr_str = "".join(f' {k}="{v}"' for k, v in attrs)

                if tag == "code" and not parser_self.tag_stack:
                    parent = parser_self.tag_stack[-1] if parser_self.tag_stack else ""
                    if parent == "pre":
                        parser_self.in_code_block = True
                    else:
                        parser_self.result.append("`")
                elif tag == "pre":
                    parser_self.result.append("```\n")
                elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
                    level = tag[1]
                    parser_self.result.append(f"\n{'#' * int(level)} ")
                elif tag == "a":
                    href = dict(attrs).get("href", "")
                    parser_self.result.append("[")
                elif tag == "img":
                    src = dict(attrs).get("src", "")
                    alt = dict(attrs).get("alt", "")
                    parser_self.result.append(f"![{alt}]({src})")
                elif tag == "br":
                    parser_self.result.append("  \n")
                elif tag == "li":
                    parent = parser_self.tag_stack[-1] if parser_self.tag_stack else ""
                    if parent == "ol":
                        parser_self.result.append("1. ")
                    else:
                        parser_self.result.append("- ")
                    parser_self.in_list_item = True
                elif tag == "p":
                    parser_self.result.append("\n\n")
                elif tag in ("strong", "b"):
                    parser_self.result.append("**")
                elif tag in ("em", "i"):
                    parser_self.result.append("*")
                elif tag == "blockquote":
                    parser_self.result.append("> ")

                parser_self.tag_stack.append(tag)

            def handle_endtag(parser_self, tag):
                if parser_self.tag_stack and parser_self.tag_stack[-1] == tag:
                    parser_self.tag_stack.pop()

                if tag == "code" and not parser_self.tag_stack:
                    if not parser_self.in_code_block:
                        parser_self.result.append("`")
                elif tag == "pre":
                    parser_self.result.append("\n```\n")
                    parser_self.in_code_block = False
                elif tag == "a":
                    href = ""
                    parser_self.result.append("]()")
                elif tag in ("strong", "b"):
                    parser_self.result.append("**")
                elif tag in ("em", "i"):
                    parser_self.result.append("*")
                elif tag == "blockquote":
                    parser_self.result.append("\n")
                elif tag in ("h1", "h2", "h3", "h4", "h5", "h6", "p"):
                    pass
                elif tag == "li":
                    parser_self.result.append("\n")
                    parser_self.in_list_item = False

            def handle_data(parser_self, data):
                text = data.strip()
                if text:
                    if parser_self.in_list_item:
                        parser_self.result.append(text)
                    elif parser_self.in_code_block:
                        parser_self.result.append(text)
                    else:
                        parser_self.result.append(text)

        parser = MarkdownHTMLParser()
        try:
            parser.feed(html_content)
            result = "".join(parser.result)
            result = re.sub(r"\n{3,}", "\n\n", result)
            return result.strip()
        except Exception:
            return html_content


class HTMLFormatter(BaseFormatter):
    """Return clean HTML."""

    def format(self, html_content: str, **kwargs) -> str:
        """Return cleaned HTML."""
        import html.parser

        class Cleaner(html.parser.HTMLParser):
            def __init__(parser_self):
                super().__init__()
                parser_self.result = []
                parser_self.skip_tags = {"script", "style", "noscript"}

            def handle_starttag(parser_self, tag, attrs):
                if tag not in parser_self.skip_tags:
                    attr_str = "".join(f' {k}="{v}"' for k, v in attrs)
                    parser_self.result.append(f"<{tag}{attr_str}>")

            def handle_endtag(parser_self, tag):
                if tag not in parser_self.skip_tags:
                    parser_self.result.append(f"</{tag}>")

            def handle_data(parser_self, data):
                parser_self.result.append(data)

        cleaner = Cleaner()
        try:
            cleaner.feed(html_content)
            return "".join(cleaner.result)
        except Exception:
            return html_content


class LinksFormatter(BaseFormatter):
    """Extract links from HTML."""

    def format(self, html_content: str, base_url: str = "", **kwargs) -> str:
        """Extract links as JSON."""
        import html.parser
        from urllib.parse import urljoin
        import json

        class LinkExtractor(html.parser.HTMLParser):
            def __init__(parser_self):
                super().__init__()
                parser_self.links = []

            def handle_starttag(parser_self, tag, attrs):
                if tag == "a":
                    href = dict(attrs).get("href", "")
                    if href and not href.startswith(("#", "javascript:", "mailto:")):
                        full_url = urljoin(base_url, href)
                        parser_self.links.append({"url": full_url, "text": ""})
                    parser_self._pending_href = href

            def handle_data(parser_self, data):
                if hasattr(parser_self, "_pending_href"):
                    for link in parser_self.links:
                        if link["url"].endswith(
                            parser_self._pending_href.split("?")[0].split("#")[0]
                        ):
                            link["text"] = data.strip()[:200]
                    delattr(parser_self, "_pending_href")

        extractor = LinkExtractor()
        try:
            extractor.feed(html_content)
            return json.dumps(extractor.links, ensure_ascii=False, indent=2)
        except Exception:
            return "[]"


class ScreenshotFormatter(BaseFormatter):
    """Placeholder for screenshot capture."""

    def format(self, html_content: str, **kwargs) -> str:
        """Return placeholder for screenshot."""
        return "screenshot_placeholder"


class BrandingFormatter(BaseFormatter):
    """Extract brand identity from page."""

    def format(self, html_content: str, **kwargs) -> str:
        """Extract brand colors, fonts, etc."""
        import html.parser
        import re
        import json

        colors = set()
        fonts = set()

        color_pattern = r"(?:#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\))"
        font_pattern = r'font-family:\s*["\']([^"\']+)["\']'

        colors_found = re.findall(color_pattern, html_content, re.IGNORECASE)
        fonts_found = re.findall(font_pattern, html_content, re.IGNORECASE)

        colors.update(colors_found[:10])
        fonts.update(fonts_found[:10])

        return json.dumps(
            {"colors": list(colors), "fonts": list(fonts), "typography": {}},
            ensure_ascii=False,
            indent=2,
        )


class JSONFormatter(BaseFormatter):
    """Format content as JSON (placeholder for LLM extraction)."""

    def format(
        self, html_content: str, prompt: str = "", schema: dict = None, **kwargs
    ) -> str:
        """Return placeholder for LLM-based JSON extraction."""
        import json

        return json.dumps(
            {
                "status": "requires_llm_extraction",
                "prompt": prompt,
                "schema": schema,
                "note": "Use LLM to extract structured data based on prompt/schema",
            },
            ensure_ascii=False,
            indent=2,
        )


class FormatterFactory:
    """Factory for creating formatters."""

    _formatters = {
        "markdown": MarkdownFormatter,
        "html": HTMLFormatter,
        "rawHtml": HTMLFormatter,
        "links": LinksFormatter,
        "screenshot": ScreenshotFormatter,
        "branding": BrandingFormatter,
        "json": JSONFormatter,
    }

    @classmethod
    def get_formatter(cls, format_name: str) -> BaseFormatter:
        """Get formatter for given format name."""
        if not format_name or not isinstance(format_name, str):
            return MarkdownFormatter()
        formatter_class = cls._formatters.get(format_name.lower(), MarkdownFormatter)
        return formatter_class()

    @classmethod
    def format_content(
        cls,
        html_content: str,
        format_name: str,
        base_url: str = "",
        prompt: str = "",
        schema: dict = None,
        **kwargs,
    ) -> str:
        """Format HTML content to specified format."""
        formatter = cls.get_formatter(format_name)
        return formatter.format(
            html_content, base_url=base_url, prompt=prompt, schema=schema, **kwargs
        )
