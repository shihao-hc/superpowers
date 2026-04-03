"""
Parallel Backtest Engine: Multi-strategy parallel backtesting with optimization.
- Concurrent strategy backtest execution
- Progress tracking and resource management
- Result aggregation and comparison
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable, Tuple
from dataclasses import dataclass, field
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor, as_completed
from concurrent.futures import Future
import multiprocessing as mp
from enum import Enum
import json
import time
import threading


class ExecutionMode(Enum):
    """Execution mode for parallel backtesting."""
    THREAD = "thread"  # For I/O-bound (data fetching)
    PROCESS = "process"  # For CPU-bound (calculations)


@dataclass
class StrategyConfig:
    """Configuration for a single strategy."""
    name: str
    params: Dict
    entry_rules: List[Callable] = field(default_factory=list)
    exit_rules: List[Callable] = field(default_factory=list)
    weight: float = 1.0


@dataclass
class BacktestResult:
    """Single backtest result."""
    strategy_name: str
    total_return_pct: float
    sharpe_ratio: float
    max_drawdown_pct: float
    win_rate: float
    trade_count: int
    avg_holding_days: float
    execution_time_ms: float = 0.0
    equity_curve: List[float] = field(default_factory=list)
    trades: List[Dict] = field(default_factory=list)


@dataclass
class ParallelBacktestReport:
    """Aggregated parallel backtest report."""
    timestamp: str
    total_strategies: int
    successful_strategies: int
    failed_strategies: int
    best_strategy: str
    best_return_pct: float
    execution_time_ms: float = 0.0
    results: List[BacktestResult] = field(default_factory=list)


class ParallelBacktestEngine:
    """
    Parallel backtesting engine for multi-strategy optimization.
    Supports both thread-based (I/O) and process-based (CPU) execution.
    """

    def __init__(
        self,
        initial_capital: float = 1000000.0,
        execution_mode: ExecutionMode = ExecutionMode.PROCESS,
        max_workers: int = None,
    ):
        self.initial_capital = initial_capital
        self.execution_mode = execution_mode
        self.max_workers = max_workers or max(1, mp.cpu_count() - 1)
        
        self._progress_callbacks: List[Callable] = []
        self._lock = threading.Lock()

    def register_progress_callback(self, callback: Callable[[int, int], None]) -> None:
        """Register progress callback (completed, total)."""
        self._progress_callbacks.append(callback)

    def _emit_progress(self, completed: int, total: int) -> None:
        """Emit progress update."""
        for callback in self._progress_callbacks:
            try:
                callback(completed, total)
            except Exception:
                pass

    def run_single_backtest(
        self,
        strategy: StrategyConfig,
        price_data: pd.DataFrame,
        benchmark_data: pd.Series = None
    ) -> BacktestResult:
        """Run a single strategy backtest."""
        start_time = time.time()
        
        capital = self.initial_capital * strategy.weight
        positions = {}
        equity_curve = [capital]
        trades = []
        
        for i, (date, row) in enumerate(price_data.iterrows()):
            current_price = row['close']
            
            # Check entry rules
            if not positions:
                for rule in strategy.entry_rules:
                    if rule(price_data.iloc[:i+1], strategy.params):
                        positions['long'] = {
                            'entry_price': current_price,
                            'entry_date': date,
                            'quantity': int(capital * 0.95 / current_price)
                        }
                        break
            
            # Check exit rules
            if 'long' in positions:
                pos = positions['long']
                for rule in strategy.exit_rules:
                    should_exit = rule(price_data.iloc[:i+1], pos, strategy.params)
                    if should_exit:
                        pnl = (current_price - pos['entry_price']) * pos['quantity']
                        capital += pnl
                        trades.append({
                            'entry_date': pos['entry_date'],
                            'exit_date': date,
                            'entry_price': pos['entry_price'],
                            'exit_price': current_price,
                            'pnl': pnl,
                            'holding_days': (date - pos['entry_date']).days
                        })
                        positions.pop('long', None)
                        break
            
            # Update equity
            if 'long' in positions:
                pos = positions['long']
                current_value = pos['quantity'] * current_price
            else:
                current_value = capital
            equity_curve.append(current_value)
        
        # Calculate metrics
        equity_series = pd.Series(equity_curve)
        returns = equity_series.pct_change().dropna()
        
        total_return = (equity_curve[-1] - self.initial_capital) / self.initial_capital
        sharpe = returns.mean() / returns.std() * np.sqrt(252) if returns.std() > 0 else 0
        
        peak = equity_series.expanding().max()
        drawdown = (equity_series - peak) / peak
        max_dd = drawdown.min()
        
        winning_trades = [t for t in trades if t['pnl'] > 0]
        win_rate = len(winning_trades) / len(trades) if trades else 0
        
        avg_holding = np.mean([t['holding_days'] for t in trades]) if trades else 0
        
        execution_time = (time.time() - start_time) * 1000
        
        return BacktestResult(
            strategy_name=strategy.name,
            total_return_pct=total_return,
            sharpe_ratio=sharpe,
            max_drawdown_pct=max_dd,
            win_rate=win_rate,
            trade_count=len(trades),
            avg_holding_days=avg_holding,
            execution_time_ms=execution_time,
            equity_curve=equity_curve,
            trades=trades
        )

    def run_parallel_backtest(
        self,
        strategies: List[StrategyConfig],
        price_data: pd.DataFrame,
        benchmark_data: pd.Series = None
    ) -> ParallelBacktestReport:
        """Run multiple strategies in parallel."""
        start_time = time.time()
        
        results = []
        completed = 0
        total = len(strategies)
        
        if self.execution_mode == ExecutionMode.PROCESS:
            executor_class = ProcessPoolExecutor
        else:
            executor_class = ThreadPoolExecutor
        
        with executor_class(max_workers=self.max_workers) as executor:
            future_to_strategy = {
                executor.submit(
                    self.run_single_backtest,
                    strategy,
                    price_data,
                    benchmark_data
                ): strategy
                for strategy in strategies
            }
            
            for future in as_completed(future_to_strategy):
                strategy = future_to_strategy[future]
                try:
                    result = future.result()
                    results.append(result)
                except Exception as e:
                    print(f"Strategy {strategy.name} failed: {e}")
                
                with self._lock:
                    completed += 1
                    self._emit_progress(completed, total)
        
        # Aggregate results
        successful = [r for r in results if r.trade_count > 0]
        failed = len(strategies) - len(successful)
        
        best = max(successful, key=lambda r: r.total_return_pct, default=None)
        
        execution_time = (time.time() - start_time) * 1000
        
        return ParallelBacktestReport(
            timestamp=datetime.now().isoformat(),
            total_strategies=len(strategies),
            successful_strategies=len(successful),
            failed_strategies=failed,
            best_strategy=best.strategy_name if best else None,
            best_return_pct=best.total_return_pct if best else 0,
            results=results,
            execution_time_ms=execution_time
        )

    def run_parameter_sweep(
        self,
        base_strategy: StrategyConfig,
        param_grid: Dict[str, List],
        price_data: pd.DataFrame,
        metric: str = "sharpe_ratio"
    ) -> Tuple[ParallelBacktestReport, Dict]:
        """Run parameter sweep for a strategy."""
        param_combinations = []
        
        def generate_combinations(params: Dict, keys: List, index: int):
            if index == len(keys):
                param_combinations.append(params.copy())
            else:
                key = keys[index]
                for value in param_grid[key]:
                    params[key] = value
                    generate_combinations(params, keys, index + 1)
        
        keys = list(param_grid.keys())
        generate_combinations({}, keys, 0)
        
        strategies = []
        for params in param_combinations:
            combined_params = {**base_strategy.params, **params}
            strategy = StrategyConfig(
                name=f"{base_strategy.name}_{params}",
                params=combined_params,
                entry_rules=base_strategy.entry_rules,
                exit_rules=base_strategy.exit_rules,
                weight=base_strategy.weight
            )
            strategies.append(strategy)
        
        report = self.run_parallel_backtest(strategies, price_data)
        
        # Find best parameters
        best_result = max(report.results, key=lambda r: getattr(r, metric), default=None)
        best_params = best_result.strategy_name.replace(f"{base_strategy.name}_", "") if best_result else "{}"
        
        return report, {"best_params": best_params, "best_metric": getattr(best_result, metric, 0)}

    def export_report(self, report: ParallelBacktestReport, filepath: str) -> None:
        """Export report to JSON."""
        data = {
            "timestamp": report.timestamp,
            "total_strategies": report.total_strategies,
            "successful_strategies": report.successful_strategies,
            "failed_strategies": report.failed_strategies,
            "best_strategy": report.best_strategy,
            "best_return_pct": report.best_return_pct,
            "execution_time_ms": report.execution_time_ms,
            "results": [
                {
                    "strategy_name": r.strategy_name,
                    "total_return_pct": r.total_return_pct,
                    "sharpe_ratio": r.sharpe_ratio,
                    "max_drawdown_pct": r.max_drawdown_pct,
                    "win_rate": r.win_rate,
                    "trade_count": r.trade_count,
                    "avg_holding_days": r.avg_holding_days,
                    "execution_time_ms": r.execution_time_ms
                }
                for r in report.results
            ]
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)


def demo_parallel_backtest():
    """Demo parallel backtesting."""
    # Generate sample data
    np.random.seed(42)
    dates = pd.date_range("2023-01-01", "2024-12-31", freq="D")
    prices = 100 * np.exp(np.cumsum(np.random.randn(len(dates)) * 0.02))
    
    price_data = pd.DataFrame({
        'date': dates,
        'open': prices * 0.99,
        'high': prices * 1.02,
        'low': prices * 0.98,
        'close': prices,
        'volume': np.random.randint(1000000, 10000000, len(dates))
    })
    
    # Define simple entry/exit rules
    def sma_crossover(data: pd.DataFrame, params: Dict) -> bool:
        if len(data) < 20:
            return False
        return data['close'].iloc[-1] > data['close'].rolling(10).mean().iloc[-1]
    
    def rsi_exit(data: pd.DataFrame, position: Dict, params: Dict) -> bool:
        if len(data) < 14:
            return False
        rsi = data['close'].diff().apply(lambda x: 1 if x > 0 else 0).rolling(14).mean()
        return rsi.iloc[-1] > 70
    
    # Create strategies
    strategies = [
        StrategyConfig(name="SMA_Cross_10_20", params={}, entry_rules=[sma_crossover], exit_rules=[rsi_exit]),
        StrategyConfig(name="SMA_Cross_5_15", params={}, entry_rules=[sma_crossover], exit_rules=[rsi_exit]),
        StrategyConfig(name="SMA_Cross_20_50", params={}, entry_rules=[sma_crossover], exit_rules=[rsi_exit]),
    ]
    
    # Run parallel backtest
    engine = ParallelBacktestEngine(
        initial_capital=1000000,
        execution_mode=ExecutionMode.PROCESS,
        max_workers=2
    )
    
    def progress_callback(completed, total):
        print(f"Progress: {completed}/{total}")
    
    engine.register_progress_callback(progress_callback)
    
    print("Running parallel backtest...")
    report = engine.run_parallel_backtest(strategies, price_data)
    
    print(f"\n{'='*60}")
    print(f"PARALLEL BACKTEST REPORT")
    print(f"{'='*60}")
    print(f"Total strategies: {report.total_strategies}")
    print(f"Successful: {report.successful_strategies}")
    print(f"Best: {report.best_strategy} ({report.best_return_pct:.1%})")
    print(f"Execution time: {report.execution_time_ms:.0f}ms")
    
    for result in report.results:
        print(f"\n{result.strategy_name}:")
        print(f"  Return: {result.total_return_pct:.1%}")
        print(f"  Sharpe: {result.sharpe_ratio:.2f}")
        print(f"  Max DD: {result.max_drawdown_pct:.1%}")
        print(f"  Trades: {result.trade_count}")


if __name__ == "__main__":
    demo_parallel_backtest()
