from dataclasses import dataclass
from typing import Optional
from ..config import ComplexityThresholds


@dataclass
class ComplexityResult:
    """Result of complexity analysis."""

    score: float
    level: str
    reasons: list[str]


class ComplexityAnalyzer:
    """Analyzes page complexity to determine best scraping strategy."""

    def __init__(self, thresholds: Optional[ComplexityThresholds] = None):
        self.thresholds = thresholds or ComplexityThresholds()

    def analyze_url(self, url: str) -> ComplexityResult:
        """Analyze URL for complexity indicators."""
        score = 0.0
        reasons = []

        simple_indicators = [".html", ".htm", ".php", "static"]
        for indicator in simple_indicators:
            if indicator in url.lower():
                score -= 0.2

        complex_indicators = [
            "javascript",
            "spa",
            "react",
            "vue",
            "angular",
            "api.",
            "json",
            "dashboard",
            "app.",
            "webapp",
        ]
        for indicator in complex_indicators:
            if indicator in url.lower():
                score += 0.3
                reasons.append(f"Found complex indicator: {indicator}")

        score = max(0.0, min(1.0, score))

        if score <= self.thresholds.simple_max:
            level = "simple"
        elif score >= self.thresholds.complex_min:
            level = "complex"
        else:
            level = "dynamic"

        return ComplexityResult(score=score, level=level, reasons=reasons)
