from typing import List, Dict, Any, Optional
from ..config import CrawlerConfig
from ..types import CrawlerStrategy


async def crawl_url(
    url: str,
    strategy: Optional[str] = None,
    config: Optional[CrawlerConfig] = None,
) -> Dict[str, Any]:
    """Crawl a URL using the crawler engine.

    Agent tool function for direct use.

    Args:
        url: Target URL to crawl
        strategy: Optional strategy ("scrapling", "browser_use", "auto")
        config: Optional crawler configuration

    Returns:
        Dict with success, content, strategy_used, metadata
    """
    from ..core import CrawlerEngine

    engine = CrawlerEngine(config)

    strat = None
    if strategy:
        strategy_map = {
            "scrapling": CrawlerStrategy.SCRAPLING,
            "browser_use": CrawlerStrategy.BROWSER_USE,
            "auto": CrawlerStrategy.AUTO,
        }
        strat = strategy_map.get(strategy.lower(), CrawlerStrategy.AUTO)

    result = await engine.crawl(
        url=url,
        strategy=strat,
        use_fallback=True,
        use_retry=True,
    )

    return dict(result)


def get_crawler_tools() -> List[Dict[str, Any]]:
    """Get crawler tools for agent integration.

    Returns:
        List of tool definitions
    """
    return [
        {
            "name": "crawl_url",
            "description": "Crawl a URL and extract content. "
            "Uses intelligent routing to select best strategy.",
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "Target URL to crawl",
                    },
                    "strategy": {
                        "type": "string",
                        "enum": ["scrapling", "browser_use", "auto"],
                        "description": "Scraping strategy",
                    },
                },
                "required": ["url"],
            },
        }
    ]
