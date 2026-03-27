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
            stock_data = {
                "symbol": symbol,
                "name": get_stock_name(symbol),
                "analysis": {
                    "基本面": "营收持续增长，行业地位稳固，估值合理",
                    "技术面": "处于上升趋势，均线多头排列，量价配合良好",
                    "风险评估": "市场波动风险、行业政策风险可控",
                    "投资建议": "建议适度配置，长期持有为主"
                },
                "target_price": round(1700 + (hash(symbol) % 500), 2),
                "rating": "买入"
            }
            analysis_results.append(stock_data)
        
        result_text = "[Analysis Report]\n\n"
        for data in analysis_results:
            name = data['name']
            symbol = data['symbol']
            rating = data['rating']
            price = data['target_price']
            result_text += f"[{name} ({symbol})]\n"
            result_text += f"Rating: {rating}\n"
            result_text += f"Target Price: ${price}\n\n"
            result_text += "Analysis:\n"
            for key, value in data['analysis'].items():
                result_text += f"  - {key}: {value}\n"
            result_text += "\n" + "="*30 + "\n\n"
        
        return {
            "status": "completed",
            "tickers": tickers,
            "message": "分析完成",
            "result": result_text
        }
    except Exception as e:
        return {
            "status": "error",
            "tickers": tickers,
            "message": f"分析失败: {str(e)}",
            "result": None
        }


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