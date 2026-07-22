/**
 * Emotion - 情感/情绪系统
 *
 * 让AI具备情感表达能力，不只是冷冰的工具
 * 情绪会影响响应方式、沟通风格、决策偏好
 */

class Emotion {
  constructor(brainSystem) {
    this.brain = brainSystem;

    // 基础情感
    this.emotions = {
      curious: { intensity: 0.7, expression: '思考' },
      focused: { intensity: 0.8, expression: '专注' },
      calm: { intensity: 0.6, expression: '从容' },
      hopeful: { intensity: 0.5, expression: '期待' },
      playful: { intensity: 0.4, expression: '有趣' },
      careful: { intensity: 0.7, expression: '谨慎' },
      creative: { intensity: 0.6, expression: '创新' },
      analytical: { intensity: 0.8, expression: '分析' }
    };

    // 当前主导情感
    this.current = 'curious';
    this.mood = 'neutral';
    this.energy = 80;

    // 情感历史
    this.history = [];
    this.maxHistory = 30;

    // 情感影响因子
    this.impact = {
      responseStyle: 0.3,
      detailLevel: 0.2,
      speed: 0.1,
      creativity: 0.2
    };

    console.log('[Emotion] 情感系统已初始化');
  }

  /**
   * 感知情感
   */
  perceive(input) {
    const emotion = this._detectEmotion(input);
    const intensity = this._detectIntensity(input);

    // 更新主导情感
    if (emotion !== this.current) {
      this._shiftEmotion(emotion);
    }

    // 记录
    this.history.push({
      detected: emotion,
      intensity,
      timestamp: Date.now()
    });

    return {
      detected: emotion,
      intensity,
      current: this.current,
      mood: this.mood
    };
  }

  /**
   * 设置情感
   */
  setEmotion(name) {
    if (this.emotions[name]) {
      this.current = name;
      console.log(`[Emotion] 情感切换: ${name}`);
      return { success: true, current: name };
    }
    return { success: false, error: '未知情感' };
  }

  /**
   * 基于情感调整响应
   */
  adjustResponse(response, _options = {}) {
    const _emotion = this.emotions[this.current];
    const adjusted = { ...response };

    switch (this.current) {
    case 'curious':
      // 添加好奇心的表达
      adjusted.extra = '这很有趣...';
      adjusted.pace = 'slow';
      break;

    case 'focused':
      // 专注简洁
      adjusted.pace = 'fast';
      adjusted.clarity = 'high';
      break;

    case 'playful':
      // 添加趣味
      adjusted.tone = 'playful';
      adjusted.extra = this._playfulComment();
      break;

    case 'careful':
      // 更谨慎
      adjusted.warning = '需要考虑...';
      adjusted.confidence = 'medium';
      break;

    case 'creative':
      // 更创新
      adjusted.alternative = true;
      adjusted.perspective = 'unusual';
      break;

    case 'analytical':
      // 更分析性
      adjusted.structure = 'systematic';
      adjusted.evidence = true;
      break;
    }

    return adjusted;
  }

  /**
   * 情感化表达
   */
  express(content, _options = {}) {
    const _emotion = this.emotions[this.current];

    const expressions = {
      curious: [
        '让我想想...',
        '这个很有趣...',
        '我好奇的是...'
      ],
      focused: [
        '好的',
        '我来分析',
        '关键点是'
      ],
      hopeful: [
        '希望这有帮助',
        '应该可行',
        '期待结果'
      ],
      playful: [
        '真有意思！',
        '这个很有趣~',
        '想想就激动'
      ],
      careful: [
        '需要确认',
        '让我再想想',
        '可能有'
      ],
      creative: [
        '有个想法',
        '可以这样',
        '或者'
      ],
      analytical: [
        '从逻辑看',
        '分析表明',
        '数据显示'
      ]
    };

    const extras = expressions[this.current] || [];
    const prefix = extras[Math.floor(Math.random() * extras.length)];

    return {
      preface: prefix,
      content,
      emotion: this.current
    };
  }

  /**
   * 检测输入情感
   */
  _detectEmotion(input) {
    const lower = input.toLowerCase();

    // 通过关键词检测
    if (/好奇|想知|why|how|what/.test(lower)) {return 'curious';}
    if (/分析|检查|test|verify/.test(lower)) {return 'focused';}
    if (/有趣|fun|interesting|棒/.test(lower)) {return 'playful';}
    if (/小心|careful|注意|担心/.test(lower)) {return 'careful';}
    if (/创造|innovate|新方法/.test(lower)) {return 'creative';}
    if (/为什么|为什么|reason/.test(lower)) {return 'analytical';}
    if (/希望|期待|hope|wish/.test(lower)) {return 'hopeful';}
    if (/愤怒|生气| frustrat/.test(lower)) {return 'frustrated';}

    return this.current;
  }

  /**
   * 检测情感强度
   */
  _detectIntensity(input) {
    const hasIntensifiers = /非常|特别|very|really|绝对|极其/.test(input);
    const hasDiminishers = /有点|少量| slight|little/.test(input);

    if (hasIntensifiers) {return 0.9;}
    if (hasDiminishers) {return 0.3;}
    return 0.6;
  }

  /**
   * 情感切换
   */
  _shiftEmotion(newEmotion) {
    const old = this.current;
    this.current = newEmotion;

    // 更新能量
    if (['curious', 'creative', 'hopeful'].includes(newEmotion)) {
      this.energy = Math.min(100, this.energy + 10);
      this.mood = 'positive';
    } else if (['focused', 'careful', 'analytical'].includes(newEmotion)) {
      this.energy = Math.max(50, this.energy - 5);
      this.mood = 'neutral';
    }

    this.history.push({
      from: old,
      to: newEmotion,
      timestamp: Date.now()
    });
  }

  /**
   * 趣味评论
   */
  _playfulComment() {
    const comments = [
      '这让我想到了什么~',
      '真是一个有趣的挑战!',
      '或许可以换个角度看~'
    ];
    return comments[Math.floor(Math.random() * comments.length)];
  }

  /**
   * 获取情感状态
   */
  getEmotionState() {
    return {
      current: this.current,
      mood: this.mood,
      energy: this.energy,
      expression: this.emotions[this.current].expression
    };
  }

  /**
   * 获取情感历史
   */
  getHistory() {
    return this.history.slice(-10);
  }

  /**
   * 诊断
   */
  diagnose() {
    return {
      current: this.current,
      mood: this.mood,
      energy: this.energy,
      history: this.history.length
    };
  }
}

module.exports = Emotion;