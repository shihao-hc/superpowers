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
        # Mock implementation with sample data
        mock_stocks = [
            {"code": "600519", "name": "贵州茅台", "sector": "消费", "price": 1750.0},
            {"code": "000858", "name": "五粮液", "sector": "消费", "price": 168.5},
            {"code": "600036", "name": "招商银行", "sector": "金融", "price": 35.2},
            {"code": "000001", "name": "平安银行", "sector": "金融", "price": 12.8},
            {"code": "601318", "name": "中国平安", "sector": "金融", "price": 48.6},
            {"code": "300750", "name": "宁德时代", "sector": "新能源", "price": 215.0},
            {"code": "002594", "name": "比亚迪", "sector": "汽车", "price": 285.0},
            {"code": "600030", "name": "中信证券", "sector": "金融", "price": 22.5},
            {"code": "601012", "name": "隆基绿能", "sector": "新能源", "price": 28.6},
            {"code": "000333", "name": "美的集团", "sector": "消费", "price": 58.3},
        ]

        results = []
        query_lower = query.lower()
        for stock in mock_stocks:
            # Match by code, name, or sector
            if (
                query_lower in stock["code"].lower()
                or query in stock["name"]
                or query in stock["sector"]
            ):
                results.append(
                    SearchResult(
                        source="stock_db",
                        result_type="stock",
                        title=f"{stock['name']} ({stock['code']})",
                        content=f"代码: {stock['code']}, 名称: {stock['name']}, 行业: {stock['sector']}, 价格: {stock['price']}",
                        metadata={
                            "code": stock["code"],
                            "name": stock["name"],
                            "sector": stock["sector"],
                            "price": stock["price"],
                        },
                        relevance_score=0.95,
                    )
                )

        # If no match, return first few stocks
        if not results and query:
            for stock in mock_stocks[:3]:
                results.append(
                    SearchResult(
                        source="stock_db",
                        result_type="stock",
                        title=f"{stock['name']} ({stock['code']})",
                        content=f"代码: {stock['code']}, 名称: {stock['name']}, 行业: {stock['sector']}, 价格: {stock['price']}",
                        metadata={
                            "code": stock["code"],
                            "name": stock["name"],
                            "sector": stock["sector"],
                            "price": stock["price"],
                        },
                        relevance_score=0.7,
                    )
                )

        return results[:limit]


class PolicySearchEngine:
    """Search engine for policy news."""

    def search(self, query: str, limit: int = 10) -> List[SearchResult]:
        """Search policy news by keywords."""
        # Mock implementation with sample data
        mock_policies = [
            {
                "date": "2024-03-28",
                "title": "央行宣布降准0.5个百分点",
                "type": "货币政策",
                "impact": "positive",
            },
            {
                "date": "2024-03-27",
                "title": "国务院发布促进消费扩大内需政策",
                "type": "消费政策",
                "impact": "positive",
            },
            {
                "date": "2024-03-26",
                "title": "证监会加强上市公司分红监管",
                "type": "监管政策",
                "impact": "neutral",
            },
            {
                "date": "2024-03-25",
                "title": "新能源汽车购置税减免延续",
                "type": "产业政策",
                "impact": "positive",
            },
            {
                "date": "2024-03-24",
                "title": "房地产调控政策适度放松",
                "type": "房地产政策",
                "impact": "positive",
            },
        ]

        results = []
        for policy in mock_policies:
            results.append(
                SearchResult(
                    source="policy_monitor",
                    result_type="policy",
                    title=policy["title"],
                    content=f"日期: {policy['date']}, 类型: {policy['type']}, 影响: {policy['impact']}",
                    metadata={
                        "date": policy["date"],
                        "type": policy["type"],
                        "impact": policy["impact"],
                    },
                    relevance_score=0.85,
                )
            )

        return results[:limit]


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
                relevance_score=1.0 - r.get("distance", 0),
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
        self, query: str, engines: Optional[List[str]] = None, limit_per_engine: int = 5
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
        self, query: str, result_type: str, limit: int = 10
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
        name="Momentum Strategy",
    )
    kb.add_factor(definition="ROE = Net Income / Equity", name="ROE")

    # Create aggregated search
    search_engine = AggregatedSearchEngine(knowledge_base=kb)

    print("=== Available engines ===")
    print(search_engine.get_available_engines())

    print("\n=== Search: 'momentum strategy' (all engines) ===")
    results = search_engine.search("momentum strategy", limit=3)
    for r in results:
        print(
            f"[{r.source}/{r.result_type}] {r.title} (score: {r.relevance_score:.3f})"
        )
        print(f"   {r.content[:100]}...")

    print("\n=== Search: 'ROE factor' (knowledge only) ===")
    results = search_engine.search_by_type("ROE factor", "knowledge", limit=2)
    for r in results:
        print(f"[{r.source}] {r.title}")


if __name__ == "__main__":
    demo_aggregated_search()
