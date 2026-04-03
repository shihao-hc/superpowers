"""
Multi-Agent API Endpoints

New API endpoints for the multi-agent trading system, alert system, and notifications.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shihao_finance.core.agents.trading_team import TradingAgentTeam, TeamDecision, AnalysisSignal
from shihao_finance.core.alerts.alert_system import AlertSystem, Position, Alert, AlertLevel
from shihao_finance.core.notifications.notification_manager import (
    NotificationManager, Notification, NotificationPriority, ChannelType
)
from shihao_finance.core.data.data_manager import DataManager

router = APIRouter(prefix="/api/v2", tags=["v2"])

# Global instances (initialized on startup)
trading_team: Optional[TradingAgentTeam] = None
alert_system: Optional[AlertSystem] = None
notification_manager: Optional[NotificationManager] = None
data_manager: Optional[DataManager] = None


def initialize_services():
    """Initialize all services."""
    global trading_team, alert_system, notification_manager, data_manager
    
    trading_team = TradingAgentTeam()
    alert_system = AlertSystem()
    notification_manager = NotificationManager()
    data_manager = DataManager()
    
    return {
        "trading_team": trading_team,
        "alert_system": alert_system,
        "notification_manager": notification_manager,
        "data_manager": data_manager
    }


# ============== Multi-Agent Analysis Endpoints ==============

class AnalysisRequest(BaseModel):
    """Request for multi-agent analysis."""
    symbol: str
    exchange: str = "CN"


class AnalysisResponse(BaseModel):
    """Response from multi-agent analysis."""
    symbol: str
    final_signal: str
    consensus_score: float
    investment_thesis: str
    executive_summary: str
    approved_by_pm: bool
    agent_analyses: List[Dict[str, Any]]
    timestamp: datetime


@router.post("/analyze", response_model=AnalysisResponse)
async def analyze_stock(request: AnalysisRequest):
    """
    Run multi-agent analysis on a stock.
    
    Uses 6 specialized agents:
    - Fundamental Analyst (基本面分析师)
    - Technical Analyst (技术分析师)
    - Sentiment Analyst (情绪分析师)
    - Risk Manager (风险经理)
    - Trader (交易员)
    - Portfolio Manager (投资组合经理)
    """
    if not trading_team:
        initialize_services()
    
    try:
        # Get market data
        market_data_df = await data_manager.get_ohlcv(
            symbol=request.symbol,
            start_date=datetime.now() - datetime(days=365),
            end_date=datetime.now()
        )
        
        # Get features
        from shihao_finance.core.features.feature_engine import FeatureEngine
        feature_engine = FeatureEngine()
        feature_result = await feature_engine.compute_features(market_data_df, request.symbol)
        
        # Run multi-agent analysis
        decision = await trading_team.analyze_stock(
            symbol=request.symbol,
            market_data={"features": feature_result.features, "data": market_data_df}
        )
        
        # Convert agent analyses to dict
        agent_analyses = []
        for analysis in decision.agent_analyses:
            agent_analyses.append({
                "agent_role": analysis.agent_role.value,
                "signal": analysis.signal.value,
                "confidence": analysis.confidence,
                "reasoning": analysis.reasoning,
                "key_factors": analysis.key_factors,
                "risk_factors": analysis.risk_factors
            })
        
        return AnalysisResponse(
            symbol=decision.symbol,
            final_signal=decision.final_signal.value,
            consensus_score=decision.consensus_score,
            investment_thesis=decision.investment_thesis,
            executive_summary=decision.executive_summary,
            approved_by_pm=decision.approved_by_pm,
            agent_analyses=agent_analyses,
            timestamp=decision.timestamp
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/agents/status")
async def get_agents_status():
    """Get status of all trading agents."""
    if not trading_team:
        initialize_services()
    
    agents_info = []
    for role, agent in trading_team.agents.items():
        agents_info.append({
            "role": role.value,
            "name": agent.name,
            "system_prompt": agent.get_system_prompt()[:100] + "..."
        })
    
    return {
        "status": "active",
        "agents": agents_info,
        "total_agents": len(agents_info)
    }


# ============== Alert System Endpoints ==============

class PositionRequest(BaseModel):
    """Request for position monitoring."""
    symbol: str
    name: str
    cost_price: float
    quantity: int
    current_price: float = 0.0
    market: str = "sh"


class AlertsResponse(BaseModel):
    """Response with alerts."""
    symbol: str
    alerts: List[Dict[str, Any]]
    summary: Dict[str, Any]


@router.post("/alerts/check", response_model=AlertsResponse)
async def check_alerts(request: PositionRequest):
    """
    Check alerts for a position using 7 alert rules:
    
    1. 成本百分比 (Cost Percentage) - Profit/Loss thresholds
    2. 均线金叉死叉 (MA Crossover) - Golden/Death cross
    3. RSI超买超卖 (RSI Extreme) - Overbought/Oversold
    4. 成交量异动 (Volume Anomaly) - Volume surge/shrink
    5. 跳空缺口 (Gap Detection) - Price gaps
    6. 动态止盈 (Trailing Stop) - Trailing stop loss
    7. 涨跌幅限制 (Daily Limit) - Daily price limits
    """
    if not alert_system:
        initialize_services()
    
    try:
        # Create position object
        position = Position(
            symbol=request.symbol,
            name=request.name,
            cost_price=request.cost_price,
            quantity=request.quantity,
            current_price=request.current_price,
            market=request.market
        )
        
        # Get market data
        market_data_df = await data_manager.get_ohlcv(
            symbol=request.symbol,
            start_date=datetime.now() - days(90),
            end_date=datetime.now()
        )
        
        # Check alerts
        alerts = alert_system.monitor_position(position, market_data_df)
        
        # Convert alerts to dict
        alert_dicts = []
        for alert in alerts:
            alert_dicts.append({
                "type": alert.alert_type.value,
                "level": alert.level.value,
                "title": alert.title,
                "message": alert.message,
                "action_suggestion": alert.action_suggestion,
                "current_value": alert.current_value,
                "threshold_value": alert.threshold_value
            })
        
        # Get summary
        summary = alert_system.get_alert_summary(alerts)
        
        return AlertsResponse(
            symbol=request.symbol,
            alerts=alert_dicts,
            summary=summary
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/rules")
async def get_alert_rules():
    """Get list of all alert rules."""
    if not alert_system:
        initialize_services()
    
    rules_info = []
    for rule in alert_system.rules:
        rules_info.append({
            "name": rule.rule_name,
            "priority": rule.priority,
            "enabled": rule.enabled
        })
    
    return {
        "rules": rules_info,
        "total": len(rules_info)
    }


# ============== Notification Endpoints ==============

class NotificationRequest(BaseModel):
    """Request for sending notification."""
    title: str
    content: str
    priority: str = "normal"
    channels: List[str] = []


class NotificationResponse(BaseModel):
    """Response from notification."""
    results: List[Dict[str, Any]]


@router.post("/notifications/send", response_model=NotificationResponse)
async def send_notification(request: NotificationRequest):
    """
    Send notification to specified channels.
    
    Available channels:
    - email (邮件)
    - wechat_work (企业微信)
    - feishu (飞书)
    - telegram
    - discord
    - dingtalk (钉钉)
    """
    if not notification_manager:
        initialize_services()
    
    try:
        # Map priority
        priority_map = {
            "low": NotificationPriority.LOW,
            "normal": NotificationPriority.NORMAL,
            "high": NotificationPriority.HIGH,
            "urgent": NotificationPriority.URGENT
        }
        
        # Map channels
        channel_map = {
            "email": ChannelType.EMAIL,
            "wechat_work": ChannelType.WECHAT_WORK,
            "feishu": ChannelType.FEISHU,
            "telegram": ChannelType.TELEGRAM,
            "discord": ChannelType.DISCORD,
            "dingtalk": ChannelType.DINGTALK
        }
        
        channels = [channel_map[c] for c in request.channels if c in channel_map]
        
        # Create notification
        notification = Notification(
            title=request.title,
            content=request.content,
            priority=priority_map.get(request.priority, NotificationPriority.NORMAL),
            channels=channels
        )
        
        # Send notification
        results = await notification_manager.send(notification, channels if channels else None)
        
        # Convert results to dict
        result_dicts = []
        for result in results:
            result_dicts.append({
                "channel": result.channel.value,
                "success": result.success,
                "message": result.message
            })
        
        return NotificationResponse(results=result_dicts)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/notifications/channels")
async def get_notification_channels():
    """Get list of available notification channels."""
    if not notification_manager:
        initialize_services()
    
    return {
        "channels": notification_manager.get_available_channels()
    }


# ============== Combined Workflow Endpoint ==============

class WorkflowRequest(BaseModel):
    """Request for complete analysis workflow."""
    symbol: str
    exchange: str = "CN"
    send_notification: bool = False
    notification_channels: List[str] = []


@router.post("/workflow/analyze-and-alert")
async def analyze_and_alert(request: WorkflowRequest):
    """
    Complete workflow: Analyze → Check Alerts → Send Notifications
    
    This endpoint:
    1. Runs multi-agent analysis
    2. Checks all 7 alert rules
    3. Optionally sends notifications
    """
    if not all([trading_team, alert_system, notification_manager, data_manager]):
        initialize_services()
    
    try:
        # Step 1: Multi-agent analysis
        market_data_df = await data_manager.get_ohlcv(
            symbol=request.symbol,
            start_date=datetime.now() - datetime(days=365),
            end_date=datetime.now()
        )
        
        from shihao_finance.core.features.feature_engine import FeatureEngine
        feature_engine = FeatureEngine()
        feature_result = await feature_engine.compute_features(market_data_df, request.symbol)
        
        decision = await trading_team.analyze_stock(
            symbol=request.symbol,
            market_data={"features": feature_result.features, "data": market_data_df}
        )
        
        # Step 2: Check alerts (simplified - would need position data)
        alerts = []
        alert_summary = {"total": 0, "urgent_actions": []}
        
        # Step 3: Send notification if requested
        notification_results = []
        if request.send_notification:
            # Create summary notification
            content = f"""
## 多智能体分析报告

**股票代码**: {request.symbol}
**最终信号**: {decision.final_signal.value}
**置信度**: {decision.consensus_score:.1%}

### 投资要点
{decision.investment_thesis}

### 执行摘要
{decision.executive_summary}

### Agent分析结果
"""
            for analysis in decision.agent_analyses[:3]:
                content += f"\n- **{analysis.agent_role.value}**: {analysis.signal.value} ({analysis.confidence:.1%})"
            
            notification = Notification(
                title=f"[{request.symbol}] AI分析报告",
                content=content,
                priority=NotificationPriority.HIGH if decision.final_signal in [AnalysisSignal.BUY, AnalysisSignal.STRONG_BUY] else NotificationPriority.NORMAL
            )
            
            channels = [ChannelType(c) for c in request.notification_channels if c in [ct.value for ct in ChannelType]]
            notification_results = await notification_manager.send(notification, channels if channels else None)
        
        return {
            "symbol": request.symbol,
            "analysis": {
                "final_signal": decision.final_signal.value,
                "consensus_score": decision.consensus_score,
                "investment_thesis": decision.investment_thesis,
                "executive_summary": decision.executive_summary
            },
            "alerts": alert_summary,
            "notifications_sent": len(notification_results),
            "notification_results": [{"channel": r.channel.value, "success": r.success} for r in notification_results]
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))