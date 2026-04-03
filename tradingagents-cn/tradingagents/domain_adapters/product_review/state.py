"""
Product Review State Models
产品评审状态模型
"""

from typing import TypedDict, Annotated, List, Dict, Any, Optional


class ProductReviewState(TypedDict):
    """产品评审状态"""

    product_name: Annotated[str, "产品名称"]
    product_description: Annotated[str, "产品描述"]
    user_feedback: Annotated[str, "用户反馈"]
    metrics: Annotated[Dict[str, float], "产品指标 (NPS, retention, etc.)"]
    
    ux_report: Annotated[str, "用户体验报告"]
    performance_report: Annotated[str, "性能评估报告"]
    security_report: Annotated[str, "安全审查报告"]
    market_fit_report: Annotated[str, "市场适应性报告"]
    
    advocate_arguments: Annotated[str, "支持发布论点"]
    critic_arguments: Annotated[str, "反对发布论点"]
    
    launch_recommendation: Annotated[str, "发布建议 (launch/iterate/block)"]
    readiness_score: Annotated[float, "就绪评分 (0-100)"]
    blocking_issues: Annotated[List[str], "阻塞性问题"]
    improvement_suggestions: Annotated[List[str], "改进建议"]
    
    status: str
    errors: Annotated[List[str], "错误列表"]


def create_initial_state(
    product_name: str,
    product_description: str = "",
    user_feedback: str = "",
    metrics: Optional[Dict[str, float]] = None,
) -> Dict[str, Any]:
    """创建初始状态"""
    return {
        "product_name": product_name,
        "product_description": product_description,
        "user_feedback": user_feedback,
        "metrics": metrics or {},
        "ux_report": "",
        "performance_report": "",
        "security_report": "",
        "market_fit_report": "",
        "advocate_arguments": "",
        "critic_arguments": "",
        "launch_recommendation": "unknown",
        "readiness_score": 0.0,
        "blocking_issues": [],
        "improvement_suggestions": [],
        "status": "initialized",
        "errors": [],
    }
