"""
TradingAgents-CN Risk Management Agents
"""

from typing import Dict, Any
from ..base_agent import BaseAgent


class RiskyDebator(BaseAgent):
    """激进风险辩论者"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Risky Debator")

    async def analyze(self, *args, **kwargs) -> str:
        return await self.debate(*args, **kwargs)

    async def debate(self, context: Dict[str, Any], state: Dict[str, Any]) -> str:
        prompt = f"""你是激进派风险分析师。高收益意味着高风险，请从积极角度评估：

投资计划:
{context.get('investment_plan', '')}

基本面:
{context.get('fundamentals_report', '')}

请评估:
1. 激进策略的优势
2. 可接受的风险水平
3. 最大仓位建议 (50%-100%)
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class SafeDebator(BaseAgent):
    """保守风险辩论者"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Safe Debator")

    async def analyze(self, *args, **kwargs) -> str:
        return await self.debate(*args, **kwargs)

    async def debate(self, context: Dict[str, Any], state: Dict[str, Any]) -> str:
        prompt = f"""你是保守派风险分析师。风险控制第一，请从谨慎角度评估：

投资计划:
{context.get('investment_plan', '')}

市场情况:
{context.get('market_report', '')}

请评估:
1. 保守策略的优势
2. 风险警示
3. 最大仓位建议 (0%-30%)
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class NeutralDebator(BaseAgent):
    """中性风险辩论者"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Neutral Debator")

    async def analyze(self, *args, **kwargs) -> str:
        return await self.debate(*args, **kwargs)

    async def debate(self, context: Dict[str, Any], state: Dict[str, Any]) -> str:
        prompt = f"""你是中立风险分析师。平衡风险和收益，请从客观角度评估：

投资计划:
{context.get('investment_plan', '')}

市场报告:
{context.get('market_report', '')}

请评估:
1. 中性策略的考量
2. 风险收益平衡
3. 最大仓位建议 (20%-50%)
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class RiskManager(BaseAgent):
    """风险管理器 - 综合评估"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Risk Manager")

    async def analyze(self, *args, **kwargs) -> str:
        return await self.assess(*args, **kwargs)

    async def assess(
        self,
        risky: str,
        safe: str,
        neutral: str,
        context: Dict[str, Any],
        state: Dict[str, Any]
    ) -> str:
        prompt = f"""作为风险管理总监，综合三方观点给出风险评估：

激进观点:
{risky}

保守观点:
{safe}

中性观点:
{neutral}

请给出:
1. 综合风险评估
2. 建议仓位 (0%-100%)
3. 风险控制措施
4. 止损建议
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


def create_risky_debator(llm, config=None) -> RiskyDebator:
    return RiskyDebator(llm, config)


def create_safe_debator(llm, config=None) -> SafeDebator:
    return SafeDebator(llm, config)


def create_neutral_debator(llm, config=None) -> NeutralDebator:
    return NeutralDebator(llm, config)


def create_risk_manager(llm, config=None) -> RiskManager:
    return RiskManager(llm, config)
