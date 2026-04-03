"""
TradingAgents-CN Code Review Tests
Unit tests for code review module with mocking of static analysis tools
"""

import pytest
import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch, Mock


class TestCodeReviewAgents:
    """Test code review agent implementations"""

    @pytest.fixture
    def mock_llm(self):
        """Mock LLM adapter"""
        llm = MagicMock()
        response = MagicMock()
        response.content = "This is a test review report with findings about code quality."
        llm.ainvoke = AsyncMock(return_value=response)
        return llm

    @pytest.mark.asyncio
    async def test_static_analysis_expert(self, mock_llm):
        """Test StaticAnalysisExpert generates report"""
        from tradingagents.domain_adapters.code_review.agents import StaticAnalysisExpert

        expert = StaticAnalysisExpert(mock_llm)
        code = "def hello(): print('world')"
        context = {"repo": "test", "file_path": "test.py"}

        result = await expert.analyze(code, "python", context)

        assert isinstance(result, str)
        assert len(result) > 0
        mock_llm.ainvoke.assert_called_once()

    @pytest.mark.asyncio
    async def test_security_expert(self, mock_llm):
        """Test SecurityExpert generates report"""
        from tradingagents.domain_adapters.code_review.agents import SecurityExpert

        expert = SecurityExpert(mock_llm)
        code = "eval(user_input)"
        context = {"repo": "test", "file_path": "test.py"}

        result = await expert.analyze(code, "python", context)

        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_performance_expert(self, mock_llm):
        """Test PerformanceExpert generates report"""
        from tradingagents.domain_adapters.code_review.agents import PerformanceExpert

        expert = PerformanceExpert(mock_llm)
        code = """
for i in range(1000):
    for j in range(1000):
        print(i, j)
"""
        context = {"repo": "test", "file_path": "test.py"}

        result = await expert.analyze(code, "python", context)

        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_style_expert(self, mock_llm):
        """Test StyleExpert generates report"""
        from tradingagents.domain_adapters.code_review.agents import StyleExpert

        expert = StyleExpert(mock_llm)
        code = "def HELLO():x=1"
        context = {"repo": "test", "file_path": "test.py"}

        result = await expert.analyze(code, "python", context)

        assert isinstance(result, str)
        assert len(result) > 0


class TestCodeReviewGraph:
    """Test code review workflow"""

    @pytest.fixture
    def mock_llm(self):
        """Mock LLM adapter"""
        llm = MagicMock()
        response = MagicMock()
        response.content = "Test verdict: Code needs work. Found multiple issues."
        llm.ainvoke = AsyncMock(return_value=response)
        return llm

    @pytest.mark.asyncio
    async def test_review_workflow(self, mock_llm):
        """Test complete code review workflow"""
        from tradingagents.domain_adapters.code_review.graph import CodeReviewGraph

        # Test workflow with mocked LLM - skip if no API key available
        try:
            with patch('tradingagents.llm.factory.create_llm_adapter', return_value=mock_llm):
                graph = CodeReviewGraph(llm_provider="openai")

                code = """
def calculate(a, b):
    return a + b
"""
                result = await graph.review(code, language="python")

            assert isinstance(result, dict)
            assert "status" in result
        except ValueError:
            # Skip if no API key
            pytest.skip("No API key available")

    @pytest.mark.asyncio
    async def test_review_with_invalid_code(self, mock_llm):
        """Test code review handles edge cases"""
        from tradingagents.domain_adapters.code_review.graph import CodeReviewGraph

        try:
            with patch('tradingagents.llm.factory.create_llm_adapter', return_value=mock_llm):
                graph = CodeReviewGraph(llm_provider="openai")

                code = ""
                result = await graph.review(code, language="python")

            assert isinstance(result, dict)
        except ValueError:
            pytest.skip("No API key available")


class TestCodeReviewState:
    """Test code review state management"""

    def test_create_initial_state(self):
        """Test initial state creation"""
        from tradingagents.domain_adapters.code_review.state import create_initial_state

        state = create_initial_state(
            code="print('hello')",
            language="python",
            repo="test-repo",
            file_path="test.py"
        )

        assert state["code"] == "print('hello')"
        assert state["language"] == "python"
        assert state["repo"] == "test-repo"
        assert state["file_path"] == "test.py"
        assert state["status"] == "initialized"

    def test_state_defaults(self):
        """Test state default values"""
        from tradingagents.domain_adapters.code_review.state import create_initial_state

        state = create_initial_state(code="test")

        assert state["language"] == "python"
        assert state["static_analysis_report"] == ""
        assert state["security_report"] == ""
        assert isinstance(state["errors"], list)
        assert len(state["errors"]) == 0


class TestCodeReviewDebate:
    """Test debate functionality"""

    @pytest.fixture
    def mock_llm(self):
        """Mock LLM adapter"""
        llm = MagicMock()
        response = MagicMock()
        response.content = '{"verdict": "approve", "severity": "minor", "reasoning": "Code is acceptable", "suggestions": ["Add type hints"]}'
        llm.ainvoke = AsyncMock(return_value=response)
        return llm

    @pytest.mark.asyncio
    async def test_critic_argues(self, mock_llm):
        """Test critic debater arguments"""
        from tradingagents.domain_adapters.code_review.agents import Critic

        debater = Critic(mock_llm)
        reports = {
            "static_analysis": "Complexity score: 15 (high)",
            "security": "No critical issues",
        }
        context = {"code": "test"}

        result = await debater.argue(reports, context)

        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_advocate_defends(self, mock_llm):
        """Test advocate debater arguments"""
        from tradingagents.domain_adapters.code_review.agents import Advocate

        debater = Advocate(mock_llm)
        reports = {
            "static_analysis": "Complexity score: 15 (high)",
            "security": "No critical issues",
        }
        context = {"code": "test"}

        result = await debater.argue(reports, context)

        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_judge_decides(self, mock_llm):
        """Test judge decision"""
        from tradingagents.domain_adapters.code_review.agents import ReviewJudge

        judge = ReviewJudge(mock_llm)
        reports = {"static_analysis": "Test report"}
        critic_args = "Found several issues that need fixing"
        advocate_args = "Code is well-structured and follows best practices"
        context = {"code": "test"}

        result = await judge.decide(reports, critic_args, advocate_args, context)

        assert isinstance(result, dict)
        assert "verdict" in result


class TestCodeReviewWebSocket:
    """Test WebSocket integration for code review"""

    @pytest.fixture
    def mock_websocket(self):
        """Mock WebSocket connection"""
        ws = MagicMock()
        ws.send_text = AsyncMock()
        ws.close = AsyncMock()
        return ws

    def test_websocket_message_format(self):
        """Test WebSocket message structure"""
        from tradingagents.api.schemas import WebSocketMessage

        msg = WebSocketMessage(
            type="progress",
            task_id="test-123",
            data={"progress": 0.5, "status": "running"}
        )
        
        assert msg.type == "progress"
        assert msg.task_id == "test-123"
        assert msg.data["progress"] == 0.5

    def test_websocket_progress_message(self):
        """Test progress message format"""
        from tradingagents.api.schemas import WebSocketMessage

        msg = WebSocketMessage(
            type="progress",
            task_id="test-123",
            data={
                "progress": 0.75,
                "message": "Running security analysis",
                "status": "running"
            }
        )
        
        assert msg.data["progress"] == 0.75
        assert msg.data["message"] == "Running security analysis"

    def test_websocket_completed_message(self):
        """Test completed message format"""
        from tradingagents.api.schemas import WebSocketMessage

        msg = WebSocketMessage(
            type="completed",
            task_id="test-123",
            data={
                "final_verdict": "Code needs work",
                "status": "completed"
            }
        )
        
        assert msg.type == "completed"
        assert "final_verdict" in msg.data


class TestCodeReviewAPI:
    """Test API endpoints for code review"""

    def test_code_review_request_validation(self):
        """Test code review request schema"""
        from tradingagents.api.schemas import CodeReviewRequest

        request = CodeReviewRequest(
            code="def hello(): print('world')",
            language="python",
            file_path="test.py",
            llm_provider="openai"
        )
        
        assert request.code == "def hello(): print('world')"
        assert request.language == "python"
        assert request.llm_provider == "openai"

    def test_code_review_response_structure(self):
        """Test code review response structure"""
        from tradingagents.api.schemas import CodeReviewResponse

        response = CodeReviewResponse(
            task_id="test-123",
            status="pending",
            code="test",
            language="python",
            created_at="2026-03-22T00:00:00"
        )
        
        assert response.task_id == "test-123"
        assert response.status.value == "pending"

    def test_llm_cost_calculation(self):
        """Test LLM cost calculation logic"""
        # Test cost calculation formula
        prompt_tokens = 1000
        completion_tokens = 500
        
        # DeepSeek pricing (example): $0.001/1K prompt, $0.002/1K completion
        prompt_cost = (prompt_tokens / 1000) * 0.001
        completion_cost = (completion_tokens / 1000) * 0.002
        total_cost = prompt_cost + completion_cost
        
        assert abs(total_cost - 0.002) < 0.0001  # $0.002


class TestCodeReviewIntegration:
    """Integration tests for code review workflow"""

    @pytest.fixture
    def sample_code(self):
        """Sample Python code for testing"""
        return '''
def calculate_fibonacci(n):
    if n <= 1:
        return n
    return calculate_fibonacci(n-1) + calculate_fibonacci(n-2)

result = calculate_fibonacci(10)
print(result)
'''

    @pytest.fixture
    def mock_llm(self):
        """Mock LLM with realistic responses"""
        llm = MagicMock()
        response = MagicMock()
        response.content = json.dumps({
            "verdict": "needs_work",
            "severity": "major",
            "reasoning": "Code has performance issues due to recursive implementation",
            "suggestions": ["Use memoization", "Consider iterative approach"]
        })
        llm.ainvoke = AsyncMock(return_value=response)
        return llm

    @pytest.mark.asyncio
    async def test_end_to_end_review(self, sample_code, mock_llm):
        """Test complete code review workflow"""
        from tradingagents.domain_adapters.code_review.agents import (
            StaticAnalysisExpert,
            SecurityExpert,
            PerformanceExpert,
            Critic,
            Advocate,
            ReviewJudge
        )

        static_expert = StaticAnalysisExpert(mock_llm)
        security_expert = SecurityExpert(mock_llm)
        performance_expert = PerformanceExpert(mock_llm)
        
        static_report = await static_expert.analyze(sample_code, "python", {})
        security_report = await security_expert.analyze(sample_code, "python", {})
        performance_report = await performance_expert.analyze(sample_code, "python", {})
        
        reports = {
            "static_analysis": static_report,
            "security": security_report,
            "performance": performance_report,
        }
        
        critic = Critic(mock_llm)
        advocate = Advocate(mock_llm)
        judge = ReviewJudge(mock_llm)
        
        critic_args = await critic.argue(reports, {})
        advocate_args = await advocate.argue(reports, {})
        verdict = await judge.decide(reports, critic_args, advocate_args, {})
        
        assert "verdict" in verdict
        assert len(critic_args) > 0
        assert len(advocate_args) > 0


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
