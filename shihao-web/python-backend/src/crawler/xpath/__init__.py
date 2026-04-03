"""XPath module - Multi-strategy XPath generation and fallback."""

from .generator import XPathGenerator, generate_element_xpaths, ElementInfo
from .fallback import XPathFallback, try_xpath_with_fallback, XPathAttempt

__all__ = [
    "XPathGenerator",
    "generate_element_xpaths",
    "ElementInfo",
    "XPathFallback",
    "try_xpath_with_fallback",
    "XPathAttempt",
]
