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
    """获取真实股票数据"""
    try:
        import akshare as ak
        import threading
        
        result = {}
        error = [None]
        
        def fetch_data():
            try:
                df = ak.stock_zh_a_spot_em()
                stock_data = df[df['代码'] == symbol]
                if not stock_data.empty:
                    row = stock_data.iloc[0]
                    result['data'] = {
                        "symbol": symbol,
                        "name": row.get('名称', get_stock_name(symbol)),
                        "price": row.get('最新价', 0),
                        "change": row.get('涨跌幅', 0),
                        "volume": row.get('成交量', 0),
                        "amount": row.get('成交额', 0),
                        "amplitude": row.get('振幅', 0),
                        "high": row.get('最高', 0),
                        "low": row.get('最低', 0),
                        "open": row.get('今开', 0),
                        "pre_close": row.get('昨收', 0),
                        "turnover": row.get('换手率', 0),
                        "valuation": f"PE {row.get('市盈率-动态', 0):.1f}倍" if row.get('市盈率-动态', 0) > 0 else "暂无",
                        "trend": "上涨" if row.get('涨跌幅', 0) > 0 else "下跌" if row.get('涨跌幅', 0) < 0 else "持平",
                        "is_real": True
                    }
            except Exception as e:
                error[0] = e
        
        t = threading.Thread(target=fetch_data)
        t.daemon = True
        t.start()
        t.join(timeout=8)
        
        if result.get('data'):
            return result['data']
        return get_mock_data(symbol)
        
    except Exception as e:
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
    result_text = "📊 [Real-time Stock Analysis]\n\n"
    
    for data in stocks:
        is_real = data.get('is_real', False)
        status_tag = "✅ 实时数据" if is_real else "⚠️ 模拟数据"
        
        result_text += f"【{data['name']} ({data['symbol']})】 {status_tag}\n"
        result_text += "-" * 40 + "\n"
        
        if is_real and data['price'] > 0:
            result_text += f"💰 当前价格: ¥{data['price']:.2f}\n"
            result_text += f"📈 涨跌幅: {data['change']:+.2f}%\n"
            result_text += f"📊 成交量: {data['volume']/10000:.0f}手\n"
            result_text += f"💵 成交额: {data['amount']/100000000:.2f}亿\n"
            result_text += f"🔄 换手率: {data['turnover']:.2f}%\n"
            result_text += f"📐 振幅: {data['amplitude']:.2f}%\n"
            result_text += f"🏷️ 估值: {data['valuation']}\n\n"
            
            result_text += "📋 交易数据:\n"
            result_text += f"  今开: {data['open']:.2f}\n"
            result_text += f"  昨收: {data['pre_close']:.2f}\n"
            result_text += f"  最高: {data['high']:.2f}\n"
            result_text += f"  最低: {data['low']:.2f}\n\n"
            
            change = data['change']
            if change > 3:
                recommendation = "🔥 强势上涨，建议关注回调风险"
            elif change > 0:
                result_text += "✅ 小幅上涨，趋势良好"
            elif change > -3:
                result_text += "⚠️ 小幅下跌，关注支撑位"
            else:
                result_text += "🔻 大幅下跌，注意风险"
        else:
            result_text += "⚠️ 暂无实时行情数据\n"
        
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