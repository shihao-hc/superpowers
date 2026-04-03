"""
7大预警规则系统 (基于stock-monitor-skill)

实现完整的股票监控预警系统，包含以下7大规则：
1. 成本百分比 - 盈利+15% / 亏损-12%
2. 均线金叉死叉 - MA交叉信号
3. RSI超买超卖 - RSI > 70 / < 30
4. 成交量异动 - 放量/缩量检测
5. 跳空缺口 - 价格跳空检测
6. 动态止盈 - 跟踪止盈
7. 涨跌幅限制 - 日内涨跌幅

符合中国投资者习惯（红涨绿跌）。
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field
import pandas as pd
import numpy as np
from loguru import logger


class AlertLevel(Enum):
    """Alert severity levels."""
    INFO = "info"           # 信息
    WARNING = "warning"     # 警告
    URGENT = "urgent"       # 紧急
    EMERGENCY = "emergency" # 紧急（多条件共振）


class AlertType(Enum):
    """Alert types (7 rules)."""
    COST_PERCENTAGE = "cost_percentage"      # 1. 成本百分比
    MA_CROSSOVER = "ma_crossover"            # 2. 均线金叉死叉
    RSI_EXTREME = "rsi_extreme"              # 3. RSI超买超卖
    VOLUME_ANOMALY = "volume_anomaly"        # 4. 成交量异动
    GAP_DETECTION = "gap_detection"          # 5. 跳空缺口
    TRAILING_STOP = "trailing_stop"          # 6. 动态止盈
    DAILY_LIMIT = "daily_limit"              # 7. 涨跌幅限制


class Alert(BaseModel):
    """Alert notification."""
    symbol: str
    alert_type: AlertType
    level: AlertLevel
    title: str
    message: str
    current_value: float
    threshold_value: float
    action_suggestion: str
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class Position(BaseModel):
    """Position information for monitoring."""
    symbol: str
    name: str
    cost_price: float
    quantity: int
    current_price: float = 0.0
    market: str = "sh"  # sh/sz/hk/us


class BaseAlertRule(ABC):
    """Abstract base class for alert rules."""
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.enabled = True
    
    @abstractmethod
    def check(
        self,
        position: Position,
        market_data: pd.DataFrame
    ) -> List[Alert]:
        """Check for alerts based on the rule."""
        pass
    
    @property
    @abstractmethod
    def rule_name(self) -> str:
        """Rule name."""
        pass
    
    @property
    @abstractmethod
    def priority(self) -> int:
        """Rule priority (1-3, 3=highest)."""
        pass


class CostPercentageRule(BaseAlertRule):
    """
    Rule 1: 成本百分比预警
    
    Trigger conditions:
    - Profit > 15%: Take profit warning
    - Loss > 12%: Stop loss warning
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.profit_threshold = self.config.get("profit_threshold", 0.15)
        self.loss_threshold = self.config.get("loss_threshold", -0.12)
    
    @property
    def rule_name(self) -> str:
        return "成本百分比"
    
    @property
    def priority(self) -> int:
        return 3
    
    def check(self, position: Position, market_data: pd.DataFrame) -> List[Alert]:
        alerts = []
        
        if position.cost_price <= 0 or position.current_price <= 0:
            return alerts
        
        # Calculate P&L percentage
        pnl_pct = (position.current_price - position.cost_price) / position.cost_price
        
        # Profit threshold check
        if pnl_pct >= self.profit_threshold:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.COST_PERCENTAGE,
                level=AlertLevel.WARNING,
                title=f"💰 {position.name} 盈利达标",
                message=f"当前盈利 {pnl_pct:.1%}，达到止盈目标 {self.profit_threshold:.0%}",
                current_value=pnl_pct,
                threshold_value=self.profit_threshold,
                action_suggestion="考虑止盈或调整止盈位",
                metadata={"pnl_pct": pnl_pct, "action": "take_profit"}
            ))
        
        # Loss threshold check
        elif pnl_pct <= self.loss_threshold:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.COST_PERCENTAGE,
                level=AlertLevel.URGENT,
                title=f"🔴 {position.name} 亏损预警",
                message=f"当前亏损 {pnl_pct:.1%}，接近止损线 {self.loss_threshold:.0%}",
                current_value=pnl_pct,
                threshold_value=self.loss_threshold,
                action_suggestion="严格执行止损，控制风险",
                metadata={"pnl_pct": pnl_pct, "action": "stop_loss"}
            ))
        
        return alerts


class MACrossoverRule(BaseAlertRule):
    """
    Rule 2: 均线金叉死叉预警
    
    Golden Cross (金叉): MA5 > MA10 > MA20
    Death Cross (死叉): MA5 < MA10 < MA20
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.ma_short = self.config.get("ma_short", 5)
        self.ma_long = self.config.get("ma_long", 20)
    
    @property
    def rule_name(self) -> str:
        return "均线金叉死叉"
    
    @property
    def priority(self) -> int:
        return 2
    
    def check(self, position: Position, market_data: pd.DataFrame) -> List[Alert]:
        alerts = []
        
        if len(market_data) < self.ma_long + 2:
            return alerts
        
        close = market_data['close']
        
        # Calculate MAs
        ma_short = close.rolling(window=self.ma_short).mean()
        ma_long = close.rolling(window=self.ma_long).mean()
        
        # Check crossover
        current_ma_short = ma_short.iloc[-1]
        current_ma_long = ma_long.iloc[-1]
        prev_ma_short = ma_short.iloc[-2]
        prev_ma_long = ma_long.iloc[-2]
        
        # Golden Cross (金叉)
        if prev_ma_short <= prev_ma_long and current_ma_short > current_ma_long:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.MA_CROSSOVER,
                level=AlertLevel.WARNING,
                title=f"🟢 {position.name} 均线金叉",
                message=f"MA{self.ma_short} 上穿 MA{self.ma_long}，短期趋势转强",
                current_value=current_ma_short,
                threshold_value=current_ma_long,
                action_suggestion="关注买入机会",
                metadata={"type": "golden_cross", "ma_short": current_ma_short, "ma_long": current_ma_long}
            ))
        
        # Death Cross (死叉)
        elif prev_ma_short >= prev_ma_long and current_ma_short < current_ma_long:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.MA_CROSSOVER,
                level=AlertLevel.URGENT,
                title=f"🔴 {position.name} 均线死叉",
                message=f"MA{self.ma_short} 下穿 MA{self.ma_long}，短期趋势转弱",
                current_value=current_ma_short,
                threshold_value=current_ma_long,
                action_suggestion="考虑减仓或止损",
                metadata={"type": "death_cross", "ma_short": current_ma_short, "ma_long": current_ma_long}
            ))
        
        return alerts


class RSIExtremeRule(BaseAlertRule):
    """
    Rule 3: RSI超买超卖预警
    
    - RSI > 70: Overbought (超买)
    - RSI < 30: Oversold (超卖)
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.overbought = self.config.get("overbought", 70)
        self.oversold = self.config.get("oversold", 30)
        self.rsi_period = self.config.get("rsi_period", 14)
    
    @property
    def rule_name(self) -> str:
        return "RSI超买超卖"
    
    @property
    def priority(self) -> int:
        return 2
    
    def _calculate_rsi(self, prices: pd.Series, period: int) -> float:
        """Calculate RSI."""
        delta = prices.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))
        return rsi.iloc[-1]
    
    def check(self, position: Position, market_data: pd.DataFrame) -> List[Alert]:
        alerts = []
        
        if len(market_data) < self.rsi_period + 5:
            return alerts
        
        rsi = self._calculate_rsi(market_data['close'], self.rsi_period)
        
        # Overbought
        if rsi >= self.overbought:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.RSI_EXTREME,
                level=AlertLevel.WARNING,
                title=f"⚠️ {position.name} RSI超买",
                message=f"RSI({self.rsi_period}) = {rsi:.1f}，进入超买区域",
                current_value=rsi,
                threshold_value=self.overbought,
                action_suggestion="注意回调风险，考虑减仓",
                metadata={"rsi": rsi, "condition": "overbought"}
            ))
        
        # Oversold
        elif rsi <= self.oversold:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.RSI_EXTREME,
                level=AlertLevel.INFO,
                title=f"💡 {position.name} RSI超卖",
                message=f"RSI({self.rsi_period}) = {rsi:.1f}，进入超卖区域",
                current_value=rsi,
                threshold_value=self.oversold,
                action_suggestion="关注反弹机会",
                metadata={"rsi": rsi, "condition": "oversold"}
            ))
        
        return alerts


class VolumeAnomalyRule(BaseAlertRule):
    """
    Rule 4: 成交量异动预警
    
    - Volume > 2x average: 放量
    - Volume < 0.5x average: 缩量
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.surge_threshold = self.config.get("surge_threshold", 2.0)
        self.shrink_threshold = self.config.get("shrink_threshold", 0.5)
        self.avg_period = self.config.get("avg_period", 20)
    
    @property
    def rule_name(self) -> str:
        return "成交量异动"
    
    @property
    def priority(self) -> int:
        return 1
    
    def check(self, position: Position, market_data: pd.DataFrame) -> List[Alert]:
        alerts = []
        
        if len(market_data) < self.avg_period + 1:
            return alerts
        
        current_volume = market_data['volume'].iloc[-1]
        avg_volume = market_data['volume'].tail(self.avg_period).mean()
        
        if avg_volume <= 0:
            return alerts
        
        volume_ratio = current_volume / avg_volume
        returns = (market_data['close'].iloc[-1] - market_data['close'].iloc[-2]) / market_data['close'].iloc[-2]
        
        # Volume surge
        if volume_ratio >= self.surge_threshold:
            if returns > 0:
                title = f"📈 {position.name} 放量上涨"
                message = f"成交量是{self.avg_period}日均量的 {volume_ratio:.1f} 倍，股价上涨"
                level = AlertLevel.INFO
                suggestion = "关注后续走势，放量上涨通常是积极信号"
            else:
                title = f"📉 {position.name} 放量下跌"
                message = f"成交量是{self.avg_period}日均量的 {volume_ratio:.1f} 倍，股价下跌"
                level = AlertLevel.URGENT
                suggestion = "注意风险，放量下跌可能是主力出货"
            
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.VOLUME_ANOMALY,
                level=level,
                title=title,
                message=message,
                current_value=volume_ratio,
                threshold_value=self.surge_threshold,
                action_suggestion=suggestion,
                metadata={"volume_ratio": volume_ratio, "returns": returns}
            ))
        
        # Volume shrink
        elif volume_ratio <= self.shrink_threshold:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.VOLUME_ANOMALY,
                level=AlertLevel.INFO,
                title=f"📊 {position.name} 成交量萎缩",
                message=f"成交量仅为{self.avg_period}日均量的 {volume_ratio:.1%}",
                current_value=volume_ratio,
                threshold_value=self.shrink_threshold,
                action_suggestion="关注突破方向，低量之后往往会有方向选择",
                metadata={"volume_ratio": volume_ratio}
            ))
        
        return alerts


class GapDetectionRule(BaseAlertRule):
    """
    Rule 5: 跳空缺口预警
    
    - Gap up > 2%: 向上跳空
    - Gap down > 2%: 向下跳空
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.gap_threshold = self.config.get("gap_threshold", 0.02)
    
    @property
    def rule_name(self) -> str:
        return "跳空缺口"
    
    @property
    def priority(self) -> int:
        return 2
    
    def check(self, position: Position, market_data: pd.DataFrame) -> List[Alert]:
        alerts = []
        
        if len(market_data) < 2:
            return alerts
        
        prev_close = market_data['close'].iloc[-2]
        current_open = market_data['open'].iloc[-1]
        
        if prev_close <= 0:
            return alerts
        
        gap_pct = (current_open - prev_close) / prev_close
        
        # Gap up
        if gap_pct >= self.gap_threshold:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.GAP_DETECTION,
                level=AlertLevel.WARNING,
                title=f"⬆️ {position.name} 向上跳空",
                message=f"开盘价较昨收高 {gap_pct:.1%}，形成向上缺口",
                current_value=gap_pct,
                threshold_value=self.gap_threshold,
                action_suggestion="关注缺口回补风险，强势跳空可能是突破信号",
                metadata={"gap_pct": gap_pct, "type": "gap_up"}
            ))
        
        # Gap down
        elif gap_pct <= -self.gap_threshold:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.GAP_DETECTION,
                level=AlertLevel.URGENT,
                title=f"⬇️ {position.name} 向下跳空",
                message=f"开盘价较昨收低 {abs(gap_pct):.1%}，形成向下缺口",
                current_value=gap_pct,
                threshold_value=-self.gap_threshold,
                action_suggestion="注意止损，向下跳空可能是利空信号",
                metadata={"gap_pct": gap_pct, "type": "gap_down"}
            ))
        
        return alerts


class TrailingStopRule(BaseAlertRule):
    """
    Rule 6: 动态止盈预警
    
    Track highest price since entry and trigger stop when
    price falls by specified percentage from the high.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.trailing_pct = self.config.get("trailing_pct", 0.10)  # 10% trailing stop
        self.lookback_period = self.config.get("lookback_period", 60)  # 60 days
    
    @property
    def rule_name(self) -> str:
        return "动态止盈"
    
    @property
    def priority(self) -> int:
        return 3
    
    def check(self, position: Position, market_data: pd.DataFrame) -> List[Alert]:
        alerts = []
        
        if len(market_data) < 2:
            return alerts
        
        # Get highest price since entry (or last N days)
        lookback = min(self.lookback_period, len(market_data))
        highest_price = market_data['high'].tail(lookback).max()
        current_price = market_data['close'].iloc[-1]
        
        if highest_price <= 0:
            return alerts
        
        # Calculate trailing stop level
        trailing_stop = highest_price * (1 - self.trailing_pct)
        drop_from_high = (current_price - highest_price) / highest_price
        
        # Check if price hit trailing stop
        if current_price <= trailing_stop:
            total_profit = (current_price - position.cost_price) / position.cost_price if position.cost_price > 0 else 0
            
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.TRAILING_STOP,
                level=AlertLevel.URGENT,
                title=f"🎯 {position.name} 动态止盈触发",
                message=f"从高点 {highest_price:.2f} 回落 {abs(drop_from_high):.1%}，触发动态止盈线",
                current_value=drop_from_high,
                threshold_value=-self.trailing_pct,
                action_suggestion=f"建议止盈，锁定利润。当前累计收益 {total_profit:.1%}",
                metadata={
                    "highest_price": highest_price,
                    "trailing_stop": trailing_stop,
                    "drop_pct": drop_from_high,
                    "total_profit": total_profit
                }
            ))
        
        return alerts


class DailyLimitRule(BaseAlertRule):
    """
    Rule 7: 涨跌幅限制预警
    
    A-shares: ±10% (±20% for 创业板/科创板)
    - Approaching limit up: > 7%
    - Approaching limit down: < -7%
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(config)
        self.limit_pct = self.config.get("limit_pct", 0.10)  # 10% for main board
        self.warning_pct = self.config.get("warning_pct", 0.07)  # Warning at 7%
    
    @property
    def rule_name(self) -> str:
        return "涨跌幅限制"
    
    @property
    def priority(self) -> int:
        return 2
    
    def check(self, position: Position, market_data: pd.DataFrame) -> List[Alert]:
        alerts = []
        
        if len(market_data) < 2:
            return alerts
        
        prev_close = market_data['close'].iloc[-2]
        current_price = market_data['close'].iloc[-1]
        
        if prev_close <= 0:
            return alerts
        
        daily_change = (current_price - prev_close) / prev_close
        
        # Approaching limit up
        if daily_change >= self.warning_pct:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.DAILY_LIMIT,
                level=AlertLevel.INFO,
                title=f"🔥 {position.name} 接近涨停",
                message=f"今日涨幅 {daily_change:.1%}，接近涨停板",
                current_value=daily_change,
                threshold_value=self.warning_pct,
                action_suggestion="持仓者可继续持有，追高需谨慎",
                metadata={"daily_change": daily_change, "type": "near_limit_up"}
            ))
        
        # Approaching limit down
        elif daily_change <= -self.warning_pct:
            alerts.append(Alert(
                symbol=position.symbol,
                alert_type=AlertType.DAILY_LIMIT,
                level=AlertLevel.URGENT,
                title=f"❄️ {position.name} 接近跌停",
                message=f"今日跌幅 {daily_change:.1%}，接近跌停板",
                current_value=daily_change,
                threshold_value=-self.warning_pct,
                action_suggestion="严格执行止损，避免跌停被套",
                metadata={"daily_change": daily_change, "type": "near_limit_down"}
            ))
        
        return alerts


class AlertSystem:
    """
    7大预警规则系统 (Alert System)
    
    Complete stock monitoring and alerting system based on stock-monitor-skill.
    Supports 7 core alert rules with Chinese investor conventions (red up/green down).
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        
        # Initialize all 7 rules
        self.rules: List[BaseAlertRule] = [
            CostPercentageRule(config.get("cost_percentage", {})),
            MACrossoverRule(config.get("ma_crossover", {})),
            RSIExtremeRule(config.get("rsi_extreme", {})),
            VolumeAnomalyRule(config.get("volume_anomaly", {})),
            GapDetectionRule(config.get("gap_detection", {})),
            TrailingStopRule(config.get("trailing_stop", {})),
            DailyLimitRule(config.get("daily_limit", {})),
        ]
        
        # Sort by priority
        self.rules.sort(key=lambda r: r.priority, reverse=True)
        
        logger.info(f"AlertSystem initialized with {len(self.rules)} rules")
    
    def monitor_position(
        self,
        position: Position,
        market_data: pd.DataFrame
    ) -> List[Alert]:
        """
        Monitor a single position and return all triggered alerts.
        """
        all_alerts = []
        
        for rule in self.rules:
            if not rule.enabled:
                continue
            
            try:
                alerts = rule.check(position, market_data)
                all_alerts.extend(alerts)
            except Exception as e:
                logger.error(f"Error in {rule.rule_name} rule: {e}")
        
        return all_alerts
    
    def monitor_portfolio(
        self,
        positions: List[Position],
        market_data_dict: Dict[str, pd.DataFrame]
    ) -> Dict[str, List[Alert]]:
        """
        Monitor all positions in portfolio.
        
        Returns dict of symbol -> alerts.
        """
        results = {}
        
        for position in positions:
            market_data = market_data_dict.get(position.symbol)
            if market_data is not None:
                alerts = self.monitor_position(position, market_data)
                if alerts:
                    results[position.symbol] = alerts
        
        return results
    
    def get_alert_summary(self, alerts: List[Alert]) -> Dict[str, Any]:
        """Generate summary of alerts."""
        summary = {
            "total": len(alerts),
            "by_level": {
                "emergency": 0,
                "urgent": 0,
                "warning": 0,
                "info": 0
            },
            "by_type": {},
            "urgent_actions": []
        }
        
        for alert in alerts:
            # Count by level
            summary["by_level"][alert.level.value] += 1
            
            # Count by type
            alert_type = alert.alert_type.value
            summary["by_type"][alert_type] = summary["by_type"].get(alert_type, 0) + 1
            
            # Collect urgent actions
            if alert.level in [AlertLevel.URGENT, AlertLevel.EMERGENCY]:
                summary["urgent_actions"].append({
                    "symbol": alert.symbol,
                    "title": alert.title,
                    "action": alert.action_suggestion
                })
        
        return summary
    
    def format_alert(self, alert: Alert) -> str:
        """Format alert for display (Chinese style)."""
        level_icons = {
            AlertLevel.INFO: "💡",
            AlertLevel.WARNING: "⚠️",
            AlertLevel.URGENT: "🚨",
            AlertLevel.EMERGENCY: "🔴"
        }
        
        icon = level_icons.get(alert.level, "📢")
        
        return f"""{icon}【{alert.level.value.upper()}】{alert.title}
━━━━━━━━━━━━━━━━━━━━
{alert.message}
💡 建议: {alert.action_suggestion}
━━━━━━━━━━━━━━━━━━━━"""