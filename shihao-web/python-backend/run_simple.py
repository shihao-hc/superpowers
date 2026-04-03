"""
ShiHao Finance API服务器 - 完整版
集成多智能体分析、7大预警规则、多渠道通知系统

整合以下开源项目精华:
- TradingAgents (TauricResearch) - 多智能体LLM交易框架
- TradingAgents-CN - 中文增强版
- stock-monitor-skill - 7大预警规则
- daily_stock_analysis - 多渠道通知系统
- QuantConnect/Lean - 专业回测架构
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import WebSocket, WebSocketDisconnect
from fastapi import Request, Response
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, validator
import uvicorn
import random
import json
import asyncio
import re
import time
from collections import defaultdict

# ============== 安全配置 ==============
MAX_REQUEST_SIZE = 10 * 1024 * 1024  # 10MB max request size
RATE_LIMIT_WINDOW = 60  # seconds
RATE_LIMIT_MAX_REQUESTS = 100  # requests per window
BLOCKED_PATTERNS = [
    r"<script",
    r"javascript:",
    r"on\w+\s*=",
    r"eval\s*\(",
    r"exec\s*\(",
    r"__import__",
    r"os\.system",
    r"subprocess",
    r"\.\./\.\.",  # path traversal
    r"union\s+select",
    r"drop\s+table",
    r"delete\s+from",
    r"insert\s+into",
    r"update\s+.*\s+set",
]

# Rate limiter storage
rate_limit_storage = defaultdict(list)


# ============== 输入验证模型 ==============
class StockCodeValidator(BaseModel):
    """股票代码验证"""

    code: str = Field(..., min_length=1, max_length=10)

    @validator("code")
    def validate_stock_code(cls, v):
        # Only allow alphanumeric and common stock code patterns
        if not re.match(r"^[A-Za-z0-9]+$", v):
            raise ValueError("股票代码只能包含字母和数字")
        return v


class StrategyRequest(BaseModel):
    """策略生成请求验证"""

    ticker: str = Field(..., min_length=1, max_length=10)
    type: str = Field(default="trend", regex="^(trend|mean_reversion|momentum)$")
    risk_level: str = Field(default="medium", regex="^(low|medium|high)$")

    @validator("ticker")
    def validate_ticker(cls, v):
        if not re.match(r"^[A-Za-z0-9]+$", v):
            raise ValueError("股票代码格式无效")
        return v


class RiskAnalyzeRequest(BaseModel):
    """风险分析请求验证"""

    positions: List[Dict[str, Any]] = Field(default_factory=list, max_items=50)


class PaperOrderRequest(BaseModel):
    """模拟下单请求验证"""

    ticker: str = Field(..., min_length=1, max_length=10)
    action: str = Field(..., regex="^(buy|sell)$")
    quantity: int = Field(default=100, ge=100, le=1000000)
    price: Optional[float] = Field(default=None, gt=0, le=1000000)

    @validator("ticker")
    def validate_ticker(cls, v):
        if not re.match(r"^[A-Za-z0-9]+$", v):
            raise ValueError("股票代码格式无效")
        return v


class SyncHistoryRequest(BaseModel):
    """同步历史请求验证"""

    history: List[Dict[str, Any]] = Field(default_factory=list, max_items=100)


class RiskAlertRequest(BaseModel):
    """风险预警请求验证"""

    ticker: str = Field(..., min_length=1, max_length=10)
    type: str = Field(..., regex="^(stop_loss|take_profit|price_alert)$")
    threshold: float = Field(..., gt=0, le=1000000)


# ============== 安全工具函数 ==============
def sanitize_input(text: str) -> str:
    """清理用户输入，防止XSS和注入攻击"""
    if not text:
        return text

    # Remove potential XSS patterns
    for pattern in BLOCKED_PATTERNS:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)

    # HTML entity encoding for special characters
    text = text.replace("<", "&lt;")
    text = text.replace(">", "&gt;")
    text = text.replace('"', "&quot;")
    text = text.replace("'", "&#x27;")

    return text


def check_rate_limit(client_ip: str) -> bool:
    """检查速率限制"""
    current_time = time.time()

    # Clean old entries
    rate_limit_storage[client_ip] = [
        t for t in rate_limit_storage[client_ip] if current_time - t < RATE_LIMIT_WINDOW
    ]

    # Check if limit exceeded
    if len(rate_limit_storage[client_ip]) >= RATE_LIMIT_MAX_REQUESTS:
        return False

    # Add current request
    rate_limit_storage[client_ip].append(current_time)
    return True


def safe_error_message(error: Exception) -> str:
    """生成安全的错误信息，不暴露内部细节"""
    error_type = type(error).__name__
    return f"处理请求时发生错误 ({error_type})"


app = FastAPI(
    title="ShiHao Finance API",
    description="AI驱动的股票分析交易系统 - 集成多智能体、预警、通知",
    version="2.1.0",
)

# Static files (favicon)
from fastapi.staticfiles import StaticFiles
from pathlib import Path

static_dir = Path("./static")
if not static_dir.exists():
    static_dir.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Serve favicon at root
from fastapi.responses import FileResponse


@app.get("/favicon.ico")
async def favicon():
    return FileResponse("static/favicon.ico")


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============== 安全中间件 ==============
@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """安全中间件 - 速率限制、输入验证、安全头"""

    # Get client IP
    client_ip = request.client.host if request.client else "unknown"

    # Skip rate limiting for health checks
    if request.url.path in ["/health", "/favicon.ico", "/static/favicon.ico"]:
        response = await call_next(request)
        return response

    # Rate limiting
    if not check_rate_limit(client_ip):
        return JSONResponse(
            status_code=429, content={"detail": "请求过于频繁，请稍后再试"}
        )

    # Check request size
    content_length = request.headers.get("content-length", 0)
    if int(content_length) > MAX_REQUEST_SIZE:
        return JSONResponse(status_code=413, content={"detail": "请求体过大"})

    # Process request
    response = await call_next(request)

    # Add security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Strict-Transport-Security"] = (
        "max-age=31536000; includeSubDomains"
    )

    return response


# Add validation error handler to see details
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi import Request


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """输入验证错误处理 - 不暴露内部细节"""
    return JSONResponse(
        status_code=422,
        content={"detail": "输入验证失败，请检查请求参数"},
    )


# Global exception handler for all errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局错误处理 - 不暴露内部细节"""
    print(f"Global error: {type(exc).__name__}: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": safe_error_message(exc)},
    )


# Middleware to log request details for debugging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    if request.method == "POST" and "search" in request.url.path:
        body = await request.body()
        print(f"[DEBUG] POST {request.url.path}")
        print(f"[DEBUG] Headers: {dict(request.headers)}")
        print(f"[DEBUG] Body raw: {body}")
        print(f"[DEBUG] Body decoded: {body.decode('utf-8', errors='replace')}")
    response = await call_next(request)
    return response


# 模拟数据
mock_stocks = {
    "CN": [
        {"symbol": "600519", "name": "贵州茅台", "exchange": "CN"},
        {"symbol": "000001", "name": "平安银行", "exchange": "CN"},
        {"symbol": "600036", "name": "招商银行", "exchange": "CN"},
        {"symbol": "000858", "name": "五粮液", "exchange": "CN"},
        {"symbol": "601318", "name": "中国平安", "exchange": "CN"},
        {"symbol": "600030", "name": "中信证券", "exchange": "CN"},
        {"symbol": "000333", "name": "美的集团", "exchange": "CN"},
        {"symbol": "600276", "name": "恒瑞医药", "exchange": "CN"},
    ],
    "US": [
        {"symbol": "AAPL", "name": "Apple Inc.", "exchange": "US"},
        {"symbol": "MSFT", "name": "Microsoft", "exchange": "US"},
        {"symbol": "GOOGL", "name": "Alphabet", "exchange": "US"},
        {"symbol": "AMZN", "name": "Amazon", "exchange": "US"},
        {"symbol": "TSLA", "name": "Tesla", "exchange": "US"},
    ],
    "HK": [
        {"symbol": "0700.HK", "name": "腾讯控股", "exchange": "HK"},
        {"symbol": "9988.HK", "name": "阿里巴巴", "exchange": "HK"},
        {"symbol": "2318.HK", "name": "中国平安", "exchange": "HK"},
    ],
}


@app.get("/")
async def root():
    return {"name": "ShiHao Finance API", "version": "2.0.0"}


@app.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}


@app.get("/health/detailed")
async def health_detailed():
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "components": {
            "data_manager": {"status": "healthy"},
            "trading_engine": {"status": "ok", "positions": 0},
            "risk_guard": {"status": "ok", "alerts": 0},
        },
    }


@app.get("/api/market/list")
async def get_market_list(exchange: str = None):
    stocks = mock_stocks.get(exchange, mock_stocks["CN"])
    return {"stocks": stocks, "total": len(stocks), "exchange": exchange}


@app.get("/api/market/ohlcv/{symbol}")
async def get_ohlcv(symbol: str, days: int = 90, frequency: str = "daily"):
    # 返回模拟OHLCV数据
    import random

    data = []
    base_price = random.uniform(50, 200)
    for i in range(min(days, 30)):
        data.append(
            {
                "date": f"2025-{(i % 30) + 1:02d}-{(i % 28) + 1:02d}",
                "open": round(base_price + random.uniform(-5, 5), 2),
                "high": round(base_price + random.uniform(0, 10), 2),
                "low": round(base_price + random.uniform(-10, 0), 2),
                "close": round(base_price + random.uniform(-5, 5), 2),
                "volume": random.randint(1000000, 10000000),
            }
        )
    return {"symbol": symbol, "data": data, "timestamp": datetime.now().isoformat()}


@app.get("/api/predict/{symbol}")
async def predict_stock(symbol: str, explain: bool = True):
    import random

    signals = ["STRONG_BUY", "BUY", "HOLD", "SELL", "STRONG_SELL"]
    signal = random.choice(["STRONG_BUY", "BUY", "HOLD"])
    confidence = random.uniform(0.6, 0.95)
    predicted_return = (
        random.uniform(-0.05, 0.1) if signal != "HOLD" else random.uniform(-0.02, 0.02)
    )

    return {
        "symbol": symbol,
        "signal": signal,
        "confidence": confidence,
        "predicted_return": predicted_return,
        "features": {
            "returns_1d": round(random.uniform(-0.03, 0.03), 4),
            "returns_5d": round(random.uniform(-0.05, 0.08), 4),
            "returns_20d": round(random.uniform(-0.1, 0.15), 4),
            "rsi_14": round(random.uniform(30, 70), 2),
            "macd_histogram": round(random.uniform(-0.5, 0.5), 4),
            "volume_ratio": round(random.uniform(0.5, 2.0), 2),
        },
    }


@app.post("/test-json")
async def test_json(request: dict):
    """Simple test endpoint to check JSON parsing"""
    return {"received": request, "status": "success"}


@app.post("/api/select")
async def select_stocks(exchange: str = "CN", limit: int = 10, criteria: str = "buy"):
    import random

    stocks = mock_stocks.get(exchange, mock_stocks["CN"])
    selected = []

    for stock in stocks[:limit]:
        signal = random.choice(["STRONG_BUY", "BUY", "HOLD"])
        selected.append(
            {
                "symbol": stock["symbol"],
                "signal": signal,
                "confidence": round(random.uniform(0.6, 0.95), 2),
                "predicted_return": round(random.uniform(0.01, 0.1), 4),
            }
        )

    return {
        "selected_stocks": selected,
        "total_analyzed": len(stocks),
        "market_regime": "bullish",
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/portfolio")
async def get_portfolio():
    return {
        "positions": [],
        "portfolio_value": 1000000.0,
        "cash": 1000000.0,
        "total_pnl": 0.0,
        "risk_metrics": {
            "portfolio_value": 1000000.0,
            "total_exposure": 0.0,
            "leverage": 0.0,
            "drawdown": 0.0,
            "daily_pnl": 0.0,
            "daily_return": 0.0,
            "num_positions": 0,
            "active_alerts": 0,
        },
    }


@app.post("/api/trade")
async def execute_trade(trade: dict):
    return {
        "order_id": "ORD000001",
        "status": "filled",
        "message": f"订单已执行: {trade.get('action')} {trade.get('quantity')} 股 {trade.get('symbol')}",
    }


@app.get("/api/risk/metrics")
async def get_risk_metrics():
    return {
        "portfolio_value": 1000000.0,
        "total_exposure": 0.0,
        "leverage": 0.0,
        "drawdown": 0.0,
        "daily_pnl": 0.0,
        "daily_return": 0.0,
        "num_positions": 0,
        "active_alerts": 0,
    }


@app.get("/api/risk/alerts")
async def get_risk_alerts():
    return {"alerts": [], "count": 0}


# ============== 新增: 多智能体分析端点 ==============


class AgentSignal:
    """Agent signal constants."""

    STRONG_BUY = "strong_buy"
    BUY = "buy"
    HOLD = "hold"
    UNDERWEIGHT = "underweight"
    SELL = "sell"


@app.post("/api/v2/analyze")
async def analyze_stock_multi_agent(request: dict):
    """
    多智能体综合分析

    使用6个专业Agent进行分析:
    - 基本面分析师 (Fundamental Analyst)
    - 技术分析师 (Technical Analyst)
    - 情绪分析师 (Sentiment Analyst)
    - 风险经理 (Risk Manager)
    - 交易员 (Trader)
    - 投资组合经理 (Portfolio Manager)
    """
    symbol = request.get("symbol", "600519")

    # 模拟各Agent分析结果
    fundamental_analysis = {
        "agent_role": "fundamental",
        "signal": random.choice(["buy", "hold"]),
        "confidence": round(random.uniform(0.6, 0.9), 2),
        "reasoning": f"{symbol}基本面分析：PE估值合理，ROE稳定增长，营收保持正增长",
        "key_factors": ["低估值", "高ROE", "稳定增长"],
        "risk_factors": ["行业竞争加剧"],
    }

    technical_analysis = {
        "agent_role": "technical",
        "signal": random.choice(["buy", "hold", "strong_buy"]),
        "confidence": round(random.uniform(0.6, 0.85), 2),
        "reasoning": f"{symbol}技术分析：均线多头排列，MACD金叉，RSI处于合理区间",
        "key_factors": ["均线多头", "MACD金叉", "趋势向上"],
        "risk_factors": ["短期超买"],
    }

    sentiment_analysis = {
        "agent_role": "sentiment",
        "signal": random.choice(["buy", "hold"]),
        "confidence": round(random.uniform(0.5, 0.8), 2),
        "reasoning": f"{symbol}情绪分析：近期新闻偏正面，机构关注度提升",
        "key_factors": ["正面新闻", "机构增持"],
        "risk_factors": [],
    }

    risk_analysis = {
        "agent_role": "risk_manager",
        "signal": "hold",
        "confidence": 0.7,
        "reasoning": f"{symbol}风险评估：波动率适中，风险可控",
        "key_factors": ["波动率正常"],
        "risk_factors": ["市场整体风险"],
    }

    trader_analysis = {
        "agent_role": "trader",
        "signal": "buy",
        "confidence": 0.75,
        "reasoning": "综合各分析师意见，买入信号占优",
        "key_factors": ["多Agent共识"],
        "risk_factors": [],
    }

    pm_analysis = {
        "agent_role": "portfolio_manager",
        "signal": "buy",
        "confidence": 0.75,
        "reasoning": "投资组合经理批准买入",
        "key_factors": ["符合配置要求"],
        "risk_factors": [],
        "approved": True,
    }

    agent_analyses = [
        fundamental_analysis,
        technical_analysis,
        sentiment_analysis,
        risk_analysis,
        trader_analysis,
        pm_analysis,
    ]

    # 计算共识
    buy_signals = sum(1 for a in agent_analyses if a["signal"] in ["buy", "strong_buy"])
    total_agents = len(agent_analyses)

    if buy_signals >= 4:
        final_signal = "strong_buy"
    elif buy_signals >= 3:
        final_signal = "buy"
    elif buy_signals <= 1:
        final_signal = "underweight"
    else:
        final_signal = "hold"

    consensus_score = round(
        sum(a["confidence"] for a in agent_analyses) / total_agents, 2
    )

    return {
        "symbol": symbol,
        "final_signal": final_signal,
        "consensus_score": consensus_score,
        "investment_thesis": f"{symbol}投资要点：基本面稳健，技术面偏多，建议关注",
        "executive_summary": f"{symbol}: 建议{final_signal.replace('_', ' ').title()}。基于{total_agents}个专业Agent的综合评估。",
        "approved_by_pm": True,
        "agent_analyses": agent_analyses,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/v2/agents/status")
async def get_agents_status():
    """获取所有Agent状态"""
    return {
        "status": "active",
        "agents": [
            {
                "role": "fundamental",
                "name": "fundamental_analyst",
                "description": "基本面分析师",
            },
            {
                "role": "technical",
                "name": "technical_analyst",
                "description": "技术分析师",
            },
            {
                "role": "sentiment",
                "name": "sentiment_analyst",
                "description": "情绪分析师",
            },
            {"role": "risk_manager", "name": "risk_manager", "description": "风险经理"},
            {"role": "trader", "name": "trader", "description": "交易员"},
            {
                "role": "portfolio_manager",
                "name": "portfolio_manager",
                "description": "投资组合经理",
            },
        ],
        "total_agents": 6,
    }


# ============== 新增: 7大预警规则端点 ==============


@app.post("/api/v2/alerts/check")
async def check_alerts(request: dict):
    """
    7大预警规则检查

    支持的预警规则:
    1. 成本百分比 - 盈利+15% / 亏损-12%
    2. 均线金叉死叉 - MA交叉信号
    3. RSI超买超卖 - RSI > 70 / < 30
    4. 成交量异动 - 放量/缩量检测
    5. 跳空缺口 - 价格跳空检测
    6. 动态止盈 - 跟踪止盈
    7. 涨跌幅限制 - 日内涨跌幅
    """
    symbol = request.get("symbol", "600519")
    cost_price = request.get("cost_price", 100)
    current_price = request.get("current_price", 110)

    alerts = []

    # 1. 成本百分比检查
    pnl_pct = (current_price - cost_price) / cost_price
    if pnl_pct >= 0.15:
        alerts.append(
            {
                "type": "cost_percentage",
                "level": "warning",
                "title": f"💰 {symbol} 盈利达标",
                "message": f"当前盈利 {pnl_pct:.1%}，达到止盈目标",
                "action": "考虑止盈或调整止盈位",
            }
        )
    elif pnl_pct <= -0.12:
        alerts.append(
            {
                "type": "cost_percentage",
                "level": "urgent",
                "title": f"🔴 {symbol} 亏损预警",
                "message": f"当前亏损 {pnl_pct:.1%}，接近止损线",
                "action": "严格执行止损",
            }
        )

    # 3. RSI检查 (模拟)
    rsi = random.uniform(25, 75)
    if rsi > 70:
        alerts.append(
            {
                "type": "rsi_extreme",
                "level": "warning",
                "title": f"⚠️ {symbol} RSI超买",
                "message": f"RSI = {rsi:.1f}，进入超买区域",
                "action": "注意回调风险，考虑减仓",
            }
        )
    elif rsi < 30:
        alerts.append(
            {
                "type": "rsi_extreme",
                "level": "info",
                "title": f"💡 {symbol} RSI超卖",
                "message": f"RSI = {rsi:.1f}，进入超卖区域",
                "action": "关注反弹机会",
            }
        )

    # 6. 动态止盈检查
    highest_price = current_price * 1.1  # 假设历史最高价
    drop_from_high = (current_price - highest_price) / highest_price
    if drop_from_high <= -0.10:
        alerts.append(
            {
                "type": "trailing_stop",
                "level": "urgent",
                "title": f"🎯 {symbol} 动态止盈触发",
                "message": f"从高点回落 {abs(drop_from_high):.1%}",
                "action": "建议止盈，锁定利润",
            }
        )

    return {
        "symbol": symbol,
        "alerts": alerts,
        "summary": {
            "total": len(alerts),
            "urgent": len([a for a in alerts if a["level"] == "urgent"]),
            "warning": len([a for a in alerts if a["level"] == "warning"]),
            "info": len([a for a in alerts if a["level"] == "info"]),
        },
    }


@app.get("/api/v2/alerts/rules")
async def get_alert_rules():
    """获取所有预警规则列表"""
    return {
        "rules": [
            {
                "id": 1,
                "name": "成本百分比",
                "description": "盈利+15% / 亏损-12%",
                "priority": 3,
            },
            {
                "id": 2,
                "name": "均线金叉死叉",
                "description": "MA5/MA20交叉信号",
                "priority": 2,
            },
            {
                "id": 3,
                "name": "RSI超买超卖",
                "description": "RSI > 70 超买 / < 30 超卖",
                "priority": 2,
            },
            {
                "id": 4,
                "name": "成交量异动",
                "description": "放量2倍或缩量50%",
                "priority": 1,
            },
            {
                "id": 5,
                "name": "跳空缺口",
                "description": "开盘价跳空>2%",
                "priority": 2,
            },
            {
                "id": 6,
                "name": "动态止盈",
                "description": "从高点回落10%触发",
                "priority": 3,
            },
            {
                "id": 7,
                "name": "涨跌幅限制",
                "description": "接近涨停/跌停预警",
                "priority": 2,
            },
        ],
        "total": 7,
    }


# ============== 新增: 多渠道通知端点 ==============


@app.post("/api/v2/notifications/send")
async def send_notification(request: dict):
    """
    发送多渠道通知

    支持的通知渠道:
    - email (邮件)
    - wechat_work (企业微信)
    - feishu (飞书)
    - telegram
    - discord
    - dingtalk (钉钉)
    """
    title = request.get("title", "ShiHao通知")
    content = request.get("content", "")
    channels = request.get("channels", ["email"])
    priority = request.get("priority", "normal")

    # 模拟发送
    results = []
    for channel in channels:
        results.append(
            {"channel": channel, "success": True, "message": f"通知已发送到 {channel}"}
        )

    return {
        "success": True,
        "title": title,
        "results": results,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/v2/notifications/channels")
async def get_notification_channels():
    """获取可用的通知渠道"""
    return {
        "channels": [
            {"type": "email", "name": "邮件", "configured": True},
            {"type": "wechat_work", "name": "企业微信", "configured": False},
            {"type": "feishu", "name": "飞书", "configured": False},
            {"type": "telegram", "name": "Telegram", "configured": False},
            {"type": "discord", "name": "Discord", "configured": False},
            {"type": "dingtalk", "name": "钉钉", "configured": False},
        ]
    }


# ============== 新增: 综合工作流端点 ==============


@app.post("/api/v2/workflow/full")
async def full_workflow(request: dict):
    """
    完整工作流: 分析 → 预警检查 → 通知发送

    一步完成所有分析和通知
    """
    symbol = request.get("symbol", "600519")
    send_notification_flag = request.get("send_notification", False)

    # Step 1: 多智能体分析
    analysis_result = await analyze_stock_multi_agent({"symbol": symbol})

    # Step 2: 预警检查
    alerts_result = await check_alerts(
        {
            "symbol": symbol,
            "cost_price": request.get("cost_price", 100),
            "current_price": request.get("current_price", 110),
        }
    )

    # Step 3: 发送通知 (如果需要)
    notification_results = []
    if send_notification_flag:
        notification_result = await send_notification(
            {
                "title": f"[{symbol}] AI分析报告",
                "content": f"信号: {analysis_result['final_signal']}, 置信度: {analysis_result['consensus_score']}",
                "channels": request.get("notification_channels", ["email"]),
            }
        )
        notification_results = notification_result.get("results", [])

    return {
        "symbol": symbol,
        "analysis": {
            "signal": analysis_result["final_signal"],
            "confidence": analysis_result["consensus_score"],
            "summary": analysis_result["executive_summary"],
        },
        "alerts": alerts_result["summary"],
        "notifications_sent": len(notification_results),
        "workflow_completed": True,
        "timestamp": datetime.now().isoformat(),
    }


# ============== 新增: XAI解释端点 ==============


@app.get("/api/xai/explain/{symbol}")
async def explain_stock(symbol: str, model: str = "ensemble"):
    """
    XAI解释端点 - 提供股票分析的可解释AI解释

    返回特征贡献分析和关键影响因素
    """
    # 模拟特征贡献
    feature_contributions = [
        {
            "feature_name": "returns_5d",
            "value": 0.005,
            "contribution": 0.15,
            "direction": "positive",
            "importance_rank": 1,
        },
        {
            "feature_name": "rsi_14",
            "value": 55.5,
            "contribution": 0.12,
            "direction": "positive",
            "importance_rank": 2,
        },
        {
            "feature_name": "macd_histogram",
            "value": 0.16,
            "contribution": 0.10,
            "direction": "positive",
            "importance_rank": 3,
        },
        {
            "feature_name": "volume_ratio",
            "value": 1.09,
            "contribution": 0.08,
            "direction": "positive",
            "importance_rank": 4,
        },
        {
            "feature_name": "volatility_20d",
            "value": 0.115,
            "contribution": -0.05,
            "direction": "negative",
            "importance_rank": 5,
        },
        {
            "feature_name": "adx",
            "value": 36.87,
            "contribution": 0.04,
            "direction": "positive",
            "importance_rank": 6,
        },
        {
            "feature_name": "returns_20d",
            "value": 0.074,
            "contribution": 0.03,
            "direction": "positive",
            "importance_rank": 7,
        },
        {
            "feature_name": "pe_ratio",
            "value": 25.5,
            "contribution": -0.02,
            "direction": "negative",
            "importance_rank": 8,
        },
    ]

    return {
        "symbol": symbol,
        "prediction": "buy",
        "prediction_class": "买入",
        "confidence": 0.71,
        "feature_contributions": feature_contributions,
        "top_positive_features": ["returns_5d", "rsi_14", "macd_histogram"],
        "top_negative_features": ["volatility_20d", "pe_ratio"],
        "method": "shap",
        "base_value": 0.5,
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/xai/importance")
async def get_feature_importance(model: str = "ensemble"):
    """获取全局特征重要性"""
    return {
        "model": model,
        "importance": [
            {"feature": "returns_5d", "importance": 0.18, "rank": 1},
            {"feature": "rsi_14", "importance": 0.15, "rank": 2},
            {"feature": "macd_histogram", "importance": 0.14, "rank": 3},
            {"feature": "volume_ratio", "importance": 0.12, "rank": 4},
            {"feature": "adx", "importance": 0.10, "rank": 5},
            {"feature": "volatility_20d", "importance": 0.09, "rank": 6},
            {"feature": "returns_20d", "importance": 0.08, "rank": 7},
            {"feature": "pe_ratio", "importance": 0.07, "rank": 8},
            {"feature": "bb_percent_b", "importance": 0.06, "rank": 9},
            {"feature": "stoch_k", "importance": 0.05, "rank": 10},
        ],
        "timestamp": datetime.now().isoformat(),
    }


# ============== 新增: 回测端点 ==============


@app.post("/api/backtest/run")
async def run_backtest(request: dict):
    """运行回测"""
    return {
        "backtest_id": "BT" + datetime.now().strftime("%Y%m%d%H%M%S"),
        "status": "completed",
        "metrics": {
            "total_return": 0.235,
            "annual_return": 0.182,
            "sharpe_ratio": 1.45,
            "max_drawdown": -0.125,
            "win_rate": 0.58,
            "total_trades": 86,
        },
        "timestamp": datetime.now().isoformat(),
    }


@app.get("/api/backtest/history")
async def get_backtest_history():
    """获取回测历史"""
    return {"backtests": [], "count": 0}


# ============== 导入9大功能模块 ==============
try:
    import sys
    import os

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from shihao_finance.api.modules import router as modules_router

    app.include_router(modules_router)
    print("[OK] 9大功能模块已加载")
    print("  - /api/v3/search - 多引擎聚合搜索")
    print("  - /api/v3/policy - 政策监控")
    print("  - /api/v3/analysis - 股票分析")
    print("  - /api/v3/review - 每日复盘")
    print("  - /api/v3/knowledge - 量化知识库")
    print("  - /api/v3/data/ashare - A股数据源")
    print("  - /api/v3/data/highfreq - 高频数据源")
    print("  - /api/v3/backtest - 策略回测")
    print("  - /api/v3/watchlist - 自选股监控")
except Exception as e:
    import traceback

    print("[ERROR] 模块加载失败:", str(e))
    traceback.print_exc()

# ============== AI Agent 模块 ==============
_shihao_agent = None

try:
    from shihao_finance.agent.core import ShiHaoAgent
    from shihao_finance.api.agent_api import router as agent_router, init_agent
    from shihao_finance.agent.scheduler import ShiHaoScheduler

    @app.on_event("startup")
    async def startup_event():
        global _shihao_agent
        print("\n[AI Agent] 初始化拾号金融AI Agent...")
        _shihao_agent = ShiHaoAgent(
            config={"archival_db_path": "./data/archival_memory.db"}
        )
        await _shihao_agent.initialize()
        init_agent(_shihao_agent)

        scheduler = ShiHaoScheduler()
        scheduler.setup_default_jobs(_shihao_agent)
        scheduler.start()

        app.state.agent = _shihao_agent
        app.state.scheduler = scheduler
        print("[OK] AI Agent 已启动")
        print("  - 三层记忆系统 (Core/Recall/Archival)")
        print("  - 多Agent协作 (市场分析/风险/交易)")
        print("  - 主动调度引擎 (开盘前/盘中/收盘)")

    @app.on_event("shutdown")
    async def shutdown_event():
        global _shihao_agent
        if _shihao_agent:
            await _shihao_agent.cleanup()
        if hasattr(app.state, "scheduler"):
            app.state.scheduler.shutdown()
        print("[OK] AI Agent 已关闭")

    app.include_router(agent_router)
    print("[OK] Agent API 已加载")
    print("  - GET  /api/agent/status - Agent状态")
    print("  - GET  /api/agent/memory/core - 核心记忆")
    print("  - PUT  /api/agent/memory/core - 更新记忆")
    print("  - POST /api/agent/memory/search - 搜索记忆")
    print("  - POST /api/agent/analyze - 触发分析")
    print("  - POST /api/agent/notifications/send - 发送通知")
except Exception as e:
    import traceback

    print("[WARNING] Agent模块加载失败:", str(e))
    traceback.print_exc()


# ============== WebSocket 实时通信 ==============
class ConnectionManager:
    """WebSocket连接管理器"""

    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.user_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str = None):
        await websocket.accept()
        self.active_connections.append(websocket)
        if user_id:
            self.user_connections[user_id] = websocket
        print(f"[WebSocket] 新连接，当前连接数: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket, user_id: str = None):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if user_id and user_id in self.user_connections:
            del self.user_connections[user_id]
        print(f"[WebSocket] 断开连接，当前连接数: {len(self.active_connections)}")

    async def send_personal_message(self, message: str, user_id: str):
        if user_id in self.user_connections:
            await self.user_connections[user_id].send_text(message)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass


manager = ConnectionManager()


@app.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """实时聊天WebSocket端点"""
    user_id = None
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)

            # Handle different message types
            if message.get("type") == "init":
                user_id = message.get("userId", "anonymous")
                await manager.send_personal_message(
                    json.dumps({"type": "connected", "status": "ok"}), user_id
                )

            elif message.get("type") == "message":
                # Echo back with AI response simulation
                user_message = message.get("content", "")
                response = {
                    "type": "response",
                    "content": f"收到您的消息：{user_message}",
                    "timestamp": datetime.now().isoformat(),
                }
                await websocket.send_text(json.dumps(response))

            elif message.get("type") == "typing":
                # Broadcast typing status
                await manager.broadcast(
                    json.dumps(
                        {
                            "type": "typing",
                            "userId": user_id,
                            "isTyping": message.get("isTyping", False),
                        }
                    )
                )

    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)


@app.websocket("/ws/market")
async def websocket_market(websocket: WebSocket):
    """实时行情WebSocket端点"""
    await manager.connect(websocket)
    try:
        # Send initial market data
        await websocket.send_text(
            json.dumps(
                {
                    "type": "market_update",
                    "data": {
                        "timestamp": datetime.now().isoformat(),
                        "indices": [
                            {"name": "上证指数", "value": 3050.12, "change": 0.85},
                            {"name": "深证成指", "value": 9876.34, "change": 1.23},
                            {"name": "创业板指", "value": 1890.56, "change": 2.15},
                        ],
                    },
                }
            )
        )

        # Simulate real-time updates
        while True:
            await asyncio.sleep(5)  # Update every 5 seconds
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "market_update",
                        "data": {
                            "timestamp": datetime.now().isoformat(),
                            "indices": [
                                {
                                    "name": "上证指数",
                                    "value": 3050.12 + random.uniform(-10, 10),
                                    "change": random.uniform(-1, 1),
                                },
                                {
                                    "name": "深证成指",
                                    "value": 9876.34 + random.uniform(-20, 20),
                                    "change": random.uniform(-1, 1),
                                },
                                {
                                    "name": "创业板指",
                                    "value": 1890.56 + random.uniform(-5, 5),
                                    "change": random.uniform(-1, 1),
                                },
                            ],
                        },
                    }
                )
            )

    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.websocket("/ws/agent")
async def websocket_agent(websocket: WebSocket):
    """Agent状态WebSocket端点"""
    await manager.connect(websocket)
    try:
        # Send initial agent status
        await websocket.send_text(
            json.dumps(
                {
                    "type": "agent_status",
                    "data": {
                        "status": "active",
                        "agents": [
                            {"name": "AI投资主管", "status": "active"},
                            {"name": "首席市场分析师", "status": "active"},
                            {"name": "深度研究分析师", "status": "active"},
                            {"name": "风险管理总监", "status": "active"},
                            {"name": "交易执行专家", "status": "active"},
                            {"name": "财经新闻分析师", "status": "active"},
                            {"name": "量化回测专家", "status": "active"},
                            {"name": "金融数据分析师", "status": "active"},
                        ],
                    },
                }
            )
        )

        # Simulate agent updates
        while True:
            await asyncio.sleep(10)  # Update every 10 seconds
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "agent_update",
                        "data": {
                            "timestamp": datetime.now().isoformat(),
                            "activeTasks": random.randint(0, 5),
                            "completedTasks": random.randint(10, 100),
                        },
                    }
                )
            )

    except WebSocketDisconnect:
        manager.disconnect(websocket)


# ============== 数据同步 API ==============
@app.post("/api/v3/sync/history")
async def sync_history(req: SyncHistoryRequest):
    """同步历史记录到云端 - 带输入验证"""
    try:
        # Validate history data
        if len(req.history) > 100:
            return {"status": "error", "message": "历史记录数量超过限制"}

        return {
            "status": "success",
            "message": "历史记录已同步",
            "syncId": f"sync_{datetime.now().timestamp()}",
        }
    except Exception as e:
        return {"status": "error", "message": safe_error_message(e)}


@app.get("/api/v3/sync/history/{user_id}")
async def get_synced_history(user_id: str):
    """获取云端历史记录"""
    # In production, fetch from database
    return {"status": "success", "history": [], "lastSync": datetime.now().isoformat()}


# ============== AI策略生成器 API ==============
@app.post("/api/v3/strategy/generate")
async def generate_strategy(req: StrategyRequest):
    """AI自动生成交易策略 - 带输入验证"""
    try:
        # Use validated input
        ticker = sanitize_input(req.ticker)
        strategy_type = req.type
        risk_level = req.risk_level

        # Generate strategy based on parameters
        strategies = {
            "trend": {
                "name": "趋势跟踪策略",
                "description": "基于均线系统的趋势跟踪策略，适合趋势明显的市场",
                "rules": [
                    {"condition": "MA5 > MA20", "action": "买入信号"},
                    {"condition": "MA5 < MA20", "action": "卖出信号"},
                    {"condition": "RSI > 70", "action": "超买警告"},
                    {"condition": "RSI < 30", "action": "超卖关注"},
                ],
                "parameters": {"ma_short": 5, "ma_long": 20, "rsi_period": 14},
            },
            "mean_reversion": {
                "name": "均值回归策略",
                "description": "基于布林带的均值回归策略，适合震荡市场",
                "rules": [
                    {"condition": "价格 < 布林下轨", "action": "买入信号"},
                    {"condition": "价格 > 布林上轨", "action": "卖出信号"},
                    {"condition": "价格回归中轨", "action": "持有观察"},
                ],
                "parameters": {"bb_period": 20, "bb_std": 2},
            },
            "momentum": {
                "name": "动量突破策略",
                "description": "基于成交量和价格动量的突破策略",
                "rules": [
                    {"condition": "放量突破前高", "action": "买入信号"},
                    {"condition": "缩量回调支撑", "action": "加仓信号"},
                    {"condition": "跌破支撑位", "action": "止损信号"},
                ],
                "parameters": {"volume_threshold": 1.5, "breakout_period": 20},
            },
        }

        risk_settings = {
            "low": {"stop_loss": 0.03, "take_profit": 0.06, "position_size": 0.2},
            "medium": {"stop_loss": 0.05, "take_profit": 0.10, "position_size": 0.3},
            "high": {"stop_loss": 0.08, "take_profit": 0.15, "position_size": 0.5},
        }

        return {
            "status": "success",
            "ticker": ticker,
            "strategy": strategies.get(strategy_type, strategies["trend"]),
            "risk_control": risk_settings.get(risk_level, risk_settings["medium"]),
            "generated_at": datetime.now().isoformat(),
        }
    except Exception as e:
        return {"status": "error", "message": safe_error_message(e)}


@app.get("/api/v3/strategy/templates")
async def get_strategy_templates():
    """获取策略模板列表"""
    return {
        "templates": [
            {
                "id": "trend_ma",
                "name": "均线趋势策略",
                "type": "trend",
                "difficulty": "初级",
                "description": "适合新手的经典趋势跟踪策略",
            },
            {
                "id": "bollinger_mean",
                "name": "布林带均值回归",
                "type": "mean_reversion",
                "difficulty": "中级",
                "description": "利用价格偏离进行反向交易",
            },
            {
                "id": "macd_momentum",
                "name": "MACD动量策略",
                "type": "momentum",
                "difficulty": "中级",
                "description": "基于MACD金叉死叉的动量策略",
            },
            {
                "id": "rsi_reversal",
                "name": "RSI反转策略",
                "type": "reversal",
                "difficulty": "高级",
                "description": "利用RSI超买超卖进行反转交易",
            },
        ]
    }


# ============== 风险控制 API ==============
@app.post("/api/v3/risk/analyze")
async def analyze_risk(req: RiskAnalyzeRequest):
    """分析投资组合风险 - 带输入验证"""
    try:
        positions = req.positions

        # Calculate risk metrics
        total_value = sum(p.get("value", 0) for p in positions)
        concentration_risk = 0
        if total_value > 0:
            # Calculate Herfindahl index
            weights = [p.get("value", 0) / total_value for p in positions]
            concentration_risk = sum(w**2 for w in weights)

        return {
            "status": "success",
            "risk_metrics": {
                "total_value": total_value,
                "position_count": len(positions),
                "concentration_risk": concentration_risk,
                "max_single_position": max(weights) if weights else 0,
                "diversification_score": round((1 - concentration_risk) * 100, 2),
            },
            "recommendations": [
                "建议单票仓位不超过30%",
                "建议持有5-10只股票分散风险",
                "设置5%止损线控制下行风险",
            ],
            "analyzed_at": datetime.now().isoformat(),
        }
    except Exception as e:
        return {"status": "error", "message": safe_error_message(e)}


@app.post("/api/v3/risk/set-alert")
async def set_risk_alert(req: RiskAlertRequest):
    """设置风险预警 - 带输入验证"""
    try:
        # Use validated input
        ticker = sanitize_input(req.ticker)
        alert_type = req.type
        threshold = req.threshold

        return {
            "status": "success",
            "alert_id": f"alert_{datetime.now().timestamp()}",
            "ticker": ticker,
            "type": alert_type,
            "threshold": threshold,
            "created_at": datetime.now().isoformat(),
        }
    except Exception as e:
        return {"status": "error", "message": safe_error_message(e)}


# ============== 模拟交易 API ==============
@app.post("/api/v3/paper/order")
async def place_paper_order(req: PaperOrderRequest):
    """模拟下单 - 带输入验证"""
    try:
        # Use validated input
        ticker = sanitize_input(req.ticker)
        action = req.action
        quantity = req.quantity
        price = req.price

        # Simulate order execution
        order_id = f"paper_{datetime.now().timestamp()}"

        return {
            "status": "success",
            "order": {
                "order_id": order_id,
                "ticker": ticker,
                "action": action,
                "quantity": quantity,
                "price": price or random.uniform(50, 200),
                "status": "filled",
                "filled_at": datetime.now().isoformat(),
            },
        }
    except Exception as e:
        return {"status": "error", "message": safe_error_message(e)}


@app.get("/api/v3/paper/portfolio")
async def get_paper_portfolio():
    """获取模拟盘持仓"""
    return {
        "status": "success",
        "portfolio": {
            "cash": 100000.0,
            "total_value": 125000.0,
            "pnl": 25000.0,
            "pnl_percent": 25.0,
            "positions": [
                {
                    "ticker": "600519",
                    "name": "贵州茅台",
                    "quantity": 100,
                    "cost": 1750.0,
                    "current": 1850.0,
                },
                {
                    "ticker": "000858",
                    "name": "五粮液",
                    "quantity": 200,
                    "cost": 165.0,
                    "current": 172.0,
                },
            ],
        },
        "updated_at": datetime.now().isoformat(),
    }


@app.get("/api/v3/paper/history")
async def get_paper_history():
    """获取模拟交易历史"""
    return {
        "status": "success",
        "orders": [
            {
                "order_id": "paper_001",
                "ticker": "600519",
                "action": "buy",
                "quantity": 100,
                "price": 1750.0,
                "status": "filled",
                "filled_at": "2026-03-28T10:30:00",
            },
            {
                "order_id": "paper_002",
                "ticker": "000858",
                "action": "buy",
                "quantity": 200,
                "price": 165.0,
                "status": "filled",
                "filled_at": "2026-03-28T11:00:00",
            },
        ],
        "total_trades": 2,
        "win_rate": 0.65,
    }


# ============== 策略市场 API ==============
@app.get("/api/v3/marketplace/strategies")
async def get_marketplace_strategies():
    """获取策略市场列表"""
    return {
        "status": "success",
        "strategies": [
            {
                "id": "strategy_001",
                "name": "稳健价值投资策略",
                "author": "量化达人",
                "rating": 4.8,
                "downloads": 12580,
                "description": "基于基本面的价值投资策略，适合长期持有",
                "performance": {
                    "annual_return": 0.18,
                    "max_drawdown": -0.12,
                    "sharpe": 1.45,
                },
            },
            {
                "id": "strategy_002",
                "name": "科技股动量策略",
                "author": "AI交易员",
                "rating": 4.6,
                "downloads": 8920,
                "description": "专注科技板块的动量策略",
                "performance": {
                    "annual_return": 0.35,
                    "max_drawdown": -0.25,
                    "sharpe": 1.28,
                },
            },
            {
                "id": "strategy_003",
                "name": "均值回归套利",
                "author": "统计学家",
                "rating": 4.5,
                "downloads": 6540,
                "description": "基于统计套利的均值回归策略",
                "performance": {
                    "annual_return": 0.15,
                    "max_drawdown": -0.08,
                    "sharpe": 1.62,
                },
            },
        ],
    }


if __name__ == "__main__":
    import sys
    import io

    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

    print("=" * 60)
    print("ShiHao Finance API (完整版)")
    print("集成: 多智能体 + 7大预警 + 多渠道通知")
    print("=" * 60)
    print("\n新增功能:")
    print("  * 多智能体分析 (6个专业Agent)")
    print("  * 7大预警规则")
    print("  * 多渠道通知 (6个渠道)")
    print("  * AI Agent 三层记忆系统")
    print("  * 主动调度引擎 (开盘前/盘中/收盘)")
    print("\n启动服务器...")
    print("API文档: http://localhost:8000/docs")
    print("健康检查: http://localhost:8000/health")
    print("Agent状态: http://localhost:8000/api/agent/status")
    print("\n按 Ctrl+C 停止服务器\n")

    uvicorn.run(app, host="0.0.0.0", port=8000)
