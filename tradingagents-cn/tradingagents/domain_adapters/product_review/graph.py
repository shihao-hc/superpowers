"""
Product Review Graph
产品评审工作流
"""

import json
import re
from typing import Dict, Any, Optional

from ..base import DomainAdaptor, ExpertConfig, DebateTeamConfig, AgentRole
from ...llm import BaseLLMAdapter
from .state import ProductReviewState, create_initial_state
from .experts import (
    UXExpert,
    PerformanceExpert,
    SecurityExpert,
    MarketFitExpert,
    AdvocateProduct,
    CriticProduct,
    ProductJudge,
    calculate_readiness_score,
)


class ProductReviewGraph(DomainAdaptor):
    """
    产品评审图
    
    支持：
    - UXExpert: 用户体验分析
    - PerformanceExpert: 性能评估
    - SecurityExpert: 安全审查
    - MarketFitExpert: 市场适应性分析
    - 辩论环节
    - 最终发布决策
    """

    def __init__(
        self,
        llm: Optional[BaseLLMAdapter] = None,
    ):
        experts = [
            ExpertConfig(
                name="UX Expert",
                role=AgentRole.EXPERT,
                prompt_template="Analyze user experience of {product_name}",
            ),
            ExpertConfig(
                name="Performance Expert",
                role=AgentRole.EXPERT,
                prompt_template="Evaluate performance of {product_name}",
            ),
            ExpertConfig(
                name="Security Expert",
                role=AgentRole.EXPERT,
                prompt_template="Review security of {product_name}",
            ),
            ExpertConfig(
                name="Market Fit Expert",
                role=AgentRole.EXPERT,
                prompt_template="Assess market fit of {product_name}",
            ),
        ]
        
        debate_team = DebateTeamConfig(
            positive_name="Advocate",
            positive_prompt="Argue for product launch based on expert findings",
            negative_name="Critic",
            negative_prompt="Challenge product launch based on expert findings",
            judge_prompt="Provide final launch recommendation",
        )
        
        super().__init__(
            llm=llm,
            experts=experts,
            debate_team=debate_team,
            enable_debate=True,
            enable_risk_assessment=False,
        )

    def _create_expert_instance(self, config: ExpertConfig):
        if not self.llm:
            return None
            
        expert_map = {
            "UX Expert": UXExpert,
            "Performance Expert": PerformanceExpert,
            "Security Expert": SecurityExpert,
            "Market Fit Expert": MarketFitExpert,
        }
        
        expert_class = expert_map.get(config.name)
        if expert_class:
            return expert_class(
                llm=self.llm,
                name=config.name,
                prompt_template=config.prompt_template,
            )
        return None

    def _create_debater_instance(self, name: str, stance: str, prompt: str):
        if not self.llm:
            return None
            
        if name == "Advocate":
            return AdvocateProduct(
                llm=self.llm,
                name=name,
                stance=stance,
                prompt_template=prompt,
            )
        elif name == "Critic":
            return CriticProduct(
                llm=self.llm,
                name=name,
                stance=stance,
                prompt_template=prompt,
            )
        return None

    def _create_judge_instance(self, prompt: str):
        if not self.llm:
            return None
        return ProductJudge(llm=self.llm, name="Product Judge")

    async def review(
        self,
        product_name: str,
        product_description: str = "",
        user_feedback: str = "",
        metrics: Optional[Dict[str, float]] = None,
    ) -> Dict[str, Any]:
        """
        执行产品评审
        
        Args:
            product_name: 产品名称
            product_description: 产品描述
            user_feedback: 用户反馈
            metrics: 产品指标
            
        Returns:
            评审结果
        """
        context = {
            "product_name": product_name,
            "product_description": product_description,
            "user_feedback": user_feedback,
            "metrics": metrics or {},
        }
        
        result = await self.run(context)
        return self._parse_verdict(result)

    def _parse_verdict(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """解析裁决结果"""
        verdict_text = state.get("debate_state", {}).get("verdict", "")
        
        try:
            if "{" in verdict_text:
                json_start = verdict_text.find("{")
                json_end = verdict_text.rfind("}") + 1
                json_str = verdict_text[json_start:json_end]
                verdict_data = json.loads(json_str)
                return {
                    "launch_recommendation": verdict_data.get("launch_recommendation", "iterate"),
                    "readiness_score": verdict_data.get("readiness_score", 50),
                    "blocking_issues": verdict_data.get("blocking_issues", []),
                    "improvement_suggestions": verdict_data.get("improvement_suggestions", []),
                    "confidence": verdict_data.get("confidence", "medium"),
                    "reports": state.get("reports", {}),
                    "advocate_arguments": state.get("debate_state", {}).get("positive", ""),
                    "critic_arguments": state.get("debate_state", {}).get("negative", ""),
                }
        except (json.JSONDecodeError, ValueError):
            pass
        
        reports = state.get("reports", {})
        return {
            "launch_recommendation": self._extract_recommendation(verdict_text),
            "readiness_score": calculate_readiness_score(reports),
            "blocking_issues": self._extract_blocking_issues(verdict_text),
            "improvement_suggestions": self._extract_suggestions(verdict_text),
            "confidence": "low",
            "reports": reports,
            "advocate_arguments": state.get("debate_state", {}).get("positive", ""),
            "critic_arguments": state.get("debate_state", {}).get("negative", ""),
        }

    def _extract_recommendation(self, text: str) -> str:
        """提取发布建议"""
        text_lower = text.lower()
        if "launch" in text_lower and "approve" in text_lower:
            return "launch"
        if "block" in text_lower:
            return "block"
        return "iterate"

    def _extract_blocking_issues(self, text: str) -> list:
        """提取阻塞性问题"""
        issues = []
        patterns = [
            r"blocking[:\s]+([^\n]+)",
            r"阻塞[:\s]+([^\n]+)",
            r"critical[:\s]+([^\n]+)",
        ]
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            issues.extend([m.strip() for m in matches if m.strip()])
        return issues[:5]

    def _extract_suggestions(self, text: str) -> list:
        """提取建议"""
        suggestions = []
        patterns = [
            r"(?:suggest|建议|improve)[:\s]+([^\n]+)",
            r"(\d+\.\s+[^\n]+)",
        ]
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            suggestions.extend([m.strip() for m in matches if m.strip()])
        return suggestions[:10]


async def review_product(
    product_name: str,
    product_description: str = "",
    user_feedback: str = "",
    metrics: Optional[Dict[str, float]] = None,
    llm: Optional[BaseLLMAdapter] = None,
) -> Dict[str, Any]:
    """
    便捷函数：执行产品评审
    
    Args:
        product_name: 产品名称
        product_description: 产品描述
        user_feedback: 用户反馈
        metrics: 产品指标
        llm: LLM 适配器
        
    Returns:
        评审结果
    """
    graph = ProductReviewGraph(llm=llm)
    return await graph.review(product_name, product_description, user_feedback, metrics)
