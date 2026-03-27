from dataclasses import dataclass
from typing import Optional


@dataclass
class Pattern:
    """学习模式"""
    success_factors: list[str]
    failure_factors: list[str]
    confidence: float
    recommendations: list[str]


class PatternExtractor:
    """模式提取器"""
    
    def extract(self, outcomes: list) -> Pattern:
        """从交易结果中提取模式"""
        
        successes = [o for o in outcomes if o.outcome_type.value == "success"]
        failures = [o for o in outcomes if o.outcome_type.value == "failure"]
        
        success_factors = self._extract_success_factors(successes)
        failure_factors = self._extract_failure_factors(failures)
        
        confidence = len(successes) / max(len(outcomes), 1)
        
        return Pattern(
            success_factors=success_factors,
            failure_factors=failure_factors,
            confidence=confidence,
            recommendations=self._generate_recommendations(success_factors, failure_factors)
        )
    
    def _extract_success_factors(self, successes: list) -> list[str]:
        """提取成功因素"""
        factors = []
        
        if successes:
            avg_pnl = sum(o.pnl_pct for o in successes) / len(successes)
            factors.append(f"平均盈利: {avg_pnl:.1%}")
        
        return factors
    
    def _extract_failure_factors(self, failures: list) -> list[str]:
        """提取失败因素"""
        factors = []
        
        if failures:
            avg_loss = sum(o.pnl_pct for o in failures) / len(failures)
            factors.append(f"平均亏损: {avg_loss:.1%}")
        
        return factors
    
    def _generate_recommendations(self, success_factors: list, failure_factors: list) -> list[str]:
        """生成建议"""
        recommendations = []
        
        if failure_factors:
            recommendations.append("注意控制亏损幅度")
        
        return recommendations