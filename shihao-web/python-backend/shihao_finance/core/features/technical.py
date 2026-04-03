"""
Technical indicator features for stock analysis.

This module provides comprehensive technical analysis indicators
using pandas-ta and custom implementations.
"""

import pandas as pd
import numpy as np
from typing import Optional, Dict, Any
from loguru import logger

try:
    import pandas_ta as pta
    HAS_PANDAS_TA = True
except ImportError:
    HAS_PANDAS_TA = False
    logger.warning("pandas_ta not available, using custom implementations")


class TechnicalIndicators:
    """
    Technical indicator computation class.
    
    Provides a comprehensive set of technical indicators
    for stock analysis and feature engineering.
    """
    
    @staticmethod
    def sma(
        df: pd.DataFrame,
        period: int = 20,
        column: str = "close"
    ) -> pd.Series:
        """Simple Moving Average."""
        return df[column].rolling(window=period).mean()
    
    @staticmethod
    def ema(
        df: pd.DataFrame,
        period: int = 20,
        column: str = "close"
    ) -> pd.Series:
        """Exponential Moving Average."""
        return df[column].ewm(span=period, adjust=False).mean()
    
    @staticmethod
    def wma(
        df: pd.DataFrame,
        period: int = 20,
        column: str = "close"
    ) -> pd.Series:
        """Weighted Moving Average."""
        weights = np.arange(1, period + 1)
        return df[column].rolling(window=period).apply(
            lambda x: np.dot(x, weights) / weights.sum(),
            raw=True
        )
    
    @staticmethod
    def rsi(
        df: pd.DataFrame,
        period: int = 14,
        column: str = "close"
    ) -> pd.Series:
        """Relative Strength Index."""
        delta = df[column].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi
    
    @staticmethod
    def macd(
        df: pd.DataFrame,
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
        column: str = "close"
    ) -> Dict[str, pd.Series]:
        """MACD (Moving Average Convergence Divergence)."""
        ema_fast = df[column].ewm(span=fast, adjust=False).mean()
        ema_slow = df[column].ewm(span=slow, adjust=False).mean()
        macd_line = ema_fast - ema_slow
        signal_line = macd_line.ewm(span=signal, adjust=False).mean()
        histogram = macd_line - signal_line
        
        return {
            "macd": macd_line,
            "signal": signal_line,
            "histogram": histogram
        }
    
    @staticmethod
    def bollinger_bands(
        df: pd.DataFrame,
        period: int = 20,
        std_dev: float = 2.0,
        column: str = "close"
    ) -> Dict[str, pd.Series]:
        """Bollinger Bands."""
        sma = df[column].rolling(window=period).mean()
        std = df[column].rolling(window=period).std()
        
        upper = sma + (std * std_dev)
        lower = sma - (std * std_dev)
        bandwidth = (upper - lower) / sma
        percent_b = (df[column] - lower) / (upper - lower)
        
        return {
            "upper": upper,
            "middle": sma,
            "lower": lower,
            "bandwidth": bandwidth,
            "percent_b": percent_b
        }
    
    @staticmethod
    def atr(
        df: pd.DataFrame,
        period: int = 14
    ) -> pd.Series:
        """Average True Range."""
        high = df["high"]
        low = df["low"]
        close = df["close"]
        
        tr1 = high - low
        tr2 = abs(high - close.shift())
        tr3 = abs(low - close.shift())
        
        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
        atr = tr.rolling(window=period).mean()
        
        return atr
    
    @staticmethod
    def stochastic(
        df: pd.DataFrame,
        k_period: int = 14,
        d_period: int = 3
    ) -> Dict[str, pd.Series]:
        """Stochastic Oscillator."""
        low_min = df["low"].rolling(window=k_period).min()
        high_max = df["high"].rolling(window=k_period).max()
        
        k_percent = 100 * (df["close"] - low_min) / (high_max - low_min)
        d_percent = k_percent.rolling(window=d_period).mean()
        
        return {
            "k": k_percent,
            "d": d_percent
        }
    
    @staticmethod
    def adx(
        df: pd.DataFrame,
        period: int = 14
    ) -> Dict[str, pd.Series]:
        """Average Directional Index."""
        plus_dm = df["high"].diff()
        minus_dm = -df["low"].diff()
        
        plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
        minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)
        
        tr = TechnicalIndicators.atr(df, period=1)
        
        plus_di = 100 * (plus_dm.rolling(window=period).mean() / tr.rolling(window=period).mean())
        minus_di = 100 * (minus_dm.rolling(window=period).mean() / tr.rolling(window=period).mean())
        
        dx = 100 * abs(plus_di - minus_di) / (plus_di + minus_di)
        adx = dx.rolling(window=period).mean()
        
        return {
            "adx": adx,
            "plus_di": plus_di,
            "minus_di": minus_di
        }
    
    @staticmethod
    def obv(df: pd.DataFrame) -> pd.Series:
        """On-Balance Volume."""
        obv = (np.sign(df["close"].diff()) * df["volume"]).fillna(0).cumsum()
        return obv
    
    @staticmethod
    def vwap(
        df: pd.DataFrame
    ) -> pd.Series:
        """Volume Weighted Average Price."""
        typical_price = (df["high"] + df["low"] + df["close"]) / 3
        vwap = (typical_price * df["volume"]).cumsum() / df["volume"].cumsum()
        return vwap
    
    @staticmethod
    def ichimoku(
        df: pd.DataFrame,
        tenkan_period: int = 9,
        kijun_period: int = 26,
        senkou_b_period: int = 52
    ) -> Dict[str, pd.Series]:
        """Ichimoku Cloud components."""
        tenkan_sen = (df["high"].rolling(window=tenkan_period).max() + 
                      df["low"].rolling(window=tenkan_period).min()) / 2
        
        kijun_sen = (df["high"].rolling(window=kijun_period).max() + 
                     df["low"].rolling(window=kijun_period).min()) / 2
        
        senkou_a = ((tenkan_sen + kijun_sen) / 2).shift(kijun_period)
        
        senkou_b = ((df["high"].rolling(window=senkou_b_period).max() + 
                     df["low"].rolling(window=senkou_b_period).min()) / 2).shift(kijun_period)
        
        chikou_span = df["close"].shift(-kijun_period)
        
        return {
            "tenkan_sen": tenkan_sen,
            "kijun_sen": kijun_sen,
            "senkou_a": senkou_a,
            "senkou_b": senkou_b,
            "chikou_span": chikou_span
        }
    
    @staticmethod
    def fib_retracement(
        df: pd.DataFrame,
        period: int = 100
    ) -> Dict[str, float]:
        """Fibonacci Retracement Levels."""
        high = df["high"].rolling(window=period).max().iloc[-1]
        low = df["low"].rolling(window=period).min().iloc[-1]
        diff = high - low
        
        return {
            "0.0": high,
            "23.6": high - 0.236 * diff,
            "38.2": high - 0.382 * diff,
            "50.0": high - 0.5 * diff,
            "61.8": high - 0.618 * diff,
            "78.6": high - 0.786 * diff,
            "100.0": low
        }
    
    @staticmethod
    def candle_patterns(df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Candlestick pattern detection."""
        body = df["close"] - df["open"]
        body_abs = body.abs()
        upper_shadow = df["high"] - df[["close", "open"]].max(axis=1)
        lower_shadow = df[["close", "open"]].min(axis=1) - df["low"]
        range_price = df["high"] - df["low"]
        
        # Doji
        doji = body_abs < (range_price * 0.1)
        
        # Hammer
        hammer = (lower_shadow > body_abs * 2) & (upper_shadow < body_abs * 0.5)
        
        # Shooting Star
        shooting_star = (upper_shadow > body_abs * 2) & (lower_shadow < body_abs * 0.5)
        
        # Engulfing patterns
        engulfing_bullish = (
            (body.shift(1) < 0) &  # Previous candle bearish
            (body > 0) &  # Current candle bullish
            (df["close"] > df["open"].shift(1)) &
            (df["open"] < df["close"].shift(1))
        )
        
        engulfing_bearish = (
            (body.shift(1) > 0) &  # Previous candle bullish
            (body < 0) &  # Current candle bearish
            (df["close"] < df["open"].shift(1)) &
            (df["open"] > df["close"].shift(1))
        )
        
        return {
            "doji": doji.astype(int),
            "hammer": hammer.astype(int),
            "shooting_star": shooting_star.astype(int),
            "engulfing_bullish": engulfing_bullish.astype(int),
            "engulfing_bearish": engulfing_bearish.astype(int)
        }
    
    @staticmethod
    def pivot_points(
        df: pd.DataFrame
    ) -> Dict[str, pd.Series]:
        """Pivot Points."""
        pivot = (df["high"].shift(1) + df["low"].shift(1) + df["close"].shift(1)) / 3
        
        r1 = 2 * pivot - df["low"].shift(1)
        s1 = 2 * pivot - df["high"].shift(1)
        r2 = pivot + (df["high"].shift(1) - df["low"].shift(1))
        s2 = pivot - (df["high"].shift(1) - df["low"].shift(1))
        r3 = df["high"].shift(1) + 2 * (pivot - df["low"].shift(1))
        s3 = df["low"].shift(1) - 2 * (df["high"].shift(1) - pivot)
        
        return {
            "pivot": pivot,
            "r1": r1,
            "r2": r2,
            "r3": r3,
            "s1": s1,
            "s2": s2,
            "s3": s3
        }