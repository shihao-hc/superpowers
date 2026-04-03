class VRMComponent {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.container = null;
    this.canvas = null;
    this.renderer = null;
    this.camera = null;
    this.scene = null;
    this.vrm = null;
    this.clock = null;
    this.animationId = null;
    this.isInitialized = false;
    this.isSpeaking = false;
    this.currentMood = 'neutral';
    this.modelParams = null;
    this.idleAnimationConfig = null;
    this.expressionSystem = null;
    this.overrideSystem = null;
    this.idleController = null;
    this._lookAtTarget = null;
    this._mouseX = 0;
    this._mouseY = 0;
    this._targetRotationX = 0;
    this._targetRotationY = 0;
    this._currentRotationX = 0;
    this._currentRotationY = 0;
    this._isVisible = true;
    this._frameCount = 0;
    this._lastRenderTime = 0;
    this._cachedPixelRatio = null;
    this._resizeObserver = null;
    this._intersectionObserver = null;
    this._initPromise = null;
    this.useFallback = false;

    this.options = {
      enableMouseTracking: true,
      enableIdleAnimation: true,
      enableLipSync: true,
      enableLookAt: true,
      mobileFallback: true,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
      backgroundColor: 'transparent',
      lodEnabled: true,
      frustumCulling: true,
      visibilityCulling: true,
      targetFPS: 60,
      blinkInterval: 3000,
      blinkDuration: 150,
      breathAmplitude: 0.02,
      breathSpeed: 0.001,
      microMovementEnabled: true,
      ...options
    };
  }

  static isSupported() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
      return !!gl;
    } catch (e) {
      return false;
    }
  }

  static isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  static isLowPerformance() {
    if (typeof navigator.hardwareConcurrency !== 'undefined') {
      return navigator.hardwareConcurrency <= 2;
    }
    return VRMComponent.isMobileDevice();
  }

  shouldUseFallback() {
    if (!this.options.mobileFallback) return false;
    if (!VRMComponent.isSupported()) return true;
    return VRMComponent.isLowPerformance();
  }

  _getLODPixelRatio() {
    if (!this.options.lodEnabled) return this.options.pixelRatio;
    
    const isMobile = VRMComponent.isMobileDevice();
    const isLowPerf = VRMComponent.isLowPerformance();
    
    if (isLowPerf) return 0.75;
    if (isMobile) return 1.0;
    return Math.min(this.options.pixelRatio, 2.0);
  }

  _setupVisibilityCulling() {
    if (!this.options.visibilityCulling || !this.container) return;

    if ('IntersectionObserver' in window) {
      this._intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          this._isVisible = entry.isIntersecting;
        });
      }, { threshold: 0.1 });
      this._intersectionObserver.observe(this.container);
    }
  }

  _setupResizeObserver() {
    if (!this.container || typeof ResizeObserver === 'undefined') return;

    this._resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this._resizeObserver.observe(this.container);
  }

  setModelParams(params) {
    this.modelParams = params;
    if (this.expressionSystem && params) {
      this.expressionSystem.currentExpressions = { ...params };
    }
  }

  setIdleAnimation(config) {
    this.idleAnimationConfig = config || {
      blinkInterval: this.options.blinkInterval,
      blinkDuration: this.options.blinkDuration,
      breathAmplitude: this.options.breathAmplitude,
      breathSpeed: this.options.breathSpeed,
      microMovementEnabled: this.options.microMovementEnabled
    };
  }

  async init(vrmUrl, personalityConfig) {
    if (this.isInitialized) {
      console.warn('VRM already initialized');
      return;
    }

    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = this._doInit(vrmUrl, personalityConfig);
    return this._initPromise;
  }

  async _doInit(vrmUrl, personalityConfig) {
    this.container = document.getElementById(this.containerId);
    if (!this.container) {
      console.error(`Container #${this.containerId} not found`);
      this._initPromise = null;
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
      console.log('低性能设备检测到，使用 SVG 降级');
      this.loadFallbackMode();
      this._initPromise = null;
      return;
    }

    if (typeof THREE === 'undefined') {
      console.error('Three.js 未加载');
      this.loadFallbackMode();
      this._initPromise = null;
      return;
    }

    try {
      await this._initThreeJS();
      await this._loadVRM(vrmUrl);
      this.isInitialized = true;

      this._initExpressionSystem();

      console.log('VRM 初始化成功');
      this._startRenderLoop();

      if (this.options.enableIdleAnimation) {
        this._startIdleAnimation();
      }

      this._setupVisibilityCulling();
      this._setupResizeObserver();

    } catch (error) {
      console.error('VRM 初始化失败:', error);
      this.loadFallbackMode();
    } finally {
      this._initPromise = null;
    }
  }

  _initExpressionSystem() {
    if (!this.vrm) return;

    if (typeof BlendShapeExpressionSystem !== 'undefined') {
      this.expressionSystem = new BlendShapeExpressionSystem(this.vrm, this._customBlendMap);

      if (typeof ExpressionOverrideSystem !== 'undefined') {
        this.overrideSystem = new ExpressionOverrideSystem(this.expressionSystem);
      }

      if (this.modelParams) {
        this.expressionSystem.currentExpressions = { ...this.modelParams };
      }

      this._optimizeMaterials();
    }
  }

  setCustomBlendMap(blendMap) {
    this._customBlendMap = blendMap;
    if (this.expressionSystem) {
      this.expressionSystem.setCustomBlendMap(blendMap);
    }
  }

  _optimizeMaterials() {
    if (!this.vrm || !this.vrm.scene) return;

    const isMobile = VRMComponent.isMobileDevice();

    this.vrm.scene.traverse((child) => {
      if (child.isMesh) {
        if (isMobile) {
          child.castShadow = false;
          child.receiveShadow = false;
        }

        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              if (mat.transparent && mat.opacity > 0.99) {
                mat.transparent = false;
              }
            });
          } else {
            if (child.material.transparent && child.material.opacity > 0.99) {
              child.material.transparent = false;
            }
          }
        }
      }
    });
  }

  async _initThreeJS() {
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.display = 'block';
    this.container.innerHTML = '';
    this.container.appendChild(this.canvas);

    this._cachedPixelRatio = this._getLODPixelRatio();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: !VRMComponent.isMobileDevice()
    });
    this.renderer.setPixelRatio(this._cachedPixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    
    if (this.options.frustumCulling) {
      this.renderer.frustumCulled = true;
    }

    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 400;
    this.renderer.setSize(width, height);

    this.camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
    this.camera.position.set(0, 1.2, 2);
    this.camera.lookAt(0, 1, 0);

    this.scene = new THREE.Scene();

    this._setupLighting();

    this.clock = new THREE.Clock();

    if (this.options.enableMouseTracking) {
      this._setupMouseTracking();
    }
  }

  _setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 2, 2);
    directionalLight.castShadow = !VRMComponent.isMobileDevice();
    this.scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-1, 1, -1);
    this.scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.4);
    rimLight.position.set(0, 2, -2);
    this.scene.add(rimLight);
  }

  _setupMouseTracking() {
    if (!this.container) return;

    this._mouseMoveHandler = (event) => {
      const rect = this.container.getBoundingClientRect();
      this._mouseX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this._mouseY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };

    this.container.addEventListener('mousemove', this._mouseMoveHandler);
  }

  _updateLookAt() {
    if (!this.vrm || !this.options.enableLookAt) return;

    try {
      if (this.vrm.lookAt) {
        this._targetRotationY = this._mouseX * 0.3;
        this._targetRotationX = this._mouseY * 0.2;

        this._currentRotationX += (this._targetRotationX - this._currentRotationX) * 0.05;
        this._currentRotationY += (this._targetRotationY - this._currentRotationY) * 0.05;

        if (this.vrm.lookAt.applyer) {
          const yaw = this._currentRotationY * 30;
          const pitch = this._currentRotationX * 20;
          
          if (typeof this.vrm.lookAt.applyer === 'function') {
            this.vrm.lookAt.applyer(yaw, pitch);
          }
        }
      }
    } catch (error) {
      // LookAt 可能不支持
    }
  }

  async _loadVRM(vrmUrl) {
    return new Promise((resolve, reject) => {
      if (typeof GLTFLoader === 'undefined') {
        reject(new Error('GLTFLoader 未加载'));
        return;
      }

      const loader = new GLTFLoader();

      if (typeof VRMLoaderPlugin !== 'undefined') {
        loader.register((parser) => {
          return new VRMLoaderPlugin(parser);
        });
      } else if (typeof THREE.VRMLoaderPlugin !== 'undefined') {
        loader.register((parser) => {
          return new THREE.VRMLoaderPlugin(parser);
        });
      } else {
        reject(new Error('VRMLoaderPlugin 未加载'));
        return;
      }

      loader.load(
        vrmUrl,
        (gltf) => {
          this.vrm = gltf.userData.vrm;
          if (this.vrm) {
            this.scene.add(this.vrm.scene);
            if (this.vrm.meta) {
              console.log('VRM 模型:', this.vrm.meta.title || 'Unknown');
            }
            resolve(this.vrm);
          } else {
            reject(new Error('VRM 数据未找到'));
          }
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  _startRenderLoop() {
    const targetFrameTime = 1000 / this.options.targetFPS;

    const animate = (timestamp) => {
      if (!this.isInitialized) return;
      
      this._frameCount++;
      
      if (!this._isVisible && this.options.visibilityCulling) {
        this._throttleTimer = setTimeout(() => {
          if (this.isInitialized) {
            this.animationId = requestAnimationFrame(animate);
          }
        }, 500);
        return;
      }

      const elapsed = timestamp - this._lastRenderTime;
      if (elapsed < targetFrameTime) {
        this.animationId = requestAnimationFrame(animate);
        return;
      }
      this._lastRenderTime = timestamp;

      if (this.vrm) {
        const delta = this.clock ? this.clock.getDelta() : 0.016;
        
        this._updateLookAt();
        
        if (this.vrm.update) {
          this.vrm.update(delta);
        }
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
      
      this.animationId = requestAnimationFrame(animate);
    };
    
    this._lastRenderTime = performance.now();
    this.animationId = requestAnimationFrame(animate);
  }

  _startIdleAnimation() {
    if (!this.expressionSystem) {
      console.warn('表达式系统未初始化，跳过空闲动画');
      return;
    }

    if (typeof IdleAnimationController === 'undefined') {
      console.warn('IdleAnimationController 未加载');
      return;
    }

    const config = this.idleAnimationConfig || {};
    this.idleController = new IdleAnimationController(this.expressionSystem, {
      blinkInterval: config.blinkInterval || this.options.blinkInterval,
      blinkDuration: config.blinkDuration || this.options.blinkDuration,
      blinkVariation: config.blinkVariation || 500,
      breathAmplitude: config.breathAmplitude || this.options.breathAmplitude,
      breathSpeed: config.breathSpeed || this.options.breathSpeed,
      microMovementEnabled: config.microMovementEnabled !== undefined ? config.microMovementEnabled : this.options.microMovementEnabled,
      microMovementAmplitude: config.microMovementAmplitude || 0.005
    });

    this.idleController.start();
  }

  _stopIdleAnimation() {
    if (this.idleController) {
      this.idleController.stop();
      this.idleController.dispose();
      this.idleController = null;
    }
    if (this._breathAnimationId) {
      cancelAnimationFrame(this._breathAnimationId);
      this._breathAnimationId = null;
    }
  }

  loadFallbackMode() {
    this.useFallback = true;
    this.isInitialized = true;

    this.container.innerHTML = `
      <div class="live2d-fallback">
        <div class="fallback-avatar" id="vrm-fallback-avatar">
          <div class="fallback-glow"></div>
        </div>
        <div class="fallback-label">VRM 预览模式</div>
      </div>
    `;
  }

  setMood(mood, useTransition = false) {
    this.currentMood = mood;

    if (this.useFallback) {
      this._updateFallbackGlow(mood);
      return;
    }

    if (!this.vrm) return;

    if (this.expressionSystem) {
      if (useTransition) {
        this.expressionSystem.transitionTo(mood, 300);
      } else {
        this.expressionSystem.applyMood(mood);
      }
    }
  }

  _setExpressionValue(name, value) {
    if (!this.vrm) return;

    if (this.expressionSystem) {
      this.expressionSystem.setValue(name, value);
      return;
    }

    try {
      if (this.vrm.expressionManager) {
        this.vrm.expressionManager.setValue(name, Math.max(0, Math.min(1, value)));
        this.vrm.expressionManager.update();
      } else if (this.vrm.blendShapeProxy) {
        this.vrm.blendShapeProxy.setValue(name, Math.max(0, Math.min(1, value)));
        this.vrm.blendShapeProxy.update();
      }
    } catch (error) {
      console.debug(`表达式 ${name} 设置失败:`, error.message);
    }
  }

  speak() {
    this.isSpeaking = true;
    if (this.useFallback) {
      this._startFallbackSpeakingAnimation();
      return;
    }

    if (this.expressionSystem) {
      this.expressionSystem.setLipSync(0.8);
    } else {
      this._setMouthOpen(true);
    }
  }

  stopSpeaking() {
    this.isSpeaking = false;
    if (this.useFallback) {
      this._stopFallbackSpeakingAnimation();
      return;
    }

    if (this.expressionSystem) {
      this.expressionSystem.setLipSync(0);
    } else {
      this._setMouthOpen(false);
    }
  }

  _setMouthOpen(isOpen) {
    if (!this.vrm) return;

    if (this.expressionSystem) {
      this.expressionSystem.setValue('aa', isOpen ? 0.8 : 0);
      return;
    }

    try {
      if (this.vrm.expressionManager) {
        this.vrm.expressionManager.setValue('aa', isOpen ? 0.8 : 0);
        this.vrm.expressionManager.update();
      } else if (this.vrm.blendShapeProxy) {
        this.vrm.blendShapeProxy.setValue('A', isOpen ? 0.8 : 0);
        this.vrm.blendShapeProxy.update();
      }
    } catch (error) {
      console.debug('嘴型设置失败:', error.message);
    }
  }

  setLipSyncValue(value) {
    if (!this.vrm || this.useFallback) return;

    const clampedValue = Math.max(0, Math.min(1, value));

    if (this.expressionSystem) {
      this.expressionSystem.setLipSync(clampedValue);
      return;
    }

    try {
      if (this.vrm.expressionManager) {
        this.vrm.expressionManager.setValue('aa', clampedValue);
        this.vrm.expressionManager.update();
      } else if (this.vrm.blendShapeProxy) {
        this.vrm.blendShapeProxy.setValue('A', clampedValue);
        this.vrm.blendShapeProxy.update();
      }
    } catch (error) {
      // 可能不支持
    }
  }

  setLipSyncPhoneme(phoneme, value) {
    if (!this.vrm || this.useFallback) return;

    if (this.expressionSystem) {
      this.expressionSystem.setLipSyncPhoneme(phoneme, value);
    }
  }

  _startFallbackSpeakingAnimation() {
    const avatar = document.getElementById('vrm-fallback-avatar');
    if (avatar) avatar.classList.add('speaking');
  }

  _stopFallbackSpeakingAnimation() {
    const avatar = document.getElementById('vrm-fallback-avatar');
    if (avatar) avatar.classList.remove('speaking');
  }

  _updateFallbackGlow(mood) {
    const glow = document.querySelector('#vrm-fallback-avatar .fallback-glow');
    if (glow) {
      const colors = {
        happy: 'rgba(255, 215, 0, 0.3)',
        sad: 'rgba(100, 149, 237, 0.3)',
        excited: 'rgba(255, 105, 180, 0.3)',
        neutral: 'rgba(200, 200, 200, 0.2)'
      };
      glow.style.background = `radial-gradient(circle, ${colors[mood] || colors.neutral} 0%, transparent 70%)`;
    }
  }

  resize() {
    if (!this.container || !this.camera || !this.renderer) return;

    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 400;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  destroy() {
    this.isInitialized = false;
    
    this._stopIdleAnimation();

    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    if (this._throttleTimer) {
      clearTimeout(this._throttleTimer);
      this._throttleTimer = null;
    }

    if (this._mouseMoveHandler) {
      const el = this.container || document;
      el.removeEventListener('mousemove', this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
      this._intersectionObserver = null;
    }

    if (this.overrideSystem) {
      this.overrideSystem.dispose();
      this.overrideSystem = null;
    }

    if (this.expressionSystem) {
      this.expressionSystem.dispose();
      this.expressionSystem = null;
    }

    if (this.vrm) {
      if (this.vrm.scene && this.scene) {
        this.scene.remove(this.vrm.scene);
      }
      if (this.vrm.dispose) {
        this.vrm.dispose();
      }
      this.vrm = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }

    if (this.container) {
      this.container.innerHTML = '';
    }

    this.scene = null;
    this.camera = null;
    this.clock = null;
    this.canvas = null;
    this.modelParams = null;
    this.idleAnimationConfig = null;
    this._initPromise = null;
  }
}

if (typeof window !== 'undefined') {
  window.VRMComponent = VRMComponent;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VRMComponent;
}
