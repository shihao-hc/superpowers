"""
TradingAgents-CN Base Domain Adaptor
通用领域适配器基类 - 支持跨领域迁移

提供可复用的多智能体编排框架：
1. 专家团队 (Supervisor-Expert Pattern)
2. 辩论决策 (Debate-Decision Pattern)
3. 风险评估 (Risk Assessment Pattern)

只需继承并实现领域特定的方法，即可创建新的领域智能体系统。
"""

import asyncio
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Type, Callable
from dataclasses import dataclass, field
from enum import Enum

from ...llm import BaseLLMAdapter


class AgentRole(str, Enum):
    """智能体角色"""
    SUPERVISOR = "supervisor"
    EXPERT = "expert"
    DEBATER = "debater"
    JUDGE = "judge"
    RISK_MANAGER = "risk_manager"


@dataclass
class ExpertConfig:
    """专家配置"""
    name: str
    role: AgentRole
    prompt_template: str
    llm: Optional[BaseLLMAdapter] = None
    temperature: float = 0.7
    max_tokens: int = 2048


@dataclass
class DebateTeamConfig:
    """辩论团队配置"""
    positive_name: str
    positive_prompt: str
    negative_name: str
    negative_prompt: str
    judge_prompt: str


class BaseDomainState(dict):
    """领域状态基类"""

    def __init__(self, initial_data: Dict[str, Any] = None):
        super().__init__()
        initial_data = initial_data or {}
        self._data = {
            "status": "initialized",
            "errors": [],
            "messages": [],
            "reports": {},
            "debate_state": {},
            "final_decision": "",
        }
        self._data.update(initial_data)

    def update(self, other: Dict[str, Any] = None, **kwargs):
        if other:
            self._data.update(other)
        self._data.update(kwargs)

    def get(self, key: str, default=None):
        return self._data.get(key, default)

    def set(self, key: str, value: Any):
        self._data[key] = value

    def __getitem__(self, key):
        return self._data[key]

    def __setitem__(self, key, value):
        self._data[key] = value


class BaseExpert(ABC):
    """领域专家基类"""

    def __init__(
        self,
        llm: BaseLLMAdapter,
        name: str,
        prompt_template: str,
        temperature: float = 0.7,
    ):
        self.llm = llm
        self.name = name
        self.prompt_template = prompt_template
        self.temperature = temperature

    @abstractmethod
    def prepare_prompt(self, context: Dict[str, Any]) -> str:
        """准备提示词"""
        pass

    async def analyze(self, context: Dict[str, Any]) -> str:
        """执行分析"""
        prompt = self.prepare_prompt(context)
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class BaseDebater(ABC):
    """辩论者基类"""

    def __init__(
        self,
        llm: BaseLLMAdapter,
        name: str,
        stance: str,
        prompt_template: str,
    ):
        self.llm = llm
        self.name = name
        self.stance = stance
        self.prompt_template = prompt_template

    @abstractmethod
    def prepare_prompt(self, reports: Dict[str, str], context: Dict[str, Any]) -> str:
        """准备辩论提示词"""
        pass

    async def argue(self, reports: Dict[str, str], context: Dict[str, Any]) -> str:
        """执行辩论"""
        prompt = self.prepare_prompt(reports, context)
        response = await self.llm.ainvoke(prompt)
        return response.content if hasattr(response, 'content') else str(response)


class BaseJudge(ABC):
    """裁判基类"""

    def __init__(self, llm: BaseLLMAdapter, name: str = "Judge"):
        self.llm = llm
        self.name = name

    @abstractmethod
    def prepare_prompt(
        self,
        positive_arg: str,
        negative_arg: str,
        reports: Dict[str, str],
        context: Dict[str, Any]
    ) -> str:
        """准备裁判提示词"""
        pass

    @abstractmethod
    def parse_verdict(self, response: str) -> Dict[str, Any]:
        """解析裁决结果"""
        pass

    async def decide(
        self,
        positive_arg: str,
        negative_arg: str,
        reports: Dict[str, str],
        context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """执行裁决"""
        prompt = self.prepare_prompt(positive_arg, negative_arg, reports, context)
        response = await self.llm.ainvoke(prompt)
        content = response.content if hasattr(response, 'content') else str(response)
        return self.parse_verdict(content)


class DomainAdaptor:
    """
    领域适配器基类

    提供通用的多智能体编排框架，子类只需实现：
    1. create_experts() - 创建专家列表
    2. create_debate_team() - 创建辩论团队
    3. get_initial_context() - 获取初始上下文

    示例用法：
    ```python
    class MyDomainAdaptor(DomainAdaptor):
        def create_experts(self):
            return [
                ExpertConfig("Expert1", AgentRole.EXPERT, "分析模板1"),
                ExpertConfig("Expert2", AgentRole.EXPERT, "分析模板2"),
            ]

        def create_debate_team(self):
            return DebateTeamConfig(
                positive_name="Pro",
                positive_prompt="支持的论点",
                negative_name="Con",
                negative_prompt="反对的论点",
                judge_prompt="裁决模板",
            )
    ```
    """

    def __init__(
        self,
        llm: BaseLLMAdapter,
        experts: Optional[List[ExpertConfig]] = None,
        debate_team: Optional[DebateTeamConfig] = None,
        enable_debate: bool = True,
        enable_risk_assessment: bool = True,
    ):
        self.llm = llm
        self.experts = experts or []
        self.debate_team = debate_team
        self.enable_debate = enable_debate
        self.enable_risk_assessment = enable_risk_assessment

        self._expert_instances: List[BaseExpert] = []
        self._positive_debater: Optional[BaseDebater] = None
        self._negative_debater: Optional[BaseDebater] = None
        self._judge: Optional[BaseJudge] = None

        self._initialize_agents()

    def _initialize_agents(self):
        """初始化智能体"""
        for expert_config in self.experts:
            expert = self._create_expert_instance(expert_config)
            if expert:
                self._expert_instances.append(expert)

        if self.debate_team and self.enable_debate:
            self._positive_debater = self._create_debater_instance(
                self.debate_team.positive_name,
                "positive",
                self.debate_team.positive_prompt,
            )
            self._negative_debater = self._create_debater_instance(
                self.debate_team.negative_name,
                "negative",
                self.debate_team.negative_prompt,
            )
            self._judge = self._create_judge_instance(self.debate_team.judge_prompt)

    def _create_expert_instance(self, config: ExpertConfig) -> Optional[BaseExpert]:
        """创建专家实例 - 子类可覆盖"""
        return None

    def _create_debater_instance(self, name: str, stance: str, prompt: str) -> Optional[BaseDebater]:
        """创建辩论者实例 - 子类可覆盖"""
        return None

    def _create_judge_instance(self, prompt: str) -> Optional[BaseJudge]:
        """创建裁判实例 - 子类可覆盖"""
        return None

    async def run_experts(self, context: Dict[str, Any]) -> Dict[str, str]:
        """并发运行所有专家"""
        reports = {}

        if self._expert_instances:
            tasks = [expert.analyze(context) for expert in self._expert_instances]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for i, expert in enumerate(self._expert_instances):
                result = results[i]
                if not isinstance(result, Exception):
                    reports[expert.name] = result
                else:
                    reports[expert.name] = f"Error: {str(result)}"

        return reports

    async def run_debate(
        self,
        reports: Dict[str, str],
        context: Dict[str, Any]
    ) -> Dict[str, str]:
        """运行辩论环节"""
        debate_results = {}

        if self._positive_debater and self._negative_debater:
            pos_arg, neg_arg = await asyncio.gather(
                self._positive_debater.argue(reports, context),
                self._negative_debater.argue(reports, context),
            )
            debate_results["positive"] = pos_arg
            debate_results["negative"] = neg_arg

            if self._judge:
                verdict = await self._judge.decide(pos_arg, neg_arg, reports, context)
                debate_results["verdict"] = verdict

        return debate_results

    async def run(self, initial_context: Dict[str, Any]) -> Dict[str, Any]:
        """
        运行完整流程

        Args:
            initial_context: 初始上下文

        Returns:
            最终状态，包含 reports, debate_results, final_decision
        """
        state = BaseDomainState(initial_context)
        state["status"] = "running"

        reports = await self.run_experts(state._data)
        state["reports"] = reports

        if self.enable_debate:
            debate_results = await self.run_debate(reports, state._data)
            state["debate_state"] = debate_results

        state["status"] = "completed"
        state["final_decision"] = self.format_final_decision(state)

        return state._data

    def format_final_decision(self, state: BaseDomainState) -> str:
        """格式化最终决策 - 子类可覆盖"""
        parts = []

        if state.get("reports"):
            parts.append("### Expert Reports\n")
            for name, report in state["reports"].items():
                parts.append(f"#### {name}\n{report[:500]}...\n\n")

        if state.get("debate_state"):
            parts.append("\n### Debate Results\n")
            ds = state["debate_state"]
            if "verdict" in ds:
                parts.append(f"Verdict: {ds['verdict']}\n")

        return "\n".join(parts)


class SupervisorExpertAdaptor(DomainAdaptor):
    """
    主管-专家适配器
    简化版，只运行专家团队，不进行辩论
    """

    def __init__(self, llm: BaseLLMAdapter, experts: List[ExpertConfig]):
        super().__init__(
            llm=llm,
            experts=experts,
            debate_team=None,
            enable_debate=False,
            enable_risk_assessment=False,
        )


def create_domain_adapter(
    domain: str,
    llm: BaseLLMAdapter,
    **kwargs
) -> DomainAdaptor:
    """
    工厂函数：创建领域适配器

    Args:
        domain: 领域名称 (stock_analysis, code_review, legal, etc.)
        llm: LLM 适配器
        **kwargs: 额外参数

    Returns:
        领域适配器实例
    """
    from ...domain_adapters.code_review import CodeReviewGraph

    adapters = {
        "code_review": CodeReviewGraph,
        "stock_analysis": None,
        "legal": None,
        "legal_review": None,
    }

    adapter_class = adapters.get(domain)
    if adapter_class:
        return adapter_class(llm=llm, **kwargs)

    raise ValueError(f"Unknown domain: {domain}. Available: {list(adapters.keys())}")
