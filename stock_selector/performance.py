"""
Performance Optimization Module.
- Numba-accelerated factor calculations
- Parquet storage for high-frequency data
- Parallel backtesting with Dask/Ray
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from typing import Callable, List, Dict, Optional
from datetime import datetime
import json
import os

# Try to import optional dependencies
try:
    from numba import jit, njit, prange
    HAS_NUMBA = True
except ImportError:
    HAS_NUMBA = False
    def jit(*args, **kwargs):
        """Mock decorator when Numba not available."""
        def decorator(func):
            return func
        return decorator
    def njit(*args, **kwargs):
        return jit(*args, **kwargs)
    prange = range

try:
    import pyarrow as pa
    import pyarrow.parquet as pq
    HAS_PYARROW = True
except ImportError:
    HAS_PYARROW = False


# ============================================================
# Numba-accelerated calculations
# ============================================================

if HAS_NUMBA:
    @njit
    def calculate_returns_numba(prices: np.ndarray) -> np.ndarray:
        """Calculate returns using Numba."""
        n = len(prices)
        returns = np.zeros(n)
        for i in range(1, n):
            if prices[i-1] != 0:
                returns[i] = (prices[i] - prices[i-1]) / prices[i-1]
        return returns

    @njit
    def calculate_sma_numba(prices: np.ndarray, window: int) -> np.ndarray:
        """Calculate SMA using Numba."""
        n = len(prices)
        sma = np.zeros(n)
        for i in range(window - 1, n):
            sum_val = 0.0
            for j in range(window):
                sum_val += prices[i - j]
            sma[i] = sum_val / window
        return sma

    @njit
    def calculate_ema_numba(prices: np.ndarray, span: int) -> np.ndarray:
        """Calculate EMA using Numba."""
        n = len(prices)
        alpha = 2.0 / (span + 1)
        ema = np.zeros(n)
        ema[0] = prices[0]
        for i in range(1, n):
            ema[i] = alpha * prices[i] + (1 - alpha) * ema[i-1]
        return ema

    @njit
    def calculate_rsi_numba(prices: np.ndarray, period: int) -> np.ndarray:
        """Calculate RSI using Numba."""
        n = len(prices)
        rsi = np.zeros(n)
        gains = np.zeros(n)
        losses = np.zeros(n)

        for i in range(1, n):
            diff = prices[i] - prices[i-1]
            if diff > 0:
                gains[i] = diff
            else:
                losses[i] = -diff

        for i in range(period, n):
            avg_gain = 0.0
            avg_loss = 0.0
            for j in range(period):
                avg_gain += gains[i - j]
                avg_loss += losses[i - j]
            avg_gain /= period
            avg_loss /= period

            if avg_loss == 0:
                rsi[i] = 100
            else:
                rs = avg_gain / avg_loss
                rsi[i] = 100 - (100 / (1 + rs))

        return rsi

    @njit(parallel=True)
    def calculate_beta_numba(returns_a: np.ndarray, returns_b: np.ndarray) -> float:
        """Calculate beta using Numba."""
        n = len(returns_a)
        if n == 0:
            return 0.0

        mean_a = 0.0
        mean_b = 0.0
        for i in range(n):
            mean_a += returns_a[i]
            mean_b += returns_b[i]
        mean_a /= n
        mean_b /= n

        covariance = 0.0
        variance_b = 0.0
        for i in range(n):
            covariance += (returns_a[i] - mean_a) * (returns_b[i] - mean_b)
            variance_b += (returns_b[i] - mean_b) ** 2

        if variance_b == 0:
            return 0.0
        return covariance / variance_b

    @njit
    def calculate_sharpe_numba(returns: np.ndarray, risk_free: float = 0.0) -> float:
        """Calculate Sharpe ratio using Numba."""
        n = len(returns)
        if n == 0:
            return 0.0

        mean_ret = 0.0
        for i in range(n):
            mean_ret += returns[i]
        mean_ret /= n

        std_ret = 0.0
        for i in range(n):
            std_ret += (returns[i] - mean_ret) ** 2
        std_ret = np.sqrt(std_ret / n)

        if std_ret == 0:
            return 0.0

        return (mean_ret - risk_free) / std_ret

else:
    # Fallback implementations without Numba
    def calculate_returns_numba(prices: np.ndarray) -> np.ndarray:
        return pd.Series(prices).pct_change().fillna(0).values

    def calculate_sma_numba(prices: np.ndarray, window: int) -> np.ndarray:
        return pd.Series(prices).rolling(window).mean().fillna(0).values

    def calculate_ema_numba(prices: np.ndarray, span: int) -> np.ndarray:
        return pd.Series(prices).ewm(span=span).mean().fillna(0).values

    def calculate_rsi_numba(prices: np.ndarray, period: int = 14) -> np.ndarray:
        delta = pd.Series(prices).diff()
        gain = delta.where(delta > 0, 0).rolling(period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(period).mean()
        rs = gain / (loss + 1e-10)
        return (100 - (100 / (1 + rs))).fillna(50).values

    def calculate_beta_numba(returns_a: np.ndarray, returns_b: np.ndarray) -> float:
        return np.cov(returns_a, returns_b)[0,1] / (np.var(returns_b) + 1e-10)

    def calculate_sharpe_numba(returns: np.ndarray, risk_free: float = 0.0) -> float:
        return (np.mean(returns) - risk_free) / (np.std(returns) + 1e-10)


# ============================================================
# Factor calculation engine with Numba
# ============================================================

class FactorCalculator:
    """High-performance factor calculation engine."""

    def __init__(self, use_numba: bool = True):
        self.use_numba = use_numba and HAS_NUMBA

    def calculate_returns(self, prices: np.ndarray) -> np.ndarray:
        """Calculate returns."""
        if self.use_numba:
            return calculate_returns_numba(prices)
        return calculate_returns_numba.__wrapped__(prices)

    def calculate_sma(self, prices: np.ndarray, window: int) -> np.ndarray:
        """Calculate SMA."""
        if self.use_numba:
            return calculate_sma_numba(prices, window)
        return calculate_sma_numba.__wrapped__(prices, window)

    def calculate_ema(self, prices: np.ndarray, span: int) -> np.ndarray:
        """Calculate EMA."""
        if self.use_numba:
            return calculate_ema_numba(prices, span)
        return calculate_ema_numba.__wrapped__(prices, span)

    def calculate_rsi(self, prices: np.ndarray, period: int = 14) -> np.ndarray:
        """Calculate RSI."""
        if self.use_numba:
            return calculate_rsi_numba(prices, period)
        return calculate_rsi_numba.__wrapped__(prices, period)

    def calculate_all_indicators(
        self,
        price_df: pd.DataFrame
    ) -> pd.DataFrame:
        """Calculate all technical indicators for a price series."""
        df = price_df.copy()
        close = df['close'].values

        # Calculate indicators
        df['returns'] = self.calculate_returns(close)
        df['sma_5'] = self.calculate_sma(close, 5)
        df['sma_10'] = self.calculate_sma(close, 10)
        df['sma_20'] = self.calculate_sma(close, 20)
        df['sma_50'] = self.calculate_sma(close, 50)
        df['ema_12'] = self.calculate_ema(close, 12)
        df['ema_26'] = self.calculate_ema(close, 26)
        df['rsi_14'] = self.calculate_rsi(close, 14)

        # MACD
        df['macd'] = df['ema_12'] - df['ema_26']
        df['macd_signal'] = self.calculate_ema(df['macd'].values, 9)

        return df


# ============================================================
# Parquet storage for high-frequency data
# ============================================================

class ParquetDataStore:
    """High-performance Parquet-based data storage."""

    def __init__(self, base_path: str = "./data_parquet"):
        self.base_path = base_path
        if not os.path.exists(base_path):
            os.makedirs(base_path)

    def save_bars(
        self,
        df: pd.DataFrame,
        symbol: str,
        data_type: str = "bars"
    ) -> str:
        """Save bar data to Parquet."""
        if not HAS_PYARROW:
            raise ImportError("pyarrow not installed")

        filename = f"{symbol}_{data_type}_{datetime.now().strftime('%Y%m%d')}.parquet"
        filepath = os.path.join(self.base_path, filename)

        table = pa.Table.from_pandas(df)
        pq.write_table(table, filepath, compression='snappy')

        return filepath

    def load_bars(
        self,
        symbol: str,
        data_type: str = "bars",
        date: Optional[str] = None
    ) -> pd.DataFrame:
        """Load bar data from Parquet."""
        if not HAS_PYARROW:
            raise ImportError("pyarrow not installed")

        if date:
            filename = f"{symbol}_{data_type}_{date}.parquet"
        else:
            # Find latest file
            files = [f for f in os.listdir(self.base_path)
                    if f.startswith(f"{symbol}_{data_type}_")]
            if not files:
                return pd.DataFrame()
            filename = sorted(files)[-1]

        filepath = os.path.join(self.base_path, filename)
        if not os.path.exists(filepath):
            return pd.DataFrame()

        return pq.read_table(filepath).to_pandas()

    def append_bars(self, df: pd.DataFrame, symbol: str, data_type: str = "bars") -> None:
        """Append bar data to existing Parquet file."""
        # Try to load existing data
        existing = self.load_bars(symbol, data_type)

        if existing.empty:
            self.save_bars(df, symbol, data_type)
        else:
            # Append and deduplicate
            combined = pd.concat([existing, df])
            combined = combined.drop_duplicates(subset=['timestamp', 'ticker'])
            combined = combined.sort_values('timestamp')
            self.save_bars(combined, symbol, data_type)


# ============================================================
# Parallel backtesting
# ============================================================

class ParallelBacktester:
    """Parallel backtesting for multiple strategies/tickers."""

    def __init__(self, n_workers: int = 4):
        self.n_workers = n_workers
        self.results = []

    def run_parallel(
        self,
        price_data: Dict[str, pd.DataFrame],
        strategy_fn: Callable
    ) -> Dict:
        """
        Run strategy on multiple tickers in parallel.
        
        Args:
            price_data: Dict of ticker -> price DataFrame
            strategy_fn: Strategy function that takes price_df and returns results
        
        Returns:
            Dict of ticker -> results
        """
        # Simple sequential fallback (can be replaced with Dask/Ray)
        results = {}
        for ticker, df in price_data.items():
            try:
                results[ticker] = strategy_fn(df)
            except Exception as e:
                results[ticker] = {"error": str(e)}

        return results

    def run_parameter_scan(
        self,
        price_df: pd.DataFrame,
        strategy_fn: Callable,
        param_grid: Dict[str, List]
    ) -> List[Dict]:
        """
        Run strategy with different parameter combinations.
        
        Args:
            price_df: Price data
            strategy_fn: Strategy function
            param_grid: Dict of parameter name -> list of values
        
        Returns:
            List of results with parameters
        """
        from itertools import product

        results = []
        param_names = list(param_grid.keys())
        param_values = list(param_grid.values())

        for values in product(*param_values):
            params = dict(zip(param_names, values))
            try:
                result = strategy_fn(price_df, **params)
                result['params'] = params
                results.append(result)
            except Exception as e:
                results.append({'params': params, 'error': str(e)})

        return results


# ============================================================
# Performance monitoring
# ============================================================

class PerformanceMonitor:
    """Monitor performance metrics."""

    def __init__(self):
        self.metrics = {}
        self.start_times = {}

    def start_timer(self, name: str) -> None:
        """Start timing a operation."""
        self.start_times[name] = datetime.now()

    def end_timer(self, name: str) -> float:
        """End timing and return duration in seconds."""
        if name not in self.start_times:
            return 0.0
        duration = (datetime.now() - self.start_times[name]).total_seconds()
        self.metrics[name] = duration
        del self.start_times[name]
        return duration

    def get_metrics(self) -> Dict:
        """Get all metrics."""
        return self.metrics

    def reset(self) -> None:
        """Reset metrics."""
        self.metrics = {}
        self.start_times = {}


def demo_performance():
    """Demo performance optimization."""
    # Test Numba calculations
    print("=== Numba Performance Test ===")
    prices = np.random.randn(10000).cumsum() + 100

    calc = FactorCalculator(use_numba=HAS_NUMBA)

    import time
    start = time.time()
    sma = calc.calculate_sma(prices, 20)
    elapsed = time.time() - start
    print(f"SMA calculation (10k points): {elapsed*1000:.2f}ms")

    # Test RSI
    start = time.time()
    rsi = calc.calculate_rsi(prices, 14)
    elapsed = time.time() - start
    print(f"RSI calculation (10k points): {elapsed*1000:.2f}ms")

    # Test Parquet storage
    if HAS_PYARROW:
        print("\n=== Parquet Storage Test ===")
        store = ParquetDataStore("./demo_data")

        df = pd.DataFrame({
            'timestamp': pd.date_range('2025-01-01', periods=1000),
            'ticker': ['AAPL'] * 1000,
            'open': np.random.randn(1000) + 100,
            'high': np.random.randn(1000) + 101,
            'low': np.random.randn(1000) + 99,
            'close': np.random.randn(1000) + 100,
            'volume': np.random.randint(1000, 10000, 1000)
        })

        filepath = store.save_bars(df, "AAPL", "1min")
        print(f"Saved to: {filepath}")

        loaded = store.load_bars("AAPL", "1min")
        print(f"Loaded {len(loaded)} rows")


if __name__ == "__main__":
    demo_performance()
