"""Enhanced complexity analyzer with actual page analysis."""

import asyncio
import re
from dataclasses import dataclass, field
from typing import Optional, AsyncIterator
from ..config import ComplexityThresholds
from .complexity_analyzer import ComplexityAnalyzer


@dataclass
class ComplexityResult:
    """Result of complexity analysis."""

    score: float
    level: str
    reasons: list[str]
    html_hints: dict = field(default_factory=dict)
    dynamic_indicators: list[str] = field(default_factory=list)


@dataclass
class PageStructure:
    """Page structure analysis result."""

    total_elements: int = 0
    script_tags: int = 0
    style_tags: int = 0
    iframe_tags: int = 0
    ajax_patterns: int = 0
    vue_attributes: int = 0
    react_attributes: int = 0
    angular_attributes: int = 0
    fetch_api_usage: int = 0
    xmlhttprequest: int = 0
    dynamic_class_names: int = 0
    lazy_load_patterns: int = 0
    spa_routes: int = 0
    hydration_markers: int = 0
    component_tags: int = 0
    event_handlers: int = 0


class EnhancedComplexityAnalyzer:
    """Enhanced analyzer that actually visits pages for analysis."""

    DYNAMIC_PATTERNS = [
        r"__nuxt|__NEXT_DATA__|window\.__",
        r"ng-version|x-ng|ng-container",
        r"data-v-[a-f0-9]+",
        r'class="[^"]*react[^"]*"',
        r'class="[^"]*vue[^"]*"',
        r"\.(click|blur|focus|change|submit)\s*=",
        r"addEventListener\s*\(",
        r"fetch\s*\(",
        r"XMLHttpRequest",
        r"\$watch|\$emit|Vue\.observable",
        r'react[^"]*fragment|useState|useEffect',
    ]

    SPA_ROUTE_PATTERNS = [
        r"#/",
        r"#/[^/]+",
        r"/[^/]+/[^/]+",  # Deep routes suggest SPA
        r"history\.pushState",
        r"location\.hash",
    ]

    LAZY_LOAD_PATTERNS = [
        r"intersectionObserver",
        r"data-src|data-lazy|data-srcset",
        r"lazy-load|lazyload",
        r'loading="lazy"',
        r"MutationObserver",
    ]

    def __init__(
        self, thresholds: Optional[ComplexityThresholds] = None, timeout: float = 10.0
    ):
        self.thresholds = thresholds or ComplexityThresholds()
        self.timeout = timeout

    async def analyze_url(self, url: str) -> ComplexityResult:
        """Analyze URL for complexity indicators (fast, no actual visit)."""
        score = 0.0
        reasons = []

        simple_indicators = [".html", ".htm", ".php", "static", "wordpress", "jekyll"]
        for indicator in simple_indicators:
            if indicator in url.lower():
                score -= 0.15
                reasons.append(f"Simple indicator: {indicator}")

        complex_indicators = [
            ("javascript", 0.2),
            ("spa", 0.3),
            ("react", 0.25),
            ("vue", 0.25),
            ("angular", 0.25),
            ("dashboard", 0.2),
            ("app.", 0.2),
            ("webapp", 0.2),
            ("/api/", 0.15),
            ("callback=", 0.15),
            ("token=", 0.1),
        ]
        for indicator, weight in complex_indicators:
            if indicator in url.lower():
                score += weight
                reasons.append(f"Complex indicator: {indicator}")

        score = max(0.0, min(1.0, score))

        if score <= self.thresholds.simple_max:
            level = "simple"
        elif score >= self.thresholds.complex_min:
            level = "complex"
        else:
            level = "dynamic"

        return ComplexityResult(
            score=score,
            level=level,
            reasons=reasons,
            html_hints={},
            dynamic_indicators=[],
        )

    async def analyze_page(
        self, url: str, html_content: Optional[str] = None
    ) -> ComplexityResult:
        """Analyze page complexity by actually fetching and inspecting HTML.

        Args:
            url: Target URL
            html_content: Optional pre-fetched HTML content

        Returns:
            Detailed complexity analysis with page structure insights
        """
        if html_content is None:
            html_content = await self._fetch_page_preview(url)

        if not html_content:
            return await self.analyze_url(url)

        structure = self._analyze_html_structure(html_content)
        url_result = await self.analyze_url(url)

        score = url_result.score
        reasons = url_result.reasons.copy()
        dynamic_indicators = []

        if structure.script_tags > 10:
            score += 0.1
            reasons.append(f"High script density: {structure.script_tags} scripts")
            dynamic_indicators.append("high_script_density")

        if structure.vue_attributes > 0:
            score += 0.3
            reasons.append(f"Vue.js detected: {structure.vue_attributes} attributes")
            dynamic_indicators.append("vue")

        if structure.react_attributes > 0:
            score += 0.3
            reasons.append(f"React detected: {structure.react_attributes} attributes")
            dynamic_indicators.append("react")

        if structure.angular_attributes > 0:
            score += 0.3
            reasons.append(
                f"Angular detected: {structure.angular_attributes} attributes"
            )
            dynamic_indicators.append("angular")

        if structure.fetch_api_usage > 0 or structure.xmlhttprequest > 0:
            score += 0.15
            reasons.append(
                f"AJAX detected: {structure.fetch_api_usage + structure.xmlhttprequest} calls"
            )
            dynamic_indicators.append("ajax")

        if structure.spa_routes > 2:
            score += 0.2
            reasons.append(f"SPA routing detected: {structure.spa_routes} patterns")
            dynamic_indicators.append("spa_routing")

        if structure.hydration_markers > 0:
            score += 0.2
            reasons.append(
                f"SSR hydration detected: {structure.hydration_markers} markers"
            )
            dynamic_indicators.append("ssr_hydration")

        if structure.component_tags > 5:
            score += 0.15
            reasons.append(
                f"Component-based: {structure.component_tags} custom elements"
            )
            dynamic_indicators.append("component_based")

        if structure.lazy_load_patterns > 3:
            score += 0.1
            reasons.append(f"Lazy loading: {structure.lazy_load_patterns} patterns")
            dynamic_indicators.append("lazy_loading")

        if structure.iframe_tags > 2:
            score += 0.1
            reasons.append(f"Multiple iframes: {structure.iframe_tags}")
            dynamic_indicators.append("iframe_content")

        score = max(0.0, min(1.0, score))

        if score <= self.thresholds.simple_max:
            level = "simple"
        elif score >= self.thresholds.complex_min:
            level = "complex"
        else:
            level = "dynamic"

        html_hints = {
            "scripts": structure.script_tags,
            "vue": structure.vue_attributes,
            "react": structure.react_attributes,
            "angular": structure.angular_attributes,
            "ajax": structure.fetch_api_usage + structure.xmlhttprequest,
            "spa_routes": structure.spa_routes,
            "hydration": structure.hydration_markers,
        }

        return ComplexityResult(
            score=score,
            level=level,
            reasons=reasons,
            html_hints=html_hints,
            dynamic_indicators=dynamic_indicators,
        )

    def _analyze_html_structure(self, html: str) -> PageStructure:
        """Analyze HTML content for complexity indicators."""
        structure = PageStructure()

        structure.script_tags = len(re.findall(r"<script", html, re.IGNORECASE))
        structure.style_tags = len(re.findall(r"<style", html, re.IGNORECASE))
        structure.iframe_tags = len(re.findall(r"<iframe", html, re.IGNORECASE))

        structure.vue_attributes = (
            len(re.findall(r"v-(?:if|for|bind|on|show|model)", html))
            + len(re.findall(r":class=|:style=", html))
            + len(re.findall(r"@click|@submit|@change", html))
        )

        structure.react_attributes = (
            len(re.findall(r"data-react|\$react|__react", html))
            + len(re.findall(r"onClick|onChange|onSubmit", html))
            + len(re.findall(r"react-root|react-fiber", html))
        )

        structure.angular_attributes = (
            len(re.findall(r"\bng-(?:if|for|bind|click|submit)", html))
            + len(re.findall(r"\*ng(?:If|For|Class)", html))
            + len(re.findall(r"ng-version", html))
        )

        structure.fetch_api_usage = len(re.findall(r"fetch\s*\(", html))
        structure.xmlhttprequest = len(re.findall(r"XMLHttpRequest", html))

        structure.dynamic_class_names = len(re.findall(r"data-v-[a-f0-9]{6,}", html))

        structure.spa_routes = 0
        for pattern in self.SPA_ROUTE_PATTERNS:
            structure.spa_routes += len(re.findall(pattern, html, re.IGNORECASE))

        structure.hydration_markers = len(
            re.findall(
                r"__NEXT_DATA__|__nuxt|__PRELOADED_STATE__|window\.__INITIAL_STATE__",
                html,
            )
        )

        structure.component_tags = len(re.findall(r"<[a-z]+-[a-z]+(?:-[a-z]+)*", html))

        structure.lazy_load_patterns = 0
        for pattern in self.LAZY_LOAD_PATTERNS:
            structure.lazy_load_patterns += len(
                re.findall(pattern, html, re.IGNORECASE)
            )

        return structure

    async def _fetch_page_preview(self, url: str) -> Optional[str]:
        """Fetch a small preview of the page for analysis."""
        try:
            import aiohttp

            headers = {
                "User-Agent": "Mozilla/5.0 (compatible; ComplexityAnalyzer/1.0)",
                "Accept": "text/html,*/*",
            }

            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    headers=headers,
                    timeout=aiohttp.ClientTimeout(total=self.timeout),
                    allow_redirects=True,
                ) as response:
                    if response.status == 200:
                        content_type = response.headers.get("Content-Type", "")
                        if "text/html" in content_type:
                            html = await response.text()
                            return html[:50000]
                    return None

        except Exception:
            return None

    async def batch_analyze(self, urls: list[str]) -> list[ComplexityResult]:
        """Analyze multiple URLs concurrently."""
        tasks = [self.analyze_url(url) for url in urls]
        return await asyncio.gather(*tasks, return_exceptions=True)

    def recommend_strategy(self, result: ComplexityResult) -> str:
        """Recommend scraping strategy based on complexity analysis."""
        if result.level == "simple":
            return "scrapling"
        elif result.level == "complex":
            if (
                "react" in result.dynamic_indicators
                or "vue" in result.dynamic_indicators
            ):
                return "browser_use"
            return "browser_use"
        else:
            if "ajax" in result.dynamic_indicators:
                return "browser_use"
            return "scrapling"


class HybridComplexityAnalyzer:
    """Combines URL-based and page-based analysis for optimal results."""

    def __init__(
        self,
        quick_threshold: float = 0.3,
        deep_threshold: float = 0.7,
        timeout: float = 10.0,
    ):
        self.quick_analyzer = ComplexityAnalyzer()
        self.deep_analyzer = EnhancedComplexityAnalyzer(timeout=timeout)
        self.quick_threshold = quick_threshold
        self.deep_threshold = deep_threshold

    async def analyze(self, url: str, deep: bool = False) -> ComplexityResult:
        """Analyze URL with optional deep page inspection.

        Args:
            url: Target URL
            deep: Whether to perform deep page analysis

        Returns:
            Complexity analysis result
        """
        if deep:
            return await self.deep_analyzer.analyze_page(url)

        quick_result = await self.quick_analyzer.analyze_url(url)

        if self.quick_threshold <= quick_result.score < self.deep_threshold:
            return await self.deep_analyzer.analyze_page(url)

        return quick_result

    async def analyze_with_fallback(
        self, url: str, max_attempts: int = 2
    ) -> ComplexityResult:
        """Analyze with automatic fallback to deeper analysis."""
        result = await self.analyze(url, deep=False)

        if self.quick_threshold <= result.score < self.deep_threshold:
            result = await self.analyze(url, deep=True)

        return result
