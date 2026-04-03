"""
Legal Review Graph
法律合规审查工作流
"""

import json
import re
from typing import Dict, Any, Optional

from ..base import DomainAdaptor, ExpertConfig, DebateTeamConfig, AgentRole
from ...llm import BaseLLMAdapter
from .state import LegalComplianceState, create_initial_state
from .experts import (
    RegulationExpert,
    ContractExpert,
    PrivacyExpert,
    ProComplianceDebater,
    AntiComplianceDebater,
    LegalJudge,
)


class LegalReviewGraph(DomainAdaptor):
    """
    法律合规审查图
    
    支持：
    - RegulationExpert: 法规合规检查
    - ContractExpert: 合同风险分析
    - PrivacyExpert: 隐私政策评估
    - 辩论环节
    - 最终裁决
    """

    def __init__(
        self,
        llm: Optional[BaseLLMAdapter] = None,
        jurisdiction: str = "GDPR",
    ):
        self.jurisdiction = jurisdiction
        
        experts = [
            ExpertConfig(
                name="Regulation Expert",
                role=AgentRole.EXPERT,
                prompt_template="Analyze {document} for {jurisdiction} compliance",
            ),
            ExpertConfig(
                name="Contract Expert", 
                role=AgentRole.EXPERT,
                prompt_template="Analyze contract risks in {document}",
            ),
            ExpertConfig(
                name="Privacy Expert",
                role=AgentRole.EXPERT,
                prompt_template="Evaluate privacy policy compliance for {jurisdiction}",
            ),
        ]
        
        debate_team = DebateTeamConfig(
            positive_name="ProCompliance",
            positive_prompt="Argue for document compliance based on expert findings",
            negative_name="AntiCompliance",
            negative_prompt="Challenge document compliance based on expert findings",
            judge_prompt="Provide final compliance verdict and risk assessment",
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
            "Regulation Expert": RegulationExpert,
            "Contract Expert": ContractExpert,
            "Privacy Expert": PrivacyExpert,
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
            
        if name == "ProCompliance":
            return ProComplianceDebater(
                llm=self.llm,
                name=name,
                stance=stance,
                prompt_template=prompt,
            )
        elif name == "AntiCompliance":
            return AntiComplianceDebater(
                llm=self.llm,
                name=name,
                stance=stance,
                prompt_template=prompt,
            )
        return None

    def _create_judge_instance(self, prompt: str):
        if not self.llm:
            return None
        return LegalJudge(llm=self.llm, name="Legal Judge")

    async def review(
        self,
        document_text: str,
        jurisdiction: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        执行法律合规审查
        
        Args:
            document_text: 待审查的文档
            jurisdiction: 管辖区域 (GDPR, CCPA, etc.)
            
        Returns:
            审查结果
        """
        jurisdiction = jurisdiction or self.jurisdiction
        context = {
            "document_text": document_text,
            "jurisdiction": jurisdiction,
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
                    "risk_level": verdict_data.get("risk_level", "unknown"),
                    "violations": verdict_data.get("violations", []),
                    "recommendations": verdict_data.get("recommendations", []),
                    "final_verdict": verdict_data.get("verdict", verdict_text),
                    "compliance_score": verdict_data.get("overall_score", 0),
                }
        except (json.JSONDecodeError, ValueError):
            pass
        
        return {
            "risk_level": self._extract_risk_level(verdict_text),
            "violations": self._extract_violations(verdict_text),
            "recommendations": self._extract_recommendations(verdict_text),
            "final_verdict": verdict_text,
            "compliance_score": 50,
        }

    def _extract_risk_level(self, text: str) -> str:
        """提取风险等级"""
        text_lower = text.lower()
        if "critical" in text_lower or "严重" in text:
            return "critical"
        if "high" in text_lower or "高" in text:
            return "high"
        if "medium" in text_lower or "中" in text:
            return "medium"
        return "low"

    def _extract_violations(self, text: str) -> list:
        """提取违规项"""
        violations = []
        patterns = [
            r"violat(?:ion|es)[:\s]+([^\n]+)",
            r"违反[:\s]+([^\n]+)",
            r"non-compliance[:\s]+([^\n]+)",
        ]
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            violations.extend([m.strip() for m in matches if m.strip()])
        return violations[:10]

    def _extract_recommendations(self, text: str) -> list:
        """提取建议"""
        recommendations = []
        patterns = [
            r"(?:recommend|suggest|建议)[:\s]+([^\n]+)",
            r"(\d+\.\s+[^\n]+)",
            r"[-•*]\s+([^\n]+)",
        ]
        for pattern in patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            recommendations.extend([m.strip() for m in matches if m.strip()])
        return recommendations[:10]


async def review_legal_compliance(
    document_text: str,
    jurisdiction: str = "GDPR",
    llm: Optional[BaseLLMAdapter] = None,
) -> Dict[str, Any]:
    """
    便捷函数：执行法律合规审查
    
    Args:
        document_text: 待审查的文档
        jurisdiction: 管辖区域
        llm: LLM 适配器
        
    Returns:
        审查结果
    """
    graph = LegalReviewGraph(llm=llm, jurisdiction=jurisdiction)
    return await graph.review(document_text, jurisdiction)
