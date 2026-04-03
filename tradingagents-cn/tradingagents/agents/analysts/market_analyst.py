"""
TradingAgents-CN Market Analyst
Market technical analysis agent
"""

from typing import Dict, Any
from ..base_agent import BaseAgent


class MarketAnalyst(BaseAgent):
    """市场技术分析师"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Market Analyst")

    async def analyze(
        self,
        company: str,
        trade_date: str,
        state: Dict[str, Any]
    ) -> str:
        """执行市场技术分析"""
        prompt = self._build_prompt(company, trade_date, state)
        response = await self.llm.ainvoke(prompt)
        return self._format_report(response, company, trade_date)

    def _build_prompt(
        self,
        company: str,
        trade_date: str,
        state: Dict[str, Any]
    ) -> str:
        return f"""你是一位专业的股票技术分析师。

请分析 {company} 在 {trade_date} 的市场技术面：

分析维度：
1. 价格趋势分析 (MACD, KDJ, RSI等)
2. 均线系统分析 (MA5, MA10, MA20, MA60)
3. 成交量分析
4. 支撑位和压力位识别
5. 技术形态识别

请生成一份详细的技术分析报告，包括：
- 当前技术指标数值
- 技术信号 (买入/卖出/中性)
- 短期和中长期趋势判断
- 风险提示

报告格式要求：
1. 结构清晰，使用Markdown格式
2. 包含具体的数值指标
3. 给出明确的分析结论
"""

    def _format_report(
        self,
        response: Any,
        company: str,
        trade_date: str
    ) -> str:
        """格式化分析报告"""
        content = response.content if hasattr(response, 'content') else str(response)
        return f"""# {company} 市场技术分析报告
**分析日期**: {trade_date}
**分析师**: {self.name}

## 技术分析结果

{content}

---
*本报告由AI技术分析生成，仅供参考*
"""


def create_market_analyst(llm, config=None) -> MarketAnalyst:
    """工厂函数：创建市场分析师"""
    return MarketAnalyst(llm, config)
