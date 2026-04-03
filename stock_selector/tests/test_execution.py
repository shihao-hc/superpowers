import unittest
from stock_selector.execution import OrderStatus, OrderStateMachine, IdempotencyManager, ReconnectionManager, TimeInForce, PaperBroker, ExecutionManager, PositionTracker, TradingLoop
from stock_selector.risk_manager import RiskManager, RiskGuard
from stock_selector import risk_manager as risk_mod
from stock_selector.paper_trading_simulator import PaperTradingSimulator
from stock_selector.monitoring import MonitoringDashboard
from stock_selector.factor_db import FactorDatabase, Factor

class TestExecutionModule(unittest.TestCase):
    def test_order_state_transitions(self):
        o = __import__('stock_selector.execution', fromlist=['Order']).Order(
            order_id='t1', ticker='AAPL', side=__import__('stock_selector.execution', fromlist=['OrderSide']).OrderSide.BUY,
            order_type=__import__('stock_selector.execution', fromlist=['OrderType']).OrderType.MARKET,
            quantity=10,
            status=OrderStatus.CREATED
        )
        ok = OrderStateMachine.transition(o, OrderStatus.PENDING)
        self.assertTrue(ok)
        self.assertEqual(o.status, OrderStatus.PENDING)

    def test_idempotency_manager(self):
        im = IdempotencyManager()
        cid = im.generate_client_id("AAPL", "buy", 10, 150)
        self.assertIsNotNone(cid)
        self.assertEqual(len(cid), 16)
        im.mark_sent(cid, {"order_id": cid})
        self.assertTrue(im.is_sent(cid))

    def test_reconnection_manager(self):
        rm = ReconnectionManager(max_retries=2, backoff_base=1.0)
        self.assertTrue(rm.should_retry())
        rm.record_failure()
        self.assertEqual(rm.retry_count, 1)
        self.assertGreater(rm.get_backoff_delay(), 0)

    def test_paper_broker_and_execution_manager(self):
        broker = PaperBroker(initial_cash=1000000.0)
        pm = ExecutionManager(broker)
        broker_account = broker.get_account_info()
        self.assertIn('total_value', broker_account)
        order = pm.execute_signal(ticker='AAPL', side='buy', quantity=1, current_price=150.0)
        self.assertIsNotNone(order)
        self.assertTrue(order.status in [OrderStatus.SUBMITTED, OrderStatus.FILLED, OrderStatus.CREATED, OrderStatus.PENDING])

    def test_position_tracker_and_trading_loop(self):
        broker = PaperBroker(initial_cash=1000000.0)
        exec_mgr = ExecutionManager(broker)
        pos_tracker = PositionTracker(broker)
        risk_mgr = RiskManager(initial_capital=1000000)
        risk_guard = risk_mod.RiskGuard(risk_mgr)
        loop = TradingLoop(exec_mgr, risk_guard, pos_tracker)
        self.assertIsNotNone(loop)
