import pytest
import sys

sys.path.insert(0, "D:\\龙虾\\shihao-web\\python-backend")


def test_market_analyst_creation():
    """测试市场分析师创建"""
    from shihao_finance.agent.agents import create_market_analyst

    agent = create_market_analyst()
    assert agent.role == "首席市场分析师"


def test_risk_manager_creation():
    """测试风险经理创建"""
    from shihao_finance.agent.agents import create_risk_manager

    agent = create_risk_manager()
    assert agent.role == "风险管理总监"
    assert agent.allow_delegation == False


def test_trade_executor_creation():
    """测试交易执行员创建"""
    from shihao_finance.agent.agents import create_trade_executor

    agent = create_trade_executor()
    assert agent.role == "交易执行专家"


def test_portfolio_manager_creation():
    """测试投资组合经理创建"""
    from shihao_finance.agent.agents import create_portfolio_manager

    agent = create_portfolio_manager()
    assert agent.role == "AI投资主管 (Chief AI Officer)"
    assert agent.allow_delegation == True
