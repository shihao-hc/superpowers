"""
Stock Analysis Module: Comprehensive stock analysis tools.
- Fundamental analysis (financial metrics, ratios)
- Technical analysis (indicators, patterns)
- Stock screening
- Comparative analysis
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import json


@dataclass
class StockAnalysis:
    """Comprehensive stock analysis result."""
    ticker: str
    date: str
    fundamental: Dict
    technical: Dict
    valuation: Dict
    signals: List[str]
    score: float


class FundamentalAnalyzer:
    """Fundamental analysis for stocks."""

    def __init__(self):
        self.metrics_cache = {}

    def analyze(
        self,
        ticker: str,
        price_df: pd.DataFrame,
        fundamentals: Optional[Dict] = None
    ) -> Dict:
        """
        Perform fundamental analysis.
        
        Args:
            ticker: Stock ticker
            price_df: Historical price data
            fundamentals: Dict of fundamental metrics (PE, ROE, etc.)
        
        Returns:
            Dict with fundamental analysis results
        """
        latest_price = price_df["close"].iloc[-1] if not price_df.empty else 0
        price_history = price_df["close"]

        # Calculate basic metrics
        pe_ratio = fundamentals.get("pe_ratio", 15.0) if fundamentals else 15.0
        pb_ratio = fundamentals.get("pb_ratio", 2.0) if fundamentals else 2.0
        roe = fundamentals.get("roe", 0.15) if fundamentals else 0.15
        debt_to_equity = fundamentals.get("debt_to_equity", 0.5) if fundamentals else 0.5
        dividend_yield = fundamentals.get("dividend_yield", 0.02) if fundamentals else 0.02
        revenue_growth = fundamentals.get("revenue_growth", 0.1) if fundamentals else 0.1

        # Calculate price-based metrics
        volatility = price_history.pct_change().std() * np.sqrt(252) if len(price_history) > 1 else 0
        max_price = price_history.max()
        min_price = price_history.min()
        avg_price = price_history.mean()

        # Current price position
        if max_price > min_price:
            price_position = (latest_price - min_price) / (max_price - min_price)
        else:
            price_position = 0.5

        return {
            "ticker": ticker,
            "latest_price": round(latest_price, 2),
            "pe_ratio": round(pe_ratio, 2),
            "pb_ratio": round(pb_ratio, 2),
            "roe": round(roe, 4),
            "debt_to_equity": round(debt_to_equity, 2),
            "dividend_yield": round(dividend_yield, 4),
            "revenue_growth": round(revenue_growth, 4),
            "52w_high": round(max_price, 2),
            "52w_low": round(min_price, 2),
            "price_position": round(price_position, 4),  # 0=at low, 1=at high
            "volatility": round(volatility, 4),
            "score": self._calculate_fundamental_score(pe_ratio, roe, debt_to_equity, dividend_yield)
        }

    def _calculate_fundamental_score(
        self,
        pe: float,
        roe: float,
        debt_to_equity: float,
        dividend_yield: float
    ) -> float:
        """Calculate fundamental score (0-100)."""
        score = 50.0

        # PE ratio scoring (lower is better, but not too low)
        if 0 < pe < 10:
            score += 10
        elif 10 <= pe < 20:
            score += 15
        elif 20 <= pe < 30:
            score += 5
        elif pe >= 30:
            score -= 10

        # ROE scoring (higher is better)
        score += min(roe * 100, 20)

        # Debt scoring (lower is better)
        if debt_to_equity < 0.3:
            score += 15
        elif debt_to_equity < 0.6:
            score += 10
        elif debt_to_equity < 1.0:
            score += 5
        else:
            score -= 10

        # Dividend scoring
        score += min(dividend_yield * 500, 10)

        return max(0, min(100, score))

    def compare(
        self,
        tickers: List[str],
        price_df_map: Dict[str, pd.DataFrame],
        fundamentals_map: Dict[str, Dict]
    ) -> pd.DataFrame:
        """Compare fundamentals across multiple stocks."""
        results = []
        for ticker in tickers:
            price_df = price_df_map.get(ticker, pd.DataFrame())
            fundamentals = fundamentals_map.get(ticker, {})
            analysis = self.analyze(ticker, price_df, fundamentals)
            results.append(analysis)

        return pd.DataFrame(results)


class TechnicalAnalyzer:
    """Technical analysis for stocks."""

    def __init__(self):
        self.indicators = {}

    def calculate_indicators(
        self,
        price_df: pd.DataFrame,
        indicators: Optional[List[str]] = None
    ) -> pd.DataFrame:
        """
        Calculate technical indicators.
        
        Args:
            price_df: DataFrame with columns [date, open, high, low, close, volume]
            indicators: List of indicators to calculate
        
        Returns:
            DataFrame with original data + indicator columns
        """
        if price_df.empty:
            return price_df

        df = price_df.copy()
        close = df["close"]

        # Moving averages
        df["sma_5"] = close.rolling(5).mean()
        df["sma_10"] = close.rolling(10).mean()
        df["sma_20"] = close.rolling(20).mean()
        df["sma_50"] = close.rolling(50).mean()
        df["sma_200"] = close.rolling(200).mean()

        df["ema_12"] = close.ewm(span=12, adjust=False).mean()
        df["ema_26"] = close.ewm(span=26, adjust=False).mean()

        # RSI
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / (loss + 1e-10)
        df["rsi_14"] = 100 - (100 / (1 + rs))

        # MACD
        df["macd"] = df["ema_12"] - df["ema_26"]
        df["macd_signal"] = df["macd"].ewm(span=9, adjust=False).mean()
        df["macd_hist"] = df["macd"] - df["macd_signal"]

        # Bollinger Bands
        df["bb_middle"] = close.rolling(20).mean()
        bb_std = close.rolling(20).std()
        df["bb_upper"] = df["bb_middle"] + (bb_std * 2)
        df["bb_lower"] = df["bb_middle"] - (bb_std * 2)

        # ATR
        high_low = df["high"] - df["low"]
        high_close = (df["high"] - df["close"].shift()).abs()
        low_close = (df["low"] - df["close"].shift()).abs()
        tr = pd.concat([high_low, high_close, low_close], axis=1).max(axis=1)
        df["atr_14"] = tr.rolling(14).mean()

        # Volume indicators
        df["volume_sma_20"] = df["volume"].rolling(20).mean()
        df["volume_ratio"] = df["volume"] / df["volume_sma_20"]

        # Stochastic
        low_14 = df["low"].rolling(14).min()
        high_14 = df["high"].rolling(14).max()
        df["stoch_k"] = 100 * (close - low_14) / (high_14 - low_14 + 1e-10)
        df["stoch_d"] = df["stoch_k"].rolling(3).mean()

        return df

    def detect_patterns(self, price_df: pd.DataFrame) -> List[Dict]:
        """Detect chart patterns."""
        if price_df.empty or len(price_df) < 20:
            return []

        patterns = []
        close = price_df["close"]
        high = price_df["high"]
        low = price_df["low"]

        # Golden Cross (SMA 50 crosses above SMA 200)
        if len(price_df) >= 50:
            sma_50 = close.rolling(50).mean()
            sma_200 = close.rolling(200).mean()
            if sma_50.iloc[-2] < sma_200.iloc[-2] and sma_50.iloc[-1] > sma_200.iloc[-1]:
                patterns.append({"pattern": "golden_cross", "signal": "bullish", "confidence": 0.8})

            if sma_50.iloc[-2] > sma_200.iloc[-2] and sma_50.iloc[-1] < sma_200.iloc[-1]:
                patterns.append({"pattern": "death_cross", "signal": "bearish", "confidence": 0.8})

        # Double bottom
        if len(price_df) >= 20:
            recent_lows = low.tail(10)
            if len(recent_lows) >= 2:
                min1 = recent_lows.min()
                if (recent_lows - min1).abs().max() < min1 * 0.02:
                    patterns.append({"pattern": "double_bottom", "signal": "bullish", "confidence": 0.6})

        # RSI signals
        rsi = self._get_latest_rsi(price_df)
        if rsi:
            if rsi > 70:
                patterns.append({"pattern": "rsi_overbought", "signal": "bearish", "confidence": 0.7})
            elif rsi < 30:
                patterns.append({"pattern": "rsi_oversold", "signal": "bullish", "confidence": 0.7})

        return patterns

    def _get_latest_rsi(self, price_df: pd.DataFrame) -> Optional[float]:
        """Get latest RSI value."""
        if "rsi_14" in price_df.columns:
            rsi = price_df["rsi_14"].iloc[-1]
            if not np.isnan(rsi):
                return rsi
        return None

    def analyze(
        self,
        ticker: str,
        price_df: pd.DataFrame,
        indicators: Optional[List[str]] = None
    ) -> Dict:
        """Perform complete technical analysis."""
        df = self.calculate_indicators(price_df, indicators)
        if df.empty:
            return {}

        latest = df.iloc[-1]
        signals = []

        # Trend analysis
        if latest.get("sma_50", 0) > latest.get("sma_200", 0):
            signals.append("bullish_trend")
        else:
            signals.append("bearish_trend")

        # RSI
        rsi = latest.get("rsi_14", 50)
        if rsi > 70:
            signals.append("overbought")
        elif rsi < 30:
            signals.append("oversold")

        # MACD
        if latest.get("macd_hist", 0) > 0:
            signals.append("macd_bullish")
        else:
            signals.append("macd_bearish")

        # Bollinger Bands
        if latest["close"] < latest.get("bb_lower", 0):
            signals.append("bb_lower_band")
        elif latest["close"] > latest.get("bb_upper", 0):
            signals.append("bb_upper_band")

        # Calculate technical score
        score = self._calculate_technical_score(signals)

        return {
            "ticker": ticker,
            "date": str(latest.get("date", "")),
            "close": round(latest["close"], 2),
            "sma_5": round(latest.get("sma_5", 0), 2),
            "sma_20": round(latest.get("sma_20", 0), 2),
            "sma_50": round(latest.get("sma_50", 0), 2),
            "sma_200": round(latest.get("sma_200", 0), 2),
            "rsi_14": round(rsi, 2),
            "macd": round(latest.get("macd", 0), 4),
            "macd_signal": round(latest.get("macd_signal", 0), 4),
            "macd_hist": round(latest.get("macd_hist", 0), 4),
            "bb_upper": round(latest.get("bb_upper", 0), 2),
            "bb_middle": round(latest.get("bb_middle", 0), 2),
            "bb_lower": round(latest.get("bb_lower", 0), 2),
            "atr_14": round(latest.get("atr_14", 0), 4),
            "signals": signals,
            "score": score
        }

    def _calculate_technical_score(self, signals: List[str]) -> float:
        """Calculate technical score (0-100)."""
        score = 50.0

        bullish_signals = ["bullish_trend", "rsi_oversold", "macd_bullish", "bb_lower_band", "golden_cross", "double_bottom"]
        bearish_signals = ["bearish_trend", "rsi_overbought", "macd_bearish", "bb_upper_band", "death_cross", "double_top"]

        for sig in signals:
            if sig in bullish_signals:
                score += 10
            elif sig in bearish_signals:
                score -= 10

        return max(0, min(100, score))


class StockScreener:
    """Stock screening based on criteria."""

    def __init__(self):
        self.criteria = {}

    def screen(
        self,
        price_dfs: Dict[str, pd.DataFrame],
        fundamentals_map: Dict[str, Dict],
        criteria: Dict
    ) -> List[Dict]:
        """
        Screen stocks based on criteria.
        
        Args:
            price_dfs: Dict of ticker -> price DataFrame
            fundamentals_map: Dict of ticker -> fundamentals Dict
            criteria: Screening criteria
        
        Returns:
            List of matching stocks with scores
        """
        results = []

        for ticker, price_df in price_dfs.items():
            fundamentals = fundamentals_map.get(ticker, {})

            # Fundamental screening
            if "min_pe" in criteria:
                pe = fundamentals.get("pe_ratio", 100)
                if pe < criteria["min_pe"] or pe > criteria.get("max_pe", 1000):
                    continue

            if "min_roe" in criteria:
                roe = fundamentals.get("roe", 0)
                if roe < criteria["min_roe"]:
                    continue

            # Technical screening
            if not price_df.empty:
                close = price_df["close"].iloc[-1]
                sma_50 = price_df["close"].rolling(50).mean().iloc[-1]
                sma_200 = price_df["close"].rolling(200).mean().iloc[-1]

                # Price above SMA
                if criteria.get("above_sma50", False) and close < sma_50:
                    continue
                if criteria.get("above_sma200", False) and close < sma_200:
                    continue

            results.append({
                "ticker": ticker,
                "match_score": self._calculate_match_score(price_df, fundamentals, criteria),
                "price": price_df["close"].iloc[-1] if not price_df.empty else 0
            })

        # Sort by score
        results.sort(key=lambda x: x["match_score"], reverse=True)
        return results

    def _calculate_match_score(
        self,
        price_df: pd.DataFrame,
        fundamentals: Dict,
        criteria: Dict
    ) -> float:
        """Calculate how well the stock matches criteria."""
        score = 0.0

        # Add scoring logic here
        return score


class StockAnalyzer:
    """Complete stock analyzer combining fundamental and technical analysis."""

    def __init__(self):
        self.fundamental = FundamentalAnalyzer()
        self.technical = TechnicalAnalyzer()
        self.screener = StockScreener()

    def analyze(
        self,
        ticker: str,
        price_df: pd.DataFrame,
        fundamentals: Optional[Dict] = None
    ) -> StockAnalysis:
        """Complete stock analysis."""
        fund_analysis = self.fundamental.analyze(ticker, price_df, fundamentals)
        tech_analysis = self.technical.analyze(ticker, price_df)

        # Combine signals
        signals = []
        if "bullish_trend" in tech_analysis.get("signals", []):
            signals.append("bullish_trend")
        if "rsi_oversold" in tech_analysis.get("signals", []):
            signals.append("rsi_oversold")

        # Calculate overall score
        fund_score = fund_analysis.get("score", 50)
        tech_score = tech_analysis.get("score", 50)
        combined_score = (fund_score * 0.4 + tech_score * 0.6)

        return StockAnalysis(
            ticker=ticker,
            date=datetime.now().strftime("%Y-%m-%d"),
            fundamental=fund_analysis,
            technical=tech_analysis,
            valuation={"score": combined_score},
            signals=signals,
            score=combined_score
        )

    def compare(self, tickers: List[str], data_map: Dict) -> pd.DataFrame:
        """Compare multiple stocks."""
        results = []
        for ticker in tickers:
            price_df = data_map.get(ticker, {}).get("price", pd.DataFrame())
            fundamentals = data_map.get(ticker, {}).get("fundamentals", {})

            analysis = self.analyze(ticker, price_df, fundamentals)
            results.append({
                "ticker": ticker,
                "score": analysis.score,
                "fundamental_score": analysis.fundamental.get("score", 0),
                "technical_score": analysis.technical.get("score", 0),
            })

        return pd.DataFrame(results)


def demo_stock_analysis():
    """Demo stock analysis."""
    from stock_selector.data_pipeline import DataIngestor

    # Fetch sample data
    tickers = ["AAPL", "MSFT", "GOOGL"]
    di = DataIngestor(tickers, start_date="2025-01-01", end_date="2025-03-25")
    price_df = di.fetch_price_data()

    # Convert to dict format for analysis
    price_dfs = {}
    for ticker in tickers:
        price_dfs[ticker] = price_df[price_df["ticker"] == ticker]

    # Analyze
    analyzer = StockAnalyzer()

    print("=== Stock Analysis Demo ===")
    for ticker in tickers:
        analysis = analyzer.analyze(ticker, price_dfs[ticker])
        print(f"\n{ticker}:")
        print(f"  Score: {analysis.score:.1f}")
        print(f"  Fundamental: {analysis.fundamental.get('score', 0):.1f}")
        print(f"  Technical: {analysis.technical.get('score', 0):.1f}")
        print(f"  Signals: {analysis.signals}")


if __name__ == "__main__":
    demo_stock_analysis()
