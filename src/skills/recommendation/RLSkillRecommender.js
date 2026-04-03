/**
 * Reinforcement Learning Skill Recommender
 * Uses Q-Learning to optimize skill recommendations based on user behavior
 */

class RLSkillRecommender {
  constructor(options = {}) {
    this.qTable = new Map();
    this.learningRate = options.learningRate || 0.1;
    this.discountFactor = options.discountFactor || 0.9;
    this.explorationRate = options.explorationRate || 0.1;
    this.explorationDecay = options.explorationDecay || 0.99;
    this.minExploration = options.minExploration || 0.01;
    
    this.userModels = new Map();
    this.interactionHistory = new Map();
    this.rewardHistory = [];
    
    this.contextKeywords = new Map();
    this._initContextPatterns();
  }

  _initContextPatterns() {
    this.contextKeywords.set('document', ['报告', '文档', '生成', '导出', 'pdf', 'word']);
    this.contextKeywords.set('analysis', ['分析', '统计', '图表', '数据', '趋势']);
    this.contextKeywords.set('finance', ['财务', '交易', '投资', '股票', '风险']);
    this.contextKeywords.set('healthcare', ['医疗', '健康', '诊断', '药物', '患者']);
    this.contextKeywords.set('legal', ['合同', '法律', '合规', '审查', '诉讼']);
    this.contextKeywords.set('manufacturing', ['质检', '生产', '设备', '维护', '库存']);
    this.contextKeywords.set('education', ['教学', '学生', '课程', '作业', '考试']);
    this.contextKeywords.set('retail', ['客户', '销售', '推荐', '定价', '库存']);
  }

  getStateKey(context, userId, conversationHistory) {
    const contextType = this._classifyContext(context);
    const userLevel = this._getUserLevel(userId);
    const recentSkills = this._getRecentSkills(conversationHistory);
    return `${contextType}:${userLevel}:${recentSkills.slice(-3).join(',')}`;
  }

  _classifyContext(text) {
    if (!text) return 'general';
    const lowerText = text.toLowerCase();
    
    for (const [category, keywords] of this.contextKeywords) {
      if (keywords.some(kw => lowerText.includes(kw))) {
        return category;
      }
    }
    return 'general';
  }

  _getUserLevel(userId) {
    const model = this.userModels.get(userId);
    if (!model) return 'beginner';
    
    const avgSuccess = model.successCount / Math.max(model.totalCalls, 1);
    if (avgSuccess > 0.9 && model.totalCalls > 50) return 'expert';
    if (avgSuccess > 0.7 && model.totalCalls > 20) return 'intermediate';
    return 'beginner';
  }

  _getRecentSkills(history) {
    if (!history || !history.length) return [];
    return history.slice(-10).map(h => h.skill).filter(Boolean);
  }

  getQValue(state, action) {
    const key = `${state}:${action}`;
    return this.qTable.get(key) || 0;
  }

  setQValue(state, action, value) {
    const key = `${state}:${action}`;
    this.qTable.set(key, value);
  }

  recommendSkills(context, userId, availableSkills, conversationHistory = [], topK = 3) {
    const state = this.getStateKey(context, userId, conversationHistory);
    
    // Exploration vs Exploitation
    if (Math.random() < this.explorationRate) {
      return this._randomRecommend(availableSkills, topK);
    }
    
    // Q-Learning based recommendation
    const scores = availableSkills.map(skill => ({
      skill,
      qValue: this.getQValue(state, skill.name),
      contextualScore: this._calculateContextScore(skill, context),
      collaborativeScore: this._calculateCollaborativeScore(skill, userId)
    }));
    
    // Combine scores
    scores.forEach(s => {
      s.totalScore = s.qValue * 0.4 + s.contextualScore * 0.4 + s.collaborativeScore * 0.2;
    });
    
    scores.sort((a, b) => b.totalScore - a.totalScore);
    return scores.slice(0, topK).map(s => ({
      ...s.skill,
      confidence: s.totalScore,
      reason: this._explainRecommendation(s, state)
    }));
  }

  _randomRecommend(skills, topK) {
    const shuffled = [...skills].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, topK).map(skill => ({
      ...skill,
      confidence: 0.5,
      reason: '探索推荐'
    }));
  }

  _calculateContextScore(skill, context) {
    if (!context) return 0.5;
    const contextType = this._classifyContext(context);
    const skillTags = (skill.tags || []).map(t => t.toLowerCase());
    
    const categoryMatch = {
      'document': ['pdf', '报告', '文档', '生成'],
      'analysis': ['分析', '统计', '图表'],
      'finance': ['财务', '投资', '风险'],
      'healthcare': ['医疗', '健康', '诊断'],
      'legal': ['法律', '合同', '合规'],
      'manufacturing': ['生产', '质检', '设备'],
      'education': ['教学', '学习', '学生'],
      'retail': ['销售', '客户', '推荐']
    };
    
    const relevantKeywords = categoryMatch[contextType] || [];
    const matchCount = skillTags.filter(tag => 
      relevantKeywords.some(kw => tag.includes(kw) || kw.includes(tag))
    ).length;
    
    return Math.min(1, matchCount / 2);
  }

  _calculateCollaborativeScore(skill, userId) {
    const model = this.userModels.get(userId);
    if (!model || !model.skillSuccessRates) return 0.5;
    
    const successRate = model.skillSuccessRates.get(skill.name);
    return successRate !== undefined ? successRate : 0.5;
  }

  _explainRecommendation(item, state) {
    const reasons = [];
    
    if (item.qValue > 0.7) reasons.push('根据您的使用历史');
    if (item.contextualScore > 0.6) reasons.push('与当前任务高度相关');
    if (item.collaborativeScore > 0.7) reasons.push('相似用户好评率高');
    
    return reasons.join('、') || '综合推荐';
  }

  updateQValue(state, action, reward, nextState, maxNextQ = null) {
    const currentQ = this.getQValue(state, action);
    
    if (maxNextQ === null) {
      const allNextQ = Array.from(this.qTable.entries())
        .filter(([key]) => key.startsWith(`${nextState}:`))
        .map(([, value]) => value);
      maxNextQ = Math.max(0, ...allNextQ);
    }
    
    const newQ = currentQ + this.learningRate * (reward + this.discountFactor * maxNextQ - currentQ);
    this.setQValue(state, action, newQ);
    
    return newQ;
  }

  recordInteraction(userId, skillName, context, success, rating, feedback) {
    // Update user model
    if (!this.userModels.has(userId)) {
      this.userModels.set(userId, {
        totalCalls: 0,
        successCount: 0,
        skillSuccessRates: new Map(),
        preferences: new Map(),
        lastInteraction: Date.now()
      });
    }
    
    const model = this.userModels.get(userId);
    model.totalCalls++;
    if (success) model.successCount++;
    model.lastInteraction = Date.now();
    
    const currentRate = model.skillSuccessRates.get(skillName) || 0.5;
    model.skillSuccessRates.set(skillName, currentRate * 0.9 + (success ? 0.1 : 0));
    
    // Record interaction history
    if (!this.interactionHistory.has(userId)) {
      this.interactionHistory.set(userId, []);
    }
    this.interactionHistory.get(userId).push({
      timestamp: Date.now(),
      skill: skillName,
      context,
      success,
      rating,
      feedback
    });
    
    // Calculate reward
    const reward = this._calculateReward(success, rating, feedback);
    this.rewardHistory.push({ userId, skillName, reward, timestamp: Date.now() });
    
    // Update Q-value
    const state = this.getStateKey(context, userId, this.interactionHistory.get(userId));
    const nextState = state; // Simplified
    
    // Decay exploration rate
    this.explorationRate = Math.max(
      this.minExploration,
      this.explorationRate * this.explorationDecay
    );
    
    return { reward, newExplorationRate: this.explorationRate };
  }

  _calculateReward(success, rating, feedback) {
    let reward = 0;
    
    if (success) reward += 1;
    if (rating >= 4) reward += 0.5;
    if (rating === 5) reward += 0.5;
    if (feedback === 'helpful') reward += 1;
    if (feedback === 'not_helpful') reward -= 1;
    
    return reward;
  }

  getProactiveSuggestion(context, userId, conversationHistory) {
    const suggestions = this.recommendSkills(context, userId, [], conversationHistory, 1);
    
    if (suggestions.length === 0) return null;
    
    const skill = suggestions[0];
    
    const suggestionTemplates = [
      `您可能需要生成${skill.name}，要我帮您调用吗？`,
      `根据您的操作，我建议使用${skill.name}，是否继续？`,
      `发现一个技能"${skill.name}"可能对您有帮助，需要我执行吗？`
    ];
    
    return {
      skill,
      message: suggestionTemplates[Math.floor(Math.random() * suggestionTemplates.length)],
      confidence: skill.confidence
    };
  }

  exportModel() {
    return {
      qTable: Array.from(this.qTable.entries()),
      userModels: Array.from(this.userModels.entries()).map(([userId, model]) => [
        userId,
        {
          ...model,
          skillSuccessRates: Array.from(model.skillSuccessRates.entries()),
          preferences: Array.from(model.preferences.entries())
        }
      ]),
      explorationRate: this.explorationRate,
      rewardHistory: this.rewardHistory.slice(-1000)
    };
  }

  importModel(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid model data: must be an object');
    }
    
    if (data.qTable && Array.isArray(data.qTable)) {
      for (const [key, value] of data.qTable) {
        if (typeof key === 'string' && typeof value === 'number' && isFinite(value)) {
          this.qTable.set(key, value);
        }
      }
    }
    
    if (data.userModels && Array.isArray(data.userModels)) {
      const validatedUserModels = new Map();
      for (const [userId, model] of data.userModels) {
        if (typeof userId === 'string' && model && typeof model === 'object') {
          validatedUserModels.set(userId, {
            totalCalls: Math.max(0, Math.min(Number.isFinite(model.totalCalls) ? model.totalCalls : 0, 1e9)),
            successCount: Math.max(0, Math.min(Number.isFinite(model.successCount) ? model.successCount : 0, model.totalCalls || 0)),
            skillSuccessRates: new Map(
              Array.isArray(model.skillSuccessRates)
                ? model.skillSuccessRates.filter(([k, v]) => typeof k === 'string' && typeof v === 'number')
                : []
            ),
            preferences: new Map(
              Array.isArray(model.preferences)
                ? model.preferences.filter(([k, v]) => typeof k === 'string')
                : []
            ),
            lastInteraction: model.lastInteraction || Date.now()
          });
        }
      }
      this.userModels = validatedUserModels;
    }
    
    if (typeof data.explorationRate === 'number' && data.explorationRate >= 0 && data.explorationRate <= 1) {
      this.explorationRate = data.explorationRate;
    }
  }

  getStats() {
    return {
      qTableSize: this.qTable.size,
      userModelsCount: this.userModels.size,
      totalInteractions: this.rewardHistory.length,
      currentExplorationRate: this.explorationRate,
      averageReward: this.rewardHistory.length > 0
        ? this.rewardHistory.reduce((sum, r) => sum + r.reward, 0) / this.rewardHistory.length
        : 0
    };
  }
}

module.exports = { RLSkillRecommender };
