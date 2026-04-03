"""
Unit tests for stock_selector core modules.
"""
import unittest
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import sys
import os
import tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestRiskManager(unittest.TestCase):
    """Test RiskManager module."""
    
    def setUp(self):
        from risk_manager import RiskManager
        self.rm = RiskManager(
            initial_capital=1000000,
            max_daily_loss_pct=0.02,
            max_position_pct=0.10
        )
    
    def test_basic_order_approval(self):
        """Test basic order approval."""
        positions = {}
        result = self.rm.check_order("AAPL", "buy", 100, 150, positions, 1000000)
        self.assertTrue(result["approved"])
    
    def test_blacklist_rejection(self):
        """Test blacklist rejection."""
        self.rm.add_to_blacklist("GME", "High volatility")
        positions = {}
        result = self.rm.check_order("GME", "buy", 100, 50, positions, 1000000)
        self.assertFalse(result["approved"])
        self.assertIn("blacklist", result["reason"].lower())
    
    def test_position_limit_adjustment(self):
        """Test position limit adjustment."""
        positions = {}
        result = self.rm.check_order("AAPL", "buy", 10000, 150, positions, 1000000)
        self.assertTrue(result["approved"])
        self.assertIn("adjustments", result)
        if result.get("adjustments"):
            self.assertLessEqual(
                result["adjustments"].get("quantity", 0), 
                int(1000000 * 0.10 / 150)
            )
    
    def test_daily_loss_trigger(self):
        """Test daily loss kill switch."""
        self.rm.update_daily_pnl(-25000)
        self.assertEqual(self.rm.kill_switch_status.value, "triggered")
    
    def test_position_multiplier(self):
        """Test volatility-based position multiplier."""
        for i in range(25):
            self.rm.update_price_history("TEST", 100 + i + np.random.randn() * 2)
        
        multiplier = self.rm.calculate_position_multiplier("TEST")
        self.assertGreaterEqual(multiplier, 0.5)
        self.assertLessEqual(multiplier, 2.0)
    
    def test_dynamic_params_update(self):
        """Test dynamic risk parameter update."""
        params = self.rm.update_dynamic_params("volatile", 0.8)
        self.assertEqual(params.market_regime, "volatile")
        self.assertLess(params.adjusted_position_pct, params.base_position_pct)


class TestStressTesting(unittest.TestCase):
    """Test StressTestingEngine module."""
    
    def setUp(self):
        from stress_testing import StressTestingEngine
        self.engine = StressTestingEngine(
            initial_capital=1000000,
            max_acceptable_drawdown=0.30
        )
    
    def test_scenario_generation(self):
        """Test scenario return generation."""
        from stress_testing import ScenarioConfig, StressSeverity
        from stress_testing import StressScenario as SS
        config = ScenarioConfig(
            scenario_type=SS.COVID_CRASH_2020,
            severity=StressSeverity.MODERATE,
            duration_days=33,
            peak_decline_pct=0.34,
            recovery_days=60,
            volatility_multiplier=3.0
        )
        returns = self.engine.generate_scenario_returns(config)
        self.assertEqual(len(returns), 33)
    
    def test_stress_result_calculation(self):
        """Test stress result metrics."""
        from stress_testing import ScenarioConfig, StressSeverity
        from stress_testing import StressScenario as SS
        positions = {"AAPL": {"quantity": 1000, "avg_price": 150}}
        config = ScenarioConfig(
            scenario_type=SS.FLASH_CRASH,
            severity=StressSeverity.MODERATE,
            duration_days=10,
            peak_decline_pct=0.10,
            recovery_days=5,
            volatility_multiplier=4.0
        )
        result = self.engine.run_scenario(config, positions)
        self.assertIsNotNone(result.max_drawdown_pct)
        self.assertNotEqual(result.max_drawdown_pct, 0)  # Should have some drawdown
    
    def test_custom_scenario(self):
        """Test custom scenario."""
        from stress_testing import StressSeverity
        positions = {"AAPL": {"quantity": 1000, "avg_price": 150}}
        result = self.engine.run_custom_scenario(
            name="test_crash",
            severity=StressSeverity.SEVERE,
            peak_decline_pct=0.25,
            duration_days=20,
            volatility_multiplier=2.0,
            positions=positions
        )
        self.assertIn("custom", result.scenario)
    
    def test_all_scenarios(self):
        """Test running all scenarios."""
        positions = {"AAPL": {"quantity": 1000, "avg_price": 150}}
        report = self.engine.run_all_scenarios(positions)
        self.assertGreater(len(report.results), 0)


class TestMarketAdapter(unittest.TestCase):
    """Test MarketAdapter module."""
    
    def test_market_enum(self):
        """Test market enum values."""
        from market_adapter import Market
        self.assertEqual(Market.US.value, "us")
        self.assertEqual(Market.A_SHARE.value, "a_share")
        self.assertEqual(Market.HK.value, "hk")
    
    def test_market_configs(self):
        """Test market configurations."""
        from market_adapter import MARKET_CONFIGS, Market
        us_config = MARKET_CONFIGS[Market.US]
        self.assertEqual(us_config.currency, "USD")
        self.assertEqual(us_config.min_lot_size, 1)
    
    def test_data_source_manager(self):
        """Test data source manager."""
        from market_adapter import DataSourceManager, Market
        mgr = DataSourceManager()
        mgr.register_source("test_source", [Market.US], priority=1)
        
        sources = mgr.get_sources_for_market(Market.US)
        self.assertIn("test_source", sources)
        
        best = mgr.get_best_source(Market.US)
        self.assertEqual(best, "test_source")
    
    def test_redundant_adapter(self):
        """Test redundant data adapter."""
        from market_adapter import RedundantDataAdapter, Market
        adapter = RedundantDataAdapter(Market.US)
        
        status = adapter.get_source_status()
        self.assertIsInstance(status, dict)


class TestDataPipeline(unittest.TestCase):
    """Test DataPipeline module."""
    
    def test_quality_checker_import(self):
        """Test DataQualityChecker can be imported."""
        from data_quality import DataQualityChecker
        self.assertTrue(callable(DataQualityChecker))


class TestExecution(unittest.TestCase):
    """Test Execution module."""
    
    def test_order_status_enum(self):
        """Test order status enum."""
        from execution import OrderStatus
        self.assertEqual(OrderStatus.CREATED.value, "created")
        self.assertEqual(OrderStatus.FILLED.value, "filled")
    
    def test_order_state_machine_valid_transitions(self):
        """Test order state machine valid transitions."""
        from execution import OrderStateMachine, OrderStatus, Order
        self.assertTrue(OrderStateMachine.can_transition(OrderStatus.CREATED, OrderStatus.PENDING))
        self.assertFalse(OrderStateMachine.can_transition(OrderStatus.FILLED, OrderStatus.PENDING))
    
    def test_order_state_transition(self):
        """Test order state transition."""
        from execution import OrderStateMachine, OrderStatus
        from execution import Order, OrderType, OrderSide
        order = Order(
            order_id="test_001",
            ticker="AAPL",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=100,
            status=OrderStatus.CREATED
        )
        result = OrderStateMachine.transition(order, OrderStatus.PENDING)
        self.assertTrue(result)
        self.assertEqual(order.status, OrderStatus.PENDING)
    
    def test_idempotency_manager(self):
        """Test idempotency manager."""
        from execution import IdempotencyManager
        manager = IdempotencyManager()
        
        client_id = manager.generate_client_id("AAPL", "buy", 100, 150.0)
        self.assertIsNotNone(client_id)
        self.assertEqual(len(client_id), 16)
        
        manager.mark_sent(client_id, {"order": "data"})
        self.assertTrue(manager.is_sent(client_id))
    
    def test_reconnection_manager(self):
        """Test reconnection manager."""
        from execution import ReconnectionManager
        rm = ReconnectionManager(max_retries=3, backoff_base=1.0)
        
        self.assertTrue(rm.should_retry())
        
        rm.record_failure()
        self.assertEqual(rm.retry_count, 1)
        
        delay = rm.get_backoff_delay()
        self.assertEqual(delay, 2.0)
        
        rm.record_success()
        self.assertEqual(rm.retry_count, 0)
        self.assertEqual(rm.connection_status, "connected")
    
    def test_trading_loop_import(self):
        """Test TradingLoop can be imported."""
        from execution import TradingLoop
        self.assertTrue(callable(TradingLoop))


class TestBacktestEngine(unittest.TestCase):
    """Test BacktestEngine module."""
    
    def test_advanced_backtest_import(self):
        """Test AdvancedBacktester can be imported."""
        from advanced_backtest import AdvancedBacktester
        self.assertTrue(callable(AdvancedBacktester))


class TestPaperTrading(unittest.TestCase):
    """Test PaperTradingSimulator module."""
    
    def test_simulator_init(self):
        """Test PaperTradingSimulator initialization."""
        df = pd.DataFrame({
            'date': pd.date_range('2024-01-01', periods=10),
            'open': [100] * 10, 'high': [102] * 10, 'low': [98] * 10,
            'close': [100, 101, 102, 101, 103, 102, 104, 103, 105, 104],
            'volume': [1000000] * 10
        })
        from paper_trading_simulator import PaperTradingSimulator
        sim = PaperTradingSimulator(
            price_df=df,
            initial_capital=1000000
        )
        self.assertEqual(sim.initial_capital, 1000000)


class TestMonitoring(unittest.TestCase):
    """Test Monitoring module."""
    
    def test_monitoring_init(self):
        """Test MonitoringDashboard initialization."""
        from monitoring import MonitoringDashboard
        dashboard = MonitoringDashboard()
        self.assertIsNotNone(dashboard)


class TestFactorDB(unittest.TestCase):
    """Test FactorDB module."""
    
    def test_factor_db_import(self):
        """Test FactorDatabase can be imported."""
        from factor_db import FactorDatabase
        self.assertTrue(callable(FactorDatabase))


class TestBrokerAdapter(unittest.TestCase):
    """Test BrokerAdapter module."""
    
    def test_broker_config(self):
        """Test broker config."""
        from broker_adapter import BrokerConfig, BrokerType
        config = BrokerConfig(
            broker_type=BrokerType.ALPACA,
            api_key="test",
            paper_trading=True
        )
        self.assertEqual(config.broker_type, BrokerType.ALPACA)
        self.assertTrue(config.paper_trading)
    
    def test_order_types(self):
        """Test order type enum."""
        from broker_adapter import OrderType, OrderSide, OrderStatus
        self.assertEqual(OrderType.MARKET.value, "market")
        self.assertEqual(OrderSide.BUY.value, "buy")
        self.assertEqual(OrderStatus.NEW.value, "new")
    
    def test_unified_broker_adapter_init(self):
        """Test unified broker adapter initialization."""
        from broker_adapter import UnifiedBrokerAdapter, BrokerType, AlpacaBroker, BrokerConfig
        adapter = UnifiedBrokerAdapter(BrokerType.ALPACA)
        
        config = BrokerConfig(broker_type=BrokerType.ALPACA, paper_trading=True)
        broker = AlpacaBroker(config)
        adapter.register_broker(BrokerType.ALPACA, broker)
        
        self.assertEqual(len(adapter.brokers), 1)


class TestParallelBacktest(unittest.TestCase):
    """Test ParallelBacktest module."""
    
    def test_execution_mode_enum(self):
        """Test execution mode enum."""
        from parallel_backtest import ExecutionMode
        self.assertEqual(ExecutionMode.THREAD.value, "thread")
        self.assertEqual(ExecutionMode.PROCESS.value, "process")
    
    def test_strategy_config(self):
        """Test strategy config."""
        from parallel_backtest import StrategyConfig
        config = StrategyConfig(
            name="test_strategy",
            params={"param1": 1},
            weight=1.0
        )
        self.assertEqual(config.name, "test_strategy")
        self.assertEqual(config.weight, 1.0)
    
    def test_parallel_engine_init(self):
        """Test parallel backtest engine initialization."""
        from parallel_backtest import ParallelBacktestEngine
        engine = ParallelBacktestEngine(
            initial_capital=1000000,
            max_workers=2
        )
        self.assertEqual(engine.initial_capital, 1000000)


def run_tests():
    """Run all tests."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    
    suite.addTests(loader.loadTestsFromTestCase(TestRiskManager))
    suite.addTests(loader.loadTestsFromTestCase(TestStressTesting))
    suite.addTests(loader.loadTestsFromTestCase(TestMarketAdapter))
    suite.addTests(loader.loadTestsFromTestCase(TestDataPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestExecution))
    suite.addTests(loader.loadTestsFromTestCase(TestBacktestEngine))
    suite.addTests(loader.loadTestsFromTestCase(TestPaperTrading))
    suite.addTests(loader.loadTestsFromTestCase(TestMonitoring))
    suite.addTests(loader.loadTestsFromTestCase(TestFactorDB))
    suite.addTests(loader.loadTestsFromTestCase(TestBrokerAdapter))
    suite.addTests(loader.loadTestsFromTestCase(TestParallelBacktest))
    
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    print(f"\n{'='*50}")
    print(f"Tests {'PASSED' if success else 'FAILED'}")
    print(f"{'='*50}")
    sys.exit(0 if success else 1)
