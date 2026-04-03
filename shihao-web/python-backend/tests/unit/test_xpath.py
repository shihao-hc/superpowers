"""Unit tests for xpath module - Multi-strategy XPath generation and fallback."""

import pytest
from crawler.xpath import (
    XPathGenerator,
    generate_element_xpaths,
    ElementInfo,
)


class TestXPathGenerator:
    """Test XPath generator."""

    def test_generate_with_id(self):
        info = ElementInfo(
            tag="div",
            id="main-content",
            text_content="Hello World",
        )

        xpaths = XPathGenerator.generate(info)

        assert len(xpaths) > 0
        assert '//*[@id="main-content"]' in xpaths

    def test_generate_with_class(self):
        info = ElementInfo(
            tag="span",
            class_name="title",
            text_content="Header",
        )

        xpaths = XPathGenerator.generate(info)

        assert len(xpaths) > 0
        assert any('contains(@class, "title")' in x for x in xpaths)

    def test_generate_with_text(self):
        info = ElementInfo(
            tag="h1",
            text_content="This is a header",
        )

        xpaths = XPathGenerator.generate(info)

        assert len(xpaths) > 0
        text_snippet = info.text_content[:20].strip()
        assert any(text_snippet in x for x in xpaths)

    def test_generate_with_name_attribute(self):
        info = ElementInfo(
            tag="input",
            name="username",
        )

        xpaths = XPathGenerator.generate(info)

        assert len(xpaths) > 0
        assert '//input[@name="username"]' in xpaths

    def test_generate_with_alt_attribute(self):
        info = ElementInfo(
            tag="img",
            alt="Profile picture",
        )

        xpaths = XPathGenerator.generate(info)

        assert len(xpaths) > 0
        assert '//img[@alt="Profile picture"]' in xpaths

    def test_generate_all_strategies(self):
        info = ElementInfo(
            tag="a",
            id="link1",
            class_name="nav-link active",
            name="home",
            alt=None,
            text_content="Home Page",
        )

        xpaths = XPathGenerator.generate(info)

        assert len(xpaths) >= 5
        assert '//*[@id="link1"]' in xpaths
        assert '//a[@name="home"]' in xpaths

    def test_generate_empty_element_info(self):
        info = ElementInfo(tag="div")

        xpaths = XPathGenerator.generate(info)

        assert len(xpaths) >= 2

    def test_generate_absolute_xpath(self):
        info = ElementInfo(tag="section")

        abs_xpath = XPathGenerator._generate_absolute_xpath(info)
        assert abs_xpath == "/html/body//section"

    def test_generate_absolute_xpath_with_index(self):
        info = ElementInfo(tag="div")

        abs_xpath = XPathGenerator._generate_absolute_xpath_with_index(info)
        assert abs_xpath == "/html/body/div[1]"


class TestGenerateElementXPathsFunction:
    """Test convenience function."""

    def test_basic_generation(self):
        xpaths = generate_element_xpaths(
            tag="h1",
            text="Header Text",
        )

        assert len(xpaths) > 0
        assert any("h1" in x for x in xpaths)

    def test_with_id(self):
        xpaths = generate_element_xpaths(
            tag="div",
            element_id="container",
        )

        assert '//*[@id="container"]' in xpaths

    def test_with_class(self):
        xpaths = generate_element_xpaths(
            tag="p",
            class_name="intro",
        )

        assert any("class" in x for x in xpaths)

    def test_full_parameters(self):
        xpaths = generate_element_xpaths(
            tag="img",
            text="Image",
            element_id="logo",
            class_name="brand-logo",
            name="company-logo",
            alt="Company Logo",
        )

        assert len(xpaths) >= 4
        assert '//*[@id="logo"]' in xpaths
        assert '//img[@alt="Company Logo"]' in xpaths


class TestFromDict:
    """Test generation from dictionary."""

    def test_basic_dict(self):
        element_dict = {
            "tag": "span",
            "class": "price",
            "text": "$99.00",
        }

        xpaths = XPathGenerator.from_dict(element_dict)

        assert len(xpaths) > 0
        assert any("span" in x for x in xpaths)

    def test_dict_with_all_fields(self):
        element_dict = {
            "tag": "input",
            "id": "email",
            "class": "form-control",
            "name": "email",
            "alt": None,
            "text": "",
            "attributes": {"type": "email"},
        }

        xpaths = XPathGenerator.from_dict(element_dict)

        assert len(xpaths) >= 3
        assert '//*[@id="email"]' in xpaths
        assert '//input[@name="email"]' in xpaths
