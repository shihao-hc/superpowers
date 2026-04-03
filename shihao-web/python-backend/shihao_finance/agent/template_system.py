"""
Custom Agent Template System
自定义Agent模板系统 - 支持创建和复用Agent模板
"""

import json
import os
import copy
from datetime import datetime
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from threading import Lock
from enum import Enum
import hashlib


class TemplateCategory(Enum):
    """模板分类"""

    ANALYSIS = "analysis"  # 分析类
    EXECUTION = "execution"  # 执行类
    MONITORING = "monitoring"  # 监控类
    RESEARCH = "research"  # 研究类
    CUSTOM = "custom"  # 自定义


class TemplateVisibility(Enum):
    """模板可见性"""

    PRIVATE = "private"  # 私有
    TEAM = "team"  # 团队
    PUBLIC = "public"  # 公开


@dataclass
class AgentTemplateVariable:
    """模板变量"""

    name: str
    var_type: str  # string, number, boolean, list, dict
    description: str
    default_value: Any = None
    required: bool = True

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "type": self.var_type,
            "description": self.description,
            "default_value": self.default_value,
            "required": self.required,
        }


@dataclass
class AgentTemplate:
    """Agent模板"""

    template_id: str
    name: str
    description: str
    category: str
    version: str = "1.0.0"
    author: str = "system"
    visibility: str = TemplateVisibility.PRIVATE.value

    # 模板配置
    role_template: str = ""
    goal_template: str = ""
    backstory_template: str = ""

    # 变量定义
    variables: List[AgentTemplateVariable] = field(default_factory=list)

    # 默认工具
    default_tools: List[str] = field(default_factory=list)

    # 默认参数
    default_params: Dict[str, Any] = field(default_factory=dict)

    # 元数据
    tags: List[str] = field(default_factory=list)
    usage_count: int = 0
    rating: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "template_id": self.template_id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "version": self.version,
            "author": self.author,
            "visibility": self.visibility,
            "role_template": self.role_template,
            "goal_template": self.goal_template,
            "backstory_template": self.backstory_template,
            "variables": [v.to_dict() for v in self.variables],
            "default_tools": self.default_tools,
            "default_params": self.default_params,
            "tags": self.tags,
            "usage_count": self.usage_count,
            "rating": self.rating,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


@dataclass
class TemplateInstance:
    """模板实例"""

    instance_id: str
    template_id: str
    agent_id: str
    variable_values: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "instance_id": self.instance_id,
            "template_id": self.template_id,
            "agent_id": self.agent_id,
            "variable_values": self.variable_values,
            "created_at": self.created_at,
        }


class CustomAgentTemplateSystem:
    """
    自定义Agent模板系统

    功能:
    1. 模板创建和管理
    2. 模板变量替换
    3. 模板实例化
    4. 模板市场/共享
    5. 模板版本管理
    """

    def __init__(self, storage_dir: str = "templates/agents"):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)

        # 模板存储
        self.templates: Dict[str, AgentTemplate] = {}

        # 实例存储
        self.instances: Dict[str, TemplateInstance] = {}

        # 初始化内置模板
        self._init_builtin_templates()

        self._lock = Lock()

    def _generate_id(self, prefix: str) -> str:
        """生成唯一ID"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_hash = hashlib.md5(f"{prefix}_{timestamp}".encode()).hexdigest()[:8]
        return f"{prefix}_{timestamp}_{random_hash}"

    def _init_builtin_templates(self):
        """初始化内置模板"""
        # 市场分析师模板
        market_analyst_template = AgentTemplate(
            template_id="builtin_market_analyst",
            name="市场分析师",
            description="专业的市场分析Agent，负责技术面和基本面分析",
            category=TemplateCategory.ANALYSIS.value,
            author="ShiHao System",
            visibility=TemplateVisibility.PUBLIC.value,
            role_template="{market}首席市场分析师",
            goal_template="深入分析{market}市场趋势，提供数据驱动的投资建议",
            backstory_template="""
            你是一位资深市场分析师，精通{market}市场。
            你擅长{skills}分析。
            """,
            variables=[
                AgentTemplateVariable("market", "string", "目标市场", "A股", True),
                AgentTemplateVariable(
                    "skills", "string", "专业技能", "技术面和基本面", True
                ),
            ],
            default_tools=["ashare_data_tool", "technical_indicator_tool"],
            tags=["分析", "市场", "基础"],
        )
        self.templates[market_analyst_template.template_id] = market_analyst_template

        # 风险管理师模板
        risk_manager_template = AgentTemplate(
            template_id="builtin_risk_manager",
            name="风险管理师",
            description="专业的风险管理Agent，负责监控和预警",
            category=TemplateCategory.MONITORING.value,
            author="ShiHao System",
            visibility=TemplateVisibility.PUBLIC.value,
            role_template="风险管理总监",
            goal_template="实时监控{portfolio_type}投资风险，保护资产安全",
            backstory_template="""
            你是风险管理专家，精通{risk_types}风险管理。
            你坚信：保住本金是第一要务。
            """,
            variables=[
                AgentTemplateVariable(
                    "portfolio_type", "string", "投资组合类型", "多资产", True
                ),
                AgentTemplateVariable(
                    "risk_types", "string", "风险类型", "市场风险和信用风险", True
                ),
            ],
            default_tools=["risk_metrics_tool", "stock_monitor_tool"],
            tags=["风险", "监控", "基础"],
        )
        self.templates[risk_manager_template.template_id] = risk_manager_template

        # 交易执行员模板
        trade_executor_template = AgentTemplate(
            template_id="builtin_trade_executor",
            name="交易执行员",
            description="专业的交易执行Agent，负责最优成交",
            category=TemplateCategory.EXECUTION.value,
            author="ShiHao System",
            visibility=TemplateVisibility.PUBLIC.value,
            role_template="交易执行专家",
            goal_template="最优执行{market}交易指令",
            backstory_template="""
            你是高频交易背景的执行专家。
            你精通{order_types}订单执行。
            """,
            variables=[
                AgentTemplateVariable("market", "string", "目标市场", "A股", True),
                AgentTemplateVariable(
                    "order_types", "string", "订单类型", "市价单和限价单", True
                ),
            ],
            default_tools=["trading_api_tool", "execution_strategy_tool"],
            tags=["交易", "执行", "基础"],
        )
        self.templates[trade_executor_template.template_id] = trade_executor_template

    def create_template(
        self,
        name: str,
        description: str,
        category: TemplateCategory,
        role_template: str,
        goal_template: str,
        backstory_template: str,
        variables: Optional[List[Dict[str, Any]]] = None,
        default_tools: Optional[List[str]] = None,
        author: str = "user",
        visibility: TemplateVisibility = TemplateVisibility.PRIVATE,
        tags: Optional[List[str]] = None,
    ) -> str:
        """创建新模板"""
        with self._lock:
            template_id = self._generate_id("template")

            # 构建变量列表
            var_list = []
            for var_data in variables or []:
                var_list.append(AgentTemplateVariable(**var_data))

            template = AgentTemplate(
                template_id=template_id,
                name=name,
                description=description,
                category=category.value,
                author=author,
                visibility=visibility.value,
                role_template=role_template,
                goal_template=goal_template,
                backstory_template=backstory_template,
                variables=var_list,
                default_tools=default_tools or [],
                tags=tags or [],
            )

            self.templates[template_id] = template

            return template_id

    def instantiate_template(
        self, template_id: str, agent_id: str, variable_values: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """实例化模板"""
        with self._lock:
            template = self.templates.get(template_id)
            if not template:
                return None

            # 验证必需变量
            for var in template.variables:
                if var.required and var.name not in variable_values:
                    if var.default_value is not None:
                        variable_values[var.name] = var.default_value
                    else:
                        return None

            # 替换模板变量
            def replace_vars(text: str) -> str:
                result = text
                for var_name, var_value in variable_values.items():
                    result = result.replace(f"{{{var_name}}}", str(var_value))
                return result

            # 生成Agent配置
            agent_config = {
                "role": replace_vars(template.role_template),
                "goal": replace_vars(template.goal_template),
                "backstory": replace_vars(template.backstory_template),
                "tools": template.default_tools.copy(),
                "params": copy.deepcopy(template.default_params),
            }

            # 创建实例记录
            instance_id = self._generate_id("instance")
            instance = TemplateInstance(
                instance_id=instance_id,
                template_id=template_id,
                agent_id=agent_id,
                variable_values=variable_values,
            )

            self.instances[instance_id] = instance

            # 更新模板使用次数
            template.usage_count += 1

            return agent_config

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        """获取模板"""
        template = self.templates.get(template_id)
        return template.to_dict() if template else None

    def list_templates(
        self,
        category: Optional[TemplateCategory] = None,
        visibility: Optional[TemplateVisibility] = None,
        author: Optional[str] = None,
        tags: Optional[List[str]] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """列出模板"""
        with self._lock:
            results = []

            for template in self.templates.values():
                # 过滤条件
                if category and template.category != category.value:
                    continue
                if visibility and template.visibility != visibility.value:
                    continue
                if author and template.author != author:
                    continue
                if tags and not any(tag in template.tags for tag in tags):
                    continue

                results.append(
                    {
                        "template_id": template.template_id,
                        "name": template.name,
                        "description": template.description,
                        "category": template.category,
                        "version": template.version,
                        "author": template.author,
                        "visibility": template.visibility,
                        "usage_count": template.usage_count,
                        "rating": template.rating,
                        "tags": template.tags,
                    }
                )

            # 按使用次数排序
            results.sort(key=lambda x: x["usage_count"], reverse=True)

            return results[:limit]

    def update_template(self, template_id: str, updates: Dict[str, Any]) -> bool:
        """更新模板"""
        with self._lock:
            template = self.templates.get(template_id)
            if not template:
                return False

            # 更新允许的字段
            allowed_fields = [
                "name",
                "description",
                "role_template",
                "goal_template",
                "backstory_template",
                "default_tools",
                "tags",
                "visibility",
            ]

            for field_name, value in updates.items():
                if field_name in allowed_fields:
                    setattr(template, field_name, value)

            template.updated_at = datetime.now().isoformat()
            return True

    def delete_template(self, template_id: str) -> bool:
        """删除模板"""
        with self._lock:
            if template_id not in self.templates:
                return False

            # 检查是否为内置模板
            if template_id.startswith("builtin_"):
                return False

            del self.templates[template_id]
            return True

    def rate_template(self, template_id: str, rating: float) -> bool:
        """评分模板"""
        with self._lock:
            template = self.templates.get(template_id)
            if not template:
                return False

            # 更新评分（简单平均）
            if template.usage_count > 0:
                template.rating = (
                    template.rating * (template.usage_count - 1) + rating
                ) / template.usage_count
            else:
                template.rating = rating

            return True

    def export_template(self, template_id: str) -> Optional[str]:
        """导出模板为JSON"""
        template = self.templates.get(template_id)
        if not template:
            return None

        return json.dumps(template.to_dict(), ensure_ascii=False, indent=2)

    def import_template(self, template_json: str) -> Optional[str]:
        """导入模板"""
        try:
            data = json.loads(template_json)

            with self._lock:
                template_id = self._generate_id("imported")

                # 构建变量列表
                var_list = []
                for var_data in data.get("variables", []):
                    var_list.append(AgentTemplateVariable(**var_data))

                template = AgentTemplate(
                    template_id=template_id,
                    name=data["name"],
                    description=data["description"],
                    category=data.get("category", TemplateCategory.CUSTOM.value),
                    author=data.get("author", "imported"),
                    visibility=data.get("visibility", TemplateVisibility.PRIVATE.value),
                    role_template=data.get("role_template", ""),
                    goal_template=data.get("goal_template", ""),
                    backstory_template=data.get("backstory_template", ""),
                    variables=var_list,
                    default_tools=data.get("default_tools", []),
                    tags=data.get("tags", []),
                )

                self.templates[template_id] = template

                return template_id
        except Exception as e:
            print(f"Error importing template: {e}")
            return None

    def get_statistics(self) -> Dict[str, Any]:
        """获取系统统计"""
        with self._lock:
            # 分类统计
            category_stats = {}
            for template in self.templates.values():
                category_stats[template.category] = (
                    category_stats.get(template.category, 0) + 1
                )

            # 作者统计
            author_stats = {}
            for template in self.templates.values():
                author_stats[template.author] = author_stats.get(template.author, 0) + 1

            return {
                "total_templates": len(self.templates),
                "total_instances": len(self.instances),
                "category_distribution": category_stats,
                "author_distribution": author_stats,
                "most_used": sorted(
                    self.templates.values(), key=lambda t: t.usage_count, reverse=True
                )[:5],
            }


# 全局模板系统实例
_global_template_system: Optional[CustomAgentTemplateSystem] = None


def get_template_system() -> CustomAgentTemplateSystem:
    """获取全局模板系统实例"""
    global _global_template_system
    if _global_template_system is None:
        _global_template_system = CustomAgentTemplateSystem()
    return _global_template_system


def create_agent_from_template(
    template_id: str, agent_id: str, variables: Dict[str, Any]
) -> Optional[Dict[str, Any]]:
    """便捷函数：从模板创建Agent"""
    system = get_template_system()
    return system.instantiate_template(template_id, agent_id, variables)
