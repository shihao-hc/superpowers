/**
 * ShiHao Permission Service
 * 基于 Claude Code 权限系统架构增强
 * 
 * Claude Code 特性:
 * - 6种权限模式: default, plan, acceptEdits, bypass, dontAsk, auto
 * - 规则匹配: allow, deny, ask 三种行为
 * - 拒绝追踪: 防止无限询问
 * - 路径验证: 自动允许/拒绝路径
 */

const EventEmitter = require('events');

class PermissionService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.mode = options.mode || 'default';
    this.maxTurns = options.maxTurns || 100;
    
    // 规则存储
    this.allowRules = new Map();
    this.denyRules = new Map();
    this.askRules = new Map();
    
    // 拒绝追踪
    this.denialTracking = new Map();
    this.denialLimits = {
      default: 3,
      bash: 3,
      edit: 3,
      mcp: 5
    };
    
    // 权限模式配置
    this.modeConfig = {
      default: {
        title: 'Default',
        behavior: 'ask',
        description: '需要询问用户'
      },
      plan: {
        title: 'Plan Mode',
        behavior: 'deny',
        description: '暂停执行，等待用户确认'
      },
      acceptEdits: {
        title: 'Accept Edits',
        behavior: 'allow',
        description: '自动接受编辑操作'
      },
      bypass: {
        title: 'Bypass',
        behavior: 'allow',
        description: '绕过所有权限检查'
      },
      dontAsk: {
        title: "Don't Ask",
        behavior: 'deny',
        description: '不询问，直接拒绝'
      },
      auto: {
        title: 'Auto Mode',
        behavior: 'auto',
        description: '自动决策'
      }
    };
    
    // 初始化已有权限管理器
    this.mcpPermissionManager = options.mcpPermissionManager || null;
    this.externalPermissionManager = options.externalPermissionManager || null;
  }
  
  // 设置权限模式
  setMode(newMode) {
    if (!this.modeConfig[newMode]) {
      throw new Error(`Unknown mode: ${newMode}`);
    }
    const oldMode = this.mode;
    this.mode = newMode;
    this.emit('modeChanged', { oldMode, newMode });
    return { oldMode, newMode };
  }
  
  // 获取当前模式配置
  getModeConfig() {
    return this.modeConfig[this.mode];
  }
  
  // 添加规则
  addRule(type, toolName, options = {}) {
    const rulesMap = {
      allow: this.allowRules,
      deny: this.denyRules,
      ask: this.askRules
    };
    
    if (!rulesMap[type]) {
      throw new Error(`Unknown rule type: ${type}`);
    }
    
    const rule = {
      toolName,
      pattern: options.pattern || null,
      source: options.source || 'session',
      createdAt: Date.now()
    };
    
    const key = toolName.toLowerCase();
    const rules = rulesMap[type].get(key) || [];
    rules.push(rule);
    rulesMap[type].set(key, rules);
    
    this.emit('ruleAdded', { type, rule });
  }
  
  // 移除规则
  removeRule(type, toolName) {
    const rulesMap = {
      allow: this.allowRules,
      deny: this.denyRules,
      ask: this.askRules
    };
    
    const key = toolName.toLowerCase();
    rulesMap[type].delete(key);
  }
  
  // 获取规则
  getRules(type) {
    const rulesMap = {
      allow: this.allowRules,
      deny: this.denyRules,
      ask: this.askRules
    };
    
    const rules = [];
    for (const [toolName, ruleList] of rulesMap[type]) {
      rules.push(...ruleList);
    }
    return rules;
  }
  
  // 检查权限
  async checkPermission(toolName, input = {}, context = {}) {
    const normalizedName = toolName.toLowerCase();
    
    // 1. 检查模式行为
    const modeBehavior = this.modeConfig[this.mode]?.behavior;
    
    if (modeBehavior === 'allow') {
      return { 
        result: 'allow', 
        reason: `Mode '${this.mode}' allows all` 
      };
    }
    
    if (modeBehavior === 'deny') {
      return { 
        result: 'deny', 
        reason: `Mode '${this.mode}' denies all` 
      };
    }
    
    // 2. 检查拒绝规则 (优先级最高)
    const denyRule = this._findMatchingRule('deny', normalizedName, input);
    if (denyRule) {
      return { 
        result: 'deny', 
        reason: `Rule matched: ${denyRule.toolName}`,
        rule: denyRule
      };
    }
    
    // 3. 检查允许规则
    const allowRule = this._findMatchingRule('allow', normalizedName, input);
    if (allowRule) {
      this._recordSuccess(normalizedName);
      return { 
        result: 'allow', 
        reason: `Rule matched: ${allowRule.toolName}`,
        rule: allowRule
      };
    }
    
    // 4. 检查询问规则
    const askRule = this._findMatchingRule('ask', normalizedName, input);
    if (askRule) {
      return { 
        result: 'ask', 
        message: `Allow ${toolName}?`,
        reason: `Rule matched: ${askRule.toolName}`,
        rule: askRule
      };
    }
    
    // 5. 检查拒绝追踪 (防止无限询问)
    if (this._shouldFallbackToDenial(normalizedName)) {
      return { 
        result: 'deny', 
        reason: 'Too many denials, falling back to default' 
      };
    }
    
    // 6. 检查 MCP 权限管理器
    if (this.mcpPermissionManager) {
      const mcpResult = this.mcpPermissionManager.checkToolAccess(
        normalizedName,
        context.userRole || 'viewer'
      );
      
      if (!mcpResult.allowed) {
        return { 
          result: 'deny', 
          reason: mcpResult.reason 
        };
      }
    }
    
    // 7. 默认询问
    return { 
      result: 'ask', 
      message: `Allow ${toolName}?`,
      reason: 'Default behavior'
    };
  }
  
  // 查找匹配的规则
  _findMatchingRule(type, toolName, input) {
    const rulesMap = {
      allow: this.allowRules,
      deny: this.denyRules,
      ask: this.askRules
    };
    
    // 精确匹配
    const exactRules = rulesMap[type].get(toolName);
    if (exactRules && exactRules.length > 0) {
      return exactRules[0];
    }
    
    // 通配符匹配
    for (const [, ruleList] of rulesMap[type]) {
      for (const rule of ruleList) {
        if (rule.pattern && this._matchPattern(toolName, rule.pattern)) {
          return rule;
        }
      }
    }
    
    return null;
  }
  
  // 模式匹配
  _matchPattern(toolName, pattern) {
    if (pattern === '*') return true;
    
    const regex = new RegExp(
      pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.'),
      'i'
    );
    
    return regex.test(toolName);
  }
  
  // 记录拒绝
  _recordDenial(toolName) {
    const key = toolName.toLowerCase();
    const current = this.denialTracking.get(key) || { count: 0, lastTime: 0 };
    
    this.denialTracking.set(key, {
      count: current.count + 1,
      lastTime: Date.now()
    });
    
    this.emit('denialRecorded', { toolName, count: current.count + 1 });
  }
  
  // 记录成功
  _recordSuccess(toolName) {
    const key = toolName.toLowerCase();
    this.denialTracking.delete(key);
  }
  
  // 检查是否应该回退到拒绝
  _shouldFallbackToDenial(toolName) {
    const key = toolName.toLowerCase();
    const record = this.denialTracking.get(key);
    
    if (!record) return false;
    
    const limit = this.denialLimits.default;
    return record.count >= limit;
  }
  
  // 用户响应处理
  async handleUserResponse(toolName, allowed) {
    const normalizedName = toolName.toLowerCase();
    
    if (allowed) {
      this._recordSuccess(normalizedName);
      this.emit('permissionGranted', { toolName });
      
      // 自动添加工具到允许列表
      this.addRule('allow', normalizedName, { 
        source: 'user_response' 
      });
      
      return { success: true, action: 'added_to_allowlist' };
    } else {
      this._recordDenial(normalizedName);
      this.emit('permissionDenied', { toolName });
      
      return { success: true, action: 'recorded_denial' };
    }
  }
  
  // 获取拒绝追踪状态
  getDenialStatus(toolName) {
    const key = toolName.toLowerCase();
    return this.denialTracking.get(key) || { count: 0, lastTime: null };
  }
  
  // 获取统计信息
  getStats() {
    return {
      mode: this.mode,
      allowRulesCount: Array.from(this.allowRules.values())
        .reduce((sum, rules) => sum + rules.length, 0),
      denyRulesCount: Array.from(this.denyRules.values())
        .reduce((sum, rules) => sum + rules.length, 0),
      askRulesCount: Array.from(this.askRules.values())
        .reduce((sum, rules) => sum + rules.length, 0),
      denialTrackingCount: this.denialTracking.size,
      denialTracking: Object.fromEntries(this.denialTracking)
    };
  }
  
  // 导出配置
  exportConfig() {
    return {
      mode: this.mode,
      allowRules: Object.fromEntries(this.allowRules),
      denyRules: Object.fromEntries(this.denyRules),
      askRules: Object.fromEntries(this.askRules)
    };
  }
  
  // 导入配置
  importConfig(config) {
    if (config.mode) {
      this.mode = config.mode;
    }
    
    if (config.allowRules) {
      this.allowRules = new Map(Object.entries(config.allowRules));
    }
    
    if (config.denyRules) {
      this.denyRules = new Map(Object.entries(config.denyRules));
    }
    
    if (config.askRules) {
      this.askRules = new Map(Object.entries(config.askRules));
    }
  }
  
  // 重置
  reset() {
    this.mode = 'default';
    this.allowRules.clear();
    this.denyRules.clear();
    this.askRules.clear();
    this.denialTracking.clear();
    this.emit('reset');
  }
}

module.exports = { PermissionService };
