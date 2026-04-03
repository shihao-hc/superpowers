"""
Base model interfaces and types for ML models.

This module defines the abstract interfaces for all ML models
used in the stock selection system.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Tuple
from enum import Enum
from datetime import datetime

import pandas as pd
import numpy as np
from pydantic import BaseModel, Field
import joblib


class ModelType(Enum):
    """Model types."""
    TREND = "trend"
    REVERSAL = "reversal"
    VALUE = "value"
    ENSEMBLE = "ensemble"
    DECISION_MAKER = "decision_maker"


class PredictionSignal(Enum):
    """Prediction signal types."""
    STRONG_BUY = 2
    BUY = 1
    HOLD = 0
    SELL = -1
    STRONG_SELL = -2


class ModelConfig(BaseModel):
    """Model configuration."""
    name: str
    model_type: ModelType
    description: str
    features: List[str]
    hyperparameters: Dict[str, Any] = Field(default_factory=dict)
    version: str = "1.0.0"
    enabled: bool = True


class Prediction(BaseModel):
    """Model prediction result."""
    symbol: str
    timestamp: datetime
    signal: PredictionSignal
    confidence: float = Field(ge=0.0, le=1.0)
    predicted_return: Optional[float] = None
    model_name: str
    features_used: List[str]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ModelPerformance(BaseModel):
    """Model performance metrics."""
    model_name: str
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    sharpe_ratio: Optional[float] = None
    max_drawdown: Optional[float] = None
    win_rate: Optional[float] = None
    period_start: datetime
    period_end: datetime


class BaseModel(ABC):
    """
    Abstract base class for all ML models.
    
    All model implementations must inherit from this class
    and implement the required methods.
    """
    
    def __init__(self, config: ModelConfig):
        self.config = config
        self.name = config.name
        self.model_type = config.model_type
        self._model = None
        self._is_trained = False
    
    @abstractmethod
    def train(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Train the model.
        
        Args:
            X: Feature matrix
            y: Target labels
            **kwargs: Additional training parameters
            
        Returns:
            Training results/metrics
        """
        pass
    
    @abstractmethod
    def predict(
        self,
        X: pd.DataFrame
    ) -> List[Prediction]:
        """
        Make predictions.
        
        Args:
            X: Feature matrix
            
        Returns:
            List of predictions
        """
        pass
    
    @abstractmethod
    def predict_proba(
        self,
        X: pd.DataFrame
    ) -> np.ndarray:
        """
        Predict probabilities.
        
        Args:
            X: Feature matrix
            
        Returns:
            Probability array
        """
        pass
    
    @abstractmethod
    def evaluate(
        self,
        X: pd.DataFrame,
        y: pd.Series
    ) -> ModelPerformance:
        """
        Evaluate model performance.
        
        Args:
            X: Feature matrix
            y: True labels
            
        Returns:
            Performance metrics
        """
        pass
    
    @abstractmethod
    def get_feature_importance(self) -> Dict[str, float]:
        """
        Get feature importance scores.
        
        Returns:
            Dictionary mapping feature names to importance scores
        """
        pass
    
    def save(self, path: str) -> bool:
        """Save model to disk."""
        try:
            joblib.dump({
                'model': self._model,
                'config': self.config,
                'is_trained': self._is_trained
            }, path)
            return True
        except Exception as e:
            print(f"Error saving model: {e}")
            return False
    
    def load(self, path: str) -> bool:
        """Load model from disk."""
        try:
            data = joblib.load(path)
            self._model = data['model']
            self.config = data['config']
            self._is_trained = data['is_trained']
            return True
        except Exception as e:
            print(f"Error loading model: {e}")
            return False
    
    def get_config(self) -> ModelConfig:
        """Get model configuration."""
        return self.config
    
    @property
    def is_trained(self) -> bool:
        """Check if model is trained."""
        return self._is_trained