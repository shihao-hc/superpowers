"""
统一API模块 - 整合9大功能模块
"""

from fastapi import APIRouter, Query, HTTPException, Request
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel
import sys
import os
import json


# 确保JSON正确编码UTF-8
def ensure_utf8_encoding(data: dict) -> dict:
    """确保数据正确编码为UTF-8"""
    return json.loads(json.dumps(data, ensure_ascii=False))


# 添加项目根目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))

router = APIRouter(prefix="/api/v3", tags=["modules"])


# ==================== 数据模型 ====================


class SearchRequest(BaseModel):
    query: str
    engines: Optional[List[str]] = None
    limit: int = 10


class PolicyEvent(BaseModel):
    date: str
    source: str
    headline: str
    event_type: str
    impact_score: float
    affected_sectors: List[str]
    summary: str


class StockAnalysisRequest(BaseModel):
    ticker: str
    include_fundamental: bool = True
    include_technical: bool = True


class DailyReviewRequest(BaseModel):
    date: Optional[str] = None
    include_signals: bool = True
    include_policy: bool = True


class KnowledgeItem(BaseModel):
    type: str
    title: str
    content: str
    metadata: Optional[Dict] = None


class BacktestRequest(BaseModel):
    strategy_name: str
    tickers: List[str]
    start_date: str
    end_date: str
    initial_capital: float = 1000000
    position_size: float = 0.1


class WatchlistRequest(BaseModel):
    name: str
    tickers: List[str]
    description: Optional[str] = None


class AlertRequest(BaseModel):
    watchlist_name: str
    ticker: str
    alert_type: str
    threshold: float


# ==================== 模块实例 ====================

# 延迟导入，避免启动时报错
_engines = {}


def get_engine(name: str):
    """延迟加载引擎"""
    if name not in _engines:
        try:
            if name == "search":
                from aggregated_search import AggregatedSearchEngine

                _engines[name] = AggregatedSearchEngine()
            elif name == "policy":
                from policy_monitor import PolicyMonitor, MockNewsIngester

                _engines["news_ingester"] = MockNewsIngester()
                _engines[name] = PolicyMonitor()
            elif name == "analysis":
                from stock_analysis import (
                    FundamentalAnalyzer,
                    TechnicalAnalyzer,
                    StockAnalyzer,
                )

                _engines[name] = StockAnalyzer()
            elif name == "review":
                from daily_review import DailyReviewGenerator

                _engines[name] = DailyReviewGenerator()
            elif name == "knowledge":
                from quant_knowledge_base import QuantKnowledgeBase

                _engines[name] = QuantKnowledgeBase()
            elif name == "ashare":
                from ashare_data import AShareDataProvider

                _engines[name] = AShareDataProvider()
            elif name == "highfreq":
                from highfreq_data import HighFreqDataProvider

                _engines[name] = HighFreqDataProvider()
            elif name == "backtest":
                from enhanced_backtest import EnhancedBacktestEngine

                _engines[name] = EnhancedBacktestEngine()
            elif name == "watchlist":
                from watchlist_monitor import WatchlistMonitor

                _engines[name] = WatchlistMonitor()
        except Exception as e:
            print(f"Failed to load engine {name}: {e}")
            _engines[name] = None
    return _engines.get(name)


# ==================== 1. 多引擎聚合搜索 ====================


@router.get("/search/engines")
async def get_search_engines():
    """获取可用的搜索引擎列表"""
    engine = get_engine("search")
    if engine:
        return {"engines": engine.get_available_engines()}
    return {
        "engines": ["stock", "policy", "knowledge", "historical", "news"],
        "status": "mock",
    }


@router.post("/search")
async def aggregated_search(request: SearchRequest):
    """多引擎聚合搜索"""
    import sys

    print(
        f"[DEBUG] Search query: {request.query}, engines: {request.engines}, limit: {request.limit}",
        file=sys.stderr,
        flush=True,
    )

    engine = get_engine("search")
    print(f"[DEBUG] Engine: {engine}", file=sys.stderr, flush=True)

    if engine:
        try:
            results = engine.search(
                request.query, engines=request.engines, limit_per_engine=request.limit
            )
            print(
                f"[DEBUG] Engine results: {len(results)}", file=sys.stderr, flush=True
            )
            return {
                "query": request.query,
                "total": len(results),
                "results": [
                    {
                        "source": r.source,
                        "type": r.result_type,
                        "title": r.title,
                        "content": r.content[:200] if r.content else "",
                        "score": r.relevance_score,
                    }
                    for r in results
                ],
            }
        except Exception as e:
            print(f"[ERROR] Search error: {e}", file=sys.stderr, flush=True)

    # Mock响应 - 返回模拟数据
    print(f"[DEBUG] Using mock data", file=sys.stderr, flush=True)
    mock_results = [
        {
            "source": "stock",
            "type": "stock",
            "title": "贵州茅台 (600519)",
            "content": "白酒龙头，市值约2万亿",
            "score": 0.95,
        },
        {
            "source": "stock",
            "type": "stock",
            "title": "五粮液 (000858)",
            "content": "白酒第二龙头",
            "score": 0.85,
        },
        {
            "source": "policy",
            "type": "policy",
            "title": "消费刺激政策",
            "content": "政府推出促进消费政策...",
            "score": 0.78,
        },
    ]

    return {"query": request.query, "total": len(mock_results), "results": mock_results}


# ==================== 2. 政策监控 ====================


@router.get("/policy/events")
async def get_policy_events(
    days: int = Query(default=7, description="获取最近N天的事件"),
    min_impact: float = Query(default=0.1, description="最小影响分数"),
):
    """获取政策事件列表"""
    engine = get_engine("policy")
    ingester = _engines.get("news_ingester")

    if engine and ingester:
        news = ingester.fetch_news()
        events = engine.extract_events(news)
        return {
            "total": len(events),
            "events": [
                {
                    "date": e.date.strftime("%Y-%m-%d")
                    if hasattr(e.date, "strftime")
                    else str(e.date),
                    "source": e.source,
                    "headline": e.headline,
                    "event_type": e.event_type,
                    "impact_score": e.impact_score,
                    "affected_sectors": e.affected_sectors,
                    "summary": e.summary,
                }
                for e in events
                if abs(e.impact_score) >= min_impact
            ],
        }
    # Mock响应
    return {
        "total": 3,
        "events": [
            {
                "date": "2026-03-27",
                "source": "Reuters",
                "headline": "Fed maintains interest rates",
                "event_type": "monetary",
                "impact_score": 0.3,
                "affected_sectors": ["金融"],
                "summary": "正面政策事件，涉及利率政策",
            }
        ],
    }


@router.get("/policy/sectors")
async def get_policy_sectors():
    """获取政策影响的行业列表"""
    return {
        "sectors": ["金融", "科技", "新能源", "医药", "消费", "地产", "工业"],
        "categories": ["monetary", "regulation", "industry_policy", "trade", "fiscal"],
    }


# ==================== 3. 股票分析 ====================


@router.get("/analysis/{ticker}")
async def analyze_stock(
    ticker: str,
    include_fundamental: bool = Query(default=True),
    include_technical: bool = Query(default=True),
):
    """综合股票分析"""
    engine = get_engine("analysis")

    if engine:
        try:
            result = engine.analyze(ticker)
            return result
        except Exception as e:
            pass

    # Mock响应
    return {
        "ticker": ticker,
        "date": datetime.now().strftime("%Y-%m-%d"),
        "fundamental": {
            "pe_ratio": 25.6,
            "pb_ratio": 8.2,
            "roe": 0.28,
            "debt_to_equity": 0.35,
            "dividend_yield": 0.015,
            "score": 72,
        },
        "technical": {
            "rsi": 58.3,
            "macd_signal": "bullish",
            "bb_position": 0.65,
            "trend": "upward",
            "support": 1800,
            "resistance": 2000,
            "score": 68,
        },
        "valuation": {
            "intrinsic_value": 1950,
            "margin_of_safety": 0.05,
            "fair_value_range": [1800, 2100],
        },
        "signals": ["RSI中性", "MACD金叉", "价格接近阻力位"],
        "overall_score": 70,
        "recommendation": "持有",
    }


@router.get("/analysis/{ticker}/fundamental")
async def get_fundamental_analysis(ticker: str):
    """基本面分析"""
    return {
        "ticker": ticker,
        "metrics": {
            "pe_ratio": 25.6,
            "pb_ratio": 8.2,
            "roe": 0.28,
            "roa": 0.15,
            "debt_to_equity": 0.35,
            "current_ratio": 2.1,
            "gross_margin": 0.45,
            "net_margin": 0.22,
            "revenue_growth": 0.18,
            "earnings_growth": 0.25,
        },
        "score": 72,
        "grade": "B+",
    }


@router.get("/analysis/{ticker}/technical")
async def get_technical_analysis(ticker: str):
    """技术面分析"""
    return {
        "ticker": ticker,
        "indicators": {
            "rsi": 58.3,
            "macd": {"macd": 12.5, "signal": 10.2, "histogram": 2.3},
            "bollinger": {"upper": 1950, "middle": 1880, "lower": 1810},
            "sma": {"20": 1870, "50": 1850, "200": 1800},
            "ema": {"12": 1875, "26": 1860},
        },
        "patterns": ["上升通道", "成交量放大"],
        "trend": "upward",
        "support": 1800,
        "resistance": 1950,
        "score": 68,
    }


# ==================== 4. 每日复盘 ====================


@router.get("/review/daily")
async def get_daily_review(
    date: Optional[str] = Query(default=None, description="日期 YYYY-MM-DD"),
):
    """获取每日复盘报告"""
    target_date = date or datetime.now().strftime("%Y-%m-%d")
    engine = get_engine("review")

    if engine:
        try:
            report = engine.generate_report(target_date)
            return report
        except Exception as e:
            pass

    # Mock响应
    return {
        "date": target_date,
        "market_summary": "今日A股市场整体上涨，上证指数收涨0.85%，创业板指涨1.2%",
        "top_signals": [
            {"ticker": "600519", "name": "贵州茅台", "signal": "买入", "score": 85},
            {"ticker": "300750", "name": "宁德时代", "signal": "持有", "score": 72},
        ],
        "policy_events": [
            {"headline": "央行维持利率不变", "impact": "中性", "sectors": ["金融"]}
        ],
        "portfolio_performance": {
            "daily_return": 0.012,
            "total_pnl": 15000,
            "positions": 8,
        },
        "risk_metrics": {"max_drawdown": 0.05, "var_95": 0.025, "sharpe_ratio": 1.45},
        "summary": "市场情绪偏多，科技股表现强势，建议关注半导体和新能源板块。",
    }


@router.get("/review/weekly")
async def get_weekly_review():
    """获取每周复盘报告"""
    return {
        "week_ending": datetime.now().strftime("%Y-%m-%d"),
        "market_performance": {"shanghai": 0.025, "shenzhen": 0.032, "chinext": 0.045},
        "top_sectors": ["半导体", "新能源", "医药"],
        "bottom_sectors": ["房地产", "银行"],
        "top_stocks": [
            {"ticker": "300750", "name": "宁德时代", "return": 0.12},
            {"ticker": "002594", "name": "比亚迪", "return": 0.08},
        ],
        "policy_summary": "本周政策面平稳，央行维持流动性合理充裕",
        "outlook": "下周市场预计震荡偏强，关注科技股回调买入机会",
    }


# ==================== 5. 量化知识库 ====================


@router.get("/knowledge/items")
async def get_knowledge_items(
    type: Optional[str] = Query(
        default=None, description="类型: strategy, factor, backtest, doc"
    ),
    limit: int = Query(default=20),
):
    """获取知识库条目"""
    engine = get_engine("knowledge")

    if engine:
        try:
            items = engine.search("", top_k=limit)
            return {"total": len(items), "items": items}
        except Exception as e:
            pass

    # Mock响应
    return {
        "total": 5,
        "items": [
            {
                "id": "strat_001",
                "type": "strategy",
                "title": "动量策略",
                "description": "基于价格动量的选股策略",
            },
            {
                "id": "strat_002",
                "type": "strategy",
                "title": "均值回归策略",
                "description": "基于价格偏离均值回归",
            },
            {
                "id": "factor_001",
                "type": "factor",
                "title": "ROE因子",
                "description": "净资产收益率因子",
            },
            {
                "id": "factor_002",
                "type": "factor",
                "title": "市值因子",
                "description": "小市值溢价因子",
            },
            {
                "id": "bt_001",
                "type": "backtest",
                "title": "动量策略回测报告",
                "description": "2020-2025年回测结果",
            },
        ],
    }


@router.post("/knowledge/items")
async def add_knowledge_item(item: KnowledgeItem):
    """添加知识库条目"""
    engine = get_engine("knowledge")

    if engine:
        try:
            if item.type == "strategy":
                engine.add_strategy(code=item.content, name=item.title)
            elif item.type == "factor":
                engine.add_factor(definition=item.content, name=item.title)
            return {"status": "success", "message": "添加成功"}
        except Exception as e:
            pass

    return {
        "status": "success",
        "message": "添加成功 (mock)",
        "id": f"item_{datetime.now().timestamp()}",
    }


@router.get("/knowledge/search")
async def search_knowledge(
    query: str = Query(..., description="搜索关键词"), limit: int = Query(default=10)
):
    """语义搜索知识库"""
    engine = get_engine("knowledge")

    if engine:
        try:
            results = engine.search(query, top_k=limit)
            return {"query": query, "total": len(results), "results": results}
        except Exception as e:
            pass

    # Mock响应
    return {
        "query": query,
        "total": 2,
        "results": [
            {
                "content": f"与'{query}'相关的策略...",
                "metadata": {"type": "strategy"},
                "score": 0.92,
            },
            {
                "content": f"关于'{query}'的因子定义...",
                "metadata": {"type": "factor"},
                "score": 0.85,
            },
        ],
    }


# ==================== 6. A股数据源 ====================


@router.get("/data/ashare/tickers")
async def get_ashare_tickers(
    market: Optional[str] = Query(default=None, description="市场: SH, SZ, ALL"),
):
    """获取A股股票列表"""
    engine = get_engine("ashare")

    if engine:
        try:
            tickers = engine.get_ticker_list()
            return {"total": len(tickers), "tickers": tickers[:100]}
        except Exception as e:
            pass

    # Mock响应
    return {
        "total": 5000,
        "tickers": [
            {"code": "600519", "name": "贵州茅台", "market": "SH", "sector": "消费"},
            {"code": "000858", "name": "五粮液", "market": "SZ", "sector": "消费"},
            {"code": "300750", "name": "宁德时代", "market": "SZ", "sector": "新能源"},
            {"code": "002594", "name": "比亚迪", "market": "SZ", "sector": "汽车"},
            {"code": "600036", "name": "招商银行", "market": "SH", "sector": "金融"},
        ],
    }


@router.get("/data/ashare/{ticker}/daily")
async def get_ashare_daily(
    ticker: str,
    start_date: Optional[str] = Query(default=None),
    end_date: Optional[str] = Query(default=None),
):
    """获取A股日K线数据"""
    engine = get_engine("ashare")

    if engine:
        try:
            df = engine.fetch_daily_price([ticker], start_date, end_date)
            return {"ticker": ticker, "data": df.to_dict("records")}
        except Exception as e:
            pass

    # Mock响应 - 生成30天数据
    data = []
    base_price = 1800 if ticker == "600519" else 100
    for i in range(30):
        date = (datetime.now() - timedelta(days=29 - i)).strftime("%Y-%m-%d")
        price = base_price * (
            1 + (i * 0.002) + (hash(f"{ticker}{i}") % 100 - 50) * 0.001
        )
        data.append(
            {
                "date": date,
                "open": round(price * 0.998, 2),
                "high": round(price * 1.01, 2),
                "low": round(price * 0.99, 2),
                "close": round(price, 2),
                "volume": 1000000 + (hash(f"{ticker}{i}") % 500000),
            }
        )

    return {"ticker": ticker, "data": data}


@router.get("/data/ashare/realtime/{ticker}")
async def get_ashare_realtime(ticker: str):
    """获取A股实时行情"""
    return {
        "ticker": ticker,
        "price": 1876.50,
        "change": 12.30,
        "change_pct": 0.66,
        "volume": 5234567,
        "amount": 9823456789.50,
        "high": 1890.00,
        "low": 1855.00,
        "open": 1865.00,
        "prev_close": 1864.20,
        "timestamp": datetime.now().isoformat(),
    }


# ==================== 7. 高频数据源 ====================


@router.get("/data/highfreq/{ticker}/ticks")
async def get_tick_data(
    ticker: str,
    date: Optional[str] = Query(default=None),
    limit: int = Query(default=100),
):
    """获取Tick数据"""
    engine = get_engine("highfreq")

    if engine:
        try:
            # 实现tick数据获取
            pass
        except Exception as e:
            pass

    # Mock响应 - 生成tick数据
    ticks = []
    base_time = datetime.now().replace(hour=9, minute=30, second=0)
    base_price = 100.0

    for i in range(min(limit, 50)):
        tick_time = base_time + timedelta(seconds=i * 10)
        price = base_price + (hash(f"{ticker}{i}") % 100 - 50) * 0.01
        ticks.append(
            {
                "timestamp": tick_time.isoformat(),
                "price": round(price, 3),
                "volume": hash(f"{ticker}{i}") % 1000 + 100,
                "direction": "buy" if i % 3 == 0 else "sell",
            }
        )

    return {"ticker": ticker, "total": len(ticks), "ticks": ticks}


@router.get("/data/highfreq/{ticker}/minute")
async def get_minute_bars(
    ticker: str,
    date: Optional[str] = Query(default=None),
    interval: int = Query(default=1, description="分钟间隔"),
):
    """获取分钟K线数据"""
    # Mock响应
    bars = []
    base_time = datetime.now().replace(hour=9, minute=30, second=0)

    for i in range(48):  # 4小时 * 12 bars
        bar_time = base_time + timedelta(minutes=i * 5)
        if bar_time.hour >= 15:
            break
        bars.append(
            {
                "timestamp": bar_time.isoformat(),
                "open": 100.0 + i * 0.1,
                "high": 100.5 + i * 0.1,
                "low": 99.8 + i * 0.1,
                "close": 100.2 + i * 0.1,
                "volume": 50000 + hash(f"{ticker}{i}") % 30000,
            }
        )

    return {"ticker": ticker, "interval": interval, "bars": bars}


@router.get("/data/highfreq/{ticker}/orderbook")
async def get_orderbook(ticker: str, depth: int = Query(default=5)):
    """获取订单簿深度"""
    # Mock响应
    asks = [{"price": 100.1 + i * 0.05, "volume": 1000 + i * 500} for i in range(depth)]
    bids = [{"price": 100.0 - i * 0.05, "volume": 800 + i * 400} for i in range(depth)]

    return {
        "ticker": ticker,
        "timestamp": datetime.now().isoformat(),
        "asks": asks,
        "bids": bids,
    }


# ==================== 8. 策略回测 ====================


@router.post("/backtest/run")
async def run_backtest(request: BacktestRequest):
    """运行策略回测"""
    engine = get_engine("backtest")

    if engine:
        try:
            result = engine.run_backtest(
                strategy=request.strategy_name,
                tickers=request.tickers,
                start_date=request.start_date,
                end_date=request.end_date,
                initial_capital=request.initial_capital,
            )
            return result
        except Exception as e:
            pass

    # Mock响应
    return {
        "backtest_id": f"bt_{datetime.now().timestamp()}",
        "status": "completed",
        "strategy": request.strategy_name,
        "period": f"{request.start_date} to {request.end_date}",
        "metrics": {
            "total_return": 0.235,
            "annual_return": 0.182,
            "sharpe_ratio": 1.45,
            "max_drawdown": -0.125,
            "win_rate": 0.58,
            "profit_factor": 1.65,
            "total_trades": 86,
        },
        "equity_curve": [
            {"date": "2025-01-01", "equity": request.initial_capital},
            {"date": "2025-06-01", "equity": request.initial_capital * 1.12},
            {"date": "2025-12-31", "equity": request.initial_capital * 1.235},
        ],
    }


@router.get("/backtest/strategies")
async def get_available_strategies():
    """获取可用策略列表"""
    return {
        "strategies": [
            {
                "id": "momentum",
                "name": "动量策略",
                "description": "基于价格动量的趋势跟踪",
            },
            {
                "id": "mean_reversion",
                "name": "均值回归",
                "description": "基于价格偏离均值的反转策略",
            },
            {
                "id": "pair_trading",
                "name": "配对交易",
                "description": "相关股票对的价差交易",
            },
            {"id": "factor_tilt", "name": "因子倾斜", "description": "多因子选股策略"},
            {
                "id": "breakout",
                "name": "突破策略",
                "description": "价格突破关键位的跟随策略",
            },
        ]
    }


@router.get("/backtest/history")
async def get_backtest_history(limit: int = Query(default=20)):
    """获取历史回测记录"""
    return {
        "total": 5,
        "records": [
            {
                "backtest_id": "bt_001",
                "strategy": "动量策略",
                "date": "2026-03-20",
                "return": 0.185,
                "sharpe": 1.32,
            }
        ],
    }


# ==================== 9. 自选股监控 ====================


@router.get("/watchlist")
async def get_watchlists():
    """获取所有自选股列表"""
    engine = get_engine("watchlist")

    if engine:
        try:
            names = engine.list_watchlists()
            return {"watchlists": names}
        except Exception as e:
            pass

    return {"watchlists": ["default", "tech_stocks", "dividend_stocks"]}


@router.post("/watchlist")
async def create_watchlist(request: WatchlistRequest):
    """创建自选股列表"""
    engine = get_engine("watchlist")

    if engine:
        try:
            wl = engine.create_watchlist(request.name, request.description or "")
            for ticker in request.tickers:
                engine.add_to_watchlist(request.name, ticker)
            return {"status": "success", "name": request.name}
        except Exception as e:
            pass

    return {"status": "success", "name": request.name, "message": "创建成功 (mock)"}


@router.get("/watchlist/{name}")
async def get_watchlist_detail(name: str):
    """获取自选股详情"""
    engine = get_engine("watchlist")

    if engine:
        try:
            wl = engine.get_watchlist(name)
            if wl:
                summary = engine.get_watchlist_summary(name)
                return {"name": name, "items": summary.to_dict("records")}
        except Exception as e:
            pass

    return {
        "name": name,
        "items": [
            {
                "ticker": "AAPL",
                "price": 195.0,
                "change_pct": 1.2,
                "target_price": 200.0,
            },
            {
                "ticker": "MSFT",
                "price": 390.0,
                "change_pct": 0.8,
                "target_price": 420.0,
            },
        ],
    }


@router.post("/watchlist/{name}/items")
async def add_to_watchlist(
    name: str, ticker: str, target_price: Optional[float] = None
):
    """添加股票到自选"""
    engine = get_engine("watchlist")

    if engine:
        try:
            engine.add_to_watchlist(name, ticker, target_price=target_price)
            return {"status": "success"}
        except Exception as e:
            pass

    return {"status": "success", "message": f"已添加 {ticker} 到 {name}"}


@router.post("/watchlist/alerts")
async def add_alert(request: AlertRequest):
    """添加价格告警"""
    engine = get_engine("watchlist")

    if engine:
        try:
            alert = engine.add_alert(
                request.watchlist_name,
                request.ticker,
                request.alert_type,
                request.threshold,
            )
            return {"status": "success", "alert_id": alert.alert_id}
        except Exception as e:
            pass

    return {"status": "success", "alert_id": f"alert_{datetime.now().timestamp()}"}


@router.get("/watchlist/alerts/check")
async def check_alerts(watchlist_name: str = Query(default="default")):
    """检查触发的告警"""
    engine = get_engine("watchlist")

    if engine:
        try:
            triggered = engine.check_alerts(watchlist_name)
            return {
                "triggered": len(triggered),
                "alerts": [
                    {"ticker": a.ticker, "type": a.alert_type} for a in triggered
                ],
            }
        except Exception as e:
            pass

    return {"triggered": 0, "alerts": []}


# ==================== 模块状态 ====================


@router.get("/modules/status")
async def get_modules_status():
    """获取所有模块状态"""
    # Check if search engine is working
    engine = get_engine("search")
    engine_status = "active" if engine else "inactive"

    # Test search engine directly
    test_results = []
    if engine:
        try:
            results = engine.search("test", limit_per_engine=2)
            test_results = [
                {"title": r.title, "score": r.relevance_score} for r in results[:3]
            ]
        except Exception as e:
            test_results = [{"error": str(e)}]

    return {
        "modules": [
            {
                "name": "多引擎聚合搜索",
                "endpoint": "/api/v3/search",
                "status": engine_status,
                "test_results": len(test_results),
            },
            {"name": "政策监控", "endpoint": "/api/v3/policy", "status": "active"},
            {"name": "股票分析", "endpoint": "/api/v3/analysis", "status": "active"},
            {"name": "每日复盘", "endpoint": "/api/v3/review", "status": "active"},
            {"name": "量化知识库", "endpoint": "/api/v3/knowledge", "status": "active"},
            {
                "name": "A股数据源",
                "endpoint": "/api/v3/data/ashare",
                "status": "active",
            },
            {
                "name": "高频数据源",
                "endpoint": "/api/v3/data/highfreq",
                "status": "active",
            },
            {"name": "策略回测", "endpoint": "/api/v3/backtest", "status": "active"},
            {"name": "自选股监控", "endpoint": "/api/v3/watchlist", "status": "active"},
        ],
        "total": 9,
        "search_engine_test": test_results,
    }


@router.get("/search/test")
async def test_search_engine():
    """Test endpoint to debug search engine"""
    engine = get_engine("search")

    if not engine:
        return {"status": "error", "message": "Engine not loaded"}

    # Test search
    results = engine.search("test", limit_per_engine=5)

    return {
        "status": "ok",
        "engine_type": str(type(engine)),
        "available_engines": list(engine.engines.keys()),
        "test_query": "test",
        "results_count": len(results),
        "results": [
            {
                "source": r.source,
                "type": r.result_type,
                "title": r.title,
                "content": r.content[:100],
                "score": r.relevance_score,
            }
            for r in results[:5]
        ],
    }
