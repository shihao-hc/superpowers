"""
ShiHao Finance - AI-driven automated stock selection and trading system.

Modules:
- RiskManager: Risk management with volatility-based position sizing
- RiskGuard: Integration layer for risk checking
- StressTestingEngine: Black swan scenario testing
- UnifiedMarketAdapter: Multi-market data adapter
- DataSourceManager: Data source redundancy management
"""
from .risk_manager import RiskManager, RiskGuard, RiskLevel, VolatilityConfig, DynamicRiskParams
from .stress_testing import StressTestingEngine, StressScenario, StressSeverity, StressReport
from .market_adapter import (
    Market, MarketConfig, UnifiedMarketAdapter, 
    DataSourceManager, RedundantDataAdapter
)
from .data_quality import DataPipeline, QualityChecker
from .execution import TradingLoop, OrderState
from .paper_trading_simulator import PaperTradingSimulator
from .monitoring import MonitoringDashboard
from .advanced_backtest import AdvancedBacktestEngine

__version__ = "0.1.0"
__all__ = [
    "RiskManager",
    "RiskGuard", 
    "RiskLevel",
    "VolatilityConfig",
    "DynamicRiskParams",
    "StressTestingEngine",
    "StressScenario",
    "StressSeverity",
    "StressReport",
    "Market",
    "MarketConfig",
    "UnifiedMarketAdapter",
    "DataSourceManager",
    "RedundantDataAdapter",
    "DataPipeline",
    "QualityChecker",
    "TradingLoop",
    "OrderState",
    "PaperTradingSimulator",
    "MonitoringDashboard",
    "AdvancedBacktestEngine",
]
