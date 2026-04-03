"""
Simplified MVP model using XGBoost to predict next-day stock returns.
Features are engineered from price momentum and sentiment signals.
This module also provides a SHAP-based explanations workflow for MVP.
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from xgboost import XGBRegressor
import shap


class MVPModel:
    def __init__(self):
        self.model = None
        self.feature_columns = []
        self.explainer = None

    @staticmethod
    def _prepare_features(price_df: pd.DataFrame, sentiment_df: pd.DataFrame) -> pd.DataFrame:
        # price_df: long format with date, ticker, close
        df = price_df.copy()
        df = df.sort_values(["ticker", "date"]).reset_index(drop=True)
        # simple features per ticker-date: 5-day momentum, 1-day return, sentiment (merged later)
        price_pivot = price_df.pivot(index='date', columns='ticker', values='close')
        momentum = price_pivot.pct_change(periods=5).stack().reset_index(name='mom5').rename(columns={'level_0':'date','level_1':'ticker'})
        oneday_ret = price_pivot.pct_change(periods=1).stack().reset_index(name='ret1').rename(columns={'level_0':'date','level_1':'ticker'})
        # Merge
        features = momentum.merge(oneday_ret, on=['date','ticker'], how='outer')
        # Merge sentiment
        if sentiment_df is not None and not sentiment_df.empty:
            sentiment_pivot = sentiment_df.pivot(index='date', columns='ticker', values='sentiment')
            sentiment_flat = sentiment_pivot.stack().reset_index(name='sentiment').rename(columns={'level_0':'date','level_1':'ticker'})
            features = features.merge(sentiment_flat, on=['date','ticker'], how='left')
        features = features.fillna(0)
        # Finalize
        features['date'] = pd.to_datetime(features['date'])
        return features

    def train(self, price_df: pd.DataFrame, sentiment_df: pd.DataFrame, lookback_period_days: int = 365) -> None:
        # Build training dataset: for each (date, ticker), predict next day return
        features = self._prepare_features(price_df, sentiment_df)
        # Build target: next day return
        price_pivot = price_df.pivot(index='date', columns='ticker', values='close')
        next_ret = price_pivot.pct_change(periods=1).shift(-1).stack().reset_index(name='target')
        data = features.merge(next_ret, on=['date','ticker'], how='inner')
        if data.empty:
            self.model = None
            return
        X = data[['mom5','ret1','sentiment']]
        y = data['target']
        self.model = XGBRegressor(n_estimators=200, max_depth=6, learning_rate=0.1, subsample=0.8, colsample_bytree=0.8, objective='reg:squarederror', n_jobs=4, random_state=42)
        self.model.fit(X, y)
        self.feature_columns = list(X.columns)
        self.explainer = shap.TreeExplainer(self.model)

    def predict(self, price_df: pd.DataFrame, sentiment_df: pd.DataFrame) -> pd.DataFrame:
        if self.model is None:
            return pd.DataFrame(columns=['date','ticker','score'])
        features = self._prepare_features(price_df, sentiment_df)
        X = features[[ 'mom5','ret1','sentiment' ]]
        preds = self.model.predict(X)
        out = features[['date','ticker']].copy()
        out['score'] = preds
        return out

    def explain(self, price_df: pd.DataFrame, sentiment_df: pd.DataFrame, top_k: int = 5) -> pd.DataFrame:
        if self.explainer is None or self.model is None:
            return pd.DataFrame(columns=['date','ticker','feature','shap'])
        features = self._prepare_features(price_df, sentiment_df)
        X = features[[ 'mom5','ret1','sentiment' ]]
        shap_values = self.explainer.shap_values(X)
        # Create a simple explanation dataframe for top_k stocks on last date present
        last = features['date'].max()
        last_rows = features[features['date'] == last].copy()
        if last_rows.empty:
            return pd.DataFrame(columns=['date','ticker','feature','shap'])
        # Build per-ticker explanations by aggregating absolute shap values per feature
        expl_list = []
        for idx, row in last_rows.iterrows():
            # approximate: map features to shap values by index
            sh = dict(zip(self.feature_columns, shap_values[idx])) if hasattr(shap_values, '__len__') else {}
            ticker = row['ticker']
            date = row['date']
            for feat, val in sh.items():
                expl_list.append({'date': date, 'ticker': ticker, 'feature': feat, 'shap': float(val)})
        expl_df = pd.DataFrame(expl_list)
        return expl_df.sort_values(['date','ticker','shap'], ascending=[False, True, False]).head(top_k * 3)
