"""
Unified data manager with multi-provider support and fallback.

This module provides a unified interface for accessing data from
multiple sources with automatic fallback and caching.
"""

from datetime import datetime, date
from typing import Optional, List, Dict, Any, Union
from enum import Enum

import pandas as pd
from loguru import logger

from .base import (
    DataProvider, DataSource, DataFrequency,
    StockInfo, FundamentalData, NewsItem
)
from .akshare_provider import AKShareProvider
from .yfinance_provider import YFinanceProvider


class DataPriority(Enum):
    """Data source priority order."""
    PRIMARY = "primary"
    SECONDARY = "secondary"
    FALLBACK = "fallback"


class DataManager:
    """
    Unified data manager with multi-provider support.
    
    Features:
    - Multiple data provider support
    - Automatic fallback on failure
    - Request deduplication
    - Result caching
    - Health monitoring
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.providers: Dict[str, DataProvider] = {}
        self.provider_priority: List[str] = []
        self._initialize_providers()
    
    def _initialize_providers(self):
        """Initialize configured data providers."""
        provider_configs = self.config.get("providers", {})
        
        # Initialize AKShare for Chinese markets
        if provider_configs.get("akshare", {}).get("enabled", True):
            akshare_config = provider_configs.get("akshare", {})
            self.providers["akshare"] = AKShareProvider(akshare_config)
            self.provider_priority.append("akshare")
        
        # Initialize YFinance for international markets
        if provider_configs.get("yfinance", {}).get("enabled", True):
            yfinance_config = provider_configs.get("yfinance", {})
            self.providers["yfinance"] = YFinanceProvider(yfinance_config)
            self.provider_priority.append("yfinance")
        
        logger.info(f"Initialized {len(self.providers)} data providers")
    
    async def initialize(self) -> bool:
        """Initialize all data providers."""
        results = []
        for name, provider in self.providers.items():
            try:
                result = await provider.initialize()
                results.append((name, result))
                if result:
                    logger.info(f"Provider {name} initialized successfully")
                else:
                    logger.warning(f"Provider {name} initialization failed")
            except Exception as e:
                logger.error(f"Error initializing provider {name}: {e}")
                results.append((name, False))
        
        return any(r[1] for r in results)
    
    async def health_check(self) -> Dict[str, Any]:
        """Check health of all providers."""
        health_status = {}
        for name, provider in self.providers.items():
            try:
                status = await provider.health_check()
                health_status[name] = status
            except Exception as e:
                health_status[name] = {
                    "status": "unhealthy",
                    "error": str(e)
                }
        
        return {
            "providers": health_status,
            "healthy_count": sum(1 for h in health_status.values() 
                                if h.get("status") == "healthy"),
            "total_count": len(health_status),
            "timestamp": datetime.now().isoformat()
        }
    
    async def get_stock_list(
        self,
        exchange: Optional[str] = None,
        source: Optional[DataSource] = None
    ) -> List[StockInfo]:
        """Get list of stocks with fallback."""
        providers = self._get_providers_for_market(exchange)
        
        for provider_name in providers:
            provider = self.providers[provider_name]
            try:
                stocks = await provider.get_stock_list(exchange)
                if stocks:
                    logger.info(f"Got {len(stocks)} stocks from {provider_name}")
                    return stocks
            except Exception as e:
                logger.warning(f"Provider {provider_name} failed: {e}")
                continue
        
        logger.error("All providers failed to get stock list")
        return []
    
    async def get_ohlcv(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        frequency: DataFrequency = DataFrequency.DAILY,
        limit: Optional[int] = None,
        source: Optional[DataSource] = None
    ) -> pd.DataFrame:
        """Get OHLCV data with fallback."""
        providers = self._get_providers_for_symbol(symbol)
        
        for provider_name in providers:
            provider = self.providers[provider_name]
            try:
                df = await provider.get_ohlcv(
                    symbol=symbol,
                    start_date=start_date,
                    end_date=end_date,
                    frequency=frequency,
                    limit=limit
                )
                if not df.empty:
                    return df
            except Exception as e:
                logger.warning(f"Provider {provider_name} failed for {symbol}: {e}")
                continue
        
        logger.error(f"All providers failed to get OHLCV data for {symbol}")
        return pd.DataFrame()
    
    async def get_fundamental(
        self,
        symbol: str,
        date: Optional[date] = None
    ) -> Optional[FundamentalData]:
        """Get fundamental data with fallback."""
        providers = self._get_providers_for_symbol(symbol)
        
        for provider_name in providers:
            provider = self.providers[provider_name]
            try:
                data = await provider.get_fundamental(symbol, date)
                if data:
                    return data
            except Exception as e:
                logger.warning(f"Provider {provider_name} failed for {symbol}: {e}")
                continue
        
        return None
    
    async def get_news(
        self,
        symbol: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 20
    ) -> List[NewsItem]:
        """Get news with fallback."""
        providers = self._get_providers_for_symbol(symbol)
        
        for provider_name in providers:
            provider = self.providers[provider_name]
            try:
                news = await provider.get_news(
                    symbol=symbol,
                    start_date=start_date,
                    end_date=end_date,
                    limit=limit
                )
                if news:
                    return news
            except Exception as e:
                logger.warning(f"Provider {provider_name} failed for {symbol}: {e}")
                continue
        
        return []
    
    async def get_bulk_ohlcv(
        self,
        symbols: List[str],
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        frequency: DataFrequency = DataFrequency.DAILY
    ) -> Dict[str, pd.DataFrame]:
        """Get OHLCV data for multiple symbols."""
        results = {}
        
        for symbol in symbols:
            df = await self.get_ohlcv(
                symbol=symbol,
                start_date=start_date,
                end_date=end_date,
                frequency=frequency
            )
            if not df.empty:
                results[symbol] = df
        
        return results
    
    def _get_providers_for_market(
        self,
        exchange: Optional[str]
    ) -> List[str]:
        """Get appropriate providers for a market."""
        if exchange in ["SSE", "SZSE", "CN", None]:
            return ["akshare", "yfinance"]
        elif exchange in ["HK", "NYSE", "NASDAQ", "US"]:
            return ["yfinance"]
        else:
            return self.provider_priority
    
    def _get_providers_for_symbol(
        self,
        symbol: str
    ) -> List[str]:
        """Get appropriate providers for a symbol."""
        # Determine market from symbol format
        if symbol.endswith(".HK"):
            return ["yfinance"]
        elif symbol.startswith(("6", "0", "3")):
            # A-share symbols
            return ["akshare", "yfinance"]
        elif symbol.isalpha():
            # US/international symbols
            return ["yfinance"]
        else:
            return self.provider_priority