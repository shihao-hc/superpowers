"""
Multi-Market Stock Data Provider - 多市场股票数据提供者

支持 A股、港股、美股的数据获取
统一接口设计，方便扩展新的市场
"""

import asyncio
import os
from typing import Dict, Any, Optional, List
from enum import Enum
from dataclasses import dataclass


class MarketType(str, Enum):
    """市场类型"""
    A_SHARE = "a_share"      # A股
    HONG_KONG = "hk"          # 港股
    US = "us"                 # 美股


@dataclass
class StockData:
    """股票数据结构"""
    symbol: str
    name: str
    market: str
    price: float
    change: float
    change_percent: float
    volume: int
    market_cap: Optional[float] = None
    pe_ratio: Optional[float] = None
    raw_data: Optional[Dict] = None


@dataclass
class MarketConfig:
    """市场配置"""
    name: str
    pattern: str  # 如 "000001", "00700.HK", "AAPL"
    provider: str  # "akshare", "yfinance"
    enabled: bool = True


class MultiMarketProvider:
    """
    多市场股票数据提供者
    
    支持：
    - A股: AkShare
    - 港股: AkShare
    - 美股: AkShare + yfinance
    """

    def __init__(self):
        self.providers: Dict[str, Any] = {}
        self._init_providers()

    def _init_providers(self):
        """初始化数据提供者"""
        try:
            import akshare as ak
            self.providers["akshare"] = ak
        except ImportError:
            print("AkShare not installed")

        try:
            import yfinance as yf
            self.providers["yfinance"] = yf
        except ImportError:
            print("yfinance not installed")

    def detect_market(self, symbol: str) -> MarketType:
        """
        自动识别股票市场
        
        Args:
            symbol: 股票代码
            
        Returns:
            MarketType: 市场类型
        """
        symbol = symbol.upper().strip()

        if symbol.endswith(".HK") or symbol.startswith("0") and len(symbol) == 6:
            if len(symbol) == 5:
                return MarketType.HONG_KONG
        if symbol in ["00700.HK", "09988.HK", "09999.HK"]:
            return MarketType.HONG_KONG
        if symbol.endswith(".SS") or symbol.endswith(".SZ"):
            return MarketType.A_SHARE
        if symbol.replace(".", "").isalpha() and len(symbol) <= 5:
            return MarketType.US
        
        if len(symbol) == 6 and symbol.isdigit():
            if symbol.startswith(("0", "3", "6")):
                return MarketType.A_SHARE
        
        return MarketType.US

    def normalize_symbol(self, symbol: str, market: MarketType) -> str:
        """
        标准化股票代码
        
        Args:
            symbol: 原始代码
            market: 市场类型
            
        Returns:
            str: 标准化代码
        """
        symbol = symbol.upper().strip()
        
        if market == MarketType.A_SHARE:
            if len(symbol) == 6:
                if symbol.startswith(("0", "3")):
                    return f"{symbol}.SZ"
                elif symbol.startswith("6"):
                    return f"{symbol}.SS"
            return symbol
        elif market == MarketType.HONG_KONG:
            if not symbol.endswith(".HK"):
                symbol = symbol.zfill(5) + ".HK"
            return symbol
        elif market == MarketType.US:
            return symbol.replace(".US", "")
        
        return symbol

    async def get_stock_info(self, symbol: str) -> Optional[StockData]:
        """
        获取股票基本信息
        
        Args:
            symbol: 股票代码
            
        Returns:
            Optional[StockData]: 股票数据
        """
        market = self.detect_market(symbol)
        normalized = self.normalize_symbol(symbol, market)

        if "akshare" in self.providers:
            try:
                if market == MarketType.A_SHARE:
                    return await self._get_a_share_info(normalized)
                elif market == MarketType.HONG_KONG:
                    return await self._get_hk_stock_info(normalized)
                elif market == MarketType.US:
                    return await self._get_us_stock_info(normalized)
            except Exception as e:
                print(f"Failed to get stock info: {e}")

        return None

    async def _get_a_share_info(self, symbol: str) -> Optional[StockData]:
        """获取A股信息"""
        ak = self.providers.get("akshare")
        if not ak:
            return None

        def _fetch():
            df = ak.stock_zh_a_spot_em()
            stock = df[df["代码"] == symbol.replace(".SS", "").replace(".SZ", "")]
            if not stock.empty:
                row = stock.iloc[0]
                return StockData(
                    symbol=symbol,
                    name=row.get("名称", ""),
                    market="A_SHARE",
                    price=float(row.get("最新价", 0)),
                    change=float(row.get("涨跌幅", 0)),
                    change_percent=float(row.get("涨跌幅", 0)),
                    volume=int(row.get("成交量", 0)),
                    raw_data=row.to_dict()
                )
            return None

        return await asyncio.to_thread(_fetch)

    async def _get_hk_stock_info(self, symbol: str) -> Optional[StockData]:
        """获取港股信息"""
        ak = self.providers.get("akshare")
        if not ak:
            return None

        def _fetch():
            df = ak.stock_hk_spot_em()
            stock = df[df["代码"] == symbol.replace(".HK", "")]
            if not stock.empty:
                row = stock.iloc[0]
                return StockData(
                    symbol=symbol,
                    name=row.get("名称", ""),
                    market="HONG_KONG",
                    price=float(row.get("最新价", 0)),
                    change=float(row.get("涨跌额", 0)),
                    change_percent=float(row.get("涨跌幅", 0)),
                    volume=int(row.get("成交量", 0)),
                    raw_data=row.to_dict()
                )
            return None

        return await asyncio.to_thread(_fetch)

    async def _get_us_stock_info(self, symbol: str) -> Optional[StockData]:
        """获取美股信息"""
        yf_ticker = self.providers.get("yfinance")
        if not yf_ticker:
            ak = self.providers.get("akshare")
            if ak:
                def _fetch_ak():
                    df = ak.stock_us_spot_em()
                    stock = df[df["代码"] == symbol.upper()]
                    if not stock.empty:
                        row = stock.iloc[0]
                        return StockData(
                            symbol=symbol,
                            name=row.get("名称", ""),
                            market="US",
                            price=float(row.get("最新价", 0)),
                            change=float(row.get("涨跌额", 0)),
                            change_percent=float(row.get("涨跌幅", 0)),
                            volume=int(row.get("成交量", 0)),
                            raw_data=row.to_dict()
                        )
                    return None
                return await asyncio.to_thread(_fetch_ak)
            return None

        def _fetch():
            ticker = yf_ticker.Ticker(symbol)
            info = ticker.fast_info
            return StockData(
                symbol=symbol,
                name=info.get("short_name", symbol),
                market="US",
                price=info.get("last_price", 0),
                change=0,
                change_percent=0,
                volume=int(info.get("last_volume", 0)),
                market_cap=info.get("market_cap", None),
                pe_ratio=info.get("trailing_pe", None),
            )

        return await asyncio.to_thread(_fetch)

    async def get_batch_stocks(
        self,
        symbols: List[str]
    ) -> List[Optional[StockData]]:
        """
        批量获取股票信息
        
        Args:
            symbols: 股票代码列表
            
        Returns:
            List[Optional[StockData]]: 股票数据列表
        """
        tasks = [self.get_stock_info(s) for s in symbols]
        return await asyncio.gather(*tasks)

    def get_supported_markets(self) -> List[Dict[str, str]]:
        """
        获取支持的市场列表
        
        Returns:
            List[Dict]: 市场信息列表
        """
        markets = [
            {"id": "a_share", "name": "A股", "pattern": "如 000001, 600519"},
            {"id": "hk", "name": "港股", "pattern": "如 00700.HK, 09988.HK"},
            {"id": "us", "name": "美股", "pattern": "如 AAPL, TSLA, GOOGL"},
        ]
        return markets


multi_market_provider = MultiMarketProvider()
