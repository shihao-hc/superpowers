"""
Lightweight wrapper for SHAP explanations on MVP model.
This module is kept separate to allow swapping with a more advanced explainer later.
"""
from __future__ import annotations

import pandas as pd
import shap


def compute_shap_values(model, X) -> dict:
    if model is None:
        return {}
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X)
    return {"explainer": explainer, "shap_values": shap_values}
