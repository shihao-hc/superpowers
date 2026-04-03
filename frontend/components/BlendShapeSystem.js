class BlendShapeExpressionSystem {
  constructor(vrm, customBlendMap = null) {
    this.vrm = vrm;
    this.version = this._detectVersion();
    this.presets = this._initPresets();
    this.currentExpressions = {};
    this.customBlendMap = customBlendMap;
    this.transitionSpeed = 0.1;
    this._transitionFrame = null;
  }

  setCustomBlendMap(blendMap) {
    this.customBlendMap = blendMap;
  }

  _detectVersion() {
    if (!this.vrm) return 'unknown';
    if (this.vrm.expressionManager && typeof this.vrm.expressionManager.setValue === 'function') {
      return '1.0';
    }
    if (this.vrm.blendShapeProxy && typeof this.vrm.blendShapeProxy.setValue === 'function') {
      return '0.x';
    }
    return 'unknown';
  }

  _initPresets() {
    if (this.version === '1.0') {
      return {
        happy: 'happy',
        angry: 'angry',
        sad: 'sad',
        surprised: 'surprised',
        relaxed: 'relaxed',
        blink: 'blink',
        blinkLeft: 'blinkLeft',
        blinkRight: 'blinkRight',
        lookUp: 'lookUp',
        lookDown: 'lookDown',
        lookLeft: 'lookLeft',
        lookRight: 'lookRight',
        aa: 'aa',
        ih: 'ih',
        ou: 'ou',
        ee: 'ee',
        oh: 'oh',
        fun: 'fun',
        joy: 'happy',
        sorrow: 'sad'
      };
    }
    return {
      happy: 'Joy',
      angry: 'Angry',
      sad: 'Sorrow',
      surprised: 'Surprised',
      relaxed: 'Neutral',
      blink: 'Blink',
      blinkLeft: 'Blink_L',
      blinkRight: 'Blink_R',
      lookUp: 'LookUp',
      lookDown: 'LookDown',
      lookLeft: 'LookLeft',
      lookRight: 'LookRight',
      aa: 'A',
      ih: 'I',
      ou: 'U',
      ee: 'E',
      oh: 'O',
      fun: 'Fun',
      joy: 'Joy',
      sorrow: 'Sorrow'
    };
  }

  setValue(expressionName, weight) {
    if (!this.vrm) return;

    const safeName = expressionName;
    const safeWeight = Math.max(0, Math.min(1, weight));

    try {
      if (this.version === '1.0') {
        if (this.vrm.expressionManager) {
          this.vrm.expressionManager.setValue(safeName, safeWeight);
          this.vrm.expressionManager.update();
        }
      } else if (this.version === '0.x') {
        const vrm0Name = this.presets[safeName] || safeName;
        if (this.vrm.blendShapeProxy) {
          this.vrm.blendShapeProxy.setValue(vrm0Name, safeWeight);
          this.vrm.blendShapeProxy.update();
        }
      }
    } catch (error) {
      console.debug(`BlendShape ${expressionName} 设置失败:`, error.message);
    }
  }

  setMultiple(expressions) {
    if (!this.vrm || typeof expressions !== 'object') return;

    for (const [name, value] of Object.entries(expressions)) {
      if (typeof value === 'number') {
        this.setValue(name, value);
      }
    }
  }

  resetAll() {
    if (!this.vrm) return;

    const allExpressions = Object.keys(this.presets);
    for (const name of allExpressions) {
      this.setValue(name, 0);
    }
  }

  applyMood(mood, customBlends = null) {
    if (!this.vrm) return;

    const moodBlends = customBlends || this._getMoodBlends(mood);
    this.resetAll();
    this.setMultiple(moodBlends);
  }

  _getMoodBlends(mood) {
    if (this.customBlendMap && this.customBlendMap[mood]) {
      return this.customBlendMap[mood];
    }

    const defaultBlends = {
      happy: { happy: 1.0, sad: 0, angry: 0, surprised: 0, relaxed: 0 },
      sad: { happy: 0, sad: 1.0, angry: 0, surprised: 0, relaxed: 0 },
      angry: { happy: 0, sad: 0, angry: 1.0, surprised: 0, relaxed: 0 },
      surprised: { happy: 0, sad: 0, angry: 0, surprised: 1.0, relaxed: 0 },
      excited: { happy: 0.8, surprised: 0.3, sad: 0, angry: 0, relaxed: 0 },
      calm: { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 1.0 },
      neutral: { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0.5 },
      curious: { happy: 0.2, surprised: 0.5, sad: 0, angry: 0, relaxed: 0 },
      shy: { happy: 0.4, sad: 0, angry: 0, surprised: 0, relaxed: 0 },
      proud: { happy: 0.7, sad: 0, angry: 0, surprised: 0, relaxed: 0 },
      playful: { happy: 0.9, surprised: 0.1, sad: 0, angry: 0, relaxed: 0 },
      love: { happy: 1.0, surprised: 0, sad: 0, angry: 0, relaxed: 0 },
      sleepy: { happy: 0, sad: 0.3, angry: 0, surprised: 0, relaxed: 0.7 },
      funny: { happy: 1.0, surprised: 0.2, sad: 0, angry: 0, relaxed: 0 },
      worried: { happy: 0, sad: 0.5, angry: 0, surprised: 0.2, relaxed: 0 },
      thoughtful: { happy: 0.1, sad: 0.2, angry: 0, surprised: 0, relaxed: 0.5 },
      focused: { happy: 0, sad: 0, angry: 0.1, surprised: 0, relaxed: 0 },
      gentle: { happy: 0.3, sad: 0, angry: 0, surprised: 0, relaxed: 0.3 },
      caring: { happy: 0.5, sad: 0, angry: 0, surprised: 0, relaxed: 0.2 },
      melancholy: { happy: 0, sad: 0.7, angry: 0, surprised: 0, relaxed: 0 },
      joyful: { happy: 1.0, sad: 0, angry: 0, surprised: 0.2, relaxed: 0 },
      analytical: { happy: 0, sad: 0, angry: 0, surprised: 0, relaxed: 0 },
      efficient: { happy: 0.1, sad: 0, angry: 0, surprised: 0, relaxed: 0 },
      upgrading: { happy: 0.3, sad: 0, angry: 0, surprised: 0.5, relaxed: 0 },
      combat: { happy: 0, sad: 0, angry: 0.8, surprised: 0.2, relaxed: 0 },
      sarcastic: { happy: 0.3, sad: 0, angry: 0.2, surprised: 0, relaxed: 0 },
      silly: { happy: 0.9, surprised: 0.4, sad: 0, angry: 0, relaxed: 0 },
      mischievous: { happy: 0.6, sad: 0, angry: 0, surprised: 0.3, relaxed: 0 },
      hungry: { happy: 0, sad: 0.4, angry: 0, surprised: 0, relaxed: 0 },
      amused: { happy: 0.8, sad: 0, angry: 0, surprised: 0.1, relaxed: 0 },
      serious: { happy: 0, sad: 0, angry: 0.3, surprised: 0, relaxed: 0 }
    };

    return defaultBlends[mood] || defaultBlends.neutral;
  }

  setLipSync(value) {
    if (!this.vrm) return;

    const clampedValue = Math.max(0, Math.min(1, value));
    this.setValue('aa', clampedValue);
  }

  setLipSyncPhoneme(phoneme, value) {
    if (!this.vrm) return;

    const clampedValue = Math.max(0, Math.min(1, value));
    const phonemeMap = {
      'a': 'aa',
      'i': 'ih',
      'u': 'ou',
      'e': 'ee',
      'o': 'oh'
    };

    const vrmPhoneme = phonemeMap[phoneme.toLowerCase()] || 'aa';
    this.setValue(vrmPhoneme, clampedValue);
  }

  setBlink(left = 1.0, right = 1.0) {
    if (!this.vrm) return;

    this.setValue('blinkLeft', Math.max(0, Math.min(1, left)));
    this.setValue('blinkRight', Math.max(0, Math.min(1, right)));
  }

  setEyeLook(direction) {
    if (!this.vrm) return;

    const directions = {
      'up': { lookUp: 1.0, lookDown: 0, lookLeft: 0, lookRight: 0 },
      'down': { lookUp: 0, lookDown: 1.0, lookLeft: 0, lookRight: 0 },
      'left': { lookUp: 0, lookDown: 0, lookLeft: 1.0, lookRight: 0 },
      'right': { lookUp: 0, lookDown: 0, lookLeft: 0, lookRight: 1.0 },
      'center': { lookUp: 0, lookDown: 0, lookLeft: 0, lookRight: 0 }
    };

    const blend = directions[direction] || directions.center;
    this.setMultiple(blend);
  }

  async transitionTo(mood, duration = 300) {
    if (!this.vrm) return;

    const targetBlends = this._getMoodBlends(mood);
    const startBlends = { ...this.currentExpressions };

    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = this._easeInOutCubic(progress);

      for (const [name, targetValue] of Object.entries(targetBlends)) {
        const startValue = startBlends[name] || 0;
        const currentValue = startValue + (targetValue - startValue) * eased;
        this.setValue(name, currentValue);
      }

      if (progress < 1) {
        this._transitionFrame = requestAnimationFrame(animate);
      } else {
        this.currentExpressions = { ...targetBlends };
        this._transitionFrame = null;
      }
    };

    if (this._transitionFrame) {
      cancelAnimationFrame(this._transitionFrame);
    }

    this._transitionFrame = requestAnimationFrame(animate);
  }

  _easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  getAvailableExpressions() {
    return Object.keys(this.presets);
  }

  getCurrentValues() {
    return { ...this.currentExpressions };
  }

  dispose() {
    if (this._transitionFrame) {
      cancelAnimationFrame(this._transitionFrame);
      this._transitionFrame = null;
    }
    this.vrm = null;
    this.currentExpressions = {};
  }
}

class ExpressionOverrideSystem {
  constructor(expressionSystem) {
    this.expressionSystem = expressionSystem;
    this.overrides = {
      blink: { active: false, weight: 0 },
      lookAt: { active: false, yaw: 0, pitch: 0 },
      mouth: { active: false, weight: 0 }
    };
    this.overrideMode = 'block';
  }

  setOverrideMode(mode) {
    if (['block', 'blend', 'none'].includes(mode)) {
      this.overrideMode = mode;
    }
  }

  applyBlinkOverride(weight) {
    this.overrides.blink = { active: true, weight };
    this.expressionSystem.setValue('blink', weight);
  }

  releaseBlinkOverride() {
    this.overrides.blink = { active: false, weight: 0 };
  }

  applyMouthOverride(weight) {
    this.overrides.mouth = { active: true, weight };
    this.expressionSystem.setValue('aa', weight);
  }

  releaseMouthOverride() {
    this.overrides.mouth = { active: false, weight: 0 };
  }

  isOverrideActive(type) {
    return this.overrides[type]?.active || false;
  }

  getOverrideValue(type) {
    return this.overrides[type]?.weight || 0;
  }

  releaseAll() {
    for (const key of Object.keys(this.overrides)) {
      this.overrides[key] = { active: false, weight: 0 };
    }
  }

  dispose() {
    this.releaseAll();
    this.expressionSystem = null;
  }
}

class IdleAnimationController {
  constructor(expressionSystem, options = {}) {
    this.expressionSystem = expressionSystem;
    this.options = {
      blinkInterval: 3000,
      blinkDuration: 150,
      blinkVariation: 500,
      breathAmplitude: 0.02,
      breathSpeed: 0.001,
      microMovementEnabled: true,
      microMovementAmplitude: 0.005,
      ...options
    };

    this._blinkTimer = null;
    this._blinkTimeout = null;
    this._breathAnimationId = null;
    this._microMovementId = null;
    this._isRunning = false;
    this._breathPhase = 0;
    this._microPhase = 0;
  }

  start() {
    if (this._isRunning) return;
    this._isRunning = true;

    this._startBlink();
    this._startBreath();
    if (this.options.microMovementEnabled) {
      this._startMicroMovement();
    }
  }

  stop() {
    this._isRunning = false;
    this._stopBlink();
    this._stopBreath();
    this._stopMicroMovement();
  }

  _startBlink() {
    const scheduleNext = () => {
      if (!this._isRunning) return;

      const variation = (Math.random() - 0.5) * this.options.blinkVariation;
      const interval = Math.max(1000, this.options.blinkInterval + variation);

      this._blinkTimer = setTimeout(() => {
        this._doBlink();
        scheduleNext();
      }, interval);
    };

    scheduleNext();
  }

  _doBlink() {
    if (!this._isRunning) return;

    this._clearPendingBlinkTimeouts();

    const useSeparateBlinks = Math.random() > 0.7;

    if (useSeparateBlinks) {
      const leftFirst = Math.random() > 0.5;
      if (leftFirst) {
        this.expressionSystem.setValue('blinkLeft', 1.0);
        this._blinkTimeout1 = setTimeout(() => {
          if (!this._isRunning) return;
          this.expressionSystem.setValue('blinkRight', 1.0);
          this._blinkTimeout2 = setTimeout(() => {
            if (!this._isRunning) return;
            this.expressionSystem.setValue('blinkLeft', 0);
            this.expressionSystem.setValue('blinkRight', 0);
            this._blinkTimeout2 = null;
          }, this.options.blinkDuration);
          this._blinkTimeout1 = null;
        }, 50);
      } else {
        this.expressionSystem.setValue('blinkRight', 1.0);
        this._blinkTimeout1 = setTimeout(() => {
          if (!this._isRunning) return;
          this.expressionSystem.setValue('blinkLeft', 1.0);
          this._blinkTimeout2 = setTimeout(() => {
            if (!this._isRunning) return;
            this.expressionSystem.setValue('blinkLeft', 0);
            this.expressionSystem.setValue('blinkRight', 0);
            this._blinkTimeout2 = null;
          }, this.options.blinkDuration);
          this._blinkTimeout1 = null;
        }, 50);
      }
    } else {
      this.expressionSystem.setValue('blink', 1.0);
      this._blinkTimeout = setTimeout(() => {
        if (!this._isRunning) return;
        this.expressionSystem.setValue('blink', 0);
        this._blinkTimeout = null;
      }, this.options.blinkDuration);
    }
  }

  _clearPendingBlinkTimeouts() {
    if (this._blinkTimeout) { clearTimeout(this._blinkTimeout); this._blinkTimeout = null; }
    if (this._blinkTimeout1) { clearTimeout(this._blinkTimeout1); this._blinkTimeout1 = null; }
    if (this._blinkTimeout2) { clearTimeout(this._blinkTimeout2); this._blinkTimeout2 = null; }
  }

  _stopBlink() {
    if (this._blinkTimer) {
      clearTimeout(this._blinkTimer);
      this._blinkTimer = null;
    }
    this._clearPendingBlinkTimeouts();
    this.expressionSystem.setValue('blink', 0);
    this.expressionSystem.setValue('blinkLeft', 0);
    this.expressionSystem.setValue('blinkRight', 0);
  }

  _startBreath() {
    if (!this.expressionSystem.vrm || !this.expressionSystem.vrm.humanoid) return;

    const animate = () => {
      if (!this._isRunning) return;

      this._breathPhase += this.options.breathSpeed;
      const breathValue = Math.sin(this._breathPhase) * this.options.breathAmplitude;

      try {
        const chest = this.expressionSystem.vrm.humanoid.getNormalizedBoneNode('chest');
        if (chest) {
          chest.position.y = breathValue;
        }
      } catch (e) {
        // 骨骼可能不存在
      }

      this._breathAnimationId = requestAnimationFrame(animate);
    };

    this._breathAnimationId = requestAnimationFrame(animate);
  }

  _stopBreath() {
    if (this._breathAnimationId) {
      cancelAnimationFrame(this._breathAnimationId);
      this._breathAnimationId = null;
    }

    try {
      if (this.expressionSystem.vrm && this.expressionSystem.vrm.humanoid) {
        const chest = this.expressionSystem.vrm.humanoid.getNormalizedBoneNode('chest');
        if (chest) {
          chest.position.y = 0;
        }
      }
    } catch (e) {}
  }

  _startMicroMovement() {
    if (!this.expressionSystem.vrm) return;

    const animate = () => {
      if (!this._isRunning) return;

      this._microPhase += 0.0005;
      const x = Math.sin(this._microPhase) * this.options.microMovementAmplitude;
      const y = Math.cos(this._microPhase * 0.7) * this.options.microMovementAmplitude;

      try {
        if (this.expressionSystem.vrm.scene) {
          this.expressionSystem.vrm.scene.rotation.y = x;
          this.expressionSystem.vrm.scene.rotation.x = y * 0.5;
        }
      } catch (e) {}

      this._microMovementId = requestAnimationFrame(animate);
    };

    this._microMovementId = requestAnimationFrame(animate);
  }

  _stopMicroMovement() {
    if (this._microMovementId) {
      cancelAnimationFrame(this._microMovementId);
      this._microMovementId = null;
    }

    try {
      if (this.expressionSystem.vrm && this.expressionSystem.vrm.scene) {
        this.expressionSystem.vrm.scene.rotation.y = 0;
        this.expressionSystem.vrm.scene.rotation.x = 0;
      }
    } catch (e) {}
  }

  updateOptions(newOptions) {
    this.options = { ...this.options, ...newOptions };
  }

  dispose() {
    this.stop();
    this.expressionSystem = null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BlendShapeExpressionSystem, ExpressionOverrideSystem, IdleAnimationController };
}

if (typeof window !== 'undefined') {
  window.BlendShapeExpressionSystem = BlendShapeExpressionSystem;
  window.ExpressionOverrideSystem = ExpressionOverrideSystem;
  window.IdleAnimationController = IdleAnimationController;
}
