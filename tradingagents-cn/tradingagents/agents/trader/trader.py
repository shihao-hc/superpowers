"""
TradingAgents-CN Trader Agent
生成最终交易计划
"""

from typing import Dict, Any, Optional
from ..base_agent import BaseAgent


class Trader(BaseAgent):
    """
    交易员智能体
    基于分析师报告和辩论结果，生成最终交易计划
    """

    def __init__(self, llm, config: Optional[Dict[str, Any]] = None):
        super().__init__(llm, config, name="Trader")
        self.max_position_size = config.get("max_position_size", 0.1) if config else 0.1
        self.default_risk_level = config.get("default_risk_level", "moderate") if config else "moderate"

    async def generate_trading_plan(
        self,
        analyst_reports: Dict[str, str],
        investment_plan: str,
        risk_assessment: str,
        context: Dict[str, Any]
    ) -> str:
        """
        生成交易计划

        Args:
            analyst_reports: 各分析师报告字典
            investment_plan: 投资计划建议
            risk_assessment: 风险评估结果
            context: 上下文信息

        Returns:
            完整的交易计划
        """
        company = context.get("company")
        date = context.get("date")

        prompt = f"""你是专业的量化交易员。基于以下信息，制定详细的交易计划：

## 交易标的
公司: {company}
交易日期: {date}

## 分析师报告

### 市场分析
{analyst_reports.get('market', '无')}

### 基本面分析
{analyst_reports.get('fundamentals', '无')}

### 新闻分析
{analyst_reports.get('news', '无')}

### 情绪分析
{analyst_reports.get('sentiment', '无')}

## 投资建议
{investment_plan}

## 风险评估
{risk_assessment}

## 要求
请生成完整的交易计划，包括：
1. 交易方向 (买入/卖出/观望)
2. 建议仓位 (占总资金比例，0-{int(self.max_position_size * 100)}%)
3. 入场价格区间
4. 止损价格
5. 止盈价格
6. 持仓周期
7. 风险提示

请用JSON格式输出：
{{
    "action": "buy/sell/hold",
    "position_size": 0.XX,
    "entry_price_range": {{"low": XX, "high": XX}},
    "stop_loss": XX,
    "take_profit": XX,
    "holding_period": "X days/weeks",
    "risk_level": "low/moderate/high",
    "rationale": "简要理由",
    "risk_warnings": ["风险提示1", "风险提示2"]
}}
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)

    async def decide(self, context: Dict[str, Any], state: Dict[str, Any]) -> str:
        """交易决策"""
        analyst_reports = {
            "market": context.get("market_report", ""),
            "fundamentals": context.get("fundamentals_report", ""),
            "news": context.get("news_report", ""),
            "sentiment": context.get("sentiment_report", ""),
        }
        return await self.generate_trading_plan(
            analyst_reports=analyst_reports,
            investment_plan=context.get("investment_plan", ""),
            risk_assessment=context.get("risk_debate_state", {}).get("judge_decision", ""),
            context={"company": context.get("company"), "date": context.get("date")}
        )

    async def analyze(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """LangGraph兼容的异步调用"""
        analyst_reports = {
            "market": state.get("market_report", ""),
            "fundamentals": state.get("fundamentals_report", ""),
            "news": state.get("news_report", ""),
            "sentiment": state.get("sentiment_report", ""),
        }

        context = {
            "company": state.get("company_of_interest"),
            "date": state.get("trade_date"),
        }

        trading_plan = await self.generate_trading_plan(
            analyst_reports=analyst_reports,
            investment_plan=state.get("investment_plan", ""),
            risk_assessment=state.get("final_trade_decision", ""),
            context=context
        )

        state["trader_investment_plan"] = trading_plan
        state["sender"] = self.name
        state["status"] = "trader_completed"
        return state


def create_trader(llm, config=None) -> Trader:
    """Trader工厂函数"""
    return Trader(llm, config)
