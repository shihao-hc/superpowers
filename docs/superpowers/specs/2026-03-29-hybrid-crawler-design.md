# Hybrid Crawler Architecture Design

**Date:** 2026-03-29  
**Author:** AI Assistant  
**Status:** Approved  

## Overview

Design for a hybrid crawler system that combines rule-based (scrapling) and AI-driven (browser-use) approaches with adaptive complexity detection. The system will be integrated as a plugin into the ShiHao Finance platform.

## Requirements Summary

| Requirement | Decision |
|-------------|----------|
| Application scenarios | All: financial data, sentiment monitoring, competitor analysis + future extensibility |
| AI vs Rule-based | Adaptive switching based on page complexity |
| Deployment environment | Local development first |
| System integration | Plugin system (MCP/Agent) |
| Error handling | Auto-retry + Fallback chain + Detailed logging |

## Architecture

### Layered Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Hybrid Crawler System                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         插件层 (Plugin Layer)                         │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │ │
│  │  │  MCP Server     │  │  Agent Tools    │  │  CLI Commands       │  │ │
│  │  │  browser-use mcp│  │  @crawler.tool  │  │  python -m crawler  │  │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      ↓                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         路由层 (Router Layer)                          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │  URL         │  │  Complexity  │  │  Strategy    │              │ │
│  │  │  Classifier  │→ │  Analyzer    │→ │  Selector    │              │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘              │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      ↓                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         执行层 (Execution Layer)                       │ │
│  │  ┌──────────────────┬──────────────────┬────────────────────────────┐  │ │
│  │  │   Scrapling      │   Browser-use    │    Custom                 │  │ │
│  │  │   Adapter        │   Adapter        │    Adapter                │  │ │
│  │  └──────────────────┴──────────────────┴────────────────────────────┘  │ │
│  │                                                                       │ │
│  │  ┌────────────────────────────────────────────────────────────────┐  │ │
│  │  │                    Fallback Chain                               │  │ │
│  │  │   Level 1: scrapling → Level 2: browser-use → Level 3: Manual │  │ │
│  │  └────────────────────────────────────────────────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                      ↓                                      │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │                         存储层 (Storage Layer)                        │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐  │ │
│  │  │  Result Cache   │  │  Checkpoint     │  │  Metrics Store     │  │ │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────────┘  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Strategy Decision Table

| Complexity | Site Type | Strategy |
|------------|-----------|----------|
| Static | Finance/News | scrapling (fast) |
| Dynamic | Social/E-commerce | scrapling + DynamicFetcher |
| Complex | Requires login | browser-use (AI-driven) |
| Protected | Cloudflare | browser-use + stealth |
| Unknown | First visit | scrapling → fallback to browser-use |

## File Structure

```
shihao-web/python-backend/src/
├── crawler/
│   ├── __init__.py
│   ├── main.py                 # Entry point
│   ├── router/
│   │   ├── __init__.py
│   │   ├── crawler_router.py   # Router hub
│   │   ├── url_classifier.py   # URL classification
│   │   ├── complexity_analyzer.py # Complexity analysis
│   │   └── strategy_selector.py # Strategy selection
│   ├── scrapers/
│   │   ├── __init__.py
│   │   ├── base.py             # Base interface
│   │   ├── scrapling_adapter.py # scrapling adapter
│   │   ├── browser_use_adapter.py # browser-use adapter
│   │   └── registry.py          # Scraper registry
│   ├── plugins/
│   │   ├── __init__.py
│   │   ├── mcp_server.py       # MCP server
│   │   ├── agent_tools.py      # Agent tools
│   │   └── cli.py              # CLI commands
│   ├── core/
│   │   ├── __init__.py
│   │   ├── fallback_chain.py   # Fallback chain
│   │   ├── retry_handler.py    # Retry handling
│   │   └── metrics.py          # Metrics collection
│   └── utils/
│       ├── __init__.py
│       ├── config.py            # Configuration
│       └── logger.py            # Logging
└── tests/
    └── crawler/
        ├── test_router.py
        ├── test_scrapers.py
        └── test_integration.py
```

## Core Components

### 1. CrawlerRouter

```python
class CrawlerRouter:
    """Router hub - analyzes URL and page, determines optimal scraper"""
    
    async def route(self, url: str, options: dict = None) -> CrawlStrategy:
        """
        Returns optimal crawl strategy
        
        Returns:
            CrawlStrategy: {
                'scraper': 'scrapling' | 'browser-use',
                'mode': 'fast' | 'dynamic' | 'stealth',
                'fallback_chain': [...],
                'timeout': int,
                'retries': int
            }
        """
```

### 2. ComplexityAnalyzer

```python
class ComplexityAnalyzer:
    """Detects page complexity to determine which scraper to use"""
    
    async def analyze(self, url: str) -> ComplexityLevel:
        """
        Lightweight probing, returns complexity level
        
        Detection dimensions:
        - Requires JS rendering
        - Has anti-scraping mechanisms
        - Requires login
        - Page structure complexity
        """
```

### 3. ScraperRegistry

```python
class ScraperRegistry:
    """Registry managing all available scrapers"""
    
    def register(self, name: str, adapter: ScraperAdapter):
        """Register new scraper"""
        
    async def execute(self, strategy: CrawlStrategy, url: str) -> CrawlResult:
        """Execute crawl"""
```

### 4. FallbackChain

```python
class FallbackChain:
    """Automatic fallback on failure"""
    
    # Retry configuration
    retry_config = {
        'max_retries': 3,
        'backoff': [1, 2, 4],  # seconds
    }
    
    async def execute_with_fallback(
        self, 
        url: str, 
        strategy: CrawlStrategy
    ) -> CrawlResult:
        """Execute crawl with fallback"""
```

## Plugin Integration

### MCP Server

```python
class CrawlerMCPServer:
    """MCP server for AI Agent integration"""
    
    async def tools(self):
        return [
            {
                "name": "crawl_url",
                "description": "Crawl web content with automatic optimal scraper selection",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "url": {"type": "string"},
                        "mode": {"type": "string", "enum": ["auto", "fast", "ai"]},
                        "extract": {"type": "string"}
                    }
                }
            },
            {
                "name": "batch_crawl",
                "description": "Batch crawl multiple URLs"
            }
        ]
```

### Agent Tools

```python
@tool
def crawl_url(url: str, mode: str = "auto", extract: str = None) -> str:
    """
    Use hybrid crawler to fetch web content
    
    Args:
        url: Target URL
        mode: auto (automatic) / fast (prefer speed) / ai (prefer intelligence)
        extract: Extraction rules, can use natural language description
    
    Returns:
        Crawled content
    """

@tool
def batch_crawl(urls: list[str], parallel: bool = True) -> list[dict]:
    """Batch crawl multiple URLs"""
```

## Deployment

```bash
# Method 1: MCP Server
python -m crawler.plugins.mcp_server

# Method 2: CLI
python -m crawler.cli crawl https://example.com
python -m crawler.cli batch --file urls.txt

# Method 3: Direct call
from crawler import HybridCrawler
crawler = HybridCrawler()
result = await crawler.fetch("https://example.com")
```

## Dependencies

| Package | Purpose |
|---------|---------|
| scrapling | Rule-based crawler with anti-detection |
| browser-use | AI-driven browser automation |
| playwright | Browser automation (dependency of browser-use) |
| langchain-core | Agent tools integration |
| fastmcp | MCP server framework |

## Next Steps

1. Implement core components (Router, Analyzer, Registry)
2. Create adapter implementations (Scrapling, Browser-use)
3. Build fallback chain
4. Add plugin layer (MCP, Agent, CLI)
5. Write tests
6. Integration testing

## Status History

| Date | Status | Notes |
|------|--------|-------|
| 2026-03-29 | Approved | Initial design approved |
