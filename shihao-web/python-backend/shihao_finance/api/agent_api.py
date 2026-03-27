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


@router.post("/analyze")
async def analyze_tickers(request: AnalyzeRequest):
    """触发AI分析"""
    if not agent:
        raise HTTPException(500, "Agent not initialized")
    
    return {
        "status": "analyzing",
        "tickers": request.tickers,
        "message": "分析任务已启动"
    }


@router.post("/notifications/send")
async def send_notification(request: NotificationRequest):
    """发送通知"""
    return {
        "status": "sent",
        "channels": request.channels
    }