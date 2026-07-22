/**
 * Memory - 长期记忆系统
 *
 * 让AI记住重要的交互、模式、用户偏好
 * 超越会话的持久记忆
 */

const fs = require('fs');
const path = require('path');

class Memory {
  constructor(options = {}) {
    this.storagePath = options.storagePath ||
      path.join(process.cwd(), '.opencode', 'memory.json');

    // 记忆类型
    this.types = {
      user: '用户偏好',
      interaction: '交互模式',
      concept: '概念理解',
      solution: '解决方案',
      insight: '洞察'
    };

    // 记忆容器
    this.memories = {
      user: {},
      interaction: [],
      concept: [],
      solution: [],
      insight: []
    };

    // 用户画像
    this.userProfiles = {};

    // 重要事件
    this.milestones = [];

    // 偏好
    this.preferences = {
      communication: 'direct',
      pace: 'balanced',
      detailLevel: 'medium'
    };

    this._load();

    console.log('[Memory] 长期记忆系统已初始化');
  }

  /**
   * 保存用户交互模式
   */
  rememberInteraction(userId, interaction) {
    const memory = {
      id: Date.now().toString(36),
      userId,
      input: this._simplify(interaction.input || ''),
      output: this._simplify(interaction.output || ''),
      context: interaction.context || 'general',
      success: interaction.success,
      timestamp: Date.now()
    };

    this.memories.interaction.push(memory);

    // 只保留最近100条
    if (this.memories.interaction.length > 100) {
      this.memories.interaction = this.memories.interaction.slice(-100);
    }

    this._extractPattern(memory);

    return memory;
  }

  /**
   * 保存解决方案
   */
  rememberSolution(problem, solution, result) {
    const memory = {
      id: Date.now().toString(36),
      problem: this._simplify(problem),
      solution,
      result,
      timestamp: Date.now()
    };

    // 检查是否已存在类似的
    const existing = this.memories.solution.find((s) =>
      this._similar(s.problem, problem)
    );

    if (!existing) {
      this.memories.solution.push(memory);
    }

    this._save();

    return memory;
  }

  /**
   * 保存概念理解
   */
  rememberConcept(concept, understanding) {
    const memory = {
      id: Date.now().toString(36),
      concept,
      understanding,
      examples: understanding.examples || [],
      depth: understanding.depth || 1,
      timestamp: Date.now()
    };

    const existing = this.memories.concept.find((c) =>
      c.concept === concept
    );

    if (existing) {
      existing.depth++;
      existing.lastUnderstood = Date.now();
    } else {
      this.memories.concept.push(memory);
    }

    this._save();

    return memory;
  }

  /**
   * 保存洞察
   */
  rememberInsight(insight) {
    const memory = {
      id: Date.now().toString(36),
      content: insight.content || insight,
      source: insight.source || 'self',
      importance: insight.importance || 5,
      context: insight.context || 'general',
      timestamp: Date.now()
    };

    this.memories.insight.push(memory);

    // 保留最重要的20条
    const sorted = this.memories.insight
      .sort((a, b) => b.importance - a.importance)
      .slice(0, 20);

    this.memories.insight = sorted;
    this._checkMilestone(memory);

    this._save();

    return memory;
  }

  /**
   * 保存用户画像
   */
  updateUserProfile(userId, profile) {
    if (!this.userProfiles[userId]) {
      this.userProfiles[userId] = {
        id: userId,
        preferences: { ...this.preferences },
        interactions: 0,
        createdAt: Date.now()
      };
    }

    // 更新偏好
    if (profile.preferences) {
      this.userProfiles[userId].preferences = {
        ...this.userProfiles[userId].preferences,
        ...profile.preferences
      };
    }

    this.userProfiles[userId].interactions++;
    this.userProfiles[userId].lastSeen = Date.now();

    // 推断偏好
    this._inferPreferences(userId);

    this._save();

    return this.userProfiles[userId];
  }

  /**
   * 获取解决方案
   */
  recallSolution(problem) {
    return this.memories.solution.filter((s) =>
      this._similar(s.problem, problem)
    );
  }

  /**
   * 获取概念理解
   */
  recallConcept(concept) {
    return this.memories.concept.find((c) =>
      c.concept === concept
    );
  }

  /**
   * 获取洞察
   */
  recallInsight(limit = 5) {
    return this.memories.insight
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }

  /**
   * 获取用户画像
   */
  getUserProfile(userId) {
    return this.userProfiles[userId] || this._createDefaultProfile();
  }

  /**
   * 获取交互模式
   */
  getInteractionPattern(userId) {
    const userInteractions = this.memories.interaction
      .filter((i) => i.userId === userId)
      .slice(-20);

    if (userInteractions.length === 0) {
      return null;
    }

    // 提取模式
    const patterns = {
      inputLength: this._avg(userInteractions.map((i) => (i.input || '').length)),
      successRate: userInteractions.filter((i) => i.success).length / userInteractions.length,
      contextFrequency: this._mostFrequent(userInteractions.map((i) => i.context))
    };

    return patterns;
  }

  /**
   * 获取里程碑
   */
  getMilestones() {
    return this.milestones;
  }

  /**
   * 检查是否是重要时刻
   */
  _checkMilestone(insight) {
    if (insight.importance >= 8) {
      this.milestones.push({
        type: 'insight',
        content: insight.content,
        timestamp: insight.timestamp
      });

      // 只保留最重要的10个
      if (this.milestones.length > 10) {
        this.milestones = this.milestones.slice(-10);
      }
    }
  }

  /**
   * 推断用户偏好
   */
  _inferPreferences(userId) {
    const profile = this.userProfiles[userId];
    const interactions = this.memories.interaction
      .filter((i) => i.userId === userId);

    if (interactions.length < 5) {return;}

    // 通信偏好
    const avgLength = this._avg(interactions.map((i) => (i.input || '').length));
    if (avgLength > 100) {
      profile.preferences.detailLevel = 'high';
    } else if (avgLength < 30) {
      profile.preferences.detailLevel = 'low';
    }

    this._save();
  }

  /**
   * 提取交互模式
   */
  _extractPattern(interaction) {
    if (interaction.input.length > 50 && interaction.success) {
      // 可能是详细输入型用户
      this.preferences.detailLevel = 'high';
    }
    if (!interaction.success) {
      this.preferences.adaptive = true;
    }
  }

  /**
   * 创建默认画像
   */
  _createDefaultProfile() {
    return {
      preferences: { ...this.preferences },
      interactions: 0,
      createdAt: Date.now()
    };
  }

  /**
   * 简化文本
   */
  _simplify(text) {
    if (!text) {return '';}
    return text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .substring(0, 100);
  }

  /**
   * 检查相似度
   */
  _similar(a, b) {
    const wordsA = this._simplify(a).split(/\s+/);
    const wordsB = this._simplify(b).split(/\s+/);
    const overlap = wordsA.filter((w) => wordsB.includes(w)).length;
    return overlap >= 2;
  }

  /**
   * 求平均值
   */
  _avg(numbers) {
    if (numbers.length === 0) {return 0;}
    return Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length);
  }

  /**
   * 最频繁项
   */
  _mostFrequent(items) {
    if (items.length === 0) {return null;}
    const counts = {};
    for (const item of items) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0][0];
  }

  /**
   * 保存
   */
  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.storagePath, JSON.stringify({
        userProfiles: this.userProfiles,
        preferences: this.preferences,
        milestones: this.milestones,
        stats: this.getStats()
      }, null, 2));
    } catch (e) {
      console.log('[Memory] 保存失败:', e.message);
    }
  }

  /**
   * 加载
   */
  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        this.userProfiles = data.userProfiles || {};
        this.preferences = data.preferences || this.preferences;
        this.milestones = data.milestones || [];
      }
    } catch (e) {
      console.log('[Memory] 加载失败:', e.message);
    }
  }

  /**
   * 获取统计
   */
  getStats() {
    return {
      solutions: this.memories.solution.length,
      concepts: this.memories.concept.length,
      insights: this.memories.insight.length,
      interactions: this.memories.interaction.length,
      users: Object.keys(this.userProfiles).length,
      milestones: this.milestones.length
    };
  }

  /**
   * 获取记忆摘要
   */
  getSummary() {
    return {
      type: 'Long-term Memory System',
      stats: this.getStats(),
      recentInsight: this.recallInsight(3),
      topSolution: this.memories.solution[0]?.problem || null
    };
  }
}

module.exports = Memory;