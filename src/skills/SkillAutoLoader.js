/**
 * Skill AutoLoader
 * 自动技能加载器 - 读取配置并在任务启动时自动调用技能
 */

const fs = require('fs');
const path = require('path');

class SkillAutoLoader {
  constructor(options = {}) {
    this.configPath = options.configPath || path.join(process.cwd(), '.opencode', 'skill-auto-load.json');
    this.config = null;
    this.enabledSkills = new Map();
    this.loadedSkills = new Set();
    
    this._loadConfig();
  }

  /**
   * 加载配置文件
   */
  _loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(content);
        console.log('[SkillAutoLoader] Configuration loaded:', this.configPath);
      } else {
        console.warn('[SkillAutoLoader] Config file not found, using defaults');
        this.config = this._getDefaultConfig();
      }
    } catch (error) {
      console.error('[SkillAutoLoader] Failed to load config:', error.message);
      this.config = this._getDefaultConfig();
    }
  }

  /**
   * 默认配置
   */
  _getDefaultConfig() {
    return {
      skillAutoLoad: {
        enabled: true,
        loadOnStartup: ['using-superpowers'],
        priority: {
          'using-superpowers': 1,
          'brainstorming': 2,
          'systematic-debugging': 3
        }
      },
      rules: {
        requireSkillBeforeAction: true,
        autoDiscovery: true,
        fallbackSkill: 'using-superpowers'
      },
      behavior: {
        description: 'Auto-load core skills on task start',
        skills: {
          'using-superpowers': {
            description: 'Use when starting any conversation - establishes how to find and use skills',
            trigger: 'always',
            priority: 1
          },
          'brainstorming': {
            description: 'Use when creating features, building components, adding functionality, or modifying behavior',
            trigger: 'creative_work',
            priority: 2
          },
          'systematic-debugging': {
            description: 'Use when encountering any bug, test failure, or unexpected behavior',
            trigger: 'bug_fixing',
            priority: 3
          }
        }
      }
    };
  }

  /**
   * 检查是否启用自动加载
   */
  isEnabled() {
    return this.config?.skillAutoLoad?.enabled !== false;
  }

  /**
   * 获取启动时需要加载的技能
   */
  getStartupSkills() {
    return this.config?.skillAutoLoad?.loadOnStartup || ['using-superpowers'];
  }

  /**
   * 获取所有配置的技能
   */
  getConfiguredSkills() {
    return this.config?.behavior?.skills || {};
  }

  /**
   * 根据任务类型获取应该加载的技能
   * @param {string} taskType - 任务类型 (creative_work, bug_fixing, etc.)
   * @returns {string[]} 需要加载的技能列表
   */
  getSkillsForTaskType(taskType) {
    const configuredSkills = this.getConfiguredSkills();
    const matchedSkills = [];

    for (const [skillName, skillConfig] of Object.entries(configuredSkills)) {
      if (skillConfig.trigger === 'always' || skillConfig.trigger === taskType) {
        matchedSkills.push({
          name: skillName,
          priority: skillConfig.priority || 999,
          description: skillConfig.description
        });
      }
    }

    // 按优先级排序
    matchedSkills.sort((a, b) => a.priority - b.priority);
    return matchedSkills;
  }

  /**
   * 分析消息并识别任务类型
   * @param {string} message - 用户消息
   * @returns {string} 识别出的任务类型
   */
  classifyTask(message) {
    const lowerMessage = message.toLowerCase();
    
    // Bug 修复相关关键词
    const bugKeywords = ['bug', 'error', 'fix', '修复', '错误', '失败', 'crash', '崩溃', 'exception', '异常', '问题', 'issue'];
    // 创意工作相关关键词
    const creativeKeywords = ['create', 'build', 'add', 'implement', 'new feature', '新建', '创建', '开发', '实现', '添加', '功能'];
    // 计划相关关键词
    const planKeywords = ['plan', '规划', '计划', 'design', '设计', 'architecture', '架构'];
    // 测试相关关键词
    const testKeywords = ['test', '测试', '验证', 'verify', 'check'];
    // 重构相关关键词
    const refactorKeywords = ['refactor', '重构', '优化', 'optimize', 'improve', '改进'];

    // 检查关键词匹配
    if (bugKeywords.some(kw => lowerMessage.includes(kw))) {
      return 'bug_fixing';
    }
    if (creativeKeywords.some(kw => lowerMessage.includes(kw))) {
      return 'creative_work';
    }
    if (planKeywords.some(kw => lowerMessage.includes(kw))) {
      return 'planning';
    }
    if (testKeywords.some(kw => lowerMessage.includes(kw))) {
      return 'testing';
    }
    if (refactorKeywords.some(kw => lowerMessage.includes(kw))) {
      return 'refactoring';
    }

    // 默认返回 general
    return 'general';
  }

  /**
   * 获取消息应该触发的技能
   * @param {string} message - 用户消息
   * @returns {Object} { taskType, skills }
   */
  getSkillsForMessage(message) {
    const taskType = this.classifyTask(message);
    const skills = this.getSkillsForTaskType(taskType);
    
    return {
      taskType,
      skills: skills.map(s => s.name),
      shouldLoad: skills.length > 0
    };
  }

  /**
   * 获取规则配置
   */
  getRules() {
    return this.config?.rules || {
      requireSkillBeforeAction: true,
      autoDiscovery: true,
      fallbackSkill: 'using-superpowers'
    };
  }

  /**
   * 重新加载配置
   */
  reload() {
    this._loadConfig();
    console.log('[SkillAutoLoader] Configuration reloaded');
  }

  /**
   * 获取配置详情
   */
  getConfig() {
    return this.config;
  }
}

module.exports = { SkillAutoLoader };