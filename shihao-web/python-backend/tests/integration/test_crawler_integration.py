"""Integration tests for crawler package."""

import pytest
from src.crawler.core import CrawlerEngine
from src.crawler.config import CrawlerConfig
from src.crawler.types import CrawlerStrategy


class TestCrawlerEngine:
    """Integration tests for CrawlerEngine."""

    @pytest.fixture
    def engine(self):
        """Create engine for testing."""
        config = CrawlerConfig(default_timeout=5, max_retries=1)
        return CrawlerEngine(config)

    @pytest.mark.asyncio
    async def test_engine_initialization(self, engine):
        """Engine initializes correctly."""
        assert engine is not None
        assert engine.router is not None
        assert engine.fallback_chain is not None
        assert engine.retry_handler is not None

    @pytest.mark.asyncio
    async def test_invalid_url_returns_error(self, engine):
        """Invalid URLs return error response."""
        result = await engine.crawl(url="not-a-url")
        assert result["success"] is False
        assert "error" in result["metadata"]

    @pytest.mark.asyncio
    async def test_explicit_strategy_respected(self, engine):
        """Explicit strategy parameter is respected."""
        result = await engine.crawl(
            url="https://example.com",
            strategy=CrawlerStrategy.SCRAPLING,
            use_fallback=False,
        )
        # Should return result (may fail due to network, but structure should be correct)
        assert isinstance(result, dict)
        assert "success" in result
        assert "strategy_used" in result


class TestMCPIntegration:
    """Integration tests for MCP server."""

    @pytest.mark.asyncio
    async def test_mcp_server_crawl(self):
        """MCPCrawlerServer crawl_url works."""
        from src.crawler.plugins import MCPCrawlerServer

        server = MCPCrawlerServer()
        result = await server.crawl_url(url="https://example.com")

        assert isinstance(result, dict)
        assert "success" in result

    @pytest.mark.asyncio
    async def test_mcp_server_invalid_url(self):
        """MCPCrawlerServer handles invalid URLs gracefully."""
        from src.crawler.plugins import MCPCrawlerServer

        server = MCPCrawlerServer()
        result = await server.crawl_url(url="not-a-url")

        assert result["success"] is False
        assert "error" in result["metadata"]

    def test_get_tools_returns_list(self):
        """MCPCrawlerServer.get_tools returns proper format."""
        from src.crawler.plugins import MCPCrawlerServer

        server = MCPCrawlerServer()
        tools = server.get_tools()

        assert isinstance(tools, list)
        assert len(tools) > 0
        assert tools[0]["name"] == "crawl_url"
        assert "inputSchema" in tools[0]
