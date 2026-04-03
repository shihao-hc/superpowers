"""
Code Review Agents
"""

from typing import Dict, Any
from ...agents.base_agent import BaseAgent


class CodeReviewExpert(BaseAgent):
    """代码审查专家基类"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name=self.__class__.__name__)

    async def analyze(self, code: str, language: str, context: Dict[str, Any]) -> str:
        raise NotImplementedError


class StaticAnalysisExpert(CodeReviewExpert):
    """静态分析专家"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config)
        self.name = "Static Analysis Expert"

    async def analyze(self, code: str, language: str, context: Dict[str, Any]) -> str:
        prompt = f"""你是资深代码静态分析专家。请分析以下{language}代码的质量：

```python
{code}
```

审查维度：
1. 代码复杂度 (圈复杂度、嵌套深度)
2. 可维护性 (耦合度、内聚度)
3. 代码重复
4. 命名规范
5. 注释质量

请给出详细的分析报告，标注具体行号和代码片段。
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class SecurityExpert(CodeReviewExpert):
    """安全专家"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config)
        self.name = "Security Expert"

    async def analyze(self, code: str, language: str, context: Dict[str, Any]) -> str:
        prompt = f"""你是网络安全专家。请分析以下{language}代码的安全漏洞：

```python
{code}
```

审查维度：
1. 注入攻击 (SQL注入、XSS、命令注入)
2. 认证授权问题
3. 敏感信息泄露
4. 加密算法使用
5. 依赖库安全

对于每个发现的漏洞，请标注：
- 漏洞类型
- 严重程度 (Critical/High/Medium/Low)
- 具体位置
- 修复建议
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class PerformanceExpert(CodeReviewExpert):
    """性能专家"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config)
        self.name = "Performance Expert"

    async def analyze(self, code: str, language: str, context: Dict[str, Any]) -> str:
        prompt = f"""你是性能优化专家。请分析以下{language}代码的性能问题：

```python
{code}
```

审查维度：
1. 算法复杂度 (O(n) -> O(1) 等)
2. 内存泄漏风险
3. 数据库查询效率
4. 并发/异步问题
5. 资源释放

对于每个问题，请给出：
- 问题描述
- 影响程度
- 优化建议
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class StyleExpert(CodeReviewExpert):
    """风格专家"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config)
        self.name = "Style Expert"

    async def analyze(self, code: str, language: str, context: Dict[str, Any]) -> str:
        prompt = f"""你是代码风格审查专家。请分析以下{language}代码的规范遵循：

```python
{code}
```

审查维度：
1. PEP8 规范 (Python)
2. 格式化一致性
3. import 顺序
4. 文档字符串
5. 类型注解

请列出不符合规范的具体问题。
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class Critic(BaseAgent):
    """批评者 - 指出代码问题"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Code Critic")

    async def analyze(self, *args, **kwargs) -> str:
        """Stub implementation for abstract class"""
        return ""

    async def argue(self, reports: Dict[str, str], context: Dict[str, Any]) -> str:
        prompt = f"""作为代码批评者，请基于以下专家报告，指出代码的关键问题：

静态分析：
{reports.get('static_analysis', '')}

安全分析：
{reports.get('security', '')}

性能分析：
{reports.get('performance', '')}

风格分析：
{reports.get('style', '')}

请给出3-5个最关键的问题，并说明为什么这些问题必须修复。
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class Advocate(BaseAgent):
    """辩护者 - 为代码辩护"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Code Advocate")

    async def analyze(self, *args, **kwargs) -> str:
        """Stub implementation for abstract class"""
        return ""

    async def argue(self, reports: Dict[str, str], context: Dict[str, Any]) -> str:
        prompt = f"""作为代码辩护者，请基于以下专家报告，为代码辩护：

静态分析：
{reports.get('static_analysis', '')}

安全分析：
{reports.get('security', '')}

性能分析：
{reports.get('performance', '')}

风格分析：
{reports.get('style', '')}

请指出代码的亮点，并解释某些"问题"可能是合理的设计选择。
"""
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class ReviewJudge(BaseAgent):
    """审查裁判 - 综合评估"""

    def __init__(self, llm, config=None):
        super().__init__(llm, config, name="Review Judge")

    async def analyze(self, *args, **kwargs) -> str:
        """Stub implementation for abstract class"""
        return ""

    async def decide(
        self,
        reports: Dict[str, str],
        critic_args: str,
        advocate_args: str,
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        prompt = f"""作为代码审查裁判，请综合所有意见给出最终裁决：

专家报告摘要：
- 静态分析: {reports.get('static_analysis', '')[:500]}
- 安全分析: {reports.get('security', '')[:500]}
- 性能分析: {reports.get('performance', '')[:500]}
- 风格分析: {reports.get('style', '')[:500]}

批评者意见：
{critic_args}

辩护者意见：
{advocate_args}

请给出JSON格式的裁决：
{{
    "verdict": "approve/needs_work/reject",
    "severity": "critical/major/minor/info",
    "reasoning": "裁决理由",
    "suggestions": ["建议1", "建议2", "建议3"]
}}
"""
        response = await self.llm.ainvoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        return {"verdict": content, "raw_response": response}
