"""
Factor Database & Model Versioning.
- SQLite-based factor storage
- Model versioning with MLflow integration
- Factor effectiveness tracking
"""
from __future__ import annotations

import pandas as pd
import numpy as np
import sqlite3
import json
import os
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
import hashlib


@dataclass
class Factor:
    """Factor definition."""
    id: str
    name: str
    category: str  # momentum, value, quality, etc.
    formula: str
    description: str
    created_at: str
    updated_at: str
    is_active: bool = True
    metadata: Dict = None

    def __post_init__(self):
        if self.metadata is None:
            self.metadata = {}


class FactorDatabase:
    """SQLite-based factor database."""

    def __init__(self, db_path: str = "./data/factor_database.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        """Initialize database schema."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS factors (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE,
                category TEXT,
                formula TEXT,
                description TEXT,
                created_at TEXT,
                updated_at TEXT,
                is_active INTEGER DEFAULT 1,
                metadata TEXT
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS factor_values (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                factor_id TEXT,
                date TEXT,
                ticker TEXT,
                value REAL,
                FOREIGN KEY (factor_id) REFERENCES factors(id)
            )
        """)

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS factor_performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                factor_id TEXT,
                start_date TEXT,
                end_date TEXT,
                ic_mean REAL,
                ic_std REAL,
                rank_ic_mean REAL,
                sharpe REAL,
                FOREIGN KEY (factor_id) REFERENCES factors(id)
            )
        """)

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_factor_values ON factor_values(factor_id, date, ticker)
        """)

        conn.commit()
        conn.close()

    def add_factor(self, factor: Factor) -> None:
        """Add a new factor."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT OR REPLACE INTO factors 
            (id, name, category, formula, description, created_at, updated_at, is_active, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            factor.id, factor.name, factor.category, factor.formula,
            factor.description, factor.created_at, factor.updated_at,
            1 if factor.is_active else 0, json.dumps(factor.metadata)
        ))

        conn.commit()
        conn.close()

    def get_factor(self, name: str) -> Optional[Factor]:
        """Get factor by name."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("SELECT * FROM factors WHERE name = ?", (name,))
        row = cursor.fetchone()
        conn.close()

        if row:
            return Factor(
                id=row[0], name=row[1], category=row[2], formula=row[3],
                description=row[4], created_at=row[5], updated_at=row[6],
                is_active=bool(row[7]), metadata=json.loads(row[8])
            )
        return None

    def list_factors(self, category: str = None, active_only: bool = True) -> List[Factor]:
        """List factors."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        query = "SELECT * FROM factors"
        params = []
        if active_only:
            query += " WHERE is_active = 1"
            if category:
                query += " AND category = ?"
                params.append(category)
        elif category:
            query += " WHERE category = ?"
            params.append(category)

        cursor.execute(query, params)
        rows = cursor.fetchall()
        conn.close()

        return [
            Factor(
                id=r[0], name=r[1], category=r[2], formula=r[3],
                description=r[4], created_at=r[5], updated_at=r[6],
                is_active=bool(r[7]), metadata=json.loads(r[8])
            )
            for r in rows
        ]

    def record_performance(
        self,
        factor_id: str,
        start_date: str,
        end_date: str,
        ic_mean: float,
        ic_std: float,
        rank_ic_mean: float,
        sharpe: float
    ) -> None:
        """Record factor performance metrics."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO factor_performance 
            (factor_id, start_date, end_date, ic_mean, ic_std, rank_ic_mean, sharpe)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (factor_id, start_date, end_date, ic_mean, ic_std, rank_ic_mean, sharpe))

        conn.commit()
        conn.close()

    def get_performance_history(self, factor_id: str) -> List[Dict]:
        """Get factor performance history."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM factor_performance 
            WHERE factor_id = ? 
            ORDER BY end_date DESC
        """, (factor_id,))

        rows = cursor.fetchall()
        conn.close()

        return [
            {
                'factor_id': r[1], 'start_date': r[2], 'end_date': r[3],
                'ic_mean': r[4], 'ic_std': r[5], 'rank_ic_mean': r[6], 'sharpe': r[7]
            }
            for r in rows
        ]


class ModelVersionManager:
    """Model version management."""

    def __init__(self, storage_path: str = "./data/models"):
        self.storage_path = storage_path
        os.makedirs(storage_path, exist_ok=True)
        self.db_path = os.path.join(storage_path, "model_versions.db")
        self._init_db()

    def _init_db(self) -> None:
        """Initialize model version database."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            CREATE TABLE IF NOT EXISTS model_versions (
                version_id TEXT PRIMARY KEY,
                model_name TEXT,
                version_num INTEGER,
                created_at TEXT,
                training_data_hash TEXT,
                hyperparameters TEXT,
                metrics TEXT,
                model_file_path TEXT,
                is_production INTEGER DEFAULT 0,
                metadata TEXT
            )
        """)

        conn.commit()
        conn.close()

    def register_model(
        self,
        model_name: str,
        version_num: int,
        training_data_hash: str,
        hyperparameters: Dict,
        metrics: Dict,
        model_file_path: str = None
    ) -> str:
        """Register a new model version."""
        version_id = f"{model_name}_v{version_num}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            INSERT INTO model_versions 
            (version_id, model_name, version_num, created_at, training_data_hash, 
             hyperparameters, metrics, model_file_path, is_production, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            version_id, model_name, version_num, datetime.now().isoformat(),
            training_data_hash, json.dumps(hyperparameters), json.dumps(metrics),
            model_file_path, 0, '{}'
        ))

        conn.commit()
        conn.close()
        return version_id

    def set_production(self, version_id: str) -> None:
        """Set a model version as production."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # Reset all to non-production
        cursor.execute("UPDATE model_versions SET is_production = 0")

        # Set new production version
        cursor.execute("UPDATE model_versions SET is_production = 1 WHERE version_id = ?", (version_id,))

        conn.commit()
        conn.close()

    def get_production_model(self, model_name: str) -> Optional[Dict]:
        """Get current production model."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM model_versions 
            WHERE model_name = ? AND is_production = 1
            ORDER BY version_num DESC
            LIMIT 1
        """, (model_name,))

        row = cursor.fetchone()
        conn.close()

        if row:
            return {
                'version_id': row[0],
                'model_name': row[1],
                'version_num': row[2],
                'created_at': row[3],
                'training_data_hash': row[4],
                'hyperparameters': json.loads(row[5]),
                'metrics': json.loads(row[6]),
                'model_file_path': row[7],
                'is_production': bool(row[8])
            }
        return None

    def list_versions(self, model_name: str = None) -> List[Dict]:
        """List model versions."""
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        if model_name:
            cursor.execute("""
                SELECT * FROM model_versions 
                WHERE model_name = ?
                ORDER BY version_num DESC
            """, (model_name,))
        else:
            cursor.execute("SELECT * FROM model_versions ORDER BY created_at DESC")

        rows = cursor.fetchall()
        conn.close()

        return [
            {
                'version_id': r[0], 'model_name': r[1], 'version_num': r[2],
                'created_at': r[3], 'training_data_hash': r[4],
                'hyperparameters': json.loads(r[5]), 'metrics': json.loads(r[6]),
                'model_file_path': r[7], 'is_production': bool(r[8])
            }
            for r in rows
        ]


class OnlineLearningPipeline:
    """Online learning pipeline for model updates."""

    def __init__(
        self,
        model_manager: ModelVersionManager,
        factor_db: FactorDatabase,
        improvement_threshold: float = 0.05
    ):
        self.model_manager = model_manager
        self.factor_db = factor_db
        self.improvement_threshold = improvement_threshold

    def check_and_update(
        self,
        model_name: str,
        new_metrics: Dict,
        validation_window_days: int = 30
    ) -> Dict:
        """
        Check if new model is better and should be deployed.
        
        Returns: {should_deploy: bool, reason: str, old_metrics: dict, new_metrics: dict}
        """
        # Get current production model
        current = self.model_manager.get_production_model(model_name)

        if not current:
            # No production model, deploy new one
            return {
                'should_deploy': True,
                'reason': 'No production model exists',
                'old_metrics': {},
                'new_metrics': new_metrics
            }

        old_metrics = current['metrics']

        # Compare key metrics (e.g., sharpe, ic)
        old_sharpe = old_metrics.get('sharpe', 0)
        new_sharpe = new_metrics.get('sharpe', 0)

        improvement = (new_sharpe - old_sharpe) / abs(old_sharpe) if old_sharpe != 0 else 0

        if improvement >= self.improvement_threshold:
            return {
                'should_deploy': True,
                'reason': f'New model improves sharpe by {improvement*100:.1f}%',
                'old_metrics': old_metrics,
                'new_metrics': new_metrics
            }
        else:
            return {
                'should_deploy': False,
                'reason': f'Improvement {improvement*100:.1f}% below threshold {self.improvement_threshold*100}%',
                'old_metrics': old_metrics,
                'new_metrics': new_metrics
            }

    def deploy_if_better(
        self,
        model_name: str,
        version_num: int,
        training_data_hash: str,
        hyperparameters: Dict,
        new_metrics: Dict
    ) -> str:
        """Deploy new model if it's better."""
        check = self.check_and_update(model_name, new_metrics)

        if check['should_deploy']:
            version_id = self.model_manager.register_model(
                model_name, version_num, training_data_hash,
                hyperparameters, new_metrics
            )
            self.model_manager.set_production(version_id)
            return version_id

        return None


def demo_factor_database():
    """Demo factor database."""
    db = FactorDatabase(":memory:")

    # Add factors
    factor = Factor(
        id="factor_001",
        name="ROE",
        category="profitability",
        formula="NetIncome / ShareholdersEquity",
        description="Return on Equity",
        created_at=datetime.now().isoformat(),
        updated_at=datetime.now().isoformat()
    )
    db.add_factor(factor)

    # List factors
    factors = db.list_factors()
    print(f"Total factors: {len(factors)}")
    for f in factors:
        print(f"  - {f.name} ({f.category})")

    # Record performance
    db.record_performance("factor_001", "2025-01-01", "2025-03-01", 0.05, 0.1, 0.04, 0.8)

    # Get performance history
    history = db.get_performance_history("factor_001")
    print(f"\nPerformance history: {len(history)} records")


def demo_model_versioning():
    """Demo model versioning."""
    mgr = ModelVersionManager(":memory:")

    # Register models
    v1 = mgr.register_model("stock_picker", 1, "hash1", {"n_estimators": 100}, {"sharpe": 1.2})
    v2 = mgr.register_model("stock_picker", 2, "hash2", {"n_estimators": 200}, {"sharpe": 1.5})

    print(f"Registered: v1={v1}, v2={v2}")

    # Set production
    mgr.set_production(v2)

    # Get production
    prod = mgr.get_production_model("stock_picker")
    print(f"Production: {prod['version_id'] if prod else 'None'}")


if __name__ == "__main__":
    demo_factor_database()
    demo_model_versioning()
