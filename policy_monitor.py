"""
PolicyMonitor: Real-time policy and regulatory news monitoring.
- Ingests news from configurable sources
- Filters by keyword (e.g., "央行", "监管", "产业政策")
- Performs NLP event extraction and impact scoring
"""
from __future__ import annotations

import pandas as pd
import numpy as np
import re
from datetime import datetime
from typing import List, Dict, Optional
from dataclasses import dataclass


@dataclass
class PolicyEvent:
    """Structured policy event extracted from news."""
    date: datetime
    source: str
    headline: str
    keywords_matched: List[str]
    event_type: str  # e.g., "interest_rate", "regulation", "subsidy"
    impact_score: float  # -1 (negative) to 1 (positive)
    affected_sectors: List[str]
    summary: str


class PolicyMonitor:
    """Monitors policy news and extracts structured events with impact scores."""

    KEYWORD_CATEGORIES = {
        "monetary": ["央行", "利率", "降息", "加息", "宽松", "紧缩", "货币政策", "Fed", "FOMC", "基准利率"],
        "regulation": ["监管", "证监会", "银保监会", "合规", "处罚", "IPO", "注册制", "SEC", "FINRA"],
        "industry_policy": ["产业政策", "补贴", "新能源", "半导体", "人工智能", "十四五", "专项债", "基建"],
        "trade": ["关税", "贸易战", "出口", "进口", "制裁", "WTO", "供应链"],
        "fiscal": ["财政", "税", "增值税", "个税", "赤字", "预算"],
    }

    SECTOR_MAPPING = {
        "金融": ["银行", "保险", "证券", "金融"],
        "科技": ["半导体", "人工智能", "软件", "互联网", "AI", "芯片"],
        "新能源": ["光伏", "风电", "锂电池", "新能源车", "电池"],
        "医药": ["医药", "生物", "疫苗", "医疗器械"],
        "消费": ["食品", "饮料", "零售", "消费", "白酒"],
        "地产": ["房地产", "地产", "建筑", "物业"],
        "工业": ["制造", "装备", "机械", "化工"],
    }

    def __init__(self, sources: Optional[List[str]] = None, min_impact: float = 0.1):
        self.sources = sources or ["news_api", "reuters", "bloomberg"]
        self.min_impact = min_impact

    def filter_keywords(self, text: str) -> List[str]:
        """Find all policy-related keywords in text."""
        found = []
        text_lower = text.lower()
        for category, keywords in self.KEYWORD_CATEGORIES.items():
            for kw in keywords:
                if kw.lower() in text_lower or kw in text:
                    found.append(kw)
        return list(set(found))

    def classify_event(self, keywords: List[str]) -> str:
        """Classify event type based on matched keywords."""
        for kw in keywords:
            for category in self.KEYWORD_CATEGORIES:
                if kw in self.KEYWORD_CATEGORIES[category]:
                    return category
        return "other"

    def map_sectors(self, keywords: List[str], headline: str) -> List[str]:
        """Map keywords to affected sectors."""
        sectors = []
        combined = " ".join(keywords) + " " + headline
        for sector, sector_keywords in self.SECTOR_MAPPING.items():
            if any(skw.lower() in combined.lower() for skw in sector_keywords):
                sectors.append(sector)
        return sectors if sectors else ["general"]

    def score_impact(self, keywords: List[str], headline: str) -> float:
        """Score impact: -1 (negative) to 1 (positive)."""
        positive_indicators = ["利好", "增长", "补贴", "支持", "放松", " increase ", "growth", "support", "ease"]
        negative_indicators = ["利空", "收紧", "监管", "打击", "处罚", "限制", "decline", "tighten", "regulation", "penalty"]

        text = headline.lower()
        score = 0.0

        for kw in keywords:
            kw_lower = kw.lower()
            if any(pos in text or pos in kw_lower for pos in positive_indicators):
                score += 0.2
            if any(neg in text or neg in kw_lower for neg in negative_indicators):
                score -= 0.2

        return max(-1.0, min(1.0, score))

    def extract_events(self, news_articles: List[Dict]) -> List[PolicyEvent]:
        """Extract policy events from raw news articles."""
        events = []
        for article in news_articles:
            headline = article.get("headline", article.get("title", ""))
            text = headline + " " + article.get("text", "")
            keywords = self.filter_keywords(text)

            if not keywords:
                continue

            event_type = self.classify_event(keywords)
            impact = self.score_impact(keywords, headline)
            sectors = self.map_sectors(keywords, headline)

            if abs(impact) >= self.min_impact:
                event = PolicyEvent(
                    date=pd.to_datetime(article.get("date", datetime.utcnow())),
                    source=article.get("source", "unknown"),
                    headline=headline,
                    keywords_matched=keywords,
                    event_type=event_type,
                    impact_score=impact,
                    affected_sectors=sectors,
                    summary=self._generate_summary(headline, keywords, impact, sectors),
                )
                events.append(event)

        return events

    def _generate_summary(self, headline: str, keywords: List[str], impact: float, sectors: List[str]) -> str:
        direction = "正面" if impact > 0 else "负面" if impact < 0 else "中性"
        return f"{direction}政策事件，涉及关键词: {', '.join(keywords[:3])}, 影响行业: {', '.join(sectors)}"

    def events_to_dataframe(self, events: List[PolicyEvent]) -> pd.DataFrame:
        """Convert events to DataFrame for downstream processing."""
        if not events:
            return pd.DataFrame(columns=[
                "date", "source", "headline", "keywords_matched", "event_type",
                "impact_score", "affected_sectors", "summary"
            ])

        records = [{
            "date": e.date,
            "source": e.source,
            "headline": e.headline,
            "keywords_matched": ",".join(e.keywords_matched),
            "event_type": e.event_type,
            "impact_score": e.impact_score,
            "affected_sectors": ",".join(e.affected_sectors),
            "summary": e.summary,
        } for e in events]

        df = pd.DataFrame(records)
        df = df.sort_values("date", ascending=False).reset_index(drop=True)
        return df


class NewsIngester:
    """Base class for fetching news from various sources."""

    def fetch_news(self, tickers: Optional[List[str]] = None, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[Dict]:
        """Fetch news articles. Override in subclass."""
        return []


class MockNewsIngester(NewsIngester):
    """Mock news ingester for MVP testing."""

    def __init__(self):
        self.sample_news = [
            {"date": "2026-03-25", "source": "Reuters", "headline": "Fed maintains interest rates, signals potential cuts later", "text": "Fed interest rates monetary policy"},
            {"date": "2026-03-24", "source": "Bloomberg", "headline": "China announces new subsidy for semiconductor industry", "text": "产业政策 半导体 补贴"},
            {"date": "2026-03-23", "source": "WSJ", "headline": "SEC tightens regulation on crypto exchanges", "text": "SEC 监管 处罚"},
            {"date": "2026-03-22", "source": "Reuters", "headline": "PBOC cuts reserve requirement ratio to support economy", "text": "央行 降息 宽松 货币政策"},
            {"date": "2026-03-21", "source": "CNBC", "headline": "New industry policy boosts renewable energy sector", "text": "产业政策 新能源 补贴"},
        ]

    def fetch_news(self, tickers: Optional[List[str]] = None, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> List[Dict]:
        return self.sample_news


def run_policy_monitor():
    """Standalone test for PolicyMonitor."""
    ingester = MockNewsIngester()
    news = ingester.fetch_news()
    monitor = PolicyMonitor(min_impact=0.1)
    events = monitor.extract_events(news)
    print(f"Extracted {len(events)} policy events:")
    for e in events:
        print(f"  [{e.date.strftime('%Y-%m-%d')}] {e.event_type}: {e.headline[:50]}... (impact: {e.impact_score})")
    return events


if __name__ == "__main__":
    run_policy_monitor()
