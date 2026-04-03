"""
News sentiment analyzer for MVP. Provides a lightweight sentiment scoring
mechanism over article titles and snippets. In MVP we keep it simple and fast.
For production, replace with a robust NLP pipeline (FinBERT, LLM-based)
or a paid news sentiment data feed.
"""
from __future__ import annotations

import pandas as pd
import numpy as np
from typing import List


class NewsSentimentAnalyzer:
    def __init__(self):
        # Simple lexicon
        self.positive = {"good", "great", "positive", "beat", "growth", "surge", "rise", "up", "optimistic"}
        self.negative = {"bad", "poor", "negative", "miss", "drop", "decline", "bear", "uncertain", "risk"}

    def analyze_news(self, articles: List[dict]) -> pd.DataFrame:
        """Compute a naive sentiment score for each article and aggregate per (date, ticker).
        articles: list of dict with keys: date, ticker, title, text (optional)
        Returns a DataFrame with columns: date, ticker, sentiment
        """
        if not articles:
            return pd.DataFrame(columns=["date", "ticker", "sentiment"])
        df = pd.DataFrame(articles)
        df['date'] = pd.to_datetime(df['date']).dt.normalize()
        df['text'] = df.get('title', '')
        # naive sentiment score per article
        df['sentiment'] = df['text'].apply(self._score_text)
        # aggregate per date/ticker
        agg = df.groupby(['date', 'ticker'])['sentiment'].mean().reset_index()
        agg = agg.rename(columns={'sentiment': 'sentiment'})
        return agg

    def _score_text(self, text: str) -> float:
        if text is None:
            return 0.0
        s = 0.0
        words = set(text.lower().split())
        for w in words:
            if w in self.positive:
                s += 1.0
            if w in self.negative:
                s -= 1.0
        return s
