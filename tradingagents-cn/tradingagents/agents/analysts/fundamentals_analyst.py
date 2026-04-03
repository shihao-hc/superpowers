"""
TradingAgents-CN Fundamentals Analyst
Fundamental financial analysis agent
"""

from typing import Dict, Any
from ..base_agent import BaseAgent


class FundamentalsAnalyst(BaseAgent):
    """基本面分析师"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Fundamentals Analyst")

    async def analyze(
        self,
        company: str,
        trade_date: str,
        state: Dict[str, Any]
    ) -> str:
        """执行基本面分析"""
        prompt = self._build_prompt(company, trade_date, state)
        response = await self.llm.ainvoke(prompt)
        return self._format_report(response, company, trade_date)

    def _build_prompt(
        self,
        company: str,
        trade_date: str,
        state: Dict[str, Any]
    ) -> str:
        return f"""你是一位专业的基本面分析师。

请分析 {company} 在 {trade_date} 的基本面：

分析维度：
1. 财务指标 (PE, PB, ROE, ROA, 毛利率等)
2. 盈利能力分析 (营收增长, 净利润增长)
3. 资产负债分析
4. 现金流分析
5. 估值分析 (相对估值, 绝对估值)

请生成一份详细的基本面分析报告，包括：
- 关键财务指标数值
- 财务健康状况评估
- 盈利能力和成长性分析
- 估值合理性判断
- 投资价值评估

报告格式要求：
1. 结构清晰，使用Markdown格式
2. 包含具体的财务数据
3. 给出明确的分析结论
"""

    def _format_report(
        self,
        response: Any,
        company: str,
        trade_date: str
    ) -> str:
        content = response.content if hasattr(response, 'content') else str(response)
        return f"""# {company} 基本面分析报告
**分析日期**: {trade_date}
**分析师**: {self.name}

## 基本面分析结果

{content}

---
*本报告由AI基本面分析生成，仅供参考*
"""


def create_fundamentals_analyst(llm, config=None) -> FundamentalsAnalyst:
    """工厂函数：创建基本面分析师"""
    return FundamentalsAnalyst(llm, config)
