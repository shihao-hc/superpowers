"""
Base data provider interface for ShiHao Finance.

This module defines the abstract interface for all data providers,
ensuring consistent data contracts across different sources.
"""

from abc import ABC, abstractmethod
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field
import pandas as pd


class DataSource(Enum):
    """Supported data sources."""
    AKSHARE = "akshare"
    YFINANCE = "yfinance"
    TUSHARE = "tushare"
    ALPHA_VANTAGE = "alpha_vantage"


class DataFrequency(Enum):
    """Supported data frequencies."""
    TICK = "tick"
    MINUTE_1 = "1m"
    MINUTE_5 = "5m"
    MINUTE_15 = "15m"
    MINUTE_30 = "30m"
    HOUR_1 = "1h"
    DAILY = "D"
    WEEKLY = "W"
    MONTHLY = "M"


class OHLCV(BaseModel):
    """OHLCV data schema."""
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int
    symbol: str
    source: DataSource
    
    class Config:
        use_enum_values = True


class StockInfo(BaseModel):
    """Stock information schema."""
    symbol: str
    name: str
    exchange: str
    sector: Optional[str] = None
    industry: Optional[str] = None
    market_cap: Optional[float] = None
    currency: str = "CNY"
    source: DataSource
    
    class Config:
        use_enum_values = True


class FundamentalData(BaseModel):
    """Fundamental data schema."""
    symbol: str
    date: date
    pe_ratio: Optional[float] = None
    pb_ratio: Optional[float] = None
    ps_ratio: Optional[float] = None
    dividend_yield: Optional[float] = None
    eps: Optional[float] = None
    roe: Optional[float] = None
    debt_to_equity: Optional[float] = None
    revenue_growth: Optional[float] = None
    net_income_growth: Optional[float] = None
    source: DataSource
    
    class Config:
        use_enum_values = True


class NewsItem(BaseModel):
    """News item schema."""
    symbol: str
    title: str
    content: str
    published_at: datetime
    source: str
    sentiment_score: Optional[float] = None
    url: Optional[str] = None
    source_provider: DataSource
    
    class Config:
        use_enum_values = True


class DataProvider(ABC):
    """
    Abstract base class for all data providers.
    
    This ensures consistent data contracts and enables
    easy switching between data sources.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self._is_initialized = False
    
    @property
    @abstractmethod
    def name(self) -> str:
        """Provider name."""
        pass
    
    @property
    @abstractmethod
    def source(self) -> DataSource:
        """Data source type."""
        pass
    
    @abstractmethod
    async def initialize(self) -> bool:
        """Initialize the data provider."""
        pass
    
    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        """Check provider health status."""
        pass
    
    @abstractmethod
    async def get_stock_list(
        self, 
        exchange: Optional[str] = None
    ) -> List[StockInfo]:
        """Get list of available stocks."""
        pass
    
    @abstractmethod
    async def get_ohlcv(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        frequency: DataFrequency = DataFrequency.DAILY,
        limit: Optional[int] = None
    ) -> pd.DataFrame:
        """Get OHLCV price data."""
        pass
    
    @abstractmethod
    async def get_fundamental(
        self,
        symbol: str,
        date: Optional[date] = None
    ) -> Optional[FundamentalData]:
        """Get fundamental data for a stock."""
        pass
    
    @abstractmethod
    async def get_news(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 20
    ) -> List[NewsItem]:
        """Get news for a stock."""
        pass
    
    async def get_bulk_ohlcv(
        self,
        symbols: List[str],
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        frequency: DataFrequency = DataFrequency.DAILY
    ) -> Dict[str, pd.DataFrame]:
        """
        Get OHLCV data for multiple symbols.
        
        Default implementation calls get_ohlcv for each symbol.
        Providers can override this for batch optimization.
        """
        results = {}
        for symbol in symbols:
            try:
                df = await self.get_ohlcv(
                    symbol=symbol,
                    start_date=start_date,
                    end_date=end_date,
                    frequency=frequency
                )
                if not df.empty:
                    results[symbol] = df
            except Exception as e:
                # Log error but continue with other symbols
                pass
        return results