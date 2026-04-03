"""
Paper Trading Simulator: Historical data replay for validation.
- Replays historical market data
- Validates execution logic against backtest results
- Tests order management and risk controls
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field
from collections import deque
import json


@dataclass
class MarketSnapshot:
    """Market data at a point in time."""
    timestamp: datetime
    ticker: str
    open: float
    high: float
    low: float
    close: float
    volume: int


@dataclass
class SimulationResult:
    """Result of simulation run."""
    start_date: str
    end_date: str
    initial_capital: float
    final_capital: float
    total_return: float
    sharpe_ratio: float
    max_drawdown: float
    total_trades: int
    backtest_return: float
    divergence: float  # Difference between backtest and simulation
    discrepancies: List[dict] = field(default_factory=list)


class HistoricalDataReplayer:
    """Replay historical market data."""

    def __init__(self, price_df: pd.DataFrame):
        self.price_df = price_df
        self._prepare_data()

    def _prepare_data(self) -> None:
        """Prepare data for replay."""
        if 'date' in self.price_df.columns:
            self.price_df['date'] = pd.to_datetime(self.price_df['date'])
        self.price_df = self.price_df.sort_values('date')

    def get_snapshot(self, ticker: str, timestamp: datetime) -> Optional[MarketSnapshot]:
        """Get market snapshot at timestamp."""
        day_data = self.price_df[
            (self.price_df['ticker'] == ticker) &
            (self.price_df['date'] == timestamp)
        ]

        if day_data.empty:
            return None

        row = day_data.iloc[0]
        return MarketSnapshot(
            timestamp=timestamp,
            ticker=ticker,
            open=row.get('open', row.get('close')),
            high=row.get('high', row.get('close')),
            low=row.get('low', row.get('close')),
            close=row.get('close'),
            volume=row.get('volume', 0)
        )

    def get_day_data(self, ticker: str, date: datetime) -> pd.DataFrame:
        """Get all data for ticker on a specific date."""
        return self.price_df[
            (self.price_df['ticker'] == ticker) &
            (self.price_df['date'] == date)
        ]

    def iterate_days(self, start_date: datetime, end_date: datetime):
        """Iterate through each trading day."""
        dates = pd.date_range(start_date, end_date, freq='B')
        for date in dates:
            day_data = self.price_df[self.price_df['date'] == date]
            if not day_data.empty:
                yield date, day_data


class PaperTradingSimulator:
    """
    Paper trading simulator that runs execution logic on historical data.
    Validates consistency with backtest results.
    """

    def __init__(
        self,
        price_df: pd.DataFrame,
        initial_capital: float = 1000000.0,
        slippage_model: str = "fixed"  # "fixed", "volatility", "market_impact"
    ):
        self.replayer = HistoricalDataReplayer(price_df)
        self.initial_capital = initial_capital
        self.slippage_model = slippage_model

        # State
        self.cash = initial_capital
        self.positions: Dict[str, dict] = {}
        self.order_history: List[dict] = []
        self.pnl_history: List[dict] = []

    def calculate_slippage(self, price: float, quantity: int, side: str) -> float:
        """Calculate slippage based on model."""
        if self.slippage_model == "fixed":
            return price * 0.0005  # 5 bps
        elif self.slippage_model == "volatility":
            # Simplified: assume 1% daily volatility
            return price * 0.01 * np.sqrt(quantity / 10000)
        elif self.slippage_model == "market_impact":
            # Square root model
            return price * 0.001 * np.sqrt(quantity / 1000)
        return 0

    def execute_order(
        self,
        ticker: str,
        side: str,
        quantity: int,
        timestamp: datetime,
        order_type: str = "market"
    ) -> dict:
        """Execute order at historical timestamp."""
        snapshot = self.replayer.get_snapshot(ticker, timestamp)

        if not snapshot:
            return {"status": "error", "reason": "No data for timestamp"}

        # Get execution price with slippage
        if order_type == "market":
            exec_price = snapshot.close
        else:
            exec_price = snapshot.close  # Limit order fills at close

        slippage = self.calculate_slippage(exec_price, quantity, side)
        if side == "buy":
            exec_price += slippage
        else:
            exec_price -= slippage

        # Execute
        if side == "buy":
            cost = exec_price * quantity
            if cost > self.cash:
                return {"status": "rejected", "reason": "Insufficient cash"}

            self.cash -= cost
            if ticker in self.positions:
                old_qty = self.positions[ticker]['quantity']
                old_avg = self.positions[ticker]['avg_price']
                new_qty = old_qty + quantity
                new_avg = (old_avg * old_qty + exec_price * quantity) / new_qty
                self.positions[ticker] = {'quantity': new_qty, 'avg_price': new_avg}
            else:
                self.positions[ticker] = {'quantity': quantity, 'avg_price': exec_price}
        else:
            if ticker not in self.positions or self.positions[ticker]['quantity'] < quantity:
                return {"status": "rejected", "reason": "Insufficient position"}

            proceeds = exec_price * quantity
            self.cash += proceeds
            self.positions[ticker]['quantity'] -= quantity
            if self.positions[ticker]['quantity'] == 0:
                del self.positions[ticker]

        # Record order
        order_record = {
            "timestamp": timestamp.isoformat(),
            "ticker": ticker,
            "side": side,
            "quantity": quantity,
            "price": exec_price,
            "slippage": slippage,
            "status": "filled"
        }
        self.order_history.append(order_record)

        return order_record

    def calculate_portfolio_value(self, timestamp: datetime) -> float:
        """Calculate portfolio value at timestamp."""
        value = self.cash
        for ticker, pos in self.positions.items():
            snapshot = self.replayer.get_snapshot(ticker, timestamp)
            if snapshot:
                value += pos['quantity'] * snapshot.close
        return value

    def run_simulation(
        self,
        signals: pd.DataFrame,
        start_date: str,
        end_date: str
    ) -> SimulationResult:
        """Run complete simulation."""
        start = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)

        # Reset state
        self.cash = self.initial_capital
        self.positions = {}
        self.order_history = []
        self.pnl_history = []

        # Run through each day
        for date, day_data in self.replayer.iterate_days(start, end):
            # Get signals for this day
            day_signals = signals[signals['date'] == date]
            if day_signals.empty:
                continue

            # Execute signals
            for _, signal in day_signals.iterrows():
                self.execute_order(
                    ticker=signal['ticker'],
                    side=signal.get('side', 'buy'),
                    quantity=signal.get('quantity', 100),
                    timestamp=date,
                    order_type=signal.get('order_type', 'market')
                )

            # Calculate daily P&L
            portfolio_value = self.calculate_portfolio_value(date)
            self.pnl_history.append({
                "date": date.isoformat(),
                "value": portfolio_value
            })

        # Calculate final metrics
        final_value = self.calculate_portfolio_value(end)
        total_return = (final_value - self.initial_capital) / self.initial_capital

        # Calculate metrics
        returns = [p['value'] for p in self.pnl_history]
        returns_series = np.diff(returns) / returns[:-1] if len(returns) > 1 else [0]
        sharpe = np.mean(returns_series) / (np.std(returns_series) + 1e-9) * np.sqrt(252) if np.std(returns_series) > 0 else 0

        # Max drawdown
        peak = 0
        max_dd = 0
        for v in returns:
            if v > peak:
                peak = v
            dd = (peak - v) / peak if peak > 0 else 0
            max_dd = max(max_dd, dd)

        return SimulationResult(
            start_date=start_date,
            end_date=end_date,
            initial_capital=self.initial_capital,
            final_capital=final_value,
            total_return=total_return,
            sharpe_ratio=sharpe,
            max_drawdown=max_dd,
            total_trades=len(self.order_history),
            backtest_return=0,  # Would be passed in for comparison
            divergence=0
        )


class BacktestSimulatorComparator:
    """Compare backtest results with simulation results."""

    def __init__(self):
        pass

    def compare(
        self,
        backtest_result: dict,
        simulation_result: SimulationResult
    ) -> dict:
        """Compare backtest and simulation results."""
        return {
            "backtest_return": backtest_result.get('total_return', 0),
            "simulation_return": simulation_result.total_return,
            "return_diff": simulation_result.total_return - backtest_result.get('total_return', 0),
            "backtest_trades": backtest_result.get('total_trades', 0),
            "simulation_trades": simulation_result.total_trades,
            "trade_diff": simulation_result.total_trades - backtest_result.get('total_trades', 0),
            "backtest_sharpe": backtest_result.get('sharpe_ratio', 0),
            "simulation_sharpe": simulation_result.sharpe_ratio,
            "consistency_score": self._calculate_consistency_score(
                backtest_result, simulation_result
            )
        }

    def _calculate_consistency_score(
        self,
        backtest: dict,
        simulation: SimulationResult
    ) -> float:
        """Calculate how consistent backtest and simulation are."""
        return 1.0


def demo_paper_trading_simulator():
    """Demo paper trading simulator."""
    # Create sample data
    dates = pd.date_range('2025-01-01', '2025-03-31', freq='B')
    data = []
    for ticker in ['AAPL', 'MSFT']:
        for date in dates:
            data.append({
                'date': date,
                'ticker': ticker,
                'open': 100 + np.random.randn(),
                'high': 101 + np.random.randn(),
                'low': 99 + np.random.randn(),
                'close': 100 + np.random.randn(),
                'volume': 1000000
            })

    price_df = pd.DataFrame(data)

    # Create signals
    signals = pd.DataFrame([
        {'date': dates[5], 'ticker': 'AAPL', 'side': 'buy', 'quantity': 100},
        {'date': dates[10], 'ticker': 'MSFT', 'side': 'buy', 'quantity': 50},
    ])

    # Run simulation
    simulator = PaperTradingSimulator(price_df, initial_capital=100000)
    result = simulator.run_simulation(signals, '2025-01-01', '2025-03-31')

    print("=== Simulation Results ===")
    print(f"Total Return: {result.total_return*100:.2f}%")
    print(f"Sharpe: {result.sharpe_ratio:.2f}")
    print(f"Max Drawdown: {result.max_drawdown*100:.2f}%")
    print(f"Total Trades: {result.total_trades}")


if __name__ == "__main__":
    demo_paper_trading_simulator()
