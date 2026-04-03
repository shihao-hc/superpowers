"""Hybrid Crawler Package - scrapling + browser-use + Firecrawl + Crawl4AI integration.

Features:
- Multi-format output (markdown, html, json, links, screenshot)
- Async job queue with status polling
- Page interaction actions (click, type, scroll, wait)
- URL discovery (site mapping)
- Structured data extraction
- Firecrawl cloud API integration
- Crawl4AI LLM-friendly crawling
- Tree-based execution engine (EasySpider patterns)
- Multi-strategy XPath fallback
- Fast lxml batch extraction
- Checkpoint/resume system
- Smart wait strategies
- Forum collaboration (BettaFish patterns)
- Reflection loop for research quality
- Document IR for report generation
- BaseNode abstraction for processing pipeline
- Enhanced complexity analysis with page inspection
- Deep crawling strategies (BFS/DFS/Best-First)
- Distributed crawling with Celery/Redis
- Prometheus metrics and health monitoring
- URL content caching
- Command sandbox and rate limiting
- Anti-bot detection and bypass
"""

__version__ = "0.6.0"

from .types import (
    CrawlerStrategy,
    PageComplexity,
    OutputFormat,
    ActionStep,
    CrawlResult,
    AsyncJobStatus,
    AsyncJob,
    MapResult,
    StructuredSchema,
    ExecutionNodeType,
    LoopIterationType,
    ConditionType,
    ContentExtractType,
    WaitStrategyType,
)
from .config import (
    CrawlerConfig,
    ComplexityThresholds,
    ScraperConfig,
    AsyncJobConfig,
    ActionConfig,
)
from .core.crawler_engine import CrawlerEngine
from .core.enhanced_engine import EnhancedCrawlerEngine
from .router import CrawlerRouter
from .router.enhanced_complexity_analyzer import (
    EnhancedComplexityAnalyzer,
    HybridComplexityAnalyzer,
)
from .exceptions import (
    CrawlerError,
    ScraperError,
    ComplexityAnalysisError,
    FallbackExhaustedError,
)
from .execution import (
    Node,
    NodeType,
    LoopType,
    JudgeType,
    ExtractType,
    ContentType,
    ExecutionEngine,
    CheckpointManager,
)
from .xpath import (
    XPathGenerator,
    generate_element_xpaths,
    XPathFallback,
    try_xpath_with_fallback,
)
from .extraction import (
    LXMLExtractor,
    FastExtractor,
    FieldExtractor,
)
from .wait import (
    SmartWait,
    WaitStrategy,
)
from .forum import (
    ForumEngine,
    ForumReader,
    ForumWriter,
    LogMonitor,
    ForumSpeech,
    ForumConfig,
    CooperativeCrawler,
)
from .research import (
    BaseNode,
    NodeResult,
    ProcessingNode,
    StateMutationNode,
    PipelineNode,
    ParallelNode,
    QualityAssessor,
    ReflectionGenerator,
    ResearchAgent,
    ResearchState,
    ReflectionCrawler,
)
from .report import (
    DocumentIR,
    DocumentBuilder,
    Manifest,
    Chapter,
    HTMLRenderer,
    render_document,
)
from .distributed import (
    DistributedCrawler,
    DistributedJob,
    JobStatus,
    CrawlCluster,
    ClusterConfig,
    WorkerPool,
    create_cluster,
)
from .monitoring import (
    CrawlerMetrics,
    MetricsCollector,
    HealthChecker,
    HealthStatus,
    CrawlerMonitor,
    get_metrics,
    get_monitor,
)
from .cache import (
    URLCache,
    CacheMiddleware,
)
from .security import (
    CommandSandbox,
    SandBoxError,
    RateLimiter,
    RateLimitError,
    APIRateLimiter,
)
from .deep_crawl import (
    DeepCrawlStrategy,
    BFSDeepCrawlStrategy,
    DFSDeepCrawlStrategy,
    BestFirstDeepCrawlStrategy,
    DeepCrawler,
)
from .anti_detection import (
    AntiDetectionManager,
    StealthBrowser,
    ProxyConfig,
    DetectionLevel,
    DetectionResult,
    with_proxy_rotation,
)
from .scrapers import (
    Crawl4AIAdapter,
)

__all__ = [
    "CrawlerStrategy",
    "PageComplexity",
    "OutputFormat",
    "ActionStep",
    "CrawlResult",
    "AsyncJobStatus",
    "AsyncJob",
    "MapResult",
    "StructuredSchema",
    "ExecutionNodeType",
    "LoopIterationType",
    "ConditionType",
    "ContentExtractType",
    "WaitStrategyType",
    "CrawlerConfig",
    "ComplexityThresholds",
    "ScraperConfig",
    "AsyncJobConfig",
    "ActionConfig",
    "CrawlerEngine",
    "EnhancedCrawlerEngine",
    "CrawlerRouter",
    "EnhancedComplexityAnalyzer",
    "HybridComplexityAnalyzer",
    "CrawlerError",
    "ScraperError",
    "ComplexityAnalysisError",
    "FallbackExhaustedError",
    "Node",
    "NodeType",
    "LoopType",
    "JudgeType",
    "ExtractType",
    "ContentType",
    "ExecutionEngine",
    "CheckpointManager",
    "XPathGenerator",
    "generate_element_xpaths",
    "XPathFallback",
    "try_xpath_with_fallback",
    "LXMLExtractor",
    "FastExtractor",
    "FieldExtractor",
    "SmartWait",
    "WaitStrategy",
    "ForumEngine",
    "ForumReader",
    "ForumWriter",
    "LogMonitor",
    "ForumSpeech",
    "ForumConfig",
    "CooperativeCrawler",
    "BaseNode",
    "NodeResult",
    "ProcessingNode",
    "StateMutationNode",
    "PipelineNode",
    "ParallelNode",
    "QualityAssessor",
    "ReflectionGenerator",
    "ResearchAgent",
    "ResearchState",
    "ReflectionCrawler",
    "DocumentIR",
    "DocumentBuilder",
    "Manifest",
    "Chapter",
    "HTMLRenderer",
    "render_document",
    "DistributedCrawler",
    "DistributedJob",
    "JobStatus",
    "CrawlCluster",
    "ClusterConfig",
    "WorkerPool",
    "create_cluster",
    "CrawlerMetrics",
    "MetricsCollector",
    "HealthChecker",
    "HealthStatus",
    "CrawlerMonitor",
    "get_metrics",
    "get_monitor",
    "URLCache",
    "CacheMiddleware",
    "CommandSandbox",
    "SandBoxError",
    "RateLimiter",
    "RateLimitError",
    "APIRateLimiter",
    "DeepCrawlStrategy",
    "BFSDeepCrawlStrategy",
    "DFSDeepCrawlStrategy",
    "BestFirstDeepCrawlStrategy",
    "DeepCrawler",
    "AntiDetectionManager",
    "StealthBrowser",
    "ProxyConfig",
    "DetectionLevel",
    "DetectionResult",
    "with_proxy_rotation",
    "Crawl4AIAdapter",
]
