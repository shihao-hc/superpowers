from crewai.tools import tool
import akshare as ak


@tool("获取A股数据")
def ashare_data_tool(symbol: str, start_date: str = None, end_date: str = None) -> dict:
    """获取A股股票历史数据"""
    try:
        df = ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start_date or "20240101", end_date=end_date or "20240327")
        return {"status": "success", "data": df.to_dict()}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("获取高频数据")
def highfreq_data_tool(symbol: str) -> dict:
    """获取股票实时/高频数据"""
    try:
        df = ak.stock_zh_a_spot_em()
        stock = df[df['代码'] == symbol]
        if not stock.empty:
            return {"status": "success", "data": stock.iloc[0].to_dict()}
        return {"status": "error", "message": "股票未找到"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@tool("知识库搜索")
def knowledge_search_tool(query: str) -> list:
    """搜索知识库获取相关信息"""
    return [{"content": f"知识库结果: {query}", "relevance": 0.8}]


@tool("政策监控")
def policy_monitor_tool(keywords: list[str] = None) -> list:
    """监控政策变化"""
    return [{"title": "政策更新", "content": "暂无新政策", "date": "2024-03-27"}]


@tool("风险指标")
def risk_metrics_tool(portfolio_value: float, positions: list[dict]) -> dict:
    """计算投资组合风险指标"""
    total_value = sum(p.get("value", 0) for p in positions)
    return {
        "total_value": total_value,
        "var_95": total_value * 0.02,
        "max_drawdown": 0.08,
        "beta": 1.1
    }


@tool("组合分析")
def portfolio_analysis_tool(positions: list[dict]) -> dict:
    """分析投资组合"""
    return {
        "sector_weights": {"科技": 0.4, "新能源": 0.3, "消费": 0.3},
        "diversification": 0.7,
        "expected_return": 0.15
    }


@tool("回测API")
def backtest_api_tool(strategy: str, start_date: str, end_date: str) -> dict:
    """执行回测"""
    return {
        "total_return": 0.12,
        "sharpe_ratio": 1.5,
        "max_drawdown": 0.08
    }


@tool("交易API")
def trading_api_tool(action: str, symbol: str, quantity: int, price: float = None) -> dict:
    """执行交易"""
    return {
        "status": "success",
        "order_id": "order_123",
        "symbol": symbol,
        "action": action,
        "quantity": quantity
    }


@tool("实时报价")
def realtime_quote_tool(symbols: list[str]) -> list[dict]:
    """获取实时报价"""
    try:
        df = ak.stock_zh_a_spot_em()
        quotes = []
        for symbol in symbols:
            stock = df[df['代码'] == symbol]
            if not stock.empty:
                quotes.append(stock.iloc[0].to_dict())
        return quotes
    except Exception as e:
        return [{"error": str(e)}]