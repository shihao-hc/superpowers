"""
Execution Module: Broker API integration for trading.
- Paper trading and live trading modes
- Order management (limit, stop, algo orders)
- Execution tracking and position synchronization
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum
import json
import threading
import time
import uuid


class OrderType(Enum):
    """Order types."""
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderSide(Enum):
    """Order sides."""
    BUY = "buy"
    SELL = "sell"


class OrderStatus(Enum):
    """Order statuses."""
    CREATED = "created"       # Order created locally
    PENDING = "pending"       # Awaiting submission
    SUBMITTED = "submitted"    # Sent to broker
    PARTIAL_FILLED = "partial_filled"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    ERROR = "error"            # Error state


class OrderStateMachine:
    """
    Order state machine for full lifecycle tracking.
    Handles state transitions and ensures valid transitions.
    """

    VALID_TRANSITIONS = {
        OrderStatus.CREATED: [OrderStatus.PENDING, OrderStatus.CANCELLED],
        OrderStatus.PENDING: [OrderStatus.SUBMITTED, OrderStatus.CANCELLED],
        OrderStatus.SUBMITTED: [OrderStatus.PARTIAL_FILLED, OrderStatus.FILLED, OrderStatus.CANCELLED, OrderStatus.REJECTED, OrderStatus.ERROR],
        OrderStatus.PARTIAL_FILLED: [OrderStatus.PARTIAL_FILLED, OrderStatus.FILLED, OrderStatus.CANCELLED],
        OrderStatus.FILLED: [],
        OrderStatus.CANCELLED: [],
        OrderStatus.REJECTED: [],
        OrderStatus.ERROR: [OrderStatus.PENDING],  # Can retry
    }

    @classmethod
    def can_transition(cls, from_state: OrderStatus, to_state: OrderStatus) -> bool:
        """Check if transition is valid."""
        return to_state in cls.VALID_TRANSITIONS.get(from_state, [])

    @classmethod
    def transition(cls, order: Order, to_state: OrderStatus) -> bool:
        """Transition order to new state."""
        if not cls.can_transition(order.status, to_state):
            return False
        order.status = to_state
        order.updated_at = datetime.now().isoformat()
        return True


class IdempotencyManager:
    """Ensure idempotent order operations."""

    def __init__(self):
        self.sent_orders: Dict[str, dict] = {}  # client_order_id -> order info

    def generate_client_id(self, ticker: str, side: str, quantity: int, price: float) -> str:
        """Generate unique client order ID."""
        unique_str = f"{ticker}_{side}_{quantity}_{price}_{datetime.now().isoformat()}"
        import hashlib
        return hashlib.sha256(unique_str.encode()).hexdigest()[:16]

    def is_sent(self, client_id: str) -> bool:
        """Check if order was already sent."""
        return client_id in self.sent_orders

    def mark_sent(self, client_id: str, order_info: dict) -> None:
        """Mark order as sent."""
        self.sent_orders[client_id] = order_info

    def get_sent_order(self, client_id: str) -> Optional[dict]:
        """Get previously sent order info."""
        return self.sent_orders.get(client_id)


class ReconnectionManager:
    """Handle broker connection failures and reconnection."""

    def __init__(self, max_retries: int = 3, backoff_base: float = 1.0):
        self.max_retries = max_retries
        self.backoff_base = backoff_base
        self.connection_status = "disconnected"
        self.retry_count = 0

    def should_retry(self) -> bool:
        """Check if should retry connection."""
        return self.retry_count < self.max_retries

    def get_backoff_delay(self) -> float:
        """Calculate exponential backoff delay."""
        return self.backoff_base * (2 ** self.retry_count)

    def record_failure(self) -> None:
        """Record connection failure."""
        self.retry_count += 1
        self.connection_status = "reconnecting"

    def record_success(self) -> None:
        """Record successful connection."""
        self.retry_count = 0
        self.connection_status = "connected"

    def reset(self) -> None:
        """Reset retry state."""
        self.retry_count = 0
        self.connection_status = "disconnected"


@dataclass
class Position:
    """Position information."""
    ticker: str
    quantity: int
    avg_price: float
    market_value: float
    unrealized_pnl: float
    realized_pnl: float


class BrokerAPI:
    """Base broker API interface."""

    def __init__(self, paper_mode: bool = True):
        self.paper_mode = paper_mode

    def get_account_info(self) -> Dict:
        """Get account information."""
        raise NotImplementedError

    def get_positions(self) -> List[Position]:
        """Get current positions."""
        raise NotImplementedError

    def place_order(self, order: Order) -> Order:
        """Place an order."""
        raise NotImplementedError

    def cancel_order(self, order_id: str) -> bool:
        """Cancel an order."""
        raise NotImplementedError

    def get_order_status(self, order_id: str) -> Order:
        """Get order status."""
        raise NotImplementedError


class BrokerWithResilience(BrokerAPI):
    """Broker API with resilience features."""

    def __init__(self, paper_mode: bool = True, backup_broker=None):
        super().__init__(paper_mode)
        self.backup_broker = backup_broker
        self.idempotency = IdempotencyManager()
        self.reconnection = ReconnectionManager()
        self.fallback_mode = False
        self.current_broker = self

    def get_active_broker(self) -> BrokerAPI:
        """Get active broker (main or backup)."""
        if self.fallback_mode and self.backup_broker:
            return self.backup_broker
        return self

    def switch_to_backup(self) -> None:
        """Switch to backup broker."""
        if self.backup_broker:
            self.fallback_mode = True
            self.current_broker = self.backup_broker
            print(f"Switched to backup broker: {type(self.backup_broker).__name__}")

    def switch_to_main(self) -> None:
        """Switch back to main broker."""
        self.fallback_mode = False
        self.current_broker = self
        print("Switched back to main broker")

    def execute_with_fallback(
        self,
        operation: Callable,
        fallback_operation: Callable = None
    ) -> any:
        """Execute operation with fallback support."""
        broker = self.get_active_broker()

        try:
            result = operation(broker)
            self.reconnection.record_success()
            return result
        except Exception as e:
            print(f"Operation failed: {e}")
            self.reconnection.record_failure()

            if fallback_operation and self.fallback_mode:
                raise

            if self.reconnection.should_retry() and fallback_operation:
                import time
                delay = self.reconnection.get_backoff_delay()
                print(f"Retrying in {delay}s...")
                time.sleep(delay)
                return fallback_operation()
            elif self.backup_broker and not self.fallback_mode:
                self.switch_to_backup()
                return operation(self.backup_broker)

            raise


class TimeInForce(Enum):
    """Time in force."""
    DAY = "day"
    GTC = "good_till_cancel"
    IOC = "immediate_or_cancel"
    FOK = "fill_or_kill"


@dataclass
class Order:
    """Trading order."""
    order_id: str
    ticker: str
    side: OrderSide
    order_type: OrderType
    quantity: int
    filled_quantity: int = 0
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    time_in_force: TimeInForce = TimeInForce.DAY
    status: OrderStatus = OrderStatus.PENDING
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    filled_at: Optional[str] = None
    avg_fill_price: Optional[float] = None
    commission: float = 0.0
    metadata: Dict = field(default_factory=dict)


@dataclass
class Fill:
    """Execution fill."""
    fill_id: str
    order_id: str
    ticker: str
    side: OrderSide
    quantity: int
    price: float
    commission: float
    timestamp: str


@dataclass
class Position:
    """Current position."""
    ticker: str
    quantity: int
    avg_price: float
    market_value: float
    unrealized_pnl: float
    realized_pnl: float


class BrokerAPI:
    """Base broker API interface."""

    def __init__(self, paper_mode: bool = True):
        self.paper_mode = paper_mode

    def get_account_info(self) -> Dict:
        """Get account information."""
        raise NotImplementedError

    def get_positions(self) -> List[Position]:
        """Get current positions."""
        raise NotImplementedError

    def place_order(self, order: Order) -> Order:
        """Place an order."""
        raise NotImplementedError

    def cancel_order(self, order_id: str) -> bool:
        """Cancel an order."""
        raise NotImplementedError

    def get_order_status(self, order_id: str) -> Order:
        """Get order status."""
        raise NotImplementedError


class PaperBroker(BrokerAPI):
    """Paper trading broker for backtesting and simulation."""

    def __init__(self, initial_cash: float = 1000000.0):
        super().__init__(paper_mode=True)
        self.initial_cash = initial_cash
        self.cash = initial_cash
        self.positions: Dict[str, Dict] = {}  # ticker -> {quantity, avg_price}
        self.orders: Dict[str, Order] = {}
        self.fills: List[Fill] = []
        self.order_history: List[Order] = []
        self._order_lock = threading.Lock()

    def get_account_info(self) -> Dict:
        """Get paper trading account info."""
        positions_value = sum(
            pos['quantity'] * pos['avg_price']
            for pos in self.positions.values()
        )
        total_value = self.cash + positions_value

        return {
            "cash": self.cash,
            "positions_value": positions_value,
            "total_value": total_value,
            "buying_power": self.cash * 2,  # Assume 2x margin
            "paper_mode": True
        }

    def get_positions(self) -> List[Position]:
        """Get current positions."""
        result = []
        for ticker, pos in self.positions.items():
            if pos['quantity'] > 0:
                result.append(Position(
                    ticker=ticker,
                    quantity=pos['quantity'],
                    avg_price=pos['avg_price'],
                    market_value=pos['quantity'] * pos['avg_price'],
                    unrealized_pnl=0,  # Would need current price
                    realized_pnl=0
                ))
        return result

    def place_order(self, order: Order) -> Order:
        """Place a paper trade order."""
        with self._order_lock:
            order.order_id = str(uuid.uuid4())[:8]
            order.status = OrderStatus.SUBMITTED
            order.updated_at = datetime.now().isoformat()

            # For market orders, simulate fill immediately
            if order.order_type == OrderType.MARKET:
                # Use mock fill price (in real implementation, get from market data)
                fill_price = order.metadata.get('current_price', 100.0)

                # Check if we have enough cash/position
                if order.side == OrderSide.BUY:
                    required = fill_price * order.quantity
                    if required <= self.cash:
                        self.cash -= required
                        if order.ticker in self.positions:
                            old_qty = self.positions[order.ticker]['quantity']
                            old_avg = self.positions[order.ticker]['avg_price']
                            new_qty = old_qty + order.quantity
                            new_avg = (old_avg * old_qty + fill_price * order.quantity) / new_qty
                            self.positions[order.ticker] = {'quantity': new_qty, 'avg_price': new_avg}
                        else:
                            self.positions[order.ticker] = {'quantity': order.quantity, 'avg_price': fill_price}
                    else:
                        order.status = OrderStatus.REJECTED
                        order.metadata['reason'] = 'Insufficient cash'
                else:  # Sell
                    if order.ticker in self.positions and self.positions[order.ticker]['quantity'] >= order.quantity:
                        self.positions[order.ticker]['quantity'] -= order.quantity
                        if self.positions[order.ticker]['quantity'] == 0:
                            del self.positions[order.ticker]
                        self.cash += fill_price * order.quantity

                # Record fill
                fill = Fill(
                    fill_id=str(uuid.uuid4())[:8],
                    order_id=order.order_id,
                    ticker=order.ticker,
                    side=order.side,
                    quantity=order.quantity,
                    price=fill_price,
                    commission=0,
                    timestamp=datetime.now().isoformat()
                )
                self.fills.append(fill)

                order.filled_quantity = order.quantity
                order.avg_fill_price = fill_price
                order.status = OrderStatus.FILLED
                order.filled_at = datetime.now().isoformat()

            self.orders[order.order_id] = order
            self.order_history.append(order)

            return order

    def cancel_order(self, order_id: str) -> bool:
        """Cancel a paper order."""
        with self._order_lock:
            if order_id in self.orders:
                order = self.orders[order_id]
                if order.status in [OrderStatus.PENDING, OrderStatus.SUBMITTED]:
                    order.status = OrderStatus.CANCELLED
                    order.updated_at = datetime.now().isoformat()
                    return True
            return False

    def get_order_status(self, order_id: str) -> Optional[Order]:
        """Get order status."""
        return self.orders.get(order_id)

    def get_fills(self, since: Optional[str] = None) -> List[Fill]:
        """Get fills since timestamp."""
        if since:
            return [f for f in self.fills if f.timestamp >= since]
        return self.fills

    def reset(self) -> None:
        """Reset paper trading account."""
        self.cash = self.initial_cash
        self.positions.clear()
        self.orders.clear()
        self.fills.clear()


class ExecutionManager:
    """
    High-level execution manager with order management and algo execution.
    """

    def __init__(self, broker: BrokerAPI):
        self.broker = broker
        self.order_callbacks: List[Callable] = []

    def execute_signal(
        self,
        ticker: str,
        side: str,
        quantity: int,
        order_type: OrderType = OrderType.MARKET,
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None,
        current_price: Optional[float] = None,
    ) -> Order:
        """Execute a trading signal."""
        # Create order
        order = Order(
            order_id="",
            ticker=ticker,
            side=OrderSide.BUY if side.lower() == "buy" else OrderSide.SELL,
            order_type=order_type,
            quantity=quantity,
            limit_price=limit_price,
            stop_price=stop_price,
            metadata={'current_price': current_price}
        )

        # Submit to broker
        filled_order = self.broker.place_order(order)

        # Notify callbacks
        for callback in self.order_callbacks:
            try:
                callback(filled_order)
            except Exception as e:
                print(f"Order callback error: {e}")

        return filled_order

    def execute_vwap(
        self,
        ticker: str,
        side: str,
        total_quantity: int,
        start_time: str,
        end_time: str,
        algo_params: Optional[Dict] = None
    ) -> List[Order]:
        """
        Execute VWAP algorithm.
        Splits large order into smaller chunks over time.
        """
        algo_params = algo_params or {}
        num_slices = algo_params.get('num_slices', 10)
        slice_interval = algo_params.get('slice_interval', 300)  # seconds

        slice_qty = total_quantity // num_slices
        orders = []

        for i in range(num_slices):
            order = self.execute_signal(
                ticker=ticker,
                side=side,
                quantity=slice_qty,
                order_type=OrderType.LIMIT,
                limit_price=algo_params.get('limit_price')
            )
            orders.append(order)

            # Wait between slices
            if i < num_slices - 1:
                time.sleep(slice_interval)

        return orders

    def execute_twap(
        self,
        ticker: str,
        side: str,
        total_quantity: int,
        duration_minutes: int = 60,
        algo_params: Optional[Dict] = None
    ) -> List[Order]:
        """Execute TWAP algorithm."""
        algo_params = algo_params or {}
        num_orders = algo_params.get('num_orders', 30)
        interval = duration_minutes * 60 / num_orders

        slice_qty = total_quantity // num_orders
        orders = []

        for i in range(num_orders):
            order = self.execute_signal(
                ticker=ticker,
                side=side,
                quantity=slice_qty,
                order_type=OrderType.LIMIT,
                limit_price=algo_params.get('limit_price')
            )
            orders.append(order)

            if i < num_orders - 1:
                time.sleep(interval)

        return orders

    def register_order_callback(self, callback: Callable) -> None:
        """Register order callback."""
        self.order_callbacks.append(callback)

    def get_open_orders(self) -> List[Order]:
        """Get all open orders."""
        return [
            o for o in self.broker.orders.values()
            if o.status in [OrderStatus.PENDING, OrderStatus.SUBMITTED]
        ]

    def cancel_all_orders(self) -> int:
        """Cancel all open orders."""
        count = 0
        for order in self.get_open_orders():
            if self.broker.cancel_order(order.order_id):
                count += 1
        return count


class PositionTracker:
    """Track positions and sync with broker."""

    def __init__(self, broker: BrokerAPI):
        self.broker = broker
        self.local_positions: Dict[str, Dict] = {}
        self._sync_lock = threading.Lock()

    def sync_positions(self) -> Dict[str, Dict]:
        """Sync positions with broker."""
        with self._sync_lock:
            broker_positions = self.broker.get_positions()

            self.local_positions = {
                pos.ticker: {
                    'quantity': pos.quantity,
                    'avg_price': pos.avg_price,
                    'market_value': pos.market_value,
                }
                for pos in broker_positions
            }

            return self.local_positions

    def get_position(self, ticker: str) -> Optional[Dict]:
        """Get position for specific ticker."""
        return self.local_positions.get(ticker)

    def has_position(self, ticker: str) -> bool:
        """Check if we have a position."""
        pos = self.local_positions.get(ticker)
        return pos and pos.get('quantity', 0) > 0


def order_callback(order: Order) -> None:
    """Order status callback."""
    print(f"Order Update: {order.order_id} - {order.status.value} for {order.ticker}")


def demo_execution():
    """Demo execution manager."""
    # Create paper broker
    broker = PaperBroker(initial_cash=1000000)
    exec_mgr = ExecutionManager(broker)
    exec_mgr.register_order_callback(order_callback)

    # Get account info
    account = broker.get_account_info()
    print(f"Initial Account: ${account['total_value']:,.2f}")

    # Execute buy order
    order = exec_mgr.execute_signal(
        ticker="AAPL",
        side="buy",
        quantity=100,
        current_price=150.0
    )
    print(f"\nBuy Order: {order.order_id} - Status: {order.status.value}")
    print(f"  Filled @ ${order.avg_fill_price}")

    # Execute sell order
    order = exec_mgr.execute_signal(
        ticker="AAPL",
        side="sell",
        quantity=50,
        current_price=155.0
    )
    print(f"\nSell Order: {order.order_id} - Status: {order.status.value}")

    # Get positions
    positions = broker.get_positions()
    print(f"\nPositions: {len(positions)}")
    for pos in positions:
        print(f"  {pos.ticker}: {pos.quantity} @ ${pos.avg_price}")

    # Final account
    account = broker.get_account_info()
    print(f"\nFinal Account: ${account['total_value']:,.2f}")


class TradingLoop:
    """
    Complete trading loop integrating execution, risk management, and position tracking.
    """

    def __init__(
        self,
        execution_manager: ExecutionManager,
        risk_guard,
        position_tracker: PositionTracker
    ):
        self.execution = execution_manager
        self.risk = risk_guard
        self.positions = position_tracker
        self.is_running = False

    def process_signals(
        self,
        signals: pd.DataFrame,
        current_prices: Dict[str, float]
    ) -> List[dict]:
        """
        Process trading signals through risk guard and execute.
        
        Args:
            signals: DataFrame with [ticker, side, quantity, score]
            current_prices: Dict of ticker -> current price
        
        Returns:
            List of execution results
        """
        results = []
        self.positions.sync_positions()

        for _, signal in signals.iterrows():
            ticker = signal['ticker']
            side = signal['side']
            quantity = signal.get('quantity', 100)
            price = current_prices.get(ticker, 0)

            if price <= 0:
                continue

            # Get current positions
            pos_dict = {
                t: {'quantity': p.quantity, 'avg_price': p.avg_price}
                for p in self.positions.local_positions.values()
            }
            portfolio_value = sum(
                p.quantity * p.avg_price for p in self.positions.local_positions.values()
            ) + self.execution.broker.cash

            # Pre-trade risk check
            check = self.risk.pre_trade_check(
                ticker, side, quantity, price, pos_dict, portfolio_value
            )

            if not check['approved']:
                results.append({
                    'ticker': ticker,
                    'status': 'rejected',
                    'reason': check['reason']
                })
                continue

            # Execute approved order
            order = self.execution.execute_signal(
                ticker=ticker,
                side=side,
                quantity=check['order']['quantity'],
                current_price=price
            )

            # Post-trade update
            if order.status == OrderStatus.FILLED:
                self.risk.post_trade_update(
                    ticker, order.filled_quantity,
                    order.avg_fill_price, side
                )

            results.append({
                'ticker': ticker,
                'order_id': order.order_id,
                'status': order.status.value,
                'filled_price': order.avg_fill_price,
                'filled_quantity': order.filled_quantity
            })

        return results

    def run_end_of_day(
        self,
        signals: pd.DataFrame,
        current_prices: Dict[str, float]
    ) -> dict:
        """Run end-of-day processing."""
        results = self.process_signals(signals, current_prices)

        # Update positions
        self.positions.sync_positions()

        # Get risk report
        risk_report = self.risk.get_risk_status(self.positions.local_positions)

        return {
            'execution_results': results,
            'risk_status': risk_report,
            'positions': self.positions.local_positions,
            'account': self.execution.broker.get_account_info()
        }

    def start(self) -> None:
        """Start the trading loop."""
        self.is_running = True

    def stop(self) -> None:
        """Stop the trading loop."""
        self.is_running = False
        self.execution.cancel_all_orders()


def demo_trading_loop():
    """Demo the complete trading loop."""
    # Setup components
    broker = PaperBroker(initial_cash=1000000)
    exec_mgr = ExecutionManager(broker)
    pos_tracker = PositionTracker(broker)
    risk_mgr = RiskManager(initial_capital=1000000)
    risk_guard = RiskGuard(risk_mgr)

    # Create trading loop
    loop = TradingLoop(exec_mgr, risk_guard, pos_tracker)

    # Mock signals
    signals = pd.DataFrame([
        {'ticker': 'AAPL', 'side': 'buy', 'quantity': 100, 'score': 0.9},
        {'ticker': 'MSFT', 'side': 'buy', 'quantity': 50, 'score': 0.8},
    ])

    current_prices = {'AAPL': 150.0, 'MSFT': 300.0}

    # Run EOD processing
    result = loop.run_end_of_day(signals, current_prices)

    print("=== Trading Loop Results ===")
    print(f"Positions: {len(result['positions'])}")
    print(f"Account Value: ${result['account']['total_value']:,.2f}")
    print(f"Risk Level: {result['risk_status'].risk_level.value}")


if __name__ == "__main__":
    demo_trading_loop()

from stock_selector.risk_manager import RiskManager, RiskGuard
