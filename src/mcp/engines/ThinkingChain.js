/**
 * MCP Thinking Chain - 思维链追踪系统
 * 支持推理步骤记录、分支管理、回溯与反思
 */

class ThinkingChain {
  constructor() {
    this.chains = new Map();
    this.branches = new Map();
    this.currentChainId = null;
  }

  /**
   * 创建新的思维链
   */
  createChain(initialThought, metadata = {}) {
    const chainId = `chain_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const chain = {
      id: chainId,
      createdAt: new Date().toISOString(),
      metadata,
      thoughts: [{
        id: `step_1`,
        thought: initialThought,
        thoughtNumber: 1,
        totalThoughts: 1,
        nextThoughtNeeded: true,
        timestamp: new Date().toISOString(),
        reasoning: null,
        criticism: null,
        reflectionOf: null,
        branchId: null
      }],
      branches: [],
      currentBranch: null,
      status: 'in_progress'
    };

    this.chains.set(chainId, chain);
    this.currentChainId = chainId;
    return chain;
  }

  /**
   * 添加思维步骤
   */
  addThought(chainId, thought, options = {}) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    const step = {
      id: `step_${chain.thoughts.length + 1}`,
      thought,
      thoughtNumber: chain.thoughts.length + 1,
      totalThoughts: chain.thoughts.length + 1,
      nextThoughtNeeded: options.nextThoughtNeeded ?? true,
      reasoning: options.reasoning || null,
      criticism: options.criticism || null,
      reflectionOf: options.reflectionOf || null,
      branchId: options.branchId || chain.currentBranch,
      metadata: options.metadata || {},
      timestamp: new Date().toISOString()
    };

    chain.thoughts.push(step);
    return step;
  }

  /**
   * 创建分支
   */
  createBranch(chainId, fromThoughtId, branchName, newDirection) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    const parentThought = chain.thoughts.find(t => t.id === fromThoughtId);
    if (!parentThought) {
      throw new Error(`Thought not found: ${fromThoughtId}`);
    }

    const branchId = `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const branch = {
      id: branchId,
      name: branchName || `Branch ${chain.branches.length + 1}`,
      parentThoughtId: fromThoughtId,
      direction: newDirection,
      thoughts: [],
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    chain.branches.push(branch);
    this.branches.set(branchId, branch);
    chain.currentBranch = branchId;

    return branch;
  }

  /**
   * 切换到分支
   */
  switchBranch(chainId, branchId) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    const branch = chain.branches.find(b => b.id === branchId);
    if (!branch) {
      throw new Error(`Branch not found: ${branchId}`);
    }

    chain.currentBranch = branchId;
    return branch;
  }

  /**
   * 切换回主链
   */
  switchToMain(chainId) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    chain.currentBranch = null;
    return chain;
  }

  /**
   * 反思某一步
   */
  reflectOnStep(chainId, thoughtId, reflection) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    const originalThought = chain.thoughts.find(t => t.id === thoughtId);
    if (!originalThought) {
      throw new Error(`Thought not found: ${thoughtId}`);
    }

    const correction = this.addThought(chainId, reflection.correction, {
      reasoning: reflection.explanation,
      criticism: reflection.criticism || originalThought.thought,
      reflectionOf: thoughtId,
      branchId: originalThought.branchId
    });

    return {
      original: originalThought,
      correction,
      relationship: 'reflection_on_previous',
      improvement: reflection.improvement || null
    };
  }

  /**
   * 获取完整思维链
   */
  getChain(chainId) {
    const chain = this.chains.get(chainId);
    if (!chain) return null;

    return {
      ...chain,
      serialized: chain.thoughts.map(t => {
        let prefix = `[${t.thoughtNumber}]`;
        if (t.branchId) {
          const branch = chain.branches.find(b => b.id === t.branchId);
          prefix += ` (${branch?.name || 'unknown'})`;
        }
        if (t.reflectionOf) {
          prefix += ' [REFLECTION]';
        }
        return `${prefix}\n${t.thought}\n${t.reasoning ? `Reasoning: ${t.reasoning}` : ''}`;
      }).join('\n\n---\n\n'),
      summary: this.generateSummary(chain)
    };
  }

  /**
   * 获取所有思维链
   */
  getAllChains() {
    return Array.from(this.chains.values()).map(chain => ({
      id: chain.id,
      initialThought: chain.initialThought,
      createdAt: chain.createdAt,
      updatedAt: chain.updatedAt,
      thoughtCount: chain.thoughts.length,
      branches: chain.branches.map(b => ({ id: b.id, name: b.name }))
    }));
  }

  /**
   * 添加反思
   */
  addReflection(chainId, thoughtId, criticism) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }
    
    const thought = chain.thoughts.find(t => t.id === thoughtId);
    if (!thought) {
      throw new Error(`Thought not found: ${thoughtId}`);
    }

    thought.reflection = criticism;
    thought.reflectionOf = thoughtId;
    thought.reflectedAt = new Date().toISOString();
    
    chain.updatedAt = new Date().toISOString();
    return this.getChain(chainId);
  }

  /**
   * 获取分支
   */
  getBranches(chainId) {
    const chain = this.chains.get(chainId);
    if (!chain) return [];
    return chain.branches;
  }

  /**
   * 获取分支思维
   */
  getBranchThoughts(chainId, branchId) {
    const chain = this.chains.get(chainId);
    if (!chain) return [];
    return chain.thoughts.filter(t => t.branchId === branchId);
  }

  /**
   * 暴露为 MCP 资源
   */
  toResource(chainId) {
    const chain = this.getChain(chainId);
    if (!chain) return null;

    return {
      uri: `thinking://${chainId}`,
      name: `推理链 ${chainId.split('_')[1]}`,
      description: `完整思维追踪，包含 ${chain.thoughts.length} 个步骤`,
      mimeType: 'text/plain',
      content: chain.serialized
    };
  }

  /**
   * 序列化思维链为可读格式
   */
  serialize(chainId) {
    const chain = this.getChain(chainId);
    if (!chain) return null;

    return {
      id: chain.id,
      createdAt: chain.createdAt,
      metadata: chain.metadata,
      steps: chain.thoughts.map(t => ({
        number: t.thoughtNumber,
        thought: t.thought,
        reasoning: t.reasoning,
        hasReflection: !!t.reflectionOf,
        branch: t.branchId ? chain.branches.find(b => b.id === t.branchId)?.name : null
      })),
      branches: chain.branches.map(b => ({
        id: b.id,
        name: b.name,
        direction: b.direction
      })),
      currentBranch: chain.currentBranch
    };
  }

  /**
   * 生成摘要
   */
  generateSummary(chain) {
    const totalSteps = chain.thoughts.length;
    const branches = chain.branches.length;
    const reflections = chain.thoughts.filter(t => t.reflectionOf).length;
    
    return {
      totalSteps,
      branches,
      reflections,
      currentStep: chain.thoughts[chain.thoughts.length - 1]?.thoughtNumber,
      duration: this.calculateDuration(chain),
      status: chain.status
    };
  }

  /**
   * 计算持续时间
   */
  calculateDuration(chain) {
    if (chain.thoughts.length < 2) return null;
    
    const first = new Date(chain.thoughts[0].timestamp);
    const last = new Date(chain.thoughts[chain.thoughts.length - 1].timestamp);
    const ms = last - first;
    
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  }

  /**
   * 完成思维链
   */
  completeChain(chainId, conclusion) {
    const chain = this.chains.get(chainId);
    if (!chain) {
      throw new Error(`Chain not found: ${chainId}`);
    }

    chain.status = 'completed';
    chain.conclusion = conclusion;
    chain.completedAt = new Date().toISOString();

    return chain;
  }

  /**
   * 删除思维链
   */
  deleteChain(chainId) {
    const chain = this.chains.get(chainId);
    if (!chain) return false;

    for (const branch of chain.branches) {
      this.branches.delete(branch.id);
    }
    
    this.chains.delete(chainId);
    if (this.currentChainId === chainId) {
      this.currentChainId = null;
    }
    return true;
  }

  /**
   * 获取当前思维链
   */
  getCurrentChain() {
    if (!this.currentChainId) return null;
    return this.getChain(this.currentChainId);
  }

  /**
   * 列出所有思维链
   */
  listChains() {
    return Array.from(this.chains.values()).map(chain => ({
      id: chain.id,
      createdAt: chain.createdAt,
      status: chain.status,
      steps: chain.thoughts.length,
      branches: chain.branches.length
    }));
  }
}

// 单例导出
const thinkingChain = new ThinkingChain();

module.exports = {
  ThinkingChain,
  thinkingChain
};
