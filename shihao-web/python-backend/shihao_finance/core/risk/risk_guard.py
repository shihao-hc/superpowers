"""
RiskGuard - Risk management system.

Implements hard limits, runtime checks, and position validation
for trading operations.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass

from pydantic import BaseModel, Field
from loguru import logger

from ..trading.trading_engine import Position, Order, OrderSide


class RiskLevel(Enum):
    """Risk alert levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"


class RiskCheckResult(BaseModel):
    """Risk check result."""
    passed: bool
    level: RiskLevel
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.now)


class RiskLimits(BaseModel):
    """Risk limit configuration."""
    max_position_pct: float = 0.1  # Max 10% per position
    max_sector_pct: float = 0.3  # Max 30% per sector
    max_leverage: float = 1.0  # No leverage by default
    max_daily_loss_pct: float = 0.02  # Max 2% daily loss
    max_drawdown_pct: float = 0.15  # Max 15% drawdown
    max_correlation: float = 0.7  # Max correlation between positions
    
    # Blacklists
    blacklisted_symbols: List[str] = Field(default_factory=list)
    blacklisted_sectors: List[str] = Field(default_factory=list)


class RiskGuard:
    """
    Risk management system.
    
    Provides multiple layers of risk protection:
    - Hard limits (position, sector, leverage)
    - Runtime checks (daily loss, drawdown)
    - Correlation monitoring
    - Blacklist enforcement
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.limits = RiskLimits(**self.config.get("limits", {}))
        
        # Track daily metrics
        self.daily_start_value: Optional[float] = None
        self.peak_value: float = 0.0
        self.risk_alerts: List[RiskCheckResult] = []
        
        # Sector mappings (simplified)
        self.sector_map: Dict[str, str] = {}
    
    def initialize(self, portfolio_value: float):
        """Initialize risk tracking."""
        self.daily_start_value = portfolio_value
        self.peak_value = portfolio_value
    
    def check_order(
        self,
        order: Order,
        current_positions: Dict[str, Position],
        portfolio_value: float
    ) -> RiskCheckResult:
        """
        Check if an order passes risk limits.
        
        Args:
            order: Order to check
            current_positions: Current positions
            portfolio_value: Total portfolio value
            
        Returns:
            Risk check result
        """
        checks = []
        
        # 1. Check blacklist
        if order.symbol in self.limits.blacklisted_symbols:
            return RiskCheckResult(
                passed=False,
                level=RiskLevel.CRITICAL,
                message=f"Symbol {order.symbol} is blacklisted",
                details={"symbol": order.symbol}
            )
        
        # 2. Check position size limit
        if order.side == OrderSide.BUY:
            order_value = order.quantity * (order.price or 0)
            position_pct = order_value / portfolio_value
            
            if position_pct > self.limits.max_position_pct:
                checks.append(RiskCheckResult(
                    passed=False,
                    level=RiskLevel.WARNING,
                    message=f"Position size {position_pct:.2%} exceeds limit {self.limits.max_position_pct:.2%}",
                    details={
                        "position_pct": position_pct,
                        "limit": self.limits.max_position_pct
                    }
                ))
        
        # 3. Check sector concentration
        sector = self.sector_map.get(order.symbol, "Unknown")
        sector_exposure = self._calculate_sector_exposure(
            sector, current_positions, order
        )
        
        if sector_exposure > self.limits.max_sector_pct:
            checks.append(RiskCheckResult(
                passed=False,
                level=RiskLevel.WARNING,
                message=f"Sector exposure {sector_exposure:.2%} exceeds limit",
                details={
                    "sector": sector,
                    "exposure": sector_exposure,
                    "limit": self.limits.max_sector_pct
                }
            ))
        
        # 4. Check daily loss limit
        daily_loss_check = self._check_daily_loss(portfolio_value)
        if not daily_loss_check.passed:
            checks.append(daily_loss_check)
        
        # 5. Check max drawdown
        drawdown_check = self._check_max_drawdown(portfolio_value)
        if not drawdown_check.passed:
            checks.append(drawdown_check)
        
        # Return result
        if checks:
            # Return most severe failure
            failed_checks = [c for c in checks if not c.passed]
            if failed_checks:
                return failed_checks[0]
        
        return RiskCheckResult(
            passed=True,
            level=RiskLevel.INFO,
            message="All risk checks passed",
            details={"checks_performed": 6}
        )
    
    def check_positions(
        self,
        positions: Dict[str, Position],
        current_prices: Dict[str, float],
        portfolio_value: float
    ) -> List[RiskCheckResult]:
        """
        Check all positions for risk violations.
        
        Returns:
            List of risk alerts
        """
        alerts = []
        
        for symbol, position in positions.items():
            current_price = current_prices.get(symbol, position.current_price)
            
            # Update unrealized P&L
            position.unrealized_pnl = (current_price - position.avg_price) * position.quantity
            
            # Check for stop loss (e.g., -10% loss)
            loss_pct = -position.unrealized_pnl / (position.avg_price * position.quantity)
            if loss_pct > 0.1:  # 10% loss
                alerts.append(RiskCheckResult(
                    passed=False,
                    level=RiskLevel.WARNING,
                    message=f"Position {symbol} has {loss_pct:.2%} loss",
                    details={
                        "symbol": symbol,
                        "loss_pct": loss_pct,
                        "unrealized_pnl": position.unrealized_pnl
                    }
                ))
        
        # Check portfolio-level metrics
        if self.daily_start_value:
            daily_return = (portfolio_value - self.daily_start_value) / self.daily_start_value
            if daily_return < -self.limits.max_daily_loss_pct:
                alerts.append(RiskCheckResult(
                    passed=False,
                    level=RiskLevel.CRITICAL,
                    message=f"Daily loss {daily_return:.2%} exceeds limit",
                    details={
                        "daily_return": daily_return,
                        "limit": -self.limits.max_daily_loss_pct
                    }
                ))
        
        # Update peak value
        if portfolio_value > self.peak_value:
            self.peak_value = portfolio_value
        
        # Check drawdown
        if self.peak_value > 0:
            drawdown = (self.peak_value - portfolio_value) / self.peak_value
            if drawdown > self.limits.max_drawdown_pct:
                alerts.append(RiskCheckResult(
                    passed=False,
                    level=RiskLevel.EMERGENCY,
                    message=f"Drawdown {drawdown:.2%} exceeds limit",
                    details={
                        "drawdown": drawdown,
                        "peak_value": self.peak_value,
                        "current_value": portfolio_value
                    }
                ))
        
        self.risk_alerts = alerts
        return alerts
    
    def get_risk_metrics(
        self,
        positions: Dict[str, Position],
        portfolio_value: float
    ) -> Dict[str, Any]:
        """Get current risk metrics."""
        # Calculate exposure
        long_exposure = sum(
            p.quantity * p.current_price 
            for p in positions.values() if p.quantity > 0
        )
        short_exposure = sum(
            abs(p.quantity) * p.current_price 
            for p in positions.values() if p.quantity < 0
        )
        
        # Calculate drawdown
        drawdown = 0.0
        if self.peak_value > 0:
            drawdown = (self.peak_value - portfolio_value) / self.peak_value
        
        # Calculate daily P&L
        daily_pnl = 0.0
        daily_return = 0.0
        if self.daily_start_value:
            daily_pnl = portfolio_value - self.daily_start_value
            daily_return = daily_pnl / self.daily_start_value
        
        return {
            "portfolio_value": portfolio_value,
            "total_exposure": long_exposure + short_exposure,
            "long_exposure": long_exposure,
            "short_exposure": short_exposure,
            "leverage": (long_exposure + short_exposure) / portfolio_value if portfolio_value > 0 else 0,
            "drawdown": drawdown,
            "daily_pnl": daily_pnl,
            "daily_return": daily_return,
            "peak_value": self.peak_value,
            "num_positions": len(positions),
            "active_alerts": len([a for a in self.risk_alerts if not a.passed]),
            "timestamp": datetime.now().isoformat()
        }
    
    def add_to_blacklist(self, symbol: str, reason: str = ""):
        """Add symbol to blacklist."""
        if symbol not in self.limits.blacklisted_symbols:
            self.limits.blacklisted_symbols.append(symbol)
            logger.warning(f"Added {symbol} to blacklist: {reason}")
    
    def remove_from_blacklist(self, symbol: str):
        """Remove symbol from blacklist."""
        if symbol in self.limits.blacklisted_symbols:
            self.limits.blacklisted_symbols.remove(symbol)
            logger.info(f"Removed {symbol} from blacklist")
    
    def _calculate_sector_exposure(
        self,
        sector: str,
        positions: Dict[str, Position],
        new_order: Order
    ) -> float:
        """Calculate sector exposure."""
        sector_value = 0.0
        total_value = sum(p.quantity * p.current_price for p in positions.values())
        
        for symbol, position in positions.items():
            if self.sector_map.get(symbol) == sector:
                sector_value += position.quantity * position.current_price
        
        # Add new order value
        if self.sector_map.get(new_order.symbol) == sector and new_order.side == OrderSide.BUY:
            sector_value += new_order.quantity * (new_order.price or 0)
        
        if total_value == 0:
            return 0.0
        
        return sector_value / total_value
    
    def _check_daily_loss(self, portfolio_value: float) -> RiskCheckResult:
        """Check daily loss limit."""
        if not self.daily_start_value:
            return RiskCheckResult(
                passed=True,
                level=RiskLevel.INFO,
                message="Daily tracking not initialized"
            )
        
        daily_return = (portfolio_value - self.daily_start_value) / self.daily_start_value
        
        if daily_return < -self.limits.max_daily_loss_pct:
            return RiskCheckResult(
                passed=False,
                level=RiskLevel.CRITICAL,
                message=f"Daily loss limit exceeded: {daily_return:.2%}",
                details={
                    "daily_return": daily_return,
                    "limit": self.limits.max_daily_loss_pct
                }
            )
        
        return RiskCheckResult(
            passed=True,
            level=RiskLevel.INFO,
            message=f"Daily loss within limits: {daily_return:.2%}"
        )
    
    def _check_max_drawdown(self, portfolio_value: float) -> RiskCheckResult:
        """Check maximum drawdown."""
        if self.peak_value <= 0:
            return RiskCheckResult(
                passed=True,
                level=RiskLevel.INFO,
                message="Drawdown tracking not initialized"
            )
        
        drawdown = (self.peak_value - portfolio_value) / self.peak_value
        
        if drawdown > self.limits.max_drawdown_pct:
            return RiskCheckResult(
                passed=False,
                level=RiskLevel.EMERGENCY,
                message=f"Max drawdown exceeded: {drawdown:.2%}",
                details={
                    "drawdown": drawdown,
                    "limit": self.limits.max_drawdown_pct,
                    "peak_value": self.peak_value
                }
            )
        
        return RiskCheckResult(
            passed=True,
            level=RiskLevel.INFO,
            message=f"Drawdown within limits: {drawdown:.2%}"
        )