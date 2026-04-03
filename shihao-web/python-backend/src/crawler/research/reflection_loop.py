"""Research agent with reflection loop for improved search quality."""

from dataclasses import dataclass, field
from typing import Optional, List, Callable, Any, Dict
from datetime import datetime
from enum import Enum
import logging


logger = logging.getLogger(__name__)


class QualityLevel(str, Enum):
    """Quality assessment levels."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXCELLENT = "excellent"


@dataclass
class QualityScore:
    """Quality assessment result."""

    level: QualityLevel
    score: float
    breakdown: Dict[str, float]
    suggestions: List[str]

    @property
    def is_sufficient(self) -> bool:
        return self.score >= 0.6


@dataclass
class SearchRecord:
    """Record of a search operation."""

    query: str
    result: str
    timestamp: str
    iteration: int
    quality: Optional[QualityScore] = None


@dataclass
class Reflection:
    """Reflection on current results."""

    assessment: str
    gaps: List[str]
    improvement_suggestions: List[str]
    refined_query: Optional[str] = None


@dataclass
class ResearchState:
    """State for research agent."""

    query: str
    topics: List[Dict[str, Any]] = field(default_factory=list)
    search_history: List[SearchRecord] = field(default_factory=list)
    reflections: List[Reflection] = field(default_factory=list)
    final_result: str = ""
    is_completed: bool = False
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def add_search(
        self,
        query: str,
        result: str,
        iteration: int,
        quality: Optional[QualityScore] = None,
    ):
        self.search_history.append(
            SearchRecord(
                query=query,
                result=result,
                timestamp=datetime.now().isoformat(),
                iteration=iteration,
                quality=quality,
            )
        )

    def add_reflection(self, reflection: Reflection):
        self.reflections.append(reflection)

    def get_latest_search(self) -> Optional[SearchRecord]:
        return self.search_history[-1] if self.search_history else None

    def get_latest_reflection(self) -> Optional[Reflection]:
        return self.reflections[-1] if self.reflections else None

    def to_dict(self) -> dict:
        return {
            "query": self.query,
            "topics": self.topics,
            "search_count": len(self.search_history),
            "reflection_count": len(self.reflections),
            "is_completed": self.is_completed,
            "started_at": self.started_at,
        }


class QualityAssessor:
    """Assess quality of search results."""

    def __init__(
        self,
        min_length: int = 100,
        coverage_weight: float = 0.4,
        depth_weight: float = 0.3,
        relevance_weight: float = 0.3,
    ):
        self.min_length = min_length
        self.coverage_weight = coverage_weight
        self.depth_weight = depth_weight
        self.relevance_weight = relevance_weight

    def assess(
        self, result: str, query: str, context: Optional[Dict] = None
    ) -> QualityScore:
        """Assess quality of search result."""
        coverage = self._check_coverage(result, query)
        depth = self._check_depth(result)
        relevance = self._check_relevance(result, query)

        total_score = (
            coverage * self.coverage_weight
            + depth * self.depth_weight
            + relevance * self.relevance_weight
        )

        level = self._score_to_level(total_score)
        suggestions = self._generate_suggestions(coverage, depth, relevance)

        return QualityScore(
            level=level,
            score=total_score,
            breakdown={
                "coverage": coverage,
                "depth": depth,
                "relevance": relevance,
            },
            suggestions=suggestions,
        )

    def _check_coverage(self, result: str, query: str) -> float:
        """Check topic coverage."""
        query_terms = set(query.lower().split())
        result_lower = result.lower()

        covered_terms = sum(1 for term in query_terms if term in result_lower)
        coverage = covered_terms / len(query_terms) if query_terms else 0.5

        return min(1.0, coverage + 0.3)

    def _check_depth(self, result: str) -> float:
        """Check analysis depth."""
        length = len(result)

        if length < self.min_length:
            return 0.3
        elif length < 500:
            return 0.5
        elif length < 1500:
            return 0.7
        elif length < 3000:
            return 0.85
        else:
            return 1.0

    def _check_relevance(self, result: str, query: str) -> float:
        """Check query relevance."""
        query_lower = query.lower()
        result_lower = result.lower()

        query_words = set(query_lower.split())
        result_words = set(result_lower.split())

        overlap = (
            len(query_words & result_words) / len(query_words) if query_words else 0
        )

        return min(1.0, overlap + 0.5)

    def _score_to_level(self, score: float) -> QualityLevel:
        """Convert score to quality level."""
        if score >= 0.85:
            return QualityLevel.EXCELLENT
        elif score >= 0.7:
            return QualityLevel.HIGH
        elif score >= 0.5:
            return QualityLevel.MEDIUM
        else:
            return QualityLevel.LOW

    def _generate_suggestions(
        self, coverage: float, depth: float, relevance: float
    ) -> List[str]:
        """Generate improvement suggestions."""
        suggestions = []

        if coverage < 0.6:
            suggestions.append("Expand search to cover more related topics")
        if depth < 0.6:
            suggestions.append("Provide more detailed analysis")
        if relevance < 0.6:
            suggestions.append("Focus more closely on the main query")

        if not suggestions:
            suggestions.append("Quality is good, consider adding examples")

        return suggestions


class ReflectionGenerator:
    """Generate reflections on search results."""

    def __init__(
        self,
        reflect_func: Optional[Callable[[str, str], str]] = None,
    ):
        self.reflect_func = reflect_func

    def generate(
        self,
        current_result: str,
        query: str,
        context: Optional[Dict] = None,
    ) -> Reflection:
        """Generate reflection on current results."""
        if self.reflect_func:
            return self._generate_with_llm(current_result, query)

        return self._generate_heuristic(current_result, query)

    def _generate_with_llm(self, current_result: str, query: str) -> Reflection:
        """Generate reflection using LLM."""
        prompt = f"""
        Query: {query}
        
        Current Result:
        {current_result[:1000]}
        
        Reflect on:
        1. What aspects are well covered?
        2. What information gaps exist?
        3. How could the search be improved?
        4. What additional angles should be explored?
        """

        response = self.reflect_func(prompt)

        return Reflection(
            assessment=response[:500] if len(response) > 500 else response,
            gaps=self._extract_gaps(response),
            improvement_suggestions=self._extract_suggestions(response),
        )

    def _generate_heuristic(self, current_result: str, query: str) -> Reflection:
        """Generate heuristic reflection."""
        gaps = []
        suggestions = []

        if len(current_result) < 500:
            gaps.append("Result is too brief, lacks detail")
            suggestions.append("Search for more specific information")

        if len(set(current_result.split())) < 50:
            gaps.append("Limited vocabulary diversity")
            suggestions.append("Consider broader search terms")

        assessment = (
            f"Result covers {query} partially. "
            f"Length: {len(current_result)} chars. "
            f"Need more specific details."
        )

        return Reflection(
            assessment=assessment,
            gaps=gaps,
            improvement_suggestions=suggestions,
        )

    def _extract_gaps(self, text: str) -> List[str]:
        """Extract gaps from reflection text."""
        lines = text.split("\n")
        gaps = []
        in_gaps_section = False

        for line in lines:
            if "gap" in line.lower():
                in_gaps_section = True
            elif in_gaps_section and line.strip().startswith("-"):
                gaps.append(line.strip().lstrip("- ").lstrip("• "))

        return gaps[:5]

    def _extract_suggestions(self, text: str) -> List[str]:
        """Extract improvement suggestions from text."""
        suggestions = []
        lines = text.split("\n")

        for line in lines:
            if any(
                kw in line.lower()
                for kw in ["suggest", "improve", "consider", "should"]
            ):
                if line.strip().startswith("-") or line.strip().startswith("•"):
                    suggestions.append(line.strip().lstrip("- ").lstrip("• "))

        return suggestions[:5]


class ResearchAgent:
    """Research agent with reflection loop."""

    MAX_ITERATIONS = 10
    MAX_QUERY_LENGTH = 10000

    def __init__(
        self,
        search_func: Callable[[str], str],
        max_iterations: int = 3,
        quality_threshold: float = 0.7,
        assessor: Optional[QualityAssessor] = None,
        reflection_generator: Optional[ReflectionGenerator] = None,
    ):
        if max_iterations < 1 or max_iterations > self.MAX_ITERATIONS:
            raise ValueError(f"max_iterations must be 1-{self.MAX_ITERATIONS}")
        if quality_threshold < 0 or quality_threshold > 1:
            raise ValueError("quality_threshold must be 0-1")

        self.search_func = search_func
        self.max_iterations = max_iterations
        self.quality_threshold = quality_threshold
        self.assessor = assessor or QualityAssessor()
        self.reflection_generator = reflection_generator or ReflectionGenerator()

        self.state = None

    def research(self, query: str) -> Dict[str, Any]:
        """Execute research with reflection loop."""
        self.state = ResearchState(query=query)

        current_query = query
        best_result = ""
        best_quality = 0.0

        for iteration in range(self.max_iterations):
            logger.info(f"Research iteration {iteration + 1}/{self.max_iterations}")

            result = self.search_func(current_query)

            quality = self.assessor.assess(result, query)

            self.state.add_search(current_query, result, iteration, quality)

            if quality.score > best_quality:
                best_result = result
                best_quality = quality.score

            if quality.is_sufficient:
                logger.info(f"Quality threshold met: {quality.score:.2f}")
                break

            reflection = self.reflection_generator.generate(result, query)
            self.state.add_reflection(reflection)

            if reflection.refined_query:
                current_query = reflection.refined_query
            else:
                current_query = self._refine_query(query, reflection)

        self.state.final_result = best_result
        self.state.is_completed = True

        return {
            "query": query,
            "result": best_result,
            "quality": best_quality,
            "iterations": len(self.state.search_history),
            "reflections": len(self.state.reflections),
            "state": self.state.to_dict(),
        }

    def _refine_query(self, original: str, reflection: Reflection) -> str:
        """Refine query based on reflection."""
        refinements = " ".join(reflection.improvement_suggestions[:2])
        return f"{original} {refinements}"

    def get_state(self) -> Optional[ResearchState]:
        """Get current research state."""
        return self.state


class ReflectionCrawler:
    """Crawler with reflection loop for quality improvement."""

    def __init__(
        self,
        crawler_func: Callable[[str], dict],
        max_iterations: int = 3,
        quality_threshold: float = 0.7,
    ):
        self.crawler_func = crawler_func
        self.max_iterations = max_iterations
        self.quality_threshold = quality_threshold
        self.assessor = QualityAssessor()
        self.agent = ResearchAgent(
            search_func=self._extract_content,
            max_iterations=max_iterations,
            quality_threshold=quality_threshold,
        )

    def _extract_content(self, url_or_query: str) -> str:
        """Extract content from URL or query."""
        result = self.crawler_func(url_or_query)
        return result.get("content", result.get("text", str(result)))

    async def crawl_with_reflection(self, url: str) -> Dict[str, Any]:
        """Crawl URL with reflection loop."""
        result = self.agent.research(f"Research: {url}")

        return {
            "success": True,
            "url": url,
            "content": result["result"],
            "quality_score": result["quality"],
            "iterations": result["iterations"],
            "reflections": result["reflections"],
            "research_state": result["state"],
        }
