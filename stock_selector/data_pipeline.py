"""
Data ingestion and basic feature engineering for MVP StockSelectorEngine.
This module provides a lightweight path to fetch daily price data for a list of
tickers over the past year using yfinance and expose a clean long-format dataframe.
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta

try:
    import yfinance as yf
except Exception:
    yf = None  # pragma: no cover


class DataIngestor:
    def __init__(self, tickers, start_date: str | None = None, end_date: str | None = None, sources: dict | None = None):
        self.tickers = tickers if isinstance(tickers, (list, tuple)) else [tickers]
        self.start_date = start_date
        self.end_date = end_date
        self.sources = sources or {}

    def _default_date_range(self) -> tuple[str, str]:
        end = self.end_date or datetime.utcnow().strftime("%Y-%m-%d")
        # Use roughly one calendar year of data by default
        if self.start_date:
            start = self.start_date
        else:
            end_dt = datetime.strptime(end, "%Y-%m-%d")
            start = (end_dt - timedelta(days=365)).strftime("%Y-%m-%d")
        return start, end

    def fetch_price_data(self) -> pd.DataFrame:
        """Fetch daily close prices for all tickers and return a long-form dataframe.
        Columns: date, ticker, close, volume
        """
        if yf is None:
            raise RuntimeError("yfinance is not installed. Install it to fetch price data.")
        start, end = self._default_date_range()
        frames = []
        for t in self.tickers:
            df = yf.download(t, start=start, end=end, progress=False)
            if df is None or df.empty:
                continue
            df = df.reset_index()[['Date', 'Close', 'Volume']].rename(columns={'Date': 'date', 'Close': 'close', 'Volume': 'volume'})
            df['ticker'] = t
            frames.append(df)
        if not frames:
            return pd.DataFrame(columns=["date", "ticker", "close", "volume"])
        price_df = pd.concat(frames, ignore_index=True)
        price_df['date'] = pd.to_datetime(price_df['date']).dt.normalize()
        price_df = price_df.sort_values(['date', 'ticker']).reset_index(drop=True)
        return price_df

    def to_price_matrix(self, price_df: pd.DataFrame) -> pd.DataFrame:
        """Pivot to wide matrix: rows=date, columns=ticker, values=close"""
        if price_df is None or price_df.empty:
            return pd.DataFrame()
        pivot = price_df.pivot(index='date', columns='ticker', values='close')
        return pivot
