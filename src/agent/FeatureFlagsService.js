/**
 * ShiHao Feature Flags Service
 * 基于 Claude Code 特性开关系统架构
 * 
 * Claude Code 特性:
 * - 使用 bun:bundle 的 Dead Code Elimination
 * - 40+ 特性标志
 * - 条件导入/导出
 * - 动态特性检测
 */

const EventEmitter = require('events');

class FeatureFlagsService extends EventEmitter {
  constructor(options = {}) {
    super();
    
    // 特性注册表
    this.features = new Map();
    
    // 默认特性
    this._registerDefaultFeatures();
    
    // 动态特性 (运行时可能变化)
    this.dynamicFeatures = new Set([
      'DEBUG_MODE',
      'TEST_MODE',
      'DEMO_MODE'
    ]);
    
    // 加载自定义特性
    if (options.features) {
      for (const [name, config] of Object.entries(options.features)) {
        this.register(name, config);
      }
    }
  }
  
  // 注册默认特性
  _registerDefaultFeatures() {
    const defaults = {
      // 核心模式
      TRANSCRIPT_CLASSIFIER: { enabled: false, description: '转录分类器 - 自动权限模式' },
      KAIROS: { enabled: false, description: 'Kairos 模式 - 高级AI功能' },
      KAIROS_BRIEF: { enabled: false, description: 'Kairos 简短模式' },
      VOICE_MODE: { enabled: false, description: '语音模式' },
      COORDINATOR_MODE: { enabled: false, description: '协调模式' },
      CONTEXT_COLLAPSE: { enabled: true, description: '上下文折叠' },
      HISTORY_SNIP: { enabled: true, description: '历史剪裁' },
      PROACTIVE: { enabled: false, description: '主动模式' },
      WORKFLOW_SCRIPTS: { enabled: false, description: '工作流脚本' },
      AGENT_TRIGGERS: { enabled: false, description: 'Agent 触发器' },
      DAEMON: { enabled: false, description: '守护进程模式' },
      
      // 命令相关
      BASH_CLASSIFIER: { enabled: false, description: 'Bash 命令分类器' },
      TEMPLATES: { enabled: false, description: '模板功能' },
      ULTRAPLAN: { enabled: false, description: '超级计划模式' },
      FORK_SUBAGENT: { enabled: false, description: 'Fork 子代理' },
      UDS_INBOX: { enabled: false, description: 'UDS 收件箱' },
      BRIDGE_MODE: { enabled: false, description: '桥接模式' },
      
      // 权限相关
      POWERSHELL_AUTO_MODE: { enabled: false, description: 'PowerShell 自动模式' },
      
      // 遥测相关
      ENHANCED_TELEMETRY_BETA: { enabled: false, description: '增强遥测 Beta' },
      PERFETTO_TRACING: { enabled: false, description: 'Perfetto 追踪' },
      SHOT_STATS: { enabled: false, description: '射击统计' },
      
      // 其他
      TEAMMEM: { enabled: false, description: '团队记忆' },
      LODESTONE: { enabled: false, description: '石阶功能' },
      COMMIT_ATTRIBUTION: { enabled: false, description: '提交归属' },
      ULTRATHINK: { enabled: false, description: '超级思考' },
      
      // 运行时特性
      DEBUG_MODE: { enabled: process.env.DEBUG === 'true', description: '调试模式' },
      TEST_MODE: { enabled: process.env.TEST === 'true', description: '测试模式' },
      DEMO_MODE: { enabled: process.env.DEMO === 'true', description: '演示模式' }
    };
    
    for (const [name, config] of Object.entries(defaults)) {
      this.register(name, config);
    }
  }
  
  // 注册特性
  register(name, config) {
    const feature = {
      name,
      enabled: config.enabled ?? false,
      description: config.description || '',
      metadata: config.metadata || {},
      registeredAt: Date.now()
    };
    
    this.features.set(name, feature);
    this.emit('featureRegistered', { name, feature });
    
    return feature;
  }
  
  // 批量注册
  registerMany(features) {
    const results = [];
    for (const [name, config] of Object.entries(features)) {
      results.push(this.register(name, config));
    }
    return results;
  }
  
  // 启用特性
  enable(name) {
    const feature = this.features.get(name);
    if (!feature) {
      this.register(name, { enabled: true });
      return true;
    }
    
    if (!feature.enabled) {
      feature.enabled = true;
      this.emit('featureEnabled', { name });
    }
    
    return true;
  }
  
  // 禁用特性
  disable(name) {
    const feature = this.features.get(name);
    if (!feature) return false;
    
    if (feature.enabled) {
      feature.enabled = false;
      this.emit('featureDisabled', { name });
    }
    
    return true;
  }
  
  // 切换特性
  toggle(name) {
    const feature = this.features.get(name);
    if (!feature) return false;
    
    if (feature.enabled) {
      this.disable(name);
    } else {
      this.enable(name);
    }
    
    return feature.enabled;
  }
  
  // 检查特性是否启用
  isEnabled(name) {
    const feature = this.features.get(name);
    return feature?.enabled ?? false;
  }
  
  // 检查 (类似 Claude Code 的 feature 函数)
  check(name) {
    return this.isEnabled(name);
  }
  
  // 获取特性
  get(name) {
    return this.features.get(name);
  }
  
  // 获取所有特性
  getAll() {
    return Array.from(this.features.values());
  }
  
  // 获取启用的特性
  getEnabled() {
    return this.getAll().filter(f => f.enabled);
  }
  
  // 获取所有特性名称
  getFeatureNames() {
    return Array.from(this.features.keys());
  }
  
  // 条件执行
  ifEnabled(name, callback) {
    if (this.isEnabled(name)) {
      return callback();
    }
    return undefined;
  }
  
  // 条件模块 (类似 Claude Code 的 require 模式)
  ifEnabledThen(name, enabledModule, disabledModule = null) {
    if (this.isEnabled(name)) {
      return enabledModule;
    }
    return disabledModule;
  }
  
  // 获取特性统计
  getStats() {
    const all = this.getAll();
    const enabled = this.getEnabled();
    
    return {
      total: all.length,
      enabled: enabled.length,
      disabled: all.length - enabled.length,
      percentage: Math.round((enabled.length / all.length) * 100),
      byCategory: this._groupByCategory(enabled)
    };
  }
  
  // 按类别分组
  _groupByCategory(features) {
    const categories = {
      core: [],
      command: [],
      permission: [],
      telemetry: [],
      runtime: [],
      other: []
    };
    
    const categoryPatterns = {
      core: ['CLASSIFIER', 'KAIROS', 'VOICE', 'COORDINATOR', 'CONTEXT', 'PROACTIVE', 'WORKFLOW', 'DAEMON'],
      command: ['BASH', 'TEMPLATE', 'ULTRAPLAN', 'FORK', 'UDS', 'BRIDGE'],
      permission: ['PERMISSION', 'POWERSHELL'],
      telemetry: ['TELEMETRY', 'PERFETTO', 'STATS'],
      runtime: ['DEBUG', 'TEST', 'DEMO']
    };
    
    for (const feature of features) {
      let assigned = false;
      
      for (const [category, patterns] of Object.entries(categoryPatterns)) {
        if (patterns.some(p => feature.name.includes(p))) {
          categories[category].push(feature.name);
          assigned = true;
          break;
        }
      }
      
      if (!assigned) {
        categories.other.push(feature.name);
      }
    }
    
    return categories;
  }
  
  // 导出配置
  export() {
    const features = {};
    for (const [name, feature] of this.features) {
      features[name] = {
        enabled: feature.enabled,
        description: feature.description
      };
    }
    
    return {
      features,
      exportedAt: Date.now()
    };
  }
  
  // 导入配置
  import(config) {
    if (config.features) {
      for (const [name, featureConfig] of Object.entries(config.features)) {
        if (featureConfig.enabled !== undefined) {
          if (featureConfig.enabled) {
            this.enable(name);
          } else {
            this.disable(name);
          }
        }
      }
    }
  }
  
  // 重置
  reset() {
    this.features.clear();
    this._registerDefaultFeatures();
    this.emit('reset');
  }
}

// 装饰器: 特性检查
function featureFlag(name) {
  return function (target, propertyKey, descriptor) {
    const original = descriptor.value;
    
    descriptor.value = function (...args) {
      const flags = this.features || global.features;
      if (flags && !flags.isEnabled(name)) {
        return;
      }
      return original.apply(this, args);
    };
    
    return descriptor;
  };
}

// 中间件: 特性检查
function featureMiddleware(featureName, options = {}) {
  return async (req, res, next) => {
    const flags = req.app?.features || global.features;
    
    if (!flags || !flags.isEnabled(featureName)) {
      if (options.redirect) {
        return res.redirect(options.redirect);
      }
      return res.status(404).json({ 
        error: 'Feature not available',
        feature: featureName
      });
    }
    
    next();
  };
}

module.exports = { 
  FeatureFlagsService, 
  featureFlag, 
  featureMiddleware 
};
