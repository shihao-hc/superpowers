"""
Stress Testing Module: Market crash and black swan scenario testing.
- Historical crash replay (2008, 2020, etc.)
- Custom scenario simulation
- Liquidity stress tests
- Correlation breakdown scenarios
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Callable
from dataclasses import dataclass, field
from enum import Enum
import json
import random


class StressScenario(Enum):
    """Predefined stress scenarios."""
    FINANCIAL_CRISIS_2008 = "financial_crisis_2008"
    COVID_CRASH_2020 = "covid_crash_2020"
    BLACK_MONDAY_1987 = "black_monday_1987"
    DOT_COM_BURST = "dot_com_burst"
    FLASH_CRASH = "flash_crash"
    LIQUIDITY_CRISIS = "liquidity_crisis"
    CORRELATION_BREAKDOWN = "correlation_breakdown"
    CUSTOM = "custom"


class StressSeverity(Enum):
    """Stress test severity levels."""
    MILD = "mild"
    MODERATE = "moderate"
    SEVERE = "severe"
    EXTREME = "extreme"


@dataclass
class ScenarioConfig:
    """Configuration for a stress scenario."""
    scenario_type: StressScenario
    severity: StressSeverity
    duration_days: int
    peak_decline_pct: float
    recovery_days: int
    volatility_multiplier: float
    correlation_change: float = 0.0  # Correlation change between assets


@dataclass
class StressResult:
    """Stress test result."""
    scenario: str
    severity: str
    initial_value: float
    min_value: float
    max_drawdown_pct: float
    days_to_recover: int
    final_value: float
    total_return_pct: float
    sharpe_stress: float
    max_daily_loss_pct: float
    var_95: float
    cvar_95: float
    passed: bool
    failure_reason: str = ""


@dataclass
class StressReport:
    """Comprehensive stress test report."""
    timestamp: str
    scenarios_tested: List[str]
    overall_passed: bool
    worst_case_scenario: str
    worst_case_drawdown_pct: float
    results: List[StressResult] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)


class StressTestingEngine:
    """
    Stress testing engine for portfolio resilience analysis.
    """

    # Historical scenario configurations
    SCENARIO_CONFIGS = {
        StressScenario.FINANCIAL_CRISIS_2008: ScenarioConfig(
            scenario_type=StressScenario.FINANCIAL_CRISIS_2008,
            severity=StressSeverity.SEVERE,
            duration_days=370,
            peak_decline_pct=0.50,
            recovery_days=750,
            volatility_multiplier=2.5,
            correlation_change=0.3
        ),
        StressScenario.COVID_CRASH_2020: ScenarioConfig(
            scenario_type=StressScenario.COVID_CRASH_2020,
            severity=StressSeverity.MODERATE,
            duration_days=33,
            peak_decline_pct=0.34,
            recovery_days=60,
            volatility_multiplier=3.0,
            correlation_change=0.2
        ),
        StressScenario.BLACK_MONDAY_1987: ScenarioConfig(
            scenario_type=StressScenario.BLACK_MONDAY_1987,
            severity=StressSeverity.EXTREME,
            duration_days=1,
            peak_decline_pct=0.22,
            recovery_days=30,
            volatility_multiplier=5.0,
            correlation_change=0.4
        ),
        StressScenario.DOT_COM_BURST: ScenarioConfig(
            scenario_type=StressScenario.DOT_COM_BURST,
            severity=StressSeverity.SEVERE,
            duration_days=500,
            peak_decline_pct=0.45,
            recovery_days=900,
            volatility_multiplier=2.0,
            correlation_change=0.2
        ),
        StressScenario.FLASH_CRASH: ScenarioConfig(
            scenario_type=StressScenario.FLASH_CRASH,
            severity=StressSeverity.MODERATE,
            duration_days=1,
            peak_decline_pct=0.10,
            recovery_days=5,
            volatility_multiplier=4.0,
            correlation_change=0.5
        ),
        StressScenario.LIQUIDITY_CRISIS: ScenarioConfig(
            scenario_type=StressScenario.LIQUIDITY_CRISIS,
            severity=StressSeverity.SEVERE,
            duration_days=30,
            peak_decline_pct=0.25,
            recovery_days=120,
            volatility_multiplier=1.5,
            correlation_change=0.6
        ),
        StressScenario.CORRELATION_BREAKDOWN: ScenarioConfig(
            scenario_type=StressScenario.CORRELATION_BREAKDOWN,
            severity=StressSeverity.MODERATE,
            duration_days=60,
            peak_decline_pct=0.15,
            recovery_days=90,
            volatility_multiplier=1.8,
            correlation_change=0.8
        ),
    }

    def __init__(
        self,
        initial_capital: float = 1000000.0,
        max_acceptable_drawdown: float = 0.30,
        var_confidence: float = 0.95,
    ):
        self.initial_capital = initial_capital
        self.max_acceptable_drawdown = max_acceptable_drawdown
        self.var_confidence = var_confidence
        self.test_results: List[StressResult] = []

    def generate_scenario_returns(
        self,
        config: ScenarioConfig,
        num_days: int = None
    ) -> pd.Series:
        """Generate synthetic returns for a stress scenario."""
        num_days = num_days or config.duration_days
        
        t = np.linspace(0, np.pi, config.duration_days)
        decline_curve = np.sin(t) * config.peak_decline_pct
        
        volatility = 0.02 * config.volatility_multiplier
        noise = np.random.normal(0, volatility, config.duration_days)
        
        daily_returns = -(decline_curve / config.duration_days) + noise
        
        if config.duration_days < num_days:
            recovery = np.linspace(0, config.peak_decline_pct * 0.3, num_days - config.duration_days)
            daily_returns = np.concatenate([daily_returns, recovery])
        
        return pd.Series(daily_returns)

    def run_scenario(
        self,
        config: ScenarioConfig,
        positions: Dict[str, Dict],
        daily_returns_func: Callable[[str, datetime], Optional[float]] = None
    ) -> StressResult:
        """Run a single stress scenario."""
        portfolio_values = [self.initial_capital]
        current_value = self.initial_capital
        
        scenario_returns = self.generate_scenario_returns(config)
        
        for i, daily_return in enumerate(scenario_returns):
            position_loss = 0
            for ticker, pos in positions.items():
                if daily_returns_func:
                    ticker_return = daily_returns_func(ticker, datetime.now())
                    if ticker_return is not None:
                        position_loss += pos.get('quantity', 0) * pos.get('avg_price', 0) * ticker_return
                else:
                    position_loss += current_value * daily_return * (
                        pos.get('quantity', 0) * pos.get('avg_price', 0) / self.initial_capital
                    )
            
            current_value *= (1 + daily_return)
            current_value = max(current_value, 0)
            portfolio_values.append(current_value)
        
        portfolio_series = pd.Series(portfolio_values)
        
        peak = portfolio_series.expanding().max()
        drawdown = (portfolio_series - peak) / peak
        max_drawdown = drawdown.min()
        
        min_value = portfolio_series.min()
        final_value = portfolio_series.iloc[-1]
        
        returns = portfolio_series.pct_change().dropna()
        sharpe_stress = returns.mean() / returns.std() * np.sqrt(252) if returns.std() > 0 else 0
        
        max_daily_loss = returns.min()
        
        sorted_returns = returns.sort_values()
        var_idx = int((1 - self.var_confidence) * len(sorted_returns))
        var_95 = sorted_returns.iloc[var_idx] if var_idx < len(sorted_returns) else 0
        cvar_95 = sorted_returns.iloc[:var_idx].mean() if var_idx > 0 else var_95
        
        recovery_mask = portfolio_series >= self.initial_capital * (1 + max_drawdown * 0.5)
        days_to_recover = 0
        for i, v in enumerate(recovery_mask):
            if v and i > len(portfolio_series) // 2:
                days_to_recover = i - len(portfolio_series) // 2
                break
        
        total_return = (final_value - self.initial_capital) / self.initial_capital
        
        passed = abs(max_drawdown) < self.max_acceptable_drawdown
        failure_reason = "" if passed else f"Max drawdown {abs(max_drawdown):.1%} exceeds limit"
        
        return StressResult(
            scenario=config.scenario_type.value,
            severity=config.severity.value,
            initial_value=self.initial_capital,
            min_value=min_value,
            max_drawdown_pct=max_drawdown,
            days_to_recover=days_to_recover,
            final_value=final_value,
            total_return_pct=total_return,
            sharpe_stress=sharpe_stress,
            max_daily_loss_pct=max_daily_loss,
            var_95=var_95,
            cvar_95=cvar_95,
            passed=passed,
            failure_reason=failure_reason
        )

    def run_all_scenarios(
        self,
        positions: Dict[str, Dict],
        daily_returns_func: Callable[[str, datetime], Optional[float]] = None
    ) -> StressReport:
        """Run all predefined stress scenarios."""
        results = []
        
        for scenario_type, config in self.SCENARIO_CONFIGS.items():
            result = self.run_scenario(config, positions, daily_returns_func)
            results.append(result)
        
        passed_all = all(r.passed for r in results)
        worst = min(results, key=lambda r: r.max_drawdown_pct)
        
        recommendations = self._generate_recommendations(results)
        
        return StressReport(
            timestamp=datetime.now().isoformat(),
            scenarios_tested=[r.scenario for r in results],
            overall_passed=passed_all,
            worst_case_scenario=worst.scenario,
            worst_case_drawdown_pct=worst.max_drawdown_pct,
            results=results,
            recommendations=recommendations
        )

    def run_custom_scenario(
        self,
        name: str,
        severity: StressSeverity,
        peak_decline_pct: float,
        duration_days: int,
        volatility_multiplier: float,
        positions: Dict[str, Dict],
        daily_returns_func: Callable = None
    ) -> StressResult:
        """Run a custom stress scenario."""
        config = ScenarioConfig(
            scenario_type=StressScenario.CUSTOM,
            severity=severity,
            duration_days=duration_days,
            peak_decline_pct=peak_decline_pct,
            recovery_days=int(duration_days * 0.5),
            volatility_multiplier=volatility_multiplier
        )
        return self.run_scenario(config, positions, daily_returns_func)

    def _generate_recommendations(self, results: List[StressResult]) -> List[str]:
        """Generate recommendations based on stress test results."""
        recommendations = []
        
        worst = min(results, key=lambda r: r.max_drawdown_pct)
        
        if worst.max_drawdown_pct < -0.30:
            recommendations.append("CRITICAL: Reduce position sizes by at least 30%")
            recommendations.append("Add diversifying assets (bonds, gold, cash)")
        
        if worst.scenario == "liquidity_crisis":
            recommendations.append("Maintain higher cash reserves (20%+)")
            recommendations.append("Limit exposure to illiquid assets")
        
        if worst.scenario == "correlation_breakdown":
            recommendations.append("Review portfolio correlation structure")
            recommendations.append("Add uncorrelated assets")
        
        var_failures = [r for r in results if r.var_95 < -0.10]
        if var_failures:
            recommendations.append("Consider VaR-based position limits")
        
        cvar_failures = [r for r in results if r.cvar_95 < -0.15]
        if cvar_failures:
            recommendations.append("Implement downside protection (options, stops)")
        
        if all(r.sharpe_stress < 0 for r in results):
            recommendations.append("Review risk-reward ratio across all positions")
        
        if not recommendations:
            recommendations.append("Portfolio passes all stress tests - maintain current allocation")
        
        return recommendations

    def export_report(self, report: StressReport, filepath: str) -> None:
        """Export stress test report to JSON."""
        data = {
            "timestamp": report.timestamp,
            "scenarios_tested": report.scenarios_tested,
            "overall_passed": report.overall_passed,
            "worst_case_scenario": report.worst_case_scenario,
            "worst_case_drawdown_pct": report.worst_case_drawdown_pct,
            "recommendations": report.recommendations,
            "results": [
                {
                    "scenario": r.scenario,
                    "severity": r.severity,
                    "initial_value": r.initial_value,
                    "min_value": r.min_value,
                    "max_drawdown_pct": r.max_drawdown_pct,
                    "days_to_recover": r.days_to_recover,
                    "final_value": r.final_value,
                    "total_return_pct": r.total_return_pct,
                    "sharpe_stress": r.sharpe_stress,
                    "max_daily_loss_pct": r.max_daily_loss_pct,
                    "var_95": r.var_95,
                    "cvar_95": r.cvar_95,
                    "passed": r.passed,
                    "failure_reason": r.failure_reason
                }
                for r in report.results
            ]
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)


def demo_stress_testing():
    """Demo stress testing engine."""
    engine = StressTestingEngine(
        initial_capital=1000000,
        max_acceptable_drawdown=0.30
    )
    
    positions = {
        "AAPL": {"quantity": 1000, "avg_price": 150},
        "MSFT": {"quantity": 500, "avg_price": 300},
        "GOOGL": {"quantity": 200, "avg_price": 2800},
    }
    
    print("Running all stress scenarios...")
    report = engine.run_all_scenarios(positions)
    
    print(f"\n{'='*60}")
    print(f"STRESS TEST REPORT")
    print(f"{'='*60}")
    print(f"Overall Passed: {report.overall_passed}")
    print(f"Worst Case: {report.worst_case_scenario} ({report.worst_case_drawdown_pct:.1%})")
    
    print(f"\nResults by Scenario:")
    for result in report.results:
        status = "✓ PASS" if result.passed else "✗ FAIL"
        print(f"  {result.scenario}: {result.max_drawdown_pct:.1%} ({status})")
    
    print(f"\nRecommendations:")
    for rec in report.recommendations:
        print(f"  - {rec}")
    
    print(f"\nRunning custom scenario...")
    custom = engine.run_custom_scenario(
        name="my_custom_crash",
        severity=StressSeverity.SEVERE,
        peak_decline_pct=0.35,
        duration_days=45,
        volatility_multiplier=2.5,
        positions=positions
    )
    print(f"Custom scenario max drawdown: {custom.max_drawdown_pct:.1%}")


if __name__ == "__main__":
    demo_stress_testing()
