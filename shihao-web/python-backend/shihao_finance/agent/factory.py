"""
拾号金融 AI Agent - 统一初始化模块

整合所有 Claude Code 风格的核心模块:
- 流式 Agent 循环
- 5层上下文压缩
- 权限系统
- 工具系统
- 模型路由
- 斜杠命令
- MCP 客户端
- 分析遥测
- 错误恢复
- 特性开关
- WebSocket
- 子 Agent 隔离
"""

import os
import logging
from typing import Optional, Dict, Any

from shihao_finance.agent.core import ShiHaoAgent
from shihao_finance.agent.context_manager import ContextManager
from shihao_finance.agent.permission import PermissionManager, PermissionMode
from shihao_finance.agent.tool_manager import create_tool_executor, tool_registry
from shihao_finance.agent.model_routing import create_model_router, ModelTier
from shihao_finance.agent.commands import create_default_registry
from shihao_finance.agent.mcp_client import create_mcp_bridge
from shihao_finance.agent.analytics import (
    create_analytics_collector,
    CostTracker,
    PerformanceMetrics,
)
from shihao_finance.agent.error_recovery import create_error_recovery
from shihao_finance.agent.feature_flags import create_feature_manager
from shihao_finance.agent.subagent import SubAgentPool
from shihao_finance.agent.llm_client import create_llm_client
from shihao_finance.agent.memory.core import CoreMemory
from shihao_finance.agent.memory.recall import RecallMemory
from shihao_finance.agent.memory.archival import ArchivalMemory

logger = logging.getLogger(__name__)


class ShiHaoAgentFactory:
    """拾号 Agent 工厂 - 一键创建完整 Agent"""

    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {}
        self._initialized = False

    async def create_agent(self) -> ShiHaoAgent:
        """创建完整的拾号 Agent"""

        # 1. 创建配置
        agent_config = {
            "llm_provider": self.config.get("llm_provider", "ollama"),
            "llm_model": self.config.get(
                "llm_model", os.getenv("OLLAMA_MODEL", "llama3.2")
            ),
            "max_iterations": self.config.get("max_iterations", 10),
            "archival_db_path": self.config.get("archival_db_path"),
        }

        # 2. 创建真实 LLM 客户端
        llm_client = create_llm_client(
            provider=agent_config["llm_provider"],
            model=agent_config["llm_model"],
            base_url=self.config.get("ollama_base_url", "http://localhost:11434"),
        )

        # 3. 创建 Agent 并替换 LLM 客户端
        agent = ShiHaoAgent(agent_config)
        agent.llm_client = llm_client

        # 4. 初始化组件
        await agent.initialize()

        # 5. 集成内存系统 (Core, Recall, Archival)
        from shihao_finance.agent.memory import CoreMemory as MemoryCore

        memory_core = MemoryCore()
        memory_recall = RecallMemory()
        memory_archival = ArchivalMemory(db_path=self.config.get("archival_db_path"))

        await memory_recall.initialize()
        await memory_archival.initialize()

        agent.memory.core = memory_core
        agent.memory.recall = memory_recall
        agent.memory.archival = memory_archival
        agent.config["memory"] = agent.memory

        # 6. 集成上下文管理器
        context_manager = ContextManager(
            max_tokens=self.config.get("max_tokens", 100000),
            llm_client=llm_client,
        )
        agent.config["context_manager"] = context_manager

        # 5. 集成权限系统
        permission_mode = self.config.get("permission_mode", "default")
        agent.permissions.set_mode_from_string(permission_mode)

        # 6. 集成工具执行器
        tool_executor = create_tool_executor(
            max_concurrent=self.config.get("max_concurrent", 5),
            permission_check=self._create_permission_checker(agent.permissions),
        )
        agent.tool_executor = tool_executor

        # 7. 集成模型路由
        model_router = create_model_router(
            default_model=agent.llm_model,
            budget_per_day=self.config.get("daily_budget"),
            llm_client=agent.llm_client,
        )
        agent.model_router = model_router
        agent.config["model_router"] = model_router

        # 8. 集成 MCP 桥接器
        mcp_bridge = create_mcp_bridge()
        agent.mcp_bridge = mcp_bridge
        agent.config["mcp_bridge"] = mcp_bridge

        # 9. 集成分析系统
        session_id = self.config.get("session_id", f"session_{os.urandom(8).hex()}")
        analytics = create_analytics_collector(
            session_id=session_id, user_id=self.config.get("user_id", "")
        )
        cost_tracker = CostTracker(daily_budget=self.config.get("daily_budget"))
        performance = PerformanceMetrics()

        agent.analytics = analytics
        agent.cost_tracker = cost_tracker
        agent.performance = performance
        agent.config["analytics"] = analytics

        # 10. 集成错误恢复
        error_recovery = create_error_recovery(context_compactor=context_manager)
        agent.error_recovery = error_recovery
        agent.config["error_recovery"] = error_recovery

        # 11. 集成特性开关
        feature_manager = create_feature_manager(
            user_id=self.config.get("user_id"),
            environment=self.config.get("environment", "production"),
        )
        agent.feature_manager = feature_manager
        agent.config["feature_manager"] = feature_manager

        # 12. 集成子 Agent 池
        subagent_pool = SubAgentPool(max_agents=self.config.get("max_subagents", 10))
        agent.subagent_pool = subagent_pool
        agent.config["subagent_pool"] = subagent_pool

        self._initialized = True

        logger.info("[ShiHaoAgentFactory] Agent created successfully")
        logger.info(f"[ShiHaoAgentFactory] Model: {agent.llm_model}")

        tools_list = list(agent.tool_executor.registry.list_tools())
        logger.info(f"[ShiHaoAgentFactory] Tools: {[t['name'] for t in tools_list]}")

        return agent

    def _create_permission_checker(self, permissions: PermissionManager):
        """创建权限检查器"""

        async def check(tool_name: str, params: dict, context: Optional[dict]) -> bool:
            decision = await permissions.check_permission(
                tool_name=tool_name, action="execute", parameters=params
            )
            return decision.granted

        return check


async def create_default_agent() -> ShiHaoAgent:
    """创建默认配置 Agent"""
    factory = ShiHaoAgentFactory()
    return await factory.create_agent()


async def create_secure_agent(
    user_id: str, daily_budget: float = 10.0, max_tokens: int = 100000
) -> ShiHaoAgent:
    """创建安全加固的 Agent"""
    factory = ShiHaoAgentFactory(
        {
            "user_id": user_id,
            "daily_budget": daily_budget,
            "max_tokens": max_tokens,
            "permission_mode": "default",
            "environment": "production",
        }
    )
    return await factory.create_agent()


async def create_dev_agent() -> ShiHaoAgent:
    """创建开发环境 Agent"""
    factory = ShiHaoAgentFactory(
        {
            "permission_mode": "auto",
            "environment": "development",
            "max_iterations": 20,
        }
    )
    return await factory.create_agent()


def get_agent_info() -> Dict[str, Any]:
    """获取 Agent 信息"""
    return {
        "version": "1.0.0",
        "modules": [
            "core",
            "context_manager",
            "commands",
            "permission",
            "tool_manager",
            "model_routing",
            "mcp_client",
            "analytics",
            "error_recovery",
            "feature_flags",
            "websocket_client",
            "subagent",
        ],
        "features": [
            "流式输出",
            "5层上下文压缩",
            "3模式权限系统",
            "工具并行执行",
            "模型智能路由",
            "85+斜杠命令",
            "MCP协议支持",
            "分析遥测",
            "错误自动恢复",
            "特性开关控制",
            "弹性WebSocket",
            "子Agent隔离",
        ],
    }
