class Live2DComponent {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.oml2d = null;
    this.currentModel = null;
    this.currentMood = 'neutral';
    this.isInitialized = false;
    this.isSpeaking = false;
    this.modelParams = null;
    this.idleAnimation = null;
    this.idleTimer = null;
    this.blinkTimer = null;
    
    this.options = {
      enableLipSync: true,
      enableMouseTracking: true,
      enableTapInteraction: true,
      defaultScale: 0.1,
      defaultPosition: [0, 0],
      enableIdleAnimation: true,
      mobileFallback: true,
      ...options
    };

    this.moodExpressionMap = {
      happy: ['Happy', 'Joy'],
      sad: ['Sad', 'Cry'],
      excited: ['Excited', 'Happy'],
      curious: ['Thinking', 'Neutral'],
      calm: ['Neutral', 'Idle'],
      shy: ['Shy', 'Blushing'],
      proud: ['Proud', 'Happy'],
      neutral: ['Neutral', 'Idle'],
      angry: ['Angry', 'Annoyed'],
      scared: ['Scared', 'Sad'],
      love: ['Love', 'Happy'],
      sleepy: ['Sleepy', 'Neutral'],
      funny: ['Happy', 'Excited'],
      sarcastic: ['Sarcastic', 'Neutral'],
      silly: ['Silly', 'Happy'],
      mischievous: ['Mischievous', 'Happy'],
      thoughtful: ['Thinking', 'Neutral'],
      focused: ['Focused', 'Neutral'],
      gentle: ['Gentle', 'Neutral'],
      caring: ['Caring', 'Happy'],
      worried: ['Worried', 'Sad'],
      melancholy: ['Sad', 'Neutral'],
      joyful: ['Joyful', 'Happy'],
      analytical: ['Neutral', 'Focused'],
      efficient: ['Efficient', 'Neutral'],
      upgrading: ['Neutral', 'Idle'],
      combat: ['Excited', 'Angry'],
      playful: ['Playful', 'Happy'],
      hungry: ['Hungry', 'Neutral'],
      amused: ['Amused', 'Happy'],
      serious: ['Serious', 'Neutral'],
      playful_happy: ['Playful', 'Happy'],
      sleepy_calm: ['Sleepy', 'Neutral']
    };

    this.motionMap = {
      idle: 'Idle',
      tap: 'Tap',
      tapHead: 'Taphead',
      speaking: 'Speaking',
      happy: 'Happy',
      sad: 'Sad',
      excited: 'Exciting'
    };

    this.moodColors = {
      happy: 'rgba(255, 215, 0, 0.3)',
      sad: 'rgba(100, 149, 237, 0.3)',
      excited: 'rgba(255, 105, 180, 0.3)',
      curious: 'rgba(147, 112, 219, 0.3)',
      calm: 'rgba(135, 206, 250, 0.3)',
      shy: 'rgba(255, 182, 193, 0.3)',
      proud: 'rgba(255, 215, 0, 0.4)',
      neutral: 'rgba(200, 200, 200, 0.2)',
      angry: 'rgba(255, 69, 0, 0.3)',
      scared: 'rgba(138, 43, 226, 0.3)',
      love: 'rgba(255, 105, 180, 0.4)',
      sleepy: 'rgba(176, 224, 230, 0.3)',
      funny: 'rgba(255, 165, 0, 0.3)',
      playful: 'rgba(255, 192, 203, 0.3)'
    };

    this.defaultParams = {
      ParamMouthForm: 0,
      ParamMouthOpenY: 0,
      ParamEyeLOpen: 0.8,
      ParamEyeROpen: 0.8,
      ParamEyeLSmile: 0,
      ParamEyeRSmile: 0,
      ParamBreath: 0
    };
  }

  static isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  static isLowPerformance() {
    if (typeof navigator.hardwareConcurrency !== 'undefined') {
      return navigator.hardwareConcurrency <= 2;
    }
    return Live2DComponent.isMobileDevice();
  }

  shouldUseFallback() {
    if (!this.options.mobileFallback) return false;
    return Live2DComponent.isLowPerformance();
  }

  setModelParams(params) {
    this.modelParams = params;
  }

  setIdleAnimation(config) {
    this.idleAnimation = config || {
      blinkInterval: 3000,
      breathAmplitude: 0.02,
      breathSpeed: 0.001
    };
  }

  async init(modelPath, personalityConfig) {
    if (this.isInitialized) {
      console.warn('Live2D already initialized');
      return;
    }

    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error(`Container #${this.containerId} not found`);
      return;
    }

    if (personalityConfig) {
      if (personalityConfig.modelParams) {
        this.setModelParams(personalityConfig.modelParams);
      }
      if (personalityConfig.idleAnimation) {
        this.setIdleAnimation(personalityConfig.idleAnimation);
      }
    }

    if (this.shouldUseFallback()) {
      console.log('Mobile/low-performance device detected, using fallback');
      this.loadFallbackMode();
      return;
    }

    if (typeof OML2D === 'undefined') {
      console.error('oh-my-live2d not loaded. Add CDN script to index.html');
      this.loadFallbackMode();
      return;
    }

    try {
      this.oml2d = await OML2D.loadOml2d({
        models: [{
          path: modelPath,
          position: this.options.defaultPosition,
          scale: this.options.defaultScale
        }],
        mobileScale: 0.8,
        react: true,
        demoMode: false
      });

      this.currentModel = modelPath;
      this.isInitialized = true;
      console.log('Live2D initialized successfully');

      if (this.options.enableTapInteraction) {
        this.setupTapInteraction();
      }

      if (this.options.enableMouseTracking) {
        this.setupMouseTracking();
      }

      if (this.options.enableIdleAnimation) {
        this.startIdleAnimation();
      }

    } catch (error) {
      console.error('Failed to initialize Live2D:', error);
      this.loadFallbackMode();
    }
  }

  startIdleAnimation() {
    if (!this.idleAnimation) return;

    this.blinkTimer = setInterval(() => {
      this.blink();
    }, this.idleAnimation.blinkInterval);

    this.startBreathAnimation();
  }

  stopIdleAnimation() {
    if (this.blinkTimer) {
      clearInterval(this.blinkTimer);
      this.blinkTimer = null;
    }
    if (this.blinkTimeout) {
      clearTimeout(this.blinkTimeout);
      this.blinkTimeout = null;
    }
    if (this.idleTimer) {
      cancelAnimationFrame(this.idleTimer);
      this.idleTimer = null;
    }
  }

  blink() {
    if (!this.oml2d || this.isSpeaking) return;

    try {
      if (typeof this.oml2d.setParameter === 'function') {
        this.oml2d.setParameter('ParamEyeLOpen', 0);
        this.oml2d.setParameter('ParamEyeROpen', 0);

        if (this.blinkTimeout) {
          clearTimeout(this.blinkTimeout);
        }
        this.blinkTimeout = setTimeout(() => {
          if (this.oml2d) {
            const eyeOpen = this.modelParams?.[this.currentMood]?.ParamEyeLOpen || 0.8;
            this.oml2d.setParameter('ParamEyeLOpen', eyeOpen);
            this.oml2d.setParameter('ParamEyeROpen', eyeOpen);
          }
          this.blinkTimeout = null;
        }, 150);
      }
    } catch (error) {
      console.debug('Blink not supported:', error.message);
    }
  }

  startBreathAnimation() {
    if (!this.oml2d || !this.idleAnimation) return;

    let phase = 0;
    const amplitude = this.idleAnimation.breathAmplitude || 0.02;
    const speed = this.idleAnimation.breathSpeed || 0.001;

    const animate = () => {
      if (!this.isInitialized || this.isSpeaking) {
        this.idleTimer = requestAnimationFrame(animate);
        return;
      }

      phase += speed;
      const breathValue = Math.sin(phase) * amplitude;

      try {
        if (this.oml2d && typeof this.oml2d.setParameter === 'function') {
          this.oml2d.setParameter('ParamBreath', breathValue);
        }
      } catch (error) {
        // Model may not support ParamBreath
      }

      this.idleTimer = requestAnimationFrame(animate);
    };

    this.idleTimer = requestAnimationFrame(animate);
  }

  loadFallbackMode() {
    console.log('Loading Live2D fallback mode (SVG avatars)');
    this.isInitialized = true;
    this.useFallback = true;
    
    this.container.innerHTML = `
      <div class="live2d-fallback">
        <div class="fallback-avatar" id="live2d-fallback-avatar">
          <div class="fallback-glow"></div>
        </div>
        <div class="fallback-label">Live2D 预览模式</div>
      </div>
    `;
  }

  async loadModel(modelPath) {
    if (!this.isInitialized) {
      await this.init(modelPath);
      return;
    }

    if (this.useFallback) {
      console.log('Fallback mode: model change ignored');
      return;
    }

    try {
      await this.oml2d.loadModel(modelPath);
      this.currentModel = modelPath;
    } catch (error) {
      console.error('Failed to load model:', error);
    }
  }

  setMood(mood) {
    this.currentMood = mood;
    
    if (this.useFallback) {
      this.updateFallbackGlow(mood);
      return;
    }

    if (!this.oml2d) return;

    const expressions = this.moodExpressionMap[mood] || ['Neutral'];
    
    try {
      if (this.oml2d.setExpression && typeof this.oml2d.setExpression === 'function') {
        this.oml2d.setExpression(expressions[0]);
      }
    } catch (error) {
      console.debug('Failed to set expression:', error.message);
    }

    if (this.modelParams && this.modelParams[mood]) {
      this.applyModelParams(this.modelParams[mood]);
    }

    this.updateGlowEffect(mood);
  }

  applyModelParams(params) {
    if (!this.oml2d || typeof this.oml2d.setParameter !== 'function') return;

    const safeParams = [
      'ParamMouthForm', 'ParamMouthOpenY',
      'ParamEyeLOpen', 'ParamEyeROpen',
      'ParamEyeLSmile', 'ParamEyeRSmile'
    ];

    for (const [paramName, value] of Object.entries(params)) {
      if (safeParams.includes(paramName) && typeof value === 'number') {
        try {
          this.oml2d.setParameter(paramName, value);
        } catch (error) {
          console.debug(`Parameter ${paramName} not supported:`, error.message);
        }
      }
    }
  }

  resetModelParams() {
    if (!this.oml2d || typeof this.oml2d.setParameter !== 'function') return;

    for (const [paramName, value] of Object.entries(this.defaultParams)) {
      try {
        this.oml2d.setParameter(paramName, value);
      } catch (error) {
        // Parameter may not exist
      }
    }
  }

  async speak(text) {
    this.isSpeaking = true;
    
    if (this.useFallback) {
      this.startFallbackSpeakingAnimation();
      return;
    }

    if (!this.oml2d) {
      this.isSpeaking = false;
      return;
    }

    try {
      if (this.oml2d.startMotion) {
        const motionType = this.currentMood === 'happy' || this.currentMood === 'excited' 
          ? 'Tap' 
          : 'Idle';
        await this.oml2d.startMotion(motionType);
      }
    } catch (error) {
      console.warn('Failed to start motion:', error);
    }

    if (this.options.enableLipSync && this.oml2d.setLipSync) {
      try {
        this.oml2d.setLipSync(true);
      } catch (error) {
        console.warn('Lip sync not supported:', error);
      }
    }
  }

  stopSpeaking() {
    this.isSpeaking = false;
    
    if (this.useFallback) {
      this.stopFallbackSpeakingAnimation();
    }

    if (this.oml2d && this.oml2d.setLipSync) {
      try {
        this.oml2d.setLipSync(false);
      } catch (error) {
        console.warn('Failed to stop lip sync:', error);
      }
    }
  }

  updateGlowEffect(mood) {
    if (!this.container) return;
    
    const canvas = this.container.querySelector('canvas');
    if (canvas) {
      const color = this.moodColors[mood] || this.moodColors.neutral;
      canvas.style.boxShadow = `0 0 30px ${color}`;
    }
  }

  updateFallbackGlow(mood) {
    const glow = document.querySelector('.fallback-glow');
    if (glow) {
      const color = this.moodColors[mood] || this.moodColors.neutral;
      glow.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;
    }
  }

  startFallbackSpeakingAnimation() {
    const avatar = document.getElementById('live2d-fallback-avatar');
    if (avatar) {
      avatar.classList.add('speaking');
    }
  }

  stopFallbackSpeakingAnimation() {
    const avatar = document.getElementById('live2d-fallback-avatar');
    if (avatar) {
      avatar.classList.remove('speaking');
    }
  }

  setupTapInteraction() {
    if (!this.container) return;
    
    this._tapHandler = async (event) => {
      const rect = this.container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      if (this.oml2d && this.oml2d.tap) {
        try {
          await this.oml2d.tap(x, y);
        } catch (error) {
          console.debug('Tap interaction failed:', error.message);
        }
      }

      if (this.onTap) {
        this.onTap({ x, y });
      }
    };
    
    this.container.addEventListener('click', this._tapHandler);
  }

  setupMouseTracking() {
    if (!this.container) return;

    const canvas = this.container.querySelector('canvas');
    if (!canvas) return;

    this._lastX = 0;
    this._lastY = 0;

    this._mouseMoveHandler = (event) => {
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width * 2 - 1;
      const y = -((event.clientY - rect.top) / rect.height * 2 - 1);

      if (Math.abs(x - this._lastX) > 0.01 || Math.abs(y - this._lastY) > 0.01) {
        this._lastX = x;
        this._lastY = y;
        
        if (this.oml2d && this.oml2d.setAngle) {
          try {
            this.oml2d.setAngle('AngleX', x * 30);
            this.oml2d.setAngle('AngleY', y * 30);
          } catch (error) {
            console.debug('setAngle not supported:', error.message);
          }
        }
      }
    };

    this._mouseLeaveHandler = () => {
      if (this.oml2d && this.oml2d.setAngle) {
        try {
          this.oml2d.setAngle('AngleX', 0);
          this.oml2d.setAngle('AngleY', 0);
        } catch (error) {
          console.debug('setAngle reset failed:', error.message);
        }
      }
    };

    canvas.addEventListener('mousemove', this._mouseMoveHandler);
    canvas.addEventListener('mouseleave', this._mouseLeaveHandler);
    this._canvas = canvas;
  }

  destroy() {
    this.stopIdleAnimation();
    
    if (this._tapHandler && this.container) {
      this.container.removeEventListener('click', this._tapHandler);
      this._tapHandler = null;
    }
    
    if (this._mouseMoveHandler && this._canvas) {
      this._canvas.removeEventListener('mousemove', this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }
    
    if (this._mouseLeaveHandler && this._canvas) {
      this._canvas.removeEventListener('mouseleave', this._mouseLeaveHandler);
      this._mouseLeaveHandler = null;
    }
    
    if (this.oml2d && this.oml2d.destroy) {
      try {
        this.oml2d.destroy();
      } catch (error) {
        console.warn('Failed to destroy Live2D:', error.message);
      }
    }
    
    if (this.container) {
      this.container.innerHTML = '';
    }
    
    this.isInitialized = false;
    this.oml2d = null;
    this._canvas = null;
    this.modelParams = null;
    this.idleAnimation = null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Live2DComponent;
}
