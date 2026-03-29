"""Tests for enhanced crawler features."""

import pytest
import asyncio
from src.crawler.formatters import (
    FormatterFactory,
    MarkdownFormatter,
    HTMLFormatter,
    LinksFormatter,
)
from src.crawler.jobs import JobQueue, JobStatus
from src.crawler.actions import Action, ActionExecutor, parse_actions
from src.crawler.types import OutputFormat, AsyncJobStatus


class TestFormatters:
    """Test output formatters."""

    def test_markdown_formatter(self):
        """Test HTML to Markdown conversion."""
        html = "<h1>Title</h1><p>Paragraph with <strong>bold</strong> text.</p>"
        result = MarkdownFormatter().format(html)
        assert "# Title" in result
        assert "Paragraph" in result
        assert "**bold**" in result

    def test_html_formatter(self):
        """Test HTML cleaning."""
        html = "<div><p>Content</p><span>More</span></div>"
        result = HTMLFormatter().format(html)
        assert "Content" in result
        assert "More" in result

    def test_links_formatter(self):
        """Test link extraction."""
        html = '<a href="https://example.com">Example</a><a href="/page">Internal</a>'
        result = LinksFormatter().format(html, base_url="https://test.com")
        assert "example.com" in result
        assert "test.com/page" in result

    def test_formatter_factory(self):
        """Test formatter factory."""
        formatter = FormatterFactory.get_formatter("markdown")
        assert isinstance(formatter, MarkdownFormatter)

        result = FormatterFactory.format_content("<h1>Test</h1>", "markdown")
        assert "# Test" in result


class TestJobQueue:
    """Test async job queue."""

    def test_create_job(self):
        """Test job creation."""
        queue = JobQueue()
        job_id = queue.create_job("https://example.com")
        assert job_id is not None

        job = queue.get_job(job_id)
        assert job is not None
        assert job.status == JobStatus.PENDING
        assert job.url == "https://example.com"

    def test_update_job(self):
        """Test job status update."""
        queue = JobQueue()
        job_id = queue.create_job("https://example.com")

        queue.update_job(
            job_id,
            status=JobStatus.PROCESSING,
            progress=0.5,
            total_pages=10,
            completed_pages=5,
        )

        job = queue.get_job(job_id)
        assert job.status == JobStatus.PROCESSING
        assert job.progress == 0.5
        assert job.total_pages == 10
        assert job.completed_pages == 5

    def test_get_status(self):
        """Test status dict generation."""
        queue = JobQueue()
        job_id = queue.create_job("https://example.com", metadata={"test": "data"})

        status = queue.get_status(job_id)
        assert status["id"] == job_id
        assert status["status"] == "pending"
        assert status["metadata"]["test"] == "data"

    def test_list_jobs(self):
        """Test job listing."""
        queue = JobQueue()
        queue.create_job("https://example1.com")
        queue.create_job("https://example2.com")

        jobs = queue.list_jobs()
        assert len(jobs) == 2

        queue.update_job(jobs[0].job_id, status=JobStatus.COMPLETED)
        completed = queue.list_jobs(status=JobStatus.COMPLETED)
        assert len(completed) == 1


class TestActions:
    """Test action parsing."""

    def test_parse_actions(self):
        """Test action parsing from dicts."""
        actions_data = [
            {"type": "click", "selector": "#btn"},
            {"type": "write", "text": "hello"},
            {"type": "wait", "milliseconds": 1000},
        ]

        actions = parse_actions(actions_data)
        assert len(actions) == 3
        assert actions[0].action_type == "click"
        assert actions[0].selector == "#btn"
        assert actions[1].value == "hello"
        assert actions[2].milliseconds == 1000

    def test_action_types(self):
        """Test Action class."""
        action = Action(action_type="click", selector="#submit", x=100, y=200)
        assert action.action_type == "click"
        assert action.selector == "#submit"
        assert action.x == 100


class TestOutputFormats:
    """Test output format enum."""

    def test_format_values(self):
        """Test format enum values."""
        assert OutputFormat.MARKDOWN.value == "markdown"
        assert OutputFormat.HTML.value == "html"
        assert OutputFormat.JSON.value == "json"
        assert OutputFormat.LINKS.value == "links"
        assert OutputFormat.SCREENSHOT.value == "screenshot"


class TestEnhancedTypes:
    """Test enhanced type definitions."""

    def test_async_job_status(self):
        """Test async job status enum."""
        assert AsyncJobStatus.PENDING.value == "pending"
        assert AsyncJobStatus.PROCESSING.value == "processing"
        assert AsyncJobStatus.COMPLETED.value == "completed"
        assert AsyncJobStatus.FAILED.value == "failed"

    def test_crawler_strategy_extended(self):
        """Test extended crawler strategies."""
        from src.crawler.types import CrawlerStrategy

        assert CrawlerStrategy.FIRECRAWL.value == "firecrawl"
