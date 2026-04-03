"""Document IR - Intermediate Representation for report generation."""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Union
from datetime import datetime
from enum import Enum
import json


class BlockType(str, Enum):
    """Block types in document IR."""

    HEADING = "heading"
    PARAGRAPH = "paragraph"
    LIST = "list"
    LIST_ITEM = "list_item"
    CHART = "chart"
    TABLE = "table"
    IMAGE = "image"
    CODE = "code"
    QUOTE = "quote"
    DIVIDER = "divider"
    WARNING = "warning"
    INFO = "info"


class ListType(str, Enum):
    """List types."""

    UNORDERED = "unordered"
    ORDERED = "ordered"


class ChartType(str, Enum):
    """Chart types."""

    LINE = "line"
    BAR = "bar"
    PIE = "pie"
    SCATTER = "scatter"
    AREA = "area"


@dataclass
class InlineText:
    """Inline text element."""

    text: str
    bold: bool = False
    italic: bool = False
    code: bool = False
    link: Optional[str] = None


@dataclass
class HeadingBlock:
    """Heading block."""

    type: str = BlockType.HEADING.value
    text: str = ""
    level: int = 1
    id: Optional[str] = None


@dataclass
class ParagraphBlock:
    """Paragraph block."""

    type: str = BlockType.PARAGRAPH.value
    inlines: List[InlineText] = field(default_factory=list)
    id: Optional[str] = None

    @classmethod
    def from_text(cls, text: str) -> "ParagraphBlock":
        return cls(inlines=[InlineText(text=text)])


@dataclass
class ListBlock:
    """List block."""

    type: str = BlockType.LIST.value
    list_type: str = ListType.UNORDERED.value
    items: List["ListItemBlock"] = field(default_factory=list)
    id: Optional[str] = None


@dataclass
class ListItemBlock:
    """List item block."""

    type: str = BlockType.LIST_ITEM.value
    inlines: List[InlineText] = field(default_factory=list)

    @classmethod
    def from_text(cls, text: str) -> "ListItemBlock":
        return cls(inlines=[InlineText(text=text)])


@dataclass
class ChartBlock:
    """Chart block."""

    type: str = BlockType.CHART.value
    chart_type: str = ChartType.LINE.value
    title: str = ""
    data: Dict[str, Any] = field(default_factory=dict)
    options: Dict[str, Any] = field(default_factory=dict)
    id: Optional[str] = None


@dataclass
class TableBlock:
    """Table block."""

    type: str = BlockType.TABLE.value
    headers: List[str] = field(default_factory=list)
    rows: List[List[str]] = field(default_factory=list)
    options: Dict[str, Any] = field(default_factory=dict)
    id: Optional[str] = None


@dataclass
class ImageBlock:
    """Image block."""

    type: str = BlockType.IMAGE.value
    url: str = ""
    alt: str = ""
    caption: str = ""
    width: Optional[str] = None
    id: Optional[str] = None


@dataclass
class CodeBlock:
    """Code block."""

    type: str = BlockType.CODE.value
    code: str = ""
    language: str = ""
    id: Optional[str] = None


@dataclass
class QuoteBlock:
    """Quote block."""

    type: str = BlockType.QUOTE.value
    text: str = ""
    attribution: str = ""
    id: Optional[str] = None


@dataclass
class DividerBlock:
    """Divider block."""

    type: str = BlockType.DIVIDER.value


@dataclass
class WarningBlock:
    """Warning block."""

    type: str = BlockType.WARNING.value
    text: str = ""


@dataclass
class InfoBlock:
    """Info block."""

    type: str = BlockType.INFO.value
    text: str = ""


Block = Union[
    HeadingBlock,
    ParagraphBlock,
    ListBlock,
    ChartBlock,
    TableBlock,
    ImageBlock,
    CodeBlock,
    QuoteBlock,
    DividerBlock,
    WarningBlock,
    InfoBlock,
]


@dataclass
class Chapter:
    """Document chapter."""

    chapter_id: str
    title: str
    blocks: List[Block] = field(default_factory=list)
    order: int = 0


@dataclass
class TableOfContents:
    """Table of contents."""

    entries: List[Dict[str, Any]] = field(default_factory=list)

    def add_entry(self, title: str, chapter_id: str, level: int = 1):
        self.entries.append(
            {
                "title": title,
                "chapter_id": chapter_id,
                "level": level,
            }
        )


@dataclass
class ThemeTokens:
    """Theme tokens for styling."""

    primary_color: str = "#2563eb"
    secondary_color: str = "#64748b"
    accent_color: str = "#f59e0b"
    text_color: str = "#1f2937"
    background_color: str = "#ffffff"
    font_family: str = "Inter, sans-serif"
    heading_font_family: str = "Inter, sans-serif"


@dataclass
class Manifest:
    """Document manifest."""

    title: str
    subtitle: str = ""
    author: str = ""
    date: str = ""
    version: str = "1.0"
    theme_tokens: ThemeTokens = field(default_factory=ThemeTokens)
    toc: TableOfContents = field(default_factory=TableOfContents)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DocumentIR:
    """Document Intermediate Representation."""

    version: str = "2.0"
    manifest: Optional[Manifest] = None
    chapters: List[Chapter] = field(default_factory=list)

    def add_chapter(self, chapter_id: str, title: str, order: int = 0) -> Chapter:
        chapter = Chapter(chapter_id=chapter_id, title=title, order=order)
        self.chapters.append(chapter)
        if self.manifest and self.manifest.toc is not None:
            self.manifest.toc.add_entry(title, chapter_id)
        return chapter

    def get_chapter(self, chapter_id: str) -> Optional[Chapter]:
        for chapter in self.chapters:
            if chapter.chapter_id == chapter_id:
                return chapter
        return None

    def add_block_to_chapter(self, chapter_id: str, block: Block):
        chapter = self.get_chapter(chapter_id)
        if chapter:
            chapter.blocks.append(block)

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "manifest": self._manifest_to_dict(self.manifest)
            if self.manifest
            else None,
            "chapters": [self._chapter_to_dict(c) for c in self.chapters],
        }

    def to_json(self, indent: int = 2) -> str:
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    def _manifest_to_dict(self, manifest: Manifest) -> dict:
        return {
            "title": manifest.title,
            "subtitle": manifest.subtitle,
            "author": manifest.author,
            "date": manifest.date,
            "version": manifest.version,
            "themeTokens": {
                "primaryColor": manifest.theme_tokens.primary_color,
                "secondaryColor": manifest.theme_tokens.secondary_color,
                "accentColor": manifest.theme_tokens.accent_color,
                "textColor": manifest.theme_tokens.text_color,
                "backgroundColor": manifest.theme_tokens.background_color,
                "fontFamily": manifest.theme_tokens.font_family,
                "headingFontFamily": manifest.theme_tokens.heading_font_family,
            },
            "toc": {"entries": manifest.toc.entries}
            if manifest.toc
            else {"entries": []},
            "metadata": manifest.metadata,
        }

    def _chapter_to_dict(self, chapter: Chapter) -> dict:
        return {
            "chapterId": chapter.chapter_id,
            "title": chapter.title,
            "order": chapter.order,
            "blocks": [self._block_to_dict(b) for b in chapter.blocks],
        }

    def _block_to_dict(self, block: Block) -> dict:
        if isinstance(block, HeadingBlock):
            return {
                "type": block.type,
                "text": block.text,
                "level": block.level,
                "id": block.id,
            }
        elif isinstance(block, ParagraphBlock):
            return {
                "type": block.type,
                "inlines": [
                    {
                        "text": i.text,
                        "bold": i.bold,
                        "italic": i.italic,
                        "code": i.code,
                        "link": i.link,
                    }
                    for i in block.inlines
                ],
                "id": block.id,
            }
        elif isinstance(block, ListBlock):
            return {
                "type": block.type,
                "listType": block.list_type,
                "items": [
                    {"inlines": [{"text": i.text} for i in item.inlines]}
                    for item in block.items
                ],
                "id": block.id,
            }
        elif isinstance(block, ChartBlock):
            return {
                "type": block.type,
                "chartType": block.chart_type,
                "title": block.title,
                "data": block.data,
                "options": block.options,
                "id": block.id,
            }
        elif isinstance(block, TableBlock):
            return {
                "type": block.type,
                "headers": block.headers,
                "rows": block.rows,
                "options": block.options,
                "id": block.id,
            }
        elif isinstance(block, ImageBlock):
            return {
                "type": block.type,
                "url": block.url,
                "alt": block.alt,
                "caption": block.caption,
                "width": block.width,
                "id": block.id,
            }
        elif isinstance(block, CodeBlock):
            return {
                "type": block.type,
                "code": block.code,
                "language": block.language,
                "id": block.id,
            }
        elif isinstance(block, QuoteBlock):
            return {
                "type": block.type,
                "text": block.text,
                "attribution": block.attribution,
                "id": block.id,
            }
        elif isinstance(block, DividerBlock):
            return {"type": block.type}
        elif isinstance(block, WarningBlock):
            return {"type": block.type, "text": block.text}
        elif isinstance(block, InfoBlock):
            return {"type": block.type, "text": block.text}
        else:
            return {"type": "unknown"}

    @classmethod
    def from_dict(cls, data: dict) -> "DocumentIR":
        doc = cls(version=data.get("version", "2.0"))

        if "manifest" in data and data["manifest"]:
            doc.manifest = Manifest(
                title=data["manifest"].get("title", ""),
                subtitle=data["manifest"].get("subtitle", ""),
                author=data["manifest"].get("author", ""),
                date=data["manifest"].get("date", ""),
                version=data["manifest"].get("version", "1.0"),
            )

        for ch_data in data.get("chapters", []):
            chapter = Chapter(
                chapter_id=ch_data.get("chapterId", ""),
                title=ch_data.get("title", ""),
                order=ch_data.get("order", 0),
            )
            doc.chapters.append(chapter)

        return doc


class DocumentBuilder:
    """Builder for Document IR."""

    def __init__(self):
        self.document = DocumentIR()

    def set_title(self, title: str, subtitle: str = "") -> "DocumentBuilder":
        if not self.document.manifest:
            self.document.manifest = Manifest(title=title, subtitle=subtitle)
        else:
            self.document.manifest.title = title
            self.document.manifest.subtitle = subtitle
        return self

    def set_author(self, author: str) -> "DocumentBuilder":
        if self.document.manifest:
            self.document.manifest.author = author
        return self

    def set_date(self, date: str = "") -> "DocumentBuilder":
        if self.document.manifest:
            self.document.manifest.date = date or datetime.now().strftime("%Y-%m-%d")
        return self

    def add_chapter(self, chapter_id: str, title: str) -> "DocumentBuilder":
        self.document.add_chapter(chapter_id, title)
        return self

    def add_heading(
        self, chapter_id: str, text: str, level: int = 1
    ) -> "DocumentBuilder":
        self.document.add_block_to_chapter(
            chapter_id, HeadingBlock(text=text, level=level)
        )
        return self

    def add_paragraph(self, chapter_id: str, text: str) -> "DocumentBuilder":
        self.document.add_block_to_chapter(chapter_id, ParagraphBlock.from_text(text))
        return self

    def add_list(
        self, chapter_id: str, items: List[str], ordered: bool = False
    ) -> "DocumentBuilder":
        list_block = ListBlock(
            list_type=ListType.ORDERED.value if ordered else ListType.UNORDERED.value,
            items=[ListItemBlock.from_text(item) for item in items],
        )
        self.document.add_block_to_chapter(chapter_id, list_block)
        return self

    def add_chart(
        self, chapter_id: str, chart_type: str, title: str, data: Dict
    ) -> "DocumentBuilder":
        self.document.add_block_to_chapter(
            chapter_id, ChartBlock(chart_type=chart_type, title=title, data=data)
        )
        return self

    def add_table(
        self, chapter_id: str, headers: List[str], rows: List[List[str]]
    ) -> "DocumentBuilder":
        self.document.add_block_to_chapter(
            chapter_id, TableBlock(headers=headers, rows=rows)
        )
        return self

    def add_code(
        self, chapter_id: str, code: str, language: str = ""
    ) -> "DocumentBuilder":
        self.document.add_block_to_chapter(
            chapter_id, CodeBlock(code=code, language=language)
        )
        return self

    def add_quote(
        self, chapter_id: str, text: str, attribution: str = ""
    ) -> "DocumentBuilder":
        self.document.add_block_to_chapter(
            chapter_id, QuoteBlock(text=text, attribution=attribution)
        )
        return self

    def add_divider(self, chapter_id: str) -> "DocumentBuilder":
        self.document.add_block_to_chapter(chapter_id, DividerBlock())
        return self

    def add_warning(self, chapter_id: str, text: str) -> "DocumentBuilder":
        self.document.add_block_to_chapter(chapter_id, WarningBlock(text=text))
        return self

    def add_info(self, chapter_id: str, text: str) -> "DocumentBuilder":
        self.document.add_block_to_chapter(chapter_id, InfoBlock(text=text))
        return self

    def build(self) -> DocumentIR:
        return self.document
