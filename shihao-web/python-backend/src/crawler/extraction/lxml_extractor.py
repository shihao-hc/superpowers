"""Fast lxml-based extraction for batch processing."""

import re
from typing import Optional, Any
from dataclasses import dataclass
from lxml import html, etree


DANGEROUS_XPATH_PATTERNS = [
    r"(?i)\beval\s*\(",
    r"(?i)\bexec\s*\(",
    r"(?i)\bxpath\s*\(",
    r"(?i)\bdocument\s*\(",
]

MAX_XPATH_LENGTH = 1000


def _validate_xpath(xpath: str) -> bool:
    """Validate XPath for security."""
    if not xpath or len(xpath) > MAX_XPATH_LENGTH:
        return False
    for pattern in DANGEROUS_XPATH_PATTERNS:
        if re.search(pattern, xpath):
            return False
    return True


@dataclass
class ExtractionResult:
    """Result of extraction."""

    data: list[dict]
    count: int
    duration_ms: float
    success: bool
    error: Optional[str] = None


class LXMLExtractor:
    """Extract data using lxml for fast batch processing."""

    @staticmethod
    def from_string(html_string: str) -> etree._Element:
        """Parse HTML string to lxml element.

        Args:
            html_string: HTML content as string

        Returns:
            lxml element
        """
        return html.fromstring(html_string)

    @staticmethod
    def extract_text(element: etree._Element, xpath: str) -> str:
        """Extract text using XPath.

        Args:
            element: lxml element
            xpath: XPath expression

        Returns:
            Extracted text or empty string
        """
        if not _validate_xpath(xpath):
            return ""
        try:
            result = element.xpath(xpath)
            if result:
                if isinstance(result[0], str):
                    return result[0].strip()
                return etree.tostring(
                    result[0], method="text", encoding="unicode"
                ).strip()
        except Exception:
            pass
        return ""

    @staticmethod
    def extract_attribute(element: etree._Element, xpath: str, attr: str) -> str:
        """Extract attribute using XPath.

        Args:
            element: lxml element
            xpath: XPath expression
            attr: Attribute name

        Returns:
            Attribute value or empty string
        """
        if not _validate_xpath(xpath):
            return ""
        try:
            result = element.xpath(xpath)
            if result and len(result) > 0:
                if hasattr(result[0], "get"):
                    return result[0].get(attr, "")
                return str(result[0])
        except Exception:
            pass
        return ""

    @staticmethod
    def extract_all(element: etree._Element, xpath: str) -> list:
        """Extract all matching elements.

        Args:
            element: lxml element
            xpath: XPath expression

        Returns:
            List of matching elements
        """
        if not _validate_xpath(xpath):
            return []
        try:
            return element.xpath(xpath)
        except Exception:
            return []

    @staticmethod
    def extract_batch(
        element: etree._Element,
        base_xpath: str,
        field_xpaths: dict[str, str],
    ) -> list[dict]:
        """Extract batch of fields from multiple elements.

        Args:
            element: lxml element
            base_xpath: Base XPath for container elements
            field_xpaths: Dict mapping field names to XPath expressions

        Returns:
            List of extracted data rows
        """
        results = []
        containers = LXMLExtractor.extract_all(element, base_xpath)

        for container in containers:
            row = {}
            for field_name, field_xpath in field_xpaths.items():
                row[field_name] = LXMLExtractor.extract_text(container, field_xpath)
            results.append(row)

        return results


class FastExtractor:
    """High-performance extractor optimized for loop scenarios."""

    def __init__(self, optimize_threshold: int = 5):
        self.optimize_threshold = optimize_threshold

    def can_optimize(
        self,
        has_js_operations: bool = False,
        has_wait_element: bool = False,
        has_iframe: bool = False,
    ) -> bool:
        """Check if extraction can be optimized.

        Args:
            has_js_operations: Whether JS operations are needed
            has_wait_element: Whether waiting for specific element
            has_iframe: Whether iframe handling is needed

        Returns:
            True if can use fast lxml extraction
        """
        return not (has_js_operations or has_wait_element or has_iframe)

    def extract_loop(
        self,
        html_content: str,
        base_xpath: str,
        field_params: list[dict],
        skip_count: int = 0,
    ) -> ExtractionResult:
        """Fast batch extraction for loop scenarios.

        Args:
            html_content: HTML content
            base_xpath: XPath for container elements
            field_params: List of field parameter dicts
            skip_count: Number of elements to skip

        Returns:
            ExtractionResult with extracted data
        """
        import time

        start = time.time()

        try:
            tree = LXMLExtractor.from_string(html_content)
            containers = LXMLExtractor.extract_all(tree, base_xpath)

            if skip_count > 0:
                containers = containers[skip_count:]

            field_xpaths = {}
            for param in field_params:
                name = param.get("name", f"field_{len(field_xpaths)}")
                xpath = param.get("relativeXPath", param.get("xpath", "//text()"))
                field_xpaths[name] = xpath

            results = []
            for container in containers:
                row = {}
                for field_name, xpath in field_xpaths.items():
                    value = LXMLExtractor.extract_text(container, xpath)
                    if not value:
                        value = param.get("default", "")
                    row[field_name] = value
                results.append(row)

            duration = (time.time() - start) * 1000

            return ExtractionResult(
                data=results,
                count=len(results),
                duration_ms=duration,
                success=True,
            )

        except Exception as e:
            duration = (time.time() - start) * 1000
            return ExtractionResult(
                data=[],
                count=0,
                duration_ms=duration,
                success=False,
                error=str(e),
            )

    def extract_with_relative_xpath(
        self,
        html_content: str,
        parent_xpath: str,
        relative_xpath: str,
        field_params: list[dict],
    ) -> ExtractionResult:
        """Extract with relative XPath combination.

        Args:
            html_content: HTML content
            parent_xpath: Parent element XPath (container selector)
            relative_xpath: Relative XPath from parent
            field_params: Field extraction parameters

        Returns:
            ExtractionResult
        """
        import time

        start = time.time()

        try:
            tree = LXMLExtractor.from_string(html_content)

            results = []
            field_xpaths = {}
            for param in field_params:
                name = param.get("name", f"field_{len(field_xpaths)}")
                field_xpaths[name] = param.get(
                    "relativeXPath", param.get("xpath", "//text()")
                )

            containers = LXMLExtractor.extract_all(tree, parent_xpath)

            for container in containers:
                row = {}
                for field_name, xpath in field_xpaths.items():
                    elements = LXMLExtractor.extract_all(container, xpath)
                    if elements:
                        value = LXMLExtractor.extract_text(container, xpath)
                    else:
                        value = ""
                    row[field_name] = value
                results.append(row)

            duration = (time.time() - start) * 1000

            return ExtractionResult(
                data=results,
                count=len(results),
                duration_ms=duration,
                success=True,
            )

        except Exception as e:
            duration = (time.time() - start) * 1000
            return ExtractionResult(
                data=[],
                count=0,
                duration_ms=duration,
                success=False,
                error=str(e),
            )
