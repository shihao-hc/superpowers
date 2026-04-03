"""
Multi-Agent Trading System (基于TradingAgents)

Implements a team of specialized AI agents for comprehensive stock analysis:
- FundamentalAnalyst: Analyzes financial statements and fundamentals
- TechnicalAnalyst: Analyzes price patterns and technical indicators  
- SentimentAnalyst: Analyzes news sentiment and market mood
- RiskManager: Manages risk and position limits
- Trader: Executes trading decisions
- PortfolioManager: Oversees portfolio allocation

Based on TauricResearch/TradingAgents framework design.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional
from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field
import asyncio
from loguru import logger


class AgentRole(Enum):
    """Agent roles in the trading team."""
    FUNDAMENTAL = "fundamental"
    TECHNICAL = "technical"
    SENTIMENT = "sentiment"
    RISK_MANAGER = "risk_manager"
    TRADER = "trader"
    PORTFOLIO_MANAGER = "portfolio_manager"


class AnalysisSignal(Enum):
    """Trading signals with 5-tier rating (TradingAgents style)."""
    STRONG_BUY = "strong_buy"      # 强烈买入
    BUY = "buy"                     # 买入
    HOLD = "hold"                   # 持有
    UNDERWEIGHT = "underweight"     # 减持
    SELL = "sell"                   # 卖出


class AgentAnalysis(BaseModel):
    """Analysis result from an agent."""
    agent_role: AgentRole
    symbol: str
    signal: AnalysisSignal
    confidence: float = Field(ge=0.0, le=1.0)
    reasoning: str
    key_factors: List[str]
    risk_factors: List[str] = []
    metadata: Dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=datetime.now)


class TeamDecision(BaseModel):
    """Final decision from the agent team."""
    symbol: str
    final_signal: AnalysisSignal
    consensus_score: float
    agent_analyses: List[AgentAnalysis]
    investment_thesis: str
    executive_summary: str
    approved_by_pm: bool = False
    timestamp: datetime = Field(default_factory=datetime.now)


class BaseAgent(ABC):
    """
    Abstract base class for all trading agents.
    
    Based on TradingAgents framework agent design.
    """
    
    def __init__(self, role: AgentRole, config: Dict[str, Any] = None):
        self.role = role
        self.config = config or {}
        self.name = f"{role.value}_agent"
    
    @abstractmethod
    async def analyze(
        self,
        symbol: str,
        market_data: Dict[str, Any],
        context: Dict[str, Any] = None
    ) -> AgentAnalysis:
        """Perform analysis for a given symbol."""
        pass
    
    def get_system_prompt(self) -> str:
        """Get the system prompt for this agent."""
        prompts = {
            AgentRole.FUNDAMENTAL: """You are a fundamental analyst agent. 
            Analyze financial statements, valuation metrics, growth prospects, 
            and competitive positioning. Focus on intrinsic value assessment.""",
            
            AgentRole.TECHNICAL: """You are a technical analyst agent.
            Analyze price patterns, trends, support/resistance levels, 
            and technical indicators. Focus on timing and price momentum.""",
            
            AgentRole.SENTIMENT: """You are a sentiment analyst agent.
            Analyze news sentiment, social media buzz, analyst ratings,
            and market mood. Focus on market psychology and sentiment shifts.""",
            
            AgentRole.RISK_MANAGER: """You are a risk management agent.
            Evaluate position risk, portfolio exposure, correlation risks,
            and set appropriate stop-loss levels. Focus on capital preservation.""",
            
            AgentRole.TRADER: """You are a trading agent.
            Synthesize all analyses and make trading decisions considering
            timing, position sizing, and execution strategy.""",
            
            AgentRole.PORTFOLIO_MANAGER: """You are a portfolio manager agent.
            Approve or reject trade proposals based on portfolio fit,
            risk-adjusted returns, and strategic allocation goals."""
        }
        return prompts.get(self.role, "You are a trading assistant.")


class FundamentalAnalyst(BaseAgent):
    """Fundamental analysis agent (基本面分析师)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(AgentRole.FUNDAMENTAL, config)
    
    async def analyze(
        self,
        symbol: str,
        market_data: Dict[str, Any],
        context: Dict[str, Any] = None
    ) -> AgentAnalysis:
        """Analyze fundamental data."""
        features = market_data.get("features", {})
        
        # Analyze key fundamental metrics
        pe_ratio = features.get("pe_ratio", 0)
        pb_ratio = features.get("pb_ratio", 0)
        roe = features.get("roe", 0)
        revenue_growth = features.get("revenue_growth", 0)
        
        # Determine signal based on fundamentals
        score = 0
        key_factors = []
        risk_factors = []
        
        # PE analysis
        if pe_ratio > 0 and pe_ratio < 15:
            score += 1
            key_factors.append(f"低PE ({pe_ratio:.1f})，估值合理")
        elif pe_ratio > 30:
            score -= 1
            risk_factors.append(f"高PE ({pe_ratio:.1f})，估值偏高")
        
        # ROE analysis
        if roe > 0.15:
            score += 1
            key_factors.append(f"高ROE ({roe:.1%})，盈利能力强")
        elif roe < 0.05:
            score -= 1
            risk_factors.append(f"低ROE ({roe:.1%})，盈利能力弱")
        
        # Revenue growth
        if revenue_growth > 0.1:
            score += 1
            key_factors.append(f"营收增长 ({revenue_growth:.1%})，成长性好")
        
        # Map score to signal
        if score >= 2:
            signal = AnalysisSignal.BUY
        elif score <= -1:
            signal = AnalysisSignal.UNDERWEIGHT
        else:
            signal = AnalysisSignal.HOLD
        
        return AgentAnalysis(
            agent_role=self.role,
            symbol=symbol,
            signal=signal,
            confidence=min(0.9, 0.5 + abs(score) * 0.1),
            reasoning=f"基于基本面分析，PE={pe_ratio:.1f}，ROE={roe:.1%}，营收增长={revenue_growth:.1%}",
            key_factors=key_factors,
            risk_factors=risk_factors,
            metadata={"pe": pe_ratio, "pb": pb_ratio, "roe": roe}
        )


class TechnicalAnalyst(BaseAgent):
    """Technical analysis agent (技术分析师)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(AgentRole.TECHNICAL, config)
    
    async def analyze(
        self,
        symbol: str,
        market_data: Dict[str, Any],
        context: Dict[str, Any] = None
    ) -> AgentAnalysis:
        """Analyze technical indicators."""
        features = market_data.get("features", {})
        
        rsi = features.get("rsi_14", 50)
        macd = features.get("macd_histogram", 0)
        adx = features.get("adx", 20)
        returns_5d = features.get("returns_5d", 0)
        returns_20d = features.get("returns_20d", 0)
        
        score = 0
        key_factors = []
        risk_factors = []
        
        # RSI analysis
        if rsi < 30:
            score += 1
            key_factors.append(f"RSI超卖 ({rsi:.1f})，可能反弹")
        elif rsi > 70:
            score -= 1
            risk_factors.append(f"RSI超买 ({rsi:.1f})，注意回调")
        
        # MACD analysis
        if macd > 0:
            score += 1
            key_factors.append("MACD柱为正，上涨动能")
        else:
            score -= 0.5
            risk_factors.append("MACD柱为负，下跌动能")
        
        # Trend strength (ADX)
        if adx > 25:
            if returns_20d > 0:
                score += 1
                key_factors.append(f"强上涨趋势 (ADX={adx:.1f})")
            else:
                score -= 1
                risk_factors.append(f"强下跌趋势 (ADX={adx:.1f})")
        
        # Momentum
        if returns_5d > 0.05:
            score += 0.5
            key_factors.append(f"短期动量强劲 ({returns_5d:.1%})")
        
        # Map score to signal
        if score >= 2:
            signal = AnalysisSignal.BUY
        elif score <= -1.5:
            signal = AnalysisSignal.SELL
        else:
            signal = AnalysisSignal.HOLD
        
        return AgentAnalysis(
            agent_role=self.role,
            symbol=symbol,
            signal=signal,
            confidence=min(0.9, 0.5 + abs(score) * 0.1),
            reasoning=f"技术指标分析：RSI={rsi:.1f}，MACD={macd:.4f}，ADX={adx:.1f}",
            key_factors=key_factors,
            risk_factors=risk_factors,
            metadata={"rsi": rsi, "macd": macd, "adx": adx}
        )


class SentimentAnalyst(BaseAgent):
    """Sentiment analysis agent (情绪分析师)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(AgentRole.SENTIMENT, config)
    
    async def analyze(
        self,
        symbol: str,
        market_data: Dict[str, Any],
        context: Dict[str, Any] = None
    ) -> AgentAnalysis:
        """Analyze market sentiment."""
        # For now, use volume ratio as sentiment proxy
        features = market_data.get("features", {})
        volume_ratio = features.get("volume_ratio", 1.0)
        returns_5d = features.get("returns_5d", 0)
        
        score = 0
        key_factors = []
        risk_factors = []
        
        # Volume analysis (high volume = high interest)
        if volume_ratio > 1.5:
            if returns_5d > 0:
                score += 1
                key_factors.append("放量上涨，市场情绪积极")
            else:
                score -= 1
                risk_factors.append("放量下跌，市场情绪悲观")
        elif volume_ratio < 0.5:
            risk_factors.append("成交量低迷，关注度下降")
        
        # Map score to signal
        if score >= 1:
            signal = AnalysisSignal.BUY
        elif score <= -1:
            signal = AnalysisSignal.UNDERWEIGHT
        else:
            signal = AnalysisSignal.HOLD
        
        return AgentAnalysis(
            agent_role=self.role,
            symbol=symbol,
            signal=signal,
            confidence=min(0.8, 0.5 + abs(score) * 0.15),
            reasoning=f"情绪分析：成交量比={volume_ratio:.2f}，近期收益={returns_5d:.2%}",
            key_factors=key_factors,
            risk_factors=risk_factors,
            metadata={"volume_ratio": volume_ratio}
        )


class RiskManager(BaseAgent):
    """Risk management agent (风险经理)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(AgentRole.RISK_MANAGER, config)
    
    async def analyze(
        self,
        symbol: str,
        market_data: Dict[str, Any],
        context: Dict[str, Any] = None
    ) -> AgentAnalysis:
        """Assess risk factors."""
        features = market_data.get("features", {})
        volatility = features.get("volatility_20d", 0.2)
        max_drawdown = features.get("dist_from_52w_high", 0)
        
        score = 0
        key_factors = []
        risk_factors = []
        
        # Volatility check
        if volatility > 0.4:
            score -= 1
            risk_factors.append(f"高波动率 ({volatility:.1%})，风险较大")
        elif volatility < 0.15:
            score += 0.5
            key_factors.append(f"低波动率 ({volatility:.1%})，相对稳定")
        
        # Drawdown check
        if max_drawdown < -0.2:
            score -= 0.5
            risk_factors.append(f"从高点回落 {abs(max_drawdown):.1%}")
        
        # Risk-adjusted decision
        if score >= 0:
            signal = AnalysisSignal.HOLD
        else:
            signal = AnalysisSignal.UNDERWEIGHT
        
        return AgentAnalysis(
            agent_role=self.role,
            symbol=symbol,
            signal=signal,
            confidence=0.7,
            reasoning=f"风险评估：波动率={volatility:.1%}，回撤={max_drawdown:.1%}",
            key_factors=key_factors,
            risk_factors=risk_factors,
            metadata={"volatility": volatility, "drawdown": max_drawdown}
        )


class Trader(BaseAgent):
    """Trading agent (交易员)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(AgentRole.TRADER, config)
    
    async def analyze(
        self,
        symbol: str,
        market_data: Dict[str, Any],
        context: Dict[str, Any] = None
    ) -> AgentAnalysis:
        """Make trading decision based on all analyses."""
        # Get analyses from other agents
        agent_analyses = context.get("agent_analyses", []) if context else []
        
        # Count signals
        buy_signals = sum(1 for a in agent_analyses 
                         if a.signal in [AnalysisSignal.BUY, AnalysisSignal.STRONG_BUY])
        sell_signals = sum(1 for a in agent_analyses 
                          if a.signal in [AnalysisSignal.SELL, AnalysisSignal.UNDERWEIGHT])
        
        key_factors = []
        
        if buy_signals > sell_signals:
            signal = AnalysisSignal.BUY
            key_factors.append(f"{buy_signals}个买入信号 vs {sell_signals}个卖出信号")
        elif sell_signals > buy_signals:
            signal = AnalysisSignal.UNDERWEIGHT
            key_factors.append(f"{sell_signals}个卖出信号 vs {buy_signals}个买入信号")
        else:
            signal = AnalysisSignal.HOLD
            key_factors.append("信号均衡，建议观望")
        
        return AgentAnalysis(
            agent_role=self.role,
            symbol=symbol,
            signal=signal,
            confidence=0.75,
            reasoning=f"综合各分析师意见，买入:{buy_signals}，卖出:{sell_signals}",
            key_factors=key_factors,
            metadata={"buy_signals": buy_signals, "sell_signals": sell_signals}
        )


class PortfolioManager(BaseAgent):
    """Portfolio manager agent (投资组合经理)."""
    
    def __init__(self, config: Dict[str, Any] = None):
        super().__init__(AgentRole.PORTFOLIO_MANAGER, config)
    
    async def analyze(
        self,
        symbol: str,
        market_data: Dict[str, Any],
        context: Dict[str, Any] = None
    ) -> AgentAnalysis:
        """Approve or reject trade proposal."""
        trader_analysis = context.get("trader_analysis") if context else None
        
        if not trader_analysis:
            return AgentAnalysis(
                agent_role=self.role,
                symbol=symbol,
                signal=AnalysisSignal.HOLD,
                confidence=0.5,
                reasoning="缺少交易员分析，暂不批准",
                key_factors=["信息不完整"],
                risk_factors=["分析数据不足"]
            )
        
        # Simple approval logic
        if trader_analysis.signal in [AnalysisSignal.BUY, AnalysisSignal.STRONG_BUY]:
            if trader_analysis.confidence > 0.6:
                signal = AnalysisSignal.BUY
                key_factors = ["交易信号明确", "置信度达标"]
            else:
                signal = AnalysisSignal.HOLD
                key_factors = ["置信度不足，暂缓执行"]
        else:
            signal = trader_analysis.signal
            key_factors = ["遵循交易员建议"]
        
        return AgentAnalysis(
            agent_role=self.role,
            symbol=symbol,
            signal=signal,
            confidence=trader_analysis.confidence,
            reasoning=f"投资组合经理审批：{signal.value}",
            key_factors=key_factors,
            metadata={"approved": signal == AnalysisSignal.BUY}
        )


class TradingAgentTeam:
    """
    Multi-Agent Trading Team (多智能体交易团队)
    
    Based on TauricResearch/TradingAgents framework.
    Coordinates multiple specialized agents to make trading decisions.
    """
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        
        # Initialize all agents
        self.agents = {
            AgentRole.FUNDAMENTAL: FundamentalAnalyst(config),
            AgentRole.TECHNICAL: TechnicalAnalyst(config),
            AgentRole.SENTIMENT: SentimentAnalyst(config),
            AgentRole.RISK_MANAGER: RiskManager(config),
            AgentRole.TRADER: Trader(config),
            AgentRole.PORTFOLIO_MANAGER: PortfolioManager(config),
        }
        
        logger.info("TradingAgentTeam initialized with 6 agents")
    
    async def analyze_stock(
        self,
        symbol: str,
        market_data: Dict[str, Any]
    ) -> TeamDecision:
        """
        Run full analysis pipeline on a stock.
        
        Pipeline:
        1. Fundamental Analysis
        2. Technical Analysis
        3. Sentiment Analysis
        4. Risk Assessment
        5. Trading Decision
        6. Portfolio Manager Approval
        """
        logger.info(f"Starting multi-agent analysis for {symbol}")
        
        # Phase 1-3: Parallel analysis
        analyses = await asyncio.gather(
            self.agents[AgentRole.FUNDAMENTAL].analyze(symbol, market_data),
            self.agents[AgentRole.TECHNICAL].analyze(symbol, market_data),
            self.agents[AgentRole.SENTIMENT].analyze(symbol, market_data),
        )
        
        fundamental_analysis, technical_analysis, sentiment_analysis = analyses
        
        # Phase 4: Risk assessment
        risk_analysis = await self.agents[AgentRole.RISK_MANAGER].analyze(
            symbol, market_data
        )
        
        # Phase 5: Trading decision (uses all previous analyses)
        agent_analyses = [fundamental_analysis, technical_analysis, 
                         sentiment_analysis, risk_analysis]
        
        trader_analysis = await self.agents[AgentRole.TRADER].analyze(
            symbol, market_data,
            context={"agent_analyses": agent_analyses}
        )
        
        # Phase 6: Portfolio manager approval
        pm_analysis = await self.agents[AgentRole.PORTFOLIO_MANAGER].analyze(
            symbol, market_data,
            context={"trader_analysis": trader_analysis}
        )
        
        # Calculate consensus
        all_analyses = agent_analyses + [trader_analysis, pm_analysis]
        final_signal = self._calculate_consensus(all_analyses)
        consensus_score = self._calculate_consensus_score(all_analyses)
        
        # Generate investment thesis
        investment_thesis = self._generate_thesis(symbol, all_analyses)
        executive_summary = self._generate_summary(symbol, final_signal, all_analyses)
        
        return TeamDecision(
            symbol=symbol,
            final_signal=final_signal,
            consensus_score=consensus_score,
            agent_analyses=all_analyses,
            investment_thesis=investment_thesis,
            executive_summary=executive_summary,
            approved_by_pm=pm_analysis.metadata.get("approved", False)
        )
    
    def _calculate_consensus(self, analyses: List[AgentAnalysis]) -> AnalysisSignal:
        """Calculate consensus signal from all agents."""
        signal_weights = {
            AnalysisSignal.STRONG_BUY: 2,
            AnalysisSignal.BUY: 1,
            AnalysisSignal.HOLD: 0,
            AnalysisSignal.UNDERWEIGHT: -1,
            AnalysisSignal.SELL: -2
        }
        
        weighted_sum = sum(
            signal_weights[a.signal] * a.confidence 
            for a in analyses
        )
        total_weight = sum(a.confidence for a in analyses)
        
        avg_score = weighted_sum / total_weight if total_weight > 0 else 0
        
        if avg_score >= 1.0:
            return AnalysisSignal.STRONG_BUY
        elif avg_score >= 0.3:
            return AnalysisSignal.BUY
        elif avg_score <= -1.0:
            return AnalysisSignal.SELL
        elif avg_score <= -0.3:
            return AnalysisSignal.UNDERWEIGHT
        else:
            return AnalysisSignal.HOLD
    
    def _calculate_consensus_score(self, analyses: List[AgentAnalysis]) -> float:
        """Calculate consensus confidence score."""
        return sum(a.confidence for a in analyses) / len(analyses)
    
    def _generate_thesis(self, symbol: str, analyses: List[AgentAnalysis]) -> str:
        """Generate investment thesis from analyses."""
        key_points = []
        for analysis in analyses:
            if analysis.key_factors:
                key_points.extend(analysis.key_factors[:2])
        
        return f"{symbol}投资要点：\n" + "\n".join(f"• {p}" for p in key_points[:5])
    
    def _generate_summary(
        self, 
        symbol: str, 
        signal: AnalysisSignal,
        analyses: List[AgentAnalysis]
    ) -> str:
        """Generate executive summary."""
        signal_text = {
            AnalysisSignal.STRONG_BUY: "强烈推荐买入",
            AnalysisSignal.BUY: "建议买入",
            AnalysisSignal.HOLD: "建议持有观望",
            AnalysisSignal.UNDERWEIGHT: "建议减持",
            AnalysisSignal.SELL: "建议卖出"
        }
        
        return f"{symbol}: {signal_text[signal]}。基于{len(analyses)}个专业分析师的综合评估。"