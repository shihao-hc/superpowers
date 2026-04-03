"""
TradingAgents-CN Code Review Domain Adapter
多智能体代码审查系统

复用股票分析框架的模式，创建代码审查专家团队：
1. 静态分析专家 - 代码质量、可维护性
2. 安全专家 - 漏洞检测、依赖审计
3. 性能专家 - 性能问题、复杂度分析
4. 风格专家 - 代码风格规范遵循

辩论环节：
- 批评者：指出代码问题
- 辩护者：为代码辩护
- 裁判：综合评估

最终输出：代码审查报告
"""

from .state import CodeReviewState, create_initial_state
from .agents import (
    StaticAnalysisExpert,
    SecurityExpert,
    PerformanceExpert,
    StyleExpert,
    Critic,
    Advocate,
    ReviewJudge,
)
from .graph import CodeReviewGraph

__all__ = [
    "CodeReviewState",
    "create_initial_state",
    "StaticAnalysisExpert",
    "SecurityExpert",
    "PerformanceExpert",
    "StyleExpert",
    "Critic",
    "Advocate",
    "ReviewJudge",
    "CodeReviewGraph",
]
