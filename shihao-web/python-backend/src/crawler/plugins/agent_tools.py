from typing import List, Dict, Any, Optional
from ..config import CrawlerConfig
from .utils import parse_strategy, validate_url


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

    validate_url(url)

    engine = CrawlerEngine(config)

    try:
        result = await engine.crawl(
            url=url,
            strategy=parse_strategy(strategy),
            use_fallback=True,
            use_retry=True,
        )
        return dict(result)
    except Exception as e:
        return {
            "success": False,
            "content": "",
            "strategy_used": "none",
            "metadata": {"error": str(e)},
        }


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
            "inputSchema": {
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
