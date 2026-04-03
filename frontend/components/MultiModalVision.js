class MultiModalVision {
  constructor(options = {}) {
    this.options = {
      apiEndpoint: options.apiEndpoint || '/api/vision',
      ollamaEndpoint: this._validateEndpoint(options.ollamaEndpoint || 'http://localhost:11434'),
      defaultModel: options.defaultModel || 'llava',
      maxImageSize: options.maxImageSize || 1024,
      imageQuality: options.imageQuality || 0.8,
      timeout: options.timeout || 60000,
      ...options
    };

    this.isProcessing = false;
    this.stream = null;
    this.videoElement = null;
    this.canvasElement = null;
    this._callbacks = {
      onFrame: options.onFrame || (() => {}),
      onError: options.onError || ((e) => console.error('Vision error:', e)),
      onResult: options.onResult || (() => {})
    };
  }

  _validateEndpoint(endpoint) {
    try {
      const url = new URL(endpoint);
      const allowedHosts = ['localhost', '127.0.0.1', '::1', window.location.hostname];
      if (!allowedHosts.includes(url.hostname)) {
        console.warn('[MultiModalVision] Non-localhost endpoint restricted:', endpoint);
        return 'http://localhost:11434';
      }
      return endpoint.replace(/\/$/, '');
    } catch (error) {
      return 'http://localhost:11434';
    }
  }

  async analyzeImage(imageData, prompt, model) {
    if (this.isProcessing) {
      throw new Error('Vision analysis already in progress');
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      const base64Image = await this._imageToBase64(imageData);
      
      const response = await fetch(this.options.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64Image,
          prompt: prompt || '描述这张图片的内容',
          model: model || this.options.defaultModel
        })
      });

      if (!response.ok) {
        throw new Error(`Vision API error: ${response.status}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        description: result.description || result.response,
        model: result.model || model,
        duration: Date.now() - startTime
      };

    } catch (error) {
      this._callbacks.onError(error);
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    } finally {
      this.isProcessing = false;
    }
  }

  async analyzeWithOllama(imageData, prompt, model) {
    if (this.isProcessing) {
      throw new Error('Vision analysis already in progress');
    }

    this.isProcessing = true;

    try {
      const base64Image = await this._imageToBase64(imageData);
      
      const response = await fetch(`${this.options.ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || this.options.defaultModel,
          prompt: prompt || '请描述这张图片',
          images: [base64Image],
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama Vision error: ${response.status}`);
      }

      const result = await response.json();
      
      return {
        success: true,
        description: result.response,
        model: result.model,
        totalDuration: result.total_duration,
        evalCount: result.eval_count
      };

    } catch (error) {
      this._callbacks.onError(error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.isProcessing = false;
    }
  }

  async captureFromCamera(constraints = {}) {
    try {
      const defaultConstraints = {
        video: {
          width: { ideal: this.options.maxImageSize },
          height: { ideal: this.options.maxImageSize },
          facingMode: 'user'
        }
      };

      const mergedConstraints = { ...defaultConstraints, ...constraints };
      this.stream = await navigator.mediaDevices.getUserMedia(mergedConstraints);

      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.setAttribute('autoplay', '');
      }

      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();

      return {
        success: true,
        stream: this.stream,
        video: this.videoElement
      };

    } catch (error) {
      this._callbacks.onError(error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  captureFrame() {
    if (!this.videoElement || !this.stream) {
      return { success: false, error: 'Camera not initialized' };
    }

    if (!this.canvasElement) {
      this.canvasElement = document.createElement('canvas');
    }

    const video = this.videoElement;
    const canvas = this.canvasElement;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);

    const imageData = canvas.toDataURL('image/jpeg', this.options.imageQuality);

    return {
      success: true,
      imageData,
      width: canvas.width,
      height: canvas.height
    };
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement.pause();
    }
  }

  async captureScreen() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        throw new Error('Screen capture not supported');
      }

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: this.options.maxImageSize },
          height: { ideal: this.options.maxImageSize }
        }
      });

      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.setAttribute('playsinline', '');
        this.videoElement.setAttribute('autoplay', '');
      }

      this.videoElement.srcObject = stream;
      await this.videoElement.play();

      const frame = this.captureFrame();
      
      stream.getTracks().forEach(track => track.stop());
      this.videoElement.srcObject = null;

      return frame;

    } catch (error) {
      this._callbacks.onError(error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async captureAndAnalyze(prompt, model) {
    const frame = this.captureFrame();
    if (!frame.success) {
      return frame;
    }

    return this.analyzeWithOllama(frame.imageData, prompt, model);
  }

  async screenCaptureAndAnalyze(prompt, model) {
    const screen = await this.captureScreen();
    if (!screen.success) {
      return screen;
    }

    return this.analyzeWithOllama(screen.imageData, prompt, model);
  }

  async _imageToBase64(imageData) {
    const MAX_BASE64_SIZE = 14 * 1024 * 1024;

    if (typeof imageData === 'string') {
      if (imageData.startsWith('data:')) {
        const base64 = imageData.split(',')[1];
        if (!/^[A-Za-z0-9+/=]+$/.test(base64)) {
          throw new Error('Invalid base64 format');
        }
        if (base64.length > MAX_BASE64_SIZE) {
          throw new Error('Image too large (max 10MB)');
        }
        return base64;
      }
      if (imageData.startsWith('/')) {
        const url = new URL(imageData, window.location.origin);
        if (url.origin !== window.location.origin) {
          throw new Error('Cross-origin image fetch not allowed');
        }
        const response = await fetch(url.href);
        if (!response.ok) throw new Error('Failed to fetch image');
        const blob = await response.blob();
        if (blob.size > 10 * 1024 * 1024) {
          throw new Error('Image too large (max 10MB)');
        }
        return this._blobToBase64(blob);
      }
      if (/^[A-Za-z0-9+/=]+$/.test(imageData)) {
        if (imageData.length > MAX_BASE64_SIZE) {
          throw new Error('Image too large (max 10MB)');
        }
        return imageData;
      }
      throw new Error('Invalid image format');
    }

    if (imageData instanceof Blob || imageData instanceof File) {
      return this._blobToBase64(imageData);
    }

    if (imageData instanceof HTMLImageElement) {
      const canvas = document.createElement('canvas');
      canvas.width = imageData.naturalWidth;
      canvas.height = imageData.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageData, 0, 0);
      return canvas.toDataURL('image/jpeg', this.options.imageQuality).split(',')[1];
    }

    if (imageData instanceof HTMLCanvasElement) {
      return imageData.toDataURL('image/jpeg', this.options.imageQuality).split(',')[1];
    }

    throw new Error('Unsupported image format');
  }

  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async resizeImage(imageData, maxSize) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        const size = maxSize || this.options.maxImageSize;

        if (width > size || height > size) {
          if (width > height) {
            height = Math.round(height * (size / width));
            width = size;
          } else {
            width = Math.round(width * (size / height));
            height = size;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        resolve(canvas.toDataURL('image/jpeg', this.options.imageQuality));
      };
      img.onerror = () => {
        reject(new Error('Image load failed'));
      };
      img.src = imageData;
    });
  }

  isSupported() {
    return {
      camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
      screen: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
      canvas: !!(document.createElement('canvas').getContext)
    };
  }

  destroy() {
    this.stopCamera();
    this.videoElement = null;
    this.canvasElement = null;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = MultiModalVision;
}

if (typeof window !== 'undefined') {
  window.MultiModalVision = MultiModalVision;
}
