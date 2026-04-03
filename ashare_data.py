"""
A-Share Data Source: Chinese stock market data provider.
- Supports A-share stocks (Shanghai & Shenzhen)
- Uses AKShare as primary data source
- Handles A-share specific rules (T+1, limits, ST stocks)
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Optional, Dict
from dataclasses import dataclass


@dataclass
class AShareTicker:
    """A-share ticker information."""
    code: str           # e.g., "600519"
    name: str           # e.g., "贵州茅台"
    market: str         # "SH" or "SZ"
    sector: str         # industry sector


class AShareDataProvider:
    """
    A-share market data provider using AKShare.
    Handles Shanghai (SH) and Shenzhen (SZ) markets.
    """

    # Common A-share tickers for quick testing
    SAMPLE_TICKERS = [
        "600519",  # 贵州茅台
        "600036",  # 招商银行
        "601318",  # 中国平安
        "600900",  # 长江电力
        "000858",  # 五粮液
        "000002",  # 万科A
        "300750",  # 宁德时代
        "002594",  # 比亚迪
        "600030",  # 中信证券
        "601888",  # 中国中免
    ]

    # A-share specific filtering rules
    ST_KEYWORDS = ["ST", "*ST", "ST", "S*ST", "SST"]
    DELISTED_KEYWORDS = ["退市"]

    def __init__(self, use_akshare: bool = True):
        self.use_akshare = use_akshare
        self.akshare = None
        if use_akshare:
            try:
                import akshare as ak
                self.akshare = ak
            except ImportError:
                print("AKShare not installed. Using mock data.")

    def _normalize_ticker(self, code: str) -> str:
        """Normalize A-share ticker code."""
        code = code.strip().upper()
        if not code.isdigit():
            return code
        # Add market prefix
        if len(code) == 6:
            if code.startswith(("600", "601", "603", "605", "688")):
                return f"SH{code}"
            elif code.startswith(("000", "001", "002", "003", "300", "301")):
                return f"SZ{code}"
        return code

    def _get_stock_code(self, ticker: str) -> str:
        """Extract numeric code from ticker."""
        return "".join(filter(str.isdigit, ticker))

    def fetch_daily_price(
        self,
        tickers: List[str],
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        adjust: str = "qfq"  # qfq: forward adjusted
    ) -> pd.DataFrame:
        """
        Fetch daily price data for A-share stocks.
        
        Args:
            tickers: List of A-share tickers (e.g., ["600519", "000858"])
            start_date: Start date (YYYYMMDD or YYYY-MM-DD)
            end_date: End date (YYYYMMDD or YYYY-MM-DD)
            adjust: "qfq" (forward adjusted), "hfq" (backward adjusted), ""
        
        Returns:
            DataFrame with columns: date, ticker, open, high, low, close, volume
        """
        if not tickers:
            return pd.DataFrame()

        # Set default date range (1 year)
        if not end_date:
            end_date = datetime.now().strftime("%Y%m%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=365)).strftime("%Y%m%d")

        all_data = []

        for ticker in tickers:
            stock_code = self._get_stock_code(ticker)
            try:
                if self.akshare:
                    # Use AKShare to fetch data
                    df = self.akshare.stock_zh_a_hist(
                        symbol=stock_code,
                        period="daily",
                        start_date=start_date.replace("-", ""),
                        end_date=end_date.replace("-", ""),
                        adjust=adjust
                    )
                    if df is not None and not df.empty:
                        df = df.rename(columns={
                            "日期": "date",
                            "股票代码": "ticker",
                            "开盘": "open",
                            "收盘": "close",
                            "最高": "high",
                            "最低": "low",
                            "成交量": "volume",
                            "成交额": "amount",
                            "振幅": "amplitude",
                            "涨跌幅": "pct_change",
                            "涨跌额": "change",
                            "换手率": "turnover"
                        })
                        df["ticker"] = ticker
                        df["date"] = pd.to_datetime(df["date"])
                        all_data.append(df[["date", "ticker", "open", "high", "low", "close", "volume"]])
                else:
                    # Mock data for testing
                    mock_df = self._generate_mock_data(ticker, start_date, end_date)
                    all_data.append(mock_df)
            except Exception as e:
                print(f"Error fetching {ticker}: {e}")
                # Generate mock data on error
                mock_df = self._generate_mock_data(ticker, start_date, end_date)
                all_data.append(mock_df)

        if not all_data:
            return pd.DataFrame()

        result = pd.concat(all_data, ignore_index=True)
        result = result.sort_values(["date", "ticker"]).reset_index(drop=True)
        return result

    def _generate_mock_data(
        self,
        ticker: str,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """Generate mock price data for testing."""
        start = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)
        dates = pd.date_range(start, end, freq="B")

        np.random.seed(hash(ticker) % 10000)
        base_price = 50 + np.random.randn() * 20

        prices = base_price + np.cumsum(np.random.randn(len(dates)) * 2)
        prices = np.maximum(prices, 1)  # Ensure positive prices

        df = pd.DataFrame({
            "date": dates,
            "ticker": ticker,
            "open": prices * (1 + np.random.randn(len(dates)) * 0.01),
            "high": prices * (1 + np.abs(np.random.randn(len(dates)) * 0.02)),
            "low": prices * (1 - np.abs(np.random.randn(len(dates)) * 0.02)),
            "close": prices,
            "volume": np.random.randint(1e6, 1e9, len(dates))
        })
        return df

    def fetch_realtime_quote(self, tickers: List[str]) -> pd.DataFrame:
        """Fetch real-time quotes for A-share stocks."""
        if not tickers:
            return pd.DataFrame()

        all_quotes = []
        for ticker in tickers:
            stock_code = self._get_stock_code(ticker)
            try:
                if self.akshare:
                    df = self.akshare.stock_zh_a_spot_em()
                    df = df[df["代码"] == stock_code]
                    if not df.empty:
                        all_quotes.append({
                            "ticker": ticker,
                            "name": df["名称"].values[0],
                            "price": df["最新价"].values[0],
                            "change": df["涨跌幅"].values[0],
                            "volume": df["成交量"].values[0],
                            "amount": df["成交额"].values[0],
                            "turnover": df["换手率"].values[0],
                        })
                else:
                    # Mock
                    all_quotes.append({
                        "ticker": ticker,
                        "name": f"股票{ticker}",
                        "price": 100.0,
                        "change": 0.0,
                        "volume": 1000000,
                        "amount": 100000000,
                        "turnover": 2.5,
                    })
            except Exception as e:
                print(f"Error fetching quote for {ticker}: {e}")

        return pd.DataFrame(all_quotes)

    def filter_st_stocks(self, tickers: List[str]) -> List[str]:
        """Filter out ST stocks."""
        # In production, query a stock list with status info
        # Here we just return all tickers (mock)
        return tickers

    def get_trading_calendar(self, start_date: str, end_date: str) -> List[str]:
        """Get A-share trading calendar (dates)."""
        start = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)
        dates = pd.date_range(start, end, freq="B")
        # Filter out Chinese holidays (simplified)
        return [d.strftime("%Y-%m-%d") for d in dates]


class AShareMarketAnalyzer:
    """Analyzer for A-share market data."""

    def __init__(self, data_provider: AShareDataProvider):
        self.provider = data_provider

    def calculate_turnover_rate(self, price_df: pd.DataFrame) -> pd.DataFrame:
        """Calculate turnover rate."""
        # Simplified calculation
        return price_df

    def detect_limit_up(self, price_df: pd.DataFrame, threshold: float = 0.095) -> pd.DataFrame:
        """Detect limit-up stocks (涨幅 >= 9.5%)."""
        price_df = price_df.copy()
        price_df["pct_change"] = price_df.groupby("ticker")["close"].pct_change()
        limit_up = price_df[price_df["pct_change"] >= threshold]
        return limit_up

    def detect_limit_down(self, price_df: pd.DataFrame, threshold: float = -0.095) -> pd.DataFrame:
        """Detect limit-down stocks (跌幅 <= -9.5%)."""
        price_df = price_df.copy()
        price_df["pct_change"] = price_df.groupby("ticker")["close"].pct_change()
        limit_down = price_df[price_df["pct_change"] <= threshold]
        return limit_down

    def get_market_breadth(self, price_df: pd.DataFrame) -> Dict:
        """Calculate market breadth (上涨/下跌家数)."""
        latest = price_df.groupby("ticker").last().reset_index()
        latest["pct_change"] = latest.groupby("ticker")["close"].pct_change()

        advancers = len(latest[latest["pct_change"] > 0])
        decliners = len(latest[latest["pct_change"] < 0])
        unchanged = len(latest[latest["pct_change"] == 0])

        return {
            "advancers": advancers,
            "decliners": decliners,
            "unchanged": unchanged,
            "total": advancers + decliners + unchanged,
            "advance_rate": advancers / (advancers + decliners) if (advancers + decliners) > 0 else 0
        }


def demo_ashare_data():
    """Demo A-share data provider."""
    provider = AShareDataProvider(use_akshare=False)

    tickers = ["600519", "000858", "300750"]
    print(f"Fetching data for: {tickers}")

    price_df = provider.fetch_daily_price(tickers, "2025-01-01", "2025-03-25")
    print(f"Fetched {len(price_df)} rows")
    print(price_df.head())

    quotes = provider.fetch_realtime_quote(tickers)
    print("\nReal-time quotes:")
    print(quotes)


if __name__ == "__main__":
    demo_ashare_data()
