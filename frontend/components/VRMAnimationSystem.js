/**
 * VRMAnimationSystem - @pixiv/three-vrm-animation集成系统
 * 
 * 功能:
 * - VRMA动画文件加载和播放
 * - BVH动作捕捉数据导入
 * - 动画重定向到VRM骨骼
 * - 动画库管理
 */

class VRMAnimationSystem {
  constructor(vrmComponent) {
    this.vrmComponent = vrmComponent;
    this.vrm = null;
    this.animationMixer = null;
    this.animations = new Map();
    this.actions = new Map();
    this.currentAction = null;
    
    this.VRMAReader = null;
    this.BVHReader = null;
    
    this.clipLibrary = new Map();
    this.isPlaying = false;
    
    this._animationQueue = [];
    this._crossFadeDuration = 0.3;
  }

  async initialize() {
    try {
      const THREE = await import('three');
      this.THREE = THREE;
      
      const { VRMAnimationLoaderPlugin } = await import('@pixiv/three-vrm-animation');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      
      this.GLTFLoader = GLTFLoader;
      this.VRMAnimationLoaderPlugin = VRMAnimationLoaderPlugin;
      
      this.gltfLoader = new GLTFLoader();
      this.gltfLoader.register((parser) => {
        return new VRMAnimationLoaderPlugin(parser);
      });
      
      const vrm = this.vrmComponent.vrm;
      if (vrm) {
        this.animationMixer = new THREE.AnimationMixer(vrm.scene);
      }
      
      console.log('[VRMAnimation] System initialized');
      return true;
    } catch (error) {
      console.error('[VRMAnimation] Initialization failed:', error);
      return false;
    }
  }

  async loadVRMA(url, name) {
    if (!this.gltfLoader) {
      await this.initialize();
    }
    
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          const clip = gltf.userData.vrmAnimation?.createAnimationClip(this.vrmComponent.vrm);
          
          if (clip) {
            this.animations.set(name, clip);
            
            if (this.animationMixer) {
              const action = this.animationMixer.clipAction(clip);
              this.actions.set(name, action);
            }
            
            this.clipLibrary.set(name, { type: 'vrma', clip, url });
            console.log(`[VRMAnimation] Loaded VRMA: ${name}`);
            resolve(clip);
          } else {
            reject(new Error('Failed to create animation clip'));
          }
        },
        undefined,
        reject
      );
    });
  }

  async loadBVH(url, name) {
    try {
      const { BVHLoader } = await import('three/examples/jsm/loaders/BVHLoader.js');
      const loader = new BVHLoader();
      
      return new Promise((resolve, reject) => {
        loader.load(
          url,
          (result) => {
            const clip = this._retargetBVH(result.clip, result.skeleton);
            
            if (clip) {
              this.animations.set(name, clip);
              
              if (this.animationMixer) {
                const action = this.animationMixer.clipAction(clip);
                this.actions.set(name, action);
              }
              
              this.clipLibrary.set(name, { type: 'bvh', clip, url });
              console.log(`[VRMAnimation] Loaded BVH: ${name}`);
              resolve(clip);
            } else {
              reject(new Error('Failed to retarget BVH'));
            }
          },
          undefined,
          reject
        );
      });
    } catch (error) {
      console.error('[VRMAnimation] BVH loader not available:', error);
      return null;
    }
  }

  _retargetBVH(sourceClip, sourceSkeleton) {
    const vrm = this.vrmComponent.vrm;
    if (!vrm || !vrm.humanoid) {
      console.warn('[VRMAnimation] No VRM humanoid found');
      return null;
    }
    
    const tracks = [];
    const boneMapping = this._getBVHBoneMapping();
    
    sourceClip.tracks.forEach(track => {
      const parts = track.name.split('.');
      const boneName = parts[0];
      const property = parts[1];
      
      const vrmBoneName = boneMapping[boneName];
      if (vrmBoneName) {
        const bone = vrm.humanoid.getBoneNode(vrmBoneName);
        if (bone) {
          const newTrack = track.clone();
          newTrack.name = `${bone.name}.${property}`;
          
          if (property === 'quaternion') {
            const retargetedQuat = this._retargetQuaternion(track.values, boneName);
            newTrack.values = retargetedQuat;
          }
          
          tracks.push(newTrack);
        }
      }
    });
    
    return new this.THREE.AnimationClip(
      sourceClip.name || 'bvh_retargeted',
      sourceClip.duration,
      tracks
    );
  }

  _getBVHBoneMapping() {
    return {
      'Hips': 'Hips',
      'Spine': 'Spine',
      'Spine1': 'Spine1',
      'Spine2': 'Spine2',
      'Neck': 'Neck',
      'Head': 'Head',
      'LeftShoulder': 'Shoulder_L',
      'LeftArm': 'UpperArm_L',
      'LeftForeArm': 'LowerArm_L',
      'LeftHand': 'Hand_L',
      'RightShoulder': 'Shoulder_R',
      'RightArm': 'UpperArm_R',
      'RightForeArm': 'LowerArm_R',
      'RightHand': 'Hand_R',
      'LeftUpLeg': 'UpperLeg_L',
      'LeftLeg': 'LowerLeg_L',
      'LeftFoot': 'Foot_L',
      'LeftToeBase': 'Toes_L',
      'RightUpLeg': 'UpperLeg_R',
      'RightLeg': 'LowerLeg_R',
      'RightFoot': 'Foot_R',
      'RightToeBase': 'Toes_R'
    };
  }

  _retargetQuaternion(sourceQuatArray, boneName) {
    const quaternions = [];
    
    for (let i = 0; i < sourceQuatArray.length; i += 4) {
      const qx = sourceQuatArray[i];
      const qy = sourceQuatArray[i + 1];
      const qz = sourceQuatArray[i + 2];
      const qw = sourceQuatArray[i + 3];
      
      const isArmBone = boneName.includes('Arm') || boneName.includes('ForeArm');
      const isLegBone = boneName.includes('Leg') || boneName.includes('UpLeg');
      
      let retargeted = [qx, qy, qz, qw];
      
      if (isArmBone) {
        retargeted = [qx * 0.5, qy, qz, qw];
      } else if (isLegBone) {
        retargeted = [qx, qy * 0.5, qz, qw];
      }
      
      quaternions.push(...retargeted);
    }
    
    return new Float32Array(quaternions);
  }

  playAnimation(name, options = {}) {
    const {
      fadeDuration = this._crossFadeDuration,
      weight = 1.0,
      timeScale = 1.0,
      loop = true
    } = options;
    
    const action = this.actions.get(name);
    if (!action) {
      const clip = this.animations.get(name);
      if (clip && this.animationMixer) {
        const newAction = this.animationMixer.clipAction(clip);
        this.actions.set(name, newAction);
        this._playAction(newAction, options);
      }
      return;
    }
    
    this._playAction(action, options);
  }

  _playAction(action, options = {}) {
    const { fadeDuration = 0.3, weight = 1.0, timeScale = 1.0, loop = true } = options;
    
    if (this.currentAction && this.currentAction !== action) {
      this.currentAction.fadeOut(fadeDuration);
    }
    
    action.reset();
    action.setEffectiveWeight(weight);
    action.setEffectiveTimeScale(timeScale);
    action.setLoop(loop ? this.THREE.LoopRepeat : this.THREE.LoopOnce);
    action.clampWhenFinished = !loop;
    action.fadeIn(fadeDuration);
    action.play();
    
    this.currentAction = action;
    this.isPlaying = true;
  }

  playWithCrossFade(name, duration = this._crossFadeDuration) {
    const action = this.actions.get(name);
    if (!action) return;
    
    if (this.currentAction) {
      this.currentAction.crossFadeTo(action, duration, true);
    } else {
      action.fadeIn(duration);
    }
    
    action.play();
    this.currentAction = action;
    this.isPlaying = true;
  }

  stopAnimation(name) {
    const action = this.actions.get(name);
    if (action) {
      action.fadeOut(0.3);
    }
    
    if (name === undefined && this.currentAction) {
      this.currentAction.fadeOut(0.3);
      this.currentAction = null;
      this.isPlaying = false;
    }
  }

  stopAll() {
    this.actions.forEach(action => {
      action.stop();
    });
    this.currentAction = null;
    this.isPlaying = false;
  }

  pauseAll() {
    if (this.animationMixer) {
      this.animationMixer.timeScale = 0;
    }
    this.isPlaying = false;
  }

  resumeAll() {
    if (this.animationMixer) {
      this.animationMixer.timeScale = 1;
    }
    this.isPlaying = true;
  }

  queueAnimation(names, options = {}) {
    this._animationQueue = [...names];
    this._playNextInQueue(options);
  }

  _playNextInQueue(options) {
    if (this._animationQueue.length === 0) return;
    
    const name = this._animationQueue.shift();
    const action = this.actions.get(name);
    
    if (action) {
      if (options.crossFade) {
        this.playWithCrossFade(name, options.fadeDuration);
      } else {
        this.playAnimation(name, options);
      }
      
      action.getClip().addEventListener('finished', () => {
        this._playNextInQueue(options);
      });
    } else {
      this._playNextInQueue(options);
    }
  }

  setAnimationWeight(name, weight) {
    const action = this.actions.get(name);
    if (action) {
      action.setEffectiveWeight(weight);
    }
  }

  setAnimationSpeed(name, timeScale) {
    const action = this.actions.get(name);
    if (action) {
      action.setEffectiveTimeScale(timeScale);
    }
  }

  getAnimationDuration(name) {
    const clip = this.animations.get(name);
    return clip ? clip.duration : 0;
  }

  getAnimationList() {
    const list = [];
    this.clipLibrary.forEach((data, name) => {
      list.push({
        name,
        type: data.type,
        duration: data.clip.duration
      });
    });
    return list;
  }

  update(delta) {
    if (this.animationMixer) {
      this.animationMixer.update(delta);
    }
  }

  setCrossFadeDuration(duration) {
    this._crossFadeDuration = duration;
  }

  async createFromMixerAnimation(sourceUrl, targetBoneName, options = {}) {
    return {
      play: () => {},
      stop: () => {},
      pause: () => {}
    };
  }

  dispose() {
    this.stopAll();
    this.animations.clear();
    this.actions.clear();
    this.clipLibrary.clear();
    this.animationMixer = null;
  }
}

/**
 * VRMAnimationEditor - VRMA动画编辑器(简化版)
 */
class VRMAnimationEditor {
  constructor() {
    this.clips = new Map();
    this.currentClip = null;
    this.keyframes = [];
  }

  createClip(name, duration, tracks) {
    const clip = new THREE.AnimationClip(name, duration, tracks);
    this.clips.set(name, clip);
    return clip;
  }

  addKeyframe(clipName, time, boneName, values) {
    const clip = this.clips.get(clipName);
    if (!clip) return;
    
    this.keyframes.push({
      clip: clipName,
      time,
      bone: boneName,
      values
    });
  }

  removeKeyframe(clipName, time, boneName) {
    this.keyframes = this.keyframes.filter(k => 
      !(k.clip === clipName && k.time === time && k.bone === boneName)
    );
  }

  getKeyframes(clipName) {
    return this.keyframes.filter(k => k.clip === clipName);
  }

  exportClip(clipName) {
    const clip = this.clips.get(clipName);
    if (!clip) return null;
    
    return {
      name: clip.name,
      duration: clip.duration,
      tracks: clip.tracks.map(t => ({
        name: t.name,
        values: Array.from(t.values),
        times: Array.from(t.times)
      }))
    };
  }

  importClip(data) {
    const tracks = data.tracks.map(t => {
      const track = new THREE.NumberKeyframeTrack(
        t.name,
        t.times,
        t.values
      );
      return track;
    });
    
    const clip = new THREE.AnimationClip(data.name, data.duration, tracks);
    this.clips.set(data.name, clip);
    return clip;
  }
}

if (typeof window !== 'undefined') {
  window.VRMAnimationSystem = VRMAnimationSystem;
  window.VRMAnimationEditor = VRMAnimationEditor;
}

if (typeof module !== 'undefined') {
  module.exports = { VRMAnimationSystem, VRMAnimationEditor };
}
