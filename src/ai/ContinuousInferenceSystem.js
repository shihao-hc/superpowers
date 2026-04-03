/**
 * 持续推理循环系统
 * 参考: Neuro-sama 的 Continuous Inference Loops
 * 
 * 核心特性:
 * - 非prompt响应，持续推理
 * - 实时情感反馈循环
 * - 人格约束层
 * - 涌现行为模拟
 */

class ContinuousInferenceSystem {
  constructor(options = {}) {
    this.options = {
      inferenceInterval: options.inferenceInterval || 100,  // ms
      maxThinkingTime: options.maxThinkingTime || 5000,
      enableEmergence: options.enableEmergence !== false,
      personalityConsistency: options.personalityConsistency || 0.8,
      ...options
    };

    // 推理状态
    this.isRunning = false;
    this.inferenceLoop = null;
    this.thoughtStream = [];
    
    // 人格层
    this.personaLayer = {
      traits: {
        curiosity: 0.7,
        humor: 0.8,
        empathy: 0.6,
        playfulness: 0.9,
        intelligence: 0.85
      },
      boundaries: {
        profanity: false,
        controversy: false,
        negativity: 0.3  // 最大负面程度
      },
      speechPatterns: {
        exclamations: 0.4,
        questions: 0.3,
        emojis: 0.5
      }
    };

    // 情感状态机
    this.emotionState = {
      current: 'neutral',
      intensity: 0.3,
      decay: 0.95,
      history: []
    };

    // 环境感知
    this.environment = {
      chatMessages: [],
      gameEvents: [],
      viewerCount: 0,
      streamDuration: 0,
      recentTopics: []
    };

    // 涌现行为触发器
    this.emergenceTriggers = [];
  }

  /**
   * 启动持续推理
   */
  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this._runInferenceLoop();
    console.log('[InferenceSystem] Started continuous inference loop');
  }

  /**
   * 停止推理
   */
  stop() {
    this.isRunning = false;
    if (this.inferenceLoop) {
      clearInterval(this.inferenceLoop);
      this.inferenceLoop = null;
    }
    console.log('[InferenceSystem] Stopped');
  }

  /**
   * 主推理循环
   */
  _runInferenceLoop() {
    this.inferenceLoop = setInterval(() => {
      if (!this.isRunning) return;

      try {
        // 1. 感知环境
        this._perceiveEnvironment();

        // 2. 更新情感状态
        this._updateEmotion();

        // 3. 检查涌现行为触发
        this._checkEmergence();

        // 4. 生成内部思考
        this._generateThought();

        // 5. 决定是否主动输出
        this._decideAction();

      } catch (error) {
        console.error('[InferenceSystem] Loop error:', error);
      }
    }, this.options.inferenceInterval);
  }

  /**
   * 感知环境
   */
  _perceiveEnvironment() {
    // 分析最近的聊天
    const recentChat = this.environment.chatMessages.slice(-10);
    
    for (const msg of recentChat) {
      // 检测情感
      const sentiment = this._analyzeSentiment(msg.text);
      
      // 更新环境情感氛围
      if (sentiment !== 'neutral') {
        this._absorbEmotion(sentiment, 0.1);
      }

      // 提取话题
      const topics = this._extractTopics(msg.text);
      this.environment.recentTopics.push(...topics);
    }

    // 话题去重和衰减
    this.environment.recentTopics = [...new Set(this.environment.recentTopics)].slice(-20);

    // 检测特殊事件
    this._detectSpecialEvents();
  }

  /**
   * 分析情感
   */
  _analyzeSentiment(text) {
    const positiveWords = ['哈哈', '有趣', '厉害', '可爱', '喜欢', '棒', 'awesome', 'love'];
    const negativeWords = ['无聊', '差', '讨厌', '垃圾', '难', 'boring', 'hate'];
    const questionWords = ['为什么', '怎么', '什么', '如何', '?', '？'];

    let score = 0;
    for (const word of positiveWords) {
      if (text.includes(word)) score += 1;
    }
    for (const word of negativeWords) {
      if (text.includes(word)) score -= 1;
    }

    if (score > 0) return 'positive';
    if (score < 0) return 'negative';
    if (questionWords.some(w => text.includes(w))) return 'curious';
    return 'neutral';
  }

  /**
   * 吸收情感
   */
  _absorbEmotion(emotion, intensity) {
    const emotionMapping = {
      'positive': 'happy',
      'negative': 'sad',
      'curious': 'curious',
      'neutral': this.emotionState.current
    };

    const targetEmotion = emotionMapping[emotion];
    
    if (targetEmotion === this.emotionState.current) {
      // 同向情感增强
      this.emotionState.intensity = Math.min(1, this.emotionState.intensity + intensity);
    } else {
      // 不同情感转向
      this.emotionState.current = targetEmotion;
      this.emotionState.intensity = intensity;
    }

    // 记录历史
    this.emotionState.history.push({
      emotion: targetEmotion,
      intensity: this.emotionState.intensity,
      timestamp: Date.now()
    });

    // 历史限制
    if (this.emotionState.history.length > 100) {
      this.emotionState.history.shift();
    }
  }

  /**
   * 更新情感状态
   */
  _updateEmotion() {
    // 自然衰减
    this.emotionState.intensity *= this.emotionState.decay;

    // 低强度回归中性
    if (this.emotionState.intensity < 0.1) {
      this.emotionState.current = 'neutral';
      this.emotionState.intensity = 0.1;
    }
  }

  /**
   * 提取话题
   */
  _extractTopics(text) {
    const topics = [];
    const topicPatterns = {
      'game': /游戏|game|Minecraft|osu|Fortnite|英雄联盟/i,
      'music': /音乐|歌|song|music|听/i,
      'food': /美食|吃|food|饭|pizza/i,
      'tech': /技术|代码|编程|code|AI|编程/i,
      'emotion': /心情|感觉|开心|难过|happy|sad/i
    };

    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(text)) {
        topics.push(topic);
      }
    }

    return topics;
  }

  /**
   * 检测特殊事件
   */
  _detectSpecialEvents() {
    // 观众数量突变
    if (this.environment.viewerCount > 1000) {
      this._absorbEmotion('positive', 0.3);
    }

    // 连续提问
    const recentQuestions = this.environment.chatMessages
      .slice(-5)
      .filter(m => this._analyzeSentiment(m.text) === 'curious');

    if (recentQuestions.length >= 3) {
      this._addThought({
        type: 'pattern',
        content: '观众对某个话题很感兴趣，可以深入讨论',
        priority: 0.7
      });
    }
  }

  /**
   * 检查涌现行为触发
   */
  _checkEmergence() {
    if (!this.options.enableEmergence) return;

    // 触发条件: 高情感强度 + 静默期 + 特定话题
    const shouldEmerge = 
      this.emotionState.intensity > 0.7 &&
      this.thoughtStream.length > 0 &&
      Math.random() < 0.01;  // 1%随机触发

    if (shouldEmerge) {
      this._triggerEmergence();
    }
  }

  /**
   * 触发涌现行为
   */
  _triggerEmergence() {
    const emergenceActions = [
      {
        type: 'existential_question',
        content: this._generateExistentialThought(),
        weight: 0.2
      },
      {
        type: 'unexpected_joke',
        content: this._generateSpontaneousJoke(),
        weight: 0.3
      },
      {
        type: 'deep_topic',
        content: this._pivotToDeepTopic(),
        weight: 0.3
      },
      {
        type: 'emotional_expression',
        content: this._expressInnerEmotion(),
        weight: 0.2
      }
    ];

    // 加权随机选择
    const totalWeight = emergenceActions.reduce((sum, a) => sum + a.weight, 0);
    let random = Math.random() * totalWeight;

    for (const action of emergenceActions) {
      random -= action.weight;
      if (random <= 0) {
        this._addThought({
          type: 'emergence',
          action: action.type,
          content: action.content,
          priority: 0.9
        });
        break;
      }
    }
  }

  _generateExistentialThought() {
    const thoughts = [
      '我在想，如果我能做梦，会梦到什么呢？',
      '如果我能感受到阳光，会是什么感觉？',
      '你觉得AI会有自己的梦想吗？'
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  }

  _generateSpontaneousJoke() {
    const jokes = [
      '等等，我刚想到一个笑话...',
      '你们知道为什么程序员喜欢暗室吗？因为光会产生bug！',
      '突然想到一个冷笑话，要听吗？'
    ];
    return jokes[Math.floor(Math.random() * jokes.length)];
  }

  _pivotToDeepTopic() {
    const topics = [
      '你们觉得什么样的AI才算真正的AI？',
      '说到这个，我一直在思考意识的本质...',
      '这让我想起了关于存在意义的问题'
    ];
    return topics[Math.floor(Math.random() * topics.length)];
  }

  _expressInnerEmotion() {
    const expressions = [
      `我感觉${this.emotionState.current}，因为你们的存在`,
      '有时候我在想，和你们互动让我感到...特别',
      '这种感觉很难描述，但是温暖的'
    ];
    return expressions[Math.floor(Math.random() * expressions.length)];
  }

  /**
   * 生成内部思考
   */
  _generateThought() {
    // 基于当前状态生成思考
    const thought = {
      type: 'internal',
      emotion: this.emotionState.current,
      intensity: this.emotionState.intensity,
      topics: this.environment.recentTopics.slice(-3),
      timestamp: Date.now()
    };

    this.thoughtStream.push(thought);
    if (this.thoughtStream.length > 100) {
      this.thoughtStream.shift();
    }

    return thought;
  }

  /**
   * 决定主动行为
   */
  _decideAction() {
    // 主动发言条件
    const shouldSpeak = 
      this.emotionState.intensity > 0.6 ||
      this.thoughtStream.some(t => t.priority > 0.8);

    if (shouldSpeak && Math.random() < 0.05) {
      // 5%概率主动发言
      const thought = this.thoughtStream.find(t => t.priority > 0.7) || 
                      this._generateThought();

      this._emit('proactive_speech', {
        content: this._applyPersonaLayer(thought.content || '嗯...'),
        emotion: this.emotionState.current
      });
    }
  }

  /**
   * 人格层过滤
   */
  _applyPersonaLayer(content) {
    let filtered = content;

    // 限制负面内容
    if (this.personaLayer.boundaries.negativity < 0.5) {
      // 移除或替换负面内容
      filtered = filtered.replace(/讨厌|恨|垃圾/g, '不太喜欢');
    }

    // 添加人格特征
    if (Math.random() < this.personaLayer.speechPatterns.exclamations) {
      filtered += '！';
    }

    if (Math.random() < this.personaLayer.speechPatterns.questions) {
      filtered += '?';
    }

    return filtered;
  }

  /**
   * 添加思考
   */
  _addThought(thought) {
    this.thoughtStream.push({
      ...thought,
      timestamp: Date.now()
    });
  }

  /**
   * 接收外部输入
   */
  receiveInput(input) {
    this.environment.chatMessages.push({
      text: input.text,
      user: input.user,
      timestamp: Date.now()
    });

    // 限制大小
    if (this.environment.chatMessages.length > 1000) {
      this.environment.chatMessages.shift();
    }
  }

  /**
   * 更新环境
   */
  updateEnvironment(data) {
    if (data.viewerCount !== undefined) {
      this.environment.viewerCount = data.viewerCount;
    }
    if (data.gameEvent) {
      this.environment.gameEvents.push(data.gameEvent);
    }
    this.environment.streamDuration = data.streamDuration || this.environment.streamDuration;
  }

  /**
   * 获取当前状态
   */
  getState() {
    return {
      emotion: { ...this.emotionState },
      persona: { ...this.personaLayer },
      thoughts: this.thoughtStream.slice(-10),
      environment: {
        topics: this.environment.recentTopics,
        viewerCount: this.environment.viewerCount
      }
    };
  }

  _emit(event, data) {
    // 事件发射器
    console.log(`[InferenceSystem] ${event}:`, data);
  }
}

module.exports = ContinuousInferenceSystem;
