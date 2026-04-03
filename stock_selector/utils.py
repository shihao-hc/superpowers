"""Utility helpers for MVP patching and quick experiments."""
from __future__ import annotations

import pandas as pd


def ensure_date_index(df: pd.DataFrame, date_col: str = 'date') -> pd.DataFrame:
    if date_col in df.columns:
        df[date_col] = pd.to_datetime(df[date_col]).dt.normalize()
    return df
