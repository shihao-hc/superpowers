"""
TradingAgents-CN News Analyst
News and information analysis agent with RAG enhancement
"""

import os
from typing import Dict, Any, Optional
from ..base_agent import BaseAgent


class NewsAnalyst(BaseAgent):
    """新闻分析师"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="News Analyst")
        self.tavily_tool = None
        self._init_tavily()

    def _init_tavily(self):
        """初始化 Tavily 搜索工具"""
        enable_web_search = os.getenv("ENABLE_WEB_SEARCH", "false").lower() == "true"
        tavily_api_key = os.getenv("TAVILY_API_KEY")
        
        if enable_web_search and tavily_api_key:
            try:
                from ...tools.tavily_search import create_tavily_rag_tool
                self.tavily_tool = create_tavily_rag_tool(api_key=tavily_api_key)
            except ImportError:
                pass

    async def analyze(
        self,
        company: str,
        trade_date: str,
        state: Dict[str, Any]
    ) -> str:
        """执行新闻分析"""
        prompt = await self._build_prompt(company, trade_date, state)
        response = await self.llm.ainvoke(prompt)
        return self._format_report(response, company, trade_date)

    async def _build_prompt(
        self,
        company: str,
        trade_date: str,
        state: Dict[str, Any]
    ) -> str:
        base_prompt = f"""你是一位专业的财经新闻分析师。

请分析 {company} 在 {trade_date} 相关的重大新闻和公告："""

        if self.tavily_tool:
            try:
                search_context = await self._get_online_news(company, trade_date)
                if search_context:
                    base_prompt += f"""

## 实时网络搜索结果

以下是最新获取的网络新闻和相关信息：

{search_context}

请结合上述实时搜索结果进行分析。"""
            except Exception:
                pass

        base_prompt += """

分析维度：
1. 重大公告和事件
2. 行业相关新闻
3. 宏观经济影响
4. 政策影响分析
5. 新闻情绪评估

请生成一份详细的新闻分析报告，包括：
- 重要新闻摘要
- 新闻对股价的潜在影响
- 新闻情绪判断 (正面/负面/中性)
- 投资相关风险提示

报告格式要求：
1. 结构清晰，使用Markdown格式
2. 按重要程度排序
3. 给出明确的情绪判断
"""
        return base_prompt

    async def _get_online_news(self, company: str, trade_date: str) -> Optional[str]:
        """获取联网新闻"""
        if not self.tavily_tool:
            return None

        try:
            search_query = f"{company} stock news {trade_date}"
            results = await self.tavily_tool.search_tool.search(
                query=search_query,
                max_results=5,
                include_answer=True
            )
            
            if "error" not in results:
                return self.tavily_tool.search_tool.format_results(results)
        except Exception:
            pass
        
        return None

    def _format_report(
        self,
        response: Any,
        company: str,
        trade_date: str
    ) -> str:
        content = response.content if hasattr(response, 'content') else str(response)
        source_note = "（包含实时联网搜索）" if self.tavily_tool else ""
        
        return f"""# {company} 新闻分析报告
**分析日期**: {trade_date}
**分析师**: {self.name}{source_note}

## 新闻分析结果

{content}

---
*本报告由AI新闻分析生成，仅供参考*
"""


def create_news_analyst(llm, config=None) -> NewsAnalyst:
    """工厂函数：创建新闻分析师"""
    return NewsAnalyst(llm, config)
