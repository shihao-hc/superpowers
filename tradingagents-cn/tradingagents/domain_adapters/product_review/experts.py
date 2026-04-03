"""
Product Review Experts
产品评审专家
"""

from typing import Dict, Any, List
from ..base import BaseExpert, BaseDebater, BaseJudge


METRIC_THRESHOLDS = {
    "nps": {"excellent": 50, "good": 30, "acceptable": 0},
    "retention_d1": {"excellent": 0.5, "good": 0.3, "acceptable": 0.15},
    "retention_d7": {"excellent": 0.2, "good": 0.1, "acceptable": 0.05},
    "conversion_rate": {"excellent": 0.1, "good": 0.05, "acceptable": 0.01},
    "churn_rate": {"excellent": 0.05, "good": 0.1, "acceptable": 0.2},
}


class UXExpert(BaseExpert):
    """用户体验专家"""

    def prepare_prompt(self, context: Dict[str, Any]) -> str:
        metrics = context.get('metrics', {})
        return f"""评估 {context.get('product_name', '产品')} 的用户体验：

产品描述：
{context.get('product_description', '')[:1000]}

用户反馈：
{context.get('user_feedback', '')[:1000]}

关键指标：
{self._format_metrics(metrics)}

请评估：
1. 导航和可用性
2. 视觉设计和品牌一致性
3. 响应速度和交互流畅度
4. 用户引导和 onboarding
5. 错误处理和反馈机制
6. 可访问性 (a11y)

输出格式：
- UX 优势
- UX 问题
- 改进建议
- UX 评分 (0-100)"""

    def _format_metrics(self, metrics: Dict[str, float]) -> str:
        return "\n".join([f"- {k}: {v}" for k, v in metrics.items()])


class PerformanceExpert(BaseExpert):
    """性能评估专家"""

    def prepare_prompt(self, context: Dict[str, Any]) -> str:
        return f"""评估 {context.get('product_name', '产品')} 的性能：

产品描述：
{context.get('product_description', '')[:1000]}

请评估：
1. 页面加载时间
2. API 响应时间
3. 数据库查询效率
4. 资源使用情况 (CPU, 内存)
5. 扩展性考虑
6. 缓存策略
7. CDN 和 CDN 优化

输出格式：
- 性能优势
- 性能瓶颈
- 优化建议
- 性能评分 (0-100)"""


class SecurityExpert(BaseExpert):
    """安全审查专家"""

    def prepare_prompt(self, context: Dict[str, Any]) -> str:
        return f"""审查 {context.get('product_name', '产品')} 的安全性：

产品描述：
{context.get('product_description', '')[:1000]}

请检查：
1. 认证和授权机制
2. 数据加密 (传输和存储)
3. 输入验证和 SQL 注入防护
4. XSS 和 CSRF 防护
5. 敏感信息处理
6. API 安全
7. 第三方依赖安全性
8. 安全头配置

输出格式：
- 安全优势
- 安全漏洞 (按严重程度分类)
- 修复建议
- 安全评分 (0-100)"""


class MarketFitExpert(BaseExpert):
    """市场适应性专家"""

    def prepare_prompt(self, context: Dict[str, Any]) -> str:
        metrics = context.get('metrics', {})
        return f"""评估 {context.get('product_name', '产品')} 的市场适应性：

产品描述：
{context.get('product_description', '')[:1000]}

用户反馈：
{context.get('user_feedback', '')[:1000]}

市场指标：
{self._format_metrics(metrics)}

请评估：
1. 目标用户群体定义
2. 价值主张清晰度
3. 竞争差异化
4. 定价策略
5. 市场时机
6. 增长潜力
7. 商业模式可持续性

输出格式：
- 市场优势
- 市场风险
- 增长建议
- 市场就绪度评分 (0-100)"""

    def _format_metrics(self, metrics: Dict[str, float]) -> str:
        return "\n".join([f"- {k}: {v}" for k, v in metrics.items()])


class AdvocateProduct(BaseDebater):
    """支持发布产品的辩论者"""

    def prepare_prompt(self, reports: Dict[str, str], context: Dict[str, Any]) -> str:
        expert_findings = "\n\n".join([
            f"### {name}\n{report[:500]}"
            for name, report in reports.items()
        ])
        return f"""基于专家分析，提出支持发布 {context.get('product_name', '产品')} 的论点：

{expert_findings}

请从以下角度论证：
1. 产品的核心价值和优势
2. 已解决的关键问题
3. 市场和用户需求
4. 竞争优势和差异化
5. 发布的商业价值

语气：支持性、战略思维"""


class CriticProduct(BaseDebater):
    """反对发布的辩论者"""

    def prepare_prompt(self, reports: Dict[str, str], context: Dict[str, Any]) -> str:
        expert_findings = "\n\n".join([
            f"### {name}\n{report[:500]}"
            for name, report in reports.items()
        ])
        return f"""基于专家分析，提出反对/延迟发布 {context.get('product_name', '产品')} 的论点：

{expert_findings}

请从以下角度质疑：
1. 尚未解决的关键问题
2. 用户体验缺陷
3. 技术债务和安全风险
4. 市场竞争劣势
5. 潜在的用户流失风险

语气：批判性、风险导向"""


class ProductJudge(BaseJudge):
    """产品发布裁判"""

    def prepare_prompt(
        self,
        advocate_arg: str,
        critic_arg: str,
        reports: Dict[str, str],
        context: Dict[str, Any]
    ) -> str:
        return f"""基于辩论和专家分析，给出 {context.get('product_name', '产品')} 的发布决策：

## 支持论点：
{advocate_arg[:800]}

## 反对论点：
{critic_arg[:800]}

## 专家报告：
{chr(10).join([f"- {name}: {r[:200]}..." for name, r in reports.items()])}

请输出JSON格式的决策：
{{
    "launch_recommendation": "launch/iterate/block",
    "readiness_score": 0-100,
    "blocking_issues": ["阻塞性问题1", "阻塞性问题2"],
    "improvement_suggestions": ["改进建议1", "改进建议2"],
    "confidence": "high/medium/low"
}}

建议说明：
- launch: 产品已就绪，可以发布
- iterate: 需要迭代改进后再发布
- block: 存在阻塞性问题，不建议发布"""


def calculate_readiness_score(reports: Dict[str, str]) -> float:
    """基于报告计算就绪评分"""
    score_map = {
        "ux_report": 0.25,
        "performance_report": 0.25,
        "security_report": 0.25,
        "market_fit_report": 0.25,
    }
    
    total_score = 0.0
    for report_name, weight in score_map.items():
        report = reports.get(report_name, "")
        score = _extract_score(report)
        total_score += score * weight * 100
    
    return min(100.0, max(0.0, total_score))


def _extract_score(text: str) -> float:
    """从文本中提取评分"""
    import re
    patterns = [
        r"(\d+(?:\.\d+)?)\s*/\s*100",
        r"score[:\s]+(\d+(?:\.\d+)?)",
        r"评分[:\s]+(\d+(?:\.\d+)?)",
        r"rating[:\s]+(\d+(?:\.\d+)?)",
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return float(match.group(1)) / 100
    return 0.5
