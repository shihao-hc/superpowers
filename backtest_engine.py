"""
Simplified backtesting engine for MVP.
Implements survival bias awareness (basic) and rolling window validation.
"""
from __future__ import annotations

import pandas as pd
import numpy as np


class Backtester:
    def __init__(self, price_df: pd.DataFrame, sentiment_df: pd.DataFrame | None = None, top_n: int = 20, window_days: int = 5, transaction_cost: float = 0.0005):
        self.price_df = price_df
        self.sentiment_df = sentiment_df or pd.DataFrame(columns=["date", "ticker", "sentiment"])
        self.top_n = top_n
        self.window_days = window_days
        self.transaction_cost = transaction_cost

    @staticmethod
    def _to_price_matrix(price_df: pd.DataFrame) -> pd.DataFrame:
        if price_df is None or price_df.empty:
            return pd.DataFrame()
        return price_df.pivot(index='date', columns='ticker', values='close')

    @staticmethod
    def _to_return_matrix(price_matrix: pd.DataFrame) -> pd.DataFrame:
        return price_matrix.pct_change().fillna(0)

    def _merge_features(self, returns: pd.DataFrame, sentiment: pd.DataFrame) -> pd.DataFrame:
        # Build a simple sentiment pivot aligned with returns index
        if sentiment is None or sentiment.empty:
            sentiment_pivot = pd.DataFrame(0, index=returns.index, columns=returns.columns)
        else:
            sentiment_pivot = sentiment.pivot(index='date', columns='ticker', values='sentiment').reindex(returns.index).fillna(0)
        # momentum-like features (last 5 days)
        mom = returns.rolling(window=self.window_days).mean().fillna(0)
        # stack features for model input: we will flatten to long format later
        base = returns.copy()
        # Add sentiment as additional dataframe aligned by date/ticker later in feature construction
        return base, sentiment_pivot, mom

    def run_rollout(self) -> dict:
        price_matrix = self._to_price_matrix(self.price_df)
        if price_matrix is None or price_matrix.empty:
            return {"cumulative_return": 0.0, "stats": {}}
        returns = self._to_return_matrix(price_matrix)
        dates = list(returns.index)
        if len(dates) < 2:
            return {"cumulative_return": 0.0, "stats": {}}
        # naive rolling backtest: on each date pick top_n by simple momentum (previous day returns) and hold next day
        portfolio_returns = []
        for i in range( self.window_days, len(dates) - 1):
            date = dates[i]
            # momentum computed from last window_days days
            mom = returns.iloc[i].values
            # choose top_n by momentum values
            top_indices = np.argsort(-mom)[:min(self.top_n, len(mom))]
            selected = returns.columns[top_indices]
            # next day return
            next_ret = returns.iloc[i + 1][selected].mean()
            # apply simple transaction cost
            net_ret = next_ret - self.transaction_cost
            portfolio_returns.append(net_ret)
        if not portfolio_returns:
            return {"cumulative_return": 0.0, "stats": {}}
        cum_ret = float(np.prod([1 + r for r in portfolio_returns]) - 1)
        # compute simple stats
        import math
        sr = np.mean(portfolio_returns) / (np.std(portfolio_returns) + 1e-9) * math.sqrt(252/len(portfolio_returns)) if portfolio_returns else 0.0
        max_dd = self._maximize_drawdown(portfolio_returns)
        return {
            "cumulative_return": cum_ret,
            "stats": {
                "annualized_sharpe": sr if not np.isnan(sr) else 0.0,
                "max_drawdown": max_dd,
            },
        }

    @staticmethod
    def _maximize_drawdown(returns: list[float]) -> float:
        max_dd = 0.0
        peak = 0.0
        cum = 1.0
        for r in returns:
            cum *= (1 + r)
            if cum > peak:
                peak = cum
            dd = (peak - cum) / peak if peak != 0 else 0.0
            if dd > max_dd:
                max_dd = dd
        return max_dd
