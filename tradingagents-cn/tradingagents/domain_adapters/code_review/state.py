"""
Code Review State Models
"""

from typing import TypedDict, Annotated, List, Dict, Any, Optional


class CodeReviewState(TypedDict):
    """代码审查状态"""

    code: Annotated[str, "待审查的代码"]
    language: Annotated[str, "编程语言"]
    repo: Annotated[str, "代码仓库"]
    file_path: Annotated[str, "文件路径"]

    static_analysis_report: Annotated[str, "静态分析报告"]
    security_report: Annotated[str, "安全分析报告"]
    performance_report: Annotated[str, "性能分析报告"]
    style_report: Annotated[str, "风格分析报告"]

    critic_arguments: Annotated[str, "批评者论点"]
    advocate_arguments: Annotated[str, "辩护者论点"]

    final_verdict: Annotated[str, "最终裁决"]
    review_suggestions: Annotated[List[str], "审查建议"]
    severity: Annotated[str, "问题严重程度 (critical/major/minor/info)"]

    status: str
    errors: Annotated[List[str], "错误列表"]


def create_initial_state(
    code: str,
    language: str = "python",
    repo: str = "",
    file_path: str = "",
) -> Dict[str, Any]:
    """创建初始状态"""
    return {
        "code": code,
        "language": language,
        "repo": repo,
        "file_path": file_path,
        "static_analysis_report": "",
        "security_report": "",
        "performance_report": "",
        "style_report": "",
        "critic_arguments": "",
        "advocate_arguments": "",
        "final_verdict": "",
        "review_suggestions": [],
        "severity": "info",
        "status": "initialized",
        "errors": [],
    }
