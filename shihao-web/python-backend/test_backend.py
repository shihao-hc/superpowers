"""
Test script for ShiHao Finance backend.

Quick test to verify all modules can be imported and basic functionality works.
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shihao_finance.core.data.data_manager import DataManager
from shihao_finance.core.features.feature_engine import FeatureEngine
from shihao_finance.core.models.trend_model import TrendModel
from shihao_finance.core.trading.trading_engine import AutoTradingEngine, OrderSide, TradeSignal
from shihao_finance.core.risk.risk_guard import RiskGuard
from datetime import datetime
import asyncio


async def test_data_manager():
    """Test data manager."""
    print("\n=== Testing Data Manager ===")
    dm = DataManager()
    await dm.initialize()
    
    health = await dm.health_check()
    print(f"Health status: {health}")
    
    # Get stock list
    stocks = await dm.get_stock_list(exchange="CN")
    print(f"Found {len(stocks)} stocks")
    
    return dm


async def test_feature_engine():
    """Test feature engine."""
    print("\n=== Testing Feature Engine ===")
    import pandas as pd
    import numpy as np
    
    # Create sample data
    dates = pd.date_range(start='2024-01-01', periods=100, freq='D')
    df = pd.DataFrame({
        'open': np.random.randn(100).cumsum() + 100,
        'high': np.random.randn(100).cumsum() + 102,
        'low': np.random.randn(100).cumsum() + 98,
        'close': np.random.randn(100).cumsum() + 100,
        'volume': np.random.randint(1000000, 10000000, 100)
    }, index=dates)
    
    fe = FeatureEngine()
    result = await fe.compute_features(df, "TEST001")
    
    print(f"Computed {len(result.features)} features")
    print(f"Sample features: {list(result.features.keys())[:5]}")
    
    return fe


def test_trading_engine():
    """Test trading engine."""
    print("\n=== Testing Trading Engine ===")
    
    engine = AutoTradingEngine({"initial_capital": 1000000})
    
    # Create a signal
    signal = TradeSignal(
        symbol="000001",
        action=OrderSide.BUY,
        strength=0.8,
        timestamp=datetime.now()
    )
    
    # Process signal
    order = engine.process_signal(signal, 15.50)
    
    if order:
        print(f"Order created: {order.order_id}")
        
        # Execute order
        order = engine.execute_order(order, 15.50)
        print(f"Order executed: {order.status}")
        
        # Get position
        position = engine.get_position("000001")
        if position:
            print(f"Position: {position.quantity} shares @ {position.avg_price}")
    
    return engine


def test_risk_guard():
    """Test risk guard."""
    print("\n=== Testing Risk Guard ===")
    
    guard = RiskGuard()
    guard.initialize(1000000)
    
    metrics = guard.get_risk_metrics({}, 1000000)
    print(f"Risk metrics: {metrics}")
    
    return guard


def main():
    """Run all tests."""
    print("=" * 50)
    print("ShiHao Finance Backend Test")
    print("=" * 50)
    
    try:
        # Test async components
        asyncio.run(test_data_manager())
        asyncio.run(test_feature_engine())
        
        # Test sync components
        test_trading_engine()
        test_risk_guard()
        
        print("\n" + "=" * 50)
        print("All tests passed!")
        print("=" * 50)
        
    except Exception as e:
        print(f"\nTest failed with error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()