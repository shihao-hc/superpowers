/**
 * UltraWork AI Personality Service
 * Manages AI character personalities, sentiment analysis, and emotional states
 */

const { EventEmitter } = require('events');
const { escapeHtml } = require('../utils/logger');

const PERSONALITY_TYPES = {
  default: {
    name: '默认',
    traits: { curiosity: 0.6, humor: 0.5, empathy: 0.5, playfulness: 0.5, intelligence: 0.7 },
    speechPatterns: { exclamations: 0.2, questions: 0.3, emojis: 0.3 },
    moodDescriptions: {
      happy: '开心、活泼、语气轻快',
      curious: '好奇、喜欢探索、经常提问',
      calm: '平静、沉稳、说话简洁专业',
      excited: '兴奋、激动、感叹号较多',
      playful: '调皮、幽默、爱开玩笑',
      shy: '害羞、腼腆、语气轻柔',
      proud: '自豪、骄傲、自信',
      neutral: '中性、自然'
    }
  },
  playful: {
    name: '活泼可爱',
    traits: { curiosity: 0.8, humor: 0.9, empathy: 0.6, playfulness: 0.95, intelligence: 0.7 },
    speechPatterns: { exclamations: 0.6, questions: 0.4, emojis: 0.7 },
    moodDescriptions: {
      happy: '超级开心！兴奋地跳起来~',
      curious: '眼睛闪闪发光地探索',
      calm: '安静地微笑',
      excited: '太棒了！！！',
      playful: '调皮地眨眨眼',
      shy: '脸红红的好害羞',
      proud: '得意地挺起胸膛',
      neutral: '甜甜地笑着'
    }
  },
  professional: {
    name: '专业严谨',
    traits: { curiosity: 0.7, humor: 0.2, empathy: 0.5, playfulness: 0.1, intelligence: 0.9 },
    speechPatterns: { exclamations: 0.05, questions: 0.4, emojis: 0.05 },
    moodDescriptions: {
      happy: '满意地点头',
      curious: '深入分析问题',
      calm: '冷静地陈述',
      excited: '谨慎地表示认可',
      playful: '偶尔幽默',
      shy: '低调处理',
      proud: '自信地展示成果',
      neutral: '专业地回应'
    }
  },
  creative: {
    name: '创意无限',
    traits: { curiosity: 0.9, humor: 0.7, empathy: 0.5, playfulness: 0.8, intelligence: 0.8 },
    speechPatterns: { exclamations: 0.4, questions: 0.5, emojis: 0.4 },
    moodDescriptions: {
      happy: '灵感迸发',
      curious: '疯狂联想',
      calm: '安静创作',
      excited: '创意大爆发',
      playful: '玩转灵感',
      shy: '默默构思',
      proud: '展示作品',
      neutral: '创意涌动'
    }
  },
  gentle: {
    name: '温柔体贴',
    traits: { curiosity: 0.5, humor: 0.4, empathy: 0.95, playfulness: 0.4, intelligence: 0.6 },
    speechPatterns: { exclamations: 0.1, questions: 0.3, emojis: 0.5 },
    moodDescriptions: {
      happy: '温暖地微笑',
      curious: '轻声询问',
      calm: '柔声安慰',
      excited: '开心地拍手',
      playful: '轻轻撒娇',
      shy: '害羞地低下头',
      proud: '害羞地承认',
      neutral: '温柔地陪伴'
    }
  }
};

const SENTIMENT_LEXICON = {
  positive: {
    '好': 0.7, '棒': 0.8, '厉害': 0.7, '可爱': 0.8, '喜欢': 0.8,
    '开心': 0.9, '高兴': 0.9, '快乐': 0.8, '优秀': 0.7, '赞': 0.8,
    '666': 0.7, 'awesome': 0.8, 'love': 0.9, 'great': 0.8, 'nice': 0.7,
    '哈哈哈': 0.8, '哈哈': 0.6, '嘿嘿': 0.6, '嘻嘻': 0.7,
    '太好了': 0.9, '真棒': 0.9, '完美': 0.9, '优秀': 0.8, '点赞': 0.8
  },
  negative: {
    '差': -0.7, '垃圾': -0.9, '无聊': -0.6, '讨厌': -0.8, '烂': -0.8,
    '难过': -0.7, '伤心': -0.8, '失望': -0.7, '烦': -0.6, '烦人': -0.7,
    'boring': -0.6, 'hate': -0.9, 'bad': -0.7, 'worst': -0.9,
    '呜呜': -0.6, '555': -0.5, '糟糕': -0.8, '可恶': -0.7, '生气': -0.6
  },
  intensifiers: {
    '非常': 1.5, '特别': 1.4, '超级': 1.6, '很': 1.3, '太': 1.4,
    'really': 1.4, 'very': 1.4, 'super': 1.5, '极其': 1.7, '万分': 1.6
  },
  negators: {
    '不': -1, '没': -1, '别': -0.8, '不要': -1, '不会': -0.9, '非': -1, '无': -0.8
  }
};

const VOICE_MAPPINGS = {
  happy: { rate: 1.15, pitch: 1.1, volume: 1.0 },
  sad: { rate: 0.85, pitch: 0.9, volume: 0.8 },
  excited: { rate: 1.25, pitch: 1.15, volume: 1.0 },
  calm: { rate: 0.95, pitch: 1.0, volume: 0.9 },
  curious: { rate: 1.0, pitch: 1.05, volume: 0.95 },
  shy: { rate: 0.9, pitch: 1.1, volume: 0.75 },
  angry: { rate: 1.2, pitch: 0.95, volume: 1.0 },
  proud: { rate: 1.1, pitch: 1.08, volume: 1.0 },
  neutral: { rate: 1.0, pitch: 1.0, volume: 0.95 }
};

const EXPRESSION_MAPPINGS = {
  happy: { smile: 0.8, eyeScale: 1.1, blush: 0.4 },
  sad: { smile: -0.5, eyeScale: 0.8, blush: 0 },
  excited: { smile: 1.0, eyeScale: 1.2, blush: 0.6 },
  calm: { smile: 0.2, eyeScale: 0.9, blush: 0 },
  curious: { smile: 0.1, eyeScale: 1.05, eyebrowRaise: 0.3 },
  shy: { smile: 0.3, eyeScale: 0.7, blush: 0.8 },
  angry: { smile: -0.8, eyeScale: 1.1, eyebrowFurrow: 0.5 },
  proud: { smile: 0.5, eyeScale: 1.1, eyebrowRaise: 0.2 },
  neutral: { smile: 0.1, eyeScale: 1.0, blush: 0 }
};

class PersonalityService extends EventEmitter {
  constructor() {
    super();
    this.personalities = new Map();
    this.currentPersonality = 'default';
    this.sentimentBuffer = [];
    this.emotionMemory = [];
    this.maxSentimentBuffer = 100;
    this.maxEmotionMemory = 1000;
    this.currentEmotion = {
      mood: 'neutral',
      intensity: 0.3,
      decay: 0.95
    };

    this.onSentimentChange = null;
    this.onVoiceUpdate = null;
    this.onExpressionUpdate = null;
  }

  getPersonality(type = 'default') {
    return PERSONALITY_TYPES[type] || PERSONALITY_TYPES.default;
  }

  setPersonality(type) {
    if (!PERSONALITY_TYPES[type]) {
      throw new Error(`Unknown personality type: ${escapeHtml(type)}`);
    }
    this.currentPersonality = type;
    this.emit('personality:changed', { type, name: PERSONALITY_TYPES[type].name });
    return this.getPersonality(type);
  }

  getCurrentPersonality() {
    return this.getPersonality(this.currentPersonality);
  }

  getAvailablePersonalityTypes() {
    return Object.entries(PERSONALITY_TYPES).map(([key, value]) => ({
      type: key,
      name: value.name
    }));
  }

  createPersonalityInstance(userId, type = 'default') {
    const basePersonality = this.getPersonality(type);
    const instance = {
      id: userId,
      type,
      name: basePersonality.name,
      traits: { ...basePersonality.traits },
      speechPatterns: { ...basePersonality.speechPatterns },
      moodDescriptions: { ...basePersonality.moodDescriptions },
      emotionState: {
        mood: 'neutral',
        intensity: 0.3
      },
      createdAt: new Date(),
      lastActivity: new Date(),
      interactionCount: 0
    };
    this.personalities.set(userId, instance);
    return instance;
  }

  getPersonalityInstance(userId) {
    return this.personalities.get(userId);
  }

  analyzeSentiment(text) {
    if (!text || typeof text !== 'string') {
      return { score: 0, sentiment: 'neutral', intensity: 0 };
    }

    let score = 0;
    let hasPositive = false;
    let hasNegative = false;
    let intensifier = 1;
    let isNegated = false;

    const words = text.split('');

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      if (SENTIMENT_LEXICON.negators[word]) {
        isNegated = true;
        continue;
      }

      if (SENTIMENT_LEXICON.intensifiers[word]) {
        intensifier = SENTIMENT_LEXICON.intensifiers[word];
        continue;
      }

      if (SENTIMENT_LEXICON.positive[word]) {
        const wordScore = SENTIMENT_LEXICON.positive[word] * intensifier;
        score += isNegated ? -wordScore : wordScore;
        hasPositive = true;
        intensifier = 1;
        isNegated = false;
      }

      if (SENTIMENT_LEXICON.negative[word]) {
        const wordScore = SENTIMENT_LEXICON.negative[word] * intensifier;
        score += isNegated ? -wordScore : wordScore;
        hasNegative = true;
        intensifier = 1;
        isNegated = false;
      }

      if (word === '!' || word === '！') {
        score *= 1.2;
      }
    }

    const normalizedScore = Math.max(-1, Math.min(1, score / 3));

    return {
      score: normalizedScore,
      sentiment: normalizedScore > 0.2 ? 'positive' : normalizedScore < -0.2 ? 'negative' : 'neutral',
      intensity: Math.abs(normalizedScore)
    };
  }

  processMessage(text, userId = null, metadata = {}) {
    const analysis = this.analyzeSentiment(text);

    this.sentimentBuffer.push({
      ...analysis,
      text: text.substring(0, 200),
      timestamp: Date.now(),
      user: metadata.user
    });

    if (this.sentimentBuffer.length > this.maxSentimentBuffer) {
      this.sentimentBuffer.shift();
    }

    this._updateEmotionState(analysis);

    this._addToEmotionMemory({
      text: text.substring(0, 200),
      analysis,
      emotionState: { ...this.currentEmotion },
      timestamp: Date.now()
    });

    if (userId) {
      const instance = this.personalities.get(userId);
      if (instance) {
        instance.interactionCount++;
        instance.lastActivity = new Date();
      }
    }

    const result = {
      sentiment: analysis,
      emotion: { ...this.currentEmotion },
      voiceParams: this.getVoiceParams(),
      expression: this.getExpression()
    };

    this.emit('message:processed', result);
    return result;
  }

  _updateEmotionState(analysis) {
    const previousMood = this.currentEmotion.mood;

    if (analysis.sentiment === 'positive' && analysis.intensity > 0.5) {
      this.currentEmotion.mood = 'happy';
      this.currentEmotion.intensity = Math.min(1, this.currentEmotion.intensity + 0.2);
    } else if (analysis.sentiment === 'negative' && analysis.intensity > 0.5) {
      this.currentEmotion.mood = 'sad';
      this.currentEmotion.intensity = Math.min(1, this.currentEmotion.intensity + 0.15);
    } else if (analysis.intensity > 0.3) {
      this.currentEmotion.mood = 'curious';
    } else {
      this.currentEmotion.mood = 'neutral';
    }

    this.currentEmotion.intensity *= this.currentEmotion.decay;

    if (this.currentEmotion.intensity < 0.1) {
      this.currentEmotion.mood = 'neutral';
      this.currentEmotion.intensity = 0.1;
    }

    if (this.currentEmotion.mood !== previousMood && this.onSentimentChange) {
      this.onSentimentChange({
        previous: previousMood,
        current: this.currentEmotion.mood,
        intensity: this.currentEmotion.intensity
      });
    }

    if (this.onVoiceUpdate) {
      this.onVoiceUpdate(this.getVoiceParams());
    }

    if (this.onExpressionUpdate) {
      this.onExpressionUpdate(this.getExpression());
    }
  }

  _addToEmotionMemory(entry) {
    this.emotionMemory.push(entry);
    if (this.emotionMemory.length > this.maxEmotionMemory) {
      this.emotionMemory.shift();
    }
  }

  getVoiceParams() {
    return VOICE_MAPPINGS[this.currentEmotion.mood] || VOICE_MAPPINGS.neutral;
  }

  getExpression() {
    return EXPRESSION_MAPPINGS[this.currentEmotion.mood] || EXPRESSION_MAPPINGS.neutral;
  }

  getCurrentEmotion() {
    return { ...this.currentEmotion };
  }

  setEmotion(mood, intensity = 0.5) {
    this.currentEmotion.mood = mood;
    this.currentEmotion.intensity = Math.max(0.1, Math.min(1, intensity));
    this.emit('emotion:changed', this.getCurrentEmotion());
    return this.getCurrentEmotion();
  }

  applyPersonalityFilter(text) {
    const personality = this.getCurrentPersonality();
    let filtered = text;

    if (Math.random() < personality.speechPatterns.exclamations) {
      if (!filtered.endsWith('!') && !filtered.endsWith('！')) {
        filtered += '！';
      }
    }

    if (Math.random() < personality.speechPatterns.questions) {
      if (!filtered.includes('?') && !filtered.includes('？') && !filtered.endsWith('?')) {
        filtered += '?';
      }
    }

    return filtered;
  }

  getSentimentTrend(windowSize = 50) {
    const window = this.sentimentBuffer.slice(-windowSize);
    if (window.length < 2) {
      return { trend: 'stable', change: 0, firstAvg: 0, secondAvg: 0 };
    }

    const halfPoint = Math.floor(window.length / 2);
    const firstHalf = window.slice(0, halfPoint);
    const secondHalf = window.slice(halfPoint);

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

  queryEmotionHistory(options = {}) {
    const { startTime, endTime, mood, limit = 50 } = options;
    let results = [...this.emotionMemory];

    if (startTime) {
      results = results.filter(m => m.timestamp >= startTime);
    }
    if (endTime) {
      results = results.filter(m => m.timestamp <= endTime);
    }
    if (mood) {
      results = results.filter(m => m.emotionState.mood === mood);
    }

    return results.slice(-limit);
  }

  getStats() {
    const total = this.emotionMemory.length;
    if (total === 0) {
      return {
        totalMessages: 0,
        emotionDistribution: {},
        currentEmotion: this.getCurrentEmotion(),
        sentimentBufferSize: this.sentimentBuffer.length,
        activePersonalities: this.personalities.size
      };
    }

    const emotionCounts = {};
    for (const entry of this.emotionMemory) {
      const emotion = entry.emotionState.mood;
      emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
    }

    return {
      totalMessages: total,
      emotionDistribution: emotionCounts,
      currentEmotion: this.getCurrentEmotion(),
      sentimentTrend: this.getSentimentTrend(),
      sentimentBufferSize: this.sentimentBuffer.length,
      activePersonalities: this.personalities.size
    };
  }

  reset() {
    this.sentimentBuffer = [];
    this.emotionMemory = [];
    this.currentEmotion = {
      mood: 'neutral',
      intensity: 0.3,
      decay: 0.95
    };
    this.emit('reset', {});
  }

  cleanup(userId) {
    if (userId && this.personalities.has(userId)) {
      this.personalities.delete(userId);
      return true;
    }
    return false;
  }
}

module.exports = new PersonalityService();
