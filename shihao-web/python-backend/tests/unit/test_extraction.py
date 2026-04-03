"""Unit tests for extraction module - Fast lxml-based batch extraction."""

import pytest
from crawler.extraction import (
    LXMLExtractor,
    FastExtractor,
    FieldExtractor,
    FieldDefinition,
)


SAMPLE_HTML = """
<html>
<head><title>Test Page</title></head>
<body>
    <div class="products">
        <div class="product">
            <h2 class="title">Product 1</h2>
            <span class="price">$99.00</span>
            <a href="/product/1" class="link">View Details</a>
        </div>
        <div class="product">
            <h2 class="title">Product 2</h2>
            <span class="price">$149.00</span>
            <a href="/product/2" class="link">View Details</a>
        </div>
        <div class="product">
            <h2 class="title">Product 3</h2>
            <span class="price">$199.00</span>
            <a href="/product/3" class="link">View Details</a>
        </div>
    </div>
</body>
</html>
"""


class TestLXMLExtractor:
    """Test lxml extractor."""

    def test_from_string(self):
        tree = LXMLExtractor.from_string(SAMPLE_HTML)
        assert tree is not None

    def test_extract_text(self):
        tree = LXMLExtractor.from_string(SAMPLE_HTML)

        title = LXMLExtractor.extract_text(tree, "//h2[1]")
        assert "Product 1" in title

    def test_extract_text_not_found(self):
        tree = LXMLExtractor.from_string(SAMPLE_HTML)

        result = LXMLExtractor.extract_text(tree, "//nonexistent")
        assert result == ""

    def test_extract_attribute(self):
        tree = LXMLExtractor.from_string(SAMPLE_HTML)

        href = LXMLExtractor.extract_attribute(tree, "//a[1]", "href")
        assert "/product/1" in href

    def test_extract_all(self):
        tree = LXMLExtractor.from_string(SAMPLE_HTML)

        products = LXMLExtractor.extract_all(tree, "//div[@class='product']")
        assert len(products) == 3

    def test_extract_batch(self):
        tree = LXMLExtractor.from_string(SAMPLE_HTML)

        field_xpaths = {
            "title": ".//h2[@class='title']//text()",
            "price": ".//span[@class='price']//text()",
        }

        results = LXMLExtractor.extract_batch(
            tree, "//div[@class='product']", field_xpaths
        )

        assert len(results) == 3
        assert results[0]["title"] == "Product 1"
        assert results[0]["price"] == "$99.00"


class TestFastExtractor:
    """Test fast extractor."""

    def test_can_optimize_simple(self):
        extractor = FastExtractor()

        assert extractor.can_optimize() is True
        assert (
            extractor.can_optimize(
                has_js_operations=False, has_wait_element=False, has_iframe=False
            )
            is True
        )

    def test_cannot_optimize_with_js(self):
        extractor = FastExtractor()

        assert extractor.can_optimize(has_js_operations=True) is False

    def test_cannot_optimize_with_wait_element(self):
        extractor = FastExtractor()

        assert extractor.can_optimize(has_wait_element=True) is False

    def test_cannot_optimize_with_iframe(self):
        extractor = FastExtractor()

        assert extractor.can_optimize(has_iframe=True) is False

    def test_extract_loop(self):
        extractor = FastExtractor()

        field_params = [
            {"name": "title", "relativeXPath": ".//h2[@class='title']//text()"},
            {"name": "price", "relativeXPath": ".//span[@class='price']//text()"},
        ]

        result = extractor.extract_loop(
            SAMPLE_HTML,
            "//div[@class='product']",
            field_params,
        )

        assert result.success is True
        assert result.count == 3
        assert len(result.data) == 3
        assert result.data[0]["title"] == "Product 1"
        assert result.data[0]["price"] == "$99.00"

    def test_extract_loop_with_skip(self):
        extractor = FastExtractor()

        field_params = [
            {"name": "title", "relativeXPath": ".//h2[@class='title']//text()"},
        ]

        result = extractor.extract_loop(
            SAMPLE_HTML,
            "//div[@class='product']",
            field_params,
            skip_count=1,
        )

        assert result.success is True
        assert result.count == 2
        assert result.data[0]["title"] == "Product 2"

    def test_extract_loop_failure(self):
        extractor = FastExtractor()

        result = extractor.extract_loop(
            "<html><body></body></html>",
            "//nonexistent",
            [],
        )

        assert result.success is True
        assert result.count == 0
        assert len(result.data) == 0

    def test_extract_with_relative_xpath(self):
        extractor = FastExtractor()

        field_params = [
            {"name": "title", "relativeXPath": "//h2[@class='title']//text()"},
        ]

        result = extractor.extract_with_relative_xpath(
            SAMPLE_HTML,
            "//div[@class='product']",
            "",
            field_params,
        )

        assert result.success is True
        assert result.count == 3


class TestFieldExtractor:
    """Test field extractor."""

    def test_extract_field_text(self):
        tree = LXMLExtractor.from_string(SAMPLE_HTML)

        field = FieldDefinition(
            name="title",
            xpath="//h2[1]//text()",
            content_type=0,
        )

        value = FieldExtractor.extract_field(tree, field)
        assert "Product 1" in value

    def test_extract_field_with_default(self):
        tree = LXMLExtractor.from_string(SAMPLE_HTML)

        field = FieldDefinition(
            name="missing",
            xpath="//nonexistent",
            content_type=0,
            default="N/A",
        )

        value = FieldExtractor.extract_field(tree, field)
        assert value == "N/A"

    def test_extract_field_inner_html(self):
        tree = LXMLExtractor.from_string(SAMPLE_HTML)

        field = FieldDefinition(
            name="product_html",
            xpath="//div[@class='product'][1]",
            content_type=2,
        )

        value = FieldExtractor.extract_field(tree, field)
        assert "Product 1" in value


class TestExtractFieldsFunction:
    """Test convenience function."""

    def test_extract_fields(self):
        fields = [
            FieldDefinition(
                name="title", xpath=".//h2[@class='title']//text()", content_type=0
            ),
            FieldDefinition(
                name="price", xpath=".//span[@class='price']//text()", content_type=0
            ),
        ]

        results = FieldExtractor.extract_fields(
            SAMPLE_HTML, "//div[@class='product']", fields
        )

        assert len(results) == 3
        assert results[0]["title"] == "Product 1"
        assert results[0]["price"] == "$99.00"

    def test_extract_fields_empty(self):
        fields = []

        results = FieldExtractor.extract_fields(SAMPLE_HTML, "//nonexistent", fields)

        assert results == []
