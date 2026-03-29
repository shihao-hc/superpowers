from typing import Optional, List, Dict, Any
from ..config import CrawlerConfig
from ..core import CrawlerEngine
from .utils import parse_strategy, validate_url


class MCPCrawlerServer:
    """MCP server for crawler integration."""

    def __init__(self, config: Optional[CrawlerConfig] = None):
        self.config = config or CrawlerConfig()
        self.engine = CrawlerEngine(self.config)

    async def crawl_url(
        self,
        url: str,
        strategy: Optional[str] = None,
        use_fallback: bool = True,
        use_retry: bool = True,
    ) -> Dict[str, Any]:
        """Crawl a URL using the crawler engine.

        MCP tool endpoint.

        Args:
            url: Target URL to crawl
            strategy: Optional strategy ("scrapling", "browser_use", "auto")
            use_fallback: Use fallback chain
            use_retry: Retry on failure

        Returns:
            Dict with success, content, strategy_used, metadata
        """
        try:
            validate_url(url)
            result = await self.engine.crawl(
                url=url,
                strategy=parse_strategy(strategy),
                use_fallback=use_fallback,
                use_retry=use_retry,
            )
            return dict(result)
        except Exception as e:
            return {
                "success": False,
                "content": "",
                "strategy_used": "none",
                "metadata": {"error": str(e)},
            }

    def get_tools(self) -> List[Dict[str, Any]]:
        """Get list of MCP tools this server provides.

        Returns:
            List of tool definitions in MCP format
        """
        return [
            {
                "name": "crawl_url",
                "description": "Crawl a URL and extract content using the best available strategy. "
                "Supports fallback to multiple scrapers and automatic retry.",
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
                            "description": "Scraping strategy to use",
                            "default": "auto",
                        },
                        "use_fallback": {
                            "type": "boolean",
                            "description": "Use fallback chain if primary fails",
                            "default": True,
                        },
                        "use_retry": {
                            "type": "boolean",
                            "description": "Retry on failure",
                            "default": True,
                        },
                    },
                    "required": ["url"],
                },
            }
        ]
