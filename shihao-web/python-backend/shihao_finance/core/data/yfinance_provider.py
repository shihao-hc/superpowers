"""
YFinance data provider for international markets.

This provider integrates with Yahoo Finance to fetch data for
US, HK, and other international markets.
"""

import asyncio
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from functools import lru_cache

import pandas as pd
import yfinance as yf
from loguru import logger

from .base import (
    DataProvider, DataSource, DataFrequency,
    StockInfo, FundamentalData, NewsItem
)


class YFinanceProvider(DataProvider):
    """
    YFinance data provider for international markets.
    
    Features:
    - US/HK/Global stock data
    - Historical OHLCV data
    - Fundamental data
    - Dividend and split information
    - Analyst recommendations
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self._ticker_cache = {}
    
    @property
    def name(self) -> str:
        return "YFinance"
    
    @property
    def source(self) -> DataSource:
        return DataSource.YFINANCE
    
    async def initialize(self) -> bool:
        """Initialize YFinance provider."""
        try:
            # Test connection
            ticker = yf.Ticker("AAPL")
            _ = ticker.info
            self._is_initialized = True
            logger.info("YFinance provider initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize YFinance provider: {e}")
            return False
    
    async def health_check(self) -> Dict[str, Any]:
        """Check YFinance provider health."""
        try:
            # Test with a known ticker
            ticker = yf.Ticker("AAPL")
            info = ticker.info
            return {
                "status": "healthy" if info else "degraded",
                "provider": self.name,
                "test_ticker": "AAPL",
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "provider": self.name,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    async def get_stock_list(
        self, 
        exchange: Optional[str] = None
    ) -> List[StockInfo]:
        """Get list of stocks (limited for YFinance)."""
        # YFinance doesn't provide a full stock list API
        # Return empty list or use a predefined list
        return []
    
    @lru_cache(maxsize=100)
    async def get_ohlcv(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        frequency: DataFrequency = DataFrequency.DAILY,
        limit: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Get OHLCV data using YFinance.
        
        Args:
            symbol: Stock symbol (e.g., "AAPL", "0700.HK")
            start_date: Start date
            end_date: End date
            frequency: Data frequency
            limit: Maximum number of records
        """
        try:
            # Get ticker
            ticker = yf.Ticker(symbol)
            
            # Set default dates
            if end_date is None:
                end_date = datetime.now()
            if start_date is None:
                start_date = end_date - pd.Timedelta(days=365)
            
            # Map frequency to yfinance interval
            interval_map = {
                DataFrequency.TICK: "1m",
                DataFrequency.MINUTE_1: "1m",
                DataFrequency.MINUTE_5: "5m",
                DataFrequency.MINUTE_15: "15m",
                DataFrequency.MINUTE_30: "30m",
                DataFrequency.HOUR_1: "1h",
                DataFrequency.DAILY: "1d",
                DataFrequency.WEEKLY: "1wk",
                DataFrequency.MONTHLY: "1mo"
            }
            
            # Get history
            df = ticker.history(
                start=start_date,
                end=end_date,
                interval=interval_map.get(frequency, "1d")
            )
            
            if df.empty:
                return pd.DataFrame()
            
            # Reset index and rename columns
            df = df.reset_index()
            df = df.rename(columns={
                'Date': 'timestamp',
                'Open': 'open',
                'High': 'high',
                'Low': 'low',
                'Close': 'close',
                'Volume': 'volume',
                'Dividends': 'dividends',
                'Stock Splits': 'stock_splits'
            })
            
            # Add metadata
            df['symbol'] = symbol
            df['source'] = self.source.value
            
            # Apply limit
            if limit and len(df) > limit:
                df = df.tail(limit)
            
            return df
            
        except Exception as e:
            logger.error(f"Error getting OHLCV data for {symbol}: {e}")
            return pd.DataFrame()
    
    async def get_fundamental(
        self,
        symbol: str,
        date: Optional[date] = None
    ) -> Optional[FundamentalData]:
        """Get fundamental data for a stock."""
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.info
            
            if not info:
                return None
            
            return FundamentalData(
                symbol=symbol,
                date=date or datetime.now().date(),
                pe_ratio=info.get('trailingPE'),
                pb_ratio=info.get('priceToBook'),
                ps_ratio=info.get('priceToSalesTrailing12Months'),
                dividend_yield=info.get('dividendYield'),
                eps=info.get('trailingEps'),
                roe=info.get('returnOnEquity'),
                debt_to_equity=info.get('debtToEquity'),
                revenue_growth=info.get('revenueGrowth'),
                net_income_growth=info.get('earningsGrowth'),
                source=DataSource.YFINANCE
            )
            
        except Exception as e:
            logger.error(f"Error getting fundamental data for {symbol}: {e}")
            return None
    
    async def get_news(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 20
    ) -> List[NewsItem]:
        """Get news for a stock."""
        try:
            ticker = yf.Ticker(symbol)
            news = ticker.news
            
            if not news:
                return []
            
            news_items = []
            for item in news[:limit]:
                news_items.append(NewsItem(
                    symbol=symbol,
                    title=item.get('title', ''),
                    content=item.get('title', ''),  # YFinance only provides titles
                    published_at=datetime.fromtimestamp(item.get('providerPublishTime', 0)),
                    source=item.get('publisher', 'yfinance'),
                    url=item.get('link', None),
                    source_provider=DataSource.YFINANCE
                ))
            
            return news_items
            
        except Exception as e:
            logger.error(f"Error getting news for {symbol}: {e}")
            return []
    
    async def get_financials(
        self,
        symbol: str
    ) -> Dict[str, pd.DataFrame]:
        """Get financial statements."""
        try:
            ticker = yf.Ticker(symbol)
            
            return {
                'income_stmt': ticker.financials,
                'balance_sheet': ticker.balance_sheet,
                'cash_flow': ticker.cashflow
            }
            
        except Exception as e:
            logger.error(f"Error getting financials for {symbol}: {e}")
            return {}
    
    async def get_analyst_recommendations(
        self,
        symbol: str
    ) -> pd.DataFrame:
        """Get analyst recommendations."""
        try:
            ticker = yf.Ticker(symbol)
            return ticker.recommendations
            
        except Exception as e:
            logger.error(f"Error getting recommendations for {symbol}: {e}")
            return pd.DataFrame()