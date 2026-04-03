"""
Feature engine for dynamic feature computation.

This module provides the main feature computation engine
that orchestrates all feature generation for ML models.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from loguru import logger

from .base import FeatureCategory, FeatureConfig, FeatureResult
from .technical import TechnicalIndicators


class FeatureEngine:
    """
    Main feature computation engine.
    
    Orchestrates feature generation across multiple categories:
    - Price-based features
    - Volume features
    - Technical indicators
    - Fundamental features
    - Custom features
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.technical = TechnicalIndicators()
        self._feature_cache = {}
        
        # Feature configurations
        self.feature_configs = self._initialize_feature_configs()
    
    def _initialize_feature_configs(self) -> Dict[str, FeatureConfig]:
        """Initialize default feature configurations."""
        configs = {}
        
        # Price features
        configs["returns_1d"] = FeatureConfig(
            name="returns_1d",
            category=FeatureCategory.PRICE,
            description="1-day returns"
        )
        configs["returns_5d"] = FeatureConfig(
            name="returns_5d",
            category=FeatureCategory.PRICE,
            description="5-day returns",
            window=5
        )
        configs["returns_20d"] = FeatureConfig(
            name="returns_20d",
            category=FeatureCategory.PRICE,
            description="20-day returns",
            window=20
        )
        
        # Volume features
        configs["volume_ratio"] = FeatureConfig(
            name="volume_ratio",
            category=FeatureCategory.VOLUME,
            description="Volume ratio to 20-day average",
            window=20
        )
        configs["obv"] = FeatureConfig(
            name="obv",
            category=FeatureCategory.VOLUME,
            description="On-Balance Volume"
        )
        
        # Momentum features
        configs["rsi_14"] = FeatureConfig(
            name="rsi_14",
            category=FeatureCategory.MOMENTUM,
            description="14-day RSI",
            window=14
        )
        configs["macd_histogram"] = FeatureConfig(
            name="macd_histogram",
            category=FeatureCategory.MOMENTUM,
            description="MACD Histogram"
        )
        
        # Trend features
        configs["sma_20"] = FeatureConfig(
            name="sma_20",
            category=FeatureCategory.TREND,
            description="20-day Simple Moving Average",
            window=20
        )
        configs["ema_20"] = FeatureConfig(
            name="ema_20",
            category=FeatureCategory.TREND,
            description="20-day Exponential Moving Average",
            window=20
        )
        
        # Volatility features
        configs["volatility_20d"] = FeatureConfig(
            name="volatility_20d",
            category=FeatureCategory.VOLATILITY,
            description="20-day historical volatility",
            window=20
        )
        configs["atr_14"] = FeatureConfig(
            name="atr_14",
            category=FeatureCategory.VOLATILITY,
            description="14-day Average True Range",
            window=14
        )
        configs["bollinger_bandwidth"] = FeatureConfig(
            name="bollinger_bandwidth",
            category=FeatureCategory.VOLATILITY,
            description="Bollinger Band Width"
        )
        
        # Mean reversion features
        configs["price_to_sma20"] = FeatureConfig(
            name="price_to_sma20",
            category=FeatureCategory.MEAN_REVERSION,
            description="Price to 20-day SMA ratio"
        )
        configs["bb_percent_b"] = FeatureConfig(
            name="bb_percent_b",
            category=FeatureCategory.MEAN_REVERSION,
            description="Bollinger Band %B"
        )
        
        return configs
    
    async def compute_features(
        self,
        df: pd.DataFrame,
        symbol: str,
        feature_names: Optional[List[str]] = None
    ) -> FeatureResult:
        """
        Compute features for a stock.
        
        Args:
            df: DataFrame with OHLCV data
            symbol: Stock symbol
            feature_names: List of feature names to compute (None for all)
            
        Returns:
            FeatureResult with computed features
        """
        if df.empty:
            return FeatureResult(
                symbol=symbol,
                timestamp=datetime.now(),
                features={},
                metadata={"error": "Empty DataFrame"}
            )
        
        features = {}
        
        try:
            # Compute all feature categories
            price_features = self._compute_price_features(df)
            volume_features = self._compute_volume_features(df)
            momentum_features = self._compute_momentum_features(df)
            trend_features = self._compute_trend_features(df)
            volatility_features = self._compute_volatility_features(df)
            mean_reversion_features = self._compute_mean_reversion_features(df)
            pattern_features = self._compute_pattern_features(df)
            
            # Merge all features
            all_features = {
                **price_features,
                **volume_features,
                **momentum_features,
                **trend_features,
                **volatility_features,
                **mean_reversion_features,
                **pattern_features
            }
            
            # Filter by requested features if specified
            if feature_names:
                features = {k: v for k, v in all_features.items() if k in feature_names}
            else:
                features = all_features
            
            # Get latest values
            latest_features = {}
            for name, series in features.items():
                if isinstance(series, pd.Series) and not series.empty:
                    latest_features[name] = float(series.iloc[-1])
                elif isinstance(series, (int, float)):
                    latest_features[name] = float(series)
            
            return FeatureResult(
                symbol=symbol,
                timestamp=df.index[-1] if isinstance(df.index, pd.DatetimeIndex) else datetime.now(),
                features=latest_features,
                metadata={
                    "total_features": len(latest_features),
                    "data_points": len(df)
                }
            )
            
        except Exception as e:
            logger.error(f"Error computing features for {symbol}: {e}")
            return FeatureResult(
                symbol=symbol,
                timestamp=datetime.now(),
                features={},
                metadata={"error": str(e)}
            )
    
    def _compute_price_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Compute price-based features."""
        features = {}
        
        # Returns
        features["returns_1d"] = df["close"].pct_change()
        features["returns_5d"] = df["close"].pct_change(5)
        features["returns_20d"] = df["close"].pct_change(20)
        features["returns_60d"] = df["close"].pct_change(60)
        
        # Price ratios
        features["high_low_ratio"] = df["high"] / df["low"]
        features["close_open_ratio"] = df["close"] / df["open"]
        
        # Price position
        features["price_position"] = (df["close"] - df["low"]) / (df["high"] - df["low"])
        
        return features
    
    def _compute_volume_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Compute volume-based features."""
        features = {}
        
        # Volume ratios
        volume_ma = df["volume"].rolling(window=20).mean()
        features["volume_ratio"] = df["volume"] / volume_ma
        features["volume_change"] = df["volume"].pct_change()
        
        # OBV
        features["obv"] = self.technical.obv(df)
        features["obv_slope"] = features["obv"].diff(5)
        
        # Volume-Price relationship
        features["volume_price_corr"] = (
            df["volume"].rolling(window=20).corr(df["close"])
        )
        
        return features
    
    def _compute_momentum_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Compute momentum features."""
        features = {}
        
        # RSI
        features["rsi_14"] = self.technical.rsi(df, period=14)
        features["rsi_7"] = self.technical.rsi(df, period=7)
        
        # MACD
        macd = self.technical.macd(df)
        features["macd"] = macd["macd"]
        features["macd_signal"] = macd["signal"]
        features["macd_histogram"] = macd["histogram"]
        
        # Stochastic
        stoch = self.technical.stochastic(df)
        features["stoch_k"] = stoch["k"]
        features["stoch_d"] = stoch["d"]
        
        # Rate of Change
        features["roc_10"] = df["close"].pct_change(10) * 100
        features["roc_20"] = df["close"].pct_change(20) * 100
        
        # Momentum
        features["momentum_10"] = df["close"] / df["close"].shift(10) - 1
        features["momentum_20"] = df["close"] / df["close"].shift(20) - 1
        
        return features
    
    def _compute_trend_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Compute trend features."""
        features = {}
        
        # Moving averages
        features["sma_10"] = self.technical.sma(df, period=10)
        features["sma_20"] = self.technical.sma(df, period=20)
        features["sma_50"] = self.technical.sma(df, period=50)
        features["sma_200"] = self.technical.sma(df, period=200)
        
        features["ema_12"] = self.technical.ema(df, period=12)
        features["ema_26"] = self.technical.ema(df, period=26)
        
        # Moving average slopes
        features["sma_20_slope"] = features["sma_20"].diff(5) / features["sma_20"].shift(5)
        features["sma_50_slope"] = features["sma_50"].diff(5) / features["sma_50"].shift(5)
        
        # Moving average crossovers
        features["golden_cross"] = (
            (features["sma_20"] > features["sma_50"]) & 
            (features["sma_20"].shift(1) <= features["sma_50"].shift(1))
        ).astype(int)
        
        features["death_cross"] = (
            (features["sma_20"] < features["sma_50"]) & 
            (features["sma_20"].shift(1) >= features["sma_50"].shift(1))
        ).astype(int)
        
        # ADX
        adx = self.technical.adx(df)
        features["adx"] = adx["adx"]
        features["plus_di"] = adx["plus_di"]
        features["minus_di"] = adx["minus_di"]
        
        return features
    
    def _compute_volatility_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Compute volatility features."""
        features = {}
        
        # Historical volatility
        log_returns = np.log(df["close"] / df["close"].shift(1))
        features["volatility_10d"] = log_returns.rolling(window=10).std() * np.sqrt(252)
        features["volatility_20d"] = log_returns.rolling(window=20).std() * np.sqrt(252)
        features["volatility_60d"] = log_returns.rolling(window=60).std() * np.sqrt(252)
        
        # ATR
        features["atr_14"] = self.technical.atr(df, period=14)
        features["atr_ratio"] = features["atr_14"] / df["close"]
        
        # Bollinger Bands
        bb = self.technical.bollinger_bands(df)
        features["bb_upper"] = bb["upper"]
        features["bb_middle"] = bb["middle"]
        features["bb_lower"] = bb["lower"]
        features["bb_bandwidth"] = bb["bandwidth"]
        features["bb_percent_b"] = bb["percent_b"]
        
        # Volatility ratios
        features["volatility_ratio"] = (
            features["volatility_10d"] / features["volatility_60d"]
        )
        
        return features
    
    def _compute_mean_reversion_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Compute mean reversion features."""
        features = {}
        
        # Price to moving average ratios
        sma_20 = self.technical.sma(df, period=20)
        sma_50 = self.technical.sma(df, period=50)
        
        features["price_to_sma20"] = df["close"] / sma_20
        features["price_to_sma50"] = df["close"] / sma_50
        
        # Z-score
        features["zscore_20"] = (
            (df["close"] - df["close"].rolling(window=20).mean()) / 
            df["close"].rolling(window=20).std()
        )
        
        # Distance from high/low
        features["dist_from_52w_high"] = df["close"] / df["high"].rolling(window=252).max() - 1
        features["dist_from_52w_low"] = df["close"] / df["low"].rolling(window=252).min() - 1
        
        return features
    
    def _compute_pattern_features(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """Compute candlestick pattern features."""
        patterns = self.technical.candle_patterns(df)
        return patterns
    
    def get_feature_names(self) -> List[str]:
        """Get list of all available feature names."""
        return list(self.feature_configs.keys())
    
    def get_features_by_category(
        self, 
        category: FeatureCategory
    ) -> List[str]:
        """Get feature names by category."""
        return [
            name for name, config in self.feature_configs.items()
            if config.category == category
        ]