import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "src"))

import pytest
from unittest.mock import AsyncMock, patch
from crawler.plugins.mcp_server import MCPCrawlerServer
from crawler.plugins.agent_tools import get_crawler_tools, crawl_url
from crawler.config import CrawlerConfig


class TestMCPCrawlerServer:
    """Test MCPCrawlerServer implementation."""

    def test_instantiates(self):
        """MCPCrawlerServer initializes with config."""
        server = MCPCrawlerServer()
        assert server.config is not None
        assert server.engine is not None

    def test_instantiates_with_custom_config(self):
        """MCPCrawlerServer accepts custom config."""
        config = CrawlerConfig(max_retries=5)
        server = MCPCrawlerServer(config)
        assert server.config.max_retries == 5

    def test_has_crawl_url_method(self):
        """MCPCrawlerServer has crawl_url method."""
        server = MCPCrawlerServer()
        assert hasattr(server, "crawl_url")
        assert callable(server.crawl_url)

    @pytest.mark.asyncio
    async def test_crawl_url_returns_dict(self):
        """MCPCrawlerServer.crawl_url returns dict."""
        server = MCPCrawlerServer()
        server.engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "content": "test content",
                "strategy_used": "auto",
                "metadata": {},
            }
        )

        result = await server.crawl_url("https://example.com")

        assert isinstance(result, dict)
        assert "success" in result

    @pytest.mark.asyncio
    async def test_crawl_url_uses_engine(self):
        """MCPCrawlerServer.crawl_url uses CrawlerEngine."""
        server = MCPCrawlerServer()
        server.engine.crawl = AsyncMock(
            return_value={
                "success": True,
                "content": "test",
                "strategy_used": "auto",
                "metadata": {},
            }
        )

        await server.crawl_url("https://example.com")

        server.engine.crawl.assert_called_once()

    def test_get_tools_returns_list(self):
        """MCPCrawlerServer.get_tools returns list."""
        server = MCPCrawlerServer()
        tools = server.get_tools()
        assert isinstance(tools, list)

    def test_get_tools_contains_crawl_url(self):
        """MCPCrawlerServer.get_tools contains crawl_url tool."""
        server = MCPCrawlerServer()
        tools = server.get_tools()
        assert len(tools) == 1
        assert tools[0]["name"] == "crawl_url"


class TestGetCrawlerTools:
    """Test get_crawler_tools function."""

    def test_returns_list(self):
        """get_crawler_tools returns list."""
        tools = get_crawler_tools()
        assert isinstance(tools, list)

    def test_contains_crawl_url_tool(self):
        """get_crawler_tools contains crawl_url tool."""
        tools = get_crawler_tools()
        assert len(tools) == 1
        assert tools[0]["name"] == "crawl_url"

    def test_tool_has_description(self):
        """get_crawler_tools tool has description."""
        tools = get_crawler_tools()
        assert "description" in tools[0]
        assert len(tools[0]["description"]) > 0

    def test_tool_has_inputSchema(self):
        """get_crawler_tools tool has inputSchema."""
        tools = get_crawler_tools()
        assert "inputSchema" in tools[0]
        assert "properties" in tools[0]["inputSchema"]

    def test_tool_has_url_required(self):
        """get_crawler_tools tool has url as required."""
        tools = get_crawler_tools()
        assert "url" in tools[0]["inputSchema"]["required"]
