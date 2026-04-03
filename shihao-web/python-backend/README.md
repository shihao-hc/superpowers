# ShiHao Finance - Python Backend

AI-powered stock selection and trading system built with Python 3.11+.

## Architecture

```
shihao_finance/
├── core/
│   ├── data/           # Multi-source data integration
│   │   ├── base.py     # Data provider interfaces
│   │   ├── akshare_provider.py  # A-share market data
│   │   ├── yfinance_provider.py # International market data
│   │   └── data_manager.py      # Unified data manager
│   ├── features/       # Feature engineering
│   │   ├── base.py     # Feature/factor interfaces
│   │   ├── technical.py # Technical indicators
│   │   └── feature_engine.py    # Feature computation engine
│   ├── models/         # ML models
│   │   ├── base.py     # Model interfaces
│   │   ├── trend_model.py       # Trend-following model
│   │   ├── ensemble_model.py    # Ensemble AI decision maker
│   │   └── stock_selector.py    # Stock selection pipeline
│   ├── trading/        # Trading execution
│   │   └── trading_engine.py    # Auto trading engine
│   ├── risk/           # Risk management
│   │   └── risk_guard.py        # Risk limits and monitoring
│   ├── backtest/       # Backtesting
│   │   └── backtest_engine.py   # Backtesting framework
│   └── xai/            # Explainable AI
│       └── xai_engine.py        # SHAP/LIME explanations
├── api/                # FastAPI application
│   └── main.py         # REST API endpoints
├── requirements.txt    # Dependencies
├── run.py             # Server entry point
└── test_backend.py    # Test script
```

## Features

### Data Layer
- Multi-source data integration (AKShare, YFinance)
- Real-time and historical OHLCV data
- Fundamental data (PE, PB, ROE, etc.)
- News and sentiment data
- Automatic fallback and health monitoring

### Feature Engineering
- 50+ technical indicators
- Price, volume, momentum, trend, volatility features
- Dynamic feature computation
- Time-series alignment

### ML Models
- Trend-following model (Gradient Boosting)
- Ensemble model with AI decision maker
- Market regime detection
- Feature importance analysis

### Trading Engine
- Signal processing and position sizing
- Order management
- Portfolio tracking
- P&L calculation

### Risk Management
- Position size limits
- Sector concentration limits
- Daily loss limits
- Maximum drawdown monitoring
- Symbol blacklist

### Backtesting
- Event-driven backtesting
- Survivorship bias correction
- Transaction cost modeling
- Performance metrics

### Explainable AI
- SHAP explanations
- LIME explanations
- Feature contribution analysis
- Global importance rankings

## Quick Start

### Install Dependencies

```bash
pip install -r requirements.txt
```

### Run Server

```bash
python run.py
```

Server will start at `http://localhost:8000`

### API Documentation

Visit `http://localhost:8000/docs` for interactive API docs.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| GET `/health` | Health check |
| GET `/health/detailed` | Detailed health status |
| GET `/api/market/list` | Get stock list |
| GET `/api/market/ohlcv/{symbol}` | Get OHLCV data |
| GET `/api/predict/{symbol}` | Get prediction for a stock |
| POST `/api/select` | Select stocks using AI |
| GET `/api/portfolio` | Get portfolio status |
| POST `/api/trade` | Execute a trade |
| GET `/api/risk/metrics` | Get risk metrics |
| GET `/api/risk/alerts` | Get risk alerts |

## Configuration

Configuration is done via environment variables or config files:

```bash
# Data providers
AKSHARE_ENABLED=true
YFINANCE_ENABLED=true

# Trading parameters
INITIAL_CAPITAL=1000000
MAX_POSITION_SIZE=0.1
MAX_TOTAL_POSITIONS=20

# Risk limits
MAX_DAILY_LOSS_PCT=0.02
MAX_DRAWDOWN_PCT=0.15
```

## Development

### Run Tests

```bash
python test_backend.py
```

### Code Style

```bash
black shihao_finance/
ruff shihao_finance/
```

## License

MIT License