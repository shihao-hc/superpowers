from crewai import Crew, Process, Task
from shihao_finance.agent.agents import (
    create_portfolio_manager,
    create_market_analyst,
    create_research_analyst,
    create_risk_manager,
    create_trade_executor,
    create_news_analyst,
    create_backtest_analyst,
    create_data_analyst,
)
from shihao_finance.agent.tools import (
    ashare_data_tool,
    ashare_realtime_tool,
    hkstock_data_tool,
    usstock_data_tool,
    financial_data_tool,
    stock_info_tool,
    sector_analysis_tool,
    stock_monitor_tool,
    risk_metrics_tool,
    portfolio_analysis_tool,
    backtest_api_tool,
    trading_api_tool,
    realtime_quote_tool,
    knowledge_search_tool,
    policy_monitor_tool,
    news_sentiment_tool,
    stock_selector_tool,
    valuation_tool,
)


def create_trading_crew() -> Crew:
    """创建完整交易Crew - 多Agent协作
    
    团队架构:
    - Portfolio Manager (决策中心)
    - Market Analyst (市场分析)
    - Research Analyst (深度研究)
    - Risk Manager (风险管理)
    - Trade Executor (交易执行)
    - News Analyst (新闻舆情)
    - Backtest Analyst (回测分析)
    - Data Analyst (数据支持)
    """
    
    # 创建各专业Agent
    portfolio_manager = create_portfolio_manager()
    market_analyst = create_market_analyst()
    research_analyst = create_research_analyst()
    risk_manager = create_risk_manager()
    trade_executor = create_trade_executor()
    news_analyst = create_news_analyst()
    backtest_analyst = create_backtest_analyst()
    data_analyst = create_data_analyst()
    
    # 创建Crew - hierarchical模式下manager不加入agents列表
    crew = Crew(
        agents=[
            data_analyst,
            market_analyst,
            research_analyst,
            news_analyst,
            backtest_analyst,
            risk_manager,
            trade_executor,
        ],
        process=Process.hierarchical,
        manager_agent=portfolio_manager,
        verbose=True,
    )
    
    return crew


def create_research_crew() -> Crew:
    """创建研究Crew - 专注深度分析"""
    
    research_analyst = create_research_analyst()
    data_analyst = create_data_analyst()
    
    crew = Crew(
        agents=[data_analyst, research_analyst],
        process=Process.sequential,
        verbose=True,
    )
    
    return crew


def create_monitoring_crew() -> Crew:
    """创建监控Crew - 实时监控和预警"""
    
    risk_manager = create_risk_manager()
    news_analyst = create_news_analyst()
    data_analyst = create_data_analyst()
    
    crew = Crew(
        agents=[data_analyst, news_analyst, risk_manager],
        process=Process.sequential,
        verbose=True,
    )
    
    return crew


def create_trading_crew_simple() -> Crew:
    """创建简化交易Crew - 核心功能"""
    
    portfolio_manager = create_portfolio_manager()
    market_analyst = create_market_analyst()
    risk_manager = create_risk_manager()
    trade_executor = create_trade_executor()
    
    crew = Crew(
        agents=[market_analyst, risk_manager, trade_executor],
        process=Process.hierarchical,
        manager_agent=portfolio_manager,
        verbose=True,
    )
    
    return crew


# Agent工具映射
AGENT_TOOLS = {
    "data_analyst": [
        ashare_data_tool,
        ashare_realtime_tool,
        hkstock_data_tool,
        usstock_data_tool,
        financial_data_tool,
        stock_info_tool,
        sector_analysis_tool,
        realtime_quote_tool,
    ],
    "market_analyst": [
        ashare_data_tool,
        ashare_realtime_tool,
        sector_analysis_tool,
        policy_monitor_tool,
        knowledge_search_tool,
    ],
    "research_analyst": [
        financial_data_tool,
        stock_info_tool,
        stock_selector_tool,
        valuation_tool,
        knowledge_search_tool,
    ],
    "news_analyst": [
        news_sentiment_tool,
        policy_monitor_tool,
        realtime_quote_tool,
    ],
    "backtest_analyst": [
        backtest_api_tool,
        ashare_data_tool,
        risk_metrics_tool,
    ],
    "risk_manager": [
        risk_metrics_tool,
        portfolio_analysis_tool,
        stock_monitor_tool,
        realtime_quote_tool,
    ],
    "trade_executor": [
        trading_api_tool,
        realtime_quote_tool,
        risk_metrics_tool,
    ],
}