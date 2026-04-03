"""
Agent Self-Evolution System
Agent自进化能力 - 从经验中学习并自我优化
"""

import json
import os
import copy
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, field
from threading import Lock
from enum import Enum
import hashlib


class EvolutionStatus(Enum):
    """进化状态"""

    DRAFT = "draft"
    TESTING = "testing"
    ACTIVE = "active"
    ARCHIVED = "archived"
    FAILED = "failed"


class MutationType(Enum):
    """变异类型"""

    PROMPT_OPTIMIZATION = "prompt_optimization"  # 提示词优化
    TOOL_ADDITION = "tool_addition"  # 工具添加
    TOOL_REMOVAL = "tool_removal"  # 工具移除
    PARAMETER_ADJUSTMENT = "parameter_adjustment"  # 参数调整
    BEHAVIOR_MODIFICATION = "behavior_modification"  # 行为修改


@dataclass
class EvolutionMutation:
    """进化变异"""

    mutation_id: str
    mutation_type: str
    description: str
    before_state: Dict[str, Any]
    after_state: Dict[str, Any]
    reason: str
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    performance_impact: float = 0.0  # -1 to 1

    def to_dict(self) -> dict:
        return {
            "mutation_id": self.mutation_id,
            "mutation_type": self.mutation_type,
            "description": self.description,
            "before_state": self.before_state,
            "after_state": self.after_state,
            "reason": self.reason,
            "created_at": self.created_at,
            "performance_impact": self.performance_impact,
        }


@dataclass
class EvolutionGene:
    """进化基因"""

    gene_id: str
    gene_type: str  # prompt, tool, parameter, behavior
    name: str
    value: Any
    version: int = 1
    fitness_score: float = 0.5  # 0-1
    mutation_history: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "gene_id": self.gene_id,
            "gene_type": self.gene_type,
            "name": self.name,
            "value": self.value,
            "version": self.version,
            "fitness_score": self.fitness_score,
            "mutation_history": self.mutation_history,
        }


@dataclass
class AgentGenome:
    """Agent基因组"""

    agent_id: str
    agent_type: str
    genes: Dict[str, EvolutionGene] = field(default_factory=dict)
    fitness_history: List[float] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        return {
            "agent_id": self.agent_id,
            "agent_type": self.agent_type,
            "genes": {k: v.to_dict() for k, v in self.genes.items()},
            "fitness_history": self.fitness_history,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }


class AgentSelfEvolutionSystem:
    """
    Agent自进化系统

    功能:
    1. 基因编码和变异
    2. 适应度评估
    3. 自然选择
    4. 知识传承
    5. 进化历史追踪
    """

    def __init__(self, storage_dir: str = "memory/evolution"):
        self.storage_dir = storage_dir
        os.makedirs(storage_dir, exist_ok=True)

        # Agent基因组
        self.agent_genomes: Dict[str, AgentGenome] = {}

        # 变异历史
        self.mutations: Dict[str, EvolutionMutation] = {}

        # 进化配置
        self.config = {
            "mutation_rate": 0.1,
            "selection_pressure": 0.3,
            "elitism_count": 2,
            "min_fitness_threshold": 0.3,
        }

        self._lock = Lock()

    def _generate_id(self, prefix: str) -> str:
        """生成唯一ID"""
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        random_hash = hashlib.md5(f"{prefix}_{timestamp}".encode()).hexdigest()[:8]
        return f"{prefix}_{timestamp}_{random_hash}"

    def register_agent(
        self, agent_id: str, agent_type: str, initial_config: Dict[str, Any]
    ) -> AgentGenome:
        """注册Agent到进化系统"""
        with self._lock:
            genome = AgentGenome(agent_id=agent_id, agent_type=agent_type)

            # 初始化基因
            for key, value in initial_config.items():
                gene_id = self._generate_id("gene")
                gene = EvolutionGene(
                    gene_id=gene_id,
                    gene_type=self._infer_gene_type(key),
                    name=key,
                    value=value,
                )
                genome.genes[key] = gene

            self.agent_genomes[agent_id] = genome

            return genome

    def _infer_gene_type(self, key: str) -> str:
        """推断基因类型"""
        if "prompt" in key.lower():
            return "prompt"
        elif "tool" in key.lower():
            return "tool"
        elif "param" in key.lower():
            return "parameter"
        else:
            return "behavior"

    def evaluate_fitness(
        self, agent_id: str, performance_metrics: Dict[str, float]
    ) -> float:
        """评估适应度"""
        with self._lock:
            genome = self.agent_genomes.get(agent_id)
            if not genome:
                return 0.0

            # 计算综合适应度
            weights = {
                "accuracy": 0.3,
                "response_time": 0.2,
                "user_satisfaction": 0.3,
                "task_completion": 0.2,
            }

            fitness = 0.0
            for metric, weight in weights.items():
                value = performance_metrics.get(metric, 0.5)
                fitness += value * weight

            # 更新基因组
            genome.fitness_history.append(fitness)
            genome.updated_at = datetime.now().isoformat()

            # 更新各基因的适应度
            for gene in genome.genes.values():
                gene.fitness_score = fitness

            return fitness

    def mutate(
        self,
        agent_id: str,
        mutation_type: MutationType,
        target_gene: str,
        new_value: Any,
        reason: str,
    ) -> Optional[str]:
        """执行变异"""
        with self._lock:
            genome = self.agent_genomes.get(agent_id)
            if not genome:
                return None

            gene = genome.genes.get(target_gene)
            if not gene:
                return None

            # 保存变异前状态
            before_state = {
                "gene_name": gene.name,
                "gene_value": gene.value,
                "gene_version": gene.version,
            }

            # 执行变异
            mutation_id = self._generate_id("mutation")

            gene.value = new_value
            gene.version += 1
            gene.mutation_history.append(mutation_id)

            # 记录变异
            mutation = EvolutionMutation(
                mutation_id=mutation_id,
                mutation_type=mutation_type.value,
                description=f"变异 {target_gene}: {before_state['gene_value']} -> {new_value}",
                before_state=before_state,
                after_state={
                    "gene_name": gene.name,
                    "gene_value": gene.value,
                    "gene_version": gene.version,
                },
                reason=reason,
            )

            self.mutations[mutation_id] = mutation
            genome.updated_at = datetime.now().isoformat()

            return mutation_id

    def crossover(
        self, parent1_id: str, parent2_id: str, child_id: str
    ) -> Optional[AgentGenome]:
        """交叉（从两个父代创建新Agent）"""
        with self._lock:
            parent1 = self.agent_genomes.get(parent1_id)
            parent2 = self.agent_genomes.get(parent2_id)

            if not parent1 or not parent2:
                return None

            # 创建子代基因组
            child_genome = AgentGenome(agent_id=child_id, agent_type=parent1.agent_type)

            # 基因交叉
            for gene_name in set(parent1.genes.keys()) | set(parent2.genes.keys()):
                if gene_name in parent1.genes and gene_name in parent2.genes:
                    # 随机选择一个父代的基因
                    import random

                    source_gene = random.choice(
                        [parent1.genes[gene_name], parent2.genes[gene_name]]
                    )

                    gene_id = self._generate_id("gene")
                    child_gene = EvolutionGene(
                        gene_id=gene_id,
                        gene_type=source_gene.gene_type,
                        name=source_gene.name,
                        value=copy.deepcopy(source_gene.value),
                        fitness_score=(
                            parent1.genes[gene_name].fitness_score
                            + parent2.genes[gene_name].fitness_score
                        )
                        / 2,
                    )
                    child_genome.genes[gene_name] = child_gene
                elif gene_name in parent1.genes:
                    source_gene = parent1.genes[gene_name]
                    gene_id = self._generate_id("gene")
                    child_gene = EvolutionGene(
                        gene_id=gene_id,
                        gene_type=source_gene.gene_type,
                        name=source_gene.name,
                        value=copy.deepcopy(source_gene.value),
                    )
                    child_genome.genes[gene_name] = child_gene

            self.agent_genomes[child_id] = child_genome

            return child_genome

    def select_best_agents(self, count: int = 3) -> List[AgentGenome]:
        """选择最优Agent"""
        with self._lock:
            # 按最近适应度排序
            def get_recent_fitness(genome: AgentGenome) -> float:
                return genome.fitness_history[-1] if genome.fitness_history else 0.0

            sorted_genomes = sorted(
                self.agent_genomes.values(), key=get_recent_fitness, reverse=True
            )

            return sorted_genomes[:count]

    def optimize_gene(
        self, agent_id: str, gene_name: str, optimization_suggestions: List[str]
    ) -> Optional[str]:
        """基于建议优化基因"""
        genome = self.agent_genomes.get(agent_id)
        if not genome:
            return None

        gene = genome.genes.get(gene_name)
        if not gene:
            return None

        # 根据基因类型进行优化
        if gene.gene_type == "prompt" and isinstance(gene.value, str):
            # 优化提示词
            optimized = self._optimize_prompt(gene.value, optimization_suggestions)
            return self.mutate(
                agent_id,
                MutationType.PROMPT_OPTIMIZATION,
                gene_name,
                optimized,
                f"优化提示词基于建议: {optimization_suggestions[:2]}",
            )

        return None

    def _optimize_prompt(self, prompt: str, suggestions: List[str]) -> str:
        """优化提示词"""
        # 简化版：在提示词末尾添加改进建议
        if suggestions:
            improvement_section = "\n\n[优化要求]\n" + "\n".join(
                f"- {s}" for s in suggestions[:3]
            )
            return prompt + improvement_section
        return prompt

    def get_evolution_report(self, agent_id: str) -> Dict[str, Any]:
        """获取进化报告"""
        genome = self.agent_genomes.get(agent_id)
        if not genome:
            return {}

        return {
            "agent_id": agent_id,
            "agent_type": genome.agent_type,
            "generation": max((g.version for g in genome.genes.values()), default=1),
            "total_genes": len(genome.genes),
            "fitness_history": genome.fitness_history,
            "current_fitness": genome.fitness_history[-1]
            if genome.fitness_history
            else 0.0,
            "average_fitness": sum(genome.fitness_history) / len(genome.fitness_history)
            if genome.fitness_history
            else 0.0,
            "gene_details": {
                name: {
                    "version": gene.version,
                    "fitness": gene.fitness_score,
                    "mutations": len(gene.mutation_history),
                }
                for name, gene in genome.genes.items()
            },
        }

    def get_statistics(self) -> Dict[str, Any]:
        """获取系统统计"""
        with self._lock:
            total_agents = len(self.agent_genomes)
            total_mutations = len(self.mutations)

            # 平均适应度
            all_fitness = []
            for genome in self.agent_genomes.values():
                if genome.fitness_history:
                    all_fitness.append(genome.fitness_history[-1])

            avg_fitness = sum(all_fitness) / len(all_fitness) if all_fitness else 0.0

            # 变异类型统计
            mutation_types = {}
            for mutation in self.mutations.values():
                mutation_types[mutation.mutation_type] = (
                    mutation_types.get(mutation.mutation_type, 0) + 1
                )

            return {
                "total_agents": total_agents,
                "total_mutations": total_mutations,
                "average_fitness": round(avg_fitness, 3),
                "mutation_types": mutation_types,
                "config": self.config,
            }

    def save(self, filename: Optional[str] = None) -> str:
        """保存进化数据"""
        if filename is None:
            filename = f"evolution_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"

        filepath = os.path.join(self.storage_dir, filename)

        with self._lock:
            data = {
                "agent_genomes": {
                    k: v.to_dict() for k, v in self.agent_genomes.items()
                },
                "mutations": {k: v.to_dict() for k, v in self.mutations.items()},
                "config": self.config,
            }

            with open(filepath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        return filepath


# 全局进化系统实例
_global_evolution_system: Optional[AgentSelfEvolutionSystem] = None


def get_evolution_system() -> AgentSelfEvolutionSystem:
    """获取全局进化系统实例"""
    global _global_evolution_system
    if _global_evolution_system is None:
        _global_evolution_system = AgentSelfEvolutionSystem()
    return _global_evolution_system
