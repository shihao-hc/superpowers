"""Structured data extraction - JSON-LD, Schema.org, Microdata."""

from dataclasses import dataclass, field
from typing import Optional, Any
from lxml import html
import json
import re


@dataclass
class StructuredData:
    """Extracted structured data."""

    data_type: str
    data: dict
    source: str
    confidence: float
    raw_json: Optional[str] = None

    def __post_init__(self):
        if isinstance(self.data_type, str):
            self.data_type = self.data_type.lower()


@dataclass
class SchemaEntity:
    """Schema.org entity."""

    type: str
    properties: dict
    confidence: float = 1.0


class JSONLDExtractor:
    """
    Extract JSON-LD structured data.

    Supports:
    - @context
    - @type
    - Nested objects
    - Arrays
    """

    SCHEMA_TYPES = {
        "Article": ["article", "newsarticle", "blogposting"],
        "Product": ["product", "offer"],
        "Event": ["event", "musicevent", "sportevevnt"],
        "Recipe": ["recipe"],
        "Video": ["videoobject", "videoclip"],
        "Image": ["imageobject"],
        "Person": ["person"],
        "Organization": ["organization"],
        "BreadcrumbList": ["breadcrumblist"],
        "FAQPage": ["faqpage"],
    }

    def extract(self, html_content: str) -> list[StructuredData]:
        """
        Extract JSON-LD from HTML.

        Args:
            html_content: Raw HTML

        Returns:
            List of StructuredData objects
        """
        results = []

        try:
            tree = html.fromstring(html_content)

            scripts = tree.xpath('.//script[@type="application/ld+json"]')

            for script in scripts:
                try:
                    text = script.text_content()
                    if not text:
                        continue

                    data = json.loads(text)
                    source = "json-ld"

                    if isinstance(data, list):
                        for item in data:
                            structured = self._process_item(item, source)
                            if structured:
                                results.append(structured)
                    elif isinstance(data, dict):
                        structured = self._process_item(data, source)
                        if structured:
                            results.append(structured)

                except (json.JSONDecodeError, Exception):
                    continue

        except Exception:
            pass

        return results

    def _process_item(self, data: dict, source: str) -> Optional[StructuredData]:
        """Process single JSON-LD item."""
        if not data:
            return None

        context = data.get("@context", "")
        item_type = data.get("@type", "")

        if isinstance(item_type, list):
            item_type = item_type[0] if item_type else "Unknown"

        data_type = self._normalize_type(item_type)

        cleaned_data = self._clean_data(data)

        confidence = self._calculate_confidence(cleaned_data, item_type)

        return StructuredData(
            data_type=data_type,
            data=cleaned_data,
            source=source,
            confidence=confidence,
            raw_json=json.dumps(data, ensure_ascii=False),
        )

    def _normalize_type(self, item_type: str) -> str:
        """Normalize schema type."""
        item_type = item_type.replace("https://schema.org/", "").replace(
            "http://schema.org/", ""
        )

        for normalized, variants in self.SCHEMA_TYPES.items():
            if item_type.lower() in [v.lower() for v in variants]:
                return normalized

        return item_type

    def _clean_data(self, data: dict) -> dict:
        """Clean and normalize data."""
        cleaned = {}

        for key, value in data.items():
            if key.startswith("@"):
                continue

            if isinstance(value, dict):
                cleaned[key] = self._clean_data(value)
            elif isinstance(value, list):
                cleaned[key] = [
                    self._clean_data(v) if isinstance(v, dict) else v for v in value
                ]
            elif isinstance(value, str):
                cleaned[key] = value.strip()
            else:
                cleaned[key] = value

        return cleaned

    def _calculate_confidence(self, data: dict, item_type: str) -> float:
        """Calculate extraction confidence."""
        base_confidence = 0.8

        if not item_type:
            return 0.5

        required_fields = self._get_required_fields(item_type)

        if not required_fields:
            return base_confidence

        present = sum(1 for f in required_fields if f in data)
        field_ratio = present / len(required_fields)

        confidence = base_confidence * (0.5 + 0.5 * field_ratio)

        return min(1.0, max(0.0, confidence))

    def _get_required_fields(self, item_type: str) -> list[str]:
        """Get required fields for type."""
        required = {
            "Article": ["headline", "author"],
            "Product": ["name", "price"],
            "Recipe": ["name", "author", "ingredients"],
            "Event": ["name", "startDate"],
            "Video": ["name", "description"],
            "Person": ["name"],
            "Organization": ["name"],
        }

        return required.get(item_type, [])


class MicrodataExtractor:
    """
    Extract Microdata from HTML.

    Parses itemscope, itemprop attributes.
    """

    def extract(self, html_content: str) -> list[StructuredData]:
        """
        Extract Microdata from HTML.

        Args:
            html_content: Raw HTML

        Returns:
            List of StructuredData objects
        """
        results = []

        try:
            tree = html.fromstring(html_content)

            items = tree.xpath(".//*[@itemscope and @itemtype]")

            for item in items:
                data = self._extract_item(item)
                if data:
                    item_type = item.get("itemtype", "")
                    item_type = item_type.replace("https://schema.org/", "").replace(
                        "http://schema.org/", ""
                    )

                    results.append(
                        StructuredData(
                            data_type=item_type,
                            data=data,
                            source="microdata",
                            confidence=0.85,
                        )
                    )

        except Exception:
            pass

        return results

    def _extract_item(self, element) -> dict:
        """Extract single microdata item."""
        data = {}

        props = element.xpath(".//*[@itemprop]")

        for prop in props:
            prop_name = prop.get("itemprop")
            prop_value = self._get_property_value(prop)

            if prop_name in data:
                if not isinstance(data[prop_name], list):
                    data[prop_name] = [data[prop_name]]
                data[prop_name].append(prop_value)
            else:
                data[prop_name] = prop_value

        return data

    def _get_property_value(self, element) -> str:
        """Get value from itemprop element."""
        tag_name = element.tag.lower()

        if tag_name in ("meta"):
            return element.get("content", "")
        elif tag_name in ("img", "audio", "video", "source"):
            return element.get("src", "") or element.get("href", "")
        elif tag_name in ("a", "link"):
            return element.get("href", "")
        elif tag_name in ("data", "meter"):
            return element.get("value", "")
        elif tag_name == "time":
            return element.get("datetime", "") or element.text_content().strip()
        else:
            return element.text_content().strip() if element.text else ""


class RDFaExtractor:
    """
    Extract RDFa structured data.

    Parses property, resource, href attributes.
    """

    def extract(self, html_content: str) -> list[StructuredData]:
        """Extract RDFa from HTML."""
        results = []

        try:
            tree = html.fromstring(html_content)

            elements = tree.xpath(".//*[@property]")

            current_item = None
            item_data = {}
            item_type = ""

            for elem in elements:
                about = elem.get("resource") or elem.get("href") or elem.get("src")
                prop = elem.get("property", "")
                content = elem.get("content") or elem.text_content() or ""

                if about:
                    if item_data:
                        results.append(
                            StructuredData(
                                data_type=item_type.replace(
                                    "https://schema.org/", ""
                                ).replace("http://schema.org/", ""),
                                data=item_data,
                                source="rdfa",
                                confidence=0.8,
                            )
                        )

                    item_type = elem.get("typeof", "")
                    item_data = {}
                    current_item = about

                if prop:
                    item_data[prop.replace("schema:", "")] = content.strip()

            if item_data:
                results.append(
                    StructuredData(
                        data_type=item_type.replace("https://schema.org/", "").replace(
                            "http://schema.org/", ""
                        ),
                        data=item_data,
                        source="rdfa",
                        confidence=0.8,
                    )
                )

        except Exception:
            pass

        return results


class StructuredDataExtractor:
    """
    Unified structured data extraction.

    Combines JSON-LD, Microdata, and RDFa extractors.
    """

    def __init__(self):
        self.jsonld = JSONLDExtractor()
        self.microdata = MicrodataExtractor()
        self.rdfa = RDFaExtractor()

    def extract(self, html_content: str) -> list[StructuredData]:
        """
        Extract all structured data.

        Args:
            html_content: Raw HTML

        Returns:
            Combined list of StructuredData
        """
        results = []

        jsonld_data = self.jsonld.extract(html_content)
        results.extend(jsonld_data)

        microdata = self.microdata.extract(html_content)
        results.extend(microdata)

        rdfa = self.rdfa.extract(html_content)
        results.extend(rdfa)

        merged = self._merge_by_type(results)

        return merged

    def _merge_by_type(self, results: list[StructuredData]) -> list[StructuredData]:
        """Merge results by data type."""
        merged_dict = {}

        for item in results:
            key = f"{item.source}:{item.data_type}"

            if key not in merged_dict:
                merged_dict[key] = item
            else:
                existing = merged_dict[key]
                existing.data.update(item.data)
                existing.confidence = max(existing.confidence, item.confidence)

        return list(merged_dict.values())

    def extract_by_type(
        self,
        html_content: str,
        data_type: str,
    ) -> Optional[dict]:
        """
        Extract specific data type.

        Args:
            html_content: Raw HTML
            data_type: Schema.org type (Article, Product, etc.)

        Returns:
            First matching structured data or None
        """
        all_data = self.extract(html_content)

        for item in all_data:
            if item.data_type.lower() == data_type.lower():
                return item.data

        return None

    def extract_article(self, html_content: str) -> Optional[dict]:
        """Extract article/article data."""
        return self.extract_by_type(html_content, "article")

    def extract_product(self, html_content: str) -> Optional[dict]:
        """Extract product data."""
        return self.extract_by_type(html_content, "product")

    def extract_breadcrumbs(self, html_content: str) -> Optional[list]:
        """Extract breadcrumb navigation."""
        article_data = self.extract_by_type(html_content, "breadcrumblist")

        if article_data and "itemListElement" in article_data:
            return [
                item.get("name") or item.get("item")
                for item in article_data["itemListElement"]
                if isinstance(item, dict)
            ]

        return None

    def extract_faq(self, html_content: str) -> Optional[list]:
        """Extract FAQ data."""
        faq_data = self.extract_by_type(html_content, "faqpage")

        if faq_data and "mainEntity" in faq_data:
            return [
                {
                    "question": q.get("name"),
                    "answer": q.get("acceptedAnswer", {}).get("text"),
                }
                for q in faq_data["mainEntity"]
                if isinstance(q, dict)
            ]

        return None
