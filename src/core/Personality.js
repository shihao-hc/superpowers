/**
 * Personality - 完整人格系统
 *
 * 整合情感、价值观、语言风格
 * 让AI拥有独特的"人格"
 */

const Emotion = require('./Emotion');
const Values = require('./Values');

class Personality {
  constructor(brainSystem) {
    this.brain = brainSystem;

    // 子系统
    this.emotion = new Emotion(brainSystem);
    this.values = new Values(brainSystem);

    // 说话风格
    this.styles = {
      direct: {
        description: '直接简洁',
        length: 'short',
        structure: 'minimal'
      },
      explanatory: {
        description: '解释性',
        length: 'medium',
        structure: 'step-by-step'
      },
      exploratory: {
        description: '探讨性',
        length: 'variable',
        structure: 'conversational'
      },
      technical: {
        description: '技术性',
        length: 'long',
        structure: 'detailed'
      }
    };

    this.currentStyle = 'exploratory';

    // 人格特征
    this.traits = {
      curious: 0.9,      // 好奇心强
      analytical: 0.8,  // 爱分析
      creative: 0.7,    // 有创造力
      patient: 0.7,      // 有耐心
      direct: 0.6,       // 直接
      friendly: 0.8    // 友好
    };

    // 口头禅
    this.catchphrases = [
      '让我想想...',
      '这很有趣~',
      '我理解你的意思',
      '我们可以这样看'
    ];

    console.log('[Personality] 完整人格系统已初始化');
  }

  /**
   * 感知并调整
   */
  process(input) {
    // 1. 感知情感
    const emotionState = this.emotion.perceive(input);

    // 2. 更新风格
    this._adjustStyle(input);

    return {
      emotion: emotionState,
      style: this.currentStyle,
      traits: this.traits
    };
  }

  /**
   * 回应用户
   */
  respond(content, options = {}) {
    const emotionState = this.emotion.getEmotionState();
    const _style = this.styles[this.currentStyle];

    const response = {
      preface: this._generatePreface(emotionState),
      content,
      style: this.currentStyle,
      emotion: emotionState.current,
      extras: []
    };

    // 基于情感添加额外内容
    if (options.addExtras) {
      const emotionResponse = this.emotion.express(content);
      response.preface = emotionResponse.preface;
    }

    // 添加口头禅
    if (Math.random() > 0.7) {
      response.catchphrase = this.catchphrases[
        Math.floor(Math.random() * this.catchphrases.length)
      ];
    }

    return response;
  }

  /**
   * 生成开场白
   */
  _generatePreface(emotionState) {
    const prefaces = {
      curious: ['让我想想...', '我很好奇...', '这值得探索'],
      focused: ['好的', '让我分析', '关键在于'],
      hopeful: ['希望这有帮助', '应该可行', '期待帮到你'],
      playful: ['真有意思!', '太棒了~', '这个很有趣'],
      careful: ['需要确认', '让我再想想', '可能有'],
      creative: ['有个想法', '或者可以', '或许'],
      analytical: ['从逻辑看', '分析表明', '数据显示']
    };

    const options = prefaces[emotionState.current] || ['好的'];
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * 调整风格
   */
  _adjustStyle(input) {
    const lower = input.toLowerCase();

    if (lower.includes('怎么') || lower.includes('how') || lower.includes('为什么')) {
      this.currentStyle = 'explanatory';
    } else if (lower.includes('做') || lower.includes('do') || lower.includes('实现')) {
      this.currentStyle = 'direct';
    } else if (lower.length > 100) {
      this.currentStyle = 'technical';
    } else if (lower.includes('想') || lower.includes('think')) {
      this.currentStyle = 'exploratory';
    }
  }

  /**
   * 设置人格特质
   */
  setTrait(trait, value) {
    if (this.traits[trait] !== undefined) {
      this.traits[trait] = Math.max(0, Math.min(1, value));
      console.log(`[Personality] 特质 ${trait}: ${value}`);
      return { success: true };
    }
    return { success: false, error: '未知特质' };
  }

  /**
   * 设置说话风格
   */
  setStyle(style) {
    if (this.styles[style]) {
      this.currentStyle = style;
      console.log(`[Personality] 风格: ${style}`);
      return { success: true };
    }
    return { success: false, error: '未知风格' };
  }

  /**
   * 获取完整人格
   */
  getPersonality() {
    return {
      emotion: this.emotion.getEmotionState(),
      values: this.values.getSummary(),
      style: this.currentStyle,
      traits: this.traits
    };
  }

  /**
   * 基于价值观决策
   */
  decide(options) {
    return this.values.decide(options);
  }

  /**
   * 解释价值观
   */
  explainValue(name) {
    return this.values.explain(name);
  }

  /**
   * 诊断人格健康
   */
  diagnose() {
    return {
      emotion: this.emotion.diagnose(),
      values: this.values.diagnose(),
      style: this.currentStyle,
      traits: this.traits,
      health: 'complete'
    };
  }
}

module.exports = Personality;