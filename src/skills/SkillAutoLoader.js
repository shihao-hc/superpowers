/**
 * Skill AutoLoader
 * 自动技能加载器 - 读取配置并在任务启动时自动调用技能
 * 集成 RLSkillRecommender 提供智能推荐
 */

const fs = require('fs');
const path = require('path');
const { RLSkillRecommender } = require('./recommendation/RLSkillRecommender');
const { SkillSecurityValidator } = require('./security/SkillSecurityValidator');

class SkillAutoLoader {
  constructor(options = {}) {
    this.configPath = options.configPath || path.join(process.cwd(), '.opencode', 'skill-auto-load.json');
    this.config = null;
    this.enabledSkills = new Map();
    this.loadedSkills = new Set();

    this.rlRecommender = options.rlRecommender || new RLSkillRecommender();
    this.securityValidator = options.securityValidator || new SkillSecurityValidator();
    this.metrics = {
      loadCount: 0,
      loadSuccess: 0,
      loadFailure: 0,
      byTaskType: {},
      bySkill: {}
    };

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
    if (bugKeywords.some((kw) => lowerMessage.includes(kw))) {
      return 'bug_fixing';
    }
    if (creativeKeywords.some((kw) => lowerMessage.includes(kw))) {
      return 'creative_work';
    }
    if (planKeywords.some((kw) => lowerMessage.includes(kw))) {
      return 'planning';
    }
    if (testKeywords.some((kw) => lowerMessage.includes(kw))) {
      return 'testing';
    }
    if (refactorKeywords.some((kw) => lowerMessage.includes(kw))) {
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
      skills: skills.map((s) => s.name),
      shouldLoad: skills.length > 0
    };
  }

  /**
   * 使用 RL 推荐器获取智能技能推荐
   * @param {string} context - 上下文信息
   * @param {string} userId - 用户ID
   * @param {Array} availableSkills - 可用技能列表
   * @param {Array} conversationHistory - 对话历史
   * @returns {Array} 推荐的技能
   */
  getRLRecommendations(context, userId, availableSkills, conversationHistory = []) {
    return this.rlRecommender.recommendSkills(
      context,
      userId,
      availableSkills,
      conversationHistory,
      3
    );
  }

  /**
   * 记录技能交互以供 RL 学习
   * @param {string} userId - 用户ID
   * @param {string} skillName - 技能名称
   * @param {string} context - 上下文
   * @param {boolean} success - 是否成功
   * @param {number} rating - 评分 (1-5)
   * @param {string} feedback - 反馈
   */
  recordInteraction(userId, skillName, context, success, rating = 0, feedback = null) {
    const result = this.rlRecommender.recordInteraction(
      userId,
      skillName,
      context,
      success,
      rating,
      feedback
    );

    this._updateMetrics(skillName, context, success);
    return result;
  }

  /**
   * 更新指标
   */
  _updateMetrics(skillName, taskType, success) {
    this.metrics.loadCount++;
    if (success) {
      this.metrics.loadSuccess++;
    } else {
      this.metrics.loadFailure++;
    }

    if (!this.metrics.byTaskType[taskType]) {
      this.metrics.byTaskType[taskType] = { total: 0, success: 0 };
    }
    this.metrics.byTaskType[taskType].total++;
    if (success) {
      this.metrics.byTaskType[taskType].success++;
    }

    if (!this.metrics.bySkill[skillName]) {
      this.metrics.bySkill[skillName] = { total: 0, success: 0 };
    }
    this.metrics.bySkill[skillName].total++;
    if (success) {
      this.metrics.bySkill[skillName].success++;
    }
  }

  /**
   * 获取指标统计
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.loadCount > 0
        ? `${(this.metrics.loadSuccess / this.metrics.loadCount * 100).toFixed(2)}%`
        : '0%',
      rlStats: this.rlRecommender.getStats()
    };
  }

  /**
   * 导出 RL 模型
   */
  exportRLModel() {
    return this.rlRecommender.exportModel();
  }

  /**
   * 导入 RL 模型
   */
  importRLModel(data) {
    this.rlRecommender.importModel(data);
  }

  /**
   * 验证技能安全性
   */
  validateSkill(skillPath) {
    return this.securityValidator.validateSkill(skillPath);
  }

  /**
   * 获取主动建议
   */
  getProactiveSuggestion(context, userId, conversationHistory = []) {
    return this.rlRecommender.getProactiveSuggestion(
      context,
      userId,
      conversationHistory
    );
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