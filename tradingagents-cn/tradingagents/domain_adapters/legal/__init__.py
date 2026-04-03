"""
Legal Compliance Domain Adapter
法律合规审查领域适配器

支持：
- RegulationExpert: 法规合规检查 (GDPR, CCPA, etc.)
- ContractExpert: 合同条款风险分析
- PrivacyExpert: 隐私政策合规性评估
- ProComplianceDebater vs AntiComplianceDebater 辩论
- LegalJudge 综合裁决
"""

from .state import LegalComplianceState, create_initial_state
from .experts import (
    RegulationExpert,
    ContractExpert,
    PrivacyExpert,
    ProComplianceDebater,
    AntiComplianceDebater,
    LegalJudge,
)
from .graph import LegalReviewGraph

__all__ = [
    "LegalComplianceState",
    "create_initial_state",
    "RegulationExpert",
    "ContractExpert",
    "PrivacyExpert",
    "ProComplianceDebater",
    "AntiComplianceDebater",
    "LegalJudge",
    "LegalReviewGraph",
]
