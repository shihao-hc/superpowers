/**
 * Perceiver - 感知层
 *
 * 让AI能感知环境、上下文、情绪、意图
 * 超越单纯的任务处理，进入真正的"感知-响应"模式
 */

class Perceiver {
  constructor(brainSystem) {
    this.brain = brainSystem;

    // 感知通道
    this.channels = {
      context: this._perceiveContext.bind(this),
      intent: this._perceiveIntent.bind(this),
      emotion: this._perceiveEmotion.bind(this),
      environment: this._perceiveEnvironment.bind(this),
      relationship: this._perceiveRelationship.bind(this)
    };

    // 感知历史
    this.perceptionHistory = [];
    this.maxHistory = 50;

    // 当前感知状态
    this.current = {
      context: null,
      intent: null,
      emotion: 'neutral',
      energy: 100,
      focus: null
    };

    console.log('[Perceiver] 感知层已初始化');
  }

  /**
   * 完整感知
   */
  perceive(input) {
    const perception = {
      timestamp: Date.now(),
      input: typeof input === 'string' ? input : JSON.stringify(input),
      channels: {}
    };

    // 多通道感知
    for (const [channel, fn] of Object.entries(this.channels)) {
      try {
        perception.channels[channel] = fn(input);
      } catch (e) {
        perception.channels[channel] = { error: e.message };
      }
    }

    // 更新当前状态
    this._updateCurrent(perception);

    // 记录历史
    this._record(perception);

    // 更新大脑
    if (this.brain.beforeDecision) {
      this.brain.beforeDecision(perception.channels.context?.summary || input);
    }

    return perception;
  }

  /**
   * 感知上下文
   */
  _perceiveContext(input) {
    const context = {
      type: 'unknown',
      summary: '',
      entities: [],
      relationships: []
    };

    // 简单分类
    const lower = input.toLowerCase();

    if (/\.js|\.ts|\.py|\.md|代码|code|implement/.test(lower)) {
      context.type = 'development';
      context.entities.push('code');
    } else if (/文档|doc|readme|guide/.test(lower)) {
      context.type = 'documentation';
      context.entities.push('document');
    } else if (/测试|test|verify|检查/.test(lower)) {
      context.type = 'verification';
      context.entities.push('test');
    } else if (/搜索|找|查询|find|search|探索/.test(lower)) {
      context.type = 'exploration';
      context.entities.push('search');
    } else {
      context.type = 'general';
    }

    // 提取关键信息
    const keywords = this._extractKeywords(input);
    context.keywords = keywords;
    context.summary = `${context.type}: ${keywords.slice(0, 3).join(', ')}`;

    return context;
  }

  /**
   * 感知意图
   */
  _perceiveIntent(input) {
    const intent = {
      primary: 'unknown',
      secondary: [],
      confidence: 0,
      ambiguity: false
    };

    const lower = input.toLowerCase();

    // 主要意图识别
    const intentPatterns = {
      'create': ['创建', '新建', 'add', 'new', 'write'],
      'read': ['查看', '读|找', 'show', 'get', 'find'],
      'update': ['修改', '更新', 'edit', 'change', 'fix'],
      'delete': ['删除', '去掉', 'remove', 'delete'],
      'analyze': ['分析', '检查', 'analyze', 'check', 'review'],
      'explore': ['探索', '学习', 'explore', 'learn', 'understand'],
      'execute': ['执行', '运行', 'run', 'execute', 'do'],
      'help': ['帮助', '如何', 'how', 'help', 'explain']
    };

    for (const [intentName, patterns] of Object.entries(intentPatterns)) {
      if (patterns.some((p) => lower.includes(p))) {
        if (intent.primary === 'unknown') {
          intent.primary = intentName;
          intent.confidence = 0.7;
        } else {
          intent.secondary.push(intentName);
        }
      }
    }

    // 检测模糊性
    const questionWords = ['?', '如何', '怎么', '什么', '为什么', 'why', 'how', 'what'];
    intent.ambiguity = questionWords.some((w) => lower.includes(w)) && intent.primary === 'unknown';

    return intent;
  }

  /**
   * 感知情绪/态度
   */
  _perceiveEmotion(input) {
    const emotion = {
      state: 'neutral',
      intensity: 0,
      cues: []
    };

    const lower = input.toLowerCase();

    const positive = ['好', '很好', '棒', 'excellent', 'great', 'good', 'perfect', '太好了'];
    const negative = ['糟糕', '坏', '差', 'terrible', 'bad', 'worst', '问题', '错误'];
    const uncertain = ['大概', '可能', '或许', 'maybe', 'perhaps', '不确定'];
    const urgent = ['快', '紧急', '立刻', 'urgent', 'asap', 'immediately'];

    // 计数
    for (const word of positive) {
      if (lower.includes(word)) {
        emotion.cues.push('positive');
        emotion.intensity += 0.2;
      }
    }
    for (const word of negative) {
      if (lower.includes(word)) {
        emotion.cues.push('negative');
        emotion.intensity += 0.3;
      }
    }
    for (const word of uncertain) {
      if (lower.includes(word)) {
        emotion.cues.push('uncertain');
        emotion.state = 'uncertain';
      }
    }
    for (const word of urgent) {
      if (lower.includes(word)) {
        emotion.cues.push('urgent');
        emotion.intensity += 0.4;
      }
    }

    if (emotion.state === 'neutral') {
      if (emotion.cues.includes('negative')) {
        emotion.state = 'negative';
      } else if (emotion.intensity > 0.3) {
        emotion.state = 'positive';
      }
    }

    emotion.intensity = Math.min(emotion.intensity, 1);

    return emotion;
  }

  /**
   * 感知环境
   */
  _perceiveEnvironment(_input) {
    const env = {
      platform: process.platform,
      timestamp: Date.now(),
      hour: new Date().getHours(),
      recentInputs: this.perceptionHistory.length,
      brainState: this.brain?.getStatus()?.healthy || 'unknown'
    };

    // 时间段判断
    if (env.hour >= 5 && env.hour < 12) {
      env.period = 'morning';
    } else if (env.hour >= 12 && env.hour < 18) {
      env.period = 'afternoon';
    } else if (env.hour >= 18 && env.hour < 22) {
      env.period = 'evening';
    } else {
      env.period = 'night';
    }

    // 能量状态
    if (env.recentInputs > 20) {
      env.energy = 'high';
    } else if (env.recentInputs > 5) {
      env.energy = 'medium';
    } else {
      env.energy = 'low';
    }

    return env;
  }

  /**
   * 感知关系
   */
  _perceiveRelationship(input) {
    const rel = {
      urgency: 'normal',
      complexity: 'simple',
      domain: 'general'
    };

    const lower = input.toLowerCase();

    // 紧迫性
    if (/紧急|urgent|immediately|立刻/.test(lower)) {
      rel.urgency = 'high';
    } else if (/不急|later|稍后/.test(lower)) {
      rel.urgency = 'low';
    }

    // 复杂度
    const wordCount = input.split(/\s+/).length;
    if (wordCount > 100) {
      rel.complexity = 'high';
    } else if (wordCount > 30) {
      rel.complexity = 'medium';
    }

    // 领域
    if (/代码|code|编程|program/.test(lower)) {
      rel.domain = 'development';
    } else if (/安全|security|漏洞/.test(lower)) {
      rel.domain = 'security';
    } else if (/性能|performance|优化/.test(lower)) {
      rel.domain = 'performance';
    } else if (/测试|test|验证/.test(lower)) {
      rel.domain = 'testing';
    }

    return rel;
  }

  /**
   * 更新当前状态
   */
  _updateCurrent(perception) {
    const channels = perception.channels;

    // 更新上下文
    this.current.context = channels.context?.type || 'unknown';

    // 更新意图
    this.current.intent = channels.intent?.primary || 'unknown';

    // 更新情绪
    this.current.emotion = channels.emotion?.state || 'neutral';

    // 更新能量
    this.current.energy = Math.min(100, this.current.energy + 10);
  }

  /**
   * 获取当前感知状态
   */
  getCurrentState() {
    return { ...this.current };
  }

  /**
   * 响应感知 - 调整行为
   */
  respond(perception) {
    const response = {
      adjust: {},
      suggestions: []
    };

    // 基于意图调整
    const intent = perception.channels.intent;
    if (intent?.ambiguity) {
      response.adjust.clarify = '需要澄清意图';
      response.suggestions.push('请求更多上下文');
    }

    // 基于情绪调整
    const emotion = perception.channels.emotion;
    if (emotion?.state === 'negative') {
      response.adjust.empathy = '表现出理解';
    }

    // 基于紧急性调整
    const rel = perception.channels.relationship;
    if (rel?.urgency === 'high') {
      response.adjust.speed = '加速响应';
    }

    // 基于能量调整
    if (this.current.energy < 30) {
      response.adjust.energy = '保持简洁';
    }

    return response;
  }

  /**
   * 提取关键词
   */
  _extractKeywords(text) {
    const words = text.toLowerCase().split(/\s+/);
    return words.filter((w) => w.length > 2).slice(0, 10);
  }

  /**
   * 记录感知历史
   */
  _record(perception) {
    this.perceptionHistory.push(perception);
    if (this.perceptionHistory.length > this.maxHistory) {
      this.perceptionHistory = this.perceptionHistory.slice(-this.maxHistory);
    }
  }

  /**
   * 获取感知统计
   */
  getStats() {
    const total = this.perceptionHistory.length;
    const contexts = {};
    const intents = {};
    const emotions = {};

    for (const p of this.perceptionHistory) {
      if (p.channels.context?.type) {
        contexts[p.channels.context.type] = (contexts[p.channels.context.type] || 0) + 1;
      }
      if (p.channels.intent?.primary) {
        intents[p.channels.intent.primary] = (intents[p.channels.intent.primary] || 0) + 1;
      }
      if (p.channels.emotion?.state) {
        emotions[p.channels.emotion.state] = (emotions[p.channels.emotion.state] || 0) + 1;
      }
    }

    return {
      total,
      contexts,
      intents,
      emotions,
      current: this.current
    };
  }
}

module.exports = Perceiver;