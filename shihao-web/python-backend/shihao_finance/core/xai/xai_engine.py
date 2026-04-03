"""
Explainable AI (XAI) module.

Provides SHAP and LIME explanations for model predictions
to make trading decisions transparent and interpretable.
"""

from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime

import numpy as np
import pandas as pd
from pydantic import BaseModel, Field
from loguru import logger

try:
    import shap
    HAS_SHAP = True
except ImportError:
    HAS_SHAP = False
    logger.warning("SHAP not available")

try:
    import lime
    import lime.lime_tabular
    HAS_LIME = True
except ImportError:
    HAS_LIME = False
    logger.warning("LIME not available")


class FeatureContribution(BaseModel):
    """Feature contribution to prediction."""
    feature_name: str
    value: float
    contribution: float
    direction: str  # "positive" or "negative"
    importance_rank: int


class Explanation(BaseModel):
    """Model explanation result."""
    symbol: str
    prediction: float
    prediction_class: str
    feature_contributions: List[FeatureContribution]
    top_positive_features: List[str]
    top_negative_features: List[str]
    confidence: float
    method: str  # "shap" or "lime"
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class GlobalImportance(BaseModel):
    """Global feature importance."""
    feature_name: str
    importance: float
    rank: int
    category: Optional[str] = None


class XAIEngine:
    """
    Explainable AI engine.
    
    Provides local and global explanations for model predictions
    using SHAP and LIME methods.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.explainer = None
        self.model = None
        self.feature_names: List[str] = []
        self.background_data: Optional[pd.DataFrame] = None
    
    def initialize(
        self,
        model: Any,
        X_train: pd.DataFrame,
        feature_names: Optional[List[str]] = None
    ) -> bool:
        """
        Initialize XAI engine with a trained model.
        
        Args:
            model: Trained model (sklearn compatible)
            X_train: Training data for background
            feature_names: List of feature names
        """
        try:
            self.model = model
            self.feature_names = feature_names or list(X_train.columns)
            self.background_data = X_train.sample(
                min(100, len(X_train)), 
                random_state=42
            )
            
            # Initialize SHAP explainer
            if HAS_SHAP:
                try:
                    # Use appropriate explainer based on model type
                    if hasattr(model, 'predict_proba'):
                        self.explainer = shap.KernelExplainer(
                            model.predict_proba,
                            self.background_data
                        )
                    else:
                        self.explainer = shap.KernelExplainer(
                            model.predict,
                            self.background_data
                        )
                    logger.info("SHAP explainer initialized")
                except Exception as e:
                    logger.warning(f"Failed to initialize SHAP: {e}")
            
            return True
            
        except Exception as e:
            logger.error(f"Error initializing XAI engine: {e}")
            return False
    
    def explain_prediction(
        self,
        X: pd.DataFrame,
        symbol: str,
        prediction: float,
        prediction_class: str,
        method: str = "shap"
    ) -> Explanation:
        """
        Explain a single prediction.
        
        Args:
            X: Feature values for the instance
            symbol: Stock symbol
            prediction: Model prediction value
            prediction_class: Predicted class label
            method: Explanation method ("shap" or "lime")
            
        Returns:
            Explanation object
        """
        if method == "shap" and HAS_SHAP and self.explainer:
            return self._explain_with_shap(X, symbol, prediction, prediction_class)
        elif method == "lime" and HAS_LIME:
            return self._explain_with_lime(X, symbol, prediction, prediction_class)
        else:
            return self._explain_with_fallback(X, symbol, prediction, prediction_class)
    
    def _explain_with_shap(
        self,
        X: pd.DataFrame,
        symbol: str,
        prediction: float,
        prediction_class: str
    ) -> Explanation:
        """Generate SHAP explanation."""
        try:
            # Calculate SHAP values
            shap_values = self.explainer.shap_values(X)
            
            # Handle multi-class output
            if isinstance(shap_values, list):
                # Use positive class SHAP values
                shap_vals = shap_values[1] if len(shap_values) > 1 else shap_values[0]
            else:
                shap_vals = shap_values
            
            # Flatten if needed
            if len(shap_vals.shape) > 1:
                shap_vals = shap_vals.flatten()
            
            # Create feature contributions
            contributions = []
            for i, (feature, value, shap_val) in enumerate(
                zip(self.feature_names, X.iloc[0].values, shap_vals)
            ):
                direction = "positive" if shap_val > 0 else "negative"
                contributions.append(FeatureContribution(
                    feature_name=feature,
                    value=float(value),
                    contribution=float(shap_val),
                    direction=direction,
                    importance_rank=0  # Will be set below
                ))
            
            # Sort by absolute contribution
            contributions.sort(key=lambda x: abs(x.contribution), reverse=True)
            for i, c in enumerate(contributions):
                c.importance_rank = i + 1
            
            # Get top features
            top_positive = [c.feature_name for c in contributions[:5] 
                          if c.direction == "positive"]
            top_negative = [c.feature_name for c in contributions[:5] 
                          if c.direction == "negative"]
            
            # Calculate confidence
            confidence = min(1.0, abs(np.sum(shap_vals)) * 2)
            
            return Explanation(
                symbol=symbol,
                prediction=prediction,
                prediction_class=prediction_class,
                feature_contributions=contributions,
                top_positive_features=top_positive[:3],
                top_negative_features=top_negative[:3],
                confidence=confidence,
                method="shap",
                metadata={
                    "base_value": float(self.explainer.expected_value) if hasattr(self.explainer, 'expected_value') else 0
                }
            )
            
        except Exception as e:
            logger.error(f"SHAP explanation failed: {e}")
            return self._explain_with_fallback(X, symbol, prediction, prediction_class)
    
    def _explain_with_lime(
        self,
        X: pd.DataFrame,
        symbol: str,
        prediction: float,
        prediction_class: str
    ) -> Explanation:
        """Generate LIME explanation."""
        try:
            # Create LIME explainer
            lime_explainer = lime.lime_tabular.LimeTabularExplainer(
                training_data=self.background_data.values,
                feature_names=self.feature_names,
                mode='classification'
            )
            
            # Generate explanation
            exp = lime_explainer.explain_instance(
                X.iloc[0].values,
                self.model.predict_proba,
                num_features=min(10, len(self.feature_names))
            )
            
            # Convert to FeatureContributions
            contributions = []
            for i, (feature, weight) in enumerate(exp.as_list()):
                contributions.append(FeatureContribution(
                    feature_name=feature,
                    value=float(X[feature].iloc[0]) if feature in X.columns else 0,
                    contribution=float(weight),
                    direction="positive" if weight > 0 else "negative",
                    importance_rank=i + 1
                ))
            
            # Get top features
            top_positive = [c.feature_name for c in contributions 
                          if c.direction == "positive"][:3]
            top_negative = [c.feature_name for c in contributions 
                          if c.direction == "negative"][:3]
            
            return Explanation(
                symbol=symbol,
                prediction=prediction,
                prediction_class=prediction_class,
                feature_contributions=contributions,
                top_positive_features=top_positive,
                top_negative_features=top_negative,
                confidence=exp.score,
                method="lime",
                metadata={"local_pred": exp.local_pred}
            )
            
        except Exception as e:
            logger.error(f"LIME explanation failed: {e}")
            return self._explain_with_fallback(X, symbol, prediction, prediction_class)
    
    def _explain_with_fallback(
        self,
        X: pd.DataFrame,
        symbol: str,
        prediction: float,
        prediction_class: str
    ) -> Explanation:
        """Fallback explanation using feature importance."""
        # Use simple feature importance if available
        if hasattr(self.model, 'feature_importances_'):
            importances = self.model.feature_importances_
        else:
            # Use uniform importance
            importances = np.ones(len(self.feature_names)) / len(self.feature_names)
        
        contributions = []
        for i, (feature, value) in enumerate(zip(self.feature_names, X.iloc[0].values)):
            # Simple heuristic: contribution = importance * z-score of value
            mean_val = self.background_data[feature].mean() if feature in self.background_data.columns else 0
            std_val = self.background_data[feature].std() if feature in self.background_data.columns else 1
            z_score = (value - mean_val) / (std_val + 1e-8)
            
            contribution = importances[i] * z_score
            
            contributions.append(FeatureContribution(
                feature_name=feature,
                value=float(value),
                contribution=float(contribution),
                direction="positive" if contribution > 0 else "negative",
                importance_rank=i + 1
            ))
        
        # Sort by absolute contribution
        contributions.sort(key=lambda x: abs(x.contribution), reverse=True)
        for i, c in enumerate(contributions):
            c.importance_rank = i + 1
        
        top_positive = [c.feature_name for c in contributions[:3] 
                       if c.direction == "positive"]
        top_negative = [c.feature_name for c in contributions[:3] 
                       if c.direction == "negative"]
        
        return Explanation(
            symbol=symbol,
            prediction=prediction,
            prediction_class=prediction_class,
            feature_contributions=contributions[:10],
            top_positive_features=top_positive,
            top_negative_features=top_negative,
            confidence=0.5,
            method="fallback"
        )
    
    def get_global_importance(
        self,
        X: pd.DataFrame,
        y: pd.Series
    ) -> List[GlobalImportance]:
        """
        Calculate global feature importance.
        
        Args:
            X: Feature matrix
            y: Target values
            
        Returns:
            List of global feature importances
        """
        importances = []
        
        # Try model-based importance first
        if hasattr(self.model, 'feature_importances_'):
            for i, feature in enumerate(self.feature_names):
                importances.append(GlobalImportance(
                    feature_name=feature,
                    importance=float(self.model.feature_importances_[i]),
                    rank=0
                ))
        
        # Calculate correlation-based importance as fallback
        else:
            for feature in self.feature_names:
                if feature in X.columns:
                    corr = abs(X[feature].corr(y))
                    importances.append(GlobalImportance(
                        feature_name=feature,
                        importance=float(corr) if not np.isnan(corr) else 0,
                        rank=0
                    ))
        
        # Sort and rank
        importances.sort(key=lambda x: x.importance, reverse=True)
        for i, imp in enumerate(importances):
            imp.rank = i + 1
        
        return importances
    
    def generate_report(
        self,
        explanations: List[Explanation],
        global_importance: Optional[List[GlobalImportance]] = None
    ) -> Dict[str, Any]:
        """
        Generate a comprehensive explanation report.
        
        Args:
            explanations: List of individual explanations
            global_importance: Optional global feature importance
            
        Returns:
            Report dictionary
        """
        # Aggregate feature contributions
        feature_aggregate = {}
        for exp in explanations:
            for contrib in exp.feature_contributions:
                if contrib.feature_name not in feature_aggregate:
                    feature_aggregate[contrib.feature_name] = {
                        "total_contribution": 0,
                        "count": 0,
                        "avg_contribution": 0
                    }
                feature_aggregate[contrib.feature_name]["total_contribution"] += contrib.contribution
                feature_aggregate[contrib.feature_name]["count"] += 1
        
        # Calculate averages
        for feature, data in feature_aggregate.items():
            data["avg_contribution"] = data["total_contribution"] / data["count"]
        
        # Sort by average absolute contribution
        sorted_features = sorted(
            feature_aggregate.items(),
            key=lambda x: abs(x[1]["avg_contribution"]),
            reverse=True
        )
        
        return {
            "timestamp": datetime.now().isoformat(),
            "num_explanations": len(explanations),
            "top_drivers": [f[0] for f in sorted_features[:10]],
            "feature_aggregate": dict(sorted_features[:20]),
            "global_importance": [
                {"feature": g.feature_name, "importance": g.importance}
                for g in global_importance[:10]
            ] if global_importance else [],
            "average_confidence": np.mean([e.confidence for e in explanations]),
            "method_distribution": {
                method: len([e for e in explanations if e.method == method])
                for method in set(e.method for e in explanations)
            }
        }