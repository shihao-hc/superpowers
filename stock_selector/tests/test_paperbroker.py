import unittest
from stock_selector.execution import PaperBroker, Order, OrderSide, OrderType, OrderStatus


class TestPaperBroker(unittest.TestCase):
    def test_basic_buy_sell(self):
        pb = PaperBroker(initial_cash=10000.0)
        # Create an order
        order = Order(
            order_id="",
            ticker="AAPL",
            side=OrderSide.BUY,
            order_type=OrderType.MARKET,
            quantity=50,
            status=OrderStatus.PENDING
        )
        executed = pb.place_order(order)
        self.assertIsNotNone(executed)
        self.assertEqual(executed.status, OrderStatus.FILLED)
        self.assertEqual(len(pb.positions), 1)
        self.assertIn('AAPL', pb.positions)
        self.assertAlmostEqual(pb.cash, 10000.0 - 50 * (executed.avg_fill_price or 100.0))
