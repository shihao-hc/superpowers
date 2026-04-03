/**
 * EnhancedGameSystem - 增强的游戏交互系统
 * 
 * 参考 moeru-ai/airi 的 Minecraft/Factorio 集成
 * 和 Neuro-sama 的实时游戏解说能力
 * 
 * 功能:
 * - 屏幕捕获和视觉分析
 * - 游戏事件检测
 * - AI 实时解说和反应
 * - 情感驱动的游戏评论
 * - 多游戏支持
 */

class ScreenAnalyzer {
  constructor(options = {}) {
    this.video = null;
    this.canvas = null;
    this.ctx = null;
    this.isCapturing = false;
    this.captureInterval = null;
    this.captureRate = options.captureRate || 1000;
    this.width = options.width || 640;
    this.height = options.height || 360;
    
    // 视觉分析配置
    this.analysisConfig = {
      colorSampling: true,
      motionDetection: true,
      objectTracking: true,
      textRecognition: false
    };
    
    this.lastFrame = null;
    this.motionThreshold = 30;
  }

  async start() {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      this.video = document.createElement('video');
      this.video.srcObject = stream;
      this.video.autoplay = true;
      this.video.playsInline = true;

      await this.video.play();

      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

      this.isCapturing = true;
      this.startCaptureLoop();

      stream.getVideoTracks()[0].onended = () => {
        this.stop();
      };

      return true;
    } catch (error) {
      console.error('Screen capture failed:', error);
      return false;
    }
  }

  startCaptureLoop() {
    const capture = () => {
      if (!this.isCapturing) return;
      
      this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
      const imageData = this.ctx.getImageData(0, 0, this.width, this.height);
      
      // 分析帧
      const analysis = this.analyzeFrame(imageData);
      
      // 检测运动
      if (this.lastFrame) {
        analysis.motion = this.detectMotion(this.lastFrame, imageData);
      }
      this.lastFrame = imageData;
      
      // 发送分析结果
      if (this.onFrame) {
        this.onFrame(analysis);
      }
      
      setTimeout(capture, this.captureRate);
    };
    capture();
  }

  analyzeFrame(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // 颜色分析
    let r = 0, g = 0, b = 0;
    const sampleSize = Math.min(data.length, 1000 * 4);
    
    for (let i = 0; i < sampleSize; i += 16) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    
    const samples = sampleSize / 16;
    r = Math.round(r / samples);
    g = Math.round(g / samples);
    b = Math.round(b / samples);
    
    // 亮度分析
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    
    // 检测UI元素（简单边缘检测）
    const edgeDensity = this.detectEdges(imageData);
    
    return {
      timestamp: Date.now(),
      color: { r, g, b },
      brightness,
      edgeDensity,
      size: { width, height }
    };
  }

  detectMotion(prevFrame, currentFrame) {
    const prevData = prevFrame.data;
    const currData = currentFrame.data;
    let diff = 0;
    
    const step = Math.max(1, Math.floor(prevData.length / 10000));
    
    for (let i = 0; i < prevData.length; i += step * 4) {
      const rDiff = Math.abs(prevData[i] - currData[i]);
      const gDiff = Math.abs(prevData[i + 1] - currData[i + 1]);
      const bDiff = Math.abs(prevData[i + 2] - currData[i + 2]);
      diff += (rDiff + gDiff + bDiff) / 3;
    }
    
    const avgDiff = diff / (prevData.length / step / 4);
    return {
      level: avgDiff,
      significant: avgDiff > this.motionThreshold
    };
  }

  detectEdges(imageData) {
    // 简化的边缘检测
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    let edges = 0;
    
    for (let y = 1; y < height - 1; y += 4) {
      for (let x = 1; x < width - 1; x += 4) {
        const idx = (y * width + x) * 4;
        const idxRight = (y * width + x + 1) * 4;
        const idxDown = ((y + 1) * width + x) * 4;
        
        const gx = Math.abs(data[idx] - data[idxRight]);
        const gy = Math.abs(data[idx] - data[idxDown]);
        
        if (gx + gy > 50) edges++;
      }
    }
    
    return edges / ((width / 4) * (height / 4));
  }

  stop() {
    this.isCapturing = false;
    if (this.video?.srcObject) {
      this.video.srcObject.getTracks().forEach(track => track.stop());
    }
  }
}

class GameEventDetector {
  constructor() {
    this.events = [];
    this.lastState = null;
    this.eventPatterns = {
      // 战斗检测
      battle: {
        motionThreshold: 50,
        brightnessChange: 0.3,
        colorVariance: 0.4
      },
      // 胜利检测
      victory: {
        brightnessIncrease: 0.2,
        motionBurst: true
      },
      // 死亡/失败检测
      death: {
        brightnessDrop: 0.3,
        redTint: true
      },
      // 探索检测
      exploration: {
        steadyMotion: true,
        colorVariation: 'moderate'
      }
    };
  }

  detect(frameAnalysis) {
    const events = [];
    
    if (!this.lastState) {
      this.lastState = frameAnalysis;
      return events;
    }

    // 检测亮度变化
    const brightnessDelta = frameAnalysis.brightness - this.lastState.brightness;
    
    // 检测运动
    const motion = frameAnalysis.motion;
    
    // 检测颜色变化
    const colorDelta = this._colorDistance(frameAnalysis.color, this.lastState.color);

    // 战斗检测：高运动 + 颜色快速变化
    if (motion?.significant && colorDelta > 30) {
      events.push({
        type: 'battle',
        confidence: Math.min(1, colorDelta / 100),
        data: { motion: motion.level, colorChange: colorDelta }
      });
    }
    
    // 胜利检测：亮度突然增加
    if (brightnessDelta > 0.2 && motion?.significant) {
      events.push({
        type: 'victory',
        confidence: Math.min(1, brightnessDelta),
        data: { brightnessChange: brightnessDelta }
      });
    }
    
    // 危险检测：红色调增加
    const redRatio = frameAnalysis.color.r / (frameAnalysis.color.g + frameAnalysis.color.b + 1);
    if (redRatio > 1.5 && frameAnalysis.brightness < 0.4) {
      events.push({
        type: 'danger',
        confidence: Math.min(1, redRatio - 1),
        data: { redRatio }
      });
    }
    
    // 探索检测：稳定运动
    if (motion && !motion.significant && frameAnalysis.brightness > 0.4) {
      events.push({
        type: 'exploration',
        confidence: 0.3,
        data: {}
      });
    }

    this.lastState = frameAnalysis;
    return events;
  }

  _colorDistance(c1, c2) {
    return Math.sqrt(
      Math.pow(c1.r - c2.r, 2) +
      Math.pow(c1.g - c2.g, 2) +
      Math.pow(c1.b - c2.b, 2)
    );
  }
}

class GameCommentaryEngine {
  constructor(options = {}) {
    this.personality = options.personality || '狐九';
    this.commentaryTemplates = {
      battle: {
        start: [
          '战斗开始啦！加油加油~',
          '哇！遇到敌人了！注意安全~',
          '打起来打起来！💪'
        ],
        intense: [
          '好激烈的战斗！',
          '小心小心！血量注意！',
          '这个操作太秀了！✨'
        ],
        victory: [
          '太棒啦！赢了！🎉',
          '嘿嘿，果然厉害！',
          '胜利庆祝~✨'
        ]
      },
      exploration: [
        '这里是什么地方呀？',
        '哇，这个风景好美~',
        '发现新区域了！好期待~'
      ],
      danger: [
        '小心！有危险！',
        '快跑快跑！太危险了！',
        '血量注意！要死了要死了！'
      ],
      puzzle: [
        '这个要怎么解呢？🤔',
        '让我想想...应该是这样~',
        '哦哦！好像有思路了！'
      ],
      funny: [
        '哈哈哈！笑死我了！',
        '这个太搞笑了~',
        '噗哈哈哈~'
      ]
    };
    
    this.lastCommentTime = 0;
    this.commentCooldown = 3000;
    this.commentaryHistory = [];
  }

  generateComment(event) {
    const now = Date.now();
    if (now - this.lastCommentTime < this.commentCooldown) {
      return null;
    }

    const templates = this.commentaryTemplates[event.type];
    if (!templates) return null;

    let comment;
    if (Array.isArray(templates)) {
      comment = templates[Math.floor(Math.random() * templates.length)];
    } else if (templates[event.intensity]) {
      comment = templates[event.intensity][Math.floor(Math.random() * templates[event.intensity].length)];
    } else {
      comment = templates.start?.[0] || '加油~';
    }

    this.lastCommentTime = now;
    this.commentaryHistory.push({
      time: now,
      event: event.type,
      comment
    });

    // 保持历史记录在合理范围内
    if (this.commentaryHistory.length > 100) {
      this.commentaryHistory = this.commentaryHistory.slice(-50);
    }

    return {
      text: comment,
      emotion: this._getEmotionForEvent(event.type),
      priority: this._getPriority(event.type)
    };
  }

  _getEmotionForEvent(eventType) {
    const emotionMap = {
      battle: 'excited',
      victory: 'happy',
      danger: 'surprised',
      exploration: 'curious',
      funny: 'happy',
      puzzle: 'curious'
    };
    return emotionMap[eventType] || 'neutral';
  }

  _getPriority(eventType) {
    const priorityMap = {
      danger: 3,
      battle: 2,
      victory: 2,
      funny: 1,
      puzzle: 1,
      exploration: 0
    };
    return priorityMap[eventType] || 0;
  }
}

class EnhancedGameSystem {
  constructor(options = {}) {
    this.analyzer = new ScreenAnalyzer(options.capture);
    this.eventDetector = new GameEventDetector();
    this.commentaryEngine = new GameCommentaryEngine(options);
    
    this.isRunning = false;
    this.currentGame = null;
    this.onCommentary = options.onCommentary || (() => {});
    this.onEmotionChange = options.onEmotionChange || (() => {});
    
    // 游戏特定配置
    this.gameProfiles = {
      minecraft: {
        captureRate: 2000,
        motionThreshold: 40
      },
      pokemon: {
        captureRate: 1500,
        motionThreshold: 30
      },
      generic: {
        captureRate: 1000,
        motionThreshold: 35
      }
    };
  }

  async start(gameType = 'generic') {
    this.currentGame = gameType;
    const profile = this.gameProfiles[gameType] || this.gameProfiles.generic;
    this.analyzer.captureRate = profile.captureRate;
    this.eventDetector.eventPatterns.battle.motionThreshold = profile.motionThreshold;
    
    this.analyzer.onFrame = (analysis) => this.processFrame(analysis);
    
    const started = await this.analyzer.start();
    if (started) {
      this.isRunning = true;
      console.log(`[GameSystem] Started for ${gameType}`);
    }
    return started;
  }

  processFrame(analysis) {
    if (!this.isRunning) return;
    
    // 检测游戏事件
    const events = this.eventDetector.detect(analysis);
    
    // 为每个事件生成解说
    events.forEach(event => {
      const commentary = this.commentaryEngine.generateComment(event);
      if (commentary) {
        this.onCommentary(commentary);
        this.onEmotionChange(commentary.emotion);
      }
    });
  }

  // 手动触发事件（用于测试或特定场景）
  triggerEvent(type, intensity = 'start') {
    const commentary = this.commentaryEngine.generateComment({ type, intensity });
    if (commentary) {
      this.onCommentary(commentary);
      this.onEmotionChange(commentary.emotion);
    }
    return commentary;
  }

  // 模拟事件（用于演示）
  simulateEvents() {
    const events = ['battle', 'victory', 'exploration', 'danger', 'funny'];
    let index = 0;
    
    const simulate = () => {
      if (!this.isRunning) return;
      
      const event = events[index % events.length];
      this.triggerEvent(event);
      index++;
      
      setTimeout(simulate, 5000 + Math.random() * 5000);
    };
    
    setTimeout(simulate, 3000);
  }

  stop() {
    this.isRunning = false;
    this.analyzer.stop();
    console.log('[GameSystem] Stopped');
  }

  getStats() {
    return {
      isRunning: this.isRunning,
      currentGame: this.currentGame,
      commentaryCount: this.commentaryEngine.commentaryHistory.length,
      lastComment: this.commentaryEngine.commentaryHistory.slice(-1)[0]
    };
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.EnhancedGameSystem = EnhancedGameSystem;
  window.ScreenAnalyzer = ScreenAnalyzer;
  window.GameEventDetector = GameEventDetector;
  window.GameCommentaryEngine = GameCommentaryEngine;
}

if (typeof module !== 'undefined') {
  module.exports = {
    EnhancedGameSystem,
    ScreenAnalyzer,
    GameEventDetector,
    GameCommentaryEngine
  };
}
