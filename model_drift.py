"""
Model Drift Detection: Monitor model performance and detect drift.
- IC/IR tracking
- PSI-based data drift detection
- Auto-retraining pipeline
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable, Tuple
from dataclasses import dataclass, field
from enum import Enum
import json
import threading


class DriftStatus(Enum):
    """Drift detection status."""
    STABLE = "stable"
    WARNING = "warning"
    DRIFTED = "drifted"
    RETRAINING = "retraining"


@dataclass
class PerformanceMetrics:
    """Model performance metrics."""
    timestamp: str
    ic: float  # Information Coefficient
    ir: float  # Information Ratio
    sharpe: float
    precision: float
    recall: float
    f1: float
    auc: float


@dataclass
class DriftReport:
    """Drift detection report."""
    timestamp: str
    drift_status: DriftStatus
    performance_metrics: List[PerformanceMetrics] = field(default_factory=list)
    ic_change_pct: float = 0.0
    ir_change_pct: float = 0.0
    psi_scores: Dict[str, float] = field(default_factory=dict)
    recommendations: List[str] = field(default_factory=list)


@dataclass
class FeatureDistribution:
    """Feature distribution for PSI calculation."""
    feature_name: str
    bins: List[float]
    baseline_distribution: np.ndarray
    current_distribution: np.ndarray
    psi: float = 0.0


class ModelDriftDetector:
    """
    Model drift detection and auto-retraining trigger.
    """

    def __init__(
        self,
        ic_threshold: float = 0.02,
        ir_threshold: float = 0.3,
        psi_threshold: float = 0.2,
        lookback_days: int = 30,
        min_samples: int = 100,
    ):
        self.ic_threshold = ic_threshold
        self.ir_threshold = ir_threshold
        self.psi_threshold = psi_threshold
        self.lookback_days = lookback_days
        self.min_samples = min_samples
        
        self.performance_history: List[PerformanceMetrics] = []
        self.feature_distributions: Dict[str, FeatureDistribution] = {}
        
        self._lock = threading.Lock()
        
        self.on_drift_callbacks: List[Callable] = []
        self.on_retrain_callbacks: List[Callable] = []

    def register_drift_callback(self, callback: Callable[[DriftReport], None]) -> None:
        """Register drift detection callback."""
        self.on_drift_callbacks.append(callback)

    def register_retrain_callback(self, callback: Callable[[], None]) -> None:
        """Register auto-retrain callback."""
        self.on_retrain_callbacks.append(callback)

    def record_prediction(
        self,
        predictions: np.ndarray,
        actuals: np.ndarray,
        features: pd.DataFrame = None,
        timestamp: str = None
    ) -> None:
        """Record prediction results for metric calculation."""
        timestamp = timestamp or datetime.now().isoformat()
        
        if len(predictions) < 10 or len(actuals) < 10:
            return
        
        ic = self._calculate_ic(predictions, actuals)
        
        if features is not None and len(self.feature_distributions) > 0:
            self._update_feature_distributions(features)
        
        with self._lock:
            self.performance_history.append(PerformanceMetrics(
                timestamp=timestamp,
                ic=ic,
                ir=ic / np.std(predictions) if np.std(predictions) > 0 else 0,
                sharpe=0.0,
                precision=0.0,
                recall=0.0,
                f1=0.0,
                auc=0.0
            ))
            
            if len(self.performance_history) > self.lookback_days * 100:
                self.performance_history = self.performance_history[-self.lookback_days * 100:]

    def _calculate_ic(self, predictions: np.ndarray, actuals: np.ndarray) -> float:
        """Calculate Information Coefficient (correlation)."""
        if len(predictions) < 2:
            return 0.0
        return np.corrcoef(predictions, actuals)[0, 1] if np.std(predictions) > 0 and np.std(actuals) > 0 else 0.0

    def _calculate_ir(self, predictions: np.ndarray, actuals: np.ndarray) -> float:
        """Calculate Information Ratio."""
        ic_series = []
        for i in range(1, len(predictions)):
            ic = self._calculate_ic(predictions[:i], actuals[:i])
            ic_series.append(ic)
        
        if len(ic_series) < 2:
            return 0.0
        
        return np.mean(ic_series) / np.std(ic_series) if np.std(ic_series) > 0 else 0.0

    def _update_feature_distributions(self, features: pd.DataFrame) -> None:
        """Update feature distributions for PSI calculation."""
        for col in features.columns:
            if col not in self.feature_distributions:
                self._init_feature_distribution(col, features[col])
            else:
                self._update_psi(col, features[col])

    def _init_feature_distribution(self, feature_name: str, data: pd.Series) -> None:
        """Initialize feature distribution as baseline."""
        bins = np.linspace(data.min(), data.max(), 11)
        hist, _ = np.histogram(data, bins=bins)
        dist = hist / len(data)
        
        self.feature_distributions[feature_name] = FeatureDistribution(
            feature_name=feature_name,
            bins=bins.tolist(),
            baseline_distribution=dist,
            current_distribution=dist.copy()
        )

    def _update_psi(self, feature_name: str, data: pd.Series) -> None:
        """Update PSI for a feature."""
        if feature_name not in self.feature_distributions:
            return
        
        fd = self.feature_distributions[feature_name]
        bins = np.array(fd.bins)
        
        hist, _ = np.histogram(data, bins=bins)
        current_dist = hist / len(data)
        
        fd.current_distribution = current_dist
        fd.psi = self._calculate_psi(fd.baseline_distribution, current_dist)

    def _calculate_psi(self, baseline: np.ndarray, current: np.ndarray) -> float:
        """Calculate Population Stability Index."""
        psi = 0.0
        for i in range(len(baseline)):
            b = baseline[i] + 1e-10
            c = current[i] + 1e-10
            psi += (c - b) * np.log(c / b)
        return psi

    def check_drift(self) -> DriftReport:
        """Check for model drift."""
        with self._lock:
            if len(self.performance_history) < self.min_samples:
                return DriftReport(
                    timestamp=datetime.now().isoformat(),
                    drift_status=DriftStatus.STABLE,
                    recommendations=["Insufficient data for drift detection"]
                )
        
        recent = self.performance_history[-self.min_samples:]
        older = self.performance_history[:-self.min_samples] if len(self.performance_history) > self.min_samples else self.performance_history
        
        recent_ic = np.mean([p.ic for p in recent])
        older_ic = np.mean([p.ic for p in older]) if older else recent_ic
        
        ic_change = (recent_ic - older_ic) / abs(older_ic) if older_ic != 0 else 0
        
        ir_recent = np.mean([p.ir for p in recent])
        ir_older = np.mean([p.ir for p in older]) if older else ir_recent
        ir_change = (ir_recent - ir_older) / abs(ir_older) if ir_older != 0 else 0
        
        psi_scores = {
            f: fd.psi for f, fd in self.feature_distributions.items()
            if fd.psi > 0
        }
        
        drifted_features = [f for f, psi in psi_scores.items() if psi > self.psi_threshold]
        
        status = DriftStatus.STABLE
        recommendations = []
        
        if recent_ic < self.ic_threshold or abs(ic_change) > 0.3:
            status = DriftStatus.WARNING
            recommendations.append(f"IC drop detected: {recent_ic:.3f} (change: {ic_change:.1%})")
        
        if ir_recent < self.ir_threshold or status == DriftStatus.WARNING:
            status = DriftStatus.DRIFTED
            recommendations.append(f"IR below threshold: {ir_recent:.3f}")
        
        if drifted_features:
            recommendations.append(f"Feature drift detected: {drifted_features}")
            if status != DriftStatus.DRIFTED:
                status = DriftStatus.WARNING
        
        if status == DriftStatus.DRIFTED:
            recommendations.append("Trigger auto-retraining recommended")
            for callback in self.on_drift_callbacks:
                try:
                    callback(DriftReport(
                        timestamp=datetime.now().isoformat(),
                        drift_status=status,
                        performance_metrics=self.performance_history[-30:],
                        ic_change_pct=ic_change,
                        ir_change_pct=ir_change,
                        psi_scores=psi_scores,
                        recommendations=recommendations
                    ))
                except Exception:
                    pass
        
        return DriftReport(
            timestamp=datetime.now().isoformat(),
            drift_status=status,
            performance_metrics=self.performance_history[-30:],
            ic_change_pct=ic_change,
            ir_change_pct=ir_change,
            psi_scores=psi_scores,
            recommendations=recommendations
        )

    def trigger_retrain(self) -> None:
        """Trigger auto-retraining."""
        for callback in self.on_retrain_callbacks:
            try:
                callback()
            except Exception:
                pass

    def get_performance_trend(self, days: int = 7) -> Dict:
        """Get performance trend over recent days."""
        with self._lock:
            recent = self.performance_history[-days:] if len(self.performance_history) >= days else self.performance_history
            
            return {
                "ic_mean": np.mean([p.ic for p in recent]),
                "ic_std": np.std([p.ic for p in recent]),
                "ir_mean": np.mean([p.ir for p in recent]),
                "sample_count": len(recent)
            }

    def export_report(self, filepath: str) -> None:
        """Export drift detection report."""
        report = self.check_drift()
        data = {
            "timestamp": report.timestamp,
            "drift_status": report.drift_status.value,
            "ic_change_pct": report.ic_change_pct,
            "ir_change_pct": report.ir_change_pct,
            "psi_scores": report.psi_scores,
            "recommendations": report.recommendations,
            "performance_history": [
                {
                    "timestamp": p.timestamp,
                    "ic": p.ic,
                    "ir": p.ir
                }
                for p in report.performance_metrics
            ]
        }
        with open(filepath, 'w') as f:
            json.dump(data, f, indent=2)


def demo_drift_detection():
    """Demo model drift detection."""
    detector = ModelDriftDetector(
        ic_threshold=0.05,
        psi_threshold=0.15
    )
    
    np.random.seed(42)
    
    for i in range(100):
        predictions = np.random.randn(50)
        actuals = predictions * 0.8 + np.random.randn(50) * 0.2
        detector.record_prediction(predictions, actuals)
    
    report = detector.check_drift()
    
    print(f"Drift Status: {report.drift_status.value}")
    print(f"IC Change: {report.ic_change_pct:.1%}")
    print(f"PSI Scores: {report.psi_scores}")
    print(f"Recommendations: {report.recommendations}")


if __name__ == "__main__":
    demo_drift_detection()
