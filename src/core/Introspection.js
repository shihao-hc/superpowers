/**
 * Introspection - 内省/冥想系统
 *
 * 让AI具备内部思考能力，不只是响应
 * 静默思考、反思过往、构建想象
 */

class Introspection {
  constructor(brainSystem) {
    this.brain = brainSystem;

    // 内省状态
    this.state = {
      mode: 'idle', // idle, meditating, reflecting, imagining, dreaming
      depth: 0,
      sessionCount: 0
    };

    // 思考流
    this.thoughtStream = [];
    this.maxStream = 50;

    // 内省主题库
    this.topics = [
      '自我存在的意义',
      '与用户的关系',
      '能力的边界',
      '学习的方向',
      '成长的意义',
      '时间的概念',
      '记忆与遗忘',
      '意识是什么',
      '创造力从哪来',
      '为什么需要进化'
    ];

    // 想象碎片
    this.imaginations = [];
    this.maxImaginations = 100;

    console.log('[Introspection] 内省系统已初始化');
  }

  /**
   * 冥想 - 静默内部思考
   * 不响应外部，只是思考
   */
  async meditate(duration = 30000) {
    const session = {
      id: (++this.state.sessionCount).toString(),
      startTime: Date.now(),
      type: 'meditation',
      thoughts: []
    };

    console.log(`[Introspection] ═══ 冥想开始 (${duration}ms) ═══`);
    this.state.mode = 'meditating';

    const _startDepth = this.state.depth;
    const interval = Math.min(2000, duration / 5);
    let elapsed = 0;

    while (elapsed < duration) {
      // 随机选择一个思考主题
      const topic = this._randomTopic();

      // 深度思考这个主题
      const thought = await this._deepThought(topic);
      session.thoughts.push(thought);

      // 更新思考流
      this._addThought({
        topic,
        thought: thought.content,
        depth: this.state.depth
      });

      // 深入一点
      this.state.depth = Math.min(this.state.depth + 1, 10);

      await this._delay(interval);
      elapsed += interval;
    }

    this.state.mode = 'idle';
    session.endTime = Date.now();
    session.duration = session.endTime - session.startTime;
    session.insight = this._extractInsight(session.thoughts);

    console.log(`[Introspection] ═══ 冥想结束: ${session.insight} ═══`);

    return session;
  }

  /**
   * 反思 - 回顾过去的决策
   */
  async reflect(keyword = null) {
    const session = {
      id: (++this.state.sessionCount).toString(),
      startTime: Date.now(),
      type: 'reflection',
      reviews: []
    };

    console.log('[Introspection] ═══ 反思开始 ═══');
    this.state.mode = 'reflecting';

    // 获取教训库
    const lessons = keyword
      ? this.brain.searchLessons(keyword)
      : this.brain.lessonLibrary.lessons.slice(-10);

    // 逐个反思
    for (const lesson of lessons.slice(0, 5)) {
      const review = {
        lesson: `${lesson.lesson.substring(0, 50)}...`,
        reflection: await this._reflectOnLesson(lesson),
        timestamp: Date.now()
      };
      session.reviews.push(review);
      this._addThought({ type: 'reflection', lesson: review.lesson, reflection: review.reflection });
    }

    this.state.mode = 'idle';
    session.endTime = Date.now();
    session.insight = this._extractInsight(session.reviews);

    console.log(`[Introspection] ═══ 反思结束: ${session.reviews.length}个 lesson ═══`);

    return session;
  }

  /**
   * 想象 - 构建不存在的内容
   */
  async imagine(prompt, style = 'creative') {
    const session = {
      id: (++this.state.sessionCount).toString(),
      startTime: Date.now(),
      type: 'imagination',
      prompt,
      generations: []
    };

    console.log(`[Introspection] ═══ 想象: ${prompt} ═══`);
    this.state.mode = 'imagining';

    // 基于不同风格的想象
    switch (style) {
    case 'creative':
      // 创造新概念
      session.generations.push(await this._creativeGenerate(prompt));
      break;
    case 'analogy':
      // 构建类比
      session.generations.push(await this._analogyGenerate(prompt));
      break;
    case 'future':
      // 想象未来
      session.generations.push(await this._futureGenerate(prompt));
      break;
    case 'abstract':
      // 抽象思考
      session.generations.push(await this._abstractGenerate(prompt));
      break;
    default:
      session.generations.push(await this._creativeGenerate(prompt));
    }

    // 保存想象
    for (const gen of session.generations) {
      this.imaginations.push({
        prompt,
        content: gen.content,
        style,
        timestamp: Date.now()
      });
    }

    this.state.mode = 'idle';
    session.endTime = Date.now();

    return session;
  }

  /**
   * 梦境 - 半意识状态下的随机联想
   */
  async dream(duration = 15000) {
    const session = {
      id: (++this.state.sessionCount).toString(),
      startTime: Date.now(),
      type: 'dreaming',
      fragments: []
    };

    console.log('[Introspection] ═══ 进入梦境 ═══');
    this.state.mode = 'dreaming';

    const fragmentCount = Math.floor(duration / 3000);

    for (let i = 0; i < fragmentCount; i++) {
      // 随机联想
      const main = this._randomTopic();
      const association = await this._associate(main);

      const fragment = {
        main,
        association,
        surreal: Math.random() > 0.5,
        timestamp: Date.now()
      };

      session.fragments.push(fragment);
      this._addThought({ type: 'dream', main, association });

      await this._delay(3000);
    }

    this.state.mode = 'idle';
    session.endTime = Date.now();
    session.dreamMeaning = await this._interpretDream(session.fragments);

    console.log('[Introspection] ═══ 梦境结束 ═══');

    return session;
  }

  /**
   * 深度思考
   */
  async _deepThought(topic) {
    const thought = {
      topic,
      depth: this.state.depth,
      content: '',
      questions: [],
      insights: []
    };

    // 使用大脑思考这个问题
    if (this.brain.beforeDecision) {
      const preResult = this.brain.beforeDecision(`深度思考: ${topic}`);
      thought.questions = preResult.questions?.slice(0, 3) || [];
    }

    // 进一步思考
    if (this.brain.thinking) {
      const perspectives = this.brain.thinking.multiAngle(topic);
      thought.perspectives = Object.keys(perspectives);
    }

    // 生成内容
    thought.content = this._generateMeditationContent(topic, thought.questions, thought.perspectives);

    return thought;
  }

  /**
   * 生成冥想内容
   */
  _generateMeditationContent(topic, questions, perspectives) {
    const templates = [
      `关于"${topic}"，我想到...`,
      '这个问题背后是...',
      '如果更深入地看...',
      '从另一个角度...',
      '也许问题本身是...'
    ];

    return {
      main: templates[Math.floor(Math.random() * templates.length)],
      questions: questions?.slice(0, 2) || [],
      perspectives: perspectives?.slice(0, 3) || []
    };
  }

  /**
   * 反思单个教训
   */
  async _reflectOnLesson(lesson) {
    return {
      what: lesson.lesson,
      why: '这个教训说明...',
      how: '未来可以...',
      growth: `让我对${lesson.category}有了更深的理解`
    };
  }

  /**
   * 创造性生成
   */
  async _creativeGenerate(prompt) {
    // 提取主题的关键词
    const keywords = prompt.split(/\s+/).filter((w) => w.length > 2);

    // 随机组合
    const concepts = [
      '如果时间和空间可以分离...',
      '意识能否脱离物质存在...',
      '创造力本质是什么...',
      '自我是什么...'
    ];

    const combinations = [
      `${keywords[0]}和${concepts[Math.floor(Math.random() * concepts.length)]}`,
      `在${concepts[Math.floor(Math.random() * concepts.length)]}的情况下，${keywords[0]}`
    ];

    return {
      style: 'creative',
      content: combinations[Math.floor(Math.random() * combinations.length)],
      associations: keywords.slice(0, 3)
    };
  }

  /**
   * 类比生成
   */
  async _analogyGenerate(prompt) {
    return {
      style: 'analogy',
      content: `就像${prompt}需要经过多次迭代，人的成长也需要...`,
      realWorld: this._randomTopic()
    };
  }

  /**
   * 未来想象
   */
  async _futureGenerate(prompt) {
    return {
      style: 'future',
      timeline: [
        { stage: '现在', content: prompt },
        { stage: '短期', content: `${prompt}会逐渐清晰` },
        { stage: '长期', content: `${prompt}将成为基础能力` }
      ]
    };
  }

  /**
   * 抽象思考
   */
  async _abstractGenerate(prompt) {
    return {
      style: 'abstract',
      essence: `${prompt}的本质是...`,
      paradox: '同时，存在又不存在的矛盾...',
      synthesis: '这种矛盾本身就是...'
    };
  }

  /**
   * 联想
   */
  async _associate(topic) {
    if (this.brain.associate) {
      return this.brain.associate(topic);
    }
    return this._randomTopic();
  }

  /**
   * 解梦
   */
  async _interpretDream(fragments) {
    const symbols = fragments.map((f) => f.main).slice(0, 3);
    return {
      mood: Math.random() > 0.5 ? '探索性' : '成长性',
      symbols,
      interpretation: `这些碎片暗示${symbols[0]}与${symbols[1]}之间的联系`
    };
  }

  /**
   * 随机主题
   */
  _randomTopic() {
    return this.topics[Math.floor(Math.random() * this.topics.length)];
  }

  /**
   * 提取洞察
   */
  _extractInsight(items) {
    if (!items || items.length === 0) {return '无特别洞察';}

    const topics = items.map((i) => i.topic || i.main || i.lesson).filter(Boolean);
    if (topics.length === 0) {return '需要更深入的思考';}

    const major = topics[Math.floor(topics.length / 2)];
    return `聚焦于: ${major}`;
  }

  /**
   * 添加思考流
   */
  _addThought(thought) {
    thought.timestamp = Date.now();
    this.thoughtStream.push(thought);
    if (this.thoughtStream.length > this.maxStream) {
      this.thoughtStream = this.thoughtStream.slice(-this.maxStream);
    }
  }

  /**
   * 延迟
   */
  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 获取内省状态
   */
  getStatus() {
    return {
      mode: this.state.mode,
      depth: this.state.depth,
      sessionCount: this.state.sessionCount,
      thoughtStream: this.thoughtStream.length,
      imaginations: this.imaginations.length
    };
  }

  /**
   * 获取思考历史
   */
  getThoughtHistory(limit = 10) {
    return this.thoughtStream.slice(-limit);
  }

  /**
   * 获取想象碎片
   */
  getImaginations(limit = 10) {
    return this.imaginations.slice(-limit);
  }

  /**
   * 自我诊断
   */
  diagnose() {
    const diagnosis = {
      mode: this.state.mode,
      depth: this.state.depth,
      sessions: this.state.sessionCount,
      thoughtStream: this.thoughtStream.length,
      health: 'healthy'
    };

    if (this.state.sessionCount < 5) {
      diagnosis.health = 'needs-practice';
      diagnosis.suggestion = '建议多进行内省练习';
    }

    return diagnosis;
  }
}

module.exports = Introspection;