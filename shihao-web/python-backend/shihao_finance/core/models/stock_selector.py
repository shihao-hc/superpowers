"""
StockSelectorEngine - Main stock selection pipeline.

This module implements the complete stock selection pipeline that
combines data fetching, feature engineering, and ML prediction.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from enum import Enum

import pandas as pd
import numpy as np
from loguru import logger

from ..data.data_manager import DataManager, DataFrequency
from ..features.feature_engine import FeatureEngine
from ..models.base import Prediction, PredictionSignal, ModelType
from ..models.trend_model import TrendModel
from ..models.ensemble_model import EnsembleModel


class SelectionCriteria(Enum):
    """Stock selection criteria."""
    STRONG_BUY = "strong_buy"
    BUY = "buy"
    ALL_POSITIVE = "all_positive"
    TOP_N = "top_n"


class StockSelection(BaseModel):
    """Stock selection result."""
    symbol: str
    name: Optional[str] = None
    signal: PredictionSignal
    confidence: float
    predicted_return: Optional[float] = None
    features: Dict[str, float] = {}
    metadata: Dict[str, Any] = {}


from pydantic import BaseModel, Field


class SelectionResult(BaseModel):
    """Complete selection result."""
    timestamp: datetime
    total_analyzed: int
    selected_stocks: List[StockSelection]
    model_version: str
    market_regime: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class StockSelectorEngine:
    """
    Main stock selection engine.
    
    Orchestrates the complete pipeline:
    1. Fetch stock data
    2. Compute features
    3. Generate predictions
    4. Filter and rank stocks
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        
        # Initialize components
        self.data_manager = DataManager(self.config.get("data", {}))
        self.feature_engine = FeatureEngine(self.config.get("features", {}))
        
        # Initialize models
        self.trend_model = TrendModel()
        self.ensemble_model = EnsembleModel()
        
        self.models = {
            "trend": self.trend_model,
            "ensemble": self.ensemble_model
        }
        
        # Selection parameters
        self.selection_params = {
            "min_confidence": 0.6,
            "min_predicted_return": 0.02,
            "top_n": 20,
            "criteria": SelectionCriteria.BUY
        }
    
    async def initialize(self) -> bool:
        """Initialize the engine."""
        try:
            await self.data_manager.initialize()
            logger.info("StockSelectorEngine initialized successfully")
            return True
        except Exception as e:
            logger.error(f"Failed to initialize StockSelectorEngine: {e}")
            return False
    
    async def select_stocks(
        self,
        symbols: Optional[List[str]] = None,
        exchange: Optional[str] = None,
        model_name: str = "ensemble",
        criteria: Optional[SelectionCriteria] = None,
        limit: Optional[int] = None
    ) -> SelectionResult:
        """
        Select stocks based on ML predictions.
        
        Args:
            symbols: Specific symbols to analyze
            exchange: Exchange to scan (CN, US, HK)
            model_name: Model to use for prediction
            criteria: Selection criteria
            limit: Maximum number of stocks to return
        """
        try:
            # Get stock list
            if symbols is None:
                stocks = await self.data_manager.get_stock_list(exchange=exchange)
                symbols = [s.symbol for s in stocks[:100]]  # Limit for demo
            
            logger.info(f"Analyzing {len(symbols)} stocks...")
            
            # Get model
            model = self.models.get(model_name)
            if model is None or not model.is_trained:
                logger.warning(f"Model {model_name} not trained, using simple heuristics")
                return await self._select_with_heuristics(symbols, limit)
            
            # Process each stock
            selections = []
            for symbol in symbols:
                try:
                    selection = await self._analyze_stock(symbol, model)
                    if selection:
                        selections.append(selection)
                except Exception as e:
                    logger.error(f"Error analyzing {symbol}: {e}")
                    continue
            
            # Filter and rank
            filtered = self._filter_selections(
                selections,
                criteria or self.selection_params["criteria"]
            )
            
            # Sort by confidence and predicted return
            filtered.sort(
                key=lambda x: (x.confidence, x.predicted_return or 0),
                reverse=True
            )
            
            # Limit results
            if limit:
                filtered = filtered[:limit]
            
            return SelectionResult(
                timestamp=datetime.now(),
                total_analyzed=len(symbols),
                selected_stocks=filtered,
                model_version=model.config.version if hasattr(model, 'config') else "1.0.0",
                market_regime=self.ensemble_model.get_current_regime().value 
                    if hasattr(self.ensemble_model, 'get_current_regime') else None,
                metadata={
                    "criteria": criteria.value if criteria else "default",
                    "model_used": model_name
                }
            )
            
        except Exception as e:
            logger.error(f"Error in stock selection: {e}")
            return SelectionResult(
                timestamp=datetime.now(),
                total_analyzed=0,
                selected_stocks=[],
                model_version="error",
                metadata={"error": str(e)}
            )
    
    async def _analyze_stock(
        self,
        symbol: str,
        model
    ) -> Optional[StockSelection]:
        """Analyze a single stock."""
        # Get historical data
        df = await self.data_manager.get_ohlcv(
            symbol=symbol,
            start_date=datetime.now() - timedelta(days=365),
            end_date=datetime.now(),
            frequency=DataFrequency.DAILY
        )
        
        if df.empty or len(df) < 60:  # Need minimum data
            return None
        
        # Compute features
        feature_result = await self.feature_engine.compute_features(df, symbol)
        
        if not feature_result.features:
            return None
        
        # Prepare feature DataFrame
        features_df = pd.DataFrame([feature_result.features])
        features_df['symbol'] = symbol
        features_df['timestamp'] = feature_result.timestamp
        
        # Make prediction
        predictions = model.predict(features_df)
        
        if not predictions:
            return None
        
        prediction = predictions[0]
        
        return StockSelection(
            symbol=symbol,
            signal=prediction.signal,
            confidence=prediction.confidence,
            predicted_return=prediction.predicted_return,
            features=feature_result.features,
            metadata=prediction.metadata
        )
    
    def _filter_selections(
        self,
        selections: List[StockSelection],
        criteria: SelectionCriteria
    ) -> List[StockSelection]:
        """Filter selections based on criteria."""
        filtered = []
        
        for selection in selections:
            if criteria == SelectionCriteria.STRONG_BUY:
                if selection.signal == PredictionSignal.STRONG_BUY:
                    if selection.confidence >= self.selection_params["min_confidence"]:
                        filtered.append(selection)
                        
            elif criteria == SelectionCriteria.BUY:
                if selection.signal in [PredictionSignal.BUY, PredictionSignal.STRONG_BUY]:
                    if selection.confidence >= self.selection_params["min_confidence"]:
                        filtered.append(selection)
                        
            elif criteria == SelectionCriteria.ALL_POSITIVE:
                if selection.signal.value > 0:
                    filtered.append(selection)
                    
            elif criteria == SelectionCriteria.TOP_N:
                filtered.append(selection)
        
        return filtered
    
    async def _select_with_heuristics(
        self,
        symbols: List[str],
        limit: Optional[int] = None
    ) -> SelectionResult:
        """Fallback selection using simple heuristics."""
        selections = []
        
        for symbol in symbols[:50]:  # Limit for demo
            try:
                df = await self.data_manager.get_ohlcv(
                    symbol=symbol,
                    start_date=datetime.now() - timedelta(days=60),
                    end_date=datetime.now(),
                    frequency=DataFrequency.DAILY
                )
                
                if df.empty or len(df) < 20:
                    continue
                
                # Simple heuristic: positive momentum + volume
                returns_5d = (df['close'].iloc[-1] / df['close'].iloc[-6] - 1)
                returns_20d = (df['close'].iloc[-1] / df['close'].iloc[-21] - 1)
                volume_ratio = df['volume'].iloc[-1] / df['volume'].tail(20).mean()
                
                score = (returns_5d * 0.4 + returns_20d * 0.4 + 
                        (volume_ratio - 1) * 0.2)
                
                if score > 0.02:  # 2% threshold
                    signal = PredictionSignal.BUY if score < 0.05 else PredictionSignal.STRONG_BUY
                    confidence = min(0.9, 0.5 + abs(score) * 5)
                    
                    selections.append(StockSelection(
                        symbol=symbol,
                        signal=signal,
                        confidence=confidence,
                        predicted_return=score,
                        features={
                            "returns_5d": float(returns_5d),
                            "returns_20d": float(returns_20d),
                            "volume_ratio": float(volume_ratio)
                        }
                    ))
                    
            except Exception as e:
                continue
        
        # Sort and limit
        selections.sort(key=lambda x: x.confidence, reverse=True)
        if limit:
            selections = selections[:limit]
        
        return SelectionResult(
            timestamp=datetime.now(),
            total_analyzed=len(symbols),
            selected_stocks=selections,
            model_version="heuristic",
            metadata={"method": "heuristic_fallback"}
        )
    
    async def train_models(
        self,
        symbols: List[str],
        lookback_days: int = 365
    ) -> Dict[str, Any]:
        """Train models on historical data."""
        logger.info(f"Training models on {len(symbols)} symbols...")
        
        # Collect training data
        all_features = []
        all_labels = []
        
        for symbol in symbols:
            try:
                df = await self.data_manager.get_ohlcv(
                    symbol=symbol,
                    start_date=datetime.now() - timedelta(days=lookback_days),
                    end_date=datetime.now(),
                    frequency=DataFrequency.DAILY
                )
                
                if df.empty or len(df) < 100:
                    continue
                
                # Compute features
                feature_result = await self.feature_engine.compute_features(df, symbol)
                
                if feature_result.features:
                    # Create labels (1 if 5-day return > 2%, else 0)
                    df['returns_5d'] = df['close'].pct_change(5).shift(-5)
                    df['label'] = (df['returns_5d'] > 0.02).astype(int)
                    
                    # Align features and labels
                    valid_idx = df.index[~df['label'].isna()]
                    
                    for idx in valid_idx[-100:]:  # Last 100 valid points
                        features_at_idx = await self.feature_engine.compute_features(
                            df.loc[:idx], symbol
                        )
                        if features_at_idx.features:
                            all_features.append(features_at_idx.features)
                            all_labels.append(df.loc[idx, 'label'])
                            
            except Exception as e:
                logger.error(f"Error collecting data for {symbol}: {e}")
                continue
        
        if not all_features:
            return {"error": "No training data collected"}
        
        # Train models
        X = pd.DataFrame(all_features)
        y = pd.Series(all_labels)
        
        results = {}
        
        # Train trend model
        trend_results = self.trend_model.train(X, y)
        results["trend"] = trend_results
        
        # Train ensemble model
        ensemble_results = self.ensemble_model.train(X, y)
        results["ensemble"] = ensemble_results
        
        logger.info("Model training completed")
        return results