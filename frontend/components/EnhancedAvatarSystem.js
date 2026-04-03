/**
 * EnhancedAvatarSystem - 增强的虚拟角色系统
 * 
 * 参考 moeru-ai/airi 项目和 Neuro-sama 实现
 * 
 * 功能:
 * - VRM/Live2D 模型控制
 * - 自动眨眼、视线跟踪、待机动画
 * - 情感驱动的面部表情
 * - 实时语音口型同步
 * - 身体动作和姿态控制
 */

class AvatarAnimationController {
  constructor() {
    this.isAnimating = false;
    this.animations = new Map();
    this.currentAnimation = null;
    this.animationQueue = [];
    this.blendDuration = 0.3;
    
    // 默认动画预设
    this.presets = {
      idle: { duration: 0, loop: true, priority: 0 },
      blink: { duration: 0.15, loop: false, priority: 1 },
      talk: { duration: 0, loop: true, priority: 2 },
      excited: { duration: 1.5, loop: false, priority: 3 },
      angry: { duration: 1.0, loop: false, priority: 3 },
      sad: { duration: 2.0, loop: false, priority: 3 },
      surprised: { duration: 0.5, loop: false, priority: 3 }
    };
  }

  registerAnimation(name, animation) {
    this.animations.set(name, animation);
  }

  play(name, options = {}) {
    const preset = this.presets[name] || {};
    const animation = {
      name,
      startTime: Date.now(),
      duration: options.duration || preset.duration || 0,
      loop: options.loop ?? preset.loop ?? false,
      priority: options.priority ?? preset.priority ?? 0
    };

    if (this.currentAnimation && this.currentAnimation.priority > animation.priority) {
      this.animationQueue.push(animation);
      return;
    }

    this.currentAnimation = animation;
    this.isAnimating = true;
    
    if (!animation.loop && animation.duration > 0) {
      setTimeout(() => {
        this.currentAnimation = null;
        this._processQueue();
      }, animation.duration * 1000);
    }
  }

  stop(name) {
    if (this.currentAnimation?.name === name) {
      this.currentAnimation = null;
      this._processQueue();
    }
  }

  _processQueue() {
    if (this.animationQueue.length > 0) {
      const next = this.animationQueue.sort((a, b) => b.priority - a.priority).shift();
      this.play(next.name, next);
    } else {
      this.play('idle');
    }
  }
}

class EyeController {
  constructor(options = {}) {
    this.blinkInterval = options.blinkInterval || 3000;
    this.blinkDuration = options.blinkDuration || 150;
    this.lookAtTarget = { x: 0, y: 0 };
    this.blinkTimer = null;
    this.isBlinking = false;
    
    this.idleEyeMovement = {
      enabled: true,
      speed: 0.5,
      range: 0.3
    };
  }

  start() {
    this._startBlinkCycle();
    if (this.idleEyeMovement.enabled) {
      this._startIdleMovement();
    }
  }

  _startBlinkCycle() {
    const scheduleBlink = () => {
      const delay = this.blinkInterval + Math.random() * 2000 - 1000;
      this.blinkTimer = setTimeout(() => {
        this.blink();
        scheduleBlink();
      }, delay);
    };
    scheduleBlink();
  }

  blink() {
    this.isBlinking = true;
    // 触发眨眼动画
    setTimeout(() => {
      this.isBlinking = false;
    }, this.blinkDuration);
  }

  lookAt(x, y) {
    this.lookAtTarget = {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y))
    };
  }

  _startIdleMovement() {
    const move = () => {
      if (!this.isBlinking) {
        const time = Date.now() / 1000;
        const x = Math.sin(time * this.idleEyeMovement.speed) * this.idleEyeMovement.range;
        const y = Math.cos(time * this.idleEyeMovement.speed * 0.7) * this.idleEyeMovement.range * 0.5;
        this.lookAt(x, y);
      }
      requestAnimationFrame(move);
    };
    move();
  }

  stop() {
    if (this.blinkTimer) {
      clearTimeout(this.blinkTimer);
    }
  }
}

class MouthController {
  constructor() {
    this.isSpeaking = false;
    this.mouthOpen = 0;
    this.targetMouthOpen = 0;
    this.smoothSpeed = 0.3;
    this.phonemeMap = {
      'a': 0.8, 'e': 0.6, 'i': 0.3, 'o': 0.7, 'u': 0.4,
      'm': 0.1, 'b': 0.2, 'p': 0.2, 'f': 0.3, 'v': 0.3
    };
  }

  startSpeaking() {
    this.isSpeaking = true;
  }

  stopSpeaking() {
    this.isSpeaking = false;
    this.targetMouthOpen = 0;
  }

  setPhoneme(phoneme) {
    this.targetMouthOpen = this.phonemeMap[phoneme.toLowerCase()] || 0.3;
  }

  update() {
    if (this.isSpeaking) {
      // 模拟说话时的嘴型变化
      this.targetMouthOpen = 0.2 + Math.random() * 0.6;
    }
    
    // 平滑过渡
    this.mouthOpen += (this.targetMouthOpen - this.mouthOpen) * this.smoothSpeed;
    return this.mouthOpen;
  }
}

class BodyController {
  constructor() {
    this.position = { x: 0, y: 0, z: 0 };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.breathingSpeed = 0.001;
    this.breathingAmplitude = 0.02;
    this.idleSway = { speed: 0.5, amount: 0.02 };
    this.time = 0;
  }

  update(deltaTime) {
    this.time += deltaTime;
    
    // 呼吸效果
    const breathing = Math.sin(this.time * this.breathingSpeed * 1000) * this.breathingAmplitude;
    
    // 待机摇摆
    const swayX = Math.sin(this.time * this.idleSway.speed) * this.idleSway.amount;
    const swayY = Math.cos(this.time * this.idleSway.speed * 0.7) * this.idleSway.amount * 0.5;
    
    return {
      position: { ...this.position, y: this.position.y + breathing },
      rotation: { x: swayX, y: swayY, z: this.rotation.z }
    };
  }

  reactToEmotion(emotion, intensity = 1) {
    const reactions = {
      happy: { bounce: 0.05, tilt: 0.1 },
      excited: { bounce: 0.1, tilt: 0.15 },
      sad: { slump: 0.1, tilt: -0.05 },
      angry: { tense: 0.08, tilt: 0.12 },
      surprised: { jump: 0.12, tilt: 0 },
      shy: { shrink: 0.05, tilt: -0.1 }
    };
    
    const reaction = reactions[emotion] || {};
    Object.keys(reaction).forEach(key => {
      reaction[key] *= intensity;
    });
    
    return reaction;
  }
}

class EnhancedAvatarSystem {
  constructor(options = {}) {
    this.animation = new AvatarAnimationController();
    this.eyes = new EyeController(options.eyes);
    this.mouth = new MouthController();
    this.body = new BodyController();
    
    this.currentEmotion = 'neutral';
    this.emotionIntensity = 0.5;
    this.lastUpdateTime = Date.now();
    
    // 表情映射到BlendShape
    this.emotionBlendShapes = {
      happy: {
        'EyeLOpen': 1.0, 'EyeROpen': 1.0,
        'EyeLSmile': 0.8, 'EyeRSmile': 0.8,
        'MouthForm': 0.6, 'MouthOpenY': 0.3
      },
      sad: {
        'EyeLOpen': 0.5, 'EyeROpen': 0.5,
        'EyeLSmile': 0, 'EyeRSmile': 0,
        'MouthForm': -0.3, 'BrowLForm': 0.3, 'BrowRForm': 0.3
      },
      angry: {
        'EyeLOpen': 1.1, 'EyeROpen': 1.1,
        'EyeLSmile': -0.3, 'EyeRSmile': -0.3,
        'BrowLForm': 0.5, 'BrowRForm': 0.5,
        'MouthForm': -0.4
      },
      surprised: {
        'EyeLOpen': 1.3, 'EyeROpen': 1.3,
        'MouthOpenY': 0.6,
        'BrowLForm': -0.3, 'BrowRForm': -0.3
      },
      shy: {
        'EyeLOpen': 0.7, 'EyeROpen': 0.7,
        'EyeLSmile': 0.4, 'EyeRSmile': 0.4,
        'Cheek': 0.7,
        'MouthForm': 0.1
      },
      curious: {
        'EyeLOpen': 1.1, 'EyeROpen': 1.0,
        'BrowLForm': -0.2, 'BrowRForm': 0.2
      },
      neutral: {
        'EyeLOpen': 1.0, 'EyeROpen': 1.0,
        'EyeLSmile': 0, 'EyeRSmile': 0,
        'MouthForm': 0, 'MouthOpenY': 0
      }
    };
    
    // 语音情感增强
    this.speechEmotionBoost = {
      happy: { rate: 1.15, pitch: 1.1 },
      sad: { rate: 0.85, pitch: 0.9 },
      angry: { rate: 1.2, pitch: 0.95 },
      excited: { rate: 1.25, pitch: 1.2 },
      shy: { rate: 0.9, pitch: 1.05 },
      curious: { rate: 1.0, pitch: 1.05 },
      neutral: { rate: 1.0, pitch: 1.0 }
    };
    
    this.init();
  }

  init() {
    this.eyes.start();
    this.animation.play('idle');
    this.startUpdateLoop();
  }

  startUpdateLoop() {
    const update = () => {
      const now = Date.now();
      const deltaTime = (now - this.lastUpdateTime) / 1000;
      this.lastUpdateTime = now;
      
      this.mouth.update();
      const bodyState = this.body.update(deltaTime);
      
      requestAnimationFrame(update);
    };
    update();
  }

  setEmotion(emotion, intensity = 0.5) {
    this.currentEmotion = emotion;
    this.emotionIntensity = intensity;
    
    const blendShapes = this.emotionBlendShapes[emotion] || this.emotionBlendShapes.neutral;
    
    // 应用强度
    const adjustedShapes = {};
    Object.keys(blendShapes).forEach(key => {
      adjustedShapes[key] = blendShapes[key] * intensity;
    });
    
    // 触发身体反应
    const bodyReaction = this.body.reactToEmotion(emotion, intensity);
    
    // 根据情绪选择动画
    if (emotion === 'happy' || emotion === 'excited') {
      this.animation.play('excited');
    } else if (emotion === 'sad') {
      this.animation.play('sad');
    } else if (emotion === 'angry') {
      this.animation.play('angry');
    } else if (emotion === 'surprised') {
      this.animation.play('surprised');
    }
    
    return { blendShapes: adjustedShapes, bodyReaction };
  }

  startSpeaking() {
    this.mouth.startSpeaking();
    this.animation.play('talk');
  }

  stopSpeaking() {
    this.mouth.stopSpeaking();
    this.animation.stop('talk');
  }

  getSpeechTTSParams() {
    return this.speechEmotionBoost[this.currentEmotion] || this.speechEmotionBoost.neutral;
  }

  lookAt(x, y) {
    this.eyes.lookAt(x, y);
  }

  destroy() {
    this.eyes.stop();
    this.animation.isAnimating = false;
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.EnhancedAvatarSystem = EnhancedAvatarSystem;
  window.AvatarAnimationController = AvatarAnimationController;
  window.EyeController = EyeController;
  window.MouthController = MouthController;
  window.BodyController = BodyController;
}

if (typeof module !== 'undefined') {
  module.exports = {
    EnhancedAvatarSystem,
    AvatarAnimationController,
    EyeController,
    MouthController,
    BodyController
  };
}
