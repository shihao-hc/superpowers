"""
Base feature definitions and interfaces.

This module defines the abstract interfaces for feature generation
and factor computation.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Tuple
from enum import Enum
from datetime import datetime

import pandas as pd
import numpy as np
from pydantic import BaseModel, Field


class FeatureCategory(Enum):
    """Feature categories."""
    PRICE = "price"
    VOLUME = "volume"
    VOLATILITY = "volatility"
    MOMENTUM = "momentum"
    TREND = "trend"
    MEAN_REVERSION = "mean_reversion"
    PATTERN = "pattern"
    FUNDAMENTAL = "fundamental"
    SENTIMENT = "sentiment"
    MACRO = "macro"
    CUSTOM = "custom"


class FactorType(Enum):
    """Factor types."""
    ALPHA = "alpha"
    BETA = "beta"
    MOMENTUM = "momentum"
    VALUE = "value"
    QUALITY = "quality"
    SIZE = "size"
    VOLATILITY = "volatility"
    LIQUIDITY = "liquidity"
    GROWTH = "growth"
    TECHNICAL = "technical"


class FeatureConfig(BaseModel):
    """Feature configuration."""
    name: str
    category: FeatureCategory
    description: str
    window: Optional[int] = None
    parameters: Dict[str, Any] = Field(default_factory=dict)
    enabled: bool = True
    version: str = "1.0.0"


class FactorConfig(BaseModel):
    """Factor configuration."""
    name: str
    factor_type: FactorType
    features: List[str]
    description: str
    weight: float = 1.0
    enabled: bool = True


class FeatureResult(BaseModel):
    """Feature computation result."""
    symbol: str
    timestamp: datetime
    features: Dict[str, float]
    metadata: Dict[str, Any] = Field(default_factory=dict)


class BaseFeature(ABC):
    """
    Abstract base class for feature computation.
    
    All feature implementations must inherit from this class
    and implement the compute method.
    """
    
    def __init__(self, config: FeatureConfig):
        self.config = config
        self.name = config.name
        self.category = config.category
    
    @abstractmethod
    def compute(
        self,
        df: pd.DataFrame,
        **kwargs
    ) -> pd.Series:
        """
        Compute the feature.
        
        Args:
            df: DataFrame with OHLCV data
            **kwargs: Additional parameters
            
        Returns:
            Series with computed feature values
        """
        pass
    
    def validate_input(self, df: pd.DataFrame) -> bool:
        """Validate input DataFrame."""
        required_columns = ['open', 'high', 'low', 'close', 'volume']
        return all(col in df.columns for col in required_columns)
    
    def get_config(self) -> FeatureConfig:
        """Get feature configuration."""
        return self.config


class BaseFactor(ABC):
    """
    Abstract base class for factor computation.
    
    Factors combine multiple features to create trading signals.
    """
    
    def __init__(self, config: FactorConfig):
        self.config = config
        self.name = config.name
        self.factor_type = config.factor_type
    
    @abstractmethod
    def compute(
        self,
        features: Dict[str, pd.Series],
        **kwargs
    ) -> pd.Series:
        """
        Compute the factor from features.
        
        Args:
            features: Dictionary of feature series
            **kwargs: Additional parameters
            
        Returns:
            Series with computed factor values
        """
        pass
    
    def get_config(self) -> FactorConfig:
        """Get factor configuration."""
        return self.config