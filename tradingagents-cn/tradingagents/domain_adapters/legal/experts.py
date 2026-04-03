"""
Legal Compliance Experts
法律合规审查专家
"""

import re
from typing import Dict, Any, List
from ..base import BaseExpert, BaseDebater, BaseJudge


REGULATION_PATTERNS = {
    "GDPR": [
        (r"data\s+minimization", "Article 5: Data minimization principle"),
        (r"consent", "Article 7: Consent requirements"),
        (r"right\s+to\s+be\s+forgotten|erasure", "Article 17: Right to erasure"),
        (r"data\s+portability", "Article 20: Data portability"),
        (r"breach\s+notification", "Article 33: Breach notification"),
        (r"privacy\s+by\s+design", "Article 25: Privacy by design"),
        (r"dpo|data\s+protection\s+officer", "Article 37: DPO appointment"),
    ],
    "CCPA": [
        (r"do\s+not\s+sell\s+my\s+personal\s+information", "Section 1798.120: Right to opt-out"),
        (r"privacy\s+policy", "Section 1798.100: Privacy notice"),
        (r"consumer\s+rights", "Section 1798.100-125: Consumer rights"),
        (r"service\s+providers", "Section 1798.140: Service provider contracts"),
    ],
}

VIOLATION_SEVERITY = {
    "critical": ["breach_notification", "consent", "right_to_be_forgotten"],
    "high": ["data_minimization", "privacy_by_design", "dpo"],
    "medium": ["data_portability", "privacy_policy"],
    "low": ["service_providers", "consumer_rights"],
}


class RegulationExpert(BaseExpert):
    """法规合规专家"""

    def prepare_prompt(self, context: Dict[str, Any]) -> str:
        return f"""分析以下文档是否符合 {context.get('jurisdiction', 'GDPR')} 法规要求：

文档内容：
{context.get('document_text', '')[:3000]}

请检查：
1. 数据最小化原则
2. 用户同意机制
3. 数据删除权
4. 数据可携带权
5. 隐私设计原则
6. 数据保护官配置

输出格式：
- 符合的条款
- 违反的条款
- 风险等级 (low/medium/high/critical)
- 改进建议"""


class ContractExpert(BaseExpert):
    """合同条款风险专家"""

    def prepare_prompt(self, context: Dict[str, Any]) -> str:
        return f"""分析以下合同/条款的风险：

内容：
{context.get('document_text', '')[:3000]}

请检查：
1. 责任限制条款
2. 赔偿条款
3. 终止条款
4. 知识产权条款
5. 保密条款
6. 争议解决机制

输出格式：
- 高风险条款
- 中风险条款
- 建议添加的保护条款
- 整体风险评估"""


class PrivacyExpert(BaseExpert):
    """隐私政策合规专家"""

    def prepare_prompt(self, context: Dict[str, Any]) -> str:
        jurisdiction = context.get('jurisdiction', 'GDPR')
        return f"""评估以下隐私政策的合规性（{jurisdiction}）：

隐私政策内容：
{context.get('document_text', '')[:3000]}

请检查：
1. 数据收集透明度
2. 数据使用目的说明
3. 第三方共享披露
4. 用户权利说明
5. 安全措施描述
6. Cookie使用披露

输出格式：
- 符合最佳实践的项
- 缺失或不足的项
- 违规风险
- 合规评分 (0-100)"""


class ProComplianceDebater(BaseDebater):
    """支持合规的辩论者"""

    def prepare_prompt(self, reports: Dict[str, str], context: Dict[str, Any]) -> str:
        expert_findings = "\n\n".join([
            f"### {name}\n{report[:500]}"
            for name, report in reports.items()
        ])
        return f"""基于以下专家分析，提出支持文档合规的论点：

{expert_findings}

请从以下角度论证：
1. 文档满足的核心合规要求
2. 已实施的保护措施
3. 风险缓解策略
4. 合规改进的积极态度

语气：支持性、建设性"""


class AntiComplianceDebater(BaseDebater):
    """质疑合规性的辩论者"""

    def prepare_prompt(self, reports: Dict[str, str], context: Dict[str, Any]) -> str:
        expert_findings = "\n\n".join([
            f"### {name}\n{report[:500]}"
            for name, report in reports.items()
        ])
        return f"""基于以下专家分析，提出质疑文档合规性的论点：

{expert_findings}

请从以下角度质疑：
1. 潜在的合规漏洞
2. 遗漏的关键要求
3. 实施不足的保护措施
4. 可能的执法风险

语气：批判性、分析性"""


class LegalJudge(BaseJudge):
    """法律合规裁判"""

    def prepare_prompt(
        self,
        positive_arg: str,
        negative_arg: str,
        reports: Dict[str, str],
        context: Dict[str, Any]
    ) -> str:
        jurisdiction = context.get('jurisdiction', 'GDPR')
        return f"""基于以下辩论和分析，给出{jurisdiction}合规性裁决：

## 支持合规论点：
{positive_arg[:1000]}

## 质疑合规论点：
{negative_arg[:1000]}

## 专家报告摘要：
{chr(10).join([f"- {name}: {r[:200]}..." for name, r in reports.items()])}

请输出JSON格式的裁决：
{{
    "risk_level": "low/medium/high/critical",
    "violations": ["违规项1", "违规项2"],
    "recommendations": ["建议1", "建议2"],
    "verdict": "最终裁决说明",
    "overall_score": 0-100
}}"""


def parse_regulation_findings(
    text: str,
    jurisdiction: str = "GDPR"
) -> Dict[str, Any]:
    """使用正则解析法规检查结果"""
    violations = []
    findings = []
    risk_level = "low"
    
    patterns = REGULATION_PATTERNS.get(jurisdiction, REGULATION_PATTERNS["GDPR"])
    
    for pattern, description in patterns:
        if re.search(pattern, text, re.IGNORECASE):
            findings.append(description)
            if "breach" in pattern.lower() or "consent" in pattern.lower():
                violations.append(description)
                risk_level = "critical"
            elif "minimization" in pattern.lower() or "design" in pattern.lower():
                if risk_level != "critical":
                    risk_level = "high"
    
    return {
        "findings": findings,
        "violations": violations,
        "risk_level": risk_level,
    }


def calculate_compliance_score(findings: List[str], violations: List[str]) -> int:
    """计算合规评分"""
    base_score = 100
    base_score -= len(violations) * 15
    base_score -= len(findings) * 2
    return max(0, min(100, base_score))
