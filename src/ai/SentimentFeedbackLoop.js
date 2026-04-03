/**
 * 实时情感反馈循环
 * 参考: Neuro-sama 的 Sentiment Analysis Feedback Loops
 * 
 * 功能:
 * - 实时分析弹幕/评论情感
 * - 动态调整语音语调
 * - 驱动表情和动画
 * - 情感记忆学习
 */

class SentimentFeedbackLoop {
  constructor(options = {}) {
    this.options = {
      windowSize: options.windowSize || 100,  // 情感窗口大小
      updateInterval: options.updateInterval || 200,
      sentimentWeight: options.sentimentWeight || 0.3,
      ...options
    };

    // 情感窗口
    this.sentimentBuffer = [];
    this.currentSentiment = {
      overall: 'neutral',
      score: 0,
      positiveRatio: 0.5,
      dominantEmotion: 'neutral'
    };

    // 语音参数映射
    this.voiceMappings = {
      happy: { rate: 1.15, pitch: 1.1, volume: 1.0 },
      sad: { rate: 0.85, pitch: 0.9, volume: 0.8 },
      excited: { rate: 1.25, pitch: 1.15, volume: 1.0 },
      calm: { rate: 0.95, pitch: 1.0, volume: 0.9 },
      curious: { rate: 1.0, pitch: 1.05, volume: 0.95 },
      shy: { rate: 0.9, pitch: 1.1, volume: 0.75 },
      angry: { rate: 1.2, pitch: 0.95, volume: 1.0 }
    };

    // 表情映射
    this.expressionMappings = {
      happy: { smile: 0.8, eyeScale: 1.1, blush: 0.4 },
      sad: { smile: -0.5, eyeScale: 0.8, blush: 0 },
      excited: { smile: 1.0, eyeScale: 1.2, blush: 0.6 },
      calm: { smile: 0.2, eyeScale: 0.9, blush: 0 },
      curious: { smile: 0.1, eyeScale: 1.05, eyebrowRaise: 0.3 },
      shy: { smile: 0.3, eyeScale: 0.7, blush: 0.8 },
      angry: { smile: -0.8, eyeScale: 1.1, eyebrowFurrow: 0.5 }
    };

    // 情感记忆
    this.emotionMemory = [];
    this.maxMemorySize = 1000;

    // 词典情感分数
    this.sentimentLexicon = this._buildLexicon();

    // 回调
    this.onSentimentChange = options.onSentimentChange || null;
    this.onVoiceUpdate = options.onVoiceUpdate || null;
    this.onExpressionUpdate = options.onExpressionUpdate || null;
  }

  /**
   * 构建情感词典
   */
  _buildLexicon() {
    return {
      // 积极词汇
      positive: {
        '好': 0.7, '棒': 0.8, '厉害': 0.7, '可爱': 0.8, '喜欢': 0.8,
        '开心': 0.9, '高兴': 0.9, '快乐': 0.8, '优秀': 0.7, '赞': 0.8,
        '666': 0.7, 'awesome': 0.8, 'love': 0.9, 'great': 0.8, 'nice': 0.7,
        '哈哈哈': 0.8, '哈哈': 0.6, '嘿嘿': 0.6, '嘻嘻': 0.7
      },
      // 消极词汇
      negative: {
        '差': -0.7, '垃圾': -0.9, '无聊': -0.6, '讨厌': -0.8, '烂': -0.8,
        '难过': -0.7, '伤心': -0.8, '失望': -0.7, '烦': -0.6, '烦人': -0.7,
        'boring': -0.6, 'hate': -0.9, 'bad': -0.7, 'worst': -0.9,
        '呜呜': -0.6, '555': -0.5
      },
      // 程度副词
      intensifiers: {
        '非常': 1.5, '特别': 1.4, '超级': 1.6, '很': 1.3, '太': 1.4,
        'really': 1.4, 'very': 1.4, 'super': 1.5
      },
      // 否定词
      negators: {
        '不': -1, '没': -1, '别': -0.8, '不要': -1, '不会': -0.9
      }
    };
  }

  /**
   * 分析单条消息情感
   */
  analyzeMessage(text) {
    let score = 0;
    let hasPositive = false;
    let hasNegative = false;
    let intensifier = 1;
    let isNegated = false;

    const words = text.split('');

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const context = words.slice(Math.max(0, i - 2), i + 3).join('');

      // 检查否定
      if (this.sentimentLexicon.negators[word]) {
        isNegated = true;
        continue;
      }

      // 检查程度副词
      if (this.sentimentLexicon.intensifiers[word]) {
        intensifier = this.sentimentLexicon.intensifiers[word];
        continue;
      }

      // 积极词
      if (this.sentimentLexicon.positive[word]) {
        const wordScore = this.sentimentLexicon.positive[word] * intensifier;
        score += isNegated ? -wordScore : wordScore;
        hasPositive = true;
        intensifier = 1;
        isNegated = false;
      }

      // 消极词
      if (this.sentimentLexicon.negative[word]) {
        const wordScore = this.sentimentLexicon.negative[word] * intensifier;
        score += isNegated ? -wordScore : wordScore;
        hasNegative = true;
        intensifier = 1;
        isNegated = false;
      }

      // 感叹号增强
      if (word === '!' || word === '！') {
        score *= 1.2;
      }
    }

    // 归一化到 [-1, 1]
    const normalizedScore = Math.max(-1, Math.min(1, score / 3));

    return {
      score: normalizedScore,
      sentiment: normalizedScore > 0.2 ? 'positive' : normalizedScore < -0.2 ? 'negative' : 'neutral',
      intensity: Math.abs(normalizedScore),
      text
    };
  }

  /**
   * 处理新消息
   */
  processMessage(text, metadata = {}) {
    const analysis = this.analyzeMessage(text);

    // 添加到缓冲区
    this.sentimentBuffer.push({
      ...analysis,
      timestamp: Date.now(),
      user: metadata.user
    });

    // 限制缓冲区大小
    if (this.sentimentBuffer.length > this.options.windowSize) {
      this.sentimentBuffer.shift();
    }

    // 更新整体情感
    this._updateOverallSentiment();

    // 保存到记忆
    this._addToMemory({
      text,
      analysis,
      overallSentiment: { ...this.currentSentiment },
      timestamp: Date.now()
    });

    return this.currentSentiment;
  }

  /**
   * 更新整体情感
   */
  _updateOverallSentiment() {
    if (this.sentimentBuffer.length === 0) return;

    // 计算加权平均分数
    const recentMessages = this.sentimentBuffer.slice(-20);
    const totalScore = recentMessages.reduce((sum, m) => sum + m.score, 0);
    const avgScore = totalScore / recentMessages.length;

    // 计算积极比例
    const positiveCount = recentMessages.filter(m => m.sentiment === 'positive').length;
    const positiveRatio = positiveCount / recentMessages.length;

    // 确定主导情感
    let dominantEmotion = 'neutral';
    const emotionCounts = { happy: 0, sad: 0, excited: 0, calm: 0, curious: 0 };

    for (const msg of recentMessages) {
      if (msg.score > 0.5) emotionCounts.happy++;
      else if (msg.score > 0.3) emotionCounts.excited++;
      else if (msg.score < -0.5) emotionCounts.sad++;
      else if (msg.score < -0.2) emotionCounts.calm++;
      else emotionCounts.curious++;
    }

    dominantEmotion = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])[0][0];

    // 检测情感变化
    const previousEmotion = this.currentSentiment.dominantEmotion;

    this.currentSentiment = {
      overall: avgScore > 0.2 ? 'positive' : avgScore < -0.2 ? 'negative' : 'neutral',
      score: avgScore,
      positiveRatio,
      dominantEmotion
    };

    // 触发情感变化回调
    if (dominantEmotion !== previousEmotion && this.onSentimentChange) {
      this.onSentimentChange({
        previous: previousEmotion,
        current: dominantEmotion,
        score: avgScore
      });
    }

    // 更新语音参数
    this._updateVoiceParams(dominantEmotion);

    // 更新表情
    this._updateExpression(dominantEmotion);

    return this.currentSentiment;
  }

  /**
   * 更新语音参数
   */
  _updateVoiceParams(emotion) {
    const params = this.voiceMappings[emotion] || this.voiceMappings.calm;

    if (this.onVoiceUpdate) {
      this.onVoiceUpdate(params);
    }

    return params;
  }

  /**
   * 更新表情
   */
  _updateExpression(emotion) {
    const expression = this.expressionMappings[emotion] || this.expressionMappings.calm;

    if (this.onExpressionUpdate) {
      this.onExpressionUpdate(expression);
    }

    return expression;
  }

  /**
   * 获取当前语音参数
   */
  getVoiceParams() {
    return this._updateVoiceParams(this.currentSentiment.dominantEmotion);
  }

  /**
   * 获取当前表情
   */
  getExpression() {
    return this._updateExpression(this.currentSentiment.dominantEmotion);
  }

  /**
   * 获取当前情感状态
   */
  getCurrentSentiment() {
    return { ...this.currentSentiment };
  }

  /**
   * 获取情感趋势
   */
  getTrend(windowSize = 50) {
    const window = this.sentimentBuffer.slice(-windowSize);
    
    if (window.length < 2) return { trend: 'stable', change: 0 };

    const firstHalf = window.slice(0, Math.floor(window.length / 2));
    const secondHalf = window.slice(Math.floor(window.length / 2));

    const firstAvg = firstHalf.reduce((sum, m) => sum + m.score, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, m) => sum + m.score, 0) / secondHalf.length;

    const change = secondAvg - firstAvg;

    return {
      trend: change > 0.1 ? 'improving' : change < -0.1 ? 'declining' : 'stable',
      change,
      firstAvg,
      secondAvg
    };
  }

  /**
   * 添加到情感记忆
   */
  _addToMemory(entry) {
    this.emotionMemory.push(entry);

    if (this.emotionMemory.length > this.maxMemorySize) {
      this.emotionMemory.shift();
    }
  }

  /**
   * 查询情感历史
   */
  queryEmotionHistory(options = {}) {
    const { startTime, endTime, emotion, limit = 50 } = options;

    let results = [...this.emotionMemory];

    if (startTime) {
      results = results.filter(m => m.timestamp >= startTime);
    }
    if (endTime) {
      results = results.filter(m => m.timestamp <= endTime);
    }
    if (emotion) {
      results = results.filter(m => 
        m.overallSentiment.dominantEmotion === emotion
      );
    }

    return results.slice(-limit);
  }

  /**
   * 获取情感统计
   */
  getStats() {
    const total = this.emotionMemory.length;
    if (total === 0) return null;

    const emotionCounts = {};
    for (const entry of this.emotionMemory) {
      const emotion = entry.overallSentiment.dominantEmotion;
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    }

    return {
      totalMessages: total,
      emotionDistribution: emotionCounts,
      currentSentiment: { ...this.currentSentiment },
      buffer: this.sentimentBuffer.length
    };
  }

  /**
   * 重置
   */
  reset() {
    this.sentimentBuffer = [];
    this.currentSentiment = {
      overall: 'neutral',
      score: 0,
      positiveRatio: 0.5,
      dominantEmotion: 'neutral'
    };
  }
}

module.exports = SentimentFeedbackLoop;
