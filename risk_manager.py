"""
Risk Manager Module: Independent risk management and control.
- Hard limits: max daily loss, single position limit, leverage limit, blacklist
- Runtime checks: order frequency, position consistency
- Global kill switch
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


class RiskLevel(Enum):
    """Risk level classification."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class KillSwitchStatus(Enum):
    """Kill switch status."""
    ACTIVE = "active"
    TRIGGERED = "triggered"
    MANUAL = "manual"
    RECOVERING = "recovering"


@dataclass
class RiskLimit:
    """Risk limit configuration."""
    name: str
    limit_value: float
    limit_type: str  # "daily_loss", "position_pct", "leverage", "orders_per_minute"
    enabled: bool = True


@dataclass
class RiskEvent:
    """Risk event record."""
    timestamp: str
    event_type: str
    severity: str
    description: str
    action_taken: str
    metadata: Dict = field(default_factory=dict)


@dataclass
class RiskReport:
    """Risk status report."""
    timestamp: str
    risk_level: RiskLevel
    daily_pnl: float
    daily_pnl_pct: float
    max_position_pct: float
    leverage: float
    orders_last_minute: int
    active_alerts: List[str] = field(default_factory=list)
    recent_events: List[RiskEvent] = field(default_factory=list)


@dataclass
class VolatilityConfig:
    """Volatility-based position sizing configuration."""
    use_atr_sizing: bool = True
    atr_period: int = 14
    risk_per_trade_pct: float = 0.01  # 1% risk per trade
    max_position_multiplier: float = 2.0  # Max multiplier for low volatility
    min_position_multiplier: float = 0.5  # Min multiplier for high volatility
    volatility_lookback: int = 20  # Days for volatility calculation
    # Thresholds for position multiplier
    low_vol_threshold: float = 0.015  # 1.5% daily volatility = low
    high_vol_threshold: float = 0.04  # 4% daily volatility = high


@dataclass
class DynamicRiskParams:
    """Dynamic risk parameters based on market conditions."""
    base_position_pct: float = 0.10
    adjusted_position_pct: float = 0.10
    market_regime: str = "normal"  # "bull", "bear", "volatile", "normal"
    volatility_multiplier: float = 1.0
    confidence_adjustment: float = 1.0
    last_updated: str = ""


class RiskManager:
    """
    Independent risk manager with hard limits, runtime checks, and kill switch.
    Now includes dynamic risk management based on volatility.
    """

    def __init__(
        self,
        initial_capital: float = 1000000.0,
        max_daily_loss_pct: float = 0.02,  # 2%
        max_position_pct: float = 0.10,     # 10% per position
        max_leverage: float = 1.0,           # No leverage by default
        max_orders_per_minute: int = 60,
        volatility_config: Optional[VolatilityConfig] = None,
    ):
        self.initial_capital = initial_capital
        self.max_daily_loss_pct = max_daily_loss_pct
        self.max_position_pct = max_position_pct
        self.max_leverage = max_leverage
        self.max_orders_per_minute = max_orders_per_minute

        # Volatility-based position sizing
        self.volatility_config = volatility_config or VolatilityConfig()
        self.dynamic_params = DynamicRiskParams(
            base_position_pct=max_position_pct,
            adjusted_position_pct=max_position_pct,
            last_updated=datetime.now().isoformat()
        )

        # Historical volatility tracking
        self.price_history: Dict[str, List[float]] = {}

        # State tracking
        self.daily_pnl = 0.0
        self.daily_start_value = initial_capital
        self.order_times: List[str] = []
        self.blacklist: set = set()
        self.position_limits: Dict[str, float] = {}

        # Kill switch
        self.kill_switch_status = KillSwitchStatus.ACTIVE
        self.kill_switch_reason: str = ""
        self._kill_switch_lock = threading.Lock()

        # Risk events
        self.risk_events: List[RiskEvent] = []
        self.alert_callbacks: List[Callable] = []

        # Risk limits
        self.limits = [
            RiskLimit("max_daily_loss", max_daily_loss_pct, "daily_loss"),
            RiskLimit("max_position", max_position_pct, "position_pct"),
            RiskLimit("max_leverage", max_leverage, "leverage"),
            RiskLimit("max_orders", max_orders_per_minute, "orders_per_minute"),
        ]

    def check_order(
        self,
        ticker: str,
        side: str,
        quantity: int,
        price: float,
        current_positions: Dict[str, Dict],
        total_portfolio_value: float
    ) -> Dict:
        """
        Check if order passes risk controls.
        
        Returns: {"approved": bool, "reason": str, "adjustments": dict}
        """
        # Check kill switch
        if self.kill_switch_status != KillSwitchStatus.ACTIVE:
            return {
                "approved": False,
                "reason": f"Kill switch active: {self.kill_switch_status.value}",
                "adjustments": {}
            }

        # Check blacklist
        if ticker in self.blacklist:
            self._log_event("blacklist", "critical", f"Ticker {ticker} in blacklist", "rejected")
            return {
                "approved": False,
                "reason": f"Ticker {ticker} is in blacklist",
                "adjustments": {}
            }

        # Check daily loss limit
        if self.daily_pnl < -self.initial_capital * self.max_daily_loss_pct:
            self._trigger_kill_switch("daily_loss_limit", f"Daily loss {self.daily_pnl} exceeds limit")
            return {
                "approved": False,
                "reason": "Daily loss limit exceeded",
                "adjustments": {}
            }

        # Check position limit
        order_value = price * quantity
        position_pct = order_value / total_portfolio_value if total_portfolio_value > 0 else 0

        # Use dynamic position limit based on volatility
        effective_max_position = self.dynamic_params.adjusted_position_pct

        if position_pct > effective_max_position:
            adjusted_qty = int(total_portfolio_value * effective_max_position / price)
            self._log_event("position_limit", "medium", f"Reduced order from {quantity} to {adjusted_qty}", "adjusted")
            return {
                "approved": True,
                "reason": "Adjusted to dynamic position limit",
                "adjustments": {"quantity": adjusted_qty}
            }

        # Check existing position
        existing_position = current_positions.get(ticker, {}).get('quantity', 0)
        total_pct = (existing_position * price + order_value) / total_portfolio_value

        if total_pct > effective_max_position:
            return {
                "approved": False,
                "reason": f"Would exceed position limit ({total_pct:.1%} > {self.max_position_pct:.1%})",
                "adjustments": {}
            }

        # Check leverage
        if self.max_leverage < 1.0:
            total_exposure = sum(
                pos.get('quantity', 0) * pos.get('avg_price', 0)
                for pos in current_positions.values()
            )
            new_exposure = total_exposure + order_value

            if new_exposure > self.initial_capital * self.max_leverage:
                return {
                    "approved": False,
                    "reason": "Would exceed leverage limit",
                    "adjustments": {}
                }

        # Check order frequency
        current_minute = datetime.now().strftime("%Y-%m-%d %H:%M")
        recent_orders = [t for t in self.order_times if t.startswith(current_minute)]

        if len(recent_orders) >= self.max_orders_per_minute:
            return {
                "approved": False,
                "reason": f"Order frequency limit: {len(recent_orders)}/min",
                "adjustments": {}
            }

        return {"approved": True, "reason": "Approved", "adjustments": {}}

    def update_position(
        self,
        ticker: str,
        quantity: int,
        price: float,
        side: str
    ) -> None:
        """Update position after trade execution."""
        self.order_times.append(datetime.now().isoformat())

        # Keep only last 1000 orders for frequency check
        if len(self.order_times) > 1000:
            self.order_times = self.order_times[-1000:]

    def update_daily_pnl(self, pnl: float) -> None:
        """Update daily P&L."""
        self.daily_pnl = pnl

        # Check daily loss
        if pnl < -self.initial_capital * self.max_daily_loss_pct:
            self._trigger_kill_switch("daily_loss", f"Daily P&L {pnl} exceeds limit")

    def reset_daily(self, portfolio_value: float) -> None:
        """Reset daily counters for new trading day."""
        self.daily_pnl = 0.0
        self.daily_start_value = portfolio_value
        self.order_times = []

    def add_to_blacklist(self, ticker: str, reason: str = "") -> None:
        """Add ticker to blacklist."""
        self.blacklist.add(ticker)
        self._log_event("blacklist_add", "high", f"Added {ticker}: {reason}", "blacklisted")

    def remove_from_blacklist(self, ticker: str) -> None:
        """Remove ticker from blacklist."""
        if ticker in self.blacklist:
            self.blacklist.remove(ticker)
            self._log_event("blacklist_remove", "medium", f"Removed {ticker}", "removed")

    def set_position_limit(self, ticker: str, limit_pct: float) -> None:
        """Set individual position limit."""
        self.position_limits[ticker] = limit_pct

    def _trigger_kill_switch(self, reason: str, description: str) -> None:
        """Trigger the kill switch."""
        with self._kill_switch_lock:
            if self.kill_switch_status == KillSwitchStatus.ACTIVE:
                self.kill_switch_status = KillSwitchStatus.TRIGGERED
                self.kill_switch_reason = reason
                self._log_event("kill_switch", "critical", description, "triggered")
                self._notify_alerts("kill_switch", description)

    def trigger_manual_kill(self, reason: str) -> None:
        """Manually trigger kill switch."""
        with self._kill_switch_lock:
            self.kill_switch_status = KillSwitchStatus.MANUAL
            self.kill_switch_reason = reason
            self._log_event("kill_switch_manual", "critical", reason, "manual_trigger")
            self._notify_alerts("manual_kill", reason)

    def reset_kill_switch(self) -> None:
        """Reset kill switch to active."""
        with self._kill_switch_lock:
            self.kill_switch_status = KillSwitchStatus.RECOVERING
            # Reset after verification
            self.kill_switch_status = KillSwitchStatus.ACTIVE
            self._log_event("kill_switch_reset", "medium", "Kill switch reset", "reset")

    def _log_event(
        self,
        event_type: str,
        severity: str,
        description: str,
        action: str
    ) -> None:
        """Log a risk event."""
        event = RiskEvent(
            timestamp=datetime.now().isoformat(),
            event_type=event_type,
            severity=severity,
            description=description,
            action_taken=action
        )
        self.risk_events.append(event)

        # Keep last 1000 events
        if len(self.risk_events) > 1000:
            self.risk_events = self.risk_events[-1000:]

    def _notify_alerts(self, alert_type: str, message: str) -> None:
        """Notify alert callbacks."""
        for callback in self.alert_callbacks:
            try:
                callback(alert_type, message)
            except Exception as e:
                print(f"Alert callback error: {e}")

    def register_alert_callback(self, callback: Callable) -> None:
        """Register an alert callback."""
        self.alert_callbacks.append(callback)

    def get_risk_report(
        self,
        current_positions: Dict[str, Dict],
        total_value: float
    ) -> RiskReport:
        """Generate current risk report."""
        # Calculate risk metrics
        max_position_pct = 0.0
        for ticker, pos in current_positions.items():
            pos_value = pos.get('quantity', 0) * pos.get('avg_price', 0)
            pct = pos_value / total_value if total_value > 0 else 0
            max_position_pct = max(max_position_pct, pct)

        # Leverage
        total_exposure = sum(
            pos.get('quantity', 0) * pos.get('avg_price', 0)
            for pos in current_positions.values()
        )
        leverage = total_exposure / total_value if total_value > 0 else 0

        # Orders per minute
        current_minute = datetime.now().strftime("%Y-%m-%d %H:%M")
        orders_this_minute = sum(1 for t in self.order_times if t.startswith(current_minute))

        # Determine risk level
        risk_level = RiskLevel.LOW
        if self.daily_pnl < -self.initial_capital * self.max_daily_loss_pct * 0.5:
            risk_level = RiskLevel.MEDIUM
        if self.daily_pnl < -self.initial_capital * self.max_daily_loss_pct:
            risk_level = RiskLevel.HIGH
        if self.kill_switch_status != KillSwitchStatus.ACTIVE:
            risk_level = RiskLevel.CRITICAL

        return RiskReport(
            timestamp=datetime.now().isoformat(),
            risk_level=risk_level,
            daily_pnl=self.daily_pnl,
            daily_pnl_pct=self.daily_pnl / self.initial_capital,
            max_position_pct=max_position_pct,
            leverage=leverage,
            orders_last_minute=orders_this_minute,
            active_alerts=self._get_active_alerts(),
            recent_events=self.risk_events[-10:]
        )

    def _get_active_alerts(self) -> List[str]:
        """Get list of active alerts."""
        alerts = []
        if self.daily_pnl < 0:
            alerts.append(f"Daily loss: {self.daily_pnl:.2f}")
        if self.kill_switch_status != KillSwitchStatus.ACTIVE:
            alerts.append(f"Kill switch: {self.kill_switch_status.value}")
        return alerts

    def export_events(self, filepath: str) -> None:
        """Export risk events to JSON."""
        data = {
            "exported_at": datetime.now().isoformat(),
            "kill_switch_status": self.kill_switch_status.value,
            "kill_switch_reason": self.kill_switch_reason,
            "events": [
                {
                    "timestamp": e.timestamp,
                    "event_type": e.event_type,
                    "severity": e.severity,
                    "description": e.description,
                    "action_taken": e.action_taken
                }
                for e in self.risk_events
            ]
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)

    def update_price_history(self, ticker: str, price: float) -> None:
        """Update price history for volatility calculation."""
        if ticker not in self.price_history:
            self.price_history[ticker] = []
        self.price_history[ticker].append(price)
        max_history = self.volatility_config.volatility_lookback * 2
        if len(self.price_history[ticker]) > max_history:
            self.price_history[ticker] = self.price_history[ticker][-max_history:]

    def calculate_atr(self, ticker: str, high: float, low: float, close: float) -> Optional[float]:
        """Calculate Average True Range (ATR) for volatility-based sizing."""
        config = self.volatility_config
        if ticker not in self.price_history or len(self.price_history[ticker]) < config.atr_period:
            return None
        
        prices = self.price_history[ticker][-config.atr_period:]
        true_ranges = []
        for i in range(len(prices)):
            if i == 0:
                tr = high - low
            else:
                prev_close = prices[i-1]
                tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
            true_ranges.append(tr)
        
        return sum(true_ranges) / len(true_ranges) if true_ranges else None

    def calculate_volatility(self, ticker: str) -> Optional[float]:
        """Calculate historical volatility (daily returns std)."""
        config = self.volatility_config
        if ticker not in self.price_history or len(self.price_history[ticker]) < config.volatility_lookback:
            return None
        
        prices = self.price_history[ticker][-config.volatility_lookback:]
        returns = []
        for i in range(1, len(prices)):
            if prices[i-1] != 0:
                ret = (prices[i] - prices[i-1]) / prices[i-1]
                returns.append(ret)
        
        if len(returns) < 5:
            return None
        return np.std(returns)

    def calculate_position_multiplier(self, ticker: str) -> float:
        """Calculate position size multiplier based on volatility."""
        config = self.volatility_config
        volatility = self.calculate_volatility(ticker)
        
        if volatility is None:
            return 1.0
        
        if volatility < config.low_vol_threshold:
            return config.max_position_multiplier
        elif volatility > config.high_vol_threshold:
            return config.min_position_multiplier
        else:
            range_size = config.high_vol_threshold - config.low_vol_threshold
            normalized = (volatility - config.low_vol_threshold) / range_size
            return config.max_position_multiplier - normalized * (
                config.max_position_multiplier - config.min_position_multiplier
            )

    def update_dynamic_params(
        self,
        market_regime: str = "normal",
        confidence: float = 1.0
    ) -> DynamicRiskParams:
        """Update dynamic risk parameters based on market conditions."""
        self.dynamic_params.market_regime = market_regime
        self.dynamic_params.confidence_adjustment = confidence
        self.dynamic_params.last_updated = datetime.now().isoformat()
        
        base = self.max_position_pct
        
        regime_multipliers = {
            "bull": 1.2,
            "normal": 1.0,
            "volatile": 0.6,
            "bear": 0.4
        }
        regime_multiplier = regime_multipliers.get(market_regime, 1.0)
        
        self.dynamic_params.volatility_multiplier = regime_multiplier * confidence
        self.dynamic_params.adjusted_position_pct = base * self.dynamic_params.volatility_multiplier
        
        return self.dynamic_params

    def get_adjusted_position_size(
        self,
        ticker: str,
        base_quantity: int,
        portfolio_value: float
    ) -> Dict:
        """Get volatility-adjusted position size."""
        config = self.volatility_config
        
        if not config.use_atr_sizing:
            return {"quantity": base_quantity, "multiplier": 1.0, "reason": "disabled"}
        
        vol_multiplier = self.calculate_position_multiplier(ticker)
        adjusted_pct = self.dynamic_params.base_position_pct * vol_multiplier
        
        adjusted_value = portfolio_value * adjusted_pct
        adjusted_quantity = int(adjusted_value / (base_quantity * 0.001))
        
        if adjusted_quantity == 0:
            adjusted_quantity = 1
        
        return {
            "quantity": min(adjusted_quantity, base_quantity),
            "multiplier": vol_multiplier,
            "adjusted_pct": adjusted_pct,
            "reason": f"volatility_multiplier={vol_multiplier:.2f}"
        }

    def get_dynamic_params(self) -> DynamicRiskParams:
        """Get current dynamic risk parameters."""
        return self.dynamic_params


def console_alert_callback(alert_type: str, message: str) -> None:
    """Console alert callback."""
    print(f"\n{'='*50}")
    print(f"🚨 RISK ALERT: {alert_type}")
    print(f"   {message}")
    print(f"{'='*50}\n")


def demo_risk_manager():
    """Demo risk manager."""
    rm = RiskManager(
        initial_capital=1000000,
        max_daily_loss_pct=0.02,
        max_position_pct=0.10
    )

    # Register alert
    rm.register_alert_callback(console_alert_callback)

    # Test order approval
    positions = {"AAPL": {"quantity": 1000, "avg_price": 150}}
    result = rm.check_order("MSFT", "buy", 1000, 300, positions, 1000000)
    print(f"Order check: {result}")

    # Test blacklist
    rm.add_to_blacklist("GME", "High volatility")
    result = rm.check_order("GME", "buy", 100, 50, positions, 1000000)
    print(f"Blacklist check: {result}")

    # Test daily loss trigger
    rm.update_daily_pnl(-25000)
    report = rm.get_risk_report(positions, 1000000)
    print(f"\nRisk Report:")
    print(f"  Level: {report.risk_level.value}")
    print(f"  Daily P&L: ${report.daily_pnl:.2f}")
    print(f"  Active Alerts: {report.active_alerts}")


class RiskGuard:
    """
    Risk Guard - Integration layer between execution and risk management.
    Wraps execution module to provide automatic risk checking.
    """

    def __init__(self, risk_manager: RiskManager):
        self.risk_manager = risk_manager

    def pre_trade_check(
        self,
        ticker: str,
        side: str,
        quantity: int,
        price: float,
        current_positions: Dict[str, Dict],
        portfolio_value: float
    ) -> Dict:
        """
        Pre-trade risk check.
        
        Returns: {"approved": bool, "order": dict or None, "reason": str}
        """
        # Get risk manager approval
        check_result = self.risk_manager.check_order(
            ticker, side, quantity, price, current_positions, portfolio_value
        )

        if not check_result["approved"]:
            return {
                "approved": False,
                "order": None,
                "reason": check_result["reason"],
                "risk_triggered": True
            }

        # Return approved order with adjustments
        adjusted_qty = check_result["adjustments"].get("quantity", quantity)
        return {
            "approved": True,
            "order": {
                "ticker": ticker,
                "side": side,
                "quantity": adjusted_qty,
                "price": price
            },
            "reason": check_result["reason"],
            "risk_triggered": False
        }

    def post_trade_update(
        self,
        ticker: str,
        quantity: int,
        price: float,
        side: str
    ) -> None:
        """Update risk manager after trade execution."""
        self.risk_manager.update_position(ticker, quantity, price, side)

    def update_portfolio_value(self, pnl: float) -> None:
        """Update daily P&L."""
        self.risk_manager.update_daily_pnl(pnl)

    def get_risk_status(self, positions: Dict[str, Dict]) -> RiskReport:
        """Get current risk status."""
        total_value = sum(
            pos.get('quantity', 0) * pos.get('avg_price', 0)
            for pos in positions.values()
        )
        return self.risk_manager.get_risk_report(positions, total_value)

    def emergency_stop(self, reason: str = "Manual emergency stop") -> None:
        """Trigger emergency stop."""
        self.risk_manager.trigger_manual_kill(reason)

    def resume_trading(self) -> bool:
        """Resume trading after stop."""
        if self.risk_manager.kill_switch_status in [
            KillSwitchStatus.TRIGGERED,
            KillSwitchStatus.MANUAL
        ]:
            self.risk_manager.reset_kill_switch()
            return True
        return False


def demo_risk_guard():
    """Demo Risk Guard integration."""
    rm = RiskManager(initial_capital=1000000)
    guard = RiskGuard(rm)

    # Simulate portfolio
    positions = {"AAPL": {"quantity": 1000, "avg_price": 150}}
    portfolio_value = 1000000

    # Pre-trade check
    result = guard.pre_trade_check("MSFT", "buy", 500, 300, positions, portfolio_value)
    print(f"Pre-trade check: {result['approved']}")
    if result['approved']:
        print(f"  Approved order: {result['order']}")

    # Post-trade update
    guard.post_trade_update("MSFT", 500, 300, "buy")

    # Get risk status
    status = guard.get_risk_status(positions)
    print(f"\nRisk Status: {status.risk_level.value}")
    print(f"  Daily P&L: ${status.daily_pnl:.2f}")


if __name__ == "__main__":
    demo_risk_guard()
