/**
 * MixamoAnimationSystem - Mixamo动画集成系统
 * 
 * 功能:
 * - FBX动画加载和播放
 * - VRM骨骼重定向
 * - 动画混合和过渡
 * - 预设动画库
 */

class MixamoAnimationSystem {
  constructor(vrmComponent) {
    this.vrmComponent = vrmComponent;
    this.animations = new Map();
    this.currentAnimation = null;
    this.animationMixer = null;
    this.activeAction = null;
    this.actions = new Map();
    
    this.fbxLoader = null;
    this.mixamoVRMRigMap = this._getMixamoVRMRigMap();
    
    this.animationQueue = [];
    this.isTransitioning = false;
    
    this.builtinAnimations = this._getBuiltinAnimations();
  }

  _getMixamoVRMRigMap() {
    return {
      mixamorigHips: 'Hips',
      mixamorigSpine: 'Spine',
      mixamorigSpine1: 'Spine1',
      mixamorigSpine2: 'Spine2',
      mixamorigNeck: 'Neck',
      mixamorigHead: 'Head',
      mixamorigLeftEye: 'Eye_L',
      mixamorigRightEye: 'Eye_R',
      mixamorigLeftShoulder: 'Shoulder_L',
      mixamorigLeftArm: 'UpperArm_L',
      mixamorigLeftForeArm: 'LowerArm_L',
      mixamorigLeftHand: 'Hand_L',
      mixamorigLeftHandThumb1: 'ThumbProximal_L',
      mixamorigLeftHandThumb2: 'ThumbIntermediate_L',
      mixamorigLeftHandThumb3: 'ThumbDistal_L',
      mixamorigLeftHandIndex1: 'IndexProximal_L',
      mixamorigLeftHandIndex2: 'IndexIntermediate_L',
      mixamorigLeftHandIndex3: 'IndexDistal_L',
      mixamorigLeftHandMiddle1: 'MiddleProximal_L',
      mixamorigLeftHandMiddle2: 'MiddleIntermediate_L',
      mixamorigLeftHandMiddle3: 'MiddleDistal_L',
      mixamorigLeftHandRing1: 'RingProximal_L',
      mixamorigLeftHandRing2: 'RingIntermediate_L',
      mixamorigLeftHandRing3: 'RingDistal_L',
      mixamorigLeftHandPinky1: 'LittleProximal_L',
      mixamorigLeftHandPinky2: 'LittleIntermediate_L',
      mixamorigLeftHandPinky3: 'LittleDistal_L',
      mixamorigRightShoulder: 'Shoulder_R',
      mixamorigRightArm: 'UpperArm_R',
      mixamorigRightForeArm: 'LowerArm_R',
      mixamorigRightHand: 'Hand_R',
      mixamorigRightHandThumb1: 'ThumbProximal_R',
      mixamorigRightHandThumb2: 'ThumbIntermediate_R',
      mixamorigRightHandThumb3: 'ThumbDistal_R',
      mixamorigRightHandIndex1: 'IndexProximal_R',
      mixamorigRightHandIndex2: 'IndexIntermediate_R',
      mixamorigRightHandIndex3: 'IndexDistal_R',
      mixamorigRightHandMiddle1: 'MiddleProximal_R',
      mixamorigRightHandMiddle2: 'MiddleIntermediate_R',
      mixamorigRightHandMiddle3: 'MiddleDistal_R',
      mixamorigRightHandRing1: 'RingProximal_R',
      mixamorigRightHandRing2: 'RingIntermediate_R',
      mixamorigRightHandRing3: 'RingDistal_R',
      mixamorigRightHandPinky1: 'LittleProximal_R',
      mixamorigRightHandPinky2: 'LittleIntermediate_R',
      mixamorigRightHandPinky3: 'LittleDistal_R',
      mixamorigRightUpLeg: 'UpperLeg_R',
      mixamorigRightLeg: 'LowerLeg_R',
      mixamorigRightFoot: 'Foot_R',
      mixamorigRightToeBase: 'Toes_R',
      mixamorigLeftUpLeg: 'UpperLeg_L',
      mixamorigLeftLeg: 'LowerLeg_L',
      mixamorigLeftFoot: 'Foot_L',
      mixamorigLeftToeBase: 'Toes_L'
    };
  }

  _getBuiltinAnimations() {
    return {
      idle: {
        name: 'idle',
        type: 'procedural',
        loop: true,
        duration: 2000,
        priority: 0
      },
      breathing: {
        name: 'breathing',
        type: 'procedural',
        loop: true,
        duration: 3000,
        priority: 0
      },
      blink: {
        name: 'blink',
        type: 'procedural',
        loop: false,
        duration: 150,
        priority: 10
      },
      wave: {
        name: 'wave',
        type: 'gesture',
        loop: false,
        duration: 2000,
        priority: 5
      },
      nod: {
        name: 'nod',
        type: 'gesture',
        loop: false,
        duration: 1000,
        priority: 5
      },
      shake: {
        name: 'shake',
        type: 'gesture',
        loop: false,
        duration: 1500,
        priority: 5
      },
      think: {
        name: 'think',
        type: 'pose',
        loop: false,
        duration: 3000,
        priority: 3
      },
      happy: {
        name: 'happy',
        type: 'motion',
        loop: false,
        duration: 1500,
        priority: 4
      },
      sad: {
        name: 'sad',
        type: 'pose',
        loop: false,
        duration: 2000,
        priority: 4
      },
      excited: {
        name: 'excited',
        type: 'motion',
        loop: false,
        duration: 2000,
        priority: 4
      }
    };
  }

  async initialize() {
    const THREE = await import('three');
    this.THREE = THREE;
    this.animationMixer = new THREE.AnimationMixer(
      this.vrmComponent.vrm?.scene || this.vrmComponent.scene
    );
    
    console.log('[Mixamo] Animation system initialized');
    return true;
  }

  async loadFBX(url, name) {
    if (!this.fbxLoader) {
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
      this.fbxLoader = new FBXLoader();
    }
    
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (fbx) => {
          const clip = this._retargetFBX(fbx, name);
          if (clip) {
            this.animations.set(name, clip);
            this.actions.set(name, this.animationMixer.clipAction(clip));
            console.log(`[Mixamo] Loaded animation: ${name}`);
            resolve(clip);
          } else {
            reject(new Error('Failed to retarget animation'));
          }
        },
        undefined,
        reject
      );
    });
  }

  _retargetFBX(fbx, name) {
    if (!this.vrmComponent.vrm) return null;
    
    const vrm = this.vrmComponent.vrm;
    const humanoid = vrm.humanoid;
    
    if (!humanoid) {
      console.warn('[Mixamo] VRM has no humanoid');
      return null;
    }
    
    const tracks = [];
    const clip = fbx.animations[0];
    
    if (!clip) return null;
    
    clip.tracks.forEach(track => {
      const boneName = track.name.split('.')[0];
      const property = track.name.split('.').pop();
      const vrmBoneName = this.mixamoVRMRigMap[boneName];
      
      if (vrmBoneName) {
        const bone = humanoid.getBoneNode(vrmBoneName);
        if (bone) {
          const newTrack = track.clone();
          newTrack.name = `${bone.name}.${property}`;
          tracks.push(newTrack);
        }
      }
    });
    
    return new this.THREE.AnimationClip(
      name,
      clip.duration,
      tracks
    );
  }

  playAnimation(name, options = {}) {
    const {
      fadeDuration = 0.5,
      weight = 1.0,
      timeScale = 1.0,
      loop = true
    } = options;
    
    const action = this.actions.get(name);
    if (!action) {
      this._playBuiltinAnimation(name, options);
      return;
    }
    
    if (this.activeAction && this.activeAction !== action) {
      this.activeAction.fadeOut(fadeDuration);
    }
    
    action.reset();
    action.setEffectiveWeight(weight);
    action.setEffectiveTimeScale(timeScale);
    action.setLoop(loop ? this.THREE.LoopRepeat : this.THREE.LoopOnce);
    action.clampWhenFinished = !loop;
    action.fadeIn(fadeDuration);
    action.play();
    
    this.activeAction = action;
    this.currentAnimation = name;
  }

  _playBuiltinAnimation(name, options = {}) {
    const animConfig = this.builtinAnimations[name];
    if (!animConfig) return;
    
    switch (animConfig.type) {
      case 'procedural':
        this._playProceduralAnimation(name, options);
        break;
      case 'gesture':
        this._playGestureAnimation(name, options);
        break;
      case 'pose':
        this._playPoseAnimation(name, options);
        break;
      case 'motion':
        this._playMotionAnimation(name, options);
        break;
    }
  }

  _playProceduralAnimation(name, options) {
    const vrm = this.vrmComponent.vrm;
    if (!vrm) return;
    
    switch (name) {
      case 'blink':
        this._performBlink();
        break;
      case 'breathing':
        this._startBreathing();
        break;
      case 'idle':
        this._startIdleAnimation();
        break;
    }
  }

  async _performBlink() {
    if (!this.vrmComponent.expressionManager) return;
    
    const expr = this.vrmComponent.expressionManager;
    const blinkValue = { value: 0 };
    
    await this._animateValue(blinkValue, 1, 100);
    expr.setValue('Blink', 1);
    
    await this._delay(100);
    
    await this._animateValue(blinkValue, 0, 100);
    expr.setValue('Blink', 0);
  }

  _startBreathing() {
    if (!this.vrmComponent.vrm?.humanoid) return;
    
    const spine = this.vrmComponent.vrm.humanoid.getBoneNode('Spine');
    if (!spine) return;
    
    const originalZ = spine.position.z;
    let time = 0;
    
    const breathe = () => {
      time += 0.016;
      const breathOffset = Math.sin(time * 2) * 0.01;
      spine.position.z = originalZ + breathOffset;
      
      if (this.currentAnimation === 'breathing') {
        requestAnimationFrame(breathe);
      }
    };
    
    breathe();
  }

  _playGestureAnimation(name, options) {
    switch (name) {
      case 'wave':
        this._performWave();
        break;
      case 'nod':
        this._performNod();
        break;
      case 'shake':
        this._performHeadShake();
        break;
    }
  }

  async _performWave() {
    if (!this.vrmComponent.vrm?.humanoid) return;
    
    const rightArm = this.vrmComponent.vrm.humanoid.getBoneNode('UpperArm_R');
    const rightForeArm = this.vrmComponent.vrm.humanoid.getBoneNode('LowerArm_R');
    
    if (!rightArm || !rightForeArm) return;
    
    const originalArmRotation = rightArm.rotation.clone();
    const originalForeArmRotation = rightForeArm.rotation.clone();
    
    rightArm.rotation.z = -Math.PI / 2;
    rightForeArm.rotation.x = -Math.PI / 4;
    
    for (let i = 0; i < 6; i++) {
      await this._delay(150);
      rightForeArm.rotation.z = Math.PI / 6;
      await this._delay(150);
      rightForeArm.rotation.z = -Math.PI / 6;
    }
    
    rightArm.rotation.copy(originalArmRotation);
    rightForeArm.rotation.copy(originalForeArmRotation);
  }

  async _performNod() {
    if (!this.vrmComponent.vrm?.humanoid) return;
    
    const head = this.vrmComponent.vrm.humanoid.getBoneNode('Head');
    if (!head) return;
    
    const originalRotation = head.rotation.clone();
    
    await this._animateValue({ get: () => head.rotation.x, set: (v) => head.rotation.x = v }, 0.3, 200);
    await this._delay(100);
    await this._animateValue({ get: () => head.rotation.x, set: (v) => head.rotation.x = v }, -0.1, 100);
    await this._delay(100);
    await this._animateValue({ get: () => head.rotation.x, set: (v) => head.rotation.x = v }, 0.2, 200);
    await this._delay(100);
    await this._animateValue({ get: () => head.rotation.x, set: (v) => head.rotation.x = v }, 0, 200);
  }

  async _performHeadShake() {
    if (!this.vrmComponent.vrm?.humanoid) return;
    
    const head = this.vrmComponent.vrm.humanoid.getBoneNode('Head');
    if (!head) return;
    
    for (let i = 0; i < 3; i++) {
      await this._animateValue({ get: () => head.rotation.y, set: (v) => head.rotation.y = v }, 0.2, 100);
      await this._animateValue({ get: () => head.rotation.y, set: (v) => head.rotation.y = v }, -0.2, 100);
    }
    await this._animateValue({ get: () => head.rotation.y, set: (v) => head.rotation.y = v }, 0, 150);
  }

  _playPoseAnimation(name, options) {
    switch (name) {
      case 'think':
        this._performThinkPose();
        break;
      case 'sad':
        this._performSadPose();
        break;
    }
  }

  _performThinkPose() {
    if (!this.vrmComponent.expressionManager) return;
    
    const expr = this.vrmComponent.expressionManager;
    expr.setValue('Fun', 0.3);
    expr.setValue('Surprised', 0.2);
    
    if (this.vrmComponent.vrm?.humanoid) {
      const head = this.vrmComponent.vrm.humanoid.getBoneNode('Head');
      if (head) {
        head.rotation.z = 0.1;
        head.rotation.x = -0.1;
      }
    }
    
    setTimeout(() => {
      expr.setValue('Fun', 0);
      expr.setValue('Surprised', 0);
    }, 3000);
  }

  _performSadPose() {
    if (!this.vrmComponent.expressionManager) return;
    
    const expr = this.vrmComponent.expressionManager;
    expr.setValue('Sorrow', 0.5);
    expr.setValue('Aaa', 0.2);
    
    if (this.vrmComponent.vrm?.humanoid) {
      const head = this.vrmComponent.vrm.humanoid.getBoneNode('Head');
      const spine = this.vrmComponent.vrm.humanoid.getBoneNode('Spine');
      
      if (head) head.rotation.x = 0.2;
      if (spine) spine.rotation.x = 0.1;
    }
    
    setTimeout(() => {
      expr.setValue('Sorrow', 0);
      expr.setValue('Aaa', 0);
    }, 2000);
  }

  _playMotionAnimation(name, options) {
    switch (name) {
      case 'happy':
        this._performHappyMotion();
        break;
      case 'excited':
        this._performExcitedMotion();
        break;
    }
  }

  async _performHappyMotion() {
    if (!this.vrmComponent.expressionManager) return;
    
    const expr = this.vrmComponent.expressionManager;
    expr.setValue('Joy', 0.8);
    
    await this._delay(500);
    expr.setValue('Joy', 0);
    await this._delay(200);
    expr.setValue('Joy', 0.6);
    await this._delay(400);
    expr.setValue('Joy', 0);
  }

  async _performExcitedMotion() {
    if (!this.vrmComponent.expressionManager) return;
    
    const expr = this.vrmComponent.expressionManager;
    expr.setValue('Joy', 1);
    expr.setValue('Surprised', 0.5);
    
    await this._delay(300);
    expr.setValue('Surprised', 0);
    await this._delay(200);
    expr.setValue('Surprised', 0.5);
    await this._delay(300);
    expr.setValue('Joy', 0.5);
    expr.setValue('Surprised', 0);
    await this._delay(500);
    expr.setValue('Joy', 0);
  }

  stopAnimation(name) {
    const action = this.actions.get(name);
    if (action) {
      action.fadeOut(0.3);
    }
  }

  stopAll() {
    this.actions.forEach(action => {
      action.fadeOut(0.3);
    });
    this.activeAction = null;
    this.currentAnimation = null;
  }

  async _animateValue(target, endValue, duration) {
    return new Promise(resolve => {
      const startValue = typeof target.get === 'function' ? target.get() : target.value;
      const startTime = performance.now();
      
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = this._easeOutCubic(progress);
        const currentValue = startValue + (endValue - startValue) * eased;
        
        if (typeof target.set === 'function') {
          target.set(currentValue);
        } else {
          target.value = currentValue;
        }
        
        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          resolve();
        }
      };
      
      animate();
    });
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  playEmotionAnimation(emotion) {
    const emotionMap = {
      happy: 'happy',
      sad: 'sad',
      angry: 'shake',
      surprised: 'nod',
      shy: 'think',
      excited: 'excited',
      proud: 'happy',
      thinking: 'think',
      sleepy: 'sad',
      neutral: 'idle'
    };
    
    const animName = emotionMap[emotion] || 'idle';
    this.playAnimation(animName);
  }

  getAnimationList() {
    const list = [];
    
    this.animations.forEach((clip, name) => {
      list.push({ name, type: 'fbx', duration: clip.duration });
    });
    
    Object.keys(this.builtinAnimations).forEach(name => {
      list.push({ name, type: 'builtin', duration: this.builtinAnimations[name].duration });
    });
    
    return list;
  }

  update(delta) {
    if (this.animationMixer) {
      this.animationMixer.update(delta);
    }
  }

  destroy() {
    this.stopAll();
    this.animations.clear();
    this.actions.clear();
    this.animationMixer = null;
  }
}

if (typeof window !== 'undefined') {
  window.MixamoAnimationSystem = MixamoAnimationSystem;
}

if (typeof module !== 'undefined') {
  module.exports = { MixamoAnimationSystem };
}
