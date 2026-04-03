"""
AutoTradingEngine - Automated trading execution system.

This module implements signal processing, trade decisions,
order management, and execution logic.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass
from decimal import Decimal

from pydantic import BaseModel, Field
from loguru import logger


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
    PENDING = "pending"
    SUBMITTED = "submitted"
    PARTIAL = "partial"
    FILLED = "filled"
    CANCELLED = "cancelled"
    REJECTED = "rejected"


class TradeSignal(BaseModel):
    """Trading signal."""
    symbol: str
    action: OrderSide
    strength: float = Field(ge=0.0, le=1.0)
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None
    take_profit: Optional[float] = None
    timestamp: datetime
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Order(BaseModel):
    """Order representation."""
    order_id: str
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: int
    price: Optional[float] = None
    stop_price: Optional[float] = None
    status: OrderStatus = OrderStatus.PENDING
    filled_quantity: int = 0
    filled_price: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Position(BaseModel):
    """Position representation."""
    symbol: str
    quantity: int
    avg_price: float
    current_price: float = 0.0
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    opened_at: datetime
    updated_at: datetime = Field(default_factory=datetime.now)


class AutoTradingEngine:
    """
    Automated trading engine.
    
    Handles signal processing, position sizing, order generation,
    and execution management.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        
        # Trading parameters
        self.max_position_size = self.config.get("max_position_size", 0.1)  # 10% of portfolio
        self.max_total_positions = self.config.get("max_total_positions", 20)
        self.min_signal_strength = self.config.get("min_signal_strength", 0.6)
        
        # Portfolio state
        self.capital = self.config.get("initial_capital", 100000.0)
        self.positions: Dict[str, Position] = {}
        self.orders: Dict[str, Order] = {}
        self.trade_history: List[Dict] = []
        
        # Order ID counter
        self._order_counter = 0
    
    def process_signal(
        self,
        signal: TradeSignal,
        current_price: float
    ) -> Optional[Order]:
        """
        Process a trading signal and generate an order.
        
        Args:
            signal: Trading signal
            current_price: Current market price
            
        Returns:
            Generated order or None if signal is filtered
        """
        try:
            # Validate signal strength
            if signal.strength < self.min_signal_strength:
                logger.debug(f"Signal strength {signal.strength} below threshold")
                return None
            
            # Check position limits
            if not self._check_position_limits(signal.symbol, signal.action):
                logger.warning(f"Position limits exceeded for {signal.symbol}")
                return None
            
            # Calculate position size
            quantity = self._calculate_position_size(
                signal.symbol,
                current_price,
                signal.strength
            )
            
            if quantity <= 0:
                return None
            
            # Generate order
            order = self._create_order(
                symbol=signal.symbol,
                side=signal.action,
                quantity=quantity,
                price=current_price,
                stop_loss=signal.stop_loss,
                take_profit=signal.take_profit
            )
            
            logger.info(f"Generated order: {order}")
            return order
            
        except Exception as e:
            logger.error(f"Error processing signal: {e}")
            return None
    
    def execute_order(
        self,
        order: Order,
        execution_price: float
    ) -> Order:
        """
        Execute an order at the given price.
        
        Args:
            order: Order to execute
            execution_price: Price at which to execute
            
        Returns:
            Updated order
        """
        try:
            # Update order status
            order.status = OrderStatus.FILLED
            order.filled_quantity = order.quantity
            order.filled_price = execution_price
            order.updated_at = datetime.now()
            
            # Update position
            self._update_position(
                symbol=order.symbol,
                side=order.side,
                quantity=order.quantity,
                price=execution_price
            )
            
            # Record trade
            self.trade_history.append({
                "order_id": order.order_id,
                "symbol": order.symbol,
                "side": order.side.value,
                "quantity": order.quantity,
                "price": execution_price,
                "timestamp": datetime.now().isoformat()
            })
            
            logger.info(f"Order executed: {order.order_id} @ {execution_price}")
            return order
            
        except Exception as e:
            logger.error(f"Error executing order: {e}")
            order.status = OrderStatus.REJECTED
            return order
    
    def cancel_order(self, order_id: str) -> bool:
        """Cancel an order."""
        if order_id in self.orders:
            self.orders[order_id].status = OrderStatus.CANCELLED
            self.orders[order_id].updated_at = datetime.now()
            logger.info(f"Order cancelled: {order_id}")
            return True
        return False
    
    def get_position(self, symbol: str) -> Optional[Position]:
        """Get position for a symbol."""
        return self.positions.get(symbol)
    
    def get_all_positions(self) -> List[Position]:
        """Get all positions."""
        return list(self.positions.values())
    
    def get_portfolio_value(self) -> float:
        """Calculate total portfolio value."""
        position_value = sum(
            pos.quantity * pos.current_price 
            for pos in self.positions.values()
        )
        return self.capital + position_value
    
    def get_unrealized_pnl(self) -> float:
        """Calculate total unrealized P&L."""
        return sum(pos.unrealized_pnl for pos in self.positions.values())
    
    def update_market_prices(self, prices: Dict[str, float]):
        """Update current prices for all positions."""
        for symbol, price in prices.items():
            if symbol in self.positions:
                pos = self.positions[symbol]
                pos.current_price = price
                pos.unrealized_pnl = (price - pos.avg_price) * pos.quantity
                pos.updated_at = datetime.now()
    
    def _check_position_limits(
        self,
        symbol: str,
        action: OrderSide
    ) -> bool:
        """Check if position limits allow the trade."""
        if action == OrderSide.BUY:
            # Check if already at max positions
            if (len(self.positions) >= self.max_total_positions and 
                symbol not in self.positions):
                return False
            
            # Check if position size would exceed limit
            if symbol in self.positions:
                current_value = (
                    self.positions[symbol].quantity * 
                    self.positions[symbol].current_price
                )
                portfolio_value = self.get_portfolio_value()
                if current_value / portfolio_value > self.max_position_size:
                    return False
        
        elif action == OrderSide.SELL:
            # Check if we have position to sell
            if symbol not in self.positions:
                return False
        
        return True
    
    def _calculate_position_size(
        self,
        symbol: str,
        price: float,
        signal_strength: float
    ) -> int:
        """Calculate position size based on signal strength and limits."""
        # Base position size
        portfolio_value = self.get_portfolio_value()
        max_value = portfolio_value * self.max_position_size
        
        # Adjust by signal strength
        target_value = max_value * signal_strength
        
        # Calculate shares (round to lot size of 100 for A-shares)
        shares = int(target_value / price)
        shares = (shares // 100) * 100  # Round to lots
        
        # Adjust for existing position
        if symbol in self.positions:
            current_shares = self.positions[symbol].quantity
            shares = max(0, shares - current_shares)
        
        return max(0, shares)
    
    def _create_order(
        self,
        symbol: str,
        side: OrderSide,
        quantity: int,
        price: float,
        stop_loss: Optional[float] = None,
        take_profit: Optional[float] = None
    ) -> Order:
        """Create a new order."""
        self._order_counter += 1
        order_id = f"ORD{self._order_counter:06d}"
        
        order = Order(
            order_id=order_id,
            symbol=symbol,
            side=side,
            order_type=OrderType.MARKET,
            quantity=quantity,
            price=price,
            metadata={
                "stop_loss": stop_loss,
                "take_profit": take_profit
            }
        )
        
        self.orders[order_id] = order
        return order
    
    def _update_position(
        self,
        symbol: str,
        side: OrderSide,
        quantity: int,
        price: float
    ):
        """Update position after order execution."""
        if symbol not in self.positions:
            if side == OrderSide.BUY:
                self.positions[symbol] = Position(
                    symbol=symbol,
                    quantity=quantity,
                    avg_price=price,
                    current_price=price,
                    opened_at=datetime.now()
                )
        else:
            pos = self.positions[symbol]
            
            if side == OrderSide.BUY:
                # Average in
                total_cost = pos.avg_price * pos.quantity + price * quantity
                pos.quantity += quantity
                pos.avg_price = total_cost / pos.quantity
            else:
                # Sell
                realized = (price - pos.avg_price) * quantity
                pos.realized_pnl += realized
                pos.quantity -= quantity
                
                # Remove position if fully closed
                if pos.quantity <= 0:
                    del self.positions[symbol]
                    return
            
            pos.current_price = price
            pos.unrealized_pnl = (price - pos.avg_price) * pos.quantity
            pos.updated_at = datetime.now()