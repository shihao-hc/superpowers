"""
TradingAgents-CN Mock LLM Adapter
用于 CI/CD 测试环境，避免真实 API 调用
支持多种场景的 Mock 响应
"""

import os
import time
import random
from typing import Optional, List, Dict, Any, AsyncIterator

from .mock_data import (
    MOCK_MARKET_REPORT,
    MOCK_FUNDAMENTALS_REPORT,
    MOCK_NEWS_REPORT,
    MOCK_SENTIMENT_REPORT,
    MOCK_INVESTMENT_PLAN,
    MOCK_RISK_ASSESSMENT,
    MOCK_FINAL_DECISION,
    MOCK_CODE_REVIEW_VERDICT,
    MOCK_CRITIC_ARGUMENTS,
    MOCK_ADVOCATE_ARGUMENTS,
    WS_PROGRESS_MESSAGES,
    DEBATE_ROUND_1,
    DEBATE_ROUND_2,
)

class MockLLMAdapter:
    """Mock LLM 适配器，返回预设响应用于测试"""
    
    def __init__(
        self,
        model: str = "mock-model",
        response_delay: float = 0.1,
        **kwargs
    ):
        self.model = model
        self.response_delay = response_delay
        self.call_count = 0
        self.total_tokens = 0
        self._response_variant = 0
        
    @property
    def _identifying_params(self) -> Dict[str, Any]:
        return {"model": self.model}
    
    def __call__(self, prompt: str, **kwargs) -> str:
        """同步调用"""
        self.call_count += 1
        time.sleep(self.response_delay)
        
        return self._generate_response(prompt)
    
    async def ainvoke(self, prompt: str, **kwargs) -> str:
        """异步调用"""
        self.call_count += 1
        self.total_tokens += len(prompt.split()) * 2
        
        import asyncio
        await asyncio.sleep(self.response_delay)
        
        return self._generate_response(prompt)
    
    async def astream(self, prompt: str, **kwargs) -> AsyncIterator[str]:
        """流式响应"""
        self.call_count += 1
        response = self._generate_response(prompt)
        
        import asyncio
        await asyncio.sleep(self.response_delay)
        
        for char in response:
            yield char
    
    def _generate_response(self, prompt: str) -> str:
        """根据 prompt 类型生成相应的 mock 响应"""
        prompt_lower = prompt.lower()
        self._response_variant = (self._response_variant + 1) % 3
        
        if any(kw in prompt_lower for kw in ["000001", "000002", "stock", "股票"]):
            if any(kw in prompt_lower for kw in ["market", "技术", "k线", "走势"]):
                return self._market_analysis_response()
            elif any(kw in prompt_lower for kw in ["fundamental", "财务", "eps", "roe", "基本面"]):
                return self._fundamental_analysis_response()
            elif any(kw in prompt_lower for kw in ["news", "新闻", "公告"]):
                return self._news_analysis_response()
            elif any(kw in prompt_lower for kw in ["sentiment", "情绪", "资金"]):
                return self._sentiment_analysis_response()
        
        if any(kw in prompt_lower for kw in ["risk", "风险", "止损", "仓位"]):
            return self._risk_management_response()
        
        if any(kw in prompt_lower for kw in ["代码审查", "code review"]):
            return self._code_review_response(prompt)
        if any(kw in prompt_lower for kw in ["静态分析", "static analysis", "圈复杂度"]):
            return self._static_analysis_response()
        if any(kw in prompt_lower for kw in ["安全", "security", "漏洞", "injection"]):
            return self._security_analysis_response()
        if any(kw in prompt_lower for kw in ["性能", "performance", "optimization"]):
            return self._performance_analysis_response()
        if any(kw in prompt_lower for kw in ["风格", "style", "pep8", "规范"]):
            return self._style_analysis_response()
        
        if any(kw in prompt_lower for kw in ["辩论", "bull", "bear", "支持", "反对"]):
            return self._debate_response()
        if any(kw in prompt_lower for kw in ["裁判", "judge", "决策", "decision"]):
            return self._judge_response()
        
        if any(kw in prompt_lower for kw in ["法律", "legal", "合规", "compliance"]):
            return self._legal_review_response()
        if any(kw in prompt_lower for kw in ["产品", "product", "需求"]):
            return self._product_review_response()
        
        if any(kw in prompt_lower for kw in ["api", "endpoint", "rest"]):
            return self._api_design_response()
        
        if any(kw in prompt_lower for kw in ["sql", "database", "数据库"]):
            return self._database_review_response()
        
        if any(kw in prompt_lower for kw in ["docker", "kubernetes", "部署"]):
            return self._deployment_review_response()
        
        return self._generic_response()
    
    def _generic_response(self) -> str:
        """通用响应"""
        responses = [
            "Mock response: This is a simulated LLM response for testing purposes.",
            "Mock response: Analysis completed. Results are simulated for testing.",
            "Mock response: Based on the provided context, this is a mock analysis result.",
        ]
        return responses[self._response_variant]
    
    def _market_analysis_response(self) -> str:
        return MOCK_MARKET_REPORT
    
    def _fundamental_analysis_response(self) -> str:
        return MOCK_FUNDAMENTALS_REPORT
    
    def _news_analysis_response(self) -> str:
        return MOCK_NEWS_REPORT
    
    def _sentiment_analysis_response(self) -> str:
        return MOCK_SENTIMENT_REPORT
    
    def _risk_management_response(self) -> str:
        return MOCK_RISK_ASSESSMENT
    
    def _code_review_response(self, prompt: str) -> str:
        if any(kw in prompt.lower() for kw in ["静态", "static"]):
            return self._static_analysis_response()
        elif any(kw in prompt.lower() for kw in ["安全", "security"]):
            return self._security_analysis_response()
        elif any(kw in prompt.lower() for kw in ["性能", "performance"]):
            return self._performance_analysis_response()
        elif any(kw in prompt.lower() for kw in ["风格", "style"]):
            return self._style_analysis_response()
        return MOCK_CODE_REVIEW_VERDICT
    
    def _static_analysis_response(self) -> str:
        complexity = ["6 (优秀)", "8 (中等)", "12 (需优化)"]
        scores = ["A", "B+", "C"]
        return f"""
        ## 静态分析报告
        
        **圈复杂度**: {complexity[self._response_variant]}
        **代码行数**: {100 + self._response_variant * 50} 行
        **函数数量**: {3 + self._response_variant} 个
        **平均函数长度**: {20 + self._response_variant * 10} 行
        
        **问题**:
        - {self._response_variant} 处{'深层嵌套' if self._response_variant > 0 else '无'}
        - {2 - self._response_variant} 处可简化逻辑
        
        **评分**: {scores[self._response_variant]}
        """
    
    def _security_analysis_response(self) -> str:
        risks = [
            {"sql": "未发现明显风险", "xss": "低风险", "score": "B"},
            {"sql": "发现 1 处潜在风险", "xss": "中风险", "score": "C+"},
            {"sql": "未发现明显风险", "xss": "低风险", "score": "A-"}
        ]
        r = risks[self._response_variant]
        return f"""
        ## 安全分析报告
        
        **输入验证**: {'已进行基本验证' if self._response_variant != 1 else '验证不完整'}
        **SQL 注入**: {r['sql']}
        **XSS**: {r['xss']}
        
        **建议**:
        1. {'添加参数化查询' if self._response_variant == 1 else '继续保持当前做法'}
        2. {'立即增加 CSRF 防护' if self._response_variant == 1 else '增加 CSRF 防护(可选)'}
        3. 添加请求频率限制
        
        **评分**: {r['score']}
        """
    
    def _performance_analysis_response(self) -> str:
        optimizations = [
            ("考虑添加缓存机制", "内存占用约 50MB"),
            ("建议优化数据库查询", "内存占用约 120MB"),
            ("性能良好，无需优化", "内存占用约 30MB")
        ]
        opt, mem = optimizations[self._response_variant]
        return f"""
        ## 性能分析报告
        
        **时间复杂度**: O(n) 为主
        **空间复杂度**: O(1) 为主
        **内存占用**: {mem}
        
        **优化建议**:
        1. {opt}
        2. {'批量处理大数组' if self._response_variant != 2 else '无需额外优化'}
        
        **评分**: {'A-' if self._response_variant == 2 else 'B+' if self._response_variant == 0 else 'C+'}
        """
    
    def _style_analysis_response(self) -> str:
        return f"""
        ## 代码风格审查
        
        **命名规范**: {'遵循 PEP8 命名约定' if self._response_variant != 1 else '部分命名不符合 PEP8'}
        **代码结构**: {'逻辑清晰，模块划分合理' if self._response_variant == 0 else '结构尚可，建议优化'}
        **注释文档**: {'文档完善' if self._response_variant == 2 else '缺少部分文档注释'}
        
        **建议**:
        1. {'添加函数文档字符串' if self._response_variant != 2 else '保持当前文档水平'}
        2. {'添加类型注解' if self._response_variant != 2 else '可选添加'}
        3. {'简化嵌套层级' if self._response_variant == 1 else '当前嵌套可接受'}
        """
    
    def _debate_response(self) -> str:
        if self._response_variant == 0:
            return MOCK_ADVOCATE_ARGUMENTS
        else:
            return MOCK_CRITIC_ARGUMENTS
    
    def _judge_response(self) -> str:
        return MOCK_FINAL_DECISION
    
    def _legal_review_response(self) -> str:
        return f"""
        ## 法律合规审查
        
        **合规状态**: {'通过' if self._response_variant != 1 else '存在 1 处待整改'}
        **合同审查**: {'完整' if self._response_variant == 0 else '建议补充'}
        **知识产权**: 无侵权风险
        
        **建议**:
        1. {'定期进行合规培训' if self._response_variant == 1 else '继续保持'}
        2. 建立合规审查机制
        """
    
    def _product_review_response(self) -> str:
        return f"""
        ## 产品评审
        
        **需求完整性**: {'高' if self._response_variant != 1 else '中'}
        **技术可行性**: {'可行' if self._response_variant != 2 else '存在技术难点'}
        **市场潜力**: {'大' if self._response_variant == 0 else '中'}
        
        **评审结论**: {'推荐立项' if self._response_variant == 0 else '建议优化后立项' if self._response_variant == 1 else '暂缓'}
        """
    
    def _api_design_response(self) -> str:
        return f"""
        ## API 设计审查
        
        **RESTful 规范**: {'符合' if self._response_variant != 1 else '部分偏离'}
        **版本控制**: {'已实现' if self._response_variant == 0 else '建议添加'}
        **错误处理**: {'完善' if self._response_variant == 2 else '基本完善'}
        **文档完整性**: {'Swagger/OpenAPI 已配置'}
        
        **建议**:
        1. {'添加请求限流' if self._response_variant == 1 else '继续保持'}
        2. 增加 API 版本管理
        """
    
    def _database_review_response(self) -> str:
        return f"""
        ## 数据库审查
        
        **索引优化**: {'良好' if self._response_variant == 0 else '建议添加索引'}
        **查询效率**: {'O(log n)' if self._response_variant == 0 else 'O(n)，建议优化'}
        **数据安全**: {'加密存储' if self._response_variant != 1 else '建议增强加密'}
        
        **建议**:
        1. {'定期进行性能监控' if self._response_variant == 1 else '继续保持'}
        2. 建立备份机制
        """
    
    def _deployment_review_response(self) -> str:
        return f"""
        ## 部署架构审查
        
        **容器化**: Docker 配置完整
        **编排**: {'Kubernetes 配置完善' if self._response_variant == 0 else '建议完善健康检查'}
        **CI/CD**: 已集成 GitHub Actions
        **监控**: {'Prometheus + Grafana 已配置'}
        
        **建议**:
        1. {'添加资源限制' if self._response_variant == 1 else '继续保持'}
        2. 配置自动扩缩容
        """
    
    def get_usage_stats(self) -> Dict[str, Any]:
        """获取使用统计"""
        return {
            "call_count": self.call_count,
            "total_tokens": self.total_tokens,
            "model": self.model,
            "response_variant": self._response_variant,
        }
