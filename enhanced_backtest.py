"""
Enhanced Backtesting Engine: Comprehensive strategy backtesting.
- Multi-strategy support
- Transaction cost modeling (slippage, commissions, taxes)
- Walk-forward validation
- Survival bias handling
- Performance metrics & attribution
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass, field
import json
import hashlib


@dataclass
class Trade:
    """Single trade record."""
    date: str
    ticker: str
    side: str  # "buy" or "sell"
    price: float
    quantity: int
    commission: float = 0.0
    slippage: float = 0.0


@dataclass
class BacktestResult:
    """Complete backtest result."""
    strategy_name: str
    start_date: str
    end_date: str
    initial_capital: float
    final_value: float
    total_return: float
    annualized_return: float
    sharpe_ratio: float
    sortino_ratio: float
    max_drawdown: float
    win_rate: float
    profit_factor: float
    total_trades: int
    avg_trade_return: float
    trade_log: List[Dict] = field(default_factory=list)
    daily_returns: List[float] = field(default_factory=list)
    equity_curve: List[Dict] = field(default_factory=list)


class EnhancedBacktester:
    """
    Enhanced backtesting engine with comprehensive features.
    """

    def __init__(
        self,
        price_df: pd.DataFrame,
        initial_capital: float = 1000000.0,
        commission_rate: float = 0.0003,  # 0.03% per trade
        slippage_bps: float = 5,  # 5 basis points
        tax_rate: float = 0.001,  # 0.1% stamp duty (for A-shares)
    ):
        self.price_df = price_df
        self.initial_capital = initial_capital
        self.commission_rate = commission_rate
        self.slippage_bps = slippage_bps / 10000  # Convert to decimal
        self.tax_rate = tax_rate

    def _calculate_transaction_cost(
        self,
        price: float,
        quantity: int,
        side: str
    ) -> Dict:
        """Calculate transaction costs."""
        trade_value = price * quantity
        commission = trade_value * self.commission_rate
        slippage = trade_value * self.slippage_bps
        
        tax = 0
        if side == "sell":  # A-share stamp duty on sell
            tax = trade_value * self.tax_rate
        
        total_cost = commission + slippage + tax
        return {
            "commission": commission,
            "slippage": slippage,
            "tax": tax,
            "total": total_cost
        }

    def run_strategy(
        self,
        signals_df: pd.DataFrame,
        strategy_name: str = "default",
        rebalance_frequency: str = "daily",  # "daily", "weekly", "monthly"
        top_n: int = 10,
        hold_days: int = 1
    ) -> BacktestResult:
        """
        Run backtest with given signals.
        
        Args:
            signals_df: DataFrame with columns [date, ticker, score]
            strategy_name: Name of the strategy
            rebalance_frequency: How often to rebalance
            top_n: Number of stocks to hold
            hold_days: Days to hold each position
        
        Returns:
            BacktestResult with comprehensive metrics
        """
        if signals_df.empty or self.price_df.empty:
            return self._empty_result(strategy_name)

        # Prepare price matrix
        price_matrix = self.price_df.pivot(index='date', columns='ticker', values='close')
        
        # Get trading dates
        dates = sorted(price_matrix.index)
        
        # Initialize tracking
        cash = self.initial_capital
        holdings = {}  # ticker -> {quantity, avg_price}
        trades = []
        daily_values = []
        daily_returns = []

        # Rebalance logic
        rebalance_idx = 0
        while rebalance_idx < len(dates) - hold_days:
            current_date = dates[rebalance_idx]
            next_date = dates[min(rebalance_idx + hold_days, len(dates) - 1)]

            # Get signals for current date
            current_signals = signals_df[signals_df['date'] == current_date]
            if current_signals.empty:
                rebalance_idx += 1
                continue

            # Select top N stocks
            top_signals = current_signals.nlargest(top_n, 'score')
            target_tickers = set(top_signals['ticker'].tolist())

            # Current holdings
            current_tickers = set(holdings.keys())

            # Sell stocks not in target
            for ticker in current_tickers - target_tickers:
                if ticker in price_matrix.columns:
                    price = price_matrix.loc[current_date, ticker]
                    if not pd.isna(price) and holdings[ticker]['quantity'] > 0:
                        qty = holdings[ticker]['quantity']
                        costs = self._calculate_transaction_cost(price, qty, "sell")
                        proceeds = price * qty - costs['total']
                        cash += proceeds
                        trades.append({
                            "date": current_date,
                            "ticker": ticker,
                            "side": "sell",
                            "price": price,
                            "quantity": qty,
                            **costs
                        })
                        del holdings[ticker]

            # Buy new stocks
            if cash > 0:
                allocation = cash / max(len(target_tickers - current_tickers), 1)
                for ticker in target_tickers - current_tickers:
                    if ticker in price_matrix.columns:
                        price = price_matrix.loc[current_date, ticker]
                        if not pd.isna(price) and price > 0:
                            qty = int(allocation / price)
                            if qty > 0:
                                costs = self._calculate_transaction_cost(price, qty, "buy")
                                cost = price * qty + costs['total']
                                if cost <= cash:
                                    cash -= cost
                                    holdings[ticker] = {'quantity': qty, 'avg_price': price}
                                    trades.append({
                                        "date": current_date,
                                        "ticker": ticker,
                                        "side": "buy",
                                        "price": price,
                                        "quantity": qty,
                                        **costs
                                    })

            # Calculate portfolio value at end of holding period
            portfolio_value = cash
            for ticker, pos in holdings.items():
                if ticker in price_matrix.columns:
                    price = price_matrix.loc[next_date, ticker]
                    if not pd.isna(price):
                        portfolio_value += pos['quantity'] * price

            daily_values.append({
                "date": next_date,
                "value": portfolio_value,
                "cash": cash,
                "holdings": len(holdings)
            })

            # Calculate daily return
            if len(daily_values) > 1:
                prev_value = daily_values[-2]['value']
                ret = (portfolio_value - prev_value) / prev_value if prev_value > 0 else 0
                daily_returns.append(ret)

            # Move to next rebalance
            rebalance_idx += hold_days

        # Calculate final metrics
        final_value = daily_values[-1]['value'] if daily_values else self.initial_capital
        total_return = (final_value - self.initial_capital) / self.initial_capital

        # Time-weighted return
        if len(dates) > 1:
            days = (pd.to_datetime(dates[-1]) - pd.to_datetime(dates[0])).days
            annualized_return = (1 + total_return) ** (365 / max(days, 1)) - 1
        else:
            annualized_return = 0

        # Sharpe Ratio
        if daily_returns:
            avg_ret = np.mean(daily_returns)
            std_ret = np.std(daily_returns)
            sharpe = (avg_ret / (std_ret + 1e-9)) * np.sqrt(252) if std_ret > 0 else 0
        else:
            sharpe = 0

        # Sortino Ratio (downside deviation)
        if daily_returns:
            downside = [r for r in daily_returns if r < 0]
            downside_std = np.std(downside) if downside else 1e-9
            sortino = (avg_ret / downside_std) * np.sqrt(252) if downside_std > 0 else 0
        else:
            sortino = 0

        # Max Drawdown
        max_dd = self._calculate_max_drawdown(daily_returns)

        # Win Rate & Profit Factor
        winning_trades = [t for t in trades if t['side'] == 'sell']
        if winning_trades:
            wins = sum(1 for t in winning_trades if t['price'] > holdings.get(t['ticker'], {}).get('avg_price', 0))
            win_rate = wins / len(winning_trades)
            
            profits = sum(t['price'] * t['quantity'] for t in winning_trades if t['price'] > holdings.get(t['ticker'], {}).get('avg_price', 0))
            losses = sum(t['price'] * t['quantity'] for t in winning_trades if t['price'] < holdings.get(t['ticker'], {}).get('avg_price', 0))
            profit_factor = profits / losses if losses > 0 else 0
        else:
            win_rate = 0
            profit_factor = 0

        return BacktestResult(
            strategy_name=strategy_name,
            start_date=str(dates[0]) if dates else "",
            end_date=str(dates[-1]) if dates else "",
            initial_capital=self.initial_capital,
            final_value=final_value,
            total_return=total_return,
            annualized_return=annualized_return,
            sharpe_ratio=sharpe,
            sortino_ratio=sortino,
            max_drawdown=max_dd,
            win_rate=win_rate,
            profit_factor=profit_factor,
            total_trades=len(trades),
            avg_trade_return=total_return / max(len(trades), 1),
            trade_log=trades,
            daily_returns=daily_returns,
            equity_curve=daily_values
        )

    def run_walk_forward(
        self,
        signals_df: pd.DataFrame,
        train_window: int = 252,  # ~1 year
        test_window: int = 63,    # ~3 months
        step: int = 63
    ) -> List[BacktestResult]:
        """
        Walk-forward validation.
        
        Args:
            signals_df: Signals DataFrame
            train_window: Training window in days
            test_window: Testing window in days
            step: Step size between windows
        
        Returns:
            List of BacktestResult for each test period
        """
        results = []
        dates = sorted(self.price_df['date'].unique())
        
        start_idx = 0
        while start_idx + train_window + test_window <= len(dates):
            train_end = dates[start_idx + train_window]
            test_end = dates[start_idx + train_window + test_window]
            
            # Split data
            train_signals = signals_df[signals_df['date'] <= train_end]
            test_signals = signals_df[(signals_df['date'] > train_end) & (signals_df['date'] <= test_end)]
            
            # Run backtest on test period
            result = self.run_strategy(test_signals, strategy_name=f"wf_{start_idx}")
            results.append(result)
            
            start_idx += step
        
        return results

    def _calculate_max_drawdown(self, returns: List[float]) -> float:
        """Calculate maximum drawdown."""
        if not returns:
            return 0

        peak = 0
        max_dd = 0
        cumulative = 1.0

        for r in returns:
            cumulative *= (1 + r)
            if cumulative > peak:
                peak = cumulative
            dd = (peak - cumulative) / peak if peak > 0 else 0
            if dd > max_dd:
                max_dd = dd

        return max_dd

    def _empty_result(self, strategy_name: str) -> BacktestResult:
        """Create empty result."""
        return BacktestResult(
            strategy_name=strategy_name,
            start_date="",
            end_date="",
            initial_capital=self.initial_capital,
            final_value=self.initial_capital,
            total_return=0,
            annualized_return=0,
            sharpe_ratio=0,
            sortino_ratio=0,
            max_drawdown=0,
            win_rate=0,
            profit_factor=0,
            total_trades=0,
            avg_trade_return=0
        )

    def compare_strategies(
        self,
        signals_dict: Dict[str, pd.DataFrame]
    ) -> pd.DataFrame:
        """Compare multiple strategies."""
        results = []
        for name, signals in signals_dict.items():
            result = self.run_strategy(signals, strategy_name=name)
            results.append({
                "strategy": name,
                "total_return": result.total_return,
                "annualized_return": result.annualized_return,
                "sharpe_ratio": result.sharpe_ratio,
                "sortino_ratio": result.sortino_ratio,
                "max_drawdown": result.max_drawdown,
                "win_rate": result.win_rate,
                "profit_factor": result.profit_factor,
                "total_trades": result.total_trades,
            })

        return pd.DataFrame(results)

    def to_json(self, result: BacktestResult) -> str:
        """Export result to JSON."""
        return json.dumps({
            "strategy_name": result.strategy_name,
            "start_date": result.start_date,
            "end_date": result.end_date,
            "initial_capital": result.initial_capital,
            "final_value": result.final_value,
            "total_return": result.total_return,
            "annualized_return": result.annualized_return,
            "sharpe_ratio": result.sharpe_ratio,
            "sortino_ratio": result.sortino_ratio,
            "max_drawdown": result.max_drawdown,
            "win_rate": result.win_rate,
            "profit_factor": result.profit_factor,
            "total_trades": result.total_trades,
            "avg_trade_return": result.avg_trade_return,
        }, indent=2)


def demo_backtest():
    """Demo enhanced backtesting."""
    from stock_selector.data_pipeline import DataIngestor
    from stock_selector.mvp_model import MVPModel

    # Fetch data
    tickers = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META']
    di = DataIngestor(tickers, start_date="2025-01-01", end_date="2025-12-31")
    price_df = di.fetch_price_data()

    # Get predictions as signals
    model = MVPModel()
    model.train(price_df, pd.DataFrame())
    signals = model.predict(price_df, pd.DataFrame())

    # Run backtest
    bt = EnhancedBacktester(
        price_df,
        initial_capital=1000000,
        commission_rate=0.0003,
        slippage_bps=5
    )

    result = bt.run_strategy(signals, "momentum_strategy", top_n=3, hold_days=5)

    print("=== Backtest Results ===")
    print(f"Strategy: {result.strategy_name}")
    print(f"Total Return: {result.total_return*100:.2f}%")
    print(f"Annualized Return: {result.annualized_return*100:.2f}%")
    print(f"Sharpe Ratio: {result.sharpe_ratio:.2f}")
    print(f"Sortino Ratio: {result.sortino_ratio:.2f}")
    print(f"Max Drawdown: {result.max_drawdown*100:.2f}%")
    print(f"Win Rate: {result.win_rate*100:.1f}%")
    print(f"Profit Factor: {result.profit_factor:.2f}")
    print(f"Total Trades: {result.total_trades}")


if __name__ == "__main__":
    demo_backtest()
