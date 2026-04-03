/**
 * GestureMLClassifier - 基于机器学习的手势分类器
 * 
 * 使用TensorFlow.js进行手势分类
 * 替代规则引擎，提供更准确的手势识别
 */

class GestureMLClassifier {
  constructor(options = {}) {
    this.model = null;
    this.isLoaded = false;
    this.modelUrl = options.modelUrl || '/models/gesture_classifier/model.json';
    this.labels = options.labels || [
      'thumbs_up', 'peace', 'wave', 'fist', 'point',
      'prayer', 'pinch', 'stop', 'love_you', 'call_me',
      'none'
    ];
    
    this.inputShape = [63]; // 21 landmarks * 3 (x,y,z)
    this.confidenceThreshold = options.confidenceThreshold || 0.7;
    
    this.onModelLoaded = options.onModelLoaded || (() => {});
    this.onerror = options.onerror || (() => {});
  }

  async load() {
    if (typeof tf === 'undefined') {
      try {
        await this._loadTensorFlow();
      } catch (e) {
        console.warn('[GestureML] TensorFlow.js not available, using rule engine');
        return false;
      }
    }

    try {
      this.model = await tf.loadLayersModel(this.modelUrl);
      this.isLoaded = true;
      console.log('[GestureML] Model loaded successfully');
      this.onModelLoaded();
      return true;
    } catch (error) {
      console.warn('[GestureML] Failed to load model, using rule engine:', error.message);
      return false;
    }
  }

  async _loadTensorFlow() {
    return new Promise((resolve, reject) => {
      if (typeof tf !== 'undefined') {
        resolve();
        return;
      }
      
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js';
      script.integrity = 'sha384-cDNpofNKuVz3Hxp2s4M3l5au+p0M0pW6lY0JgB3K8Cf3f1o8h3G2Hl5l2O5l2Xk';
      script.crossOrigin = 'anonymous';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  async predict(landmarks) {
    if (!this.isLoaded || !this.model) {
      return this._fallbackPredict(landmarks);
    }

    try {
      const input = this._preprocessLandmarks(landmarks);
      const prediction = await this.model.predict(input);
      const probabilities = await prediction.data();
      
      input.dispose();
      prediction.dispose();

      let maxProb = 0;
      let maxIndex = 0;
      
      for (let i = 0; i < probabilities.length; i++) {
        if (probabilities[i] > maxProb) {
          maxProb = probabilities[i];
          maxIndex = i;
        }
      }

      if (maxProb < this.confidenceThreshold) {
        return { gesture: 'none', confidence: maxProb };
      }

      return {
        gesture: this.labels[maxIndex],
        confidence: maxProb,
        probabilities: Array.from(probabilities).reduce((acc, p, i) => {
          acc[this.labels[i]] = p;
          return acc;
        }, {})
      };
    } catch (error) {
      console.error('[GestureML] Prediction error:', error);
      return this._fallbackPredict(landmarks);
    }
  }

  _preprocessLandmarks(landmarks) {
    const normalized = [];
    const wrist = landmarks[0];
    
    for (const point of landmarks) {
      normalized.push(point.x - wrist.x);
      normalized.push(point.y - wrist.y);
      normalized.push(point.z - (wrist.z || 0));
    }

    const input = tf.tensor2d([normalized]);
    return input.div(tf.scalar(1.0).sub(input.max()).add(tf.scalar(0.0001)));
  }

  _fallbackPredict(landmarks) {
    const fingerExtended = this._checkFingers(landmarks);
    const thumbUp = landmarks[4].y < landmarks[3].y;
    
    if (thumbUp && !fingerExtended.index && !fingerExtended.middle && 
        !fingerExtended.ring && !fingerExtended.pinky) {
      return { gesture: 'thumbs_up', confidence: 0.9 };
    }
    
    if (fingerExtended.index && fingerExtended.middle && 
        !fingerExtended.ring && !fingerExtended.pinky) {
      return { gesture: 'peace', confidence: 0.85 };
    }
    
    if (fingerExtended.index && !fingerExtended.middle && 
        !fingerExtended.ring && !fingerExtended.pinky) {
      return { gesture: 'point', confidence: 0.85 };
    }
    
    if (!fingerExtended.index && !fingerExtended.middle && 
        !fingerExtended.ring && !fingerExtended.pinky) {
      return { gesture: 'fist', confidence: 0.9 };
    }
    
    if (fingerExtended.index && fingerExtended.middle && 
        fingerExtended.ring && fingerExtended.pinky) {
      return { gesture: 'stop', confidence: 0.85 };
    }
    
    return { gesture: 'none', confidence: 0 };
  }

  _checkFingers(landmarks) {
    return {
      thumb: landmarks[4].x < landmarks[3].x,
      index: landmarks[8].y < landmarks[6].y,
      middle: landmarks[12].y < landmarks[10].y,
      ring: landmarks[16].y < landmarks[14].y,
      pinky: landmarks[20].y < landmarks[18].y
    };
  }

  async trainTrainingData(data, labels) {
    if (!this.model) {
      this._createModel();
    }

    const xs = tf.tensor2d(data);
    const ys = tf.oneHot(tf.tensor1d(labels, 'int32'), this.labels.length);

    await this.model.fit(xs, ys, {
      epochs: 100,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          console.log(`[GestureML] Epoch ${epoch}: loss=${logs.loss.toFixed(4)}, acc=${logs.acc.toFixed(4)}`);
        }
      }
    });

    xs.dispose();
    ys.dispose();
  }

  _createModel() {
    this.model = tf.sequential();
    
    this.model.add(tf.layers.dense({
      inputShape: [this.inputShape[0]],
      units: 128,
      activation: 'relu'
    }));
    
    this.model.add(tf.layers.dropout({ rate: 0.3 }));
    
    this.model.add(tf.layers.dense({
      units: 64,
      activation: 'relu'
    }));
    
    this.model.add(tf.layers.dropout({ rate: 0.2 }));
    
    this.model.add(tf.layers.dense({
      units: this.labels.length,
      activation: 'softmax'
    }));

    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy']
    });

    this.isLoaded = true;
  }

  async saveModel(path) {
    if (this.model) {
      await this.model.save(`downloads://${path}`);
      console.log('[GestureML] Model saved to downloads');
    }
  }

  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
    this.isLoaded = false;
  }
}

if (typeof window !== 'undefined') {
  window.GestureMLClassifier = GestureMLClassifier;
}

if (typeof module !== 'undefined') {
  module.exports = { GestureMLClassifier };
}
