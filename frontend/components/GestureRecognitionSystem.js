/**
 * GestureRecognitionSystem - 基于MediaPipe Hands的手势识别系统
 * 
 * 功能:
 * - 实时手部追踪
 * - 手势识别(点赞、比心、挥手等)
 * - 手部动作与情感系统联动
 * - VRM模型手势动画映射
 */

class GestureRecognitionSystem {
  constructor(options = {}) {
    this.enabled = options.enabled !== false;
    this.videoElement = options.videoElement || null;
    this.canvasElement = options.canvasElement || null;
    this.onGesture = options.onGesture || (() => {});
    this.onHandDetected = options.onHandDetected || (() => {});
    
    this.hands = null;
    this.camera = null;
    this.isRunning = false;
    this.lastGesture = null;
    this.gestureCooldown = options.gestureCooldown || 500;
    this.lastGestureTime = 0;
    
    this.gestureHistory = [];
    this.maxHistoryLength = 10;
    
    this.gestureDefinitions = this._initGestureDefinitions();
    
    this.handLandmarks = null;
    this.gestureCallback = options.gestureCallback || null;
  }

  _initGestureDefinitions() {
    return {
      // 👍 点赞
      thumbsUp: {
        name: 'thumbs_up',
        emoji: '👍',
        emotion: 'proud',
        description: '点赞/认可',
        check: (landmarks) => {
          const thumbTip = landmarks[4];
          const thumbIP = landmarks[3];
          const indexTip = landmarks[8];
          const indexMCP = landmarks[5];
          const middleTip = landmarks[12];
          const ringTip = landmarks[16];
          const pinkyTip = landmarks[20];
          
          const thumbUp = thumbTip.y < thumbIP.y;
          const fingersFolded = indexTip.y > indexMCP.y &&
                               middleTip.y > landmarks[9].y &&
                               ringTip.y > landmarks[13].y &&
                               pinkyTip.y > landmarks[17].y;
          
          return thumbUp && fingersFolded;
        }
      },
      
      // 🤟 我爱你(ILU)
      ilu: {
        name: 'love_you',
        emoji: '🤟',
        emotion: 'excited',
        description: '我爱你手势',
        check: (landmarks) => {
          const thumb = landmarks[4];
          const index = landmarks[8];
          const middle = landmarks[12];
          const ring = landmarks[16];
          const pinky = landmarks[20];
          
          const indexUp = index.y < landmarks[6].y;
          const middleUp = middle.y < landmarks[10].y;
          const ringUp = ring.y < landmarks[14].y;
          const pinkyUp = pinky.y < landmarks[18].y;
          const thumbLeft = thumb.x < landmarks[3].x;
          
          return indexUp && middleUp && ringUp && pinkyUp && thumbLeft;
        }
      },
      
      // ✌️ 和平/胜利
      peace: {
        name: 'peace',
        emoji: '✌️',
        emotion: 'happy',
        description: '胜利/和平',
        check: (landmarks) => {
          const index = landmarks[8];
          const middle = landmarks[12];
          const ring = landmarks[16];
          const pinky = landmarks[20];
          
          const indexUp = index.y < landmarks[6].y;
          const middleUp = middle.y < landmarks[10].y;
          const ringDown = ring.y > landmarks[14].y;
          const pinkyDown = pinky.y > landmarks[18].y;
          
          return indexUp && middleUp && ringDown && pinkyDown;
        }
      },
      
      // ✋ 高举挥手
      wave: {
        name: 'wave',
        emoji: '✋',
        emotion: 'happy',
        description: '挥手打招呼',
        check: (landmarks, history) => {
          if (history.length < 5) return false;
          
          const recentYs = history.slice(-5).map(h => h.landmarks[0][0].y);
          const avgY = recentYs.reduce((a, b) => a + b, 0) / recentYs.length;
          const variance = recentYs.reduce((sum, y) => sum + Math.pow(y - avgY, 2), 0) / recentYs.length;
          
          const wrist = landmarks[0];
          const isRaised = wrist.y < 0.4;
          const isMoving = variance > 0.0005;
          
          return isRaised && isMoving;
        }
      },
      
      // 👋 挥手告别
      waveBye: {
        name: 'wave_bye',
        emoji: '👋',
        emotion: 'shy',
        description: '挥手告别',
        check: (landmarks, history) => {
          if (history.length < 5) return false;
          
          const recentYs = history.slice(-5).map(h => h.landmarks[0][0].y);
          const avgY = recentYs.reduce((a, b) => a + b, 0) / recentYs.length;
          const variance = recentYs.reduce((sum, y) => sum + Math.pow(y - avgY, 2), 0) / recentYs.length;
          
          const wrist = landmarks[0];
          const isLowered = wrist.y > 0.5;
          const isMoving = variance > 0.0005;
          
          return isLowered && isMoving;
        }
      },
      
      // 🤙 接电话手势
      callMe: {
        name: 'call_me',
        emoji: '🤙',
        emotion: 'curious',
        description: '打电话给我',
        check: (landmarks) => {
          const thumb = landmarks[4];
          const pinky = landmarks[20];
          const index = landmarks[8];
          const middle = landmarks[12];
          
          const thumbPinkyClose = Math.abs(thumb.x - pinky.x) < 0.1 &&
                                  Math.abs(thumb.y - pinky.y) < 0.15;
          const indexMiddleFolded = index.y > landmarks[6].y &&
                                    middle.y > landmarks[10].y;
          
          return thumbPinkyClose && indexMiddleFolded;
        }
      },
      
      // 👊 拳头
      fist: {
        name: 'fist',
        emoji: '👊',
        emotion: 'angry',
        description: '拳头',
        check: (landmarks) => {
          const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
          const mcpY = [landmarks[5].y, landmarks[9].y, landmarks[13].y, landmarks[17].y];
          
          return tips.every((tip, i) => tip.y > mcpY[i]);
        }
      },
      
      // 🤏 捏/精准操作
      pinch: {
        name: 'pinch',
        emoji: '🤏',
        emotion: 'thinking',
        description: '捏取手势',
        check: (landmarks) => {
          const thumb = landmarks[4];
          const index = landmarks[8];
          const distance = Math.sqrt(
            Math.pow(thumb.x - index.x, 2) +
            Math.pow(thumb.y - index.y, 2)
          );
          return distance < 0.06;
        }
      },
      
      // ✋ 暂停/停止
      stop: {
        name: 'stop',
        emoji: '✋',
        emotion: 'surprised',
        description: '停止/暂停',
        check: (landmarks) => {
          const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
          const mcpY = [landmarks[5].y, landmarks[9].y, landmarks[13].y, landmarks[17].y];
          
          return tips.every((tip, i) => tip.y < mcpY[i]);
        }
      },
      
      // 👆 指向
      point: {
        name: 'point',
        emoji: '👆',
        emotion: 'curious',
        description: '指向',
        check: (landmarks) => {
          const index = landmarks[8];
          const indexPIP = landmarks[6];
          const otherTips = [landmarks[12], landmarks[16], landmarks[20]];
          const otherPIPs = [landmarks[10], landmarks[14], landmarks[18]];
          
          const indexExtended = index.y < indexPIP.y;
          const othersFolded = otherTips.every((tip, i) => tip.y > otherPIPs[i]);
          
          return indexExtended && othersFolded;
        }
      },
      
      // 🙏 拜托/祈祷
      pray: {
        name: 'pray',
        emoji: '🙏',
        emotion: 'shy',
        description: '拜托/祈祷',
        check: (landmarks, history, handedness) => {
          if (history.length < 2) return false;
          
          const bothHands = history.some(h => h.handedness === 'Left') &&
                           history.some(h => h.handedness === 'Right');
          
          const thumbs = landmarks.filter((_, i) => [4, 8, 12, 16, 20].includes(i));
          const closeTogether = thumbs.length >= 2;
          
          return bothHands || closeTogether;
        }
      },
      
      // 👍👍 超级点赞
      doubleThumbsUp: {
        name: 'double_thumbs_up',
        emoji: '🔥',
        emotion: 'excited',
        description: '超级点赞',
        check: (landmarks, history) => {
          if (history.length < 2) return false;
          
          const hands = history.slice(-2);
          if (hands.length < 2) return false;
          
          const firstThumbsUp = hands[0].gesture?.name === 'thumbs_up';
          const secondThumbsUp = hands[1]?.gesture?.name === 'thumbs_up';
          
          return firstThumbsUp && secondThumbsUp;
        }
      }
    };
  }

  async initialize() {
    if (!this.enabled) return;
    
    try {
      const { Hands } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js');
      const { Camera } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');
      const { drawConnectors, drawLandmarks } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.3.1675466124/drawing_utils.js');
      const { HAND_CONNECTIONS } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands_connections.js');
      
      this.Hands = Hands;
      this.Camera = Camera;
      this.drawConnectors = drawConnectors;
      this.drawLandmarks = drawLandmarks;
      this.HAND_CONNECTIONS = HAND_CONNECTIONS;
      
      this.hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`
      });
      
      this.hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
      });
      
      this.hands.onResults((results) => this._onResults(results));
      
      if (this.canvasElement) {
        this.ctx = this.canvasElement.getContext('2d');
      }
      
      console.log('[Gesture] MediaPipe Hands initialized');
      return true;
    } catch (error) {
      console.error('[Gesture] Failed to initialize:', error);
      this.enabled = false;
      return false;
    }
  }

  async start(videoElement, canvasElement) {
    if (!this.enabled || this.isRunning) return;
    
    this.videoElement = videoElement || this.videoElement;
    this.canvasElement = canvasElement || this.canvasElement;
    
    if (!this.videoElement) {
      console.error('[Gesture] No video element provided');
      return false;
    }
    
    if (!this.hands) {
      const initialized = await this.initialize();
      if (!initialized) return false;
    }
    
    this.camera = new this.Camera(this.videoElement, {
      onFrame: async () => {
        await this.hands.send({ image: this.videoElement });
      },
      width: 640,
      height: 480
    });
    
    await this.camera.start();
    this.isRunning = true;
    console.log('[Gesture] Recognition started');
    return true;
  }

  stop() {
    if (this.camera) {
      this.camera.stop();
      this.camera = null;
    }
    this.isRunning = false;
    console.log('[Gesture] Recognition stopped');
  }

  _onResults(results) {
    if (this.canvasElement && this.ctx) {
      this.ctx.save();
      this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      
      if (results.image) {
        this.ctx.drawImage(results.image, 0, 0, this.canvasElement.width, this.canvasElement.height);
      }
    }
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      for (const landmarks of results.multiHandLandmarks) {
        if (this.canvasElement && this.ctx) {
          this.drawConnectors(this.ctx, landmarks, this.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
          this.drawLandmarks(this.ctx, landmarks, { color: '#FF0000', lineWidth: 1, radius: 3 });
        }
        
        this._detectGesture(landmarks);
      }
      
      this.onHandDetected(results.multiHandLandmarks.length);
    } else {
      this.onHandDetected(0);
    }
  }

  _detectGesture(landmarks) {
    const handedness = 'Right';
    const now = Date.now();
    
    if (now - this.lastGestureTime < this.gestureCooldown) {
      return;
    }
    
    let detectedGesture = null;
    
    for (const [gestureName, gestureDef] of Object.entries(this.gestureDefinitions)) {
      try {
        const isMatch = gestureDef.check(landmarks, this.gestureHistory, handedness);
        
        if (isMatch) {
          detectedGesture = {
            ...gestureDef,
            timestamp: now,
            confidence: 1.0
          };
          break;
        }
      } catch (e) {
        // Ignore errors in gesture detection
      }
    }
    
    if (detectedGesture && detectedGesture.name !== this.lastGesture) {
      this.lastGesture = detectedGesture.name;
      this.lastGestureTime = now;
      
      this.gestureHistory.push({
        landmarks,
        gesture: detectedGesture,
        handedness,
        timestamp: now
      });
      
      if (this.gestureHistory.length > this.maxHistoryLength) {
        this.gestureHistory.shift();
      }
      
      this._triggerGesture(detectedGesture);
    }
  }

  _triggerGesture(gesture) {
    console.log(`[Gesture] Detected: ${gesture.name} (${gesture.emoji})`);
    
    if (this.onGesture) {
      this.onGesture(gesture);
    }
    
    if (this.gestureCallback) {
      this.gestureCallback(gesture);
    }
  }

  setGestureCallback(callback) {
    this.gestureCallback = callback;
  }

  getCurrentGesture() {
    return this.lastGesture ? this.gestureDefinitions[this.lastGesture] : null;
  }

  getGestureHistory() {
    return this.gestureHistory;
  }

  addCustomGesture(name, emoji, emotion, checkFunction) {
    this.gestureDefinitions[name] = {
      name,
      emoji,
      emotion,
      description: name,
      check: checkFunction
    };
  }

  removeGesture(name) {
    delete this.gestureDefinitions[name];
  }

  destroy() {
    this.stop();
    this.hands = null;
    this.gestureHistory = [];
  }
}

/**
 * GestureToVRMMapper - 手势到VRM动画的映射器
 */
class GestureToVRMMapper {
  constructor(vrmComponent) {
    this.vrm = vrmComponent;
    this.currentGesture = null;
    this.gestureAnimations = this._initAnimations();
    this.isAnimating = false;
  }

  _initAnimations() {
    return {
      thumbs_up: {
        blendshapes: { 'Joy': 0.8, 'Fun': 0.6 },
        headTilt: -5,
        bodyLean: 0,
        duration: 1000
      },
      peace: {
        blendshapes: { 'Happy': 0.7, 'Sorrowful': 0.3 },
        headTilt: 10,
        bodyLean: 0.1,
        duration: 1500
      },
      wave: {
        blendshapes: { 'Happy': 0.9, 'Surprised': 0.2 },
        headTilt: 5,
        bodyLean: 0.05,
        duration: 2000,
        repeat: true
      },
      fist: {
        blendshapes: { 'Angry': 0.7, 'Joy': 0 },
        headTilt: 0,
        bodyLean: -0.1,
        duration: 800
      },
      point: {
        blendshapes: { 'Surprised': 0.5, 'Happy': 0.3 },
        headTilt: 5,
        bodyLean: 0.15,
        duration: 1200
      },
      pray: {
        blendshapes: { 'Sorrowful': 0.3, 'Happy': 0.4 },
        headTilt: 0,
        bodyLean: 0,
        duration: 2000
      },
      love_you: {
        blendshapes: { 'Happy': 1.0, 'Surprised': 0.3 },
        headTilt: 0,
        bodyLean: 0.1,
        duration: 1500
      }
    };
  }

  playGesture(gestureName) {
    const animation = this.gestureAnimations[gestureName];
    if (!animation || this.isAnimating) return;
    
    this.isAnimating = true;
    this.currentGesture = gestureName;
    
    if (this.vrm) {
      this._applyBlendshapes(animation.blendshapes);
      this._applyBodyAnimation(animation);
    }
    
    setTimeout(() => {
      this._resetToNeutral();
      this.isAnimating = false;
      this.currentGesture = null;
    }, animation.duration);
  }

  _applyBlendshapes(blendshapes) {
    if (!this.vrm || !this.vrm.expressionManager) return;
    
    for (const [name, weight] of Object.entries(blendshapes)) {
      try {
        this.vrm.expressionManager.setValue(name, weight);
      } catch (e) {
        // Blendshape not found, ignore
      }
    }
  }

  _applyBodyAnimation(animation) {
    if (!this.vrm) return;
    
    if (animation.headTilt !== undefined && this.vrm.humanoid) {
      const headBone = this.vrm.humanoid.getRawBoneNode('Head');
      if (headBone) {
        headBone.rotation.x = animation.headTilt * (Math.PI / 180);
      }
    }
  }

  _resetToNeutral() {
    if (!this.vrm || !this.vrm.expressionManager) return;
    
    this.vrm.expressionManager.setValue('Joy', 0);
    this.vrm.expressionManager.setValue('Happy', 0);
    this.vrm.expressionManager.setValue('Fun', 0);
    this.vrm.expressionManager.setValue('Angry', 0);
    this.vrm.expressionManager.setValue('Sorrowful', 0);
    this.vrm.expressionManager.setValue('Surprised', 0);
    
    if (this.vrm.humanoid) {
      const headBone = this.vrm.humanoid.getRawBoneNode('Head');
      if (headBone) {
        headBone.rotation.x = 0;
      }
    }
  }

  stopGesture() {
    this._resetToNeutral();
    this.isAnimating = false;
    this.currentGesture = null;
  }
}

/**
 * GestureEmotionLinker - 手势与情感的联动
 */
class GestureEmotionLinker {
  constructor(emotionSystem) {
    this.emotionSystem = emotionSystem;
    this.gestureEmotionMap = this._initMap();
  }

  _initMap() {
    return {
      thumbs_up: { emotion: 'proud', intensity: 0.7 },
      peace: { emotion: 'happy', intensity: 0.6 },
      wave: { emotion: 'happy', intensity: 0.8 },
      wave_bye: { emotion: 'shy', intensity: 0.5 },
      fist: { emotion: 'angry', intensity: 0.6 },
      pinch: { emotion: 'thinking', intensity: 0.4 },
      stop: { emotion: 'surprised', intensity: 0.5 },
      point: { emotion: 'curious', intensity: 0.5 },
      pray: { emotion: 'shy', intensity: 0.4 },
      love_you: { emotion: 'excited', intensity: 0.9 },
      call_me: { emotion: 'curious', intensity: 0.5 }
    };
  }

  onGestureDetected(gesture) {
    const emotionConfig = this.gestureEmotionMap[gesture.name];
    if (!emotionConfig) return;
    
    this.emotionSystem.setEmotion(emotionConfig.emotion, {
      intensity: emotionConfig.intensity,
      hold: true,
      priority: false
    });
  }
}

// Export
if (typeof window !== 'undefined') {
  window.GestureRecognitionSystem = GestureRecognitionSystem;
  window.GestureToVRMMapper = GestureToVRMMapper;
  window.GestureEmotionLinker = GestureEmotionLinker;
}

if (typeof module !== 'undefined') {
  module.exports = {
    GestureRecognitionSystem,
    GestureToVRMMapper,
    GestureEmotionLinker
  };
}
