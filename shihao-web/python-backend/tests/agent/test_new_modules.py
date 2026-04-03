"""
ShiHao Agent 单元测试
"""

import pytest
import asyncio
from unittest.mock import Mock, AsyncMock, patch

from shihao_finance.agent.core import ShiHaoAgent, EventType
from shihao_finance.agent.context_manager import ContextManager, CompactionLevel
from shihao_finance.agent.permission import (
    PermissionManager,
    PermissionMode,
    ToolCategory,
)
from shihao_finance.agent.tool_manager import (
    BaseTool,
    ToolParameter,
    ToolResult,
    ToolStatus,
    ReadTool,
    GrepTool,
    BashTool,
    create_tool_executor,
)
from shihao_finance.agent.model_routing import ModelRouter, ModelTier, TaskType
from shihao_finance.agent.commands import (
    CommandRegistry,
    CommandHandler,
    ClearCommand,
    HelpCommand,
)
from shihao_finance.agent.analytics import AnalyticsCollector, CostTracker
from shihao_finance.agent.error_recovery import ErrorRecoverySystem, ErrorType
from shihao_finance.agent.feature_flags import FeatureFlagManager, FlagType
from shihao_finance.agent.subagent import SubAgentPool, ContextIsolation
from shihao_finance.agent.factory import ShiHaoAgentFactory


# ========== Context Manager Tests ==========


@pytest.mark.asyncio
async def test_context_manager_basic():
    """测试上下文管理器基本功能"""
    cm = ContextManager(max_tokens=1000)

    cm.add_message("user", "Hello")
    cm.add_message("assistant", "Hi there")

    messages = cm.get_messages()
    assert len(messages) == 2
    assert messages[0]["content"] == "Hello"


@pytest.mark.asyncio
async def test_context_manager_compaction():
    """测试上下文压缩"""
    cm = ContextManager(max_tokens=100)

    for i in range(20):
        cm.add_message("user", f"Message {i}" * 50)

    result = await cm.compact(cm.get_messages())

    assert result.compacted_tokens < result.original_tokens


# ========== Permission Tests ==========


@pytest.mark.asyncio
async def test_permission_manager_default():
    """测试默认权限模式"""
    pm = PermissionManager(mode=PermissionMode.DEFAULT)

    decision = await pm.check_permission("search", "execute", {"query": "test"})
    assert decision.granted == True


@pytest.mark.asyncio
async def test_permission_manager_plan():
    """测试计划模式只读"""
    pm = PermissionManager(mode=PermissionMode.PLAN)

    decision = await pm.check_permission("Read", "execute", {"path": "file.txt"})
    assert decision.granted == True

    decision = await pm.check_permission("Write", "execute", {"path": "file.txt"})
    assert decision.granted == False


@pytest.mark.asyncio
async def test_permission_denial_tracker():
    """测试拒绝追踪"""
    pm = PermissionManager(mode=PermissionMode.DEFAULT, max_denials=2)

    for _ in range(3):
        await pm.check_permission("Bash", "execute", {"command": "ls"})

    assert pm.denial_tracker.should_auto_deny("Bash", "execute") == True


# ========== Tool Manager Tests ==========


def test_tool_parameter_validation():
    """测试工具参数验证"""
    tool = ReadTool()

    valid, error = tool.validate_params({"file_path": "test.txt"})
    assert valid == True

    valid, error = tool.validate_params({"file_path": ""})
    assert valid == False


def test_tool_registry():
    """测试工具注册表"""
    from shihao_finance.agent.tool_manager import tool_registry

    tools = tool_registry.list_tools()
    assert len(tools) >= 4

    assert any(t["name"] == "Read" for t in tools)
    assert any(t["name"] == "Grep" for t in tools)
    assert any(t["name"] == "Bash" for t in tools)


@pytest.mark.asyncio
async def test_tool_executor_batch():
    """测试工具批量执行"""
    executor = create_tool_executor(max_concurrent=3)

    results = await executor.execute_batch(
        [
            {"name": "Read", "params": {"file_path": "nonexistent.txt"}},
            {"name": "Glob", "params": {"pattern": "*.py", "path": "."}},
        ]
    )

    assert len(results) == 2


# ========== Model Routing Tests ==========


def test_model_router_by_task():
    """测试按任务类型选择模型"""
    router = ModelRouter(default_model="llama3")

    model = router.select_model(task_type=TaskType.TOPIC_DETECTION)
    assert model.name == "llama3"

    model = router.select_model(task_type=TaskType.CODE_GENERATION)
    assert model.tier == ModelTier.BALANCED


def test_model_router_complexity():
    """测试按复杂度选择模型"""
    router = ModelRouter(default_model="llama3")

    simple_msg = "What is the weather?"
    model = router.select_model(message=simple_msg)
    assert model.tier == ModelTier.FAST

    complex_msg = "Design a distributed system architecture with microservices"
    model = router.select_model(message=complex_msg)
    assert model.tier in [ModelTier.BALANCED, ModelTier.POWERFUL]


def test_model_router_stats():
    """测试模型使用统计"""
    router = ModelRouter()

    stats = router.get_stats()
    assert "total_requests" in stats
    assert "total_cost_usd" in stats


# ========== Command Tests ==========


def test_command_registry():
    """测试命令注册表"""
    registry = CommandRegistry()

    registry.register(ClearCommand())
    registry.register(HelpCommand())

    assert registry.get("clear") is not None
    assert registry.get("help") is not None

    commands = registry.list_commands()
    assert len(commands) >= 2


@pytest.mark.asyncio
async def test_command_handler():
    """测试命令处理器"""
    registry = CommandRegistry()
    registry.register(ClearCommand())

    handler = CommandHandler(registry)

    result = await handler.handle("/clear", {"messages": ["msg1", "msg2"]})

    assert result.success == True
    assert "2" in result.output


# ========== Analytics Tests ==========


def test_analytics_collector():
    """测试分析收集器"""
    collector = AnalyticsCollector(session_id="test-123", user_id="user-456")

    collector.track_message("Hello", "user")
    collector.track_message("Hi", "assistant")
    collector.track_tool("search", 100.0, True)

    summary = collector.get_summary()

    assert summary["messages"] == 2
    assert summary["total_tool_calls"] == 1


def test_cost_tracker():
    """测试成本追踪"""
    tracker = CostTracker(daily_budget=5.0)

    cost = tracker.calculate_cost("llama3", 1000, 500)
    assert cost == 0.0

    cost = tracker.calculate_cost("sonnet", 1000, 500)
    assert cost > 0

    ok, msg = tracker.check_budget()
    assert ok == True


# ========== Error Recovery Tests ==========


@pytest.mark.asyncio
async def test_error_recovery_413():
    """测试 413 错误恢复"""
    recovery = ErrorRecoverySystem()

    context = {"messages": []}

    async def failing_operation():
        raise Exception("413 content too large")

    try:
        await recovery.handle_error(Exception("413"), context, failing_operation)
    except Exception as e:
        assert "No recovery strategy" in str(e) or "All attempts failed" in str(e)


def test_model_fallback_chain():
    """测试模型降级链"""
    from shihao_finance.agent.error_recovery import ModelFallbackChain

    chain = ModelFallbackChain()

    fallback = chain.get_fallback("sonnet")
    assert fallback == "haiku"

    fallback = chain.get_fallback("haiku")
    assert fallback == "llama3"


# ========== Feature Flags Tests ==========


def test_feature_flag_manager():
    """测试特性开关管理器"""
    manager = FeatureFlagManager(user_id="user-123", environment="production")

    assert manager.is_enabled("STREAMING") == True
    assert manager.is_enabled("KAIROS") == False

    manager.set_override("KAIROS", True)
    assert manager.is_enabled("KAIROS") == True

    manager.clear_override("KAIROS")
    assert manager.is_enabled("KAIROS") == False


def test_feature_flags_by_tag():
    """测试按标签获取特性"""
    manager = FeatureFlagManager()

    core_flags = manager.get_flags_by_tag("core")
    assert "STREAMING" in core_flags
    assert "MCP_INTEGRATION" in core_flags

    context_flags = manager.get_flags_by_tag("context")
    assert "CACHED_MICROCOMPACT" in context_flags


# ========== SubAgent Tests ==========


def test_subagent_pool():
    """测试子代理池"""
    pool = SubAgentPool(max_agents=5)

    agent1 = pool.create_agent("agent1", isolation_level="strict")
    agent2 = pool.create_agent("agent2", parent_id=agent1.agent_id)

    assert len(pool.list_agents()) == 2

    agents = pool.list_agents(parent_id=agent1.agent_id)
    assert len(agents) == 1

    pool.remove_agent(agent1.agent_id)
    assert len(pool.list_agents()) == 1


def test_context_isolation():
    """测试上下文隔离"""
    isolation = ContextIsolation(isolation_level="strict")

    parent_messages = [
        {"role": "system", "content": "You are helpful"},
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi"},
    ]

    from shihao_finance.agent.subagent import SubAgentContext

    agent_context = SubAgentContext(agent_id="test", name="test")

    isolated = isolation.isolate_messages(parent_messages, agent_context)

    assert len(isolated) == 1
    assert isolated[0]["role"] == "system"


# ========== Integration Tests ==========


@pytest.mark.asyncio
async def test_factory_create_agent():
    """测试工厂创建 Agent"""
    factory = ShiHaoAgentFactory(
        {
            "llm_provider": "ollama",
            "llm_model": "llama3.2",
            "permission_mode": "auto",
        }
    )

    with patch("shihao_finance.agent.core.StreamingLLMClient"):
        agent = await factory.create_agent()

        assert agent.llm_model == "llama3.2"
        assert agent.permissions is not None
        assert agent.tool_executor is not None


@pytest.mark.asyncio
async def test_agent_info():
    """测试 Agent 信息"""
    from shihao_finance.agent.factory import get_agent_info

    info = get_agent_info()

    assert info["version"] == "1.0.0"
    assert len(info["modules"]) >= 10
    assert len(info["features"]) >= 10


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
