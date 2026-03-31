"""Security tests for crawler package."""

import pytest
from src.crawler.security.url_validator import (
    validate_url,
    is_url_safe,
    validate_url_structure,
    validate_url_host,
    validate_url_dns,
)


class TestURLValidation:
    """Test URL validation for SSRF protection."""

    def test_valid_urls(self):
        """Test that valid URLs pass validation."""
        valid_urls = [
            "https://example.com",
            "http://example.com",
            "https://www.example.com/path",
            "https://example.com/path?query=value",
            "https://sub.domain.example.com",
        ]
        for url in valid_urls:
            assert is_url_safe(url), f"Should be valid: {url}"

    def test_invalid_scheme(self):
        """Test that non-HTTP schemes are blocked."""
        invalid_urls = [
            "ftp://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
        ]
        for url in invalid_urls:
            assert not is_url_safe(url), f"Should be blocked: {url}"

    def test_localhost_blocked(self):
        """Test that localhost is blocked."""
        blocked_urls = [
            "http://localhost",
            "http://localhost:8080",
            "http://127.0.0.1",
            "http://127.0.0.1:3000",
            "http://0.0.0.0",
            "http://[::1]",
        ]
        for url in blocked_urls:
            assert not is_url_safe(url), f"Should be blocked: {url}"

    def test_private_ip_ranges_blocked(self):
        """Test that private IP ranges are blocked."""
        blocked_urls = [
            "http://10.0.0.1",
            "http://10.255.255.255",
            "http://192.168.0.1",
            "http://192.168.1.100",
            "http://172.16.0.1",
            "http://172.31.255.255",
        ]
        for url in blocked_urls:
            assert not is_url_safe(url), f"Should be blocked: {url}"

    def test_metadata_endpoints_blocked(self):
        """Test that cloud metadata endpoints are blocked."""
        blocked_urls = [
            "http://169.254.169.254/latest/meta-data/",
            "http://169.254.169.254/latest/user-data/",
            "http://metadata.google.internal/computeMetadata/v1/",
            "http://metadata.azure.com/",
        ]
        for url in blocked_urls:
            assert not is_url_safe(url), f"Should be blocked: {url}"

    def test_raise_on_error(self):
        """Test that validate_url raises ValueError when appropriate."""
        with pytest.raises(ValueError):
            validate_url("ftp://example.com")

        with pytest.raises(ValueError):
            validate_url("http://localhost")

        with pytest.raises(ValueError):
            validate_url("http://10.0.0.1")

    def test_validate_url_returns_true_for_valid(self):
        """Test that validate_url returns True for valid URLs."""
        assert validate_url("https://example.com") is True

    def test_empty_url(self):
        """Test that empty URLs are blocked."""
        assert not is_url_safe("")
        assert not is_url_safe(None)

    def test_structure_validation(self):
        """Test URL structure validation separately."""
        valid, _ = validate_url_structure("https://example.com")
        assert valid

        valid, _ = validate_url_structure("ftp://example.com")
        assert not valid

        valid, _ = validate_url_structure("example.com")
        assert not valid

    def test_host_validation(self):
        """Test URL host validation separately."""
        valid, _ = validate_url_host("https://example.com")
        assert valid

        valid, _ = validate_url_host("http://localhost")
        assert not valid

        valid, _ = validate_url_host("http://10.0.0.1")
        assert not valid


class TestFirecrawlAPIKey:
    """Test Firecrawl API key validation."""

    @pytest.mark.asyncio
    async def test_missing_api_key(self):
        """Test that missing API key is handled gracefully."""
        from src.crawler.scrapers.firecrawl_adapter import FirecrawlAdapter

        adapter = FirecrawlAdapter()
        result = await adapter.crawl("https://example.com")

        assert result["success"] is False
        assert "FIRECRAWL_API_KEY" in result["metadata"].get("error", "")


class TestSandboxSecurity:
    """Test sandbox command execution security."""

    def test_command_sandbox_dangerous_patterns(self):
        """Test that dangerous command patterns are blocked."""
        from src.crawler.security.sandbox import CommandSandbox

        sandbox = CommandSandbox()

        dangerous_commands = [
            "cat /etc/passwd",
            "cat /etc/shadow",
            "echo $(whoami)",
            "`whoami`",
            "ls ../",
            "cat ../../../etc/passwd",
        ]

        for cmd in dangerous_commands:
            is_valid, error = sandbox.validate_command(cmd)
            assert not is_valid, f"Should be blocked: {cmd}, error: {error}"

    def test_command_sandbox_allowed(self):
        """Test that safe commands are allowed."""
        from src.crawler.security.sandbox import CommandSandbox

        sandbox = CommandSandbox()

        safe_commands = [
            "ls",
            "ls /usr",
            "pwd",
            "whoami",
            "date",
            "echo 'hello'",
            "uname",
            "uname -a",
        ]

        for cmd in safe_commands:
            is_valid, error = sandbox.validate_command(cmd)
            assert is_valid, f"Should be allowed: {cmd}, error: {error}"

    def test_command_sandbox_path_traversal_blocked(self):
        """Test that path traversal attempts are blocked."""
        from src.crawler.security.sandbox import CommandSandbox

        sandbox = CommandSandbox()

        path_traversal_commands = [
            "cat /var/../../../etc/passwd",
            "ls /tmp/../../bin",
        ]

        for cmd in path_traversal_commands:
            is_valid, error = sandbox.validate_command(cmd)
            assert not is_valid, f"Should be blocked: {cmd}"


class TestURLCacheSecurity:
    """Test URL cache security features."""

    def test_cache_key_generation(self):
        """Test that cache keys are properly generated."""
        from src.crawler.cache.url_cache import URLCache

        cache = URLCache()

        key1 = cache._make_key("https://example.com")
        key2 = cache._make_key("https://example.com")
        key3 = cache._make_key("https://different.com")

        assert key1 == key2
        assert key1 != key3
        assert key1.startswith("crawl_cache:")

    @pytest.mark.asyncio
    async def test_max_entry_size_enforcement(self):
        """Test that large entries are rejected."""
        from src.crawler.cache.url_cache import URLCache

        cache = URLCache()

        large_content = "x" * (11 * 1024 * 1024)

        result = await cache.set("https://example.com", large_content)
        assert result is False
