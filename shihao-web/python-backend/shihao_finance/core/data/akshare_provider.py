"""
AKShare data provider for Chinese A-share market.

This provider integrates with AKShare to fetch real-time and historical
data from Chinese stock markets.
"""

import asyncio
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from functools import lru_cache

import pandas as pd
import akshare as ak
from loguru import logger

from .base import (
    DataProvider, DataSource, DataFrequency,
    StockInfo, FundamentalData, NewsItem, OHLCV
)


class AKShareProvider(DataProvider):
    """
    AKShare data provider for Chinese A-share markets.
    
    Features:
    - Real-time A-share data
    - Historical OHLCV data
    - Fundamental data (financial statements)
    - Index data
    - Sector/industry data
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self._stock_cache = {}
        self._cache_ttl = config.get("cache_ttl", 3600) if config else 3600
    
    @property
    def name(self) -> str:
        return "AKShare"
    
    @property
    def source(self) -> DataSource:
        return DataSource.AKSHARE
    
    async def initialize(self) -> bool:
        """Initialize AKShare provider."""
        try:
            # Test connection by fetching stock list
            await self.get_stock_list()
            self._is_initialized = True
            logger.info("AKShare provider initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize AKShare provider: {e}")
            return False
    
    async def health_check(self) -> Dict[str, Any]:
        """Check AKShare provider health."""
        try:
            # Try to get a small data sample
            stock_list = await self.get_stock_list()
            return {
                "status": "healthy",
                "provider": self.name,
                "stock_count": len(stock_list),
                "timestamp": datetime.now().isoformat()
            }
        except Exception as e:
            return {
                "status": "unhealthy",
                "provider": self.name,
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
    
    @lru_cache(maxsize=1)
    async def get_stock_list(
        self, 
        exchange: Optional[str] = None
    ) -> List[StockInfo]:
        """
        Get list of A-share stocks.
        
        Args:
            exchange: Filter by exchange ("SSE", "SZSE", None for all)
        """
        try:
            # Get stock info from AKShare
            df = ak.stock_info_a_code_name()
            
            stocks = []
            for _, row in df.iterrows():
                symbol = row.get("code", "")
                name = row.get("name", "")
                
                # Determine exchange based on symbol prefix
                if symbol.startswith(("6", "9")):
                    exchange_code = "SSE"
                elif symbol.startswith(("0", "3")):
                    exchange_code = "SZSE"
                else:
                    exchange_code = "OTHER"
                
                # Filter by exchange if specified
                if exchange and exchange_code != exchange:
                    continue
                
                stocks.append(StockInfo(
                    symbol=symbol,
                    name=name,
                    exchange=exchange_code,
                    source=DataSource.AKSHARE
                ))
            
            logger.info(f"Retrieved {len(stocks)} stocks from AKShare")
            return stocks
            
        except Exception as e:
            logger.error(f"Error getting stock list: {e}")
            return []
    
    async def get_ohlcv(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        frequency: DataFrequency = DataFrequency.DAILY,
        limit: Optional[int] = None
    ) -> pd.DataFrame:
        """
        Get OHLCV data for a stock.
        
        Args:
            symbol: Stock symbol (e.g., "000001")
            start_date: Start date (default: 1 year ago)
            end_date: End date (default: today)
            frequency: Data frequency
            limit: Maximum number of records
        """
        try:
            # Set default dates
            if end_date is None:
                end_date = datetime.now()
            if start_date is None:
                start_date = end_date - pd.Timedelta(days=365)
            
            # Format dates for AKShare
            start_str = start_date.strftime("%Y%m%d")
            end_str = end_date.strftime("%Y%m%d")
            
            # Get data based on frequency
            if frequency == DataFrequency.DAILY:
                df = ak.stock_zh_a_hist(
                    symbol=symbol,
                    period="daily",
                    start_date=start_str,
                    end_date=end_str,
                    adjust="qfq"  # Forward-adjusted prices
                )
            elif frequency in [DataFrequency.MINUTE_1, DataFrequency.MINUTE_5, 
                              DataFrequency.MINUTE_15, DataFrequency.MINUTE_30]:
                # Intraday data
                period_map = {
                    DataFrequency.MINUTE_1: "1",
                    DataFrequency.MINUTE_5: "5",
                    DataFrequency.MINUTE_15: "15",
                    DataFrequency.MINUTE_30: "30"
                }
                df = ak.stock_zh_a_hist_min_em(
                    symbol=symbol,
                    period=period_map[frequency],
                    start_date=start_str,
                    end_date=end_str,
                    adjust="qfq"
                )
            else:
                raise ValueError(f"Unsupported frequency: {frequency}")
            
            # Rename columns to standard format
            column_mapping = {
                "日期": "timestamp",
                "开盘": "open",
                "收盘": "close",
                "最高": "high",
                "最低": "low",
                "成交量": "volume",
                "成交额": "turnover",
                "振幅": "amplitude",
                "涨跌幅": "pct_change",
                "涨跌额": "change",
                "换手率": "turnover_rate"
            }
            df = df.rename(columns=column_mapping)
            
            # Convert timestamp
            if "timestamp" in df.columns:
                df["timestamp"] = pd.to_datetime(df["timestamp"])
            
            # Add symbol column
            df["symbol"] = symbol
            df["source"] = self.source.value
            
            # Apply limit if specified
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
            # Get financial indicators
            df = ak.stock_financial_analysis_indicator(symbol=f"{symbol}")
            
            if df.empty:
                return None
            
            # Get the latest available data
            latest = df.iloc[-1]
            
            return FundamentalData(
                symbol=symbol,
                date=pd.to_datetime(latest.get("日期", datetime.now())).date(),
                pe_ratio=latest.get("市盈率(PE)", None),
                pb_ratio=latest.get("市净率(PB)", None),
                ps_ratio=latest.get("市销率(PS)", None),
                dividend_yield=latest.get("股息率", None),
                eps=latest.get("每股收益", None),
                roe=latest.get("净资产收益率", None),
                debt_to_equity=latest.get("资产负债率", None),
                source=DataSource.AKSHARE
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
            # Get stock news from AKShare
            df = ak.stock_news_em(symbol=symbol)
            
            if df.empty:
                return []
            
            news_items = []
            for _, row in df.iterrows():
                if len(news_items) >= limit:
                    break
                
                news_items.append(NewsItem(
                    symbol=symbol,
                    title=row.get("新闻标题", ""),
                    content=row.get("新闻内容", ""),
                    published_at=pd.to_datetime(row.get("发布时间", datetime.now())),
                    source=row.get("新闻来源", "akshare"),
                    url=row.get("新闻链接", None),
                    source_provider=DataSource.AKSHARE
                ))
            
            return news_items
            
        except Exception as e:
            logger.error(f"Error getting news for {symbol}: {e}")
            return []
    
    async def get_index_data(
        self,
        index_code: str = "000001",
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Get index data (e.g., Shanghai Composite)."""
        try:
            if end_date is None:
                end_date = datetime.now()
            if start_date is None:
                start_date = end_date - pd.Timedelta(days=365)
            
            df = ak.stock_zh_index_daily_em(
                symbol=f"sh{index_code}"
            )
            
            # Filter by date range
            df["date"] = pd.to_datetime(df["date"])
            df = df[(df["date"] >= start_date) & (df["date"] <= end_date)]
            
            return df
            
        except Exception as e:
            logger.error(f"Error getting index data: {e}")
            return pd.DataFrame()
    
    async def get_sector_data(
        self,
        sector_type: str = "industry"
    ) -> pd.DataFrame:
        """Get sector/industry data."""
        try:
            if sector_type == "industry":
                df = ak.stock_board_industry_name_em()
            else:
                df = ak.stock_board_concept_name_em()
            
            return df
            
        except Exception as e:
            logger.error(f"Error getting sector data: {e}")
            return pd.DataFrame()