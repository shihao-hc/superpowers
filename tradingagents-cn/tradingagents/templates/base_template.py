"""
TradingAgents-CN 通用多智能体模板
"""

from .base_template import (
    BaseExpert,
    SupervisorExpertOrchestrator,
    DebateDecisionManager,
    DomainAdaptor,
    StockAnalysisAdaptor,
    CodeReviewAdaptor,
    LegalAnalysisAdaptor,
    ExpertConfig,
    DebateResult,
    AnalysisResult,
)

__all__ = [
    "BaseExpert",
    "SupervisorExpertOrchestrator",
    "DebateDecisionManager",
    "DomainAdaptor",
    "StockAnalysisAdaptor",
    "CodeReviewAdaptor",
    "LegalAnalysisAdaptor",
    "ExpertConfig",
    "DebateResult",
    "AnalysisResult",
]
