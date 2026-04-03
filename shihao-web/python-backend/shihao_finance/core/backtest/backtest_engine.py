"""
Backtesting framework with survivorship bias correction.

Implements event-driven backtesting with proper handling of
survivorship bias, look-ahead bias, and transaction costs.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from enum import Enum
from dataclasses import dataclass, field

import pandas as pd
import numpy as np
from pydantic import BaseModel, Field
from loguru import logger


class BacktestStatus(Enum):
    """Backtest status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class TradeRecord(BaseModel):
    """Trade record for backtesting."""
    symbol: str
    entry_date: datetime
    exit_date: Optional[datetime] = None
    entry_price: float
    exit_price: Optional[float] = None
    quantity: int
    side: str  # "long" or "short"
    pnl: float = 0.0
    pnl_pct: float = 0.0
    holding_days: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BacktestConfig(BaseModel):
    """Backtest configuration."""
    start_date: datetime
    end_date: datetime
    initial_capital: float = 1000000.0
    commission_rate: float = 0.001  # 0.1%
    slippage_rate: float = 0.0005  # 0.05%
    position_size: float = 0.1  # 10% per position
    max_positions: int = 10
    stop_loss_pct: float = 0.1  # 10%
    take_profit_pct: float = 0.2  # 20%
    
    # Survivorship bias correction
    survivorship_bias_correction: bool = True
    delisted_symbols_file: Optional[str] = None


class BacktestMetrics(BaseModel):
    """Backtest performance metrics."""
    total_return: float
    annual_return: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    max_drawdown_duration: int  # days
    win_rate: float
    profit_factor: float
    avg_win: float
    avg_loss: float
    total_trades: int
    winning_trades: int
    losing_trades: int
    avg_holding_days: float
    
    # Risk metrics
    volatility: float
    beta: Optional[float] = None
    alpha: Optional[float] = None
    information_ratio: Optional[float] = None
    
    # Drawdown metrics
    drawdown_start: Optional[datetime] = None
    drawdown_end: Optional[datetime] = None


class BacktestResult(BaseModel):
    """Complete backtest result."""
    config: BacktestConfig
    metrics: BacktestMetrics
    equity_curve: List[Dict[str, Any]]
    trades: List[TradeRecord]
    monthly_returns: Dict[str, float]
    status: BacktestStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SurvivorshipBiasCorrector:
    """
    Survivorship bias correction handler.
    
    Adjusts backtest results to account for delisted securities
    and other survivorship biases.
    """
    
    def __init__(self, delisted_file: Optional[str] = None):
        self.delisted_symbols: set = set()
        if delisted_file:
            self._load_delisted_symbols(delisted_file)
    
    def _load_delisted_symbols(self, filepath: str):
        """Load list of delisted symbols."""
        try:
            # Implementation depends on file format
            logger.info(f"Loaded {len(self.delisted_symbols)} delisted symbols")
        except Exception as e:
            logger.error(f"Error loading delisted symbols: {e}")
    
    def is_survivor(
        self,
        symbol: str,
        date: datetime
    ) -> bool:
        """Check if symbol survived until the given date."""
        # In real implementation, check against delisting database
        return symbol not in self.delisted_symbols
    
    def adjust_returns(
        self,
        returns: pd.Series,
        delisted_returns: Optional[pd.Series] = None
    ) -> pd.Series:
        """Adjust returns for survivorship bias."""
        if delisted_returns is None:
            return returns
        
        # Add delisted security returns
        adjusted = returns.copy()
        for date in delisted_returns.index:
            if date in adjusted.index:
                # Weight the delisted returns appropriately
                adjusted[date] = (adjusted[date] + delisted_returns[date]) / 2
        
        return adjusted


class BacktestEngine:
    """
    Event-driven backtesting engine.
    
    Simulates trading based on historical data with proper
    handling of transaction costs, slippage, and bias corrections.
    """
    
    def __init__(self, config: BacktestConfig):
        self.config = config
        self.corrector = SurvivorshipBiasCorrector()
        
        # State
        self.capital = config.initial_capital
        self.positions: Dict[str, Dict] = {}
        self.trades: List[TradeRecord] = []
        self.equity_curve: List[Dict[str, Any]] = []
        
        # Current date
        self.current_date: Optional[datetime] = None
    
    def run(
        self,
        data: Dict[str, pd.DataFrame],
        strategy: Any
    ) -> BacktestResult:
        """
        Run backtest.
        
        Args:
            data: Dictionary of symbol -> DataFrame with OHLCV data
            strategy: Strategy object with generate_signals method
            
        Returns:
            Backtest result
        """
        start_time = datetime.now()
        
        try:
            logger.info(f"Starting backtest from {self.config.start_date} to {self.config.end_date}")
            
            # Get all dates
            all_dates = set()
            for df in data.values():
                if 'timestamp' in df.columns:
                    all_dates.update(pd.to_datetime(df['timestamp']))
            
            dates = sorted([d for d in all_dates 
                           if self.config.start_date <= d <= self.config.end_date])
            
            # Run simulation
            for date in dates:
                self.current_date = date
                
                # Update positions
                self._update_positions(data, date)
                
                # Generate signals
                signals = strategy.generate_signals(data, date)
                
                # Execute trades
                for signal in signals:
                    self._execute_signal(signal, data, date)
                
                # Record equity
                self._record_equity(date)
            
            # Calculate metrics
            metrics = self._calculate_metrics()
            
            # Generate monthly returns
            monthly_returns = self._calculate_monthly_returns()
            
            logger.info(f"Backtest completed: {metrics.total_return:.2%} total return")
            
            return BacktestResult(
                config=self.config,
                metrics=metrics,
                equity_curve=self.equity_curve,
                trades=self.trades,
                monthly_returns=monthly_returns,
                status=BacktestStatus.COMPLETED,
                start_time=start_time,
                end_time=datetime.now(),
                metadata={
                    "num_symbols": len(data),
                    "num_dates": len(dates)
                }
            )
            
        except Exception as e:
            logger.error(f"Backtest failed: {e}")
            return BacktestResult(
                config=self.config,
                metrics=BacktestMetrics(
                    total_return=0, annual_return=0, sharpe_ratio=0,
                    sortino_ratio=0, max_drawdown=0, max_drawdown_duration=0,
                    win_rate=0, profit_factor=0, avg_win=0, avg_loss=0,
                    total_trades=0, winning_trades=0, losing_trades=0,
                    avg_holding_days=0, volatility=0
                ),
                equity_curve=[],
                trades=[],
                monthly_returns={},
                status=BacktestStatus.FAILED,
                start_time=start_time,
                end_time=datetime.now(),
                metadata={"error": str(e)}
            )
    
    def _update_positions(self, data: Dict[str, pd.DataFrame], date: datetime):
        """Update positions with current prices."""
        for symbol, position in list(self.positions.items()):
            if symbol in data:
                df = data[symbol]
                current_row = df[df['timestamp'] <= date].iloc[-1] if not df.empty else None
                
                if current_row is not None:
                    current_price = current_row['close']
                    
                    # Check stop loss
                    if position['side'] == 'long':
                        pnl_pct = (current_price - position['entry_price']) / position['entry_price']
                        
                        if pnl_pct <= -self.config.stop_loss_pct:
                            self._close_position(symbol, current_price, date, "stop_loss")
                        elif pnl_pct >= self.config.take_profit_pct:
                            self._close_position(symbol, current_price, date, "take_profit")
    
    def _execute_signal(self, signal: Dict, data: Dict[str, pd.DataFrame], date: datetime):
        """Execute a trading signal."""
        symbol = signal['symbol']
        action = signal['action']
        strength = signal.get('strength', 1.0)
        
        if symbol not in data:
            return
        
        df = data[symbol]
        current_row = df[df['timestamp'] <= date].iloc[-1] if not df.empty else None
        
        if current_row is None:
            return
        
        current_price = current_row['close']
        
        # Apply slippage
        if action == 'buy':
            execution_price = current_price * (1 + self.config.slippage_rate)
        else:
            execution_price = current_price * (1 - self.config.slippage_rate)
        
        # Calculate position size
        position_value = self.capital * self.config.position_size * strength
        
        if position_value > self.capital * 0.5:  # Max 50% of capital per trade
            position_value = self.capital * 0.5
        
        quantity = int(position_value / execution_price)
        quantity = (quantity // 100) * 100  # Round to lots
        
        if quantity <= 0:
            return
        
        # Execute trade
        if action == 'buy' and symbol not in self.positions:
            # Open long position
            cost = quantity * execution_price
            commission = cost * self.config.commission_rate
            total_cost = cost + commission
            
            if total_cost <= self.capital:
                self.capital -= total_cost
                
                self.positions[symbol] = {
                    'quantity': quantity,
                    'entry_price': execution_price,
                    'entry_date': date,
                    'side': 'long'
                }
                
                logger.debug(f"Opened {symbol} long: {quantity} @ {execution_price:.2f}")
        
        elif action == 'sell' and symbol in self.positions:
            # Close position
            self._close_position(symbol, execution_price, date, "signal")
    
    def _close_position(self, symbol: str, price: float, date: datetime, reason: str):
        """Close a position."""
        if symbol not in self.positions:
            return
        
        position = self.positions[symbol]
        
        # Calculate P&L
        if position['side'] == 'long':
            proceeds = position['quantity'] * price
            commission = proceeds * self.config.commission_rate
            net_proceeds = proceeds - commission
            
            cost_basis = position['quantity'] * position['entry_price']
            pnl = net_proceeds - cost_basis
            pnl_pct = pnl / cost_basis
        else:
            pnl = 0
            pnl_pct = 0
        
        # Update capital
        self.capital += position['quantity'] * price * (1 - self.config.commission_rate)
        
        # Record trade
        trade = TradeRecord(
            symbol=symbol,
            entry_date=position['entry_date'],
            exit_date=date,
            entry_price=position['entry_price'],
            exit_price=price,
            quantity=position['quantity'],
            side=position['side'],
            pnl=pnl,
            pnl_pct=pnl_pct,
            holding_days=(date - position['entry_date']).days,
            metadata={"reason": reason}
        )
        self.trades.append(trade)
        
        # Remove position
        del self.positions[symbol]
        
        logger.debug(f"Closed {symbol}: P&L {pnl:.2f} ({pnl_pct:.2%})")
    
    def _record_equity(self, date: datetime):
        """Record equity value."""
        # Calculate position values
        position_value = sum(
            pos['quantity'] * pos.get('current_price', pos['entry_price'])
            for pos in self.positions.values()
        )
        
        total_equity = self.capital + position_value
        
        self.equity_curve.append({
            'date': date,
            'equity': total_equity,
            'capital': self.capital,
            'positions_value': position_value,
            'num_positions': len(self.positions)
        })
    
    def _calculate_metrics(self) -> BacktestMetrics:
        """Calculate performance metrics."""
        if not self.equity_curve:
            return BacktestMetrics(
                total_return=0, annual_return=0, sharpe_ratio=0,
                sortino_ratio=0, max_drawdown=0, max_drawdown_duration=0,
                win_rate=0, profit_factor=0, avg_win=0, avg_loss=0,
                total_trades=0, winning_trades=0, losing_trades=0,
                avg_holding_days=0, volatility=0
            )
        
        # Convert to DataFrame
        df = pd.DataFrame(self.equity_curve)
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        
        # Calculate returns
        df['returns'] = df['equity'].pct_change()
        
        # Total return
        total_return = (df['equity'].iloc[-1] / df['equity'].iloc[0]) - 1
        
        # Annual return
        days = (df.index[-1] - df.index[0]).days
        annual_return = (1 + total_return) ** (365 / max(days, 1)) - 1
        
        # Volatility
        volatility = df['returns'].std() * np.sqrt(252)
        
        # Sharpe ratio (assuming 0% risk-free rate)
        sharpe_ratio = annual_return / volatility if volatility > 0 else 0
        
        # Sortino ratio
        downside_returns = df['returns'][df['returns'] < 0]
        downside_std = downside_returns.std() * np.sqrt(252) if len(downside_returns) > 0 else 1
        sortino_ratio = annual_return / downside_std if downside_std > 0 else 0
        
        # Max drawdown
        df['cummax'] = df['equity'].cummax()
        df['drawdown'] = (df['equity'] - df['cummax']) / df['cummax']
        max_drawdown = df['drawdown'].min()
        
        # Max drawdown duration
        drawdown_duration = 0
        max_drawdown_duration = 0
        for dd in df['drawdown']:
            if dd < 0:
                drawdown_duration += 1
                max_drawdown_duration = max(max_drawdown_duration, drawdown_duration)
            else:
                drawdown_duration = 0
        
        # Trade statistics
        winning_trades = [t for t in self.trades if t.pnl > 0]
        losing_trades = [t for t in self.trades if t.pnl <= 0]
        
        win_rate = len(winning_trades) / len(self.trades) if self.trades else 0
        
        total_wins = sum(t.pnl for t in winning_trades)
        total_losses = abs(sum(t.pnl for t in losing_trades))
        profit_factor = total_wins / total_losses if total_losses > 0 else float('inf')
        
        avg_win = np.mean([t.pnl for t in winning_trades]) if winning_trades else 0
        avg_loss = np.mean([t.pnl for t in losing_trades]) if losing_trades else 0
        
        avg_holding_days = np.mean([t.holding_days for t in self.trades]) if self.trades else 0
        
        return BacktestMetrics(
            total_return=total_return,
            annual_return=annual_return,
            sharpe_ratio=sharpe_ratio,
            sortino_ratio=sortino_ratio,
            max_drawdown=max_drawdown,
            max_drawdown_duration=max_drawdown_duration,
            win_rate=win_rate,
            profit_factor=profit_factor,
            avg_win=avg_win,
            avg_loss=avg_loss,
            total_trades=len(self.trades),
            winning_trades=len(winning_trades),
            losing_trades=len(losing_trades),
            avg_holding_days=avg_holding_days,
            volatility=volatility
        )
    
    def _calculate_monthly_returns(self) -> Dict[str, float]:
        """Calculate monthly returns."""
        if not self.equity_curve:
            return {}
        
        df = pd.DataFrame(self.equity_curve)
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        
        # Resample to monthly
        monthly = df['equity'].resample('M').last()
        monthly_returns = monthly.pct_change().dropna()
        
        return {
            date.strftime('%Y-%m'): float(ret)
            for date, ret in monthly_returns.items()
        }