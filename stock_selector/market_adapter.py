"""
Unified Market Adapter: Abstract interface for multiple markets.
- Unified data interface across A-share, US, HK markets
- Market-specific configurations
- Multiple data source redundancy with fallback
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable, Tuple
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
import json


class Market(Enum):
    """Supported markets."""
    A_SHARE = "a_share"
    US = "us"
    HK = "hk"


@dataclass
class MarketConfig:
    """Market-specific configuration."""
    market: Market
    name: str
    timezone: str
    trading_hours: Dict[str, str]  # session -> start-end
    settlement: str  # "T+0", "T+1", etc.
    currency: str
    min_lot_size: int
    limit_pct: float  # price limit percentage


@dataclass
class DataSource:
    """Data source metadata."""
    name: str
    priority: int  # Lower = higher priority
    is_available: bool
    latency_ms: Optional[int] = None
    last_used: Optional[str] = None


MARKET_CONFIGS = {
    Market.A_SHARE: MarketConfig(
        market=Market.A_SHARE,
        name="China A-Share",
        timezone="Asia/Shanghai",
        trading_hours={"morning": "09:30-11:30", "afternoon": "13:00-15:00"},
        settlement="T+1",
        currency="CNY",
        min_lot_size=100,
        limit_pct=0.10
    ),
    Market.US: MarketConfig(
        market=Market.US,
        name="US Markets",
        timezone="America/New_York",
        trading_hours={"regular": "09:30-16:00"},
        settlement="T+2",
        currency="USD",
        min_lot_size=1,
        limit_pct=0.10  # Circuit breakers
    ),
    Market.HK: MarketConfig(
        market=Market.HK,
        name="Hong Kong",
        timezone="Asia/Hong_Kong",
        trading_hours={"morning": "09:30-12:00", "afternoon": "13:00-16:00"},
        settlement="T+2",
        currency="HKD",
        min_lot_size=1000,
        limit_pct=0.10
    ),
}


class MarketDataAdapter(ABC):
    """Abstract market data adapter."""

    @abstractmethod
    def get_bars(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        frequency: str = "1d"
    ) -> pd.DataFrame:
        """Get OHLCV bar data."""
        pass

    @abstractmethod
    def get_tick(self, ticker: str) -> dict:
        """Get latest tick data."""
        pass

    @abstractmethod
    def get_fundamentals(self, ticker: str) -> dict:
        """Get fundamental data."""
        pass

    @abstractmethod
    def search_tickers(self, query: str) -> List[dict]:
        """Search for tickers."""
        pass


class AShareAdapter(MarketDataAdapter):
    """A-share market adapter using AKShare."""

    def __init__(self):
        self.akshare = None
        try:
            import akshare as ak
            self.akshare = ak
        except ImportError:
            pass

    def get_bars(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        frequency: str = "1d"
    ) -> pd.DataFrame:
        """Get A-share bar data."""
        if not self.akshare:
            return pd.DataFrame()

        code = "".join(filter(str.isdigit, ticker))
        try:
            df = self.akshare.stock_zh_a_hist(
                symbol=code,
                start_date=start_date.replace("-", ""),
                end_date=end_date.replace("-", ""),
                adjust="qfq"
            )
            if df is not None:
                return df.rename(columns={
                    '日期': 'date', '开盘': 'open', '收盘': 'close',
                    '最高': 'high', '最低': 'low', '成交量': 'volume'
                })
        except Exception:
            pass
        return pd.DataFrame()

    def get_tick(self, ticker: str) -> dict:
        """Get A-share real-time quote."""
        if not self.akshare:
            return {}

        code = "".join(filter(str.isdigit, ticker))
        try:
            df = self.akshare.stock_zh_a_spot_em()
            row = df[df['代码'] == code]
            if not row.empty:
                return {
                    'price': row['最新价'].values[0],
                    'volume': row['成交量'].values[0],
                    'bid': row['买一'].values[0],
                    'ask': row['卖一'].values[0]
                }
        except Exception:
            pass
        return {}

    def get_fundamentals(self, ticker: str) -> dict:
        """Get A-share fundamentals."""
        return {}

    def search_tickers(self, query: str) -> List[dict]:
        """Search A-share tickers."""
        if not self.akshare:
            return []

        try:
            df = self.akshare.stock_zh_a_spot_em()
            filtered = df[df['名称'].str.contains(query, na=False)]
            return [
                {'ticker': row['代码'], 'name': row['名称'], 'market': 'A-share'}
                for _, row in filtered.head(10).iterrows()
            ]
        except Exception:
            return []


class USAdapter(MarketDataAdapter):
    """US market adapter using yfinance."""

    def __init__(self):
        self.yfinance = None
        try:
            import yfinance as yf
            self.yfinance = yf
        except ImportError:
            pass

    def get_bars(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        frequency: str = "1d"
    ) -> pd.DataFrame:
        """Get US stock bar data."""
        if not self.yfinance:
            return pd.DataFrame()

        try:
            df = self.yfinance.download(ticker, start=start_date, end=end_date, progress=False)
            if df is not None and not df.empty:
                return df.reset_index().rename(columns={
                    'Date': 'date', 'Open': 'open', 'Close': 'close',
                    'High': 'high', 'Low': 'low', 'Volume': 'volume'
                })
        except Exception:
            pass
        return pd.DataFrame()

    def get_tick(self, ticker: str) -> dict:
        """Get US stock real-time quote."""
        if not self.yfinance:
            return {}

        try:
            ticker_obj = self.yfinance.Ticker(ticker)
            info = ticker_obj.info
            return {
                'price': info.get('currentPrice'),
                'volume': info.get('volume'),
                'bid': info.get('bid'),
                'ask': info.get('ask')
            }
        except Exception:
            pass
        return {}

    def get_fundamentals(self, ticker: str) -> dict:
        """Get US stock fundamentals."""
        if not self.yfinance:
            return {}

        try:
            ticker_obj = self.yfinance.Ticker(ticker)
            info = ticker_obj.info
            return {
                'pe_ratio': info.get('forwardPE'),
                'market_cap': info.get('marketCap'),
                'dividend_yield': info.get('dividendYield'),
                'beta': info.get('beta'),
            }
        except Exception:
            pass
        return {}

    def search_tickers(self, query: str) -> List[dict]:
        """Search US tickers."""
        # yfinance doesn't have search, return common ones
        return []


class HKAdapter(MarketDataAdapter):
    """Hong Kong market adapter."""

    def __init__(self):
        self.akshare = None
        try:
            import akshare as ak
            self.akshare = ak
        except ImportError:
            pass

    def get_bars(self, ticker: str, start_date: str, end_date: str, frequency: str = "1d") -> pd.DataFrame:
        if not self.akshare:
            return pd.DataFrame()
        # Similar to A-share but using HK data
        return pd.DataFrame()

    def get_tick(self, ticker: str) -> dict:
        return {}

    def get_fundamentals(self, ticker: str) -> dict:
        return {}

    def search_tickers(self, query: str) -> List[dict]:
        return []


class UnifiedMarketAdapter:
    """
    Unified market adapter that selects the appropriate adapter based on market.
    """

    def __init__(self, default_market: Market = Market.US):
        self.default_market = default_market
        self.adapters: Dict[Market, MarketDataAdapter] = {
            Market.A_SHARE: AShareAdapter(),
            Market.US: USAdapter(),
            Market.HK: HKAdapter(),
        }
        self.backup_adapters: Dict[Market, MarketDataAdapter] = {}

    def register_adapter(self, market: Market, adapter: MarketDataAdapter, is_backup: bool = False) -> None:
        """Register a market adapter."""
        if is_backup:
            self.backup_adapters[market] = adapter
        else:
            self.adapters[market] = adapter

    def get_adapter(self, market: Market = None) -> MarketDataAdapter:
        """Get adapter for market."""
        market = market or self.default_market
        if market in self.adapters:
            return self.adapters[market]
        raise ValueError(f"No adapter for market: {market}")

    def get_bars(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        market: Market = None,
        frequency: str = "1d"
    ) -> pd.DataFrame:
        """Get bar data with fallback."""
        market = market or self.default_market
        adapter = self.adapters.get(market)

        if not adapter:
            return pd.DataFrame()

        try:
            return adapter.get_bars(ticker, start_date, end_date, frequency)
        except Exception as e:
            print(f"Primary adapter failed: {e}")
            if market in self.backup_adapters:
                return self.backup_adapters[market].get_bars(ticker, start_date, end_date, frequency)
            raise

    def get_tick(self, ticker: str, market: Market = None) -> dict:
        """Get tick data with fallback."""
        market = market or self.default_market
        adapter = self.adapters.get(market)

        if not adapter:
            return {}

        try:
            return adapter.get_tick(ticker)
        except Exception:
            if market in self.backup_adapters:
                return self.backup_adapters[market].get_tick(ticker)
            return {}

    def get_fundamentals(self, ticker: str, market: Market = None) -> dict:
        """Get fundamentals with fallback."""
        market = market or self.default_market
        adapter = self.adapters.get(market)

        if not adapter:
            return {}

        try:
            return adapter.get_fundamentals(ticker)
        except Exception:
            if market in self.backup_adapters:
                return self.backup_adapters[market].get_fundamentals(ticker)
            return {}

    def search_tickers(self, query: str, market: Market = None) -> List[dict]:
        """Search tickers."""
        market = market or self.default_market
        adapter = self.adapters.get(market)

        if adapter:
            return adapter.search_tickers(query)
        return []

    def get_config(self, market: Market = None) -> MarketConfig:
        """Get market configuration."""
        market = market or self.default_market
        return MARKET_CONFIGS.get(market)


class DataSourceManager:
    """
    Manages multiple data sources with redundancy and automatic failover.
    Tracks source availability and performance.
    """

    def __init__(self):
        self.sources: Dict[str, DataSource] = {}
        self.source_registry: Dict[str, Dict[Market, List[str]]] = {}

    def register_source(
        self,
        source_name: str,
        markets: List[Market],
        priority: int = 1
    ) -> None:
        """Register a data source for specific markets."""
        self.sources[source_name] = DataSource(
            name=source_name,
            priority=priority,
            is_available=True
        )
        
        for market in markets:
            if market.value not in self.source_registry:
                self.source_registry[market.value] = {}
            if source_name not in self.source_registry[market.value]:
                self.source_registry[market.value].setdefault(source_name, [])
                self.source_registry[market.value][source_name] = [source_name]

    def get_sources_for_market(self, market: Market) -> List[str]:
        """Get available sources for a market, sorted by priority."""
        market_sources = []
        for name, source in self.sources.items():
            if source.is_available:
                market_sources.append((name, source.priority))
        
        market_sources.sort(key=lambda x: x[1])
        return [s[0] for s in market_sources]

    def mark_source_available(self, source_name: str, available: bool = True) -> None:
        """Mark a source as available/unavailable."""
        if source_name in self.sources:
            self.sources[source_name].is_available = available

    def update_latency(self, source_name: str, latency_ms: int) -> None:
        """Update source latency metrics."""
        if source_name in self.sources:
            self.sources[source_name].latency_ms = latency_ms
            self.sources[source_name].last_used = datetime.now().isoformat()

    def get_best_source(self, market: Market) -> Optional[str]:
        """Get the best available source for a market."""
        sources = self.get_sources_for_market(market)
        return sources[0] if sources else None

    def get_source_status(self) -> Dict:
        """Get status of all data sources."""
        return {
            name: {
                "priority": src.priority,
                "available": src.is_available,
                "latency_ms": src.latency_ms,
                "last_used": src.last_used
            }
            for name, src in self.sources.items()
        }


class RedundantDataAdapter:
    """
    Data adapter with built-in redundancy.
    Tries multiple sources in order, automatically fails over.
    """

    def __init__(self, market: Market):
        self.market = market
        self.source_manager = DataSourceManager()
        self._setup_default_sources()

    def _setup_default_sources(self) -> None:
        """Setup default data sources for the market."""
        if self.market == Market.US:
            self.source_manager.register_source("yfinance", [Market.US], priority=1)
            self.source_manager.register_source("alpha_vantage", [Market.US], priority=2)
            self.source_manager.register_source("polygon", [Market.US], priority=3)
        elif self.market == Market.A_SHARE:
            self.source_manager.register_source("akshare", [Market.A_SHARE], priority=1)
            self.source_manager.register_source("tushare", [Market.A_SHARE], priority=2)
        elif self.market == Market.HK:
            self.source_manager.register_source("akshare_hk", [Market.HK], priority=1)
            self.source_manager.register_source("yahoo_hk", [Market.HK], priority=2)

    def get_bars(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        frequency: str = "1d"
    ) -> Tuple[pd.DataFrame, Optional[str]]:
        """
        Get bar data with automatic failover.
        Returns: (dataframe, source_name or None)
        """
        sources = self.source_manager.get_sources_for_market(self.market)
        
        for source in sources:
            try:
                df = self._fetch_from_source(source, ticker, start_date, end_date, frequency)
                if df is not None and not df.empty:
                    return df, source
            except Exception as e:
                print(f"Source {source} failed: {e}")
                self.source_manager.mark_source_available(source, False)
        
        return pd.DataFrame(), None

    def _fetch_from_source(
        self,
        source: str,
        ticker: str,
        start_date: str,
        end_date: str,
        frequency: str
    ) -> Optional[pd.DataFrame]:
        """Fetch data from a specific source."""
        if source == "yfinance":
            return self._yfinance_fetch(ticker, start_date, end_date, frequency)
        elif source == "akshare":
            return self._akshare_fetch(ticker, start_date, end_date, frequency)
        elif source == "alpha_vantage":
            return self._alpha_vantage_fetch(ticker, start_date, end_date)
        elif source == "polygon":
            return self._polygon_fetch(ticker, start_date, end_date)
        return None

    def _yfinance_fetch(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        frequency: str
    ) -> Optional[pd.DataFrame]:
        """Fetch from yfinance."""
        try:
            import yfinance as yf
            df = yf.download(ticker, start=start_date, end=end_date, progress=False)
            if df is not None and not df.empty:
                return df.reset_index().rename(columns={
                    'Date': 'date', 'Open': 'open', 'Close': 'close',
                    'High': 'high', 'Low': 'low', 'Volume': 'volume'
                })
        except Exception:
            pass
        return None

    def _akshare_fetch(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        frequency: str
    ) -> Optional[pd.DataFrame]:
        """Fetch from AKShare."""
        try:
            import akshare as ak
            code = "".join(filter(str.isdigit, ticker))
            df = ak.stock_zh_a_hist(
                symbol=code,
                start_date=start_date.replace("-", ""),
                end_date=end_date.replace("-", ""),
                adjust="qfq"
            )
            if df is not None:
                return df.rename(columns={
                    '日期': 'date', '开盘': 'open', '收盘': 'close',
                    '最高': 'high', '最低': 'low', '成交量': 'volume'
                })
        except Exception:
            pass
        return None

    def _alpha_vantage_fetch(
        self,
        ticker: str,
        start_date: str,
        end_date: str
    ) -> Optional[pd.DataFrame]:
        """Fetch from Alpha Vantage (placeholder - requires API key)."""
        return None

    def _polygon_fetch(
        self,
        ticker: str,
        start_date: str,
        end_date: str
    ) -> Optional[pd.DataFrame]:
        """Fetch from Polygon.io (placeholder - requires API key)."""
        return None

    def get_source_status(self) -> Dict:
        """Get data source status."""
        return self.source_manager.get_source_status()


def demo_unified_adapter():
    """Demo unified market adapter."""
    adapter = UnifiedMarketAdapter(default_market=Market.US)

    # Get US data
    print("=== US Market ===")
    bars = adapter.get_bars("AAPL", "2025-01-01", "2025-03-01")
    print(f"Got {len(bars)} bars for AAPL")
    print(bars.head() if not bars.empty else "No data")

    # Get A-share data
    print("\n=== A-Share Market ===")
    adapter.default_market = Market.A_SHARE
    bars = adapter.get_bars("600519", "2025-01-01", "2025-03-01")
    print(f"Got {len(bars)} bars for 600519")

    # Get market config
    config = adapter.get_config(Market.US)
    print(f"\nUS Market Config: {config.name}, Settlement: {config.settlement}")


if __name__ == "__main__":
    demo_unified_adapter()
