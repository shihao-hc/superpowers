"""
Multi-Engine Aggregated Search: Unified search across all data sources.
- Stock quotes search
- Policy news search  
- Knowledge base search
- Historical data search
- Real-time news search
"""
from __future__ import annotations

import pandas as pd
from typing import List, Dict, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import json


@dataclass
class SearchResult:
    """Unified search result."""
    source: str
    result_type: str  # "stock", "policy", "knowledge", "news", "historical"
    title: str
    content: str
    metadata: Dict[str, Any]
    relevance_score: float


class StockSearchEngine:
    """Search engine for stock data."""

    def search(self, query: str, limit: int = 10) -> List[SearchResult]:
        """Search stocks by ticker or name."""
        # Mock implementation - in production connect to stock database
        return []


class PolicySearchEngine:
    """Search engine for policy news."""

    def search(self, query: str, limit: int = 10) -> List[SearchResult]:
        """Search policy news by keywords."""
        # Mock implementation - in production connect to policy monitor
        return []


class KnowledgeSearchEngine:
    """Search engine for quantitative knowledge base."""

    def __init__(self, kb=None):
        self.kb = kb

    def search(self, query: str, limit: int = 10) -> List[SearchResult]:
        """Search knowledge base."""
        if not self.kb:
            return []
        results = self.kb.search(query, top_k=limit)
        return [
            SearchResult(
                source="knowledge_base",
                result_type="knowledge",
                title=r["metadata"].get("type", "doc"),
                content=r["content"][:500],
                metadata=r["metadata"],
                relevance_score=1.0 - r.get("distance", 0)
            )
            for r in results
        ]


class HistoricalDataSearchEngine:
    """Search engine for historical price data."""

    def search(self, query: str, limit: int = 10) -> List[SearchResult]:
        """Search historical data."""
        # Mock implementation
        return []


class NewsSearchEngine:
    """Search engine for real-time news."""

    def search(self, query: str, limit: int = 10) -> List[SearchResult]:
        """Search news."""
        # Mock implementation
        return []


class AggregatedSearchEngine:
    """
    Multi-engine aggregated search.
    Coordinates multiple search engines and returns unified results.
    """

    def __init__(self, knowledge_base=None):
        self.engines = {
            "stock": StockSearchEngine(),
            "policy": PolicySearchEngine(),
            "knowledge": KnowledgeSearchEngine(knowledge_base),
            "historical": HistoricalDataSearchEngine(),
            "news": NewsSearchEngine(),
        }

    def search(
        self,
        query: str,
        engines: Optional[List[str]] = None,
        limit_per_engine: int = 5
    ) -> List[SearchResult]:
        """
        Search across multiple engines.
        
        Args:
            query: Search query string
            engines: List of engine names to query (default: all)
            limit_per_engine: Max results per engine
        
        Returns:
            List of SearchResult sorted by relevance
        """
        if engines is None:
            engines = list(self.engines.keys())

        all_results = []
        for engine_name in engines:
            if engine_name in self.engines:
                engine = self.engines[engine_name]
                try:
                    results = engine.search(query, limit_per_engine)
                    all_results.extend(results)
                except Exception as e:
                    print(f"Search engine {engine_name} error: {e}")

        # Sort by relevance score
        all_results.sort(key=lambda x: x.relevance_score, reverse=True)
        return all_results

    def search_by_type(
        self,
        query: str,
        result_type: str,
        limit: int = 10
    ) -> List[SearchResult]:
        """Search for specific result type."""
        return self.search(query, engines=[result_type], limit_per_engine=limit)

    def register_engine(self, name: str, engine) -> None:
        """Register a new search engine."""
        self.engines[name] = engine

    def get_available_engines(self) -> List[str]:
        """Get list of available search engines."""
        return list(self.engines.keys())


def demo_aggregated_search():
    """Demo the aggregated search engine."""
    from stock_selector.quant_knowledge_base import QuantKnowledgeBase

    # Create knowledge base with sample data
    kb = QuantKnowledgeBase()
    kb.add_strategy(
        code="def momentum(prices): return prices.pct_change(20)",
        name="Momentum Strategy"
    )
    kb.add_factor(definition="ROE = Net Income / Equity", name="ROE")

    # Create aggregated search
    search_engine = AggregatedSearchEngine(knowledge_base=kb)

    print("=== Available engines ===")
    print(search_engine.get_available_engines())

    print("\n=== Search: 'momentum strategy' (all engines) ===")
    results = search_engine.search("momentum strategy", limit=3)
    for r in results:
        print(f"[{r.source}/{r.result_type}] {r.title} (score: {r.relevance_score:.3f})")
        print(f"   {r.content[:100]}...")

    print("\n=== Search: 'ROE factor' (knowledge only) ===")
    results = search_engine.search_by_type("ROE factor", "knowledge", limit=2)
    for r in results:
        print(f"[{r.source}] {r.title}")


if __name__ == "__main__":
    demo_aggregated_search()
