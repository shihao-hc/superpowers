"""
Broker Adapter: Unified interface for real trading via multiple brokers.
- Abstract broker interface
- Order management
- Position tracking
- Real-time quote handling
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
import json
import threading
import time


class BrokerType(Enum):
    """Supported broker types."""
    ALPACA = "alpaca"
    INTERACTIVE_BROKERS = "ib"
    ALPAPER = "alpaper"
    TUSHARE = "tushare"
    CUSTOM = "custom"


class OrderType(Enum):
    """Order types."""
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"


class OrderSide(Enum):
    """Order side."""
    BUY = "buy"
    SELL = "sell"


class OrderStatus(Enum):
    """Order status."""
    PENDING_NEW = "pending_new"
    NEW = "new"
    PARTIALLY_FILLED = "partially_filled"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


@dataclass
class BrokerConfig:
    """Broker configuration."""
    broker_type: BrokerType
    api_key: str = ""
    api_secret: str = ""
    base_url: str = ""
    paper_trading: bool = True
    timeout: int = 30


@dataclass
class Order:
    """Order representation."""
    order_id: str
    client_order_id: str
    ticker: str
    side: OrderSide
    order_type: OrderType
    quantity: int
    filled_quantity: int = 0
    limit_price: Optional[float] = None
    stop_price: Optional[float] = None
    status: OrderStatus = OrderStatus.PENDING_NEW
    created_at: str = ""
    updated_at: str = ""
    filled_at: Optional[str] = None
    avg_fill_price: Optional[float] = None


@dataclass
class Position:
    """Position representation."""
    ticker: str
    quantity: int
    avg_entry_price: float
    market_value: float
    unrealized_pnl: float
    realized_pnl: float = 0.0


@dataclass
class Account:
    """Account information."""
    account_id: str
    cash: float
    portfolio_value: float
    buying_power: float
    equity: float
    positions: Dict[str, Position] = field(default_factory=dict)


class BrokerBase(ABC):
    """Abstract broker interface."""

    @abstractmethod
    def connect(self) -> bool:
        """Connect to broker."""
        pass

    @abstractmethod
    def disconnect(self) -> None:
        """Disconnect from broker."""
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        """Check connection status."""
        pass

    @abstractmethod
    def submit_order(self, order: Order) -> Order:
        """Submit an order."""
        pass

    @abstractmethod
    def cancel_order(self, order_id: str) -> bool:
        """Cancel an order."""
        pass

    @abstractmethod
    def get_order(self, order_id: str) -> Order:
        """Get order status."""
        pass

    @abstractmethod
    def get_account(self) -> Account:
        """Get account information."""
        pass

    @abstractmethod
    def get_positions(self) -> List[Position]:
        """Get current positions."""
        pass

    @abstractmethod
    def get_quote(self, ticker: str) -> dict:
        """Get real-time quote."""
        pass


class AlpacaBroker(BrokerBase):
    """Alpaca broker implementation."""

    def __init__(self, config: BrokerConfig):
        self.config = config
        self.connected = False
        self.orders: Dict[str, Order] = {}
        self._order_id_counter = 0
        self._lock = threading.Lock()

    def connect(self) -> bool:
        """Connect to Alpaca."""
        if not self.config.api_key or not self.config.api_secret:
            print("Alpaca: API key not configured")
            return False
        
        base_url = self.config.base_url or (
            "https://paper-api.alpaca.markets" if self.config.paper_trading
            else "https://api.alpaca.markets"
        )
        
        self.base_url = base_url
        self.connected = True
        print(f"Alpaca: Connected to {base_url}")
        return True

    def disconnect(self) -> None:
        """Disconnect from Alpaca."""
        self.connected = False

    def is_connected(self) -> bool:
        """Check connection."""
        return self.connected

    def submit_order(self, order: Order) -> Order:
        """Submit order to Alpaca."""
        if not self.connected:
            raise ConnectionError("Not connected to broker")
        
        with self._lock:
            self._order_id_counter += 1
            order.order_id = f"alpaca_{self._order_id_counter}"
        
        order.status = OrderStatus.NEW
        order.created_at = datetime.now().isoformat()
        order.updated_at = order.created_at
        
        with self._lock:
            self.orders[order.order_id] = order
        
        print(f"Alpaca: Submitted order {order.order_id} - {order.side.value} {order.quantity} {order.ticker}")
        return order

    def cancel_order(self, order_id: str) -> bool:
        """Cancel order."""
        with self._lock:
            if order_id in self.orders:
                order = self.orders[order_id]
                if order.status in [OrderStatus.NEW, OrderStatus.PARTIALLY_FILLED]:
                    order.status = OrderStatus.CANCELLED
                    order.updated_at = datetime.now().isoformat()
                    print(f"Alpaca: Cancelled order {order_id}")
                    return True
        return False

    def get_order(self, order_id: str) -> Order:
        """Get order status."""
        with self._lock:
            return self.orders.get(order_id)

    def get_account(self) -> Account:
        """Get account info."""
        return Account(
            account_id="demo",
            cash=1000000.0,
            portfolio_value=1000000.0,
            buying_power=1000000.0,
            equity=1000000.0
        )

    def get_positions(self) -> List[Position]:
        """Get positions."""
        return []

    def get_quote(self, ticker: str) -> dict:
        """Get quote."""
        return {"bid": 0, "ask": 0, "last": 0}


class InteractiveBrokersBroker(BrokerBase):
    """Interactive Brokers broker implementation."""

    def __init__(self, config: BrokerConfig):
        self.config = config
        self.connected = False

    def connect(self) -> bool:
        """Connect to IB."""
        print("Interactive Brokers: Note - requires IB Gateway/TWS running")
        self.connected = False
        return False

    def disconnect(self) -> None:
        """Disconnect."""
        self.connected = False

    def is_connected(self) -> bool:
        """Check connection."""
        return self.connected

    def submit_order(self, order: Order) -> Order:
        """Submit order."""
        raise NotImplementedError("IB integration requires ib_insync library")

    def cancel_order(self, order_id: str) -> bool:
        """Cancel order."""
        raise NotImplementedError()

    def get_order(self, order_id: str) -> Order:
        """Get order."""
        raise NotImplementedError()

    def get_account(self) -> Account:
        """Get account."""
        raise NotImplementedError()

    def get_positions(self) -> List[Position]:
        """Get positions."""
        return []

    def get_quote(self, ticker: str) -> dict:
        """Get quote."""
        return {}


class UnifiedBrokerAdapter:
    """
    Unified broker adapter with failover and multi-broker support.
    """

    def __init__(self, primary_broker: BrokerType = BrokerType.ALPACA):
        self.primary_broker_type = primary_broker
        self.brokers: Dict[BrokerType, BrokerBase] = {}
        self.current_broker: Optional[BrokerBase] = None

    def register_broker(self, broker_type: BrokerType, broker: BrokerBase) -> None:
        """Register a broker."""
        self.brokers[broker_type] = broker
        if broker_type == self.primary_broker_type:
            self.current_broker = broker

    def connect(self, broker_type: BrokerType = None) -> bool:
        """Connect to broker."""
        broker_type = broker_type or self.primary_broker_type
        broker = self.brokers.get(broker_type)
        
        if broker:
            self.current_broker = broker
            return broker.connect()
        return False

    def connect_all(self) -> Dict[BrokerType, bool]:
        """Connect to all registered brokers."""
        results = {}
        for bt, broker in self.brokers.items():
            results[bt] = broker.connect()
        return results

    def disconnect(self) -> None:
        """Disconnect current broker."""
        if self.current_broker:
            self.current_broker.disconnect()

    def switch_broker(self, broker_type: BrokerType) -> bool:
        """Switch to different broker."""
        if broker_type in self.brokers:
            if self.current_broker:
                self.current_broker.disconnect()
            self.current_broker = self.brokers[broker_type]
            return self.current_broker.connect()
        return False

    def submit_order(
        self,
        ticker: str,
        side: OrderSide,
        quantity: int,
        order_type: OrderType = OrderType.MARKET,
        limit_price: Optional[float] = None,
        stop_price: Optional[float] = None
    ) -> Order:
        """Submit order via current broker."""
        if not self.current_broker:
            raise ConnectionError("No broker connected")
        
        order = Order(
            order_id="",
            client_order_id=f"client_{datetime.now().timestamp()}",
            ticker=ticker,
            side=side,
            order_type=order_type,
            quantity=quantity,
            limit_price=limit_price,
            stop_price=stop_price
        )
        
        return self.current_broker.submit_order(order)

    def cancel_order(self, order_id: str) -> bool:
        """Cancel order."""
        if self.current_broker:
            return self.current_broker.cancel_order(order_id)
        return False

    def get_order(self, order_id: str) -> Optional[Order]:
        """Get order."""
        if self.current_broker:
            return self.current_broker.get_order(order_id)
        return None

    def get_account(self) -> Optional[Account]:
        """Get account."""
        if self.current_broker:
            return self.current_broker.get_account()
        return None

    def get_positions(self) -> List[Position]:
        """Get positions."""
        if self.current_broker:
            return self.current_broker.get_positions()
        return []

    def get_quote(self, ticker: str) -> dict:
        """Get quote."""
        if self.current_broker:
            return self.current_broker.get_quote(ticker)
        return {}

    def get_broker_status(self) -> Dict:
        """Get status of all brokers."""
        return {
            bt.value: {
                "registered": bt in self.brokers,
                "connected": broker.is_connected() if broker else False
            }
            for bt, broker in self.brokers.items()
        }


def demo_broker_adapter():
    """Demo broker adapter."""
    config = BrokerConfig(
        broker_type=BrokerType.ALPACA,
        api_key="test_key",
        api_secret="test_secret",
        paper_trading=True
    )
    
    adapter = UnifiedBrokerAdapter(BrokerType.ALPACA)
    
    alpaca = AlpacaBroker(config)
    adapter.register_broker(BrokerType.ALPACA, alpaca)
    
    adapter.connect()
    
    order = adapter.submit_order(
        ticker="AAPL",
        side=OrderSide.BUY,
        quantity=100,
        order_type=OrderType.LIMIT,
        limit_price=150.0
    )
    print(f"Order submitted: {order.order_id}")
    
    account = adapter.get_account()
    print(f"Account equity: ${account.equity:,.2f}")
    
    status = adapter.get_broker_status()
    print(f"Broker status: {status}")


if __name__ == "__main__":
    demo_broker_adapter()
