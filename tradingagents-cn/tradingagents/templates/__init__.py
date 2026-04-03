"""
TradingAgents-CN 通用多智能体模板
可复用的"主管-专家+辩论-裁判"框架
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Callable, TypeVar, Generic
from dataclasses import dataclass, field
from enum import Enum
import asyncio


T = TypeVar('T')


class ExpertType(str, Enum):
    """专家类型"""
    MARKET = "market"
    FUNDAMENTALS = "fundamentals"
    NEWS = "news"
    SENTIMENT = "sentiment"
    CUSTOM = "custom"


@dataclass
class ExpertConfig:
    """专家配置"""
    name: str
    role: str
    prompt_template: str
    expert_type: ExpertType = ExpertType.CUSTOM
    tools: List[Any] = field(default_factory=list)
    weight: float = 1.0


@dataclass 
class DebatePosition:
    """辩论立场"""
    expert_name: str
    stance: str
    arguments: List[str]
    confidence: float
    evidence: List[str] = field(default_factory=list)


@dataclass
class DebateResult:
    """辩论结果"""
    bull_position: Optional[DebatePosition] = None
    bear_position: Optional[DebatePosition] = None
    decision: str = "neutral"
    confidence: float = 0.0
    reasoning: str = ""
    alternative_views: List[str] = field(default_factory=list)


@dataclass
class AnalysisResult:
    """分析结果"""
    expert_reports: Dict[str, str]
    debate_result: Optional[DebateResult] = None
    final_decision: Optional[Dict[str, Any]] = None
    confidence: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


class BaseExpert(ABC):
    """专家基类"""
    
    def __init__(self, name: str, role: str, llm: Any):
        self.name = name
        self.role = role
        self.llm = llm
    
    @abstractmethod
    async def analyze(self, context: Dict[str, Any]) -> str:
        """执行分析"""
        pass
    
    def format_prompt(self, template: str, context: Dict[str, Any]) -> str:
        """格式化提示词"""
        return template.format(**context)


class SupervisorExpertOrchestrator(Generic[T]):
    """
    主管-专家编排器
    通用模板：并发执行多个专家，聚合结果
    """
    
    def __init__(
        self,
        experts: List[BaseExpert],
        aggregator: Optional[Callable[[Dict[str, str]], str]] = None,
        max_concurrency: int = 4
    ):
        self.experts = {exp.name: exp for exp in experts}
        self.aggregator = aggregator or self._default_aggregator
        self.max_concurrency = max_concurrency
    
    async def execute(self, context: Dict[str, Any]) -> AnalysisResult:
        """并发执行所有专家"""
        semaphore = asyncio.Semaphore(self.max_concurrency)
        
        async def run_expert(name: str, expert: BaseExpert) -> tuple:
            async with semaphore:
                try:
                    report = await expert.analyze(context)
                    return name, report, True, None
                except Exception as e:
                    return name, "", False, str(e)
        
        tasks = [
            run_expert(name, exp) 
            for name, exp in self.experts.items()
        ]
        
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        expert_reports = {}
        errors = []
        
        for result in results:
            if isinstance(result, Exception):
                errors.append(str(result))
                continue
            
            name, report, success, error = result
            if success:
                expert_reports[name] = report
            else:
                errors.append(f"{name}: {error}")
        
        aggregated = self.aggregator(expert_reports)
        
        return AnalysisResult(
            expert_reports=expert_reports,
            metadata={"errors": errors, "aggregated_summary": aggregated}
        )
    
    def _default_aggregator(self, reports: Dict[str, str]) -> str:
        """默认聚合器：简单拼接"""
        return "\n\n".join([
            f"=== {name} ===\n{report}"
            for name, report in reports.items()
        ])


class DebateDecisionManager:
    """
    辩论-决策管理器
    通用模板：多方辩论，裁判决策
    """
    
    def __init__(
        self,
        bull_expert: BaseExpert,
        bear_expert: BaseExpert,
        judge_llm: Any,
        max_rounds: int = 3
    ):
        self.bull_expert = bull_expert
        self.bear_expert = bear_expert
        self.judge_llm = judge_llm
        self.max_rounds = max_rounds
    
    async def debate(
        self,
        topic: str,
        context: Dict[str, Any]
    ) -> DebateResult:
        """执行辩论并决策"""
        bull_history = ""
        bear_history = ""
        
        for round_num in range(self.max_rounds):
            bull_args = []
            bear_args = []
            
            bull_context = {**context, "round": round_num + 1}
            bull_position = await self.bull_expert.analyze(bull_context)
            bull_args.append(bull_position)
            bull_history += f"\n[Round {round_num + 1}] Bull:\n{bull_position}"
            
            bear_position = await self.bear_expert.analyze(bull_context)
            bear_args.append(bear_position)
            bear_history += f"\n[Round {round_num + 1}] Bear:\n{bear_position}"
            
            judge_prompt = f"""评估以下辩论：

主题: {topic}

看涨方:
{bull_history}

看跌方:
{bear_history}

请给出:
1. 决策 (proceed/caution/abort)
2. 置信度 (0-1)
3. 简短理由
"""
            judge_response = await self.judge_llm.ainvoke(judge_prompt)
            judge_content = judge_response.content if hasattr(judge_response, 'content') else str(judge_response)
            
            if "proceed" in judge_content.lower() and round_num >= 1:
                break
        
        return DebateResult(
            bull_position=DebatePosition(
                expert_name=self.bull_expert.name,
                stance="bullish",
                arguments=bull_args,
                confidence=0.7
            ),
            bear_position=DebatePosition(
                expert_name=self.bear_expert.name,
                stance="bearish", 
                arguments=bear_args,
                confidence=0.6
            ),
            decision="proceed" if "proceed" in judge_content.lower() else "caution",
            confidence=0.7,
            reasoning=judge_content
        )


class DomainAdaptor(ABC):
    """
    领域适配器
    将通用框架适配到特定领域
    """
    
    @abstractmethod
    def get_experts(self) -> List[ExpertConfig]:
        """获取领域专家配置"""
        pass
    
    @abstractmethod
    def get_prompt_templates(self) -> Dict[str, str]:
        """获取提示词模板"""
        pass
    
    @abstractmethod
    def parse_result(self, raw_result: Any) -> Dict[str, Any]:
        """解析结果"""
        pass


class StockAnalysisAdaptor(DomainAdaptor):
    """股票分析领域适配器"""
    
    def get_experts(self) -> List[ExpertConfig]:
        return [
            ExpertConfig(
                name="MarketAnalyst",
                role="市场分析师",
                prompt_template="分析{company}的市场趋势和技术指标",
                expert_type=ExpertType.MARKET
            ),
            ExpertConfig(
                name="FundamentalsAnalyst", 
                role="基本面分析师",
                prompt_template="分析{company}的财务状况和估值",
                expert_type=ExpertType.FUNDAMENTALS
            ),
            ExpertConfig(
                name="NewsAnalyst",
                role="新闻分析师",
                prompt_template="分析{company}最近的新闻和公告",
                expert_type=ExpertType.NEWS
            ),
            ExpertConfig(
                name="SentimentAnalyst",
                role="情绪分析师", 
                prompt_template="分析{company}的市场情绪和投资者态度",
                expert_type=ExpertType.SENTIMENT
            ),
        ]
    
    def get_prompt_templates(self) -> Dict[str, str]:
        return {
            "bull": """你是看涨分析师。基于以下信息提供买入建议:
公司: {company}
市场分析: {market_report}
基本面: {fundamentals_report}
新闻: {news_report}
情绪: {sentiment_report}
""",
            "bear": """你是看跌分析师。基于以下信息提供谨慎建议:
公司: {company}
市场分析: {market_report}
基本面: {fundamentals_report}
新闻: {news_report}
情绪: {sentiment_report}
""",
        }
    
    def parse_result(self, raw_result: AnalysisResult) -> Dict[str, Any]:
        return {
            "recommendation": raw_result.final_decision.get("action", "hold"),
            "confidence": raw_result.confidence,
            "reports": raw_result.expert_reports,
        }


class CodeReviewAdaptor(DomainAdaptor):
    """代码审查领域适配器"""
    
    def get_experts(self) -> List[ExpertConfig]:
        return [
            ExpertConfig(
                name="SecurityReviewer",
                role="安全审查员",
                prompt_template="审查代码安全漏洞:\n{code}",
                expert_type=ExpertType.CUSTOM,
                weight=1.5
            ),
            ExpertConfig(
                name="PerformanceReviewer",
                role="性能审查员",
                prompt_template="审查代码性能问题:\n{code}",
                expert_type=ExpertType.CUSTOM
            ),
            ExpertConfig(
                name="StyleReviewer",
                role="代码风格审查员",
                prompt_template="审查代码风格问题:\n{code}",
                expert_type=ExpertType.CUSTOM,
                weight=0.5
            ),
        ]
    
    def get_prompt_templates(self) -> Dict[str, str]:
        return {}
    
    def parse_result(self, raw_result: AnalysisResult) -> Dict[str, Any]:
        issues = []
        for name, report in raw_result.expert_reports.items():
            severity = "high" if "安全" in name else "medium"
            issues.append({"type": name, "report": report, "severity": severity})
        return {"issues": issues, "confidence": raw_result.confidence}


class LegalAnalysisAdaptor(DomainAdaptor):
    """法律分析领域适配器"""
    
    def get_experts(self) -> List[ExpertConfig]:
        return [
            ExpertConfig(
                name="ContractAnalyst",
                role="合同分析师",
                prompt_template="分析合同风险:\n{content}",
                expert_type=ExpertType.CUSTOM
            ),
            ExpertConfig(
                name="ComplianceAnalyst",
                role="合规分析师",
                prompt_template="检查合规性:\n{content}",
                expert_type=ExpertType.CUSTOM
            ),
            ExpertConfig(
                name="RiskAnalyst",
                role="风险分析师",
                prompt_template="评估法律风险:\n{content}",
                expert_type=ExpertType.CUSTOM
            ),
        ]
    
    def get_prompt_templates(self) -> Dict[str, str]:
        return {}
    
    def parse_result(self, raw_result: AnalysisResult) -> Dict[str, Any]:
        return {
            "risks": raw_result.expert_reports,
            "overall_assessment": raw_result.final_decision
        }
