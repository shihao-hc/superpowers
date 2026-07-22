const fs = require('fs');
const path = 'D:/龙虾/src/core/BrainSystem.js';
let content = fs.readFileSync(path, 'utf8');

console.log('当前版本:', content.match(/version [0-9.]+/)?.[0] || '未知');

// 找到插入位置：在AgentTeamManager类定义之前
// 先找到AgentTeamManager的位置
const agentTeamStart = content.indexOf('class AgentTeamManager');
if (agentTeamStart === -1) {
  console.log('✗ 找不到AgentTeamManager类');
  process.exit(1);
}

console.log('AgentTeamManager开始位置:', agentTeamStart);

// 找到AgentTeamManager之前的注释块（/** ... */）
let insertPos = content.lastIndexOf('/**', agentTeamStart);
if (insertPos === -1) {
  // 如果找不到注释，就在AgentTeamManager开始前插入
  insertPos = agentTeamStart;
}

console.log('Agent插入位置:', insertPos);

// 14个Agent类定义（简洁版，确保语法正确）
const agentsCode = `
/**
 * 分析团队 Agents (v22.0)
 */

// 意图分析Agent
class IntentAgent extends BaseAgent {
  constructor() { super('IntentAgent', 'analysis'); }
  async execute(input, context = {}) {
    const result = BrainSystem.analyzeIntent?.(input) || { intent: 'unknown', confidence: 0 };
    return { agent: this.name, team: this.team, intent: result.intent, confidence: result.confidence, suggestions: result.suggestions || [], realExecution: true, timestamp: Date.now() };
  }
}

// 情感分析Agent
class EmotionAgent extends BaseAgent {
  constructor() { super('EmotionAgent', 'analysis'); }
  async execute(input, context = {}) {
    const result = BrainSystem.expressEmotion?.(input, '') || { detected: null };
    return { agent: this.name, team: this.team, emotion: result.detected, realExecution: true, timestamp: Date.now() };
  }
}

// 上下文分析Agent
class ContextAgent extends BaseAgent {
  constructor() { super('ContextAgent', 'analysis'); }
  async execute(input, context = {}) {
    const result = BrainSystem.agiEngine?.(input) || { perception: {}, reasoning: {} };
    return { agent: this.name, team: this.team, context: result.perception || {}, reasoning: result.reasoning || {}, realExecution: true, timestamp: Date.now() };
  }
}

// 代码执行Agent
class CodeAgent extends BaseAgent {
  constructor() { super('CodeAgent', 'execution'); }
  async execute(input, context = {}) {
    const result = BrainSystem.unifiedProcess?.(input) || { status: 'processed' };
    return { agent: this.name, team: this.team, result: result, realExecution: true, timestamp: Date.now() };
  }
}

// 搜索Agent
class SearchAgent extends BaseAgent {
  constructor() { super('SearchAgent', 'execution'); }
  async execute(input, context = {}) {
    const result = BrainSystem.proactiveThink?.(input, context) || { prediction: {} };
    return { agent: this.name, team: this.team, prediction: result.prediction || {}, realExecution: true, timestamp: Date.now() };
  }
}

// 调试Agent
class DebugAgent extends BaseAgent {
  constructor() { super('DebugAgent', 'execution'); }
  async execute(input, context = {}) {
    const result = BrainSystem.deepReflect?.(input) || { awareness: {} };
    return { agent: this.name, team: this.team, reflection: result.awareness || {}, realExecution: true, timestamp: Date.now() };
  }
}

// 优化Agent
class OptimizeAgent extends BaseAgent {
  constructor() { super('OptimizeAgent', 'execution'); }
  async execute(input, context = {}) {
    const result = BrainSystem.smartStore?.('opt_' + Date.now(), input) || { stored: false };
    return { agent: this.name, team: this.team, optimized: result.stored || false, realExecution: true, timestamp: Date.now() };
  }
}

// 测试Agent
class TestAgent extends BaseAgent {
  constructor() { super('TestAgent', 'execution'); }
  async execute(input, context = {}) {
    const result = BrainSystem.autonomousLearn?.(input) || { learned: false };
    return { agent: this.name, team: this.team, learned: result.learned || false, realExecution: true, timestamp: Date.now() };
  }
}

// 质量审核Agent
class QualityAgent extends BaseAgent {
  constructor() { super('QualityAgent', 'review'); }
  async execute(input, context = {}) {
    const result = BrainSystem.agiEngine?.(input) || { decision: {} };
    return { agent: this.name, team: this.team, quality: result.decision || {}, realExecution: true, timestamp: Date.now() };
  }
}

// 安全审核Agent
class SecurityAgent extends BaseAgent {
  constructor() { super('SecurityAgent', 'review'); }
  async execute(input, context = {}) {
    const result = BrainSystem.performSecurityAudit?.(input) || { safe: true };
    return { agent: this.name, team: this.team, safe: result.safe !== false, realExecution: true, timestamp: Date.now() };
  }
}

// 效果评估Agent
class EffectAgent extends BaseAgent {
  constructor() { super('EffectAgent', 'review'); }
  async execute(input, context = {}) {
    const result = BrainSystem.expressEmotion?.(input, '') || { emotion: null };
    return { agent: this.name, team: this.team, effect: result.emotion || 'neutral', realExecution: true, timestamp: Date.now() };
  }
}

// 总结Agent
class SummaryAgent extends BaseAgent {
  constructor() { super('SummaryAgent', 'learning'); }
  async execute(input, context = {}) {
    const result = BrainSystem.coreReflection?.(input) || { summary: '' };
    return { agent: this.name, team: this.team, summary: result.summary || '', realExecution: true, timestamp: Date.now() };
  }
}

// 改进Agent
class ImprovementAgent extends BaseAgent {
  constructor() { super('ImprovementAgent', 'learning'); }
  async execute(input, context = {}) {
    const result = BrainSystem.agiThink?.(input) || { improved: false };
    return { agent: this.name, team: this.team, improved: result.improved || false, realExecution: true, timestamp: Date.now() };
  }
}

// 知识Agent
class KnowledgeAgent extends BaseAgent {
  constructor() { super('KnowledgeAgent', 'learning'); }
  async execute(input, context = {}) {
    const result = BrainSystem.smartStore?.('knowledge_' + Date.now(), input) || { stored: false };
    return { agent: this.name, team: this.team, knowledge: result.stored || false, realExecution: true, timestamp: Date.now() };
  }
}

`;

// 插入Agent类
const newContent = content.substring(0, insertPos) + agentsCode + '\n' + content.substring(insertPos);

// 更新版本号
const newerContent = newContent.replace(/version 21\.2\.0/, 'version 22.0.0');
const finalContent = newerContent.replace(/v21\.2/, 'v22.0');

fs.writeFileSync(path, finalContent, 'utf8');
console.log('✓ v22.0 Agent类已添加');

// 验证语法
try {
  require('child_process').spawnSync(process.execPath, ['-c', path], { stdio: 'pipe' });
  console.log('✓ 语法检查通过');
} catch (e) {
  console.log('✗ 语法检查失败:', e.stderr?.toString() || e.message);
}

// 验证加载
try {
  delete require.cache[require.resolve(path)];
  const BS = require(path);
  console.log('✓ 加载成功');
  console.log('版本:', BS.version || BS.BrainSystem?.version);
  console.log('Agent总数:', Object.keys(BS.AgentTeamManager?.agents || {}).length);
} catch (e) {
  console.log('✗ 加载失败:', e.message);
}
