/**
 * SelfLearningSystem - 自主学习与改进系统
 *
 * 让系统具备持续自我进化的能力
 * - 观察：记录行为和结果
 * - 分析：识别模式和问题
 * - 学习：调整策略
 * - 应用：改进未来表现
 *
 * AI大脑集成：
 * - BrainSystem 驱动学习过程
 * - 元认知增强决策质量
 * - 自我进化持续改进
 *
 * @version 1.0.0
 * @license MIT
 * @copyright 2026 AI Brain System
 */

const fs = require('fs');
const path = require('path');
const { BrainSystem } = require('./BrainSystem');

class SelfLearningSystem {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.learningRate = options.learningRate || 0.1;
    this.minSamples = options.minSamples || 5;
    this.adjustmentThreshold = options.adjustmentThreshold || 3;

    // 安全配置
    this.limits = {
      maxIntentKeyLength: 200,
      maxFeedbackContentLength: 1000,
      maxMessageLength: 500,
      maxResponseLength: 500,
      maxMapSize: 1000,
      maxResponses: 100,
      maxFeedback: 50
    };

    // 学习数据存储
    this.data = {
      intents: new Map(),
      suggestions: new Map(),
      hooks: new Map(),
      skills: new Map(),
      responses: [],
      feedback: [],
      patterns: new Map(),
      adjustments: {
        suggestionFrequency: 0,
        suggestionTypes: {},
        responseStyle: 'normal'
      }
    };

    // 递归锁
    this._isSaving = false;

    // AI大脑
    this.brain = new BrainSystem(this);

    // 自我调整策略
    this.strategies = {
      intentConfidence: {
        boost: 0.1,
        decay: 0.05
      },
      suggestionPriority: {
        base: 0.5,
        采纳: 0.2, adopted: 0.2,
        忽略: -0.1, ignored: -0.1,
        拒绝: -0.2, rejected: -0.2
      },
      skillRecommendation: {
        loadThreshold: 0.6,
        boostOnSuccess: 0.1,
        decayOnFailure: 0.15
      },
      behaviorAdjustment: {
        negativeThreshold: -2,
        positiveThreshold: 3,
        maxSuggestionCount: 5,
        minSuggestionCount: 1
      }
    };

    // 加载已有学习数据
    this._loadFromStorage();

    console.log('[SelfLearning] Initialized, enabled:', this.enabled);
  }

  /**
   * 安全验证输入
   */
  _validateInput(value, type, maxLength) {
    if (value === null || value === undefined) {return '';}
    if (typeof value !== 'string') {return String(value);}
    if (value.length > maxLength) {return value.substring(0, maxLength);}
    return value;
  }

  /**
   * 安全验证 Map key
   */
  _validateMapKey(key) {
    if (typeof key !== 'string') {key = String(key);}
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return `_blocked_${key}`;
    }
    return key;
  }

  /**
   * 记录意图识别结果
   */
  recordIntent(intent, actualCategory, success) {
    if (!this.enabled) {return;}

    // 安全验证输入
    const safeKey = this._validateMapKey(
      this._validateInput(intent, 'intent', this.limits.maxIntentKeyLength)
    );
    const safeCategory = this._validateInput(actualCategory, 'category', 100);

    // 限制 Map 大小
    if (this.data.intents.size >= this.limits.maxMapSize && !this.data.intents.has(safeKey)) {
      console.warn('[SelfLearning] Intents map full, oldest entry removed');
      const firstKey = this.data.intents.keys().next().value;
      this.data.intents.delete(firstKey);
    }

    let record = this.data.intents.get(safeKey);

    if (!record) {
      record = {
        count: 0,
        successCount: 0,
        variants: new Set()
      };
    } else if (!(record.variants instanceof Set)) {
      record.variants = new Set(record.variants || []);
    }

    record.count++;
    record.variants.add(safeCategory);
    if (success) {
      record.successCount++;
    }

    const storedRecord = {
      ...record,
      variants: Array.from(record.variants)
    };
    this.data.intents.set(safeKey, storedRecord);
    this._saveToStorage();

    // 每 10 次记录触发一次自进化
    if (this.data.intents.size % 10 === 0) {
      this._autoAdjust();
    }

    console.log(`[SelfLearning] Intent recorded: "${intent}" -> ${actualCategory} (${success ? '✓' : '✗'})`);
  }

  /**
   * 记录建议采纳情况
   */
  recordSuggestion(suggestion, action) {
    if (!this.enabled) {return;}

    // 安全验证输入
    const type = this._validateInput(suggestion.type, 'type', 50);
    const name = this._validateInput(suggestion.name, 'name', 100);
    const key = this._validateMapKey(`${type}:${name}`);

    // 限制 Map 大小
    if (this.data.suggestions.size >= this.limits.maxMapSize && !this.data.suggestions.has(key)) {
      const firstKey = this.data.suggestions.keys().next().value;
      this.data.suggestions.delete(firstKey);
    }

    const record = this.data.suggestions.get(key) || {
      shown: 0,
      adopted: 0,
      ignored: 0,
      rejected: 0
    };

    record.shown++;
    switch (action) {
    case 'adopted':
      record.adopted++;
      break;
    case 'ignored':
      record.ignored++;
      break;
    case 'rejected':
      record.rejected++;
      break;
    }

    this.data.suggestions.set(key, record);
    this._calculateSuggestionPriority(key, action);
    this._saveToStorage();

    console.log(`[SelfLearning] Suggestion recorded: ${name} (${action})`);
  }

  /**
   * 记录技能加载效果
   */
  recordSkillLoad(skillName, context, helpful) {
    if (!this.enabled) {return;}

    // 安全验证输入
    const safeSkillName = this._validateMapKey(
      this._validateInput(skillName, 'skillName', 100)
    );
    const safeContext = this._validateInput(context, 'context', 100);
    const safeHelpful = typeof helpful === 'boolean' ? helpful : false;

    // 限制 Map 大小
    if (this.data.skills.size >= this.limits.maxMapSize && !this.data.skills.has(safeSkillName)) {
      const firstKey = this.data.skills.keys().next().value;
      this.data.skills.delete(firstKey);
    }

    let record = this.data.skills.get(safeSkillName);

    if (!record) {
      record = {
        loaded: 0,
        helpfulCount: 0,
        contexts: new Set()
      };
    } else if (!(record.contexts instanceof Set)) {
      record.contexts = new Set(record.contexts || []);
    }

    record.loaded++;
    record.contexts.add(safeContext);
    if (safeHelpful) {
      record.helpfulCount++;
    }

    const storedRecord = {
      ...record,
      contexts: Array.from(record.contexts)
    };
    this.data.skills.set(safeSkillName, storedRecord);
    this._saveToStorage();

    console.log(`[SelfLearning] Skill recorded: ${skillName} (${safeContext}) - ${safeHelpful ? 'helpful' : 'not helpful'})`);
  }

  /**
   * 记录响应质量
   */
  recordResponse(message, response, quality) {
    if (!this.enabled) {return;}

    const safeMessage = this._validateInput(message, 'message', this.limits.maxMessageLength);
    const safeResponse = this._validateInput(response, 'response', this.limits.maxResponseLength);
    const safeQuality = typeof quality === 'number' ? Math.max(0, Math.min(1, quality)) : 0.5;

    this.data.responses.push({
      timestamp: Date.now(),
      message: safeMessage,
      response: safeResponse,
      quality: safeQuality
    });

    if (this.data.responses.length > this.limits.maxResponses) {
      this.data.responses = this.data.responses.slice(-this.limits.maxResponses);
    }

    this._saveToStorage();
  }

  /**
   * 记录用户反馈
   */
  recordFeedback(feedback) {
    if (!this.enabled) {return;}

    const content = this._validateInput(
      feedback.content,
      'content',
      this.limits.maxFeedbackContentLength
    );
    const type = this._validateInput(
      feedback.type,
      'type',
      50
    );

    const sentiment = feedback.sentiment || this._analyzeSentiment(content);

    this.data.feedback.push({
      timestamp: Date.now(),
      type: type,
      content: content,
      sentiment: sentiment
    });

    // 限制反馈数量
    if (this.data.feedback.length > this.limits.maxFeedback) {
      this.data.feedback = this.data.feedback.slice(-this.limits.maxFeedback);
    }

    this._analyzeFeedback();
    this._applyBehaviorAdjustment(sentiment);
    this._saveToStorage();

    console.log(`[SelfLearning] Feedback recorded: ${type} - ${sentiment}`);
  }

  /**
   * 根据反馈应用行为调整
   */
  _applyBehaviorAdjustment(_sentiment) {
    // 统计近期反馈情绪
    const recentFeedback = this.data.feedback.slice(-10);
    let negativeCount = 0;
    let positiveCount = 0;

    for (const fb of recentFeedback) {
      if (fb.sentiment === 'negative') {negativeCount++;}
      if (fb.sentiment === 'positive') {positiveCount++;}
    }

    const netScore = positiveCount - negativeCount;
    const { behaviorAdjustment } = this.strategies;

    // 建议频率调整
    if (netScore <= behaviorAdjustment.negativeThreshold) {
      // 负面反馈过多，减少建议
      this.data.adjustments.suggestionFrequency = Math.max(
        this.data.adjustments.suggestionFrequency - 1,
        -2
      );
      console.log(`[SelfLearning] 📉 减少建议频率 (score: ${netScore})`);
    } else if (netScore >= behaviorAdjustment.positiveThreshold) {
      // 正面反馈多，增加建议
      this.data.adjustments.suggestionFrequency = Math.min(
        this.data.adjustments.suggestionFrequency + 0.5,
        2
      );
      console.log(`[SelfLearning] 📈 增加建议频率 (score: ${netScore})`);
    }

    // 响应风格调整
    const negativeKeywords = ['太短', '不够', '详细', '详细点', 'more', '详细'];
    const positiveKeywords = ['太长', '太多', '简洁', '简短', 'less', '简洁点'];

    for (const fb of recentFeedback.slice(-3)) {
      const content = fb.content.toLowerCase();
      if (negativeKeywords.some((k) => content.includes(k))) {
        this.data.adjustments.responseStyle = 'detailed';
        console.log('[SelfLearning] 📝 调整为详细响应风格');
        break;
      }
      if (positiveKeywords.some((k) => content.includes(k))) {
        this.data.adjustments.responseStyle = 'brief';
        console.log('[SelfLearning] ✂️ 调整为简洁响应风格');
        break;
      }
    }
  }

  /**
   * 获取调整后的行为参数
   */
  getAdjustedParameters() {
    const { behaviorAdjustment } = this.strategies;
    const baseSuggestionCount = 3;
    const freqAdjust = this.data.adjustments.suggestionFrequency;

    // 根据频率调整计算建议数量
    let suggestionCount = Math.round(baseSuggestionCount + freqAdjust);
    suggestionCount = Math.max(
      behaviorAdjustment.minSuggestionCount,
      Math.min(behaviorAdjustment.maxSuggestionCount, suggestionCount)
    );

    // 获取各类型建议的权重
    const typeWeights = {};
    for (const [key, record] of this.data.suggestions) {
      const [type, _name] = key.split(':');
      if (!typeWeights[type]) {
        typeWeights[type] = { total: 0, adopted: 0 };
      }
      typeWeights[type].total += record.shown;
      typeWeights[type].adopted += record.adopted;
    }

    // 计算各类型的采纳率作为权重
    const adjustedTypeWeights = {};
    for (const [type, data] of Object.entries(typeWeights)) {
      if (data.total >= 2) {
        adjustedTypeWeights[type] = data.adopted / data.total;
      }
    }

    return {
      suggestionCount,                                    // 调整后的建议数量
      typeWeights: adjustedTypeWeights,                  // 类型采纳权重
      responseStyle: this.data.adjustments.responseStyle, // 响应风格
      isEncouraged: this.data.adjustments.suggestionFrequency > 0, // 是否鼓励展示建议
      adjustmentReason: this._getAdjustmentReason()
    };
  }

  /**
   * 获取调整原因说明
   */
  _getAdjustmentReason() {
    const reasons = [];
    const freq = this.data.adjustments.suggestionFrequency;
    const style = this.data.adjustments.responseStyle;

    if (freq < 0) {
      reasons.push('建议数量减少 (近期反馈偏负面)');
    } else if (freq > 0) {
      reasons.push('建议数量增加 (近期反馈偏正面)');
    }

    if (style === 'brief') {
      reasons.push('响应风格: 简洁');
    } else if (style === 'detailed') {
      reasons.push('响应风格: 详细');
    }

    return reasons.length > 0 ? reasons.join(', ') : '使用默认参数';
  }

  /**
   * 自进化闭环: 根据历史数据自动调整参数
   */
  _autoAdjust() {
    if (!this.enabled) {return;}
    const adjustments = [];
    const self = this;

    // 1. 调整意图识别置信度
    let intentBoost = 0;
    this.data.intents.forEach(function(record, _intent) {
      if (record.count >= self.minSamples) {
        const accuracy = record.successCount / record.count;
        if (accuracy > 0.8) {
          intentBoost += accuracy * 0.05;
        }
      }
    });
    if (intentBoost > 0) {
      const capped = Math.min((self.data.adjustments.intentConfidenceBoost || 0) + intentBoost, 0.5);
      self.data.adjustments.intentConfidenceBoost = capped;
      adjustments.push(`intent_confidence_boost: +${capped.toFixed(2)}`);
    }

    // 2. 调整技能推荐阈值
    let totalSkillLoads = 0;
    let totalHelpful = 0;
    this.data.skills.forEach(function(record) {
      totalSkillLoads += record.loaded;
      totalHelpful += record.helpfulCount;
    });
    if (totalSkillLoads >= self.minSamples) {
      const successRate = totalHelpful / totalSkillLoads;
      if (successRate > 0.8 && self.strategies.skillRecommendation.loadThreshold < 0.8) {
        self.strategies.skillRecommendation.loadThreshold = Math.min(self.strategies.skillRecommendation.loadThreshold + 0.05, 0.8);
        adjustments.push(`skill_threshold: ${self.strategies.skillRecommendation.loadThreshold.toFixed(2)}`);
      } else if (successRate < 0.3 && self.strategies.skillRecommendation.loadThreshold > 0.3) {
        self.strategies.skillRecommendation.loadThreshold = Math.max(self.strategies.skillRecommendation.loadThreshold - 0.05, 0.3);
        adjustments.push(`skill_threshold_down: ${self.strategies.skillRecommendation.loadThreshold.toFixed(2)}`);
      }
    }

    // 3. 调整建议数量
    const recentResponses = this.data.responses.slice(-20);
    if (recentResponses.length >= 5) {
      const avgQuality = recentResponses.reduce(function(sum, r) { return sum + r.quality; }, 0) / recentResponses.length;
      if (avgQuality < 0.5 && self.data.adjustments.suggestionFrequency > -1) {
        self.data.adjustments.suggestionFrequency -= 0.5;
        adjustments.push(`suggestion_freq_down: ${self.data.adjustments.suggestionFrequency.toFixed(1)}`);
      } else if (avgQuality > 0.9 && self.data.adjustments.suggestionFrequency < 1) {
        self.data.adjustments.suggestionFrequency += 0.3;
        adjustments.push(`suggestion_freq_up: ${self.data.adjustments.suggestionFrequency.toFixed(1)}`);
      }
    }

    // 保存调整
    if (adjustments.length > 0) {
      this._saveToStorage();
      console.log(`[SelfLearning] \u81ea\u8fdb\u5316\u8c03\u6574: ${adjustments.join(', ')}`);
    }
    return adjustments;
  }

  /**
   * 获取改进建议
   */
  getImprovements() {
    const improvements = [];

    // 分析意图识别
    const lowAccuracyIntents = [];
    for (const [intent, record] of this.data.intents) {
      const accuracy = record.successCount / record.count;
      if (accuracy < 0.5 && record.count >= this.minSamples) {
        lowAccuracyIntents.push({ intent, accuracy, count: record.count });
      }
    }
    if (lowAccuracyIntents.length > 0) {
      improvements.push({
        type: 'intent',
        priority: 'high',
        message: `以下意图识别准确率较低: ${lowAccuracyIntents.map((i) => `"${i.intent}"`).join(', ')}`,
        data: lowAccuracyIntents
      });
    }

    // 分析建议采纳率
    const lowAdoptionSuggestions = [];
    for (const [key, record] of this.data.suggestions) {
      const adoptionRate = record.adopted / record.shown;
      if (adoptionRate < 0.2 && record.shown >= 3) {
        lowAdoptionSuggestions.push({ key, adoptionRate, count: record.shown });
      }
    }
    if (lowAdoptionSuggestions.length > 0) {
      improvements.push({
        type: 'suggestion',
        priority: 'medium',
        message: `以下建议采纳率较低: ${lowAdoptionSuggestions.map((s) => s.key).join(', ')}`,
        data: lowAdoptionSuggestions
      });
    }

    // 分析响应质量
    const recentResponses = this.data.responses.slice(-20);
    if (recentResponses.length >= 10) {
      const avgQuality = recentResponses.reduce((sum, r) => sum + r.quality, 0) / recentResponses.length;
      if (avgQuality < 0.6) {
        improvements.push({
          type: 'response',
          priority: 'high',
          message: `近期响应质量偏低 (${Math.round(avgQuality * 100)}%)`,
          data: { avgQuality }
        });
      }
    }

    return improvements;
  }

  /**
   * 获取学习统计
   */
  getStats() {
    return {
      intents: {
        total: this.data.intents.size,
        samples: Array.from(this.data.intents.values()).reduce((sum, r) => sum + r.count, 0)
      },
      suggestions: {
        total: this.data.suggestions.size,
        samples: Array.from(this.data.suggestions.values()).reduce((sum, r) => sum + r.shown, 0)
      },
      skills: {
        total: this.data.skills.size,
        samples: Array.from(this.data.skills.values()).reduce((sum, r) => sum + r.loaded, 0)
      },
      responses: this.data.responses.length,
      feedback: this.data.feedback.length,
      improvements: this.getImprovements().length,
      adjustments: this.data.adjustments
    };
  }

  /**
   * 获取上下文感知的推荐
   */
  getContextualRecommendations(context) {
    const recommendations = [];
    const lowerContext = context.toLowerCase();

    // 基于历史推荐的技能
    for (const [skill, record] of this.data.skills) {
      const successRate = record.helpfulCount / record.loaded;
      const contexts = record.contexts instanceof Set ? record.contexts : new Set(record.contexts || []);
      if (successRate > 0.6 && contexts.has(context)) {
        recommendations.push({
          type: 'skill',
          name: skill,
          reason: `历史使用效果好 (${Math.round(successRate * 100)}%)`,
          priority: successRate
        });
      }
    }

    // 基于模式推荐
    for (const [pattern, data] of this.data.patterns) {
      if (lowerContext.includes(pattern) && data.successRate > 0.5) {
        recommendations.push({
          type: 'pattern',
          content: data.recommended,
          reason: `基于历史模式 "${pattern}"`,
          priority: data.successRate
        });
      }
    }

    return recommendations.sort((a, b) => b.priority - a.priority);
  }

  // ========== 私有方法 ==========

  _calculateSuggestionPriority(key, action) {
    const delta = this.strategies.suggestionPriority[action] || 0;
    const record = this.data.suggestions.get(key);
    if (record) {
      record.priority = (record.priority || 0.5) + delta * this.learningRate;
    }
  }

  _analyzeSentiment(content) {
    const positive = ['好', '棒', '赞', '不错', '有用', '✓', 'thx', 'thanks', 'good', 'great'];
    const negative = ['差', '烂', '错', '没用', '不好', '✗', 'bad', 'wrong', 'no'];

    const lower = content.toLowerCase();
    const posCount = positive.filter((w) => lower.includes(w)).length;
    const negCount = negative.filter((w) => lower.includes(w)).length;

    if (posCount > negCount) {return 'positive';}
    if (negCount > posCount) {return 'negative';}
    return 'neutral';
  }

  _analyzeFeedback() {
    const recentFeedback = this.data.feedback.slice(-10);
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };

    for (const fb of recentFeedback) {
      sentimentCounts[fb.sentiment]++;
    }

    // 检测趋势
    if (sentimentCounts.negative > 3) {
      console.log('[SelfLearning] ⚠️ 近期负面反馈较多，建议检查系统表现');
    }
  }

  _identifyPatterns() {
    // 从高频成功的交互中识别模式
    for (const response of this.data.responses) {
      if (response.quality > 0.8) {
        const words = response.message.split(/\s+/).filter((w) => w.length > 3);
        for (const word of words.slice(0, 3)) {
          // 限制 Map 大小
          if (this.data.patterns.size >= this.limits.maxMapSize && !this.data.patterns.has(word)) {
            const firstKey = this.data.patterns.keys().next().value;
            this.data.patterns.delete(firstKey);
          }

          const safeWord = this._validateMapKey(word);
          const pattern = this.data.patterns.get(safeWord) || { count: 0, qualitySum: 0 };
          pattern.count++;
          pattern.qualitySum += response.quality;
          pattern.successRate = pattern.qualitySum / pattern.count;
          pattern.recommended = this._validateInput(response.response, 'response', 100);
          this.data.patterns.set(safeWord, pattern);
        }
      }
    }
  }

  _loadFromStorage() {
    try {
      const storagePath = path.join(process.cwd(), '.opencode', 'self-learning.json');

      if (fs.existsSync(storagePath)) {
        const rawData = JSON.parse(fs.readFileSync(storagePath, 'utf8'));

        // 安全加载 - 只加载白名单属性
        const allowedFields = ['intents', 'suggestions', 'skills', 'patterns', 'responses', 'feedback', 'adjustments'];
        const data = {};

        for (const field of allowedFields) {
          if (rawData[field] !== undefined) {
            data[field] = rawData[field];
          }
        }

        // 恢复 Map 数据
        if (data.intents) {
          const safeIntents = {};
          for (const [key, value] of Object.entries(data.intents)) {
            safeIntents[this._validateMapKey(key)] = value;
          }
          this.data.intents = new Map(Object.entries(safeIntents));
          for (const record of this.data.intents.values()) {
            record.variants = new Set(record.variants || []);
          }
        }
        if (data.suggestions) {
          const safeSuggestions = {};
          for (const [key, value] of Object.entries(data.suggestions)) {
            safeSuggestions[this._validateMapKey(key)] = value;
          }
          this.data.suggestions = new Map(Object.entries(safeSuggestions));
        }
        if (data.skills) {
          const safeSkills = {};
          for (const [key, value] of Object.entries(data.skills)) {
            safeSkills[this._validateMapKey(key)] = value;
          }
          this.data.skills = new Map(Object.entries(safeSkills));
          for (const record of this.data.skills.values()) {
            record.contexts = new Set(record.contexts || []);
          }
        }
        if (data.patterns) {
          const safePatterns = {};
          for (const [key, value] of Object.entries(data.patterns)) {
            safePatterns[this._validateMapKey(key)] = value;
          }
          this.data.patterns = new Map(Object.entries(safePatterns));
        }
        this.data.responses = Array.isArray(data.responses) ? data.responses.slice(0, this.limits.maxResponses) : [];
        this.data.feedback = Array.isArray(data.feedback) ? data.feedback.slice(0, this.limits.maxFeedback) : [];
        if (data.adjustments) {
          this.data.adjustments = { ...this.data.adjustments, ...data.adjustments };
        }

        console.log('[SelfLearning] Loaded historical data');
      }
    } catch (e) {
      console.warn('[SelfLearning] Failed to load data, using defaults:', e.message);
    }
  }

  _saveToStorage() {
    // 递归锁防止无限递归
    if (this._isSaving) {
      console.warn('[SelfLearning] Prevented recursive save');
      return;
    }
    this._isSaving = true;

    try {
      const dir = path.join(process.cwd(), '.opencode');
      const storagePath = path.join(dir, 'self-learning.json');

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 安全序列化 - 过滤危险key
      const safeSerializeMap = (map) => {
        const result = {};
        for (const [key, value] of map) {
          const safeKey = this._validateMapKey(key);
          result[safeKey] = value;
        }
        return result;
      };

      const data = {
        intents: safeSerializeMap(this.data.intents),
        suggestions: safeSerializeMap(this.data.suggestions),
        skills: safeSerializeMap(this.data.skills),
        patterns: safeSerializeMap(this.data.patterns),
        responses: this.data.responses.slice(-this.limits.maxResponses),
        feedback: this.data.feedback.slice(-this.limits.maxFeedback),
        adjustments: this.data.adjustments
      };

      // 转换 Set 为 Array
      for (const record of Object.values(data.intents)) {
        if (record.variants instanceof Set) {
          record.variants = Array.from(record.variants);
        }
      }
      for (const record of Object.values(data.skills)) {
        if (record.contexts instanceof Set) {
          record.contexts = Array.from(record.contexts);
        }
      }

      fs.writeFileSync(storagePath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.warn('[SelfLearning] Failed to save:', e.message);
    } finally {
      this._isSaving = false;
    }
  }

  /**
   * 导出学习报告
   */
  exportReport() {
    return {
      timestamp: new Date().toISOString(),
      stats: this.getStats(),
      improvements: this.getImprovements(),
      recentFeedback: this.data.feedback.slice(-5),
      topPatterns: Array.from(this.data.patterns.entries())
        .sort((a, b) => b[1].successRate - a[1].successRate)
        .slice(0, 5)
        .map(([pattern, data]) => ({ pattern, successRate: data.successRate })),
      currentAdjustments: this.getAdjustedParameters()
    };
  }

  // ========== AI大脑集成方法 ==========

  /**
   * 决策前：元认知自问
   */
  beforeDecision(context) {
    const brainResult = this.brain.beforeDecision(context);
    return {
      context,
      questions: brainResult.questions,
      selfCheck: brainResult.selfCheck,
      recommendations: this.getContextualRecommendations(context)
    };
  }

  /**
   * 决策后：复盘
   */
  afterDecision(context, result, action = null) {
    // 记录响应
    this.recordResponse(context, result, result.success ? 0.8 : 0.4);

    // 进化学习
    this.brain.evolution.learn(context, action, result);

    // 元认知复盘
    const reflection = this.brain.metaCognition.afterReview(context, result);

    return {
      reflection,
      improvements: this.brain.evolution.findImprovements(),
      stats: this.brain.evolution.getStats()
    };
  }

  /**
   * 解决问题：组合多种思维方式
   */
  solveProblem(problem) {
    // 使用大脑的 solve 方法
    return this.brain.solve(problem);
  }

  /**
   * 获取大脑状态
   */
  getBrainStatus() {
    return this.brain.getStatus();
  }

  /**
   * 配置大脑
   */
  configureBrain(config) {
    this.brain.setConfig(config);
  }
}

module.exports = SelfLearningSystem;
