"""Field extractor - Extract structured fields from elements."""

from typing import Optional, Any
from dataclasses import dataclass
from lxml import html, etree


@dataclass
class FieldDefinition:
    """Definition of a field to extract."""

    name: str
    xpath: str
    content_type: int = 0
    default: str = ""
    is_relative: bool = True
    before_js: str = ""
    after_js: str = ""


class ContentType:
    """Content extraction type codes."""

    TEXT = 0
    DIRECT_TEXT = 1
    INNER_HTML = 2
    OUTER_HTML = 3
    BACKGROUND_IMAGE = 4
    PAGE_URL = 5
    PAGE_TITLE = 6
    SELECTED_OPTION_VALUE = 10
    SELECTED_OPTION_TEXT = 11


class FieldExtractor:
    """Extract fields from HTML elements."""

    @staticmethod
    def extract_field(
        element: etree._Element,
        field: FieldDefinition,
    ) -> str:
        """Extract a single field from element.

        Args:
            element: lxml element
            field: Field definition

        Returns:
            Extracted value
        """
        content_type = field.content_type
        xpath = field.xpath

        if content_type == ContentType.TEXT:
            value = FieldExtractor._extract_text(element, xpath)
        elif content_type == ContentType.DIRECT_TEXT:
            value = FieldExtractor._extract_direct_text(element, xpath)
        elif content_type == ContentType.INNER_HTML:
            value = FieldExtractor._extract_inner_html(element, xpath)
        elif content_type == ContentType.OUTER_HTML:
            value = FieldExtractor._extract_outer_html(element, xpath)
        elif content_type == ContentType.BACKGROUND_IMAGE:
            value = FieldExtractor._extract_background_image(element, xpath)
        elif content_type == ContentType.PAGE_URL:
            value = ""
        elif content_type == ContentType.PAGE_TITLE:
            value = FieldExtractor._extract_title(element)
        else:
            value = FieldExtractor._extract_text(element, xpath)

        if not value and field.default:
            return field.default
        return value

    @staticmethod
    def _extract_text(element: etree._Element, xpath: str) -> str:
        """Extract all text content."""
        try:
            if xpath:
                results = element.xpath(xpath)
                if results:
                    if isinstance(results[0], str):
                        return results[0].strip()
                    return etree.tostring(
                        results[0], method="text", encoding="unicode"
                    ).strip()
            return ""
        except Exception:
            return ""

    @staticmethod
    def _extract_direct_text(element: etree._Element, xpath: str) -> str:
        """Extract direct text nodes only (no child text)."""
        try:
            if xpath:
                results = element.xpath(xpath)
                if results:
                    return etree.tostring(
                        results[0], method="text", encoding="unicode"
                    ).strip()
            return ""
        except Exception:
            return ""

    @staticmethod
    def _extract_inner_html(element: etree._Element, xpath: str) -> str:
        """Extract inner HTML."""
        try:
            if xpath:
                results = element.xpath(xpath)
                if results:
                    return etree.tostring(results[0], method="html", encoding="unicode")
            return etree.tostring(element, method="html", encoding="unicode")
        except Exception:
            return ""

    @staticmethod
    def _extract_outer_html(element: etree._Element, xpath: str) -> str:
        """Extract outer HTML."""
        try:
            if xpath:
                results = element.xpath(xpath)
                if results:
                    return etree.tostring(results[0], method="html", encoding="unicode")
            return etree.tostring(element, method="html", encoding="unicode")
        except Exception:
            return ""

    @staticmethod
    def _extract_background_image(element: etree._Element, xpath: str) -> str:
        """Extract background image URL."""
        try:
            if xpath:
                results = element.xpath(xpath)
                if results and hasattr(results[0], "get"):
                    style = results[0].get("style", "")
                    import re

                    match = re.search(r'url\(["\']?([^"\']+)["\']?\)', style)
                    if match:
                        return match.group(1)
        except Exception:
            pass
        return ""

    @staticmethod
    def _extract_title(element: etree._Element) -> str:
        """Extract page title."""
        try:
            title_elements = element.xpath("//title")
            if title_elements:
                return etree.tostring(
                    title_elements[0], method="text", encoding="unicode"
                ).strip()
        except Exception:
            pass
        return ""

    @staticmethod
    def extract_fields(
        html_content: str,
        base_xpath: str,
        fields: list[FieldDefinition],
    ) -> list[dict]:
        """Extract multiple fields from multiple elements.

        Args:
            html_content: HTML content
            base_xpath: XPath for container elements
            fields: List of field definitions

        Returns:
            List of extracted data rows
        """
        try:
            tree = html.fromstring(html_content)
            containers = tree.xpath(base_xpath)

            results = []
            for container in containers:
                row = {}
                for field in fields:
                    value = FieldExtractor.extract_field(container, field)
                    if not value:
                        value = field.default
                    row[field.name] = value
                results.append(row)

            return results

        except Exception:
            return []

    @staticmethod
    def extract_single(
        html_content: str,
        xpath: str,
        content_type: int = 0,
    ) -> str:
        """Extract a single value from HTML.

        Args:
            html_content: HTML content
            xpath: XPath expression
            content_type: Content extraction type

        Returns:
            Extracted value
        """
        try:
            tree = html.fromstring(html_content)
            field = FieldDefinition(
                name="value",
                xpath=xpath,
                content_type=content_type,
            )
            return FieldExtractor.extract_field(tree, field)
        except Exception:
            return ""
