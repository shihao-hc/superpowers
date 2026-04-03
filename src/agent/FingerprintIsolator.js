class FingerprintIsolator {
  constructor(options = {}) {
    this.canvasNoise = options.canvasNoise !== false;
    this.webglNoise = options.webglNoise !== false;
    this.audioNoise = options.audioNoise !== false;
    this.webrtcBlock = options.webrtcBlock !== false;
    this.fontFingerprint = options.fontFingerprint !== false;
    this.timezoneSpoof = options.timezoneSpoof || null;
    this.languageSpoof = options.languageSpoof || null;
    this.platformSpoof = options.platformSpoof || null;

    this._seed = options.seed || Math.random().toString(36).substr(2, 16);
    this._noiseCache = new Map();
    this._hooks = [];
  }

  apply() {
    if (typeof window === 'undefined') return;

    if (this.canvasNoise) this._hookCanvas();
    if (this.webglNoise) this._hookWebGL();
    if (this.audioNoise) this._hookAudio();
    if (this.webrtcBlock) this._blockWebRTC();
    if (this.timezoneSpoof) this._spoofTimezone();
    if (this.languageSpoof) this._spoofLanguage();
    if (this.platformSpoof) this._spoofPlatform();

    console.log('[FingerprintIsolator] Applied with seed:', this._seed);
  }

  _generateNoise(key, range = 1) {
    if (this._noiseCache.has(key)) {
      return this._noiseCache.get(key);
    }

    const hash = this._simpleHash(this._seed + key);
    const noise = (hash % 1000) / 1000 * range - range / 2;
    this._noiseCache.set(key, noise);
    return noise;
  }

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  _hookCanvas() {
    const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
    const originalToBlob = HTMLCanvasElement.prototype.toBlob;
    const originalGetImageData = CanvasRenderingContext2D.prototype.getImageData;

    HTMLCanvasElement.prototype.toDataURL = function(...args) {
      const context = this.getContext('2d');
      if (context && this.width > 0 && this.height > 0) {
        const imageData = originalGetImageData.call(context, 0, 0, this.width, this.height);
        FingerprintIsolator._addCanvasNoise(imageData, this.width, this.height);
        context.putImageData(imageData, 0, 0);
      }
      return originalToDataURL.apply(this, args);
    };

    HTMLCanvasElement.prototype.toBlob = function(callback, ...args) {
      const context = this.getContext('2d');
      if (context && this.width > 0 && this.height > 0) {
        const imageData = originalGetImageData.call(context, 0, 0, this.width, this.height);
        FingerprintIsolator._addCanvasNoise(imageData, this.width, this.height);
        context.putImageData(imageData, 0, 0);
      }
      return originalToBlob.call(this, callback, ...args);
    };

    this._hooks.push(() => {
      HTMLCanvasElement.prototype.toDataURL = originalToDataURL;
      HTMLCanvasElement.prototype.toBlob = originalToBlob;
    });
  }

  static _addCanvasNoise(imageData, width, height) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 2;
      data[i] = Math.max(0, Math.min(255, data[i] + noise));
      data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
      data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
    }
  }

  _hookWebGL() {
    const originalGetParameter = WebGLRenderingContext.prototype.getParameter;
    const originalGetExtension = WebGLRenderingContext.prototype.getExtension;

    const noiseParams = {
      37445: () => 'NVIDIA Corporation',
      37446: () => 'NVIDIA GeForce RTX 3080/PCIe/SSE2',
      35661: () => 32,
      34076: () => 16384,
      34024: () => 16384,
      34930: () => 16,
      35724: () => 4600
    };

    WebGLRenderingContext.prototype.getParameter = function(parameter) {
      if (noiseParams[parameter]) {
        return noiseParams[parameter]();
      }
      return originalGetParameter.call(this, parameter);
    };

    WebGL2RenderingContext.prototype.getParameter = WebGLRenderingContext.prototype.getParameter;

    this._hooks.push(() => {
      WebGLRenderingContext.prototype.getParameter = originalGetParameter;
      WebGL2RenderingContext.prototype.getParameter = originalGetParameter;
    });
  }

  _hookAudio() {
    const originalCreateOscillator = AudioContext.prototype.createOscillator;
    const originalCreateAnalyser = AudioContext.prototype.createAnalyser;

    AudioContext.prototype.createAnalyser = function() {
      const analyser = originalCreateAnalyser.call(this);
      const originalGetFloatFrequencyData = analyser.getFloatFrequencyData;

      analyser.getFloatFrequencyData = function(array) {
        originalGetFloatFrequencyData.call(this, array);
        for (let i = 0; i < array.length; i++) {
          array[i] += (Math.random() - 0.5) * 0.0001;
        }
      };

      return analyser;
    };

    this._hooks.push(() => {
      AudioContext.prototype.createOscillator = originalCreateOscillator;
      AudioContext.prototype.createAnalyser = originalCreateAnalyser;
    });
  }

  _blockWebRTC() {
    const originalRTCPeerConnection = window.RTCPeerConnection;

    window.RTCPeerConnection = function(...args) {
      console.warn('[FingerprintIsolator] WebRTC blocked');
      throw new Error('WebRTC is disabled for privacy');
    };

    navigator.mediaDevices = navigator.mediaDevices || {};
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia;

    navigator.mediaDevices.getUserMedia = function() {
      return Promise.reject(new Error('Media devices blocked'));
    };

    this._hooks.push(() => {
      window.RTCPeerConnection = originalRTCPeerConnection;
      if (originalGetUserMedia) {
        navigator.mediaDevices.getUserMedia = originalGetUserMedia;
      }
    });
  }

  _spoofTimezone() {
    const originalDateTimeFormat = Intl.DateTimeFormat;

    const spoofed = function(...args) {
      const options = args[1] || {};
      if (!options.timeZone) {
        args[1] = { ...options, timeZone: 'UTC' };
      }
      return new originalDateTimeFormat(...args);
    };

    spoofed.supportedLocalesOf = originalDateTimeFormat.supportedLocalesOf;
    Object.setPrototypeOf(spoofed, originalDateTimeFormat);

    Intl.DateTimeFormat = spoofed;

    this._hooks.push(() => {
      Intl.DateTimeFormat = originalDateTimeFormat;
    });
  }

  _spoofLanguage() {
    Object.defineProperty(navigator, 'language', {
      get: () => this.languageSpoof || 'en-US',
      configurable: true
    });

    Object.defineProperty(navigator, 'languages', {
      get: () => [this.languageSpoof || 'en-US'],
      configurable: true
    });
  }

  _spoofPlatform() {
    Object.defineProperty(navigator, 'platform', {
      get: () => this.platformSpoof || 'Win32',
      configurable: true
    });
  }

  getFingerprint() {
    return {
      seed: this._seed,
      canvas: this.canvasNoise,
      webgl: this.webglNoise,
      audio: this.audioNoise,
      webrtc: this.webrtcBlock,
      timezone: this.timezoneSpoof,
      language: this.languageSpoof,
      platform: this.platformSpoof
    };
  }

  generateNewSeed() {
    this._seed = Math.random().toString(36).substr(2, 16);
    this._noiseCache.clear();
    return this._seed;
  }

  remove() {
    for (const hook of this._hooks) {
      try { hook(); } catch (e) {}
    }
    this._hooks = [];
  }
}

if (typeof window !== 'undefined') {
  window.FingerprintIsolator = FingerprintIsolator;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = FingerprintIsolator;
}
