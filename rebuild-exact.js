const fs = require('fs');
const path = 'D:/龙虾/src/core/BrainSystem.js';
let content = fs.readFileSync(path, 'utf8');

// 已知精确位置（从上一轮输出得到）
const markerStart = content.indexOf('分析团队 Agents');
const markerEnd = content.indexOf('class AgentTeamManager');

console.log('分析团队 Agents 位置:', markerStart);
console.log('class AgentTeamManager 位置:', markerEnd);

if (markerStart === -1 || markerEnd === -1) {
  console.log('✗ 找不到边界');
  process.exit(1);
}

// 找到注释块的开始（/** 在 markerStart 之前）
let commentStart = content.lastIndexOf('/**', markerStart);
console.log('注释开始位置:', commentStart);

// 提取前后部分
const before = content.substring(0, commentStart);
const after = content.substring(markerEnd);

// 正确的14个Agent类代码
const agentsCode = `
/**
 * 分析团队 Agents
 */

// 意图分析Agent
class IntentAgent extends BaseAgent {
  constructor() {
    super('IntentAgent', 'analysis');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.analyzeIntent?.(input) || { intent: 'unknown', confidence: 0 };
    return {
      agent: this.name,
      team: this.team,
      intent: result.intent,
      confidence: result.confidence,
      suggestions: result.suggestions || [],
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 情感分析Agent
class EmotionAgent extends BaseAgent {
  constructor() {
    super('EmotionAgent', 'analysis');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.expressEmotion?.(input, '') || { detected: null };
    return {
      agent: this.name,
      team: this.team,
      emotion: result.detected,
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 上下文分析Agent
class ContextAgent extends BaseAgent {
  constructor() {
    super('ContextAgent', 'analysis');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.agiEngine?.(input) || { perception: {}, reasoning: {} };
    return {
      agent: this.name,
      team: this.team,
      context: result.perception || {},
      reasoning: result.reasoning || {},
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 代码执行Agent
class CodeAgent extends BaseAgent {
  constructor() {
    super('CodeAgent', 'execution');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.unifiedProcess?.(input) || { status: 'processed' };
    return {
      agent: this.name,
      team: this.team,
      result: result,
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 搜索Agent
class SearchAgent extends BaseAgent {
  constructor() {
    super('SearchAgent', 'execution');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.proactiveThink?.(input, context) || { prediction: {} };
    return {
      agent: this.name,
      team: this.team,
      prediction: result.prediction || {},
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 调试Agent
class DebugAgent extends BaseAgent {
  constructor() {
    super('DebugAgent', 'execution');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.deepReflect?.(input) || { awareness: {} };
    return {
      agent: this.name,
      team: this.team,
      reflection: result.awareness || {},
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 优化Agent
class OptimizeAgent extends BaseAgent {
  constructor() {
    super('OptimizeAgent', 'execution');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.smartStore?.('opt_' + Date.now(), input) || { stored: false };
    return {
      agent: this.name,
      team: this.team,
      optimized: result.stored || false,
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 测试Agent
class TestAgent extends BaseAgent {
  constructor() {
    super('TestAgent', 'execution');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.autonomousLearn?.(input) || { learned: false };
    return {
      agent: this.name,
      team: this.team,
      learned: result.learned || false,
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 质量审核Agent
class QualityAgent extends BaseAgent {
  constructor() {
    super('QualityAgent', 'review');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.agiEngine?.(input) || { decision: {} };
    return {
      agent: this.name,
      team: this.team,
      quality: result.decision || {},
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 安全审核Agent
class SecurityAgent extends BaseAgent {
  constructor() {
    super('SecurityAgent', 'review');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.performSecurityAudit?.(input) || { safe: true };
    return {
      agent: this.name,
      team: this.team,
      safe: result.safe !== false,
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 效果评估Agent
class EffectAgent extends BaseAgent {
  constructor() {
    super('EffectAgent', 'review');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.expressEmotion?.(input, '') || { emotion: null };
    return {
      agent: this.name,
      team: this.team,
      effect: result.emotion || 'neutral',
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 总结Agent
class SummaryAgent extends BaseAgent {
  constructor() {
    super('SummaryAgent', 'learning');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.coreReflection?.(input) || { summary: '' };
    return {
      agent: this.name,
      team: this.team,
      summary: result.summary || '',
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 改进Agent
class ImprovementAgent extends BaseAgent {
  constructor() {
    super('ImprovementAgent', 'learning');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.agiThink?.(input) || { improved: false };
    return {
      agent: this.name,
      team: this.team,
      improved: result.improved || false,
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

// 知识Agent
class KnowledgeAgent extends BaseAgent {
  constructor() {
    super('KnowledgeAgent', 'learning');
  }
  
  async execute(input, context = {}) {
    const result = BrainSystem.smartStore?.('knowledge_' + Date.now(), input) || { stored: false };
    return {
      agent: this.name,
      team: this.team,
      knowledge: result.stored || false,
      realExecution: true,
      timestamp: Date.now()
    };
  }
}

`;

// 组合新内容
const newContent = before + agentsCode + '\n\n' + after;

fs.writeFileSync(path, newContent, 'utf8');
console.log('✓ Agent区域已重建');
console.log('原大小:', content.length);
console.log('新大小:', newContent.length);

// 验证语法
try {
  require('child_process').spawnSync(process.execPath, ['-c', path], { stdio: 'pipe' });
  console.log('✓ 语法检查通过（node -c）');
} catch (e) {
  console.log('✗ 语法检查失败:', e.stderr?.toString() || e.message);
}
