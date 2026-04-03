/**
 * EmotionAnimationSystem - 情绪驱动的动画系统
 * 
 * 功能:
 * - 自动检测对话内容中的情绪
 * - 根据情绪触发不同的表情和动作
 * - 支持复杂的情绪组合
 * - 实时情绪过渡动画
 */

class EmotionAnimationSystem {
  constructor(character, options = {}) {
    this.character = character;
    this.currentEmotion = 'neutral';
    this.targetEmotion = 'neutral';
    this.transitionProgress = 1;
    this.transitionSpeed = options.transitionSpeed || 0.1;
    
    this.emotionQueue = [];
    this.isTransitioning = false;
    this.emotionHoldTime = options.holdTime || 2000;
    this.holdTimer = null;
    
    // Emotion detection patterns
    this.emotionKeywords = {
      happy: {
        high: /太开心|超级喜欢|哇塞|耶|庆祝|happy|love|❤|😊|😄|🎉|✨/,
        medium: /开心|高兴|喜欢|好呀|哈哈|呵呵/,
        low: /嗯嗯|好的|不错|ok/
      },
      sad: {
        high: /太难过了|伤心欲绝|😭|💔/,
        medium: /难过|伤心|遗憾|可惜/,
        low: /有点失落|不太好/
      },
      angry: {
        high: /气死了|愤怒|😠|😡|😤/,
        medium: /生气|不爽|讨厌/,
        low: /有点烦|不开心/
      },
      surprised: {
        high: /哇！|天哪！|什么？！|😱|😮‍💨/,
        medium: /惊讶|意外|没想到/,
        low: /有点意外|没想到/
      },
      shy: {
        high: /害羞死了|不好意思到极点|😳/,
        medium: /害羞|不好意思|腼腆/,
        low: /有点害羞|不太好意思/
      },
      curious: {
        high: /太好奇了|超级想知道|🤔/,
        medium: /好奇|想知道|为什么/,
        low: /有点好奇|这是什么/
      },
      proud: {
        high: /骄傲|自豪|厉害吧|😏/,
        medium: /满意|不错吧|看吧/,
        low: /还好|一般般/
      },
      thinking: {
        high: /让我想想|嗯...|思考中|💭/,
        medium: /我在想|考虑一下/,
        low: /嗯|让我想想/
      },
      sleepy: {
        high: /困死了|好想睡觉|😴/,
        medium: /困|想睡觉|有点累/,
        low: /有点疲惫|不太精神/
      },
      excited: {
        high: /超级激动|太兴奋了|🤩|蹦蹦跳跳/,
        medium: /激动|兴奋|期待/,
        low: /有点期待|还不错/
      }
    };
    
    // Emotion intensity levels
    this.emotionIntensities = {
      neutral: 0,
      sleepy: 0.2,
      shy: 0.3,
      thinking: 0.3,
      curious: 0.4,
      calm: 0.4,
      proud: 0.5,
      happy: 0.6,
      sad: 0.6,
      surprised: 0.7,
      excited: 0.8,
      angry: 0.9
    };
    
    // Animation presets for each emotion
    this.animationPresets = {
      happy: {
        eyeScale: 1.15,
        mouthCurve: 0.4,
        blush: 0.4,
        eyebrow: -0.1,
        bodyBounce: 2,
        particleEffect: 'sparkle',
        particleColor: '#FFD700'
      },
      sad: {
        eyeScale: 0.75,
        mouthCurve: -0.3,
        blush: 0,
        eyebrow: 0.2,
        bodyBounce: -1,
        particleEffect: 'drop',
        particleColor: '#6495ED'
      },
      angry: {
        eyeScale: 1.1,
        mouthCurve: -0.2,
        blush: 0,
        eyebrow: 0.3,
        bodyBounce: 0,
        particleEffect: 'burst',
        particleColor: '#FF4444',
        shakeIntensity: 2
      },
      surprised: {
        eyeScale: 1.3,
        mouthCurve: 0,
        blush: 0.2,
        eyebrow: -0.3,
        bodyBounce: 3,
        particleEffect: 'burst',
        particleColor: '#FFD700'
      },
      shy: {
        eyeScale: 0.65,
        mouthCurve: 0.1,
        blush: 0.7,
        eyebrow: 0.1,
        bodyBounce: -0.5,
        particleEffect: 'heart',
        particleColor: '#FFB6C1',
        headTilt: 10
      },
      curious: {
        eyeScale: 1.05,
        mouthCurve: 0.1,
        blush: 0.15,
        eyebrow: 0.15,
        bodyBounce: 1,
        particleEffect: 'question',
        particleColor: '#87CEEB',
        headTilt: 5
      },
      proud: {
        eyeScale: 0.95,
        mouthCurve: 0.25,
        blush: 0.25,
        eyebrow: -0.15,
        bodyBounce: 1.5,
        particleEffect: 'star',
        particleColor: '#FFD700'
      },
      thinking: {
        eyeScale: 0.9,
        mouthCurve: 0,
        blush: 0,
        eyebrow: 0.1,
        bodyBounce: 0,
        particleEffect: 'dots',
        particleColor: '#999999',
        headTilt: 8
      },
      sleepy: {
        eyeScale: 0.4,
        mouthCurve: -0.1,
        blush: 0,
        eyebrow: 0.05,
        bodyBounce: -0.5,
        particleEffect: 'sleep',
        particleColor: '#DDA0DD'
      },
      excited: {
        eyeScale: 1.25,
        mouthCurve: 0.6,
        blush: 0.6,
        eyebrow: -0.2,
        bodyBounce: 4,
        particleEffect: 'confetti',
        particleColor: '#FF69B4'
      },
      neutral: {
        eyeScale: 1.0,
        mouthCurve: 0,
        blush: 0,
        eyebrow: 0,
        bodyBounce: 0,
        particleEffect: null
      }
    };
  }

  /**
   * Analyze text and return detected emotion with intensity
   */
  analyzeText(text) {
    let detectedEmotion = 'neutral';
    let intensity = 0;
    let intensityLevel = 'low';
    
    for (const [emotion, patterns] of Object.entries(this.emotionKeywords)) {
      for (const [level, pattern] of Object.entries(patterns)) {
        if (pattern.test(text)) {
          const levelIntensity = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
          if (levelIntensity > intensity) {
            intensity = levelIntensity;
            detectedEmotion = emotion;
            intensityLevel = level;
          }
        }
      }
    }
    
    return {
      emotion: detectedEmotion,
      intensity,
      intensityLevel,
      baseEmotion: this.getBaseEmotion(detectedEmotion)
    };
  }

  /**
   * Get base emotion for composite emotions
   */
  getBaseEmotion(emotion) {
    const emotionMap = {
      'happy': 'happy',
      'sad': 'sad',
      'angry': 'angry',
      'surprised': 'surprised',
      'shy': 'shy',
      'curious': 'curious',
      'proud': 'proud',
      'thinking': 'thinking',
      'sleepy': 'sleepy',
      'excited': 'happy',
      'calm': 'neutral',
      'neutral': 'neutral'
    };
    return emotionMap[emotion] || 'neutral';
  }

  /**
   * Set emotion with optional intensity
   */
  setEmotion(emotion, options = {}) {
    const { 
      intensity = 1, 
      hold = true, 
      priority = false,
      transition = true 
    } = options;
    
    if (priority || !this.isTransitioning) {
      if (priority) {
        this.emotionQueue.unshift({ emotion, intensity, hold });
      } else {
        this.emotionQueue.push({ emotion, intensity, hold });
      }
      
      if (!this.isTransitioning) {
        this.processEmotionQueue();
      }
    }
  }

  /**
   * Process emotion queue
   */
  async processEmotionQueue() {
    if (this.emotionQueue.length === 0) {
      this.isTransitioning = false;
      return;
    }
    
    this.isTransitioning = true;
    const { emotion, intensity, hold } = this.emotionQueue.shift();
    
    await this.transitionToEmotion(emotion, intensity);
    
    if (hold && this.emotionHoldTime > 0) {
      await this.holdEmotion(emotion);
    }
    
    // Process next emotion in queue
    setTimeout(() => this.processEmotionQueue(), 100);
  }

  /**
   * Smooth transition to target emotion
   */
  async transitionToEmotion(emotion, intensity = 1) {
    const preset = this.animationPresets[emotion] || this.animationPresets.neutral;
    this.targetEmotion = emotion;
    this.transitionProgress = 0;
    
    return new Promise((resolve) => {
      const animate = () => {
        this.transitionProgress += this.transitionSpeed;
        
        if (this.transitionProgress >= 1) {
          this.transitionProgress = 1;
          this.currentEmotion = emotion;
          
          // Apply final preset
          this.applyAnimationPreset(preset, intensity);
          
          // Trigger particle effect
          if (preset.particleEffect) {
            this.triggerParticleEffect(preset.particleEffect, preset.particleColor);
          }
          
          // Update character
          if (this.character) {
            this.character.setMood(emotion);
          }
          
          resolve();
        } else {
          // Interpolate between current and target
          this.interpolateAnimation(preset, intensity);
          requestAnimationFrame(animate);
        }
      };
      
      animate();
    });
  }

  /**
   * Interpolate between current and target animation state
   */
  interpolateAnimation(targetPreset, intensity) {
    const currentPreset = this.animationPresets[this.currentEmotion] || this.animationPresets.neutral;
    const t = this.easeOutCubic(this.transitionProgress);
    
    const interpolated = {
      eyeScale: this.lerp(currentPreset.eyeScale, targetPreset.eyeScale, t),
      mouthCurve: this.lerp(currentPreset.mouthCurve, targetPreset.mouthCurve, t),
      blush: this.lerp(currentPreset.blush, targetPreset.blush * intensity, t),
      eyebrow: this.lerp(currentPreset.eyebrow, targetPreset.eyebrow, t)
    };
    
    this.applyAnimationValues(interpolated);
  }

  /**
   * Apply animation preset to character
   */
  applyAnimationPreset(preset, intensity = 1) {
    const values = {
      eyeScale: preset.eyeScale,
      mouthCurve: preset.mouthCurve,
      blush: preset.blush * intensity,
      eyebrow: preset.eyebrow
    };
    
    this.applyAnimationValues(values);
    
    // Apply special effects
    if (preset.bodyBounce && this.character) {
      this.character.bodyBounce = preset.bodyBounce * intensity;
    }
    
    if (preset.headTilt && this.character) {
      this.character.headTilt = preset.headTilt;
    }
    
    if (preset.shakeIntensity) {
      this.triggerShake(preset.shakeIntensity);
    }
  }

  /**
   * Apply animation values to character
   */
  applyAnimationValues(values) {
    if (!this.character) return;
    
    // Update mood modifiers
    const moodModifiers = {
      eyeScale: values.eyeScale,
      mouthCurve: values.mouthCurve,
      blush: values.blush,
      eyebrow: values.eyebrow
    };
    
    this.character.moodModifiers = this.character.moodModifiers || {};
    Object.assign(this.character.moodModifiers, moodModifiers);
  }

  /**
   * Hold emotion for specified duration
   */
  holdEmotion(emotion) {
    return new Promise((resolve) => {
      if (this.holdTimer) clearTimeout(this.holdTimer);
      
      this.holdTimer = setTimeout(() => {
        resolve();
      }, this.emotionHoldTime);
    });
  }

  /**
   * Trigger particle effect
   */
  triggerParticleEffect(effectType, color) {
    if (!this.character || !this.character._addParticleBurst) return;
    
    const effectConfigs = {
      sparkle: { count: 10, size: 3, spread: 50 },
      drop: { count: 5, size: 2, spread: 30, gravity: 0.5 },
      burst: { count: 15, size: 4, spread: 80 },
      heart: { count: 8, size: 5, spread: 60 },
      star: { count: 10, size: 4, spread: 70 },
      question: { count: 3, size: 8, spread: 40 },
      dots: { count: 6, size: 3, spread: 50 },
      sleep: { count: 4, size: 6, spread: 30 },
      confetti: { count: 20, size: 3, spread: 100 }
    };
    
    const config = effectConfigs[effectType];
    if (!config) return;
    
    for (let i = 0; i < config.count; i++) {
      this.character.particles.push({
        x: this.character.width / 2 + (Math.random() - 0.5) * config.spread,
        y: this.character.height / 2 - 50,
        size: config.size + Math.random() * 2,
        speed: Math.random() * 2 + 1,
        opacity: 1,
        color: color,
        vx: (Math.random() - 0.5) * 3,
        vy: config.gravity ? config.gravity : -Math.random() * 3 - 1,
        life: 60
      });
    }
  }

  /**
   * Trigger shake animation
   */
  triggerShake(intensity) {
    if (!this.character) return;
    
    let shakeCount = 0;
    const maxShakes = 10;
    
    const shake = () => {
      if (shakeCount >= maxShakes) {
        this.character.headRotY = 0;
        return;
      }
      
      this.character.headRotY = (Math.random() - 0.5) * intensity;
      shakeCount++;
      setTimeout(shake, 50);
    };
    
    shake();
  }

  /**
   * Analyze and set emotion from text
   */
  analyzeAndSetEmotion(text, options = {}) {
    const analysis = this.analyzeText(text);
    
    this.setEmotion(analysis.baseEmotion, {
      intensity: analysis.intensity / 3,
      hold: options.hold !== false,
      priority: options.priority || false
    });
    
    return analysis;
  }

  /**
   * Get current emotion state
   */
  getState() {
    return {
      current: this.currentEmotion,
      target: this.targetEmotion,
      isTransitioning: this.isTransitioning,
      queueLength: this.emotionQueue.length,
      transitionProgress: this.transitionProgress
    };
  }

  /**
   * Reset to neutral emotion
   */
  reset() {
    this.emotionQueue = [];
    this.currentEmotion = 'neutral';
    this.targetEmotion = 'neutral';
    this.isTransitioning = false;
    this.transitionProgress = 1;
    
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    
    this.applyAnimationPreset(this.animationPresets.neutral);
    
    if (this.character) {
      this.character.setMood('neutral');
    }
  }

  // Utility functions
  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  destroy() {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
    }
    this.emotionQueue = [];
  }
}

/**
 * EmotionSpeechEnhancer - 增强的语音情绪系统
 * 结合语音分析和文本分析
 */
class EmotionSpeechEnhancer {
  constructor(emotionSystem, voiceManager) {
    this.emotionSystem = emotionSystem;
    this.voiceManager = voiceManager;
    this.speechEmotionHistory = [];
  }

  /**
   * Analyze speech patterns for emotion
   */
  analyzeSpeechPattern(audioData) {
    const { volume, pitch, speakingRate } = audioData;
    
    let emotion = 'neutral';
    let intensity = 0;
    
    // High pitch + fast rate = excited/happy
    if (pitch > 200 && speakingRate > 150) {
      emotion = 'excited';
      intensity = 0.8;
    }
    // High pitch + slow rate = surprised/thinking
    else if (pitch > 200 && speakingRate < 100) {
      emotion = 'surprised';
      intensity = 0.6;
    }
    // Low pitch + fast rate = angry
    else if (pitch < 100 && speakingRate > 150) {
      emotion = 'angry';
      intensity = 0.7;
    }
    // Low pitch + slow rate = sad/sleepy
    else if (pitch < 100 && speakingRate < 100) {
      emotion = 'sad';
      intensity = 0.5;
    }
    // High volume = intense emotion
    else if (volume > 0.7) {
      emotion = 'happy';
      intensity = 0.6;
    }
    // Low volume = shy/calm
    else if (volume < 0.3) {
      emotion = 'shy';
      intensity = 0.4;
    }
    
    return { emotion, intensity };
  }

  /**
   * Combine speech and text emotions
   */
  combineEmotions(speechEmotion, textEmotion) {
    // Priority: text emotion > speech emotion
    if (textEmotion.intensity > speechEmotion.intensity) {
      return textEmotion;
    }
    return speechEmotion;
  }

  /**
   * Track emotion over time
   */
  trackEmotion(emotion, duration = 5000) {
    this.speechEmotionHistory.push({
      emotion,
      timestamp: Date.now(),
      duration
    });
    
    // Clean old entries
    const now = Date.now();
    this.speechEmotionHistory = this.speechEmotionHistory.filter(
      entry => now - entry.timestamp < duration
    );
  }

  /**
   * Get dominant emotion from history
   */
  getDominantEmotion() {
    if (this.speechEmotionHistory.length === 0) {
      return 'neutral';
    }
    
    const counts = {};
    this.speechEmotionHistory.forEach(entry => {
      counts[entry.emotion] = (counts[entry.emotion] || 0) + 1;
    });
    
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0][0];
  }
}

// Export
if (typeof window !== 'undefined') {
  window.EmotionAnimationSystem = EmotionAnimationSystem;
  window.EmotionSpeechEnhancer = EmotionSpeechEnhancer;
}

if (typeof module !== 'undefined') {
  module.exports = {
    EmotionAnimationSystem,
    EmotionSpeechEnhancer
  };
}
