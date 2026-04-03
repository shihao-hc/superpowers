"""
Daily Review Script: Automatic end-of-day report generation.
- Aggregates daily performance, signals, and events
- Generates text report with placeholders
- Uses LLM to polish and enhance readability
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from dataclasses import dataclass
import json
import re


@dataclass
class DailyReport:
    """Structured daily report."""
    date: str
    market_summary: str
    top_signals: List[Dict]
    policy_events: List[Dict]
    portfolio_performance: Dict
    risk_metrics: Dict
    raw_summary: str
    polished_summary: Optional[str] = None


class DailyReviewGenerator:
    """Generates daily review reports from structured data."""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client  # Optional LLM for polishing

    def generate_report(
        self,
        date: str,
        price_df: Optional[pd.DataFrame] = None,
        signals_df: Optional[pd.DataFrame] = None,
        policy_events_df: Optional[pd.DataFrame] = None,
        portfolio_returns: Optional[List[float]] = None,
    ) -> DailyReport:
        """Generate a complete daily report from input data."""

        market_summary = self._generate_market_summary(price_df)
        top_signals = self._extract_top_signals(signals_df)
        policy_events = self._extract_policy_events(policy_events_df)
        portfolio_perf = self._calculate_portfolio_performance(portfolio_returns)
        risk_metrics = self._calculate_risk_metrics(portfolio_returns)

        raw_summary = self._build_raw_summary(
            date, market_summary, top_signals, policy_events, portfolio_perf, risk_metrics
        )

        polished = None
        if self.llm_client:
            polished = self._polish_with_llm(raw_summary)

        return DailyReport(
            date=date,
            market_summary=market_summary,
            top_signals=top_signals,
            policy_events=policy_events,
            portfolio_performance=portfolio_perf,
            risk_metrics=risk_metrics,
            raw_summary=raw_summary,
            polished_summary=polished,
        )

    def _generate_market_summary(self, price_df: Optional[pd.DataFrame]) -> str:
        """Generate market-wide summary from price data."""
        if price_df is None or price_df.empty:
            return "数据不可用"

        # Calculate daily market return
        daily_returns = price_df.groupby('date')['close'].mean().pct_change()
        latest_date = price_df['date'].max()
        latest_return = daily_returns.get(latest_date, 0)

        direction = "上涨" if latest_return > 0 else "下跌" if latest_return < 0 else "持平"
        return f"市场{direction} {abs(latest_return)*100:.2f}%"

    def _extract_top_signals(self, signals_df: Optional[pd.DataFrame]) -> List[Dict]:
        """Extract top trading signals."""
        if signals_df is None or signals_df.empty:
            return []

        top = signals_df.nlargest(5, 'score') if 'score' in signals_df.columns else signals_df.head(5)
        return top.to_dict('records')

    def _extract_policy_events(self, events_df: Optional[pd.DataFrame]) -> List[Dict]:
        """Extract policy events."""
        if events_df is None or events_df.empty:
            return []

        return events_df.head(3).to_dict('records')

    def _calculate_portfolio_performance(self, returns: Optional[List[float]]) -> Dict:
        """Calculate portfolio performance metrics."""
        if not returns:
            return {"daily_return": 0.0, "cumulative_return": 0.0, "win_rate": 0.0}

        daily_ret = returns[-1] if returns else 0.0
        cum_ret = np.prod([1 + r for r in returns]) - 1
        wins = sum(1 for r in returns if r > 0)
        win_rate = wins / len(returns) if returns else 0.0

        return {
            "daily_return": round(daily_ret, 4),
            "cumulative_return": round(cum_ret, 4),
            "win_rate": round(win_rate, 4),
        }

    def _calculate_risk_metrics(self, returns: Optional[List[float]]) -> Dict:
        """Calculate risk metrics."""
        if not returns or len(returns) < 2:
            return {"volatility": 0.0, "max_drawdown": 0.0, "sharpe": 0.0}

        vol = np.std(returns) * np.sqrt(252)
        max_dd = self._max_drawdown(returns)
        sharpe = np.mean(returns) / (np.std(returns) + 1e-9) * np.sqrt(252) if np.std(returns) > 0 else 0.0

        return {
            "volatility": round(vol, 4),
            "max_drawdown": round(max_dd, 4),
            "sharpe": round(sharpe, 4),
        }

    @staticmethod
    def _max_drawdown(returns: List[float]) -> float:
        peak = 0.0
        max_dd = 0.0
        cum = 1.0
        for r in returns:
            cum *= (1 + r)
            if cum > peak:
                peak = cum
            dd = (peak - cum) / peak if peak > 0 else 0.0
            if dd > max_dd:
                max_dd = dd
        return max_dd

    def _build_raw_summary(
        self,
        date: str,
        market_summary: str,
        top_signals: List[Dict],
        policy_events: List[Dict],
        portfolio_perf: Dict,
        risk_metrics: Dict,
    ) -> str:
        """Build raw text summary."""
        lines = [f"=== 每日复盘报告 ({date}) ===", ""]
        lines.append(f"【市场概况】{market_summary}")
        lines.append("")

        if top_signals:
            lines.append("【Top信号】")
            for i, s in enumerate(top_signals, 1):
                ticker = s.get('ticker', 'N/A')
                score = s.get('score', 0)
                lines.append(f"  {i}. {ticker}: {score:.4f}")
            lines.append("")

        if policy_events:
            lines.append("【政策事件】")
            for e in policy_events:
                headline = e.get('headline', '')[:50]
                impact = e.get('impact_score', 0)
                lines.append(f"  - {headline}... (影响: {impact:+.2f})")
            lines.append("")

        lines.append("【组合表现】")
        lines.append(f"  当日收益: {portfolio_perf.get('daily_return', 0)*100:.2f}%")
        lines.append(f"  累计收益: {portfolio_perf.get('cumulative_return', 0)*100:.2f}%")
        lines.append(f"  胜率: {portfolio_perf.get('win_rate', 0)*100:.1f}%")
        lines.append("")

        lines.append("【风险指标】")
        lines.append(f"  波动率: {risk_metrics.get('volatility', 0)*100:.2f}%")
        lines.append(f"  最大回撤: {risk_metrics.get('max_drawdown', 0)*100:.2f}%")
        lines.append(f"  夏普比率: {risk_metrics.get('sharpe', 0):.2f}")

        return "\n".join(lines)

    def _polish_with_llm(self, raw_summary: str) -> str:
        """Use LLM to polish the raw summary."""
        if not self.llm_client:
            return raw_summary

        prompt = f"""请将以下每日复盘报告润色为更专业、易读的格式，保留关键数据和洞察：

{raw_summary}

润色后的报告："""

        try:
            response = self.llm_client.complete(prompt)
            return response.text if hasattr(response, 'text') else str(response)
        except Exception as e:
            print(f"LLM polishing failed: {e}")
            return raw_summary


class LLMPolishClient:
    """Mock LLM client for testing. Replace with real LLM API in production."""

    def complete(self, prompt: str) -> object:
        class Response:
            text = "【报告已润色】\n\n" + prompt.replace("润色后的报告：", "").strip()
        return Response()


def generate_mock_report() -> DailyReport:
    """Generate a mock daily report for testing."""
    generator = DailyReviewGenerator(llm_client=LLMPolishClient())

    # Mock data
    date = datetime.utcnow().strftime("%Y-%m-%d")

    import numpy as np
    np.random.seed(42)
    returns = np.random.randn(20) * 0.02  # 20 days of returns

    return generator.generate_report(
        date=date,
        price_df=pd.DataFrame({
            'date': pd.date_range(end=date, periods=20),
            'close': 100 + np.cumsum(np.random.randn(20))
        }),
        signals_df=pd.DataFrame([
            {'ticker': 'AAPL', 'score': 0.85},
            {'ticker': 'MSFT', 'score': 0.72},
            {'ticker': 'GOOGL', 'score': 0.68},
        ]),
        policy_events_df=pd.DataFrame([
            {'date': date, 'headline': 'Fed maintains rates', 'impact_score': 0.1},
            {'date': date, 'headline': 'China boosts EV subsidies', 'impact_score': 0.3},
        ]),
        portfolio_returns=returns.tolist(),
    )


if __name__ == "__main__":
    report = generate_mock_report()
    print("=== RAW SUMMARY ===")
    print(report.raw_summary)
    print("\n=== POLISHED SUMMARY ===")
    print(report.polished_summary)
