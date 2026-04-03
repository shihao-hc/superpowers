# Hybrid Crawler Implementation Plan

## Overview

- **Project**: ShiHao Finance - Hybrid Crawler (scrapling + browser-use)
- **Start Date**: 2026-03-29
- **Status**: Draft
- **Parent Design**: `2026-03-29-hybrid-crawler-design.md`

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                      CrawlerRouter                          │
│                   (复杂度分析 + 策略选择)                      │
└─────────────────────────────────────────────────────────────┘
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
    ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
    │  Simple     │   │  Complex    │   │  Dynamic    │
    │  (scrapling)│   │ (browser-use)│   │  (fallback) │
    └─────────────┘   └─────────────┘   └─────────────┘
           │                  │                  │
           └──────────────────┼──────────────────┘
                              ▼
                    ┌─────────────────┐
                    │  Result Normalizer │
                    │  (统一输出格式)     │
                    └─────────────────┘
```

## Task Breakdown

### Phase 1: Core Infrastructure

| Task | File | Description | Test Pattern |
|------|------|-------------|--------------|
| 1.1 | `crawler/__init__.py` | Package initialization | - |
| 1.2 | `crawler/config.py` | Configuration dataclasses | unit |
| 1.3 | `crawler/types.py` | Shared type definitions | unit |
| 1.4 | `crawler/exceptions.py` | Custom exceptions | unit |

### Phase 2: Scraper Adapters

| Task | File | Description | Test Pattern |
|------|------|-------------|--------------|
| 2.1 | `crawler/scrapers/base.py` | Abstract base scraper | unit |
| 2.2 | `crawler/scrapers/scrapling_adapter.py` | Scrapling implementation | integration |
| 2.3 | `crawler/scrapers/browser_use_adapter.py` | Browser-use implementation | integration |
| 2.4 | `crawler/scrapers/result.py` | Normalized result model | unit |

### Phase 3: Router & Strategy

| Task | File | Description | Test Pattern |
|------|------|-------------|--------------|
| 3.1 | `crawler/router/complexity_analyzer.py` | Page complexity scoring | unit |
| 3.2 | `crawler/router/rules.py` | Rule-based selectors | unit |
| 3.3 | `crawler/router/crawler_router.py` | Main routing logic | unit |
| 3.4 | `crawler/router/strategy.py` | Strategy enum & factory | unit |

### Phase 4: Fallback Chain

| Task | File | Description | Test Pattern |
|------|------|-------------|--------------|
| 4.1 | `crawler/core/fallback_chain.py` | Chain execution logic | unit |
| 4.2 | `crawler/core/retry_handler.py` | Retry with backoff | unit |
| 4.3 | `crawler/core/crawler_engine.py` | High-level API | integration |

### Phase 5: MCP Integration

| Task | File | Description | Test Pattern |
|------|------|-------------|--------------|
| 5.1 | `crawler/plugins/__init__.py` | Plugin init | - |
| 5.2 | `crawler/plugins/mcp_server.py` | MCP server implementation | manual |
| 5.3 | `crawler/plugins/agent_tools.py` | Agent tool definitions | unit |

### Phase 6: Examples & Tests

| Task | File | Description |
|------|------|-------------|
| 6.1 | `examples/hybrid_crawler_example.py` | Usage example |
| 6.2 | `tests/unit/test_*.py` | Unit tests |
| 6.3 | `tests/integration/test_*.py` | Integration tests |

## Task Details

### Task 1.1: Package Initialization

**File**: `shihao-web/python-backend/src/crawler/__init__.py`

```python
"""Hybrid Crawler Package - scrapling + browser-use integration."""

__version__ = "0.1.0"
```

**Acceptance Criteria**:
- Package can be imported without errors
- Version is accessible

---

### Task 1.2: Configuration Dataclasses

**File**: `shihao-web/python-backend/src/crawler/config.py`

```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class CrawlerConfig:
    """Main crawler configuration."""
    default_timeout: int = 30
    max_retries: int = 3
    retry_backoff: float = 1.5
    user_agent: Optional[str] = None
    headless: bool = True

@dataclass
class ComplexityThresholds:
    """Thresholds for complexity detection."""
    simple_max: float = 0.3
    complex_min: float = 0.7
    
@dataclass
class ScraperConfig:
    """Scraper-specific configuration."""
    scrapling: dict = field(default_factory=dict)
    browser_use: dict = field(default_factory=dict)
```

**Acceptance Criteria**:
- All config fields have sensible defaults
- Type hints are correct
- No mutable default arguments

---

### Task 1.3: Type Definitions

**File**: `shihao-web/python-backend/src/crawler/types.py`

```python
from enum import Enum
from typing import TypedDict

class CrawlerStrategy(Enum):
    """Crawler selection strategy."""
    SCRAPLING = "scrapling"
    BROWSER_USE = "browser_use"
    AUTO = "auto"

class PageComplexity(Enum):
    """Detected page complexity level."""
    SIMPLE = "simple"
    COMPLEX = "complex"
    DYNAMIC = "dynamic"

class CrawlResult(TypedDict):
    """Normalized crawl result."""
    success: bool
    content: str
    strategy_used: str
    metadata: dict
```

**Acceptance Criteria**:
- All enums have string values for serialization
- TypedDict matches expected structure

---

### Task 1.4: Custom Exceptions

**File**: `shihao-web/python-backend/src/crawler/exceptions.py`

```python
class CrawlerError(Exception):
    """Base exception for crawler errors."""
    pass

class ScraperError(CrawlerError):
    """Scraper-specific error."""
    pass

class ComplexityAnalysisError(CrawlerError):
    """Error during complexity analysis."""
    pass

class FallbackExhaustedError(CrawlerError):
    """All fallback scrapers failed."""
    pass
```

**Acceptance Criteria**:
- All exceptions inherit from CrawlerError
- Can be caught as base type or specific type

---

## Test Strategy

### Unit Tests
- Mock external dependencies (HTTP calls, LLM calls)
- Test individual classes/functions in isolation
- Target: 80%+ coverage

### Integration Tests
- Use real scrapling/browser-use
- Test against sample pages
- Test fallback chain

### Test Locations
```
tests/
├── unit/
│   ├── test_config.py
│   ├── test_types.py
│   ├── test_complexity_analyzer.py
│   └── test_fallback_chain.py
└── integration/
    ├── test_scrapling_adapter.py
    └── test_browser_use_adapter.py
```

## Dependencies

```toml
# pyproject.toml additions
[project.optional-dependencies]
crawler = [
    "scrapling>=0.1.0",
    "browser-use>=0.1.0",
]
```

## Execution Mode

**Recommended**: Subagent-Driven Development
- Each Phase → separate subagent task
- Fresh context avoids conflicts
- Parallel execution where possible

## Verification Commands

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=crawler --cov-report=html

# Type checking
ruff check src/crawler/
mypy src/crawler/
```

## Notes

- Skip MCP integration (Task 5.x) if not needed immediately
- Use existing `examples/browser_automation_example.py` as reference for integration
- Consider async implementation if performance becomes bottleneck
