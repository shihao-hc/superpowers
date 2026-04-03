"""HTML renderer for Document IR."""

from typing import Optional, Dict, Any
from .document_ir import DocumentIR, Chapter, Block, InlineText


class HTMLRenderer:
    """Render Document IR to HTML."""

    def __init__(self, template: Optional[str] = None):
        self.template = template or self._get_default_template()

    def render(self, document: DocumentIR) -> str:
        """Render document to HTML."""
        if document.manifest:
            title = document.manifest.title
            subtitle = document.manifest.subtitle
            author = document.manifest.author
            theme = document.manifest.theme_tokens
        else:
            title = "Document"
            subtitle = ""
            author = ""
            theme = None

        chapters_html = self._render_chapters(document.chapters)

        return self.template.format(
            title=title,
            subtitle=subtitle,
            author=author,
            chapters=chapters_html,
            theme_css=self._render_theme_css(theme),
        )

    def _render_chapters(self, chapters: list[Chapter]) -> str:
        """Render all chapters."""
        return "\n".join(self._render_chapter(c) for c in chapters)

    def _render_chapter(self, chapter: Chapter) -> str:
        """Render a single chapter."""
        blocks_html = "\n".join(self._render_block(b) for b in chapter.blocks)
        return f"""
<section class="chapter" id="{chapter.chapter_id}">
    <h1 class="chapter-title">{chapter.title}</h1>
    {blocks_html}
</section>
"""

    def _render_block(self, block: Block) -> str:
        """Render a single block."""
        block_type = getattr(block, "type", "")

        if block_type == "heading":
            level = getattr(block, "level", 1)
            text = getattr(block, "text", "")
            return f"<h{level}>{self._escape_html(text)}</h{level}>"

        elif block_type == "paragraph":
            inlines = getattr(block, "inlines", [])
            text = "".join(self._render_inline(i) for i in inlines)
            return f"<p>{text}</p>"

        elif block_type == "list":
            list_type = getattr(block, "list_type", "unordered")
            tag = "ol" if list_type == "ordered" else "ul"
            items = getattr(block, "items", [])
            items_html = "\n".join(
                f"<li>{self._render_list_item(i)}</li>" for i in items
            )
            return f"<{tag}>{items_html}</{tag}>"

        elif block_type == "chart":
            chart_type = getattr(block, "chart_type", "line")
            title = getattr(block, "title", "")
            data = getattr(block, "data", {})
            return f"""
<div class="chart-container">
    <h3>{self._escape_html(title)}</h3>
    <div class="chart" data-type="{chart_type}" data-chart='{self._json_attr(data)}'></div>
</div>
"""

        elif block_type == "table":
            headers = getattr(block, "headers", [])
            rows = getattr(block, "rows", [])
            headers_html = "".join(f"<th>{self._escape_html(h)}</th>" for h in headers)
            rows_html = ""
            for row in rows:
                cells = "".join(f"<td>{self._escape_html(c)}</td>" for c in row)
                rows_html += f"<tr>{cells}</tr>"
            return f"""
<table class="data-table">
    <thead><tr>{headers_html}</tr></thead>
    <tbody>{rows_html}</tbody>
</table>
"""

        elif block_type == "code":
            code = getattr(block, "code", "")
            language = getattr(block, "language", "")
            return f"""
<pre class="code-block" data-language="{language}"><code>{self._escape_html(code)}</code></pre>
"""

        elif block_type == "quote":
            text = getattr(block, "text", "")
            attribution = getattr(block, "attribution", "")
            attr_html = (
                f"<cite>{self._escape_html(attribution)}</cite>" if attribution else ""
            )
            return f"<blockquote>{self._escape_html(text)}{attr_html}</blockquote>"

        elif block_type == "divider":
            return "<hr/>"

        elif block_type == "warning":
            text = getattr(block, "text", "")
            return f'<div class="warning">{self._escape_html(text)}</div>'

        elif block_type == "info":
            text = getattr(block, "text", "")
            return f'<div class="info">{self._escape_html(text)}</div>'

        elif block_type == "image":
            url = getattr(block, "url", "")
            alt = getattr(block, "alt", "")
            caption = getattr(block, "caption", "")
            caption_html = (
                f"<figcaption>{self._escape_html(caption)}</figcaption>"
                if caption
                else ""
            )
            return f"""
<figure>
    <img src="{self._escape_html(url)}" alt="{self._escape_html(alt)}"/>
    {caption_html}
</figure>
"""

        return ""

    def _render_inline(self, inline: InlineText) -> str:
        """Render inline text element."""
        text = self._escape_html(inline.text)

        if inline.bold:
            text = f"<strong>{text}</strong>"
        if inline.italic:
            text = f"<em>{text}</em>"
        if inline.code:
            text = f"<code>{text}</code>"
        if inline.link:
            text = f'<a href="{self._escape_html(inline.link)}">{text}</a>'

        return text

    def _render_list_item(self, item) -> str:
        """Render list item."""
        inlines = getattr(item, "inlines", [])
        return "".join(self._render_inline(i) for i in inlines)

    def _render_theme_css(self, theme) -> str:
        """Render theme CSS."""
        if not theme:
            return ""

        return f"""
:root {{
    --primary-color: {theme.primary_color};
    --secondary-color: {theme.secondary_color};
    --accent-color: {theme.accent_color};
    --text-color: {theme.text_color};
    --background-color: {theme.background_color};
    --font-family: {theme.font_family};
    --heading-font-family: {theme.heading_font_family};
}}
"""

    def _escape_html(self, text: str) -> str:
        """Escape HTML special characters."""
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&#39;")
        )

    def _json_attr(self, data: dict) -> str:
        """Convert dict to JSON for data attribute."""
        import json

        return json.dumps(data).replace("'", "\\'")

    def _get_default_template(self) -> str:
        """Get default HTML template."""
        return """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        {theme_css}
        body {{
            font-family: var(--font-family, Inter, sans-serif);
            line-height: 1.6;
            color: var(--text-color, #1f2937);
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
        }}
        .chapter {{
            margin-bottom: 3rem;
        }}
        .chapter-title {{
            font-family: var(--heading-font-family, Inter, sans-serif);
            border-bottom: 2px solid var(--primary-color);
            padding-bottom: 0.5rem;
        }}
        h1, h2, h3, h4, h5, h6 {{
            font-family: var(--heading-font-family, Inter, sans-serif);
            color: var(--primary-color);
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            margin: 1rem 0;
        }}
        th, td {{
            border: 1px solid #ddd;
            padding: 0.75rem;
            text-align: left;
        }}
        th {{
            background-color: var(--primary-color);
            color: white;
        }}
        pre {{
            background-color: #f5f5f5;
            padding: 1rem;
            border-radius: 4px;
            overflow-x: auto;
        }}
        code {{
            font-family: monospace;
            background-color: #f5f5f5;
            padding: 0.125rem 0.25rem;
            border-radius: 2px;
        }}
        blockquote {{
            border-left: 4px solid var(--primary-color);
            margin-left: 0;
            padding-left: 1rem;
            color: #666;
        }}
        .warning {{
            background-color: #fff3cd;
            border: 1px solid #ffc107;
            padding: 1rem;
            border-radius: 4px;
        }}
        .info {{
            background-color: #d1ecf1;
            border: 1px solid #17a2b8;
            padding: 1rem;
            border-radius: 4px;
        }}
        .chart-container {{
            margin: 1rem 0;
            text-align: center;
        }}
        figure {{
            margin: 1rem 0;
        }}
        figure img {{
            max-width: 100%;
        }}
        figcaption {{
            text-align: center;
            color: #666;
            font-size: 0.9rem;
        }}
    </style>
</head>
<body>
    <header>
        <h1>{title}</h1>
        {{#if subtitle}}<p class="subtitle">{subtitle}</p>{{/if}}
        {{#if author}}<p class="author">By {author}</p>{{/if}}
    </header>
    {chapters}
</body>
</html>"""


def render_document(document: DocumentIR) -> str:
    """Convenience function to render document to HTML."""
    renderer = HTMLRenderer()
    return renderer.render(document)
