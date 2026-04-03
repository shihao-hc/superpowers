# 拾号-金融 (ShiHao Finance)

AI-driven automated stock selection and trading system.

## Features

### System 1: Stock Selection Engine
- Multi-factor quantitative stock screening
- LLM-enhanced analysis with aggregated search
- Policy monitoring and daily review
- Knowledge base with RAG

### System 2: Trading Execution
- Complete perceive-decide-execute-evolve closed loop
- Paper trading simulator for backtest validation
- Order state machine (CREATED → PENDING → SUBMITTED → PARTIAL_FILLED → FILLED)

### Risk Management
- Independent RiskManager with kill switch
- Volatility-based dynamic position sizing
- Stress testing module (2008 crisis, COVID crash, etc.)
- Blacklist and position limits

### Data & Performance
- Unified Market Adapter (A-share, US, HK)
- Multiple data source redundancy with failover
- Numba-optimized backtesting
- SQLite factor database with model versioning

## Modules

| Module | File | Description |
|--------|------|-------------|
| Data Pipeline | `data_quality.py` | Data quality checks & DataPipeline |
| Stock Analysis | `stock_analysis.py` | Multi-factor analysis |
| Policy Monitor | `policy_monitor.py` | Policy tracking |
| Daily Review | `daily_review.py` | LLM-enhanced daily review |
| Knowledge Base | `quant_knowledge_base.py` | RAG-based knowledge base |
| Execution | `execution.py` | Order execution engine |
| Paper Trading | `paper_trading_simulator.py` | Backtest validation |
| Risk Manager | `risk_manager.py` | Risk control + dynamic sizing |
| Stress Testing | `stress_testing.py` | Black swan scenarios |
| Backtest | `advanced_backtest.py` | Cost model backtesting |
| Monitoring | `monitoring.py` | Alerts & XAI output |
| Market Adapter | `market_adapter.py` | Multi-market + redundancy |
| Factor DB | `factor_db.py` | Factor & model versioning |

## Quick Start

```python
from stock_selector import RiskManager, StressTestingEngine

# Risk management with volatility-based sizing
rm = RiskManager(
    initial_capital=1000000,
    max_position_pct=0.10,
    max_daily_loss_pct=0.02
)
rm.update_dynamic_params(market_regime="volatile", confidence=0.8)

# Stress testing
engine = StressTestingEngine(max_acceptable_drawdown=0.30)
positions = {"AAPL": {"quantity": 1000, "avg_price": 150}}
report = engine.run_all_scenarios(positions)
print(f"Worst case: {report.worst_case_drawdown_pct:.1%}")
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    ShiHao Finance                          │
├─────────────────────────────────────────────────────────────┤
│  Stock Selection  │  Execution  │  Risk  │  Monitoring      │
│  ───────────────  ───────────  ──────  ──────────         │
│  ├─ DataPipeline  │  Trading   │  Risk  │  Alerts         │
│  ├─ StockAnalysis │  Loop      │  Mgmt  │  XAI            │
│  ├─ PolicyMonitor│  Execution │  Guard │  Metrics         │
│  └─ DailyReview  │            │  Kill  │                 │
│                  │            │  Switch│                 │
├─────────────────────────────────────────────────────────────┤
│  Data Layer: MarketAdapter (A-share/US/HK) + FactorDB     │
└─────────────────────────────────────────────────────────────┘
```

## Deployment

```bash
# Docker
docker-compose -f docker/shihao-docker-compose.yml up -d
```

## Requirements

- Python 3.10+
- pandas, numpy
- akshare (A-share data)
- yfinance (US data)
- scikit-learn (ML models)

See `requirements.txt` for full list.
