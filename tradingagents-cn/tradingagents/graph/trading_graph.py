"""
TradingAgents-CN Core Graph
LangGraph-based Multi-Agent Trading System

主要的工作流编排引擎，管理：
1. 分析师并发执行
2. 研究员辩论
3. 风险管理评估
4. 最终交易决策
"""

import os
import asyncio
from typing import Dict, Any, List, Optional, Callable
from datetime import datetime
from langgraph.graph import StateGraph, END, START
from langgraph.checkpoint.memory import MemorySaver

from ..agents.utils.agent_states import AgentState, create_initial_state
from ..agents.analysts.market_analyst import MarketAnalyst
from ..agents.analysts.fundamentals_analyst import FundamentalsAnalyst
from ..agents.analysts.news_analyst import NewsAnalyst
from ..agents.analysts.sentiment_analyst import SentimentAnalyst
from ..agents.researchers.bull_researcher import BullResearcher
from ..agents.researchers.bear_researcher import BearResearcher
from ..agents.researchers.judge import Judge
from ..agents.risk_mgmt import RiskyDebator, SafeDebator, NeutralDebator, RiskManager
from ..agents.trader.trader import Trader
from ..llm import create_llm_adapter


class TradingAgentsGraph:
    """
    主要的多智能体交易分析图

    工作流程：
    1. 并发执行四位分析师 (市场/基本面/新闻/情绪)
    2. 研究员辩论 (看涨/看跌 -> 裁判)
    3. 风险评估辩论 (激进/保守/中性 -> 风险管理)
    4. 交易员做出最终决策
    """

    def __init__(
        self,
        config: Optional[Dict[str, Any]] = None,
        debug: bool = False
    ):
        """
        初始化交易智能体图

        Args:
            config: 配置字典
            debug: 是否启用调试模式
        """
        self.config = config or self._get_default_config()
        self.debug = debug
        self._setup_llms()
        self._setup_agents()
        self._setup_graph()

    def _get_default_config(self) -> Dict[str, Any]:
        """获取默认配置"""
        return {
            "llm_provider": os.getenv("LLM_PROVIDER", "openai"),
            "quick_think_llm": os.getenv("QUICK_MODEL", "gpt-3.5-turbo"),
            "deep_think_llm": os.getenv("DEEP_MODEL", "gpt-4"),
            "temperature": 0.7,
            "max_tokens": 4000,
            "timeout": 180,
            "max_debate_rounds": 3,
            "max_risk_rounds": 2,
        }

    def _setup_llms(self):
        """设置LLM实例"""
        provider = self.config.get("llm_provider", "openai")

        self.quick_llm = create_llm_adapter(
            provider=provider,
            model=self.config.get("quick_think_llm", "gpt-3.5-turbo"),
        )

        self.deep_llm = create_llm_adapter(
            provider=provider,
            model=self.config.get("deep_think_llm", "gpt-4"),
        )

    def _setup_agents(self):
        """初始化所有智能体"""
        self.market_analyst = MarketAnalyst(self.deep_llm, self.config)
        self.fundamentals_analyst = FundamentalsAnalyst(self.deep_llm, self.config)
        self.news_analyst = NewsAnalyst(self.deep_llm, self.config)
        self.sentiment_analyst = SentimentAnalyst(self.deep_llm, self.config)

        self.bull_researcher = BullResearcher(self.deep_llm, self.config)
        self.bear_researcher = BearResearcher(self.deep_llm, self.config)
        self.judge = Judge(self.deep_llm, self.config)

        self.risky_debator = RiskyDebator(self.quick_llm, self.config)
        self.safe_debator = SafeDebator(self.quick_llm, self.config)
        self.neutral_debator = NeutralDebator(self.quick_llm, self.config)
        self.risk_manager = RiskManager(self.deep_llm, self.config)

        self.trader = Trader(self.deep_llm, self.config)

    def _setup_graph(self):
        """构建LangGraph"""
        workflow = StateGraph(AgentState)

        # 添加节点
        workflow.add_node("run_analysts", self._run_analysts_node)
        workflow.add_node("investment_debate", self._investment_debate_node)
        workflow.add_node("risk_debate", self._risk_debate_node)
        workflow.add_node("trader_decision", self._trader_decision_node)

        # 设置边
        workflow.add_edge(START, "run_analysts")
        workflow.add_edge("run_analysts", "investment_debate")
        workflow.add_edge("investment_debate", "risk_debate")
        workflow.add_edge("risk_debate", "trader_decision")
        workflow.add_edge("trader_decision", END)

        # 编译图
        checkpointer = MemorySaver() if self.debug else None
        self.graph = workflow.compile(checkpointer=checkpointer)

    async def _run_analysts_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """并发执行四位分析师"""
        state["status"] = "running"
        state["current_phase"] = "analysis"

        company = state.get("company_of_interest", "")
        trade_date = state.get("trade_date", "")

        # 使用 asyncio.gather 并发执行所有分析师
        results = await asyncio.gather(
            self.market_analyst.analyze(company, trade_date, state),
            self.fundamentals_analyst.analyze(company, trade_date, state),
            self.news_analyst.analyze(company, trade_date, state),
            self.sentiment_analyst.analyze(company, trade_date, state),
            return_exceptions=True
        )

        # 处理结果
        market_report, fundamentals_report, news_report, sentiment_report = results

        # 更新状态
        if not isinstance(market_report, Exception):
            state["market_report"] = str(market_report)
        if not isinstance(fundamentals_report, Exception):
            state["fundamentals_report"] = str(fundamentals_report)
        if not isinstance(news_report, Exception):
            state["news_report"] = str(news_report)
        if not isinstance(sentiment_report, Exception):
            state["sentiment_report"] = str(sentiment_report)

        state["updated_at"] = datetime.now().isoformat()
        return state

    async def _investment_debate_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """投资辩论节点 - Bull/Bear -> Judge"""
        state["current_phase"] = "investment_debate"

        context = {
            "company": state.get("company_of_interest"),
            "date": state.get("trade_date"),
            "market_report": state.get("market_report", ""),
            "fundamentals_report": state.get("fundamentals_report", ""),
            "news_report": state.get("news_report", ""),
            "sentiment_report": state.get("sentiment_report", ""),
        }

        # 并发执行看涨和看跌研究
        bull_result, bear_result = await asyncio.gather(
            self.bull_researcher.research(context, state),
            self.bear_researcher.research(context, state)
        )

        # 更新辩论状态
        debate_state = state.get("investment_debate_state", {})
        debate_state["bull_history"] = str(bull_result)
        debate_state["bear_history"] = str(bear_result)
        debate_state["count"] = debate_state.get("count", 0) + 1
        state["investment_debate_state"] = debate_state

        # 裁判做出决策
        judge_decision = await self.judge.decide(
            bull_result,
            bear_result,
            context,
            state
        )
        state["investment_plan"] = str(judge_decision)

        state["updated_at"] = datetime.now().isoformat()
        return state

    async def _risk_debate_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """风险辩论节点 - Risky/Safe/Neutral -> RiskManager"""
        state["current_phase"] = "risk_debate"

        context = {
            "company": state.get("company_of_interest"),
            "date": state.get("trade_date"),
            "investment_plan": state.get("investment_plan", ""),
            "market_report": state.get("market_report", ""),
            "fundamentals_report": state.get("fundamentals_report", ""),
        }

        # 并发执行三种风险观点
        risky_result, safe_result, neutral_result = await asyncio.gather(
            self.risky_debator.debate(context, state),
            self.safe_debator.debate(context, state),
            self.neutral_debator.debate(context, state)
        )

        # 更新风险辩论状态
        risk_state = state.get("risk_debate_state", {})
        risk_state["risky_history"] = str(risky_result)
        risk_state["safe_history"] = str(safe_result)
        risk_state["neutral_history"] = str(neutral_result)
        risk_state["count"] = risk_state.get("count", 0) + 1
        state["risk_debate_state"] = risk_state

        # 风险管理器综合评估
        risk_assessment = await self.risk_manager.assess(
            risky_result,
            safe_result,
            neutral_result,
            context,
            state
        )

        state["updated_at"] = datetime.now().isoformat()
        return state

    async def _trader_decision_node(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """交易员决策节点"""
        state["current_phase"] = "decision"

        context = {
            "company": state.get("company_of_interest"),
            "date": state.get("trade_date"),
            "market_report": state.get("market_report", ""),
            "fundamentals_report": state.get("fundamentals_report", ""),
            "news_report": state.get("news_report", ""),
            "sentiment_report": state.get("sentiment_report", ""),
            "investment_plan": state.get("investment_plan", ""),
            "risk_debate_state": state.get("risk_debate_state", {}),
        }

        # 交易员做出最终决策
        final_decision = await self.trader.decide(context, state)

        state["final_trade_decision"] = str(final_decision)
        state["status"] = "completed"
        state["updated_at"] = datetime.now().isoformat()

        return state

    async def run(
        self,
        company: str,
        trade_date: str,
        progress_callback: Optional[Callable] = None,
        task_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        运行完整的交易分析流程

        Args:
            company: 公司名称或股票代码
            trade_date: 交易日期
            progress_callback: 进度回调函数
            task_id: 任务ID

        Returns:
            最终状态
        """
        initial_state = create_initial_state(company, trade_date, task_id)

        if progress_callback:
            result = None
            async for chunk in self.graph.astream(initial_state):
                for node_name, node_state in chunk.items():
                    if not node_name.startswith("__"):
                        await progress_callback(node_name, node_state)
                result = node_state
            return result or initial_state
        else:
            result = await self.graph.ainvoke(initial_state)
            return result

    def run_sync(
        self,
        company: str,
        trade_date: str,
        progress_callback: Optional[Callable] = None,
        task_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """同步版本"""
        return asyncio.run(self.run(company, trade_date, progress_callback, task_id))
