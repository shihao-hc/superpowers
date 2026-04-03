"""
Data Quality & Versioning Module.
- Data quality checks (missing rate, anomaly detection, freshness)
- Data versioning with snapshot IDs
- Survival bias correction dataset
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
import json
import hashlib
import uuid


@dataclass
class DataSnapshot:
    """Data snapshot record."""
    snapshot_id: str
    created_at: str
    data_type: str  # "price", "fundamental", "news"
    source: str
    start_date: str
    end_date: str
    record_count: int
    checksum: str
    metadata: Dict[str, Any]


@dataclass
class DataQualityReport:
    """Data quality report."""
    snapshot_id: str
    timestamp: str
    total_records: int
    missing_rate: float
    anomaly_count: int
    freshness_hours: float
    issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


class DataQualityChecker:
    """Data quality validation and monitoring."""

    def __init__(self, max_missing_rate: float = 0.05, max_anomaly_rate: float = 0.01):
        self.max_missing_rate = max_missing_rate
        self.max_anomaly_rate = max_anomaly_rate

    def check_price_data(self, df: pd.DataFrame) -> DataQualityReport:
        """Check price data quality."""
        issues = []
        warnings = []

        # Total records
        total_records = len(df)

        # Missing rate check
        missing_rate = df.isnull().sum().sum() / (df.shape[0] * df.shape[1])
        if missing_rate > self.max_missing_rate:
            issues.append(f"High missing rate: {missing_rate*100:.2f}%")
        elif missing_rate > 0:
            warnings.append(f"Missing rate: {missing_rate*100:.2f}%")

        # Check for price anomalies (e.g., negative prices, extreme changes)
        if 'close' in df.columns:
            neg_prices = (df['close'] <= 0).sum()
            if neg_prices > 0:
                issues.append(f"Found {neg_prices} non-positive prices")

            # Extreme price changes
            if 'pct_change' in df.columns:
                extreme = (df['pct_change'].abs() > 0.5).sum()
                if extreme > 0:
                    warnings.append(f"Found {extreme} extreme price changes (>50%)")

        # Volume check
        if 'volume' in df.columns:
            neg_volume = (df['volume'] < 0).sum()
            if neg_volume > 0:
                issues.append(f"Found {neg_volume} negative volumes")

        # Freshness check
        freshness_hours = 0.0
        if 'date' in df.columns:
            latest = pd.to_datetime(df['date']).max()
            freshness_hours = (datetime.now() - latest).total_seconds() / 3600

        return DataQualityReport(
            snapshot_id="",
            timestamp=datetime.now().isoformat(),
            total_records=total_records,
            missing_rate=missing_rate,
            anomaly_count=len(issues),
            freshness_hours=freshness_hours,
            issues=issues,
            warnings=warnings
        )

    def check_fundamental_data(self, df: pd.DataFrame) -> DataQualityReport:
        """Check fundamental data quality."""
        issues = []
        warnings = []

        total_records = len(df)

        # Required fields for fundamentals
        required_fields = ['pe_ratio', 'roe', 'revenue']
        for field in required_fields:
            if field in df.columns:
                missing = df[field].isnull().sum()
                if missing > 0:
                    warnings.append(f"Field {field}: {missing} missing values")

        # Anomaly checks for financial ratios
        if 'pe_ratio' in df.columns:
            negative_pe = (df['pe_ratio'] < 0).sum()
            if negative_pe > 0:
                warnings.append(f"Found {negative_pe} negative PE ratios")

        if 'roe' in df.columns:
            extreme_roe = (df['roe'].abs() > 1).sum()
            if extreme_roe > 0:
                warnings.append(f"Found {extreme_roe} extreme ROE values (>100%)")

        return DataQualityReport(
            snapshot_id="",
            timestamp=datetime.now().isoformat(),
            total_records=total_records,
            missing_rate=df.isnull().sum().sum() / (df.shape[0] * df.shape[1]),
            anomaly_count=len(issues),
            freshness_hours=0,
            issues=issues,
            warnings=warnings
        )


class DataVersionManager:
    """Data versioning with snapshot management."""

    def __init__(self, storage_path: str = "./data_snapshots"):
        self.storage_path = storage_path
        self.snapshots: List[DataSnapshot] = []

    def create_snapshot(
        self,
        df: pd.DataFrame,
        data_type: str,
        source: str,
        start_date: str,
        end_date: str
    ) -> DataSnapshot:
        """Create a new data snapshot."""
        # Generate snapshot ID
        timestamp = datetime.now().isoformat()
        unique_str = f"{data_type}_{source}_{timestamp}"
        snapshot_id = hashlib.md5(unique_str.encode()).hexdigest()[:12]

        # Calculate checksum
        checksum = hashlib.md5(pd.util.hash_pandas_object(df).values).hexdigest()

        snapshot = DataSnapshot(
            snapshot_id=snapshot_id,
            created_at=timestamp,
            data_type=data_type,
            source=source,
            start_date=start_date,
            end_date=end_date,
            record_count=len(df),
            checksum=checksum,
            metadata={"columns": list(df.columns)}
        )

        self.snapshots.append(snapshot)
        return snapshot

    def verify_snapshot(self, df: pd.DataFrame, snapshot: DataSnapshot) -> bool:
        """Verify data against a snapshot."""
        current_checksum = hashlib.md5(pd.util.hash_pandas_object(df).values).hexdigest()
        return current_checksum == snapshot.checksum

    def get_snapshot(self, snapshot_id: str) -> Optional[DataSnapshot]:
        """Get snapshot by ID."""
        for s in self.snapshots:
            if s.snapshot_id == snapshot_id:
                return s
        return None

    def list_snapshots(self, data_type: Optional[str] = None) -> List[DataSnapshot]:
        """List all snapshots, optionally filtered by type."""
        if data_type:
            return [s for s in self.snapshots if s.data_type == data_type]
        return self.snapshots

    def export_manifest(self, filepath: str) -> None:
        """Export snapshot manifest to JSON."""
        data = {
            "exported_at": datetime.now().isoformat(),
            "snapshots": [
                {
                    "snapshot_id": s.snapshot_id,
                    "created_at": s.created_at,
                    "data_type": s.data_type,
                    "source": s.source,
                    "start_date": s.start_date,
                    "end_date": s.end_date,
                    "record_count": s.record_count,
                    "checksum": s.checksum,
                }
                for s in self.snapshots
            ]
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)


class SurvivalBiasManager:
    """Manage survival bias correction datasets."""

    def __init__(self):
        self.delisted_stocks: pd.DataFrame = pd.DataFrame()
        self.st_stocks: pd.DataFrame = pd.DataFrame()
        self.suspended_stocks: pd.DataFrame = pd.DataFrame()

    def load_historical_data(self, data: Dict[str, pd.DataFrame]) -> None:
        """Load historical data for correction."""
        self.delisted_stocks = data.get('delisted', pd.DataFrame())
        self.st_stocks = data.get('st_stocks', pd.DataFrame())
        self.suspended_stocks = data.get('suspended', pd.DataFrame())

    def get_active_tickers(self, date: str, all_tickers: List[str]) -> List[str]:
        """Get tickers that were active on a given date."""
        active = set(all_tickers)

        # Remove delisted before date
        if not self.delisted_stocks.empty:
            delisted_before = self.delisted_stocks[
                self.delisted_stocks['delist_date'] <= date
            ]['ticker'].tolist()
            active -= set(delisted_before)

        # Remove ST stocks on date
        if not self.st_stocks.empty:
            st_on_date = self.st_stocks[
                (self.st_stocks['start_date'] <= date) &
                (self.st_stocks['end_date'] >= date)
            ]['ticker'].tolist()
            active -= set(st_on_date)

        return list(active)

    def add_delisted(self, ticker: str, delist_date: str, reason: str = "") -> None:
        """Add a delisted stock to the dataset."""
        new_row = pd.DataFrame([{
            'ticker': ticker,
            'delist_date': delist_date,
            'reason': reason
        }])
        self.delisted_stocks = pd.concat([self.delisted_stocks, new_row], ignore_index=True)

    def add_st_stock(self, ticker: str, start_date: str, end_date: str) -> None:
        """Add an ST stock period."""
        new_row = pd.DataFrame([{
            'ticker': ticker,
            'start_date': start_date,
            'end_date': end_date
        }])
        self.st_stocks = pd.concat([self.st_stocks, new_row], ignore_index=True)

    def export_history(self, filepath: str) -> None:
        """Export survival bias data to JSON."""
        data = {
            "delisted": self.delisted_stocks.to_dict('records'),
            "st_stocks": self.st_stocks.to_dict('records'),
            "suspended": self.suspended_stocks.to_dict('records')
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)


class UnifiedDataModel:
    """Unified data model for multi-source data."""

    @staticmethod
    def to_unified_bar(df: pd.DataFrame, source: str) -> pd.DataFrame:
        """Convert different source data to unified bar format."""
        column_map = {
            'yfinance': {'Date': 'timestamp', 'Close': 'close', 'Volume': 'volume'},
            'akshare': {'日期': 'timestamp', '收盘': 'close', '成交量': 'volume'},
            'custom': {'timestamp': 'timestamp', 'close': 'close', 'volume': 'volume'}
        }

        mapping = column_map.get(source, column_map['custom'])
        unified = df.rename(columns=mapping)

        unified['timestamp'] = pd.to_datetime(unified['timestamp'])
        if 'open' not in unified.columns:
            unified['open'] = unified['close']
        if 'high' not in unified.columns:
            unified['high'] = unified['close']
        if 'low' not in unified.columns:
            unified['low'] = unified['close']

        return unified[['timestamp', 'open', 'high', 'low', 'close', 'volume']]

    @staticmethod
    def to_unified_tick(df: pd.DataFrame, source: str) -> pd.DataFrame:
        column_map = {
            'yfinance': {'Datetime': 'timestamp', 'Close': 'price'},
            'custom': {'timestamp': 'timestamp', 'price': 'price'}
        }

        mapping = column_map.get(source, column_map['custom'])
        unified = df.rename(columns=mapping)

        unified['timestamp'] = pd.to_datetime(unified['timestamp'])
        return unified[['timestamp', 'price', 'volume']]


class DataPipeline:
    """
    Complete data pipeline integrating quality checks, versioning, and survival bias.
    This is the main entry point for all data operations.
    """

    def __init__(
        self,
        quality_checker: Optional[DataQualityChecker] = None,
        version_manager: Optional[DataVersionManager] = None,
        survival_manager: Optional[SurvivalBiasManager] = None
    ):
        self.quality_checker = quality_checker or DataQualityChecker()
        self.version_manager = version_manager or DataVersionManager()
        self.survival_manager = survival_manager or SurvivalBiasManager()

    def fetch_and_validate(
        self,
        tickers: List[str],
        source: str = "yfinance",
        start_date: str = None,
        end_date: str = None,
        apply_survival_bias: bool = True
    ) -> pd.DataFrame:
        """
        Fetch data with full quality checks and survival bias correction.
        
        Returns:
            DataFrame with validated data
        """
        # Fetch raw data based on source
        if source == "yfinance":
            df = self._fetch_yfinance(tickers, start_date, end_date)
        elif source == "akshare":
            df = self._fetch_akshare(tickers, start_date, end_date)
        else:
            raise ValueError(f"Unknown source: {source}")

        # Check quality
        report = self.quality_checker.check_price_data(df)
        if report.issues:
            print(f"Data quality issues: {report.issues}")
            df = self._clean_data(df)

        # Apply survival bias correction
        if apply_survival_bias and not self.survival_manager.delisted_stocks.empty:
            df = self._apply_survival_bias(df, start_date, end_date)

        # Create version snapshot
        if not df.empty:
            self.version_manager.create_snapshot(
                df, "price", source, start_date or "", end_date or ""
            )

        return df

    def _fetch_yfinance(self, tickers: List[str], start_date: str, end_date: str) -> pd.DataFrame:
        """Fetch data from yfinance."""
        try:
            import yfinance as yf
        except ImportError:
            return pd.DataFrame()

        frames = []
        for ticker in tickers:
            data = yf.download(ticker, start=start_date, end=end_date, progress=False)
            if data is not None and not data.empty:
                data = data.reset_index()
                data['ticker'] = ticker
                frames.append(data)

        if not frames:
            return pd.DataFrame()

        df = pd.concat(frames, ignore_index=True)
        return df.rename(columns={
            'Date': 'date', 'Open': 'open', 'High': 'high',
            'Low': 'low', 'Close': 'close', 'Volume': 'volume'
        })

    def _fetch_akshare(self, tickers: List[str], start_date: str, end_date: str) -> pd.DataFrame:
        """Fetch data from AKShare."""
        try:
            import akshare as ak
        except ImportError:
            return pd.DataFrame()

        frames = []
        for ticker in tickers:
            code = "".join(filter(str.isdigit, ticker))
            data = ak.stock_zh_a_hist(symbol=code, start_date=start_date.replace("-", ""),
                                       end_date=end_date.replace("-", ""), adjust="qfq")
            if data is not None and not data.empty:
                data['ticker'] = ticker
                frames.append(data)

        if not frames:
            return pd.DataFrame()

        return pd.concat(frames, ignore_index=True).rename(columns={
            '日期': 'date', '开盘': 'open', '收盘': 'close',
            '最高': 'high', '最低': 'low', '成交量': 'volume'
        })

    def _clean_data(self, df: pd.DataFrame) -> pd.DataFrame:
        """Clean data based on quality issues."""
        df = df.copy()

        # Remove negative prices
        if 'close' in df.columns:
            df.loc[df['close'] <= 0, 'close'] = np.nan

        # Remove negative volume
        if 'volume' in df.columns:
            df.loc[df['volume'] < 0, 'volume'] = 0

        # Forward fill missing values
        df = df.fillna(method='ffill').fillna(method='bfill')

        return df

    def _apply_survival_bias(
        self,
        df: pd.DataFrame,
        start_date: str,
        end_date: str
    ) -> pd.DataFrame:
        """Apply survival bias correction to data."""
        if df.empty or 'ticker' not in df.columns:
            return df

        # Get list of dates to check
        dates = sorted(df['date'].unique())
        valid_tickers = set()

        for date in dates:
            date_str = str(date)[:10]
            all_tickers = df[df['date'] == date]['ticker'].unique().tolist()
            active = self.survival_manager.get_active_tickers(date_str, all_tickers)
            valid_tickers.update(active)

        # Filter to only active tickers
        return df[df['ticker'].isin(valid_tickers)]

    def get_quality_report(self, df: pd.DataFrame) -> DataQualityReport:
        """Get quality report for current data."""
        return self.quality_checker.check_price_data(df)

    def export_pipeline_state(self, filepath: str) -> None:
        """Export complete pipeline state."""
        state = {
            "exported_at": datetime.now().isoformat(),
            "snapshots": [
                {"snapshot_id": s.snapshot_id, "data_type": s.data_type,
                 "checksum": s.checksum, "record_count": s.record_count}
                for s in self.version_manager.snapshots
            ],
            "survival_bias": {
                "delisted_count": len(self.survival_manager.delisted_stocks),
                "st_stocks_count": len(self.survival_manager.st_stocks)
            }
        }
        with open(filepath, 'w') as f:
            json.dump(state, f, indent=2)


def demo_data_quality():
    """Demo data quality checking."""
    # Create sample data with issues
    df = pd.DataFrame({
        'date': pd.date_range('2025-01-01', periods=100),
        'ticker': ['AAPL'] * 100,
        'close': [100 + i + np.random.randn() for i in range(100)],
        'volume': np.random.randint(1000000, 10000000, 100)
    })
    df.loc[10, 'close'] = -50  # Anomaly
    df.loc[20:25, 'close'] = np.nan  # Missing

    checker = DataQualityChecker()
    report = checker.check_price_data(df)

    print("=== Data Quality Report ===")
    print(f"Total Records: {report.total_records}")
    print(f"Missing Rate: {report.missing_rate*100:.2f}%")
    print(f"Anomaly Count: {report.anomaly_count}")
    print(f"Issues: {report.issues}")
    print(f"Warnings: {report.warnings}")


if __name__ == "__main__":
    demo_data_quality()
