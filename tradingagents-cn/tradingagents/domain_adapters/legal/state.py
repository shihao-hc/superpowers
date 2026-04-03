"""
Legal Compliance State Models
法律合规状态模型
"""

from typing import TypedDict, Annotated, List, Dict, Any, Optional


class LegalComplianceState(TypedDict):
    """法律合规审查状态"""

    document_text: Annotated[str, "待审查的文档文本"]
    jurisdiction: Annotated[str, "管辖区域 (GDPR, CCPA, etc.)"]
    
    regulation_report: Annotated[str, "法规合规报告"]
    contract_report: Annotated[str, "合同风险报告"]
    privacy_report: Annotated[str, "隐私合规报告"]
    
    pro_arguments: Annotated[str, "支持合规论点"]
    anti_arguments: Annotated[str, "反对合规论点"]
    
    risk_level: Annotated[str, "风险等级 (low/medium/high/critical)"]
    violations: Annotated[List[str], "违规项列表"]
    recommendations: Annotated[List[str], "改进建议"]
    
    final_verdict: Annotated[str, "最终裁决"]
    status: str
    errors: Annotated[List[str], "错误列表"]


def create_initial_state(
    document_text: str,
    jurisdiction: str = "GDPR",
) -> Dict[str, Any]:
    """创建初始状态"""
    return {
        "document_text": document_text,
        "jurisdiction": jurisdiction,
        "regulation_report": "",
        "contract_report": "",
        "privacy_report": "",
        "pro_arguments": "",
        "anti_arguments": "",
        "risk_level": "unknown",
        "violations": [],
        "recommendations": [],
        "final_verdict": "",
        "status": "initialized",
        "errors": [],
    }
