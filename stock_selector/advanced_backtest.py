"""
Enhanced Backtest with Liquidity Cost & Market Rules.
- Liquidity cost model (impact cost based on order size and depth)
- A-share market rules (T+1, limit up/down, suspension)
- Advanced transaction cost modeling
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable
from dataclasses import dataclass, field
import json


@dataclass
class MarketRules:
    """Market-specific trading rules."""
    market: str = "US"  # "US", "A_SHARE"
    t1_enabled: bool = False  # T+1 settlement
    limit_up_pct: float = 0.10  # 10% for US, 10% for A-share
    limit_down_pct: float = 0.10
    min_trade_volume: int = 100  # Minimum lot size
    allow_short: bool = True
    stamp_duty_rate: float = 0.001  # A-share stamp duty

    @staticmethod
    def for_ashare() -> "MarketRules":
        """Get A-share market rules."""
        return MarketRules(
            market="A_SHARE",
            t1_enabled=True,
            limit_up_pct=0.10,
            limit_down_pct=0.10,
            min_trade_volume=100,
            allow_short=False,
            stamp_duty_rate=0.001
        )

    @staticmethod
    def for_us() -> "MarketRules":
        """Get US market rules."""
        return MarketRules(
            market="US",
            t1_enabled=False,
            limit_up_pct=0.10,
            limit_down_pct=0.10,
            min_trade_volume=1,
            allow_short=True,
            stamp_duty_rate=0.0
        )


class LiquidityCostModel:
    """Liquidity cost / market impact model."""

    def __init__(
        self,
        base_spread_bps: float = 5,  # Base bid-ask spread in bps
        impact_coefficient: float = 0.1  # Participation rate impact
    ):
        self.base_spread_bps = base_spread_bps
        self.impact_coefficient = impact_coefficient

    def calculate_impact_cost(
        self,
        order_value: float,
        avg_daily_volume: float,
        participation_rate: float = 0.05
    ) -> float:
        """
        Calculate market impact cost.
        
        Uses the square root model: Impact ∝ sqrt(participation_rate)
        """
        if avg_daily_volume <= 0:
            return order_value * self.base_spread_bps / 10000

        # Participation rate
        participation = order_value / avg_daily_volume
        
        # Square root impact model
        impact_bps = self.base_spread_bps + self.impact_coefficient * np.sqrt(participation * 100)
        
        return order_value * impact_bps / 10000

    def calculate_slippage(
        self,
        price: float,
        order_type: str,
        urgency: str = "normal"  # "low", "normal", "high"
    ) -> float:
        """Calculate slippage based on order type and urgency."""
        base_slippage = {
            "low": 0.0002,      # 2 bps
            "normal": 0.0005,   # 5 bps
            "high": 0.001       # 10 bps
        }
        
        slippage_pct = base_slippage.get(urgency, 0.0005)
        
        # Market order slippage
        if order_type == "market":
            slippage_pct *= 2
        
        return price * slippage_pct


class MarketRulesEngine:
    """Engine for enforcing market-specific trading rules."""

    def __init__(self, rules: MarketRules):
        self.rules = rules

    def check_order_validity(
        self,
        ticker: str,
        side: str,
        price: float,
        quantity: int,
        current_price: float,
        limit_status: str = "normal"  # "normal", "limit_up", "limit_down", "suspended"
    ) -> Dict:
        """
        Check if order is valid given market rules.
        
        Returns: {"valid": bool, "reason": str, "adjusted_price": float, "adjusted_qty": int}
        """
        issues = []
        adjusted_price = price
        adjusted_qty = quantity

        # Check limit status
        if limit_status == "suspended":
            return {"valid": False, "reason": "Trading suspended", "adjusted_price": 0, "adjusted_qty": 0}

        if limit_status == "limit_up" and side == "buy":
            issues.append("Cannot buy at limit up price")
        if limit_status == "limit_down" and side == "sell":
            issues.append("Cannot sell at limit down price")

        # Check price limits
        if price > 0:
            max_price = current_price * (1 + self.rules.limit_up_pct)
            min_price = current_price * (1 - self.rules.limit_down_pct)

            if side == "buy" and price > max_price:
                adjusted_price = max_price
                issues.append(f"Adjusted to limit up price: {max_price}")

            if side == "sell" and price < min_price:
                adjusted_price = min_price
                issues.append(f"Adjusted to limit down price: {min_price}")

        # Check quantity
        if quantity < self.rules.min_trade_volume:
            adjusted_qty = self.rules.min_trade_volume
            issues.append(f"Adjusted to minimum lot: {adjusted_qty}")

        return {
            "valid": len([i for i in issues if "Adjusted" not in i]) == 0,
            "reason": "; ".join(issues) if issues else "OK",
            "adjusted_price": adjusted_price,
            "adjusted_qty": adjusted_qty
        }

    def apply_t1_restriction(
        self,
        holdings: Dict[str, Dict],
        ticker: str,
        side: str,
        date: str,
        trade_history: List[Dict]
    ) -> bool:
        """
        Apply T+1 restriction for A-share market.
        
        Returns True if trade is allowed, False if not.
        """
        if not self.rules.t1_enabled:
            return True

        if side == "sell":
            # Check if stock was bought today
            today_buys = [
                t for t in trade_history
                if t.get('ticker') == ticker
                and t.get('side') == 'buy'
                and str(t.get('date')) == date
            ]
            if today_buys:
                return False

        return True


class AdvancedBacktester:
    """Advanced backtesting with liquidity cost and market rules."""

    def __init__(
        self,
        price_df: pd.DataFrame,
        initial_capital: float = 1000000.0,
        market_rules: Optional[MarketRules] = None,
        commission_rate: float = 0.0003,
        slippage_bps: float = 5,
        tax_rate: float = 0.001,
    ):
        self.price_df = price_df
        self.initial_capital = initial_capital
        self.market_rules = market_rules or MarketRules.for_us()
        self.liquidity_model = LiquidityCostModel()
        self.rules_engine = MarketRulesEngine(self.market_rules)

        self.commission_rate = commission_rate
        self.slippage_bps = slippage_bps
        self.tax_rate = tax_rate

    def _calculate_full_cost(
        self,
        price: float,
        quantity: int,
        side: str,
        avg_daily_volume: float = 0,
        order_type: str = "limit"
    ) -> Dict:
        """Calculate all transaction costs."""
        trade_value = price * quantity

        # Commission
        commission = trade_value * self.commission_rate

        # Slippage
        slippage = self.liquidity_model.calculate_slippage(
            price, order_type, urgency="normal"
        ) * quantity

        # Liquidity impact (for large orders)
        impact = self.liquidity_model.calculate_impact_cost(
            trade_value, avg_daily_volume
        )

        # Tax (for sells in A-share)
        tax = 0
        if side == "sell":
            tax = trade_value * self.tax_rate

        total_cost = commission + slippage + impact + tax

        return {
            "commission": commission,
            "slippage": slippage,
            "impact": impact,
            "tax": tax,
            "total": total_cost,
            "net_proceeds": trade_value - total_cost if side == "sell" else trade_value + total_cost
        }

    def run_with_rules(
        self,
        signals_df: pd.DataFrame,
        order_type: str = "limit",  # "market", "limit"
        urgency: str = "normal"
    ) -> Dict:
        """
        Run backtest with market rules and liquidity costs.
        """
        price_matrix = self.price_df.pivot(index='date', columns='ticker', values='close')
        volume_matrix = self.price_df.pivot(index='date', columns='ticker', values='volume')

        dates = sorted(price_matrix.index)
        cash = self.initial_capital
        holdings = {}
        trade_log = []
        daily_values = []

        # Track T+1 sell eligibility
        t1_eligible = {}  # ticker -> earliest sell date

        for i, date in enumerate(dates[:-1]):
            next_date = dates[i + 1]

            # Get signals
            current_signals = signals_df[signals_df['date'] == date]
            if current_signals.empty:
                continue

            target_tickers = set(current_signals.nlargest(10, 'score')['ticker'])
            current_tickers = set(holdings.keys())

            # Sell logic
            for ticker in current_tickers - target_tickers:
                if ticker not in price_matrix.columns:
                    continue

                price = price_matrix.loc[date, ticker]
                if pd.isna(price):
                    continue

                # T+1 check
                if not self.rules_engine.apply_t1_restriction(
                    holdings, ticker, "sell", str(date), trade_log
                ):
                    continue

                qty = holdings[ticker]['quantity']
                avg_vol = volume_matrix.loc[date, ticker] if ticker in volume_matrix.columns else 0

                costs = self._calculate_full_cost(price, qty, "sell", avg_vol, order_type)
                cash += costs['net_proceeds']

                trade_log.append({
                    "date": date,
                    "ticker": ticker,
                    "side": "sell",
                    "price": price,
                    "quantity": qty,
                    **costs
                })

                del holdings[ticker]

            # Buy logic
            if cash > 0:
                allocation = cash / max(len(target_tickers - current_tickers), 1)
                for ticker in target_tickers - current_tickers:
                    if ticker not in price_matrix.columns:
                        continue

                    price = price_matrix.loc[date, ticker]
                    if pd.isna(price) or price <= 0:
                        continue

                    # Check limit status
                    prev_price = price_matrix.iloc[i - 1][ticker] if i > 0 else price
                    pct_change = (price - prev_price) / prev_price if prev_price > 0 else 0

                    limit_status = "normal"
                    if pct_change >= self.market_rules.limit_up_pct - 0.001:
                        limit_status = "limit_up"
                    elif pct_change <= -self.market_rules.limit_down_pct + 0.001:
                        limit_status = "limit_down"

                    qty = int(allocation / price)
                    if qty < self.market_rules.min_trade_volume:
                        qty = self.market_rules.min_trade_volume

                    avg_vol = volume_matrix.loc[date, ticker] if ticker in volume_matrix.columns else 0

                    costs = self._calculate_full_cost(price, qty, "buy", avg_vol, order_type)
                    total_cost = price * qty + costs['total']

                    if total_cost <= cash:
                        cash -= total_cost
                        holdings[ticker] = {'quantity': qty, 'avg_price': price}
                        trade_log.append({
                            "date": date,
                            "ticker": ticker,
                            "side": "buy",
                            "price": price,
                            "quantity": qty,
                            **costs
                        })

            # Calculate portfolio value
            portfolio_value = cash
            for ticker, pos in holdings.items():
                if ticker in price_matrix.columns:
                    p = price_matrix.loc[next_date, ticker]
                    if not pd.isna(p):
                        portfolio_value += pos['quantity'] * p

            daily_values.append({
                "date": next_date,
                "value": portfolio_value,
                "cash": cash
            })

        return self._calculate_metrics(daily_values, trade_log)

    def _calculate_metrics(self, daily_values: List[Dict], trade_log: List[Dict]) -> Dict:
        """Calculate performance metrics."""
        if not daily_values:
            return {}

        values = [v['value'] for v in daily_values]
        returns = np.diff(values) / values[:-1] if len(values) > 1 else [0]

        initial = values[0]
        final = values[-1]
        total_return = (final - initial) / initial

        # Sharpe
        sharpe = np.mean(returns) / (np.std(returns) + 1e-9) * np.sqrt(252) if np.std(returns) > 0 else 0

        # Max Drawdown
        peak = 0
        max_dd = 0
        for v in values:
            if v > peak:
                peak = v
            dd = (peak - v) / peak if peak > 0 else 0
            if dd > max_dd:
                max_dd = dd

        # Trade statistics
        sells = [t for t in trade_log if t['side'] == 'sell']
        total_costs = sum(t.get('total', 0) for t in trade_log)

        return {
            "total_return": total_return,
            "final_value": final,
            "sharpe_ratio": sharpe,
            "max_drawdown": max_dd,
            "total_trades": len(trade_log),
            "total_costs": total_costs,
            "cost_rate": total_costs / initial if initial > 0 else 0,
            "equity_curve": daily_values
        }


class BacktestRunner:
    """
    Unified backtest runner that integrates all backtest features.
    Supports multiple strategies, parameter optimization, and result comparison.
    """

    def __init__(self, price_df: pd.DataFrame, market_rules: MarketRules = None):
        self.price_df = price_df
        self.market_rules = market_rules or MarketRules.for_us()
        self.results_cache = {}

    def run_single_strategy(
        self,
        signals_df: pd.DataFrame,
        strategy_name: str,
        params: dict = None
    ) -> dict:
        """Run single strategy backtest."""
        params = params or {}
        backtester = AdvancedBacktester(
            self.price_df,
            market_rules=self.market_rules,
            commission_rate=params.get('commission', 0.0003),
            slippage_bps=params.get('slippage', 5),
            tax_rate=params.get('tax', 0.001)
        )
        return backtester.run_with_rules(
            signals_df,
            order_type=params.get('order_type', 'limit'),
            urgency=params.get('urgency', 'normal')
        )

    def run_multiple_strategies(
        self,
        strategies: Dict[str, pd.DataFrame]
    ) -> pd.DataFrame:
        """Run and compare multiple strategies."""
        results = []
        for name, signals in strategies.items():
            result = self.run_single_strategy(signals, name)
            results.append({
                'strategy': name,
                'total_return': result.get('total_return', 0),
                'sharpe_ratio': result.get('sharpe_ratio', 0),
                'max_drawdown': result.get('max_drawdown', 0),
                'total_trades': result.get('total_trades', 0),
                'total_costs': result.get('total_costs', 0)
            })
        return pd.DataFrame(results)

    def parameter_optimization(
        self,
        base_signals: pd.DataFrame,
        param_grid: Dict[str, List]
    ) -> pd.DataFrame:
        """Run parameter optimization."""
        results = []
        import itertools
        for values in itertools.product(*param_grid.values()):
            params = dict(zip(param_grid.keys(), values))
            result = self.run_single_strategy(base_signals, 'optimize', params)
            results.append({**params, **result})
        return pd.DataFrame(results)


def demo_advanced_backtest():
    """Demo advanced backtest with market rules."""
    from stock_selector.data_pipeline import DataIngestor

    # Fetch data
    tickers = ["AAPL", "MSFT", "GOOGL"]
    di = DataIngestor(tickers, start_date="2025-01-01", end_date="2025-06-30")
    price_df = di.fetch_price_data()

    # US market backtest
    print("=== US Market Backtest ===")
    us_backtest = AdvancedBacktester(price_df, market_rules=MarketRules.for_us())
    us_result = us_backtest.run_with_rules(pd.DataFrame())
    print(f"Total Return: {us_result.get('total_return', 0)*100:.2f}%")
    print(f"Sharpe: {us_result.get('sharpe_ratio', 0):.2f}")
    print(f"Max Drawdown: {us_result.get('max_drawdown', 0)*100:.2f}%")
    print(f"Total Costs: ${us_result.get('total_costs', 0):.2f}")

    # A-share market backtest (simulated)
    print("\n=== A-Share Market Backtest ===")
    ashare_backtest = AdvancedBacktester(price_df, market_rules=MarketRules.for_ashare())
    ashare_result = ashare_backtest.run_with_rules(pd.DataFrame())
    print(f"Total Return: {ashare_result.get('total_return', 0)*100:.2f}%")
    print(f"Total Costs: ${ashare_result.get('total_costs', 0):.2f}")


if __name__ == "__main__":
    demo_advanced_backtest()
