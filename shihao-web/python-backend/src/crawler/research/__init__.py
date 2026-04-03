"""Research module with reflection loop for improved search quality."""

from .base_node import (
    BaseNode,
    NodeResult,
    ProcessingNode,
    StateMutationNode,
    ConditionalNode,
    PipelineNode,
    ParallelNode,
)
from .reflection_loop import (
    QualityScore,
    QualityLevel,
    QualityAssessor,
    Reflection,
    ReflectionGenerator,
    ResearchAgent,
    ResearchState,
    SearchRecord,
    ReflectionCrawler,
)

__all__ = [
    "BaseNode",
    "NodeResult",
    "ProcessingNode",
    "StateMutationNode",
    "ConditionalNode",
    "PipelineNode",
    "ParallelNode",
    "QualityScore",
    "QualityLevel",
    "QualityAssessor",
    "Reflection",
    "ReflectionGenerator",
    "ResearchAgent",
    "ResearchState",
    "SearchRecord",
    "ReflectionCrawler",
]
