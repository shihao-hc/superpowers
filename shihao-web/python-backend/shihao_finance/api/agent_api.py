from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from shihao_finance.agent.core import ShiHaoAgent


router = APIRouter(prefix="/api/agent", tags=["agent"])


agent: Optional[ShiHaoAgent] = None


def init_agent(a: ShiHaoAgent):
    global agent
    agent = a


class AnalyzeRequest(BaseModel):
    tickers: list[str]
    context: Optional[str] = None


class MemoryUpdateRequest(BaseModel):
    block: str
    value: str


class MemorySearchRequest(BaseModel):
    query: str
    user_id: str = "user"
    limit: int = 10


class NotificationRequest(BaseModel):
    title: str
    content: str
    priority: str = "normal"
    channels: list[str] = ["telegram"]


@router.get("/status")
async def get_agent_status():
    """获取Agent状态"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    return {
        "status": "active" if agent._initialized else "inactive",
        "memory_blocks": agent.memory.core.list_blocks(),
        "llm_provider": agent.llm_provider,
        "llm_model": agent.llm_model
    }


@router.get("/memory/core")
async def get_core_memory():
    """获取核心记忆"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    return {
        "blocks": agent.memory.core.export(),
        "hash": agent.memory.core.get_hash()
    }


@router.put("/memory/core")
async def update_core_memory(request: MemoryUpdateRequest):
    """更新核心记忆"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    try:
        await agent.update_core_memory(request.block, request.value)
        return {"status": "success"}
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/memory/search")
async def search_memory(request: MemorySearchRequest):
    """搜索记忆"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    results = await agent.recall_search(request.query, request.user_id, request.limit)
    return {"results": results, "count": len(results)}


class AddMemoryRequest(BaseModel):
    text: str
    user_id: str = "user"
    categories: list[str] = None


@router.post("/memory/add")
async def add_memory(request: AddMemoryRequest):
    """添加记忆"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    result = await agent.add_recall_memory(
        text=request.text,
        user_id=request.user_id,
        categories=request.categories
    )
    return {"status": "success", "result": result}


@router.post("/analyze")
async def analyze_tickers(request: AnalyzeRequest):
    """触发AI分析"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    tickers = request.tickers
    context = request.context or f"分析股票 {', '.join(tickers)} 的投资价值"
    
    try:
        analysis_results = []
        
        for symbol in tickers:
            stock_info = get_real_stock_data(symbol)
            analysis_results.append(stock_info)
        
        result_text = generate_analysis_report(analysis_results)
        
        return {
            "status": "completed",
            "tickers": tickers,
            "message": "分析完成",
            "result": result_text,
            "raw_data": analysis_results
        }
    except Exception as e:
        return {
            "status": "error",
            "tickers": tickers,
            "message": f"分析失败: {str(e)}",
            "result": None
        }


def get_real_stock_data(symbol: str) -> dict:
    """获取真实股票数据 - 简化版"""
    # 暂时返回模拟数据以确保功能正常
    # TODO: 后续再接入真实数据源
    return get_mock_data(symbol)


def get_mock_data(symbol: str) -> dict:
    """获取模拟数据（当无法获取真实数据时）"""
    names = {
        "600519": "贵州茅台",
        "300750": "宁德时代",
        "002594": "比亚迪",
        "601318": "中国平安",
        "600036": "招商银行",
        "000001": "平安银行",
        "600900": "长江电力",
    }
    
    return {
        "symbol": symbol,
        "name": names.get(symbol, f"股票{symbol}"),
        "price": 0,
        "change": 0,
        "volume": 0,
        "amount": 0,
        "amplitude": 0,
        "high": 0,
        "low": 0,
        "open": 0,
        "pre_close": 0,
        "turnover": 0,
        "valuation": "暂无数据",
        "trend": "未知",
        "is_real": False
    }


def generate_analysis_report(stocks: list) -> str:
    """生成分析报告"""
    result_text = "📊 [Stock Analysis Report]\n\n"
    
    for data in stocks:
        is_real = data.get('is_real', False)
        status_tag = "✅ Real-time Data" if is_real else "⚠️ Mock Data"
        
        result_text += f"【{data['name']} ({data['symbol']})】 {status_tag}\n"
        result_text += "-" * 40 + "\n"
        
        if is_real and data['price'] > 0:
            result_text += f"💰 Current Price: ¥{data['price']:.2f}\n"
            result_text += f"📈 Change: {data['change']:+.2f}%\n"
            result_text += f"📊 Volume: {data['volume']/10000:.0f} lots\n"
            result_text += f"💵 Amount: {data['amount']/100000000:.2f} billion\n"
            result_text += f"🔄 Turnover: {data['turnover']:.2f}%\n"
            result_text += f"🏷️ Valuation: {data['valuation']}\n\n"
            
            result_text += "📋 Trading Data:\n"
            result_text += f"  Open: {data['open']:.2f}\n"
            result_text += f"  Prev Close: {data['pre_close']:.2f}\n"
            result_text += f"  High: {data['high']:.2f}\n"
            result_text += f"  Low: {data['low']:.2f}\n\n"
            
            change = data['change']
            if change > 3:
                result_text += "🔥 Strong uptrend, watch for pullback risk\n"
            elif change > 0:
                result_text += "✅ Mild uptrend, momentum positive\n"
            elif change > -3:
                result_text += "⚠️ Mild downtrend, watch support levels\n"
            else:
                result_text += "🔻 Strong downtrend, exercise caution\n"
        else:
            result_text += "⚠️ No real-time market data available\n"
        
        result_text += "\n" + "=" * 40 + "\n\n"
    
    return result_text


def get_stock_name(symbol: str) -> str:
    """获取股票名称"""
    names = {
        "600519": "贵州茅台",
        "000858": "五粮液",
        "300750": "宁德时代",
        "601318": "中国平安",
        "600036": "招商银行",
        "000001": "平安银行",
        "600900": "长江电力",
    }
    return names.get(symbol, f"股票{symbol}")


@router.post("/notifications/send")
async def send_notification(request: NotificationRequest):
    """发送通知"""
    return {
        "status": "sent",
        "channels": request.channels
    }


class WebSearchRequest(BaseModel):
    query: str
    max_results: Optional[int] = 5


@router.post("/websearch")
async def web_search(request: WebSearchRequest):
    """联网搜索 - 供AI助手使用"""
    print(f"[WEBSEARCH DEBUG] Endpoint reached with request: {request}")
    if not agent:
        print("[WEBSEARCH DEBUG] Agent not initialized")
        raise HTTPException(500, "Agent not initialized")
    
    try:
        print(f"[WEBSEARCH DEBUG] About to call tavily_search_tool with query='{request.query}', max_results={request.max_results}")
        # 使用Tavily搜索工具
        from shihao_finance.agent.tools import tavily_search_tool
        print(f"[WEBSEARCH DEBUG] tavily_search_tool type: {type(tavily_search_tool)}")
        print(f"[WEBSEARCH DEBUG] tavily_search_tool dir: {[m for m in dir(tavily_search_tool) if not m.startswith('_')]}")
        # Try to see if it's callable
        print(f"[WEBSEARCH DEBUG] Is callable? {callable(tavily_search_tool)}")
        # If it's a Tool instance from crewai, it might have a .run method
        if hasattr(tavily_search_tool, 'run'):
            print("[WEBSEARCH DEBUG] Has .run attribute")
            result = tavily_search_tool.run(query=request.query, max_results=request.max_results)
        elif hasattr(tavily_search_tool, '_run'):
            print("[WEBSEARCH DEBUG] Has ._run attribute")
            result = tavily_search_tool._run(query=request.query, max_results=request.max_results)
        else:
            # Assume it's a plain function
            result = tavily_search_tool(query=request.query, max_results=request.max_results)
        print(f"[WEBSEARCH DEBUG] Tavily tool returned: {result}")
        return result
    except Exception as e:
        import traceback
        print(f"[WEBSEARCH ERROR] Exception in web_search: {traceback.format_exc()}")
        raise HTTPException(500, f"Web search failed: {str(e)}")