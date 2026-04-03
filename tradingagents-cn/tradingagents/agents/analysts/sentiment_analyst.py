"""
TradingAgents-CN Sentiment Analyst
Social media sentiment analysis agent
"""

from typing import Dict, Any
from ..base_agent import BaseAgent


class SentimentAnalyst(BaseAgent):
    """情绪分析师"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Sentiment Analyst")

    async def analyze(
        self,
        company: str,
        trade_date: str,
        state: Dict[str, Any]
    ) -> str:
        """执行社交媒体情绪分析"""
        prompt = self._build_prompt(company, trade_date, state)
        response = await self.llm.ainvoke(prompt)
        return self._format_report(response, company, trade_date)

    def _build_prompt(
        self,
        company: str,
        trade_date: str,
        state: Dict[str, Any]
    ) -> str:
        return f"""你是一位专业的社交媒体情绪分析师。

请分析 {company} 在 {trade_date} 的市场情绪：

分析维度：
1. 社交媒体讨论热度
2. 投资者情绪倾向 (看多/看空/中性)
3. 机构评级和分析师观点
4. 市场情绪指标
5. 情绪拐点识别

请生成一份详细的市场情绪分析报告，包括：
- 社交媒体热度评估
- 投资者情绪评分 (1-100)
- 情绪趋势判断
- 情绪对股价的影响分析

报告格式要求：
1. 结构清晰，使用Markdown格式
2. 包含量化的情绪指标
3. 给出明确的情绪判断
"""

    def _format_report(
        self,
        response: Any,
        company: str,
        trade_date: str
    ) -> str:
        content = response.content if hasattr(response, 'content') else str(response)
        return f"""# {company} 市场情绪分析报告
**分析日期**: {trade_date}
**分析师**: {self.name}

## 市场情绪分析结果

{content}

---
*本报告由AI情绪分析生成，仅供参考*
"""


def create_sentiment_analyst(llm, config=None) -> SentimentAnalyst:
    """工厂函数：创建情绪分析师"""
    return SentimentAnalyst(llm, config)
