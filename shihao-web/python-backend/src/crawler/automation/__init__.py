"""Automation module - Smart workflows and autonomous crawling."""

from .workflow_engine import (
    WorkflowStatus,
    StepType,
    WorkflowStep,
    WorkflowResult,
    WorkflowEngine,
    AutomationContext,
    SmartCrawlWorkflow,
    quick_crawl_workflow,
)
from .strategy_selector import (
    SiteComplexity,
    ContentType,
    SiteProfile,
    StrategyRecommendation,
    SmartStrategySelector,
    auto_crawl_recommend,
)
from .incremental import (
    ContentHash,
    ChangeDetection,
    Deduplicator,
    IncrementalCrawler,
    URLNormalizer,
)

__all__ = [
    # Workflow
    "WorkflowStatus",
    "StepType",
    "WorkflowStep",
    "WorkflowResult",
    "WorkflowEngine",
    "AutomationContext",
    "SmartCrawlWorkflow",
    "quick_crawl_workflow",
    # Strategy
    "SiteComplexity",
    "ContentType",
    "SiteProfile",
    "StrategyRecommendation",
    "SmartStrategySelector",
    "auto_crawl_recommend",
    # Incremental
    "ContentHash",
    "ChangeDetection",
    "Deduplicator",
    "IncrementalCrawler",
    "URLNormalizer",
]
