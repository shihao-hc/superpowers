"""
TradingAgents-CN
多智能体股票分析系统
"""

__version__ = "1.0.0"
__author__ = "TradingAgents-CN Team"

from .agents import BaseAgent, Trader, create_trader
from .llm import create_llm_adapter, BaseLLMAdapter
from .tools import MultiLevelCache, CacheManager
from .tools.akshare_provider import AKShareProvider
from .tools.news_tools import NewsTools

__all__ = [
    "BaseAgent",
    "Trader",
    "create_trader",
    "create_llm_adapter",
    "BaseLLMAdapter",
    "MultiLevelCache",
    "CacheManager",
    "AKShareProvider",
    "NewsTools",
]
