"""Smart strategy selector for autonomous crawling."""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum
import re
import asyncio


class SiteComplexity(Enum):
    """Site complexity levels."""

    SIMPLE = "simple"
    MEDIUM = "medium"
    COMPLEX = "complex"
    UNKNOWN = "unknown"


class ContentType(Enum):
    """Detected content types."""

    STATIC_HTML = "static_html"
    DYNAMIC_HTML = "dynamic_html"
    JSON_API = "json_api"
    SPA = "spa"
    MEDIA = "media"
    DOCUMENT = "document"
    ECOMMERCE = "ecommerce"
    SOCIAL = "social"
    NEWS = "news"
    FORUM = "forum"


@dataclass
class SiteProfile:
    """Analyzed site profile."""

    domain: str
    complexity: SiteComplexity
    content_type: ContentType
    requires_js: bool = False
    has_api: bool = False
    has_captcha: bool = False
    rate_limit_level: str = "low"
    recommended_strategy: str = "auto"
    features: dict = field(default_factory=dict)
    confidence: float = 0.0


@dataclass
class StrategyRecommendation:
    """Strategy selection recommendation."""

    strategy: str
    confidence: float
    reasoning: str
    estimated_success: float
    fallback_strategy: Optional[str] = None
    config: dict = field(default_factory=dict)


class SmartStrategySelector:
    """
    Intelligent strategy selector for autonomous crawling.

    Analyzes sites and automatically selects best strategy.
    """

    SITE_SIGNATURES = {
        "ecommerce": {
            "domains": ["shop", "store", "amazon", "ebay", "taobao", "jd", "tmall"],
            "patterns": [r"product", r"price", r"cart", r"buy", r"shop"],
            "content_types": [ContentType.ECOMMERCE],
        },
        "social": {
            "domains": [
                "facebook",
                "twitter",
                "instagram",
                "reddit",
                "douyin",
                "xiaohongshu",
            ],
            "patterns": [r"post", r"follow", r"like", r"comment", r"share"],
            "content_types": [ContentType.SOCIAL],
        },
        "news": {
            "domains": ["news", "cnn", "bbc", "reuters", "bloomberg"],
            "patterns": [r"article", r"published", r"author", r"headline"],
            "content_types": [ContentType.NEWS],
        },
        "forum": {
            "domains": ["forum", "reddit", "stackexchange", "-discuss"],
            "patterns": [r"reply", r"thread", r"topic", r"user"],
            "content_types": [ContentType.FORUM],
        },
        "spa": {
            "domains": ["app", "dashboard", "console"],
            "patterns": [r"react", r"vue", r"angular", r"webpack", r"__NEXT_DATA__"],
            "requires_js": True,
            "content_types": [ContentType.SPA, ContentType.DYNAMIC_HTML],
        },
    }

    def __init__(self):
        self._cache: dict[str, SiteProfile] = {}
        self._lock = asyncio.Lock()

    async def analyze(
        self,
        url: str,
        sample_content: Optional[str] = None,
        headers: Optional[dict] = None,
    ) -> SiteProfile:
        """
        Analyze site and create profile.

        Args:
            url: Target URL
            sample_content: Optional sample HTML
            headers: Optional response headers

        Returns:
            SiteProfile with recommendations
        """
        domain = self._extract_domain(url)

        async with self._lock:
            if domain in self._cache:
                return self._cache[domain]

        profile = SiteProfile(
            domain=domain,
            complexity=SiteComplexity.UNKNOWN,
            content_type=ContentType.STATIC_HTML,
        )

        profile.content_type = self._detect_content_type(url, sample_content)

        profile.complexity = self._assess_complexity(url, sample_content, headers)

        profile.requires_js = self._requires_javascript(url, sample_content, headers)

        profile.has_api = self._has_api(sample_content)

        profile.rate_limit_level = self._assess_rate_limit(url, headers)

        profile.recommended_strategy = self._recommend_strategy(profile)

        profile.confidence = self._calculate_confidence(profile)

        async with self._lock:
            self._cache[domain] = profile

        return profile

    async def recommend(
        self,
        url: str,
        sample_content: Optional[str] = None,
        headers: Optional[dict] = None,
    ) -> StrategyRecommendation:
        """
        Get strategy recommendation for URL.

        Args:
            url: Target URL
            sample_content: Optional sample content
            headers: Optional headers

        Returns:
            StrategyRecommendation
        """
        profile = await self.analyze(url, sample_content, headers)

        strategy = profile.recommended_strategy
        reasoning = self._generate_reasoning(profile)

        fallback = None
        if strategy == "crawl4ai":
            fallback = "scrapling"
        elif strategy == "scrapling":
            fallback = "stdlib"
        elif strategy == "auto":
            fallback = "scrapling"

        estimated_success = self._estimate_success(strategy, profile)

        config = self._get_strategy_config(strategy, profile)

        return StrategyRecommendation(
            strategy=strategy,
            confidence=profile.confidence,
            reasoning=reasoning,
            estimated_success=estimated_success,
            fallback_strategy=fallback,
            config=config,
        )

    def _extract_domain(self, url: str) -> str:
        """Extract domain from URL."""
        match = re.search(r"https?://([^/]+)", url)
        return match.group(1) if match else url

    def _detect_content_type(
        self,
        url: str,
        content: Optional[str],
    ) -> ContentType:
        """Detect content type from URL and content."""
        domain = self._extract_domain(url).lower()

        for sig_name, sig in self.SITE_SIGNATURES.items():
            if any(d in domain for d in sig["domains"]):
                return sig["content_types"][0]

        if content:
            if re.search(r'"@type"\s*:\s*"', content):
                return ContentType.STATIC_HTML
            if re.search(r"api|json|/v1/|/v2/", url.lower()):
                return ContentType.JSON_API
            if re.search(r"react|vue\.js|angular|__NEXT_DATA__", content, re.I):
                return ContentType.SPA

        return ContentType.STATIC_HTML

    def _assess_complexity(
        self,
        url: str,
        content: Optional[str],
        headers: Optional[dict],
    ) -> SiteComplexity:
        """Assess site complexity."""
        score = 0

        domain = self._extract_domain(url).lower()
        for sig in self.SITE_SIGNATURES.values():
            if any(d in domain for d in sig["domains"]):
                score += 2

        if content:
            script_count = len(re.findall(r"<script", content))
            if script_count > 10:
                score += 2
            elif script_count > 5:
                score += 1

            if re.search(r"__NEXT_DATA__|react|vue", content, re.I):
                score += 2

            forms = len(re.findall(r"<form", content))
            if forms > 3:
                score += 1

        if headers:
            if "x-swr" in headers or "x-nextjs" in headers:
                score += 2

        if score >= 4:
            return SiteComplexity.COMPLEX
        elif score >= 2:
            return SiteComplexity.MEDIUM
        else:
            return SiteComplexity.SIMPLE

    def _requires_javascript(
        self,
        url: str,
        content: Optional[str],
        headers: Optional[dict],
    ) -> bool:
        """Check if site requires JavaScript."""
        if headers:
            if "text/html" not in headers.get("content-type", ""):
                return False

        if content:
            if re.search(r"__NEXT_DATA__|gatsby|nuxt", content, re.I):
                return True
            if not re.search(r"<noscript>", content, re.I):
                if re.search(r"class=\"[^\"]*lazy[^\"]*\"", content, re.I):
                    return True

        return False

    def _has_api(self, content: Optional[str]) -> bool:
        """Check if site has API."""
        if not content:
            return False
        return bool(re.search(r"window\.__\w+__\s*=|__INITIAL_STATE__", content))

    def _assess_rate_limit(
        self,
        url: str,
        headers: Optional[dict],
    ) -> str:
        """Assess rate limit level."""
        if headers:
            if "retry-after" in headers:
                return "high"
            if "x-ratelimit" in headers:
                return "medium"

        domain = self._extract_domain(url).lower()
        strict_domains = ["google", "facebook", "twitter", "amazon", "microsoft"]
        if any(d in domain for d in strict_domains):
            return "high"

        return "low"

    def _recommend_strategy(self, profile: SiteProfile) -> str:
        """Recommend best strategy."""
        if profile.requires_js:
            if profile.complexity == SiteComplexity.COMPLEX:
                return "crawl4ai"
            else:
                return "node"

        if profile.content_type == ContentType.JSON_API:
            return "stdlib"

        if profile.content_type == ContentType.SPA:
            return "crawl4ai"

        if profile.complexity == SiteComplexity.SIMPLE:
            return "stdlib"

        if profile.complexity == SiteComplexity.MEDIUM:
            return "scrapling"

        return "scrapling"

    def _calculate_confidence(self, profile: SiteProfile) -> float:
        """Calculate analysis confidence."""
        base = 0.5

        if profile.content_type != ContentType.UNKNOWN:
            base += 0.2

        if profile.complexity != SiteComplexity.UNKNOWN:
            base += 0.2

        if profile.requires_js:
            base -= 0.1

        return min(1.0, max(0.0, base))

    def _generate_reasoning(self, profile: SiteProfile) -> str:
        """Generate human-readable reasoning."""
        reasons = []

        reasons.append(f"Content type: {profile.content_type.value}")

        if profile.complexity != SiteComplexity.UNKNOWN:
            reasons.append(f"Complexity: {profile.complexity.value}")

        if profile.requires_js:
            reasons.append("Requires JavaScript rendering")

        if profile.has_api:
            reasons.append("Uses API endpoints")

        if profile.rate_limit_level == "high":
            reasons.append("High rate limiting detected")

        reasons.append(f"Recommended: {profile.recommended_strategy}")

        return "; ".join(reasons)

    def _estimate_success(
        self,
        strategy: str,
        profile: SiteProfile,
    ) -> float:
        """Estimate success probability."""
        base = 0.85

        if strategy == "scrapling" and not profile.requires_js:
            base = 0.95

        if strategy == "crawl4ai" and profile.requires_js:
            base = 0.9

        if profile.rate_limit_level == "high":
            base -= 0.15

        if profile.complexity == SiteComplexity.COMPLEX:
            base -= 0.1

        return min(1.0, max(0.0, base))

    def _get_strategy_config(
        self,
        strategy: str,
        profile: SiteProfile,
    ) -> dict:
        """Get strategy configuration."""
        config = {
            "timeout": 30,
            "retries": 3,
        }

        if profile.rate_limit_level == "high":
            config["delay"] = 2.0
            config["retries"] = 5

        if strategy == "crawl4ai":
            config["browser"] = True
            config["wait_for"] = "networkidle"

        if profile.content_type == ContentType.SPA:
            config["wait_for"] = "networkidle"
            config["timeout"] = 60

        return config


async def auto_crawl_recommend(url: str) -> StrategyRecommendation:
    """
    Quick strategy recommendation.

    Args:
        url: Target URL

    Returns:
        StrategyRecommendation
    """
    selector = SmartStrategySelector()
    return await selector.recommend(url)
