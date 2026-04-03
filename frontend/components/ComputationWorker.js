/**
 * ComputationWorker - 计算密集型任务的Web Worker处理器
 * 
 * 将CPU密集型任务移至Worker线程
 * 避免阻塞主线程渲染
 */

class ComputationWorker {
  constructor(options = {}) {
    this.worker = null;
    this.isReady = false;
    this.pendingTasks = new Map();
    this.taskId = 0;
    this.workerUrl = options.workerUrl || this._createWorkerBlob();
    this.timeout = options.timeout || 30000;
    
    this.onReady = options.onReady || (() => {});
    this.onerror = options.onerror || (() => {});
  }

  _createWorkerBlob() {
    const workerCode = `
      self.onmessage = async function(e) {
        const { id, type, data } = e.data;
        
        try {
          let result;
          
          switch (type) {
            case 'gesture_classify':
              result = classifyGesture(data.landmarks);
              break;
              
            case 'embedding':
              result = computeEmbedding(data.text);
              break;
              
            case 'emotion_analyze':
              result = analyzeEmotion(data.text);
              break;
              
            case 'audio_process':
              result = processAudio(data.audioData, data.options);
              break;
              
            case 'animation_compute':
              result = computeAnimation(data.keyframes, data.options);
              break;
              
            default:
              throw new Error('Unknown task type: ' + type);
          }
          
          self.postMessage({ id, success: true, result });
        } catch (error) {
          self.postMessage({ id, success: false, error: error.message });
        }
      };

      function classifyGesture(landmarks) {
        const fingerExtended = {
          thumb: landmarks[4].x < landmarks[3].x,
          index: landmarks[8].y < landmarks[6].y,
          middle: landmarks[12].y < landmarks[10].y,
          ring: landmarks[16].y < landmarks[14].y,
          pinky: landmarks[20].y < landmarks[18].y
        };
        
        const thumbUp = landmarks[4].y < landmarks[3].y;
        const fingersCount = Object.values(fingerExtended).filter(v => v).length;
        
        if (thumbUp && fingersCount === 0) return { gesture: 'thumbs_up', confidence: 0.9 };
        if (fingerExtended.index && fingerExtended.middle && fingersCount === 2) return { gesture: 'peace', confidence: 0.85 };
        if (fingerExtended.index && fingersCount === 1) return { gesture: 'point', confidence: 0.85 };
        if (fingersCount === 0) return { gesture: 'fist', confidence: 0.9 };
        if (fingersCount === 5) return { gesture: 'stop', confidence: 0.85 };
        
        return { gesture: 'none', confidence: 0 };
      }

      function computeEmbedding(text) {
        const words = text.toLowerCase().split(/\\s+/);
        const vocab = new Set(words);
        const embedding = new Array(384).fill(0);
        
        for (let i = 0; i < Math.min(words.length, 50); i++) {
          const hash = simpleHash(words[i]);
          for (let j = 0; j < 384; j++) {
            embedding[j] += Math.sin(hash * j * 0.01) * 0.1;
          }
        }
        
        const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
        return embedding.map(v => norm > 0 ? v / norm : 0);
      }

      function simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
          const char = str.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash;
        }
        return Math.abs(hash);
      }

      function analyzeEmotion(text) {
        const emotions = {
          happy: ['开心', '高兴', '喜欢', '哈哈', '耶', '🎉', '😊', '😄'],
          sad: ['难过', '伤心', '遗憾', '😭', '💔'],
          angry: ['生气', '不爽', '讨厌', '😠', '😡'],
          surprised: ['惊讶', '意外', '哇', '😱'],
          shy: ['害羞', '不好意思', '😳'],
          curious: ['好奇', '想知道', '为什么', '🤔']
        };

        let bestEmotion = 'neutral';
        let bestScore = 0;

        for (const [emotion, keywords] of Object.entries(emotions)) {
          const score = keywords.filter(kw => text.includes(kw)).length;
          if (score > bestScore) {
            bestScore = score;
            bestEmotion = emotion;
          }
        }

        return { emotion: bestEmotion, confidence: bestScore > 0 ? Math.min(0.5 + bestScore * 0.2, 1) : 0.5 };
      }

      function processAudio(audioData, options) {
        const samples = new Float32Array(audioData);
        let sum = 0;
        let max = 0;
        
        for (let i = 0; i < samples.length; i++) {
          const abs = Math.abs(samples[i]);
          sum += abs;
          if (abs > max) max = abs;
        }
        
        const rms = Math.sqrt(sum / samples.length);
        const volume = max;
        const isSpeaking = rms > (options?.threshold || 0.02);
        
        return { rms, volume, isSpeaking };
      }

      function computeAnimation(keyframes, options) {
        const { duration, currentTime } = options || {};
        const progress = Math.min(currentTime / duration, 1);
        
        const result = {};
        for (const [name, kf] of Object.entries(keyframes)) {
          const { from, to, easing } = kf;
          const easedProgress = easing === 'linear' ? progress : 
                               easing === 'easeIn' ? progress * progress :
                               easing === 'easeOut' ? 1 - (1 - progress) * (1 - progress) :
                               progress;
          result[name] = from + (to - from) * easedProgress;
        }
        
        return result;
      }
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    return URL.createObjectURL(blob);
  }

  initialize() {
    return new Promise((resolve, reject) => {
      try {
        this.worker = new Worker(this.workerUrl);
        
        this.worker.onmessage = (e) => {
          const { id, success, result, error } = e.data;
          const task = this.pendingTasks.get(id);
          
          if (task) {
            this.pendingTasks.delete(id);
            clearTimeout(task.timeout);
            
            if (success) {
              task.resolve(result);
            } else {
              task.reject(new Error(error));
            }
          }
        };
        
        this.worker.onerror = (error) => {
          console.error('[ComputationWorker] Worker error:', error);
          this.onerror(error);
        };
        
        this.isReady = true;
        this.onReady();
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  execute(type, data) {
    if (!this.isReady) {
      return Promise.reject(new Error('Worker not initialized'));
    }
    
    return new Promise((resolve, reject) => {
      const id = ++this.taskId;
      
      const timeoutId = setTimeout(() => {
        this.pendingTasks.delete(id);
        reject(new Error('Task timeout'));
      }, this.timeout);
      
      this.pendingTasks.set(id, { resolve, reject, timeout: timeoutId });
      
      this.worker.postMessage({ id, type, data });
    });
  }

  async classifyGesture(landmarks) {
    try {
      return await this.execute('gesture_classify', { landmarks });
    } catch {
      return { gesture: 'none', confidence: 0 };
    }
  }

  async computeEmbedding(text) {
    try {
      return await this.execute('embedding', { text });
    } catch {
      return null;
    }
  }

  async analyzeEmotion(text) {
    try {
      return await this.execute('emotion_analyze', { text });
    } catch {
      return { emotion: 'neutral', confidence: 0.5 };
    }
  }

  async processAudio(audioData, options = {}) {
    try {
      const buffer = audioData.buffer || audioData;
      return await this.execute('audio_process', { audioData: buffer, options });
    } catch {
      return { rms: 0, volume: 0, isSpeaking: false };
    }
  }

  getPendingCount() {
    return this.pendingTasks.size;
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isReady = false;
    this.pendingTasks.clear();
    URL.revokeObjectURL(this.workerUrl);
  }
}

if (typeof window !== 'undefined') {
  window.ComputationWorker = ComputationWorker;
}

if (typeof module !== 'undefined') {
  module.exports = { ComputationWorker };
}
