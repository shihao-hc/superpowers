import pytest
import sys
sys.path.insert(0, 'D:\\龙虾\\shihao-web\\python-backend')


def test_crew_creation():
    """测试Crew创建"""
    from shihao_finance.agent.crew import create_trading_crew
    crew = create_trading_crew()
    assert len(crew.agents) == 3
    assert crew.process.value == "hierarchical"
    assert crew.manager_agent is not None