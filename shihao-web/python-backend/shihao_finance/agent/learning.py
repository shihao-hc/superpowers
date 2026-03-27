from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class OutcomeType(Enum):
    SUCCESS = "success"
    FAILURE = "failure"
    NEUTRAL = "neutral"


@dataclass
class TradeOutcome:
    """交易结果记录"""
    ticker: str
    action: str
    entry_price: float
    exit_price: float
    pnl_pct: float
    outcome_type: OutcomeType
    entry_time: Optional[datetime] = None
    exit_time: Optional[datetime] = None
    reasoning: str = ""
    agent_analyses: dict = field(default_factory=dict)


class SelfImprovingAgent:
    """具备自我学习能力的Agent"""
    
    def __init__(self, memory, crew, learning_threshold: float = 0.85):
        self.memory = memory
        self.crew = crew
        self.learning_threshold = learning_threshold
        self.trade_history: list[TradeOutcome] = []
    
    async def analyze(self, tickers: list[str]) -> dict:
        """执行分析"""
        
        await self.memory.add_recall_memory(
            text=f"分析{tickers}",
            user_id="system",
            categories=["analysis"]
        )
        
        return {"tickers": tickers, "status": "analyzed"}
    
    async def record_outcome(self, outcome: TradeOutcome):
        """记录交易结果"""
        self.trade_history.append(outcome)
        
        await self.memory.add_recall_memory(
            text=f"交易{outcome.ticker}: {'盈利' if outcome.pnl_pct > 0 else '亏损'}{abs(outcome.pnl_pct):.1%}",
            user_id="system",
            categories=["trade_outcome"]
        )
    
    def get_success_rate(self) -> float:
        """计算成功率"""
        if not self.trade_history:
            return 0.0
        
        successes = sum(1 for t in self.trade_history if t.outcome_type == OutcomeType.SUCCESS)
        return successes / len(self.trade_history)
    
    def get_patterns(self) -> dict:
        """获取学习到的模式"""
        from shihao_finance.agent.patterns import PatternExtractor
        extractor = PatternExtractor()
        return extractor.extract(self.trade_history)