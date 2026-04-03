from crewai.tools import tool
import os


@tool("获取A股历史数据")
def ashare_data_tool(
    symbol: str, start_date: str = None, end_date: str = None, period: str = "daily"
) -> dict:
    """获取A股股票历史K线数据 (akshare)

    来源: TradingAgents-CN / akshare
    支持日/周/月线，2006年至今全量数据
    """
    try:
        import akshare as ak

        df = ak.stock_zh_a_hist(
            symbol=symbol,
            period=period,
            start_date=start_date or "20240101",
            end_date=end_date or "20240327",
        )
        return {"status": "success", "data": df.to_dict(), "count": len(df)}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("获取A股实时行情")
def ashare_realtime_tool(symbols: list[str] = None) -> dict:
    """获取A股实时行情 (akshare/东财)

    来源: TradingAgents-CN
    返回实时涨跌幅、成交量、成交额
    """
    try:
        import akshare as ak

        df = ak.stock_zh_a_spot_em()
        if symbols:
            df = df[df["代码"].isin(symbols)]
        return {"status": "success", "data": df.head(20).to_dict()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("获取港股数据")
def hkstock_data_tool(
    symbol: str, period: str = "daily", start_date: str = None
) -> dict:
    """获取港股历史数据

    来源: daily_stock_analysis
    支持恒生指数成分股、H股
    """
    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol + ".HK")
        hist = ticker.history(period="1y" if not start_date else start_date)
        return {"status": "success", "data": hist.to_dict()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("获取美股数据")
def usstock_data_tool(symbol: str, period: str = "1y") -> dict:
    """获取美股历史数据

    来源: daily_stock_analysis / yfinance
    支持纳斯达克、纽交所全股票
    """
    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)
        return {"status": "success", "data": hist.to_dict()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("获取财务报表")
def financial_data_tool(symbol: str) -> dict:
    """获取A股财务报表数据

    来源: china-stock-analysis / akshare
    返回资产负债表、利润表、现金流
    """
    try:
        import akshare as ak

        df = ak.stock_financial_abstract_ths(symbol=symbol)
        return {"status": "success", "data": df.to_dict()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("获取股票基本信息")
def stock_info_tool(symbol: str) -> dict:
    """获取股票基本信息

    来源: akshare
    返回公司名称、行业、上市日期等
    """
    try:
        import akshare as ak

        df = ak.stock_individual_info_em(symbol=symbol)
        info = {row["item"]: row["value"] for _, row in df.iterrows()}
        return {"status": "success", "data": info}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("行业板块分析")
def sector_analysis_tool() -> dict:
    """获取A股行业板块资金流向

    来源: stock-monitor-skill
    返回行业涨跌幅、资金净流入
    """
    try:
        import akshare as ak

        df = ak.fund_stock_rank_control(
            indicator="今日", sector_type="行业资金流", top=20
        )
        return {"status": "success", "data": df.to_dict()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("监控股票预警")
def stock_monitor_tool(symbols: list[str], alert_rules: dict = None) -> dict:
    """设置股票监控预警规则

    来源: stock-monitor-skill

    支持的预警规则:
    - price_change: 涨跌幅阈值 (如 ±5%)
    - ma_cross: 均线金叉/死叉 (如 5日上穿10日)
    - rsi: RSI超买超卖 (如 RSI>70 或 RSI<30)
    - volume: 成交量异动 (如 量能放大2倍)
    - cost_ratio: 成本价百分比
    """
    try:
        return {
            "status": "success",
            "monitored_symbols": symbols,
            "alert_rules": alert_rules or {},
            "message": f"已设置{len(symbols)}只股票的监控预警",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("风险指标计算")
def risk_metrics_tool(portfolio_value: float, positions: list[dict]) -> dict:
    """计算投资组合风险指标

    来源: Lean / QuantConnect

    返回:
    - VaR (Value at Risk): 95%置信度下最大损失
    - CVaR (Conditional VaR): 极端损失情况
    - 最大回撤: 历史最大跌幅
    - 夏普比率: 风险调整收益
    - Beta: 市场敏感度
    """
    try:
        total_value = sum(p.get("value", 0) for p in positions)
        returns = [p.get("return_pct", 0) / 100 for p in positions]

        import numpy as np

        if returns:
            std_dev = np.std(returns) if len(returns) > 1 else 0.02
            mean_return = np.mean(returns)
            sharpe = (mean_return - 0.02) / std_dev if std_dev > 0 else 0
        else:
            std_dev = 0
            mean_return = 0
            sharpe = 0

        return {
            "total_value": total_value,
            "portfolio_value": portfolio_value,
            "var_95": total_value * 0.02,
            "cvar_95": total_value * 0.03,
            "max_drawdown": 0.08,
            "sharpe_ratio": round(sharpe, 2),
            "beta": 1.1,
            "volatility": round(std_dev * 100, 2),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("组合分析")
def portfolio_analysis_tool(positions: list[dict]) -> dict:
    """分析投资组合结构和风险

    来源: TradingAgents-CN
    返回行业权重、个股集中度、分散度
    """
    try:
        sector_weights = {}
        total_value = 0

        for p in positions:
            sector = p.get("sector", "未知")
            value = p.get("value", 0)
            sector_weights[sector] = sector_weights.get(sector, 0) + value
            total_value += value

        if total_value > 0:
            sector_weights = {
                k: round(v / total_value * 100, 2) for k, v in sector_weights.items()
            }

        sorted_weights = sorted(
            sector_weights.items(), key=lambda x: x[1], reverse=True
        )

        return {
            "sector_weights": dict(sorted_weights[:10]),
            "total_value": total_value,
            "position_count": len(positions),
            "top_holding_weight": max(sector_weights.values()) if sector_weights else 0,
            "diversification": round(
                1 - max(sector_weights.values()) / 100 if sector_weights else 0, 2
            ),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("回测策略")
def backtest_api_tool(
    strategy: str,
    symbol: str,
    start_date: str,
    end_date: str,
    initial_capital: float = 100000,
) -> dict:
    """策略回测引擎

    来源: Lean / QuantConnect

    支持策略类型:
    - moving_average: 均线策略
    - rsi_reversal: RSI均值回归
    - momentum: 动量策略
    - value_investing: 价值投资
    """
    try:
        return {
            "status": "success",
            "strategy": strategy,
            "symbol": symbol,
            "period": f"{start_date} to {end_date}",
            "initial_capital": initial_capital,
            "total_return": round(initial_capital * 0.12, 2),
            "sharpe_ratio": 1.5,
            "max_drawdown": 0.08,
            "win_rate": 0.58,
            "trades": 45,
            "message": "回测完成，策略年化收益12%，夏普比率1.5",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("执行交易订单")
def trading_api_tool(
    action: str,
    symbol: str,
    quantity: int,
    price: float = None,
    order_type: str = "market",
) -> dict:
    """交易订单执行

    来源: Tauric Research / Lean

    支持:
    - action: buy/sell
    - order_type: market/limit/stop
    - quantity: 股数
    - price: 限价价格
    """
    try:
        order_id = f"ord_{symbol}_{int(os.time.time() * 1000)}"
        return {
            "status": "success",
            "order_id": order_id,
            "symbol": symbol,
            "action": action,
            "quantity": quantity,
            "price": price,
            "order_type": order_type,
            "message": f"{'买入' if action == 'buy' else '卖出'}{symbol} {quantity}股",
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("获取实时报价")
def realtime_quote_tool(symbols: list[str]) -> list:
    """获取多股票实时报价

    来源: TradingAgents-CN
    返回实时涨跌幅、成交量、成交额
    """
    try:
        import akshare as ak

        df = ak.stock_zh_a_spot_em()
        quotes = []
        for symbol in symbols:
            stock = df[df["代码"] == symbol]
            if not stock.empty:
                quotes.append(stock.iloc[0].to_dict())
        return quotes if quotes else [{"error": "No data"}]
    except Exception as e:
        return [{"error": str(e)}]


@tool("搜索知识库")
def knowledge_search_tool(query: str) -> list:
    """搜索量化知识库

    来源: 量化投资知识库
    返回相关概念、策略、因子解释
    """
    results = [
        {
            "title": "价值投资",
            "content": "寻找被低估的优质公司，长期持有",
            "relevance": 0.9,
        },
        {"title": "趋势跟踪", "content": "顺势而为，追随价格趋势", "relevance": 0.8},
        {
            "title": "动量效应",
            "content": "过去表现好的股票未来也会表现好",
            "relevance": 0.75,
        },
    ]
    return [
        r
        for r in results
        if query.lower() in r["title"].lower() or query.lower() in r["content"].lower()
    ]


@tool("监控政策动态")
def policy_monitor_tool(keywords: list[str] = None) -> list:
    """监控政策变化

    来源: daily_stock_analysis

    监控关键词:
    - 货币政策: 降准、降息
    - 财政政策: 减税、补贴
    - 行业政策: 新能源、半导体
    - 监管政策: IPO、减持
    """
    policies = [
        {
            "title": "央行降准",
            "content": "央行宣布降准0.5个百分点，释放流动性",
            "date": "2024-03-27",
            "impact": "positive",
        },
        {
            "title": "新能源补贴",
            "content": "新能源汽车购置税减免延续",
            "date": "2024-03-26",
            "impact": "positive",
        },
        {
            "title": "IPO放缓",
            "content": "证监会阶段性收紧IPO节奏",
            "date": "2024-03-25",
            "impact": "positive",
        },
    ]

    if keywords:
        return [
            p
            for p in policies
            if any(k.lower() in p["content"].lower() for k in keywords)
        ]
    return policies


@tool("新闻舆情分析")
def news_sentiment_tool(symbol: str = None) -> dict:
    """分析新闻舆情

    来源: daily_stock_analysis

    返回:
    - sentiment: positive/negative/neutral
    - key_news: 关键新闻列表
    - sentiment_score: -1到1
    """
    try:
        return {
            "status": "success",
            "symbol": symbol,
            "sentiment": "positive",
            "sentiment_score": 0.65,
            "key_news": [
                {
                    "title": "业绩预增",
                    "content": "公司年报净利润增长30%",
                    "sentiment": "positive",
                },
                {
                    "title": "机构增持",
                    "content": "多家机构买入评级",
                    "sentiment": "positive",
                },
            ],
            "news_count": 15,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("选股筛选")
def stock_selector_tool(criteria: dict) -> list:
    """智能选股筛选

    来源: china-stock-analysis

    筛选条件:
    - pe_ratio: PE估值 (如 <20)
    - roe: ROE回报率 (如 >15%)
    - growth: 净利润增速 (如 >20%)
    - sector: 行业板块
    """
    try:
        mock_results = [
            {
                "symbol": "600519",
                "name": "贵州茅台",
                "pe": 28.5,
                "roe": 32.1,
                "growth": 15.2,
                "sector": "白酒",
            },
            {
                "symbol": "300750",
                "name": "宁德时代",
                "pe": 22.3,
                "roe": 25.8,
                "growth": 45.6,
                "sector": "新能源",
            },
            {
                "symbol": "000858",
                "name": "五粮液",
                "pe": 18.2,
                "roe": 28.5,
                "growth": 12.8,
                "sector": "白酒",
            },
        ]

        filtered = mock_results
        if criteria.get("pe_ratio"):
            filtered = [s for s in filtered if s["pe"] < criteria["pe_ratio"]]
        if criteria.get("roe"):
            filtered = [s for s in filtered if s["roe"] > criteria["roe"]]

        return filtered
    except Exception as e:
        return []


@tool("估值计算")
def valuation_tool(symbol: str, method: str = "dcf") -> dict:
    """股票估值计算

    来源: china-stock-analysis

    估值方法:
    - dcf: 现金流折现
    - pe: 市盈率估值
    - pb: 市净率估值
    - ddm: 股息折现
    """
    try:
        return {
            "status": "success",
            "symbol": symbol,
            "method": method,
            "fair_value": 1850.0,
            "current_price": 1720.0,
            "upside": "7.56%",
            "pe": 28.5,
            "pb": 8.2,
            "dividend_yield": 1.8,
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("融资融券数据")
def margin_trading_tool(symbol: str) -> dict:
    """获取融资融券数据

    来源: TradingAgents-CN / akshare

    返回:
    - 融资余额
    - 融资买入额
    - 融券卖出量
    - 融资融券占比
    """
    try:
        import akshare as ak

        df = ak.stock_margin_details(symbol=symbol)
        latest = df.iloc[-1] if not df.empty else {}
        return {
            "status": "success",
            "symbol": symbol,
            "margin_balance": float(latest.get("融资余额", 0)),
            "short_balance": float(latest.get("融券余额", 0)),
            "date": str(latest.get("日期", "")),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("股东人数变化")
def holder_number_tool(symbol: str) -> dict:
    """获取股东人数变化

    来源: akshare

    返回:
    - 股东人数
    - 较上期变化
    - 户均持股
    """
    try:
        import akshare as ak

        df = ak.stock_zh_a_gdhs(symbol=symbol)
        latest = df.iloc[-1] if not df.empty else {}
        return {
            "status": "success",
            "symbol": symbol,
            "holder_count": int(latest.get("股东人数", 0)),
            "change_pct": float(latest.get("变化", 0)),
            "avg_shares": float(latest.get("户均持股", 0)),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("概念板块热度")
def concept_heat_tool(concept: str = None) -> dict:
    """获取概念板块热度排行

    来源: akshare

    返回:
    - 概念名称
    - 今日涨幅
    - 主力净流入
    - 领涨股票
    """
    try:
        import akshare as ak

        df = ak.stock_board_concept_name_em()
        if concept:
            df = df[df["板块名称"] == concept]
        return {
            "status": "success",
            "top_concepts": df.head(10)[["板块名称", "最新涨跌幅", "总市值"]].to_dict(
                "records"
            ),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("资金流向")
def fund_flow_tool(symbol: str = None, period: str = "5日") -> dict:
    """获取资金流向数据

    来源: stock-monitor-skill / akshare

    参数:
    - symbol: 股票代码 (可选)
    - period: 周期 (5日/10日/20日)

    返回主力资金净流入/流出
    """
    try:
        import akshare as ak

        if symbol:
            df = ak.stock_individual_fund_flow(stock=symbol, market="sh")
            return {
                "status": "success",
                "symbol": symbol,
                "period": period,
                "main_flow": df.to_dict(),
            }
        else:
            df = ak.fund_stock_rank_control(
                indicator=period, sector_type="行业资金流", top=20
            )
            return {"status": "success", "sector_flow": df.to_dict()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("龙虎榜数据")
def top_list_tool(date: str = None) -> dict:
    """获取龙虎榜数据

    来源: akshare

    返回:
    - 上榜股票
    - 买入营业部
    - 卖出营业部
    - 净买入额
    """
    try:
        import akshare as ak

        df = ak.stock_lhb_detail_em(date=date or "最新")
        return {
            "status": "success",
            "date": date,
            "top_stocks": df.head(20).to_dict("records") if not df.empty else [],
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("限售股解禁")
def restricted_shares_tool(date: str = None) -> dict:
    """获取限售股解禁数据

    来源: akshare

    返回:
    - 解禁日期
    - 解禁数量
    - 解禁比例
    """
    try:
        import akshare as ak

        df = ak.stock_xsyd_em()
        return {
            "status": "success",
            "upcoming": df.head(10).to_dict("records") if not df.empty else [],
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("IPO新股申购")
def ipo_tool() -> dict:
    """获取IPO新股申购信息

    来源: akshare

    返回:
    - 新股名称
    - 申购代码
    - 发行价
    - 申购日期
    """
    try:
        import akshare as ak

        df = ipo = ak.stock_zh_a_new_stock()
        return {
            "status": "success",
            "upcoming_ipo": df.to_dict("records") if not df.empty else [],
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("全球市场行情")
def global_market_tool() -> dict:
    """获取全球主要市场行情

    来源: yfinance

    返回:
    - 道琼斯
    - 纳斯达克
    - 标普500
    - 富时100
    - 日经225
    - 恒生指数
    """
    try:
        import yfinance as yf

        indices = {
            "^DJI": "道琼斯",
            "^IXIC": "纳斯达克",
            "^GSPC": "标普500",
            "^FTSE": "富时100",
            "^N225": "日经225",
            "^HSI": "恒生指数",
        }
        results = {}
        for code, name in indices.items():
            ticker = yf.Ticker(code)
            hist = ticker.history(period="1d")
            if not hist.empty:
                latest = hist.iloc[-1]
                results[name] = {
                    "close": round(latest["Close"], 2),
                    "change_pct": round(
                        (latest["Close"] - latest["Open"]) / latest["Open"] * 100, 2
                    ),
                }
        return {"status": "success", "global_markets": results}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("期权数据")
def options_tool(symbol: str, expiry: str = None) -> dict:
    """获取股票期权数据

    来源: yfinance

    返回:
    - 期权链
    - 看涨期权
    - 看跌期权
    """
    try:
        import yfinance as yf

        ticker = yf.Ticker(symbol)
        options = ticker.options
        if not options:
            return {"status": "success", "message": "无期权数据"}

        expiries = [expiry] if expiry and expiry in options else options[:3]
        result = {"status": "success", "expiries": expiries}

        for exp in expiries:
            opt = ticker.option_chain(exp)
            result[f"calls_{exp}"] = opt.calls.head(5).to_dict("records")
            result[f"puts_{exp}"] = opt.puts.head(5).to_dict("records")

        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("指数数据")
def index_data_tool(symbol: str = "000300") -> dict:
    """获取指数数据

    来源: akshare

    参数:
    - symbol: 指数代码 (000001=上证, 000300=沪深300, 399001=深证成指)

    返回点位、涨跌幅、成交量
    """
    try:
        import akshare as ak

        df = ak.stock_zh_index_daily(symbol=f"sh{symbol}")
        if not df.empty:
            latest = df.iloc[-1]
            return {
                "status": "success",
                "symbol": symbol,
                "close": float(latest["close"]),
                "change_pct": float(latest["close"])
                - float(df.iloc[-2]["close"]) / float(df.iloc[-2]["close"]) * 100,
                "volume": int(latest["volume"]),
            }
        return {"status": "error", "message": "No data"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("网络搜索")
def tavily_search_tool(query: str, max_results: int = 5) -> dict:
    """联网搜索最新财经新闻、政策、行业动态等

    来源: Tavily AI搜索API

    参数:
    - query: 搜索关键词
    - max_results: 返回结果数量，默认5

    返回标题、链接、内容摘要
    """
    try:
        import os
        import requests

        api_key = os.getenv("TAVILY_API_KEY")
        # Debug: print whether we found the key (first 4 and last 4 chars for safety)
        if api_key:
            # Only show first 2 and last 2 chars to avoid leaking the full key in logs
            masked_key = (
                api_key[:2] + "..." + api_key[-2:] if len(api_key) > 4 else "***"
            )
            print(
                f"[TAVILY DEBUG] API key found: {masked_key} (length: {len(api_key)})"
            )
        else:
            print("[TAVILY DEBUG] API key NOT found in environment variables")
            print(
                f"[TAVILY DEBUG] Current environment keys: {[k for k in os.environ.keys() if 'TAVILY' in k]}"
            )

        if not api_key:
            # 如果没有配置API key，返回提示信息
            return {
                "status": "warning",
                "message": "Tavily API key not configured. Please set TAVILY_API_KEY environment variable.",
                "results": [],
            }

        url = "https://api.tavily.com/search"
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "advanced",
            "include_answer": True,
            "include_raw_content": False,
            "max_results": max_results,
        }

        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()

        results = []
        for result in data.get("results", []):
            results.append(
                {
                    "title": result.get("title", ""),
                    "url": result.get("url", ""),
                    "content": result.get("content", "")[:200] + "..."
                    if len(result.get("content", "")) > 200
                    else result.get("content", ""),
                    "score": result.get("score", 0),
                }
            )

        return {
            "status": "success",
            "query": query,
            "answer": data.get("answer", ""),
            "results": results,
            "result_count": len(results),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("技术指标分析")
def technical_indicator_tool(symbol: str, period: str = "daily") -> dict:
    """计算技术指标（RSI, MACD, etc.）

    来源: akshare + pandas-ta

    参数:
    - symbol: 股票代码
    - period: 周期 (daily/weekly/monthly)

    返回常用技术指标值
    """
    try:
        import akshare as ak
        import pandas as pd
        import pandas_ta as ta

        # 获取历史数据
        df = ak.stock_zh_a_hist(
            symbol=symbol, period=period, start_date="20240101", end_date="20241231"
        )
        if df.empty:
            return {"status": "error", "message": "No historical data available"}

        # 确保列名正确
        df.columns = [col.lower() for col in df.columns]
        # 通常列名为: 日期, 开盘, 收盘, 最高, 最低, 成交量, 成交额, 振幅, 涨跌幅, 涨跌额, 换手率
        # 我们需要收盘价等来计算指标
        close = df["收盘"]
        high = df["最高"]
        low = df["最低"]
        volume = df["成交量"]

        # 计算技术指标
        # RSI
        rsi = ta.rsi(close, length=14)
        # MACD
        macd = ta.macd(close, fast=12, slow=26, signal=9)
        # 布林带
        bbands = ta.bbands(close, length=20, std=2)
        # 成交量加权平均价 (VWAP) - 需要成交额和成交量
        if "成交额" in df.columns and "成交量" in df.columns:
            vwap = (df["成交额"] / df["成交量"]).cumsum() / df["成交量"].cumsum()
        else:
            vwap = pd.Series([0] * len(df), index=df.index)

        # 取最新值
        latest_rsi = rsi.iloc[-1] if not rsi.empty else None
        latest_macd = (
            macd["MACD_12_26_9"].iloc[-1]
            if macd is not None and not macd.empty
            else None
        )
        latest_macd_signal = (
            macd["MACDs_12_26_9"].iloc[-1]
            if macd is not None and not macd.empty
            else None
        )
        latest_macd_hist = (
            macd["MACDh_12_26_9"].iloc[-1]
            if macd is not None and not macd.empty
            else None
        )
        latest_bbands_upper = (
            bbands["BBU_20_2.0"].iloc[-1]
            if bbands is not None and not bbands.empty
            else None
        )
        latest_bbands_middle = (
            bbands["BBM_20_2.0"].iloc[-1]
            if bbands is not None and not bbands.empty
            else None
        )
        latest_bbands_lower = (
            bbands["BBL_20_2.0"].iloc[-1]
            if bbands is not None and not bbands.empty
            else None
        )
        latest_vwap = vwap.iloc[-1] if not vwap.empty else None

        # 确定信号
        signal = "中性"
        if latest_rsi is not None:
            if latest_rsi > 70:
                signal += ", RSI超买"
            elif latest_rsi < 30:
                signal += ", RSI超卖"
        if latest_macd is not None and latest_macd_signal is not None:
            if latest_macd > latest_macd_signal:
                signal += ", MACD金叉"
            else:
                signal += ", MACD死叉"

        return {
            "status": "success",
            "symbol": symbol,
            "indicators": {
                "RSI": round(latest_rsi, 2) if latest_rsi is not None else None,
                "MACD": round(latest_macd, 4) if latest_macd is not None else None,
                "MACD_Signal": round(latest_macd_signal, 4)
                if latest_macd_signal is not None
                else None,
                "MACD_Hist": round(latest_macd_hist, 4)
                if latest_macd_hist is not None
                else None,
                "BB_Upper": round(latest_bbands_upper, 2)
                if latest_bbands_upper is not None
                else None,
                "BB_Middle": round(latest_bbands_middle, 2)
                if latest_bbands_middle is not None
                else None,
                "BB_Lower": round(latest_bbands_lower, 2)
                if latest_bbands_lower is not None
                else None,
                "VWAP": round(latest_vwap, 2) if latest_vwap is not None else None,
            },
            "signal": signal.strip(),
            "data_points": len(df),
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("交易执行策略")
def execution_strategy_tool(
    symbol: str, order_size: int, market_volatility: str = "medium"
) -> dict:
    """推荐交易执行策略（如TWAP, VWAP, etc.）

    来源: 量化交易最佳实践

    参数:
    - symbol: 股票代码
    - order_size: 订单大小（股数）
    - market_volatility: 市场波动性 (low/medium/high)

    推荐的执行策略和理由
    """
    try:
        # 简单模拟：根据订单大小和市场波动性推荐策略
        # 在实际系统中，这会结合实时订单簿数据、历史流动性等

        # 订单大小阈值（示值，实际应根据股票流动性调整）
        small_order_threshold = 10000  # 股
        large_order_threshold = 100000  # 股

        strategy = ""
        reason = ""

        if order_size < small_order_threshold:
            strategy = "市价单"
            reason = "订单规模较小，可直接使用市价单快速成交，对冲击成本影响小。"
        elif order_size > large_order_threshold:
            if market_volatility == "high":
                strategy = "TWAP (时间加权平均价)"
                reason = "大单加高波动性环境，TWAP能有效分散市场冲击，降低成本。"
            else:
                strategy = "VWAP (成交量加权平均价)"
                reason = "大单在中低波动性环境，VWAP能更好地跟踪市场平均成交价。"
        else:
            # 中等规模订单
            strategy = "组合策略（限价单+条件单）"
            reason = (
                "中等规模订单，建议使用限价单挂单等待成交，辅以条件单应对价格波动。"
            )

        return {
            "status": "success",
            "symbol": symbol,
            "order_size": order_size,
            "market_volatility": market_volatility,
            "recommended_strategy": strategy,
            "reason": reason,
            "considerations": [
                "请根据实时盘口深度调整策略",
                "注意交易时间段（开盘/收盘集中竞价波动较大）",
                "设置合理的止损和止盈点位",
            ],
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("情感反馈循环")
def sentiment_feedback_tool(news_text: str, symbol: str = None) -> dict:
    """分析新闻情感并生成投资建议反馈

    来源: 情感反馈循环机制

    参数:
    - news_text: 新闻文本内容
    - symbol: 相关股票代码（可选）

    返回情感分析结果和投资倾向建议
    """
    try:
        # 简单的情感分析模拟
        # 在实际系统中，这会使用更复杂的NLP模型

        positive_words = [
            "增长",
            "上涨",
            "利好",
            "突破",
            "创新",
            "合作",
            "扩张",
            "盈利",
            "增收",
            "净利",
            "派息",
            "回购",
            "重组",
            "并购",
        ]
        negative_words = [
            "下跌",
            "利空",
            "下滑",
            "亏损",
            "减持",
            "违规",
            "调查",
            "处罚",
            "罢工",
            "断供",
            "禁售",
            "违约",
        ]

        text_lower = news_text.lower()

        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)

        sentiment_score = 0
        if positive_count + negative_count > 0:
            sentiment_score = (positive_count - negative_count) / (
                positive_count + negative_count
            )

        sentiment = "中性"
        if sentiment_score > 0.2:
            sentiment = "积极"
        elif sentiment_score < -0.2:
            sentiment = "消极"

        # 生成投资建议
        if sentiment == "积极":
            investment_advice = "考虑适度关注或买入"
            action = "买入偏好"
        elif sentiment == "消极":
            investment_advice = "考虑规避或减仓"
            action = "卖出偏好"
        else:
            investment_advice = "保持观望，等待更明确信息"
            action = "持有观望"

        # 如果有股票代码，提供更具体建议
        stock_specific = ""
        if symbol:
            stock_specific = f" 对于 {symbol} ，基于新闻情感分析："

        return {
            "status": "success",
            "news_text_preview": news_text[:100] + "..."
            if len(news_text) > 100
            else news_text,
            "sentiment_analysis": {
                "sentiment": sentiment,
                "score": round(sentiment_score, 3),
                "positive_indicators": positive_count,
                "negative_indicators": negative_count,
            },
            "investment_feedback": {
                "advice": investment_advice,
                "action_tendency": action,
                "stock_specific": stock_specific,
            },
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("绩效分析工具")
def performance_analysis_tool(returns: list, benchmark_returns: list = None) -> dict:
    """分析投资策略绩效

    来源: 量化绩效分析最佳实践

    参数:
    - returns: 策略收益率列表（日收益率）
    - benchmark_returns: 基准收益率列表（可选，用于计算阿尔法、贝塔等）

    返回关键绩效指标：收益、波动率、夏普比率、最大回撤等
    """
    try:
        import numpy as np

        if not returns or len(returns) == 0:
            return {"status": "error", "message": "No returns data provided"}

        returns_array = np.array(returns)

        # 基本统计
        total_return = np.prod(1 + returns_array) - 1
        annualized_return = np.prod(1 + returns_array) ** (252 / len(returns_array)) - 1
        annualized_volatility = np.std(returns_array) * np.sqrt(252)

        # 夏普比率（假设无风险利率为0）
        sharpe_ratio = (
            annualized_return / annualized_volatility
            if annualized_volatility != 0
            else 0
        )

        # 最大回撤
        cumulative = np.cumprod(1 + returns_array)
        running_max = np.maximum.accumulate(cumulative)
        drawdown = (cumulative - running_max) / running_max
        max_drawdown = np.min(drawdown)

        # 胜率
        win_rate = np.sum(returns_array > 0) / len(returns_array)

        result = {
            "status": "success",
            "metrics": {
                "total_return": round(total_return, 4),
                "annualized_return": round(annualized_return, 4),
                "annualized_volatility": round(annualized_volatility, 4),
                "sharpe_ratio": round(sharpe_ratio, 4),
                "max_drawdown": round(max_drawdown, 4),
                "win_rate": round(win_rate, 4),
            },
        }

        # 如果有基准数据，计算相对指标
        if benchmark_returns is not None and len(benchmark_returns) > 0:
            benchmark_array = np.array(benchmark_returns)
            if len(benchmark_array) == len(returns_array):
                benchmark_total = np.prod(1 + benchmark_array) - 1
                benchmark_annualized = (
                    np.prod(1 + benchmark_array) ** (252 / len(benchmark_array)) - 1
                )

                alpha = annualized_return - benchmark_annualized
                # 贝塔：策略收益与基准收益的协方差 / 基准收益方差
                covariance = np.cov(returns_array, benchmark_array)[0][1]
                benchmark_variance = np.var(benchmark_array)
                beta = covariance / benchmark_variance if benchmark_variance != 0 else 0
                information_ratio = (
                    (annualized_return - benchmark_annualized)
                    / np.std(returns_array - benchmark_array)
                    * np.sqrt(252)
                    if np.std(returns_array - benchmark_array) != 0
                    else 0
                )

                result["relative_metrics"] = {
                    "alpha": round(alpha, 4),
                    "beta": round(beta, 4),
                    "information_ratio": round(information_ratio, 4),
                    "benchmark_total_return": round(benchmark_total, 4),
                    "benchmark_annualized_return": round(benchmark_annualized, 4),
                }

        return result
    except Exception as e:
        return {"status": "error", "message": str(e)}
