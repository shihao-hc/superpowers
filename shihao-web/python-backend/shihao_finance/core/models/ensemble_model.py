"""
Ensemble model combining trend, reversal, and value strategies.

This module implements the AI decision maker that allocates weights
to different strategy models based on market conditions.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from enum import Enum

import pandas as pd
import numpy as np
from loguru import logger

try:
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

from .base import BaseModel, ModelConfig, ModelType, Prediction, PredictionSignal, ModelPerformance
from .trend_model import TrendModel


class MarketRegime(Enum):
    """Market regime types."""
    BULLISH = "bullish"
    BEARISH = "bearish"
    VOLATILE = "volatile"
    SIDEWAYS = "sideways"


class EnsembleModel(BaseModel):
    """
    Ensemble model combining multiple strategy models.
    
    The ensemble uses a meta-learner to combine predictions
    from trend, reversal, and value models based on market conditions.
    """
    
    def __init__(self, config: Optional[ModelConfig] = None):
        if config is None:
            config = ModelConfig(
                name="ensemble_model",
                model_type=ModelType.ENSEMBLE,
                description="Ensemble of trend, reversal, and value models",
                features=[],
                hyperparameters={
                    "meta_learner_type": "logistic",
                    "use_market_regime": True
                }
            )
        super().__init__(config)
        
        # Initialize sub-models
        self.trend_model = TrendModel()
        # self.reversal_model = ReversalModel()  # TODO: Implement
        # self.value_model = ValueModel()  # TODO: Implement
        
        self.sub_models = {
            "trend": self.trend_model,
            # "reversal": self.reversal_model,
            # "value": self.value_model
        }
        
        # Meta-learner for weight allocation
        self.meta_learner = None
        self.scaler = StandardScaler() if HAS_SKLEARN else None
        
        # Market regime detector
        self.current_regime = MarketRegime.SIDEWAYS
    
    def train(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Train ensemble model.
        
        Args:
            X: Feature matrix
            y: Target labels
        """
        if not HAS_SKLEARN:
            raise ImportError("scikit-learn is required for training")
        
        results = {}
        
        # Train sub-models
        for name, model in self.sub_models.items():
            try:
                model_results = model.train(X, y, **kwargs)
                results[name] = model_results
            except Exception as e:
                logger.error(f"Error training {name} model: {e}")
        
        # Train meta-learner on sub-model predictions
        meta_features = self._generate_meta_features(X)
        
        self.meta_learner = LogisticRegression(
            max_iter=1000,
            random_state=42
        )
        
        X_meta_scaled = self.scaler.fit_transform(meta_features)
        self.meta_learner.fit(X_meta_scaled, y)
        self._is_trained = True
        
        results["meta_learner"] = {
            "coefficients": self.meta_learner.coef_.tolist(),
            "intercept": self.meta_learner.intercept_.tolist()
        }
        
        return results
    
    def predict(
        self,
        X: pd.DataFrame
    ) -> List[Prediction]:
        """Make ensemble predictions."""
        if not self._is_trained:
            raise ValueError("Model not trained")
        
        # Get predictions from sub-models
        sub_predictions = {}
        for name, model in self.sub_models.items():
            if model.is_trained:
                sub_predictions[name] = model.predict_proba(X)
        
        # Generate meta features
        meta_features = self._generate_meta_features(X)
        X_meta_scaled = self.scaler.transform(meta_features)
        
        # Meta-learner predictions
        probabilities = self.meta_learner.predict_proba(X_meta_scaled)
        
        predictions = []
        for idx, (proba, row) in enumerate(zip(probabilities, X.itertuples())):
            confidence = max(proba)
            
            # Determine signal
            if proba[1] > 0.7:
                signal = PredictionSignal.STRONG_BUY
            elif proba[1] > 0.55:
                signal = PredictionSignal.BUY
            elif proba[1] < 0.3:
                signal = PredictionSignal.STRONG_SELL
            elif proba[1] < 0.45:
                signal = PredictionSignal.SELL
            else:
                signal = PredictionSignal.HOLD
            
            # Calculate predicted return
            pred_return = (proba[1] - 0.5) * 0.2
            
            predictions.append(Prediction(
                symbol=getattr(row, 'symbol', f"stock_{idx}"),
                timestamp=getattr(row, 'timestamp', datetime.now()),
                signal=signal,
                confidence=float(confidence),
                predicted_return=float(pred_return),
                model_name=self.name,
                features_used=[],
                metadata={
                    "probabilities": proba.tolist(),
                    "sub_model_predictions": {
                        k: v[idx].tolist() if idx < len(v) else []
                        for k, v in sub_predictions.items()
                    },
                    "market_regime": self.current_regime.value
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
        
        meta_features = self._generate_meta_features(X)
        X_meta_scaled = self.scaler.transform(meta_features)
        
        return self.meta_learner.predict_proba(X_meta_scaled)
    
    def evaluate(
        self,
        X: pd.DataFrame,
        y: pd.Series
    ) -> ModelPerformance:
        """Evaluate ensemble performance."""
        from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score
        
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
        """Get meta-learner feature importance."""
        if not self._is_trained or self.meta_learner is None:
            return {}
        
        importance = {}
        for name, coef in zip(self.sub_models.keys(), self.meta_learner.coef_[0]):
            importance[name] = float(coef)
        
        return importance
    
    def _generate_meta_features(self, X: pd.DataFrame) -> pd.DataFrame:
        """Generate meta-features from sub-model predictions."""
        meta_features = []
        
        for name, model in self.sub_models.items():
            if model.is_trained:
                proba = model.predict_proba(X)
                meta_features.append(proba[:, 1])  # Probability of positive class
            else:
                meta_features.append(np.zeros(len(X)))
        
        # Add market regime features
        regime_features = self._detect_market_regime(X)
        meta_features.extend(regime_features)
        
        return pd.DataFrame(np.column_stack(meta_features))
    
    def _detect_market_regime(self, X: pd.DataFrame) -> List[np.ndarray]:
        """Detect current market regime."""
        features = []
        
        # Market trend (using index if available)
        if 'returns_20d' in X.columns:
            avg_returns = X['returns_20d'].mean()
            features.append(np.array([avg_returns]))
        else:
            features.append(np.array([0]))
        
        # Volatility
        if 'volatility_20d' in X.columns:
            avg_vol = X['volatility_20d'].mean()
            features.append(np.array([avg_vol]))
        else:
            features.append(np.array([0]))
        
        # Trend strength
        if 'adx' in X.columns:
            avg_adx = X['adx'].mean()
            features.append(np.array([avg_adx]))
        else:
            features.append(np.array([0]))
        
        # Update regime
        if len(features) >= 3:
            returns, vol, adx = features[0][0], features[1][0], features[2][0]
            
            if returns > 0.05 and vol < 0.25:
                self.current_regime = MarketRegime.BULLISH
            elif returns < -0.05 and vol > 0.3:
                self.current_regime = MarketRegime.BEARISH
            elif vol > 0.35:
                self.current_regime = MarketRegime.VOLATILE
            else:
                self.current_regime = MarketRegime.SIDEWAYS
        
        return features
    
    def get_current_regime(self) -> MarketRegime:
        """Get current market regime."""
        return self.current_regime