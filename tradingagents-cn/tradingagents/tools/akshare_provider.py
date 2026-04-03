"""
TradingAgents-CN AKShare Data Provider
A股市场数据获取
"""

from typing import Optional, Dict, Any, List
import asyncio
from functools import lru_cache

try:
    import akshare as ak
    AKSHARE_AVAILABLE = True
except ImportError:
    AKSHARE_AVAILABLE = False

from .cache import CacheManager


class AKShareProvider:
    """
    AKShare数据提供者
    获取A股市场数据、财务数据等
    """

    def __init__(self, cache_manager: Optional[CacheManager] = None):
        self.cache = cache_manager or CacheManager()
        if not AKSHARE_AVAILABLE:
            raise ImportError("请安装 akshare: pip install akshare")

    async def get_stock_realtime_quote(self, symbol: str) -> Dict[str, Any]:
        """
        获取股票实时行情

        Args:
            symbol: 股票代码，如 "000001" 或 "600000"

        Returns:
            实时行情数据
        """
        cache_key = f"realtime:{symbol}"

        @self.cache.cached(key_prefix="akshare", ttl=60)
        async def _fetch():
            try:
                df = await asyncio.to_thread(
                    ak.stock_zh_a_spot_em
                )
                stock_data = df[df["代码"] == symbol]
                if not stock_data.empty:
                    return stock_data.iloc[0].to_dict()
                return None
            except Exception as e:
                return {"error": "Failed to fetch stock data"}

        return await _fetch()

    async def get_stock_history(
        self,
        symbol: str,
        period: str = "daily",
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        获取股票历史数据

        Args:
            symbol: 股票代码
            period: 周期 (daily/weekly/monthly)
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            历史K线数据
        """
        cache_key = f"history:{symbol}:{period}:{start_date}:{end_date}"

        @self.cache.cached(key_prefix="akshare", ttl=3600)
        async def _fetch():
            try:
                if start_date and end_date:
                    df = await asyncio.to_thread(
                        ak.stock_zh_a_hist,
                        symbol=symbol,
                        period=period,
                        start_date=start_date,
                        end_date=end_date,
                        adjust="qfq"
                    )
                else:
                    df = await asyncio.to_thread(
                        ak.stock_zh_a_hist,
                        symbol=symbol,
                        period=period,
                        adjust="qfq"
                    )
                return df.to_dict("records")
            except Exception as e:
                return [{"error": str(e)}]

        return await _fetch()

    async def get_stock_financials(self, symbol: str) -> Dict[str, Any]:
        """
        获取股票财务数据

        Args:
            symbol: 股票代码

        Returns:
            财务指标数据
        """
        cache_key = f"financials:{symbol}"

        @self.cache.cached(key_prefix="akshare", ttl=86400)
        async def _fetch():
            result = {}
            try:
                df = await asyncio.to_thread(
                    ak.stock_financial_analysis_indicator,
                    symbol=symbol
                )
                result["financial_indicators"] = df.tail(4).to_dict("records")
            except Exception as e:
                result["financial_indicators_error"] = str(e)

            try:
                df = await asyncio.to_thread(
                    ak.stock_a_lg_indicator,
                    symbol=symbol
                )
                result["valuation_indicators"] = df.tail(1).to_dict("records")
            except Exception as e:
                result["valuation_indicators_error"] = str(e)

            return result

        return await _fetch()

    async def get_market_summary(self) -> Dict[str, Any]:
        """
        获取市场概览

        Returns:
            市场概况数据
        """
        cache_key = "market:summary"

        @self.cache.cached(key_prefix="akshare", ttl=300)
        async def _fetch():
            result = {}
            try:
                df = await asyncio.to_thread(ak.stock_zh_a_spot_em)
                result["total_count"] = len(df)
                result["up_count"] = len(df[df["涨跌幅"] > 0])
                result["down_count"] = len(df[df["涨跌幅"] < 0])
                result["flat_count"] = len(df[df["涨跌幅"] == 0])
                result["avg_change"] = df["涨跌幅"].mean()
            except Exception as e:
                result["error"] = str(e)
            return result

        return await _fetch()

    async def get_index_components(self, index_code: str = "000300") -> List[str]:
        """
        获取指数成分股

        Args:
            index_code: 指数代码，默认沪深300

        Returns:
            成分股代码列表
        """
        cache_key = f"index:{index_code}"

        @self.cache.cached(key_prefix="akshare", ttl=86400)
        async def _fetch():
            try:
                df = await asyncio.to_thread(
                    ak.index_zh_a_hist_min_em,
                    symbol=index_code
                )
                return df["代码"].tolist() if "代码" in df.columns else []
            except Exception:
                return []

        return await _fetch()

    async def get_stock_news(self, symbol: str, limit: int = 10) -> List[Dict[str, Any]]:
        """
        获取股票新闻

        Args:
            symbol: 股票代码
            limit: 新闻数量

        Returns:
            新闻列表
        """
        cache_key = f"news:{symbol}:{limit}"

        @self.cache.cached(key_prefix="akshare", ttl=600)
        async def _fetch():
            try:
                df = await asyncio.to_thread(
                    ak.stock_news_em,
                    symbol=symbol
                )
                result = df.head(limit).to_dict("records")
                return result
            except Exception as e:
                return [{"error": str(e)}]

        return await _fetch()


def create_akshare_provider(cache_manager: Optional[CacheManager] = None) -> AKShareProvider:
    """创建AKShare提供者"""
    return AKShareProvider(cache_manager)
