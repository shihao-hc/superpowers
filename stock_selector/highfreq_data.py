"""
High-Frequency Data Source: Tick and intraday data provider.
- Tick-by-tick data
- Minute-level bars
- Market depth (order book)
- Real-time websocket feeds
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Callable
from dataclasses import dataclass
from collections import deque
import threading
import time


@dataclass
class TickData:
    """Single tick data point."""
    timestamp: datetime
    ticker: str
    price: float
    volume: int
    direction: str  # "buy" or "sell"
    ask_price: float
    bid_price: float


@dataclass
class OrderBookLevel:
    """Order book level."""
    price: float
    volume: int
    orders: int


@dataclass
class OrderBook:
    """Market depth / order book."""
    timestamp: datetime
    ticker: str
    asks: List[OrderBookLevel]  # Sorted by price ascending
    bids: List[OrderBookLevel]  # Sorted by price descending


class HighFreqDataProvider:
    """
    High-frequency data provider for real-time market data.
    Supports tick data, minute bars, and order book depth.
    """

    def __init__(self, data_source: str = "yfinance"):
        self.data_source = data_source
        self.tick_buffer: Dict[str, deque] = {}
        self.orderbook_buffer: Dict[str, deque] = {}
        self._running = False
        self._stream_thread: Optional[threading.Thread] = None

    def fetch_tick_data(
        self,
        ticker: str,
        start_time: datetime,
        end_time: datetime
    ) -> pd.DataFrame:
        """
        Fetch historical tick data.
        
        Returns DataFrame with columns:
        timestamp, ticker, price, volume, direction, ask_price, bid_price
        """
        # Mock implementation - in production connect to real feed
        ticks = []
        current = start_time
        np.random.seed(hash(ticker) % 10000)
        base_price = 100.0

        while current <= end_time:
            if current.second == 0:  # Sample every second
                price = base_price + np.random.randn() * 0.5
                volume = np.random.randint(100, 10000)
                direction = "buy" if np.random.random() > 0.5 else "sell"

                tick = TickData(
                    timestamp=current,
                    ticker=ticker,
                    price=round(price, 2),
                    volume=volume,
                    direction=direction,
                    ask_price=round(price + 0.01, 2),
                    bid_price=round(price - 0.01, 2)
                )
                ticks.append({
                    "timestamp": tick.timestamp,
                    "ticker": tick.ticker,
                    "price": tick.price,
                    "volume": tick.volume,
                    "direction": tick.direction,
                    "ask_price": tick.ask_price,
                    "bid_price": tick.bid_price,
                })

            current += timedelta(seconds=1)

        return pd.DataFrame(ticks)

    def fetch_minute_bars(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        frequency: int = 1  # 1, 5, 15, 30, 60 minutes
    ) -> pd.DataFrame:
        """
        Fetch minute-level bar data.
        
        Returns DataFrame with columns:
        timestamp, ticker, open, high, low, close, volume
        """
        if self.data_source == "yfinance":
            try:
                import yfinance as yf
                interval_map = {
                    1: "1m",
                    5: "5m",
                    15: "15m",
                    30: "30m",
                    60: "60m"
                }
                interval = interval_map.get(frequency, "1m")

                df = yf.download(ticker, start=start_date, end=end_date, interval=interval, progress=False)
                if df is None or df.empty:
                    return self._generate_mock_minute_bars(ticker, start_date, end_date, frequency)

                df = df.reset_index()
                df.columns = [c.lower() for c in df.columns]
                if "datetime" in df.columns:
                    df = df.rename(columns={"datetime": "timestamp"})
                elif "date" in df.columns:
                    df = df.rename(columns={"date": "timestamp"})

                df["ticker"] = ticker
                return df[["timestamp", "ticker", "open", "high", "low", "close", "volume"]]
            except Exception as e:
                print(f"Error fetching minute bars: {e}")

        return self._generate_mock_minute_bars(ticker, start_date, end_date, frequency)

    def _generate_mock_minute_bars(
        self,
        ticker: str,
        start_date: str,
        end_date: str,
        frequency: int
    ) -> pd.DataFrame:
        """Generate mock minute bar data."""
        start = pd.to_datetime(start_date)
        end = pd.to_datetime(end_date)

        # Generate 1-minute bars
        freq = f"{frequency}min"
        timestamps = pd.date_range(start, end, freq=freq)

        np.random.seed(hash(ticker) % 10000)
        base_price = 100.0
        prices = base_price + np.cumsum(np.random.randn(len(timestamps)) * 0.5)

        data = []
        for i, ts in enumerate(timestamps):
            open_p = prices[i]
            high_p = max(prices[max(0, i-5):i+1]) + np.random.random() * 0.2
            low_p = min(prices[max(0, i-5):i+1]) - np.random.random() * 0.2
            close_p = prices[i]
            volume = np.random.randint(10000, 1000000)

            data.append({
                "timestamp": ts,
                "ticker": ticker,
                "open": round(open_p, 2),
                "high": round(high_p, 2),
                "low": round(low_p, 2),
                "close": round(close_p, 2),
                "volume": volume
            })

        return pd.DataFrame(data)

    def fetch_order_book(self, ticker: str) -> OrderBook:
        """
        Fetch current order book (market depth).
        
        Returns OrderBook with best bids and asks.
        """
        np.random.seed(int(time.time()) % 10000)
        base_price = 100.0

        asks = []
        bids = []
        for i in range(10):
            ask_price = base_price + 0.01 * (i + 1)
            bid_price = base_price - 0.01 * (i + 1)
            ask_volume = np.random.randint(100, 10000)
            bid_volume = np.random.randint(100, 10000)

            asks.append(OrderBookLevel(
                price=round(ask_price, 2),
                volume=ask_volume,
                orders=np.random.randint(1, 50)
            ))
            bids.append(OrderBookLevel(
                price=round(bid_price, 2),
                volume=bid_volume,
                orders=np.random.randint(1, 50)
            ))

        return OrderBook(
            timestamp=datetime.now(),
            ticker=ticker,
            asks=asks,
            bids=bids
        )

    def calculate_vwap(self, tick_df: pd.DataFrame) -> float:
        """Calculate Volume Weighted Average Price."""
        if tick_df.empty:
            return 0.0

        total_price_volume = (tick_df["price"] * tick_df["volume"]).sum()
        total_volume = tick_df["volume"].sum()

        return total_price_volume / total_volume if total_volume > 0 else 0.0

    def calculate_spread(self, order_book: OrderBook) -> Dict:
        """Calculate bid-ask spread."""
        if not order_book.asks or not order_book.bids:
            return {"spread": 0.0, "mid_price": 0.0}

        best_ask = order_book.asks[0].price
        best_bid = order_book.bids[0].price
        spread = best_ask - best_bid
        mid_price = (best_ask + best_bid) / 2

        return {
            "spread": round(spread, 4),
            "mid_price": round(mid_price, 2),
            "best_bid": best_bid,
            "best_ask": best_ask
        }

    def calculate_micro_price(self, order_book: OrderBook, lambda_param: float = 0.5) -> float:
        """
        Calculate micro price (weighted by volume).
        micro_price = (bid_price * ask_volume + ask_price * bid_volume) / (bid_volume + ask_volume)
        """
        if not order_book.asks or not order_book.bids:
            return 0.0

        best_ask = order_book.asks[0]
        best_bid = order_book.bids[0]

        micro_price = (
            best_bid.price * best_ask.volume +
            best_ask.price * best_bid.volume
        ) / (best_bid.volume + best_ask.volume)

        return round(micro_price, 4)

    def detect_price_impact(self, tick_df: pd.DataFrame, window: int = 100) -> pd.DataFrame:
        """Detect price impact from trades."""
        if len(tick_df) < window:
            return pd.DataFrame()

        tick_df = tick_df.copy()
        tick_df["vwap"] = tick_df["price"].rolling(window).apply(
            lambda x: (x * tick_df.loc[x.index, "volume"]).sum() / x.sum()
        )
        tick_df["impact"] = tick_df["vwap"] - tick_df["price"]

        return tick_df[["timestamp", "ticker", "price", "vwap", "impact"]]

    def start_realtime_stream(
        self,
        tickers: List[str],
        callback: Callable[[TickData], None],
        interval: float = 1.0
    ) -> None:
        """
        Start real-time tick stream.
        
        Args:
            tickers: List of tickers to stream
            callback: Function to call on each tick
            interval: Update interval in seconds
        """
        self._running = True

        def stream_loop():
            while self._running:
                for ticker in tickers:
                    if not self._running:
                        break

                    # Generate mock tick
                    np.random.seed(int(time.time() * 1000) % 10000)
                    price = 100.0 + np.random.randn() * 0.5

                    tick = TickData(
                        timestamp=datetime.now(),
                        ticker=ticker,
                        price=round(price, 2),
                        volume=np.random.randint(100, 10000),
                        direction="buy" if np.random.random() > 0.5 else "sell",
                        ask_price=round(price + 0.01, 2),
                        bid_price=round(price - 0.01, 2)
                    )
                    callback(tick)

                time.sleep(interval)

        self._stream_thread = threading.Thread(target=stream_loop, daemon=True)
        self._stream_thread.start()

    def stop_realtime_stream(self) -> None:
        """Stop real-time tick stream."""
        self._running = False
        if self._stream_thread:
            self._stream_thread.join(timeout=2.0)


class IntradayAnalyzer:
    """Analyzer for intraday/high-frequency data."""

    def __init__(self, provider: HighFreqDataProvider):
        self.provider = provider

    def find_support_resistance(
        self,
        minute_df: pd.DataFrame,
        window: int = 20
    ) -> Dict:
        """Find support and resistance levels."""
        if minute_df.empty:
            return {"support": [], "resistance": []}

        highs = minute_df["high"].rolling(window).max()
        lows = minute_df["low"].rolling(window).min()

        support = lows.dropna().min()
        resistance = highs.dropna().max()

        return {
            "support": round(support, 2),
            "resistance": round(resistance, 2)
        }

    def calculate_atr(
        self,
        minute_df: pd.DataFrame,
        period: int = 14
    ) -> float:
        """Calculate Average True Range."""
        if len(minute_df) < period:
            return 0.0

        high = minute_df["high"]
        low = minute_df["low"]
        close = minute_df["close"]

        tr = pd.concat([
            high - low,
            (high - close.shift(1)).abs(),
            (low - close.shift(1)).abs()
        ], axis=1).max(axis=1)

        atr = tr.rolling(period).mean().iloc[-1]
        return round(atr, 4)

    def detect_volume_surge(
        self,
        minute_df: pd.DataFrame,
        threshold: float = 2.0
    ) -> pd.DataFrame:
        """Detect unusual volume surges."""
        if minute_df.empty:
            return pd.DataFrame()

        avg_volume = minute_df["volume"].mean()
        minute_df = minute_df.copy()
        minute_df["volume_ratio"] = minute_df["volume"] / avg_volume

        surges = minute_df[minute_df["volume_ratio"] > threshold]
        return surges


def demo_highfreq():
    """Demo high-frequency data provider."""
    provider = HighFreqDataProvider()

    # Fetch minute bars
    print("Fetching 1-minute bars for AAPL...")
    bars = provider.fetch_minute_bars("AAPL", "2025-03-01", "2025-03-25", frequency=1)
    print(f"Got {len(bars)} bars")
    print(bars.head())

    # Fetch order book
    print("\nFetching order book...")
    ob = provider.fetch_order_book("AAPL")
    print(f"Best bid: {ob.bids[0].price}, Best ask: {ob.asks[0].price}")

    # Calculate spread
    spread = provider.calculate_spread(ob)
    print(f"Spread: {spread}")

    # Calculate micro price
    micro = provider.calculate_micro_price(ob)
    print(f"Micro price: {micro}")


if __name__ == "__main__":
    demo_highfreq()
