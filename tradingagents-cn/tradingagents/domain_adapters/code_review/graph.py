"""
Code Review Graph
使用 LangGraph 实现代码审查工作流
"""

import asyncio
from typing import Dict, Any, Optional
from langgraph.graph import StateGraph, END, START

from .state import CodeReviewState, create_initial_state
from .agents import (
    StaticAnalysisExpert,
    SecurityExpert,
    PerformanceExpert,
    StyleExpert,
    Critic,
    Advocate,
    ReviewJudge,
)
from ...llm import create_llm_adapter


class CodeReviewGraph:
    """
    代码审查多智能体图

    工作流程：
    1. 并发执行四位专家 (静态/安全/性能/风格)
    2. 批评者与辩护者辩论
    3. 裁判综合裁决
    """

    def __init__(
        self,
        llm_provider: str = "openai",
        llm_config: Optional[Dict[str, Any]] = None,
        debug: bool = False
    ):
        self.config = llm_config or {}
        self.debug = debug
        self._setup_llm(llm_provider)
        self._setup_agents()
        self._setup_graph()

    def _setup_llm(self, provider: str):
        """设置LLM"""
        from ...llm import create_llm_adapter
        self.llm = create_llm_adapter(provider=provider)

    def _setup_agents(self):
        """初始化专家"""
        self.static_expert = StaticAnalysisExpert(self.llm, self.config)
        self.security_expert = SecurityExpert(self.llm, self.config)
        self.performance_expert = PerformanceExpert(self.llm, self.config)
        self.style_expert = StyleExpert(self.llm, self.config)

        self.critic = Critic(self.llm, self.config)
        self.advocate = Advocate(self.llm, self.config)
        self.judge = ReviewJudge(self.llm, self.config)

    def _setup_graph(self):
        """构建图"""
        workflow = StateGraph(CodeReviewState)

        workflow.add_node("run_experts", self._run_experts_node)
        workflow.add_node("debate", self._debate_node)
        workflow.add_node("judge", self._judge_node)

        workflow.add_edge(START, "run_experts")
        workflow.add_edge("run_experts", "debate")
        workflow.add_edge("debate", "judge")
        workflow.add_edge("judge", END)

        self.graph = workflow.compile()

    async def _run_experts_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """并发执行所有专家"""
        code = state["code"]
        language = state["language"]
        context = {
            "repo": state.get("repo", ""),
            "file_path": state.get("file_path", ""),
        }

        results = await asyncio.gather(
            self.static_expert.analyze(code, language, context),
            self.security_expert.analyze(code, language, context),
            self.performance_expert.analyze(code, language, context),
            self.style_expert.analyze(code, language, context),
            return_exceptions=True
        )

        static, security, performance, style = results

        state["static_analysis_report"] = str(static) if not isinstance(static, Exception) else ""
        state["security_report"] = str(security) if not isinstance(security, Exception) else ""
        state["performance_report"] = str(performance) if not isinstance(performance, Exception) else ""
        state["style_report"] = str(style) if not isinstance(style, Exception) else ""

        return state

    async def _debate_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """辩论环节"""
        reports = {
            "static_analysis": state["static_analysis_report"],
            "security": state["security_report"],
            "performance": state["performance_report"],
            "style": state["style_report"],
        }
        context = {
            "repo": state.get("repo", ""),
            "file_path": state.get("file_path", ""),
        }

        critic_args, advocate_args = await asyncio.gather(
            self.critic.argue(reports, context),
            self.advocate.argue(reports, context),
        )

        state["critic_arguments"] = str(critic_args)
        state["advocate_arguments"] = str(advocate_args)

        return state

    async def _judge_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """裁判裁决"""
        reports = {
            "static_analysis": state["static_analysis_report"],
            "security": state["security_report"],
            "performance": state["performance_report"],
            "style": state["style_report"],
        }
        context = {
            "repo": state.get("repo", ""),
            "file_path": state.get("file_path", ""),
        }

        result = await self.judge.decide(
            reports,
            state["critic_arguments"],
            state["advocate_arguments"],
            context
        )

        state["final_verdict"] = result.get("verdict", "")
        state["status"] = "completed"

        return state

    async def review(
        self,
        code: str,
        language: str = "python",
        repo: str = "",
        file_path: str = "",
    ) -> Dict[str, Any]:
        """执行代码审查"""
        initial_state = create_initial_state(code, language, repo, file_path)
        result = await self.graph.ainvoke(initial_state)
        return result

    async def areview(
        self,
        code: str,
        language: str = "python",
        repo: str = "",
        file_path: str = "",
    ):
        """异步生成器版本"""
        initial_state = create_initial_state(code, language, repo, file_path)
        async for chunk in self.graph.astream(initial_state):
            yield chunk
