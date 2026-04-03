"""
Trend-following model for stock selection.

This model identifies stocks with strong momentum trends
using technical indicators and price patterns.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime

import pandas as pd
import numpy as np
from loguru import logger

try:
    from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import TimeSeriesSplit
    from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

from .base import BaseModel, ModelConfig, ModelType, Prediction, PredictionSignal, ModelPerformance


class TrendModel(BaseModel):
    """
    Trend-following model using gradient boosting.
    
    This model learns to identify stocks in strong uptrends
    using features like moving average crossovers, RSI, MACD, etc.
    """
    
    def __init__(self, config: Optional[ModelConfig] = None):
        if config is None:
            config = ModelConfig(
                name="trend_model",
                model_type=ModelType.TREND,
                description="Gradient boosting trend-following model",
                features=[
                    "returns_5d", "returns_20d", "returns_60d",
                    "sma_20_slope", "sma_50_slope",
                    "macd_histogram", "adx", "plus_di", "minus_di",
                    "golden_cross", "volume_ratio"
                ],
                hyperparameters={
                    "n_estimators": 100,
                    "max_depth": 5,
                    "learning_rate": 0.1,
                    "random_state": 42
                }
            )
        super().__init__(config)
        self.scaler = StandardScaler() if HAS_SKLEARN else None
    
    def train(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Train the trend model.
        
        Args:
            X: Feature matrix
            y: Target labels (1 for uptrend, 0 for downtrend)
        """
        if not HAS_SKLEARN:
            raise ImportError("scikit-learn is required for training")
        
        # Filter to configured features
        features = [f for f in self.config.features if f in X.columns]
        X_train = X[features].fillna(0)
        
        # Scale features
        X_scaled = self.scaler.fit_transform(X_train)
        
        # Initialize and train model
        self._model = GradientBoostingClassifier(
            **self.config.hyperparameters
        )
        
        # Time series cross-validation
        tscv = TimeSeriesSplit(n_splits=5)
        cv_scores = []
        
        for train_idx, val_idx in tscv.split(X_scaled):
            X_cv_train, X_cv_val = X_scaled[train_idx], X_scaled[val_idx]
            y_cv_train, y_cv_val = y.iloc[train_idx], y.iloc[val_idx]
            
            self._model.fit(X_cv_train, y_cv_train)
            score = self._model.score(X_cv_val, y_cv_val)
            cv_scores.append(score)
        
        # Final training on all data
        self._model.fit(X_scaled, y)
        self._is_trained = True
        
        return {
            "cv_scores": cv_scores,
            "mean_cv_score": np.mean(cv_scores),
            "std_cv_score": np.std(cv_scores),
            "feature_importance": self.get_feature_importance()
        }
    
    def predict(
        self,
        X: pd.DataFrame
    ) -> List[Prediction]:
        """Make trend predictions."""
        if not self._is_trained:
            raise ValueError("Model not trained")
        
        features = [f for f in self.config.features if f in X.columns]
        X_pred = X[features].fillna(0)
        X_scaled = self.scaler.transform(X_pred)
        
        predictions = []
        probabilities = self._model.predict_proba(X_scaled)
        
        for idx, (proba, row) in enumerate(zip(probabilities, X.itertuples())):
            # Calculate confidence and signal
            confidence = max(proba)
            
            if confidence > 0.7:
                if proba[1] > proba[0]:  # Uptrend
                    signal = PredictionSignal.STRONG_BUY
                else:
                    signal = PredictionSignal.STRONG_SELL
            elif confidence > 0.55:
                if proba[1] > proba[0]:
                    signal = PredictionSignal.BUY
                else:
                    signal = PredictionSignal.SELL
            else:
                signal = PredictionSignal.HOLD
            
            # Estimate predicted return
            pred_return = (proba[1] - proba[0]) * 0.1  # Rough estimate
            
            predictions.append(Prediction(
                symbol=getattr(row, 'symbol', f"stock_{idx}"),
                timestamp=getattr(row, 'timestamp', datetime.now()),
                signal=signal,
                confidence=float(confidence),
                predicted_return=float(pred_return),
                model_name=self.name,
                features_used=features,
                metadata={
                    "probabilities": proba.tolist(),
                    "model_type": self.model_type.value
                }
            ))
        
        return predictions
    
    def predict_proba(
        self,
        X: pd.DataFrame
    ) -> np.ndarray:
        """Predict class probabilities."""
        if not self._is_trained:
            raise ValueError("Model not trained")
        
        features = [f for f in self.config.features if f in X.columns]
        X_pred = X[features].fillna(0)
        X_scaled = self.scaler.transform(X_pred)
        
        return self._model.predict_proba(X_scaled)
    
    def evaluate(
        self,
        X: pd.DataFrame,
        y: pd.Series
    ) -> ModelPerformance:
        """Evaluate model performance."""
        predictions = self.predict(X)
        y_pred = np.array([1 if p.signal in [PredictionSignal.BUY, PredictionSignal.STRONG_BUY] 
                          else 0 for p in predictions])
        
        return ModelPerformance(
            model_name=self.name,
            accuracy=accuracy_score(y, y_pred),
            precision=precision_score(y, y_pred, zero_division=0),
            recall=recall_score(y, y_pred, zero_division=0),
            f1_score=f1_score(y, y_pred, zero_division=0),
            period_start=datetime.now(),
            period_end=datetime.now()
        )
    
    def get_feature_importance(self) -> Dict[str, float]:
        """Get feature importance scores."""
        if not self._is_trained or not hasattr(self._model, 'feature_importances_'):
            return {}
        
        features = [f for f in self.config.features]
        importances = self._model.feature_importances_
        
        return dict(zip(features, importances))