# StockSelectorEngine MVP

Goal: Prove feasibility of an automatic, data-rich stock-picking MVP with price data + news sentiment, using a simple XGBoost model and SHAP explanations.

What’s included in this MVP:
- Data ingestion for daily price data (last 365 days) for a small US large-cap universe.
- Lightweight news sentiment scorer (extensible to real feeds).
- Simple feature engineering: momentum, one-day returns, sentiment.
- XGBoost regression model to predict next-day returns and rank stocks.
- SHAP-based output for interpretability.
- Lightweight rolling-window backtest with survival bias awareness and basic metrics.

Next steps (post-MVP):
- Add market regime classification and multi-model ensemble for dynamic weighting.
- Expand data sources to include earnings, advanced alternative data, and satellite data.
- Move to a production-grade data pipeline (Airflow/Prefect) and a proper CI/CD MLops setup.
