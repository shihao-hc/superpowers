"""
Watchlist Monitoring: Monitor custom stock watchlists.
- Real-time price alerts
- Price target alerts
- Technical indicator alerts
- Portfolio tracking
- Notification system
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Callable
from dataclasses import dataclass, field
from collections import deque
import json
import time
import threading


@dataclass
class Alert:
    """Price or indicator alert."""
    alert_id: str
    ticker: str
    alert_type: str  # "price_above", "price_below", "rsi_above", "rsi_below", "volume_surge"
    threshold: float
    triggered: bool = False
    triggered_at: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class WatchlistItem:
    """Single item in a watchlist."""
    ticker: str
    added_at: str
    notes: str = ""
    tags: List[str] = field(default_factory=list)
    target_price: Optional[float] = None
    stop_loss: Optional[float] = None


@dataclass
class Watchlist:
    """Stock watchlist."""
    name: str
    description: str = ""
    items: List[WatchlistItem] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class PriceUpdate:
    """Real-time price update."""
    ticker: str
    timestamp: datetime
    price: float
    change: float
    change_pct: float
    volume: int
    volume_ratio: float


class WatchlistMonitor:
    """
    Real-time watchlist monitoring with alerts.
    """

    def __init__(self, check_interval: int = 60):
        self.check_interval = check_interval  # seconds
        self.watchlists: Dict[str, Watchlist] = {}
        self.alerts: Dict[str, List[Alert]] = {}
        self.price_history: Dict[str, deque] = {}  # ticker -> deque of PriceUpdate
        self.callbacks: List[Callable] = []
        self._running = False
        self._monitor_thread: Optional[threading.Thread] = None

        # Default watchlist
        self._create_default_watchlist()

    def _create_default_watchlist(self) -> None:
        """Create a default watchlist."""
        default = Watchlist(
            name="default",
            description="Default watchlist",
            items=[
                WatchlistItem(ticker="AAPL", added_at=datetime.now().isoformat(), tags=["tech"]),
                WatchlistItem(ticker="MSFT", added_at=datetime.now().isoformat(), tags=["tech"]),
                WatchlistItem(ticker="GOOGL", added_at=datetime.now().isoformat(), tags=["tech"]),
            ]
        )
        self.watchlists["default"] = default

    def create_watchlist(self, name: str, description: str = "") -> Watchlist:
        """Create a new watchlist."""
        if name in self.watchlists:
            raise ValueError(f"Watchlist '{name}' already exists")

        watchlist = Watchlist(name=name, description=description)
        self.watchlists[name] = watchlist
        self.alerts[name] = []
        return watchlist

    def delete_watchlist(self, name: str) -> None:
        """Delete a watchlist."""
        if name in self.watchlists:
            del self.watchlists[name]
        if name in self.alerts:
            del self.alerts[name]

    def add_to_watchlist(
        self,
        watchlist_name: str,
        ticker: str,
        notes: str = "",
        tags: Optional[List[str]] = None,
        target_price: Optional[float] = None,
        stop_loss: Optional[float] = None
    ) -> None:
        """Add a stock to watchlist."""
        if watchlist_name not in self.watchlists:
            raise ValueError(f"Watchlist '{watchlist_name}' not found")

        item = WatchlistItem(
            ticker=ticker,
            added_at=datetime.now().isoformat(),
            notes=notes,
            tags=tags or [],
            target_price=target_price,
            stop_loss=stop_loss
        )
        self.watchlists[watchlist_name].items.append(item)
        self.watchlists[watchlist_name].updated_at = datetime.now().isoformat()

    def remove_from_watchlist(self, watchlist_name: str, ticker: str) -> None:
        """Remove a stock from watchlist."""
        if watchlist_name not in self.watchlists:
            return

        self.watchlists[watchlist_name].items = [
            item for item in self.watchlists[watchlist_name].items
            if item.ticker != ticker
        ]
        self.watchlists[watchlist_name].updated_at = datetime.now().isoformat()

    def get_watchlist(self, name: str) -> Optional[Watchlist]:
        """Get a watchlist by name."""
        return self.watchlists.get(name)

    def list_watchlists(self) -> List[str]:
        """List all watchlist names."""
        return list(self.watchlists.keys())

    def add_alert(
        self,
        watchlist_name: str,
        ticker: str,
        alert_type: str,
        threshold: float
    ) -> Alert:
        """Add an alert to a watchlist item."""
        if watchlist_name not in self.alerts:
            self.alerts[watchlist_name] = []

        import hashlib
        alert_id = hashlib.md5(f"{ticker}{alert_type}{threshold}".encode()).hexdigest()[:8]

        alert = Alert(
            alert_id=alert_id,
            ticker=ticker,
            alert_type=alert_type,
            threshold=threshold
        )
        self.alerts[watchlist_name].append(alert)
        return alert

    def remove_alert(self, watchlist_name: str, alert_id: str) -> None:
        """Remove an alert."""
        if watchlist_name in self.alerts:
            self.alerts[watchlist_name] = [
                a for a in self.alerts[watchlist_name] if a.alert_id != alert_id
            ]

    def get_alerts(self, watchlist_name: str) -> List[Alert]:
        """Get all alerts for a watchlist."""
        return self.alerts.get(watchlist_name, [])

    def update_price(self, ticker: str, price: float, volume: int = 0) -> None:
        """Update price for a ticker."""
        if ticker not in self.price_history:
            self.price_history[ticker] = deque(maxlen=1000)

        # Get previous price
        prev_price = None
        if self.price_history[ticker]:
            prev_price = self.price_history[ticker][-1].price

        change = price - prev_price if prev_price else 0
        change_pct = (change / prev_price * 100) if prev_price else 0

        # Calculate volume ratio (simplified)
        volume_ratio = 1.0  # Default

        update = PriceUpdate(
            ticker=ticker,
            timestamp=datetime.now(),
            price=price,
            change=change,
            change_pct=change_pct,
            volume=volume,
            volume_ratio=volume_ratio
        )
        self.price_history[ticker].append(update)

    def check_alerts(self, watchlist_name: str) -> List[Alert]:
        """Check all alerts for a watchlist and return triggered ones."""
        triggered = []

        if watchlist_name not in self.alerts:
            return triggered

        for alert in self.alerts[watchlist_name]:
            if alert.triggered:
                continue

            if alert.ticker not in self.price_history:
                continue

            history = self.price_history[alert.ticker]
            if not history:
                continue

            latest = history[-1]

            # Check alert conditions
            triggered_now = False
            if alert.alert_type == "price_above" and latest.price >= alert.threshold:
                triggered_now = True
            elif alert.alert_type == "price_below" and latest.price <= alert.threshold:
                triggered_now = True
            elif alert.alert_type == "volume_surge" and latest.volume_ratio >= alert.threshold:
                triggered_now = True

            if triggered_now:
                alert.triggered = True
                alert.triggered_at = datetime.now().isoformat()
                triggered.append(alert)

                # Notify via callbacks
                for callback in self.callbacks:
                    try:
                        callback(alert, latest)
                    except Exception as e:
                        print(f"Alert callback error: {e}")

        return triggered

    def get_price_history(self, ticker: str, limit: int = 100) -> List[PriceUpdate]:
        """Get price history for a ticker."""
        if ticker not in self.price_history:
            return []

        history = list(self.price_history[ticker])
        return history[-limit:]

    def get_latest_price(self, ticker: str) -> Optional[PriceUpdate]:
        """Get latest price for a ticker."""
        if ticker not in self.price_history or not self.price_history[ticker]:
            return None
        return self.price_history[ticker][-1]

    def get_watchlist_summary(self, watchlist_name: str) -> pd.DataFrame:
        """Get summary of all stocks in a watchlist."""
        if watchlist_name not in self.watchlists:
            return pd.DataFrame()

        items = self.watchlists[watchlist_name].items
        if not items:
            return pd.DataFrame()

        rows = []
        for item in items:
            latest = self.get_latest_price(item.ticker)
            rows.append({
                "ticker": item.ticker,
                "price": latest.price if latest else None,
                "change": latest.change if latest else None,
                "change_pct": latest.change_pct if latest else None,
                "target_price": item.target_price,
                "stop_loss": item.stop_loss,
                "notes": item.notes,
                "tags": ",".join(item.tags),
            })

        return pd.DataFrame(rows)

    def register_callback(self, callback: Callable[[Alert, PriceUpdate], None]) -> None:
        """Register a callback for alert notifications."""
        self.callbacks.append(callback)

    def start_monitoring(self) -> None:
        """Start background monitoring."""
        self._running = True

        def monitor_loop():
            while self._running:
                for watchlist_name in self.watchlists.keys():
                    try:
                        self.check_alerts(watchlist_name)
                    except Exception as e:
                        print(f"Monitor error for {watchlist_name}: {e}")
                time.sleep(self.check_interval)

        self._monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
        self._monitor_thread.start()

    def stop_monitoring(self) -> None:
        """Stop background monitoring."""
        self._running = False
        if self._monitor_thread:
            self._monitor_thread.join(timeout=2.0)

    def to_json(self) -> str:
        """Export watchlists to JSON."""
        data = {
            "exported_at": datetime.now().isoformat(),
            "watchlists": {}
        }

        for name, wl in self.watchlists.items():
            data["watchlists"][name] = {
                "name": wl.name,
                "description": wl.description,
                "items": [
                    {
                        "ticker": item.ticker,
                        "added_at": item.added_at,
                        "notes": item.notes,
                        "tags": item.tags,
                        "target_price": item.target_price,
                        "stop_loss": item.stop_loss,
                    }
                    for item in wl.items
                ],
                "alerts": [
                    {
                        "alert_id": a.alert_id,
                        "ticker": a.ticker,
                        "alert_type": a.alert_type,
                        "threshold": a.threshold,
                        "triggered": a.triggered,
                    }
                    for a in self.alerts.get(name, [])
                ]
            }

        return json.dumps(data, indent=2)

    def from_json(self, json_str: str) -> None:
        """Import watchlists from JSON."""
        data = json.loads(json_str)

        self.watchlists.clear()
        self.alerts.clear()

        for name, wl_data in data.get("watchlists", {}).items():
            items = [
                WatchlistItem(
                    ticker=i["ticker"],
                    added_at=i["added_at"],
                    notes=i.get("notes", ""),
                    tags=i.get("tags", []),
                    target_price=i.get("target_price"),
                    stop_loss=i.get("stop_loss"),
                )
                for i in wl_data.get("items", [])
            ]

            wl = Watchlist(
                name=wl_data["name"],
                description=wl_data.get("description", ""),
                items=items
            )
            self.watchlists[name] = wl

            # Load alerts
            self.alerts[name] = [
                Alert(
                    alert_id=a["alert_id"],
                    ticker=a["ticker"],
                    alert_type=a["alert_type"],
                    threshold=a["threshold"],
                    triggered=a.get("triggered", False),
                )
                for a in wl_data.get("alerts", [])
            ]


class AlertNotifier:
    """Send alert notifications via various channels."""

    def __init__(self):
        self.handlers = []

    def add_handler(self, handler: Callable[[Alert, PriceUpdate], None]) -> None:
        """Add a notification handler."""
        self.handlers.append(handler)

    def send(self, alert: Alert, price_update: PriceUpdate) -> None:
        """Send alert to all handlers."""
        for handler in self.handlers:
            try:
                handler(alert, price_update)
            except Exception as e:
                print(f"Notification handler error: {e}")

    def console_handler(self, alert: Alert, price_update: PriceUpdate) -> None:
        """Console notification handler."""
        print(f"\n{'='*50}")
        print(f"🔔 ALERT TRIGGERED: {alert.alert_type}")
        print(f"   Ticker: {alert.ticker}")
        print(f"   Price: {price_update.price:.2f}")
        print(f"   Threshold: {alert.threshold}")
        print(f"   Time: {price_update.timestamp}")
        print(f"{'='*50}\n")

    def file_handler(self, filepath: str) -> Callable:
        """File notification handler factory."""
        def handler(alert: Alert, price_update: PriceUpdate) -> None:
            with open(filepath, "a") as f:
                f.write(f"{price_update.timestamp},{alert.ticker},{alert.alert_type},{price_update.price},{alert.threshold}\n")
        return handler


def demo_watchlist():
    """Demo watchlist monitoring."""
    monitor = WatchlistMonitor(check_interval=60)

    # Create watchlist
    wl = monitor.create_watchlist("tech_stocks", "Technology stocks to watch")
    monitor.add_to_watchlist("tech_stocks", "AAPL", notes="Waiting for breakout", target_price=200.0)
    monitor.add_to_watchlist("tech_stocks", "MSFT", notes="Cloud growth", target_price=400.0)
    monitor.add_to_watchlist("tech_stocks", "NVDA", notes="AI leader", target_price=1000.0)

    # Add alerts
    monitor.add_alert("tech_stocks", "AAPL", "price_above", 200.0)
    monitor.add_alert("tech_stocks", "NVDA", "price_below", 800.0)

    # Register notifier
    notifier = AlertNotifier()
    notifier.add_handler(notifier.console_handler)
    monitor.register_callback(notifier.send)

    # Simulate price updates
    print("=== Simulating price updates ===")
    monitor.update_price("AAPL", 195.0, volume=1000000)
    monitor.update_price("AAPL", 201.0, volume=1500000)
    monitor.update_price("MSFT", 390.0, volume=800000)
    monitor.update_price("NVDA", 1050.0, volume=2000000)
    monitor.update_price("NVDA", 790.0, volume=3000000)

    # Check alerts
    triggered = monitor.check_alerts("tech_stocks")
    print(f"\n{len(triggered)} alerts triggered")

    # Get summary
    print("\n=== Watchlist Summary ===")
    summary = monitor.get_watchlist_summary("tech_stocks")
    print(summary)


if __name__ == "__main__":
    demo_watchlist()
