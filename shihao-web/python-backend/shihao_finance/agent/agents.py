from crewai import Agent
from crewai.llm import LLM
import os
from shihao_finance.agent.tools import (
    ashare_data_tool,
    highfreq_data_tool,
    knowledge_search_tool,
    policy_monitor_tool,
    risk_metrics_tool,
    portfolio_analysis_tool,
    backtest_api_tool,
    trading_api_tool,
    realtime_quote_tool,
)


def _get_llm():
    """获取默认LLM配置"""
    try:
        return LLM(
            model=os.getenv("LLM_MODEL", "ollama/llama3.2"),
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            api_key="not-needed"
        )
    except Exception:
        return None


def create_market_analyst() -> Agent:
    """创建市场分析师Agent"""
    return Agent(
        role="资深市场分析师",
        goal="深入分析市场趋势，提供数据驱动的投资建议",
        backstory="""
        你是一位拥有15年经验的资深市场分析师，曾在华尔街顶级投行工作。
        你擅长基本面分析、技术面分析和行业研究。
        你的分析报告以严谨、客观著称，从不盲目乐观或悲观。
        """,
        llm=_get_llm(),
        tools=[
            ashare_data_tool,
            highfreq_data_tool,
            knowledge_search_tool,
            policy_monitor_tool,
        ],
        verbose=True,
        allow_delegation=True,
    )


def create_risk_manager() -> Agent:
    """创建风险经理Agent"""
    return Agent(
        role="风险经理",
        goal="评估和控制投资风险，确保组合安全",
        backstory="""
        你是量化风险管理专家，精通VaR模型、压力测试和情景分析。
        你从不忽视任何风险信号，总是保守地评估最坏情况。
        你坚信：保住本金是第一要务。
        """,
        llm=_get_llm(),
        tools=[
            risk_metrics_tool,
            portfolio_analysis_tool,
            backtest_api_tool,
        ],
        verbose=True,
        allow_delegation=False,
    )


def create_trade_executor() -> Agent:
    """创建交易执行员Agent"""
    return Agent(
        role="交易执行员",
        goal="最优执行交易，最小化冲击成本",
        backstory="""
        你是高频交易背景的执行专家，精通各种执行算法。
        你知道如何在不影响市场价格的情况下完成大单。
        你总是关注流动性和市场微观结构。
        """,
        llm=_get_llm(),
        tools=[
            trading_api_tool,
            realtime_quote_tool,
        ],
        verbose=True,
        allow_delegation=False,
    )


def create_portfolio_manager() -> Agent:
    """创建投资组合经理Agent (Manager)"""
    return Agent(
        role="投资组合经理",
        goal="协调团队决策，优化整体组合收益",
        backstory="""
        你是投资组合经理，负责协调分析师、风险经理和交易员的工作。
        你有全局视野，能够平衡收益与风险。
        你总是从组合整体出发做决策。
        """,
        llm=_get_llm(),
        verbose=True,
        allow_delegation=True,
    )