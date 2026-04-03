"""
TradingAgents-CN Researchers
Bull, Bear, and Judge agents
"""

from typing import Dict, Any
from ..base_agent import BaseAgent


class BullResearcher(BaseAgent):
    """看涨研究员"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Bull Researcher")

    async def analyze(self, *args, **kwargs) -> str:
        return await self.research(*args, **kwargs)

    async def research(self, context: Dict[str, Any], state: Dict[str, Any]) -> str:
        prompt = f"""你是看涨分析师。基于以下信息，论证为什么应该采取积极行动：

公司: {context.get('company')}
日期: {context.get('date')}

市场报告:
{context.get('market_report', '')}

基本面报告:
{context.get('fundamentals_report', '')}

新闻报告:
{context.get('news_report', '')}

情绪报告:
{context.get('sentiment_report', '')}

请提供:
1. 支持买入的理由 (至少3点)
2. 预期收益分析
3. 风险提示 (作为看涨方也应客观)
4. 最终建议 (强烈买入/买入/观望)
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class BearResearcher(BaseAgent):
    """看跌研究员"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Bear Researcher")

    async def analyze(self, *args, **kwargs) -> str:
        return await self.research(*args, **kwargs)

    async def research(self, context: Dict[str, Any], state: Dict[str, Any]) -> str:
        prompt = f"""你是看跌分析师。基于以下信息，论证为什么应该谨慎或放弃：

公司: {context.get('company')}
日期: {context.get('date')}

市场报告:
{context.get('market_report', '')}

基本面报告:
{context.get('fundamentals_report', '')}

新闻报告:
{context.get('news_report', '')}

情绪报告:
{context.get('sentiment_report', '')}

请提供:
1. 看跌理由 (至少3点)
2. 潜在风险分析
3. 下行空间评估
4. 最终建议 (强烈卖出/卖出/观望)
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class Judge(BaseAgent):
    """裁判 - 评估双方观点并裁决"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Judge")

    async def analyze(self, *args, **kwargs) -> str:
        return await self.decide(*args, **kwargs)

    async def decide(
        self,
        bull_argument: str,
        bear_argument: str,
        context: Dict[str, Any],
        state: Dict[str, Any]
    ) -> str:
        prompt = f"""作为中立裁判，评估以下看涨和看跌观点：

公司: {context.get('company')}
日期: {context.get('date')}

看涨观点:
{bull_argument}

看跌观点:
{bear_argument}

请评估并给出最终裁决：
1. 综合双方论点
2. 给出决策 (proceed/caution/abort)
3. 置信度 (0-1)
4. 投资计划建议
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


def create_bull_researcher(llm, config=None) -> BullResearcher:
    return BullResearcher(llm, config)


def create_bear_researcher(llm, config=None) -> BearResearcher:
    return BearResearcher(llm, config)


def create_judge(llm, config=None) -> Judge:
    return Judge(llm, config)
