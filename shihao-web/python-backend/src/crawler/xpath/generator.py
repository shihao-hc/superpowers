"""XPath generator - Generate multiple candidate XPaths for elements."""

import re
from typing import Optional
from dataclasses import dataclass


def _escape_xpath(value: str) -> str:
    """Escape special characters in XPath string literals."""
    if not value:
        return ""
    escaped = value.replace("\\", "\\\\").replace('"', '\\"').replace("'", "\\'")
    return escaped


@dataclass
class ElementInfo:
    """Information about an HTML element."""

    tag: str
    id: Optional[str] = None
    class_name: Optional[str] = None
    name: Optional[str] = None
    alt: Optional[str] = None
    text_content: str = ""
    attributes: dict = None

    def __post_init__(self):
        if self.attributes is None:
            self.attributes = {}

    def __setattr__(self, name, value):
        if name == "tag" and value:
            if not re.match(r"^[a-zA-Z][a-zA-Z0-9]*$", value):
                value = "div"
        super().__setattr__(name, value)


class XPathGenerator:
    """Generate multiple XPath strategies for element matching."""

    MAX_TEXT_LENGTH = 100

    @staticmethod
    def generate(element_info: ElementInfo) -> list[str]:
        """Generate multiple candidate XPaths for an element.

        Args:
            element_info: Element information

        Returns:
            List of candidate XPaths (ordered by preference)
        """
        xpaths = []
        safe_tag = re.sub(r"[^a-zA-Z0-9]", "", element_info.tag) or "div"

        text_snippet = (
            element_info.text_content[: XPathGenerator.MAX_TEXT_LENGTH].strip()
            if element_info.text_content
            else ""
        )

        if element_info.id:
            safe_id = _escape_xpath(element_info.id)
            if safe_id:
                xpaths.append(f'//*[@id="{safe_id}"]')

        if element_info.class_name:
            class_names = element_info.class_name.split()
            for cn in class_names:
                if cn:
                    safe_cn = _escape_xpath(cn)
                    if safe_cn:
                        xpaths.append(f'//{safe_tag}[contains(@class, "{safe_cn}")]')

        if element_info.name:
            safe_name = _escape_xpath(element_info.name)
            if safe_name:
                xpaths.append(f'//{safe_tag}[@name="{safe_name}"]')

        if element_info.alt:
            safe_alt = _escape_xpath(element_info.alt)
            if safe_alt:
                xpaths.append(f'//{safe_tag}[@alt="{safe_alt}"]')

        if text_snippet:
            safe_text = _escape_xpath(text_snippet)
            if safe_text:
                xpaths.append(f'//{safe_tag}[contains(., "{safe_text}")]')

        xpaths.append(XPathGenerator._generate_absolute_xpath(element_info))

        xpaths.append(XPathGenerator._generate_absolute_xpath_with_index(element_info))

        return [xp for xp in xpaths if xp]

    @staticmethod
    def _generate_absolute_xpath(element_info: ElementInfo) -> str:
        """Generate absolute XPath from element info."""
        return f"/html/body//{element_info.tag}"

    @staticmethod
    def _generate_absolute_xpath_with_index(element_info: ElementInfo) -> str:
        """Generate absolute XPath with position index."""
        return f"/html/body/{element_info.tag}[1]"

    @staticmethod
    def from_dict(element_dict: dict) -> list[str]:
        """Generate XPaths from element dictionary.

        Args:
            element_dict: Dict with element info (tag, id, class, etc.)

        Returns:
            List of candidate XPaths
        """
        info = ElementInfo(
            tag=element_dict.get("tag", "div"),
            id=element_dict.get("id"),
            class_name=element_dict.get("class"),
            name=element_dict.get("name"),
            alt=element_dict.get("alt"),
            text_content=element_dict.get("text", ""),
            attributes=element_dict.get("attributes", {}),
        )
        return XPathGenerator.generate(info)


def generate_element_xpaths(
    tag: str,
    text: str = "",
    element_id: Optional[str] = None,
    class_name: Optional[str] = None,
    name: Optional[str] = None,
    alt: Optional[str] = None,
) -> list[str]:
    """Convenience function to generate XPaths.

    Args:
        tag: HTML tag name
        text: Element text content
        element_id: Element ID
        class_name: Element class name
        name: Element name attribute
        alt: Element alt attribute

    Returns:
        List of candidate XPaths
    """
    info = ElementInfo(
        tag=tag,
        text_content=text,
        id=element_id,
        class_name=class_name,
        name=name,
        alt=alt,
    )
    return XPathGenerator.generate(info)
