/**
 * GameInteractionSystem - 游戏互动/解说系统
 * 
 * 功能:
 * - 屏幕捕获和分析
 * - 游戏事件检测
 * - AI 实时解说
 * - 情绪反应系统
 * - 游戏数据统计
 */

class ScreenCapture {
  constructor(options = {}) {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.isCapturing = false;
    this.captureInterval = null;
    this.captureRate = options.captureRate || 1000; // ms
    this.width = options.width || 640;
    this.height = options.height || 360;
    this.onFrame = options.onFrame || (() => {});
    this.onStop = options.onStop || (() => {});
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      this.video.autoplay = true;
      this.video.playsInline = true;

      await this.video.play();

      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

      this.isCapturing = true;
      this.startCaptureLoop();

      // Handle stream end
      this.stream.getVideoTracks()[0].onended = () => {
        this.stop();
      };

      return true;
    } catch (error) {
      console.error('Screen capture failed:', error);
      return false;
    }
  }

  startCaptureLoop() {
    if (!this.isCapturing) return;

    this.captureInterval = setInterval(() => {
      if (this.video && this.video.readyState === 4) {
        this.captureFrame();
      }
    }, this.captureRate);
  }

  captureFrame() {
    if (!this.ctx || !this.video) return null;

    this.ctx.drawImage(
      this.video,
      0, 0,
      this.video.videoWidth,
      this.video.videoHeight,
      0, 0,
      this.width,
      this.height
    );

    const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
    const frameData = {
      imageData,
      width: this.width,
      height: this.height,
      timestamp: Date.now()
    };

    this.onFrame(frameData);
    return frameData;
  }

  stop() {
    this.isCapturing = false;

    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }

    this.onStop();
  }

  getFrameBase64() {
    if (!this.canvas) return null;
    return this.canvas.toDataURL('image/jpeg', 0.8);
  }

  isActive() {
    return this.isCapturing;
  }
}

class GameEventDetector {
  constructor(options = {}) {
    this.gamePatterns = {
      pokemon: {
        name: /野生的|遇到了|使用了|获得|进化|道馆|训练家/,
        capture: /丢出了|捕获|精灵球|gotcha/,
        battle: /战斗|攻击|防御|受伤|胜利|失败/,
        level: /等级|Lv\.|升级|提升/
      },
      minecraft: {
        mining: /挖|矿|石|铁|金|钻石|采集/,
        building: /建造|搭建|放置|方块/,
        combat: /攻击|怪物|僵尸|苦力怕|骷髅/,
        crafting: /合成|制作|工作台|物品/
      },
      genshin: {
        wish: /祈愿|抽卡|五星|四星|角色/,
        combat: /战斗|元素|技能|爆发|伤害/,
        explore: /探索|任务|秘境|宝箱/
      },
      general: {
        victory: /胜利|赢了|成功|通关|完成/,
        defeat: /失败|输了|死亡|游戏结束/,
        exciting: /哇|太厉害|精彩|绝了/,
        funny: /哈哈|搞笑|逗|有趣/
      }
    };

    this.gameStates = {
      pokemon: { inBattle: false, currentPokemon: null, opponent: null },
      minecraft: { health: 20, inventory: [], location: 'world' },
      genshin: { party: [], currentCharacter: null, location: '' }
    };

    this.eventHistory = [];
    this.onEvent = options.onEvent || (() => {});
    this.lastEventTime = 0;
    this.eventCooldown = options.eventCooldown || 2000;
  }

  analyzeFrame(frameData) {
    const events = [];
    const now = Date.now();

    if (now - this.lastEventTime < this.eventCooldown) {
      return events;
    }

    // Color analysis for basic detection
    const colors = this.analyzeColors(frameData.imageData);
    
    // Detect battle scenes (red/orange dominant)
    if (colors.red > 0.3 && colors.dominant === 'red') {
      events.push({
        type: 'battle',
        confidence: colors.red,
        timestamp: now
      });
    }

    // Detect victory (bright/yellow dominant)
    if (colors.yellow > 0.25 || colors.brightness > 0.7) {
      events.push({
        type: 'victory',
        confidence: Math.max(colors.yellow, colors.brightness),
        timestamp: now
      });
    }

    // Detect defeat (dark/blue dominant)
    if (colors.blue > 0.3 && colors.brightness < 0.4) {
      events.push({
        type: 'defeat',
        confidence: colors.blue,
        timestamp: now
      });
    }

    // Emit events
    events.forEach(event => {
      if (event.confidence > 0.3) {
        this.eventHistory.push(event);
        this.onEvent(event);
        this.lastEventTime = now;
      }
    });

    return events;
  }

  analyzeColors(imageData) {
    const data = imageData.data;
    const total = data.length / 4;
    let r = 0, g = 0, b = 0, brightness = 0;

    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      brightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }

    r = r / total / 255;
    g = g / total / 255;
    b = b / total / 255;
    brightness = brightness / total / 255;

    // Determine dominant color
    let dominant = 'neutral';
    if (r > g && r > b) dominant = 'red';
    else if (g > r && g > b) dominant = 'green';
    else if (b > r && b > g) dominant = 'blue';
    else if (r > 0.4 && g > 0.4) dominant = 'yellow';

    return {
      red: r,
      green: g,
      blue: b,
      brightness,
      dominant,
      yellow: Math.min(r, g)
    };
  }

  analyzeText(text) {
    const events = [];
    const textLower = text.toLowerCase();

    for (const [game, patterns] of Object.entries(this.gamePatterns)) {
      for (const [eventType, pattern] of Object.entries(patterns)) {
        if (pattern.test(text)) {
          events.push({
            type: eventType,
            game,
            text,
            timestamp: Date.now()
          });
        }
      }
    }

    return events;
  }

  getRecentEvents(count = 10) {
    return this.eventHistory.slice(-count);
  }

  clearHistory() {
    this.eventHistory = [];
  }
}

class CommentaryGenerator {
  constructor(personality = '狐九') {
    this.personality = personality;
    this.commentaryTemplates = {
      battle: {
        '狐九': [
          '哇！战斗开始啦！加油加油~',
          '这个技能好厉害！(◕‿◕)',
          '对手也不弱呢，要小心哦~',
          '漂亮！反击成功！嘿嘿~'
        ],
        '艾利': [
          '战斗分析：攻击效率正常。',
          '注意对手的动作模式。',
          '建议使用属性克制技能。',
          '战斗评估：有利。'
        ],
        '博士': [
          '从数据来看，这是一个有趣的战术选择。',
          '这个招式的威力系数值得研究。',
          '有趣，这种对战策略在文献中有记载。',
          '让我记录一下这个对战数据。'
        ],
        '小埋': [
          '哇哇哇！战斗好激烈呀~(≧▽≦)',
          '这个技能太帅了吧！',
          '小埋也好想参加战斗！',
          '主人加油！小埋支持你！'
        ]
      },
      victory: {
        '狐九': [
          '太棒啦！胜利啦！开心~',
          '嘿嘿，果然是最强的！',
          '好厉害！我早就知道能赢！',
          '庆祝庆祝~撒花花~✨'
        ],
        '艾利': [
          '任务完成。效率评估：优秀。',
          '符合预期的结果。',
          '数据验证成功。',
          '胜利。'
        ]
      },
      defeat: {
        '狐九': [
          '呜呜...输了吗...没关系下次再来！',
          '失败是成功之母嘛~(´;ω;`)',
          '不要灰心！下次一定赢回来！',
          '我会一直陪着你的~'
        ],
        '艾利': [
          '分析失败原因...',
          '建议调整策略。',
          '这是学习的机会。',
          '数据已记录。'
        ]
      },
      funny: {
        '狐九': [
          '哈哈哈！笑死我了！',
          '这个太搞笑了！',
          '噗哈哈哈~不行了~',
          '笑到肚子疼~'
        ],
        '博士': [
          '从学术角度来说，这确实很有趣。',
          '这值得作为案例研究。',
          '意外的发现。',
          '有趣的现象。'
        ]
      },
      thinking: {
        '狐九': [
          '嗯...让我想想...',
          '这个有点难呢...',
          '我在思考对策...',
          '嗯嗯，有道理~'
        ],
        '博士': [
          '这是一个值得深入研究的问题。',
          '让我分析一下数据。',
          '需要更多研究。',
          '从理论上来说...'
        ]
      }
    };
  }

  generateCommentary(eventType, context = {}) {
    const templates = this.commentaryTemplates[eventType];
    if (!templates) return this.generateGenericComment(eventType);

    const personalityTemplates = templates[this.personality] || templates['狐九'];
    if (!personalityTemplates) return '加油！';

    // Random selection
    const index = Math.floor(Math.random() * personalityTemplates.length);
    let comment = personalityTemplates[index];

    // Add context if available
    if (context.item) {
      comment += ` (${context.item})`;
    }
    if (context.damage) {
      comment += ` 伤害: ${context.damage}`;
    }

    return comment;
  }

  generateGenericComment(eventType) {
    const genericComments = {
      '': ['嗯...', '有趣~', '继续吧~', '加油！'],
      default: ['我在看呢~', '加油加油！', '嘿嘿~', '有意思~']
    };
    return (genericComments[eventType] || genericComments.default)[0];
  }

  setPersonality(personality) {
    this.personality = personality;
  }
}

class GameInteractionSystem {
  constructor(character, options = {}) {
    this.character = character;
    this.emotionSystem = options.emotionSystem;
    this.tts = options.tts;
    
    this.screenCapture = new ScreenCapture({
      captureRate: options.captureRate || 2000,
      onFrame: (frame) => this.handleFrame(frame),
      onStop: () => this.handleCaptureStop()
    });

    this.eventDetector = new GameEventDetector({
      eventCooldown: options.eventCooldown || 3000,
      onEvent: (event) => this.handleGameEvent(event)
    });

    this.commentary = new CommentaryGenerator(
      character?.currentPersonality || '狐九'
    );

    this.isCommentating = false;
    this.commentaryQueue = [];
    this.commentaryInterval = null;
    this.commentaryRate = options.commentaryRate || 8000; // ms
    
    this.stats = {
      eventsDetected: 0,
      commentariesGenerated: 0,
      sessionStartTime: null,
      gameEvents: {}
    };

    this.voiceEnabled = options.voiceEnabled !== false;
  }

  async start() {
    const success = await this.screenCapture.start();
    if (success) {
      this.isCommentating = true;
      this.stats.sessionStartTime = Date.now();
      this.startCommentaryLoop();
      
      // Initial greeting
      this.addCommentary('开始观看游戏！让我来解说吧~');
      
      return true;
    }
    return false;
  }

  stop() {
    this.isCommentating = false;
    this.screenCapture.stop();
    
    if (this.commentaryInterval) {
      clearInterval(this.commentaryInterval);
      this.commentaryInterval = null;
    }

    // Final summary
    this.generateSessionSummary();
  }

  handleFrame(frameData) {
    if (!this.isCommentating) return;
    
    const events = this.eventDetector.analyzeFrame(frameData);
    this.stats.eventsDetected += events.length;
  }

  handleGameEvent(event) {
    if (!this.isCommentating) return;

    // Update stats
    this.stats.gameEvents[event.type] = (this.stats.gameEvents[event.type] || 0) + 1;
    
    // Generate commentary
    const comment = this.commentary.generateCommentary(event.type, {
      confidence: event.confidence
    });
    
    this.addCommentary(comment);

    // Update character emotion
    if (this.emotionSystem) {
      const emotionMap = {
        battle: 'excited',
        victory: 'happy',
        defeat: 'sad',
        funny: 'happy',
        thinking: 'curious'
      };
      this.emotionSystem.setEmotion(emotionMap[event.type] || 'curious');
    }
  }

  handleCaptureStop() {
    console.log('Screen capture stopped');
    this.isCommentating = false;
  }

  startCommentaryLoop() {
    this.commentaryInterval = setInterval(() => {
      if (!this.isCommentating) return;
      
      // Generate periodic commentary
      const recentEvents = this.eventDetector.getRecentEvents(3);
      
      if (recentEvents.length === 0) {
        // No recent events, generate general commentary
        const generalComments = [
          '我还在看哦~',
          '继续继续~',
          '加油加油！',
          '好期待接下来会发生什么~',
          '嘿嘿，看起来很顺利嘛~'
        ];
        const comment = generalComments[Math.floor(Math.random() * generalComments.length)];
        this.addCommentary(comment);
      }
    }, this.commentaryRate);
  }

  addCommentary(text) {
    this.stats.commentariesGenerated++;
    
    this.commentaryQueue.push({
      text,
      timestamp: Date.now()
    });

    // Keep only last 10
    if (this.commentaryQueue.length > 10) {
      this.commentaryQueue.shift();
    }

    // Speak if voice enabled
    if (this.voiceEnabled && this.tts) {
      this.tts.speak(text);
    }

    // Update character
    if (this.character) {
      this.character.speak(text);
    }
  }

  setCommentaryRate(rate) {
    this.commentaryRate = rate;
    if (this.commentaryInterval) {
      this.startCommentaryLoop(); // Restart with new rate
    }
  }

  setVoiceEnabled(enabled) {
    this.voiceEnabled = enabled;
  }

  setPersonality(personality) {
    this.commentary.setPersonality(personality);
  }

  getStats() {
    const duration = this.stats.sessionStartTime 
      ? (Date.now() - this.stats.sessionStartTime) / 1000 
      : 0;

    return {
      ...this.stats,
      sessionDuration: `${Math.floor(duration)}s`,
      averageCommentaryRate: this.stats.commentariesGenerated / (duration / 60 || 1)
    };
  }

  generateSessionSummary() {
    const stats = this.getStats();
    const summary = `游戏解说结束！本次共检测到 ${stats.eventsDetected} 个事件，生成了 ${stats.commentariesGenerated} 条解说。`;
    
    this.addCommentary(summary);
    console.log('Session Summary:', stats);
  }

  getCommentaryHistory() {
    return this.commentaryQueue;
  }

  // Manual commentary trigger
  triggerCommentary(type = 'general') {
    const comment = this.commentary.generateCommentary(type);
    this.addCommentary(comment);
  }
}

// Export
if (typeof window !== 'undefined') {
  window.ScreenCapture = ScreenCapture;
  window.GameEventDetector = GameEventDetector;
  window.CommentaryGenerator = CommentaryGenerator;
  window.GameInteractionSystem = GameInteractionSystem;
}

if (typeof module !== 'undefined') {
  module.exports = {
    ScreenCapture,
    GameEventDetector,
    CommentaryGenerator,
    GameInteractionSystem
  };
}
