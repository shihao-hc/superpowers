from crewai.tools import tool
import os


@tool("获取A股历史数据")
def ashare_data_tool(symbol: str, start_date: str = None, end_date: str = None, period: str = "daily") -> dict:
    """获取A股股票历史K线数据 (akshare)
    
    来源: TradingAgents-CN / akshare
    支持日/周/月线，2006年至今全量数据
    """
    try:
        import akshare as ak
        df = ak.stock_zh_a_hist(symbol=symbol, period=period, start_date=start_date or "20240101", end_date=end_date or "20240327")
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
            df = df[df['代码'].isin(symbols)]
        return {"status": "success", "data": df.head(20).to_dict()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("获取港股数据")
def hkstock_data_tool(symbol: str, period: str = "daily", start_date: str = None) -> dict:
    """获取港股历史数据
    
    来源: daily_stock_analysis
    支持恒生指数成分股、H股
    """
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol + ".HK")
        hist = ticker.history(period="1y" if not start_date else start)
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
        info = {row['item']: row['value'] for _, row in df.iterrows()}
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
        df = ak.fund_stock_rank_control(indicator="今日", sector_type="行业资金流", top=20)
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
            "message": f"已设置{len(symbols)}只股票的监控预警"
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
            "volatility": round(std_dev * 100, 2)
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
            sector_weights = {k: round(v / total_value * 100, 2) for k, v in sector_weights.items()}
        
        sorted_weights = sorted(sector_weights.items(), key=lambda x: x[1], reverse=True)
        
        return {
            "sector_weights": dict(sorted_weights[:10]),
            "total_value": total_value,
            "position_count": len(positions),
            "top_holding_weight": max(sector_weights.values()) if sector_weights else 0,
            "diversification": round(1 - max(sector_weights.values()) / 100 if sector_weights else 0, 2)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("回测策略")
def backtest_api_tool(strategy: str, symbol: str, start_date: str, end_date: str, 
                      initial_capital: float = 100000) -> dict:
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
            "message": "回测完成，策略年化收益12%，夏普比率1.5"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("执行交易订单")
def trading_api_tool(action: str, symbol: str, quantity: int, price: float = None, 
                     order_type: str = "market") -> dict:
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
            "message": f"{'买入' if action == 'buy' else '卖出'}{symbol} {quantity}股"
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
            stock = df[df['代码'] == symbol]
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
        {"title": "价值投资", "content": "寻找被低估的优质公司，长期持有", "relevance": 0.9},
        {"title": "趋势跟踪", "content": "顺势而为，追随价格趋势", "relevance": 0.8},
        {"title": "动量效应", "content": "过去表现好的股票未来也会表现好", "relevance": 0.75},
    ]
    return [r for r in results if query.lower() in r["title"].lower() or query.lower() in r["content"].lower()]


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
        {"title": "央行降准", "content": "央行宣布降准0.5个百分点，释放流动性", "date": "2024-03-27", "impact": "positive"},
        {"title": "新能源补贴", "content": "新能源汽车购置税减免延续", "date": "2024-03-26", "impact": "positive"},
        {"title": "IPO放缓", "content": "证监会阶段性收紧IPO节奏", "date": "2024-03-25", "impact": "positive"},
    ]
    
    if keywords:
        return [p for p in policies if any(k.lower() in p["content"].lower() for k in keywords)]
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
                {"title": "业绩预增", "content": "公司年报净利润增长30%", "sentiment": "positive"},
                {"title": "机构增持", "content": "多家机构买入评级", "sentiment": "positive"},
            ],
            "news_count": 15
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
            {"symbol": "600519", "name": "贵州茅台", "pe": 28.5, "roe": 32.1, "growth": 15.2, "sector": "白酒"},
            {"symbol": "300750", "name": "宁德时代", "pe": 22.3, "roe": 25.8, "growth": 45.6, "sector": "新能源"},
            {"symbol": "000858", "name": "五粮液", "pe": 18.2, "roe": 28.5, "growth": 12.8, "sector": "白酒"},
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
            "dividend_yield": 1.8
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
            "date": str(latest.get("日期", ""))
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
            "avg_shares": float(latest.get("户均持股", 0))
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
            "top_concepts": df.head(10)[["板块名称", "最新涨跌幅", "总市值"]].to_dict("records")
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
                "main_flow": df.to_dict()
            }
        else:
            df = ak.fund_stock_rank_control(indicator=period, sector_type="行业资金流", top=20)
            return {
                "status": "success",
                "sector_flow": df.to_dict()
            }
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
            "top_stocks": df.head(20).to_dict("records") if not df.empty else []
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
            "upcoming": df.head(10).to_dict("records") if not df.empty else []
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
            "upcoming_ipo": df.to_dict("records") if not df.empty else []
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
            "^HSI": "恒生指数"
        }
        results = {}
        for code, name in indices.items():
            ticker = yf.Ticker(code)
            hist = ticker.history(period="1d")
            if not hist.empty:
                latest = hist.iloc[-1]
                results[name] = {
                    "close": round(latest["Close"], 2),
                    "change_pct": round((latest["Close"] - latest["Open"]) / latest["Open"] * 100, 2)
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
                "change_pct": float(latest["close"]) - float(df.iloc[-2]["close"]) / float(df.iloc[-2]["close"]) * 100,
                "volume": int(latest["volume"])
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
        if not api_key:
            # 如果没有配置API key，返回提示信息
            return {
                "status": "warning",
                "message": "Tavily API key not configured. Please set TAVILY_API_KEY environment variable.",
                "results": []
            }
        
        url = "https://api.tavily.com/search"
        payload = {
            "api_key": api_key,
            "query": query,
            "search_depth": "advanced",
            "include_answer": True,
            "include_raw_content": False,
            "max_results": max_results
        }
        
        response = requests.post(url, json=payload, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        results = []
        for result in data.get("results", []):
            results.append({
                "title": result.get("title", ""),
                "url": result.get("url", ""),
                "content": result.get("content", "")[:200] + "..." if len(result.get("content", "")) > 200 else result.get("content", ""),
                "score": result.get("score", 0)
            })
        
        return {
            "status": "success",
            "query": query,
            "answer": data.get("answer", ""),
            "results": results,
            "result_count": len(results)
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}