from crewai import Crew, Process
from shihao_finance.agent.agents import (
    create_market_analyst,
    create_risk_manager,
    create_trade_executor,
    create_portfolio_manager,
)


def create_trading_crew() -> Crew:
    """创建交易分析Crew"""
    
    market_analyst = create_market_analyst()
    risk_manager = create_risk_manager()
    trade_executor = create_trade_executor()
    portfolio_manager = create_portfolio_manager()
    
    crew = Crew(
        agents=[
            market_analyst,
            risk_manager,
            trade_executor,
        ],
        process=Process.hierarchical,
        manager_agent=portfolio_manager,
        verbose=True,
    )
    
    return crew


def create_research_crew() -> Crew:
    """创建研究分析Crew (简化版)"""
    from crewai import Crew, Process
    
    market_analyst = create_market_analyst()
    
    crew = Crew(
        agents=[market_analyst],
        process=Process.sequential,
        verbose=True,
    )
    
    return crew