/**
 * VisionSystem - 视觉/多模态系统
 * 
 * 功能:
 * - 屏幕截图捕获
 * - 图像分析
 * - OCR文字识别
 * - 多模态LLM集成
 * - 场景理解
 */

class VisionSystem {
  constructor(options = {}) {
    this.options = {
      // 截图区域
      captureRegion: options.captureRegion || null,
      // 截图间隔(ms)
      captureInterval: options.captureInterval || 5000,
      // 自动截图
      autoCapture: options.autoCapture || false,
      // OCR引擎
      ocrEngine: options.ocrEngine || 'tesseract',
      // 多模态LLM
      multimodalEndpoint: options.multimodalEndpoint || null,
      // 回调
      onCapture: options.onCapture || null,
      onAnalysis: options.onAnalysis || null,
      onError: options.onError || null,
      ...options
    };

    // 状态
    this.isCapturing = false;
    this.captureTimer = null;
    
    // 截图历史
    this.screenshotHistory = [];
    this.maxHistory = options.maxHistorySize || 50;

    // 分析历史
    this.analysisHistory = [];
  }

  /**
   * 开始自动截图
   */
  startAutoCapture() {
    if (this.isCapturing) return;
    
    this.isCapturing = true;
    this.captureTimer = setInterval(() => {
      this.captureAndAnalyze();
    }, this.options.captureInterval);
  }

  /**
   * 停止自动截图
   */
  stopAutoCapture() {
    if (this.captureTimer) {
      clearInterval(this.captureTimer);
      this.captureTimer = null;
    }
    this.isCapturing = false;
  }

  /**
   * 截取屏幕
   */
  async captureScreen(options = {}) {
    try {
      // 使用html2canvas或原生方法
      if (options.element) {
        return await this._captureElement(options.element);
      } else {
        return await this._captureRegion(options.region);
      }
    } catch (error) {
      console.error('[VisionSystem] Capture error:', error);
      if (this.options.onError) this.options.onError(error);
      throw error;
    }
  }

  /**
   * 捕获元素
   */
  async _captureElement(element) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (element instanceof HTMLVideoElement) {
      canvas.width = element.videoWidth || 640;
      canvas.height = element.videoHeight || 480;
      ctx.drawImage(element, 0, 0);
    } else if (element instanceof HTMLCanvasElement) {
      canvas.width = element.width;
      canvas.height = element.height;
      ctx.drawImage(element, 0, 0);
    } else {
      // 使用html2canvas或其他方法
      const rect = element.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      
      // 简化实现
      const svg = await this._elementToSVG(element);
      const blob = await this._svgToBlob(svg);
      return await this._blobToDataURL(blob);
    }

    return canvas.toDataURL('image/png');
  }

  /**
   * 截取区域
   */
  async _captureRegion(region) {
    // 使用getDisplayMedia (需要用户授权)
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'never',
        displaySurface: 'monitor'
      }
    });

    const video = document.createElement('video');
    video.srcObject = stream;
    
    await new Promise((resolve) => {
      video.onloadedmetadata = () => {
        video.play();
        resolve();
      };
    });

    // 等待一帧
    await new Promise(resolve => requestAnimationFrame(resolve));

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    
    if (region) {
      ctx.drawImage(
        video,
        region.x, region.y, region.width, region.height,
        0, 0, region.width, region.height
      );
    } else {
      ctx.drawImage(video, 0, 0);
    }

    // 停止流
    stream.getTracks().forEach(track => track.stop());
    video.remove();

    const dataUrl = canvas.toDataURL('image/png');
    
    // 保存历史
    this.screenshotHistory.push({
      dataUrl,
      timestamp: Date.now(),
      region
    });
    
    if (this.screenshotHistory.length > this.maxHistory) {
      this.screenshotHistory.shift();
    }

    if (this.options.onCapture) {
      this.options.onCapture({ dataUrl, timestamp: Date.now() });
    }

    return dataUrl;
  }

  /**
   * 截图并分析
   */
  async captureAndAnalyze(prompt = 'Describe what you see') {
    const screenshot = await this.captureScreen();
    const analysis = await this.analyzeImage(screenshot, prompt);
    
    if (this.options.onAnalysis) {
      this.options.onAnalysis({
        screenshot,
        analysis,
        timestamp: Date.now()
      });
    }

    return {
      screenshot,
      analysis
    };
  }

  /**
   * 分析图像
   */
  async analyzeImage(imageData, prompt = 'Describe this image') {
    if (!this.options.multimodalEndpoint) {
      // 使用Canvas分析(简化)
      return this._simpleAnalysis(imageData);
    }

    try {
      // 转换为base64
      const base64 = imageData.startsWith('data:') 
        ? imageData.split(',')[1] 
        : imageData;

      const response = await fetch(this.options.multimodalEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.apiKey || ''}`
        },
        body: JSON.stringify({
          model: this.options.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64}`,
                    detail: 'auto'
                  }
                }
              ]
            }
          ],
          max_tokens: 1000
        })
      });

      if (!response.ok) {
        throw new Error(`Analysis error: ${response.status}`);
      }

      const data = await response.json();
      const analysis = data.choices?.[0]?.message?.content || '';

      // 保存分析历史
      this.analysisHistory.push({
        image: base64.substring(0, 100) + '...',
        prompt,
        analysis,
        timestamp: Date.now()
      });

      return analysis;

    } catch (error) {
      console.error('[VisionSystem] Analysis error:', error);
      if (this.options.onError) this.options.onError(error);
      throw error;
    }
  }

  /**
   * 简单分析(本地)
   */
  _simpleAnalysis(imageData) {
    // 创建图像对象
    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // 获取图像数据
        const imageDataObj = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const analysis = this._analyzeImageData(imageDataObj);
        
        resolve({
          type: 'local',
          dimensions: { width: img.width, height: img.height },
          colors: analysis.colors,
          brightness: analysis.brightness,
          contrast: analysis.contrast,
          hasText: false,
          description: this._generateDescription(analysis)
        });
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = imageData;
    });
  }

  /**
   * 分析图像数据
   */
  _analyzeImageData(imageData) {
    const data = imageData.data;
    let totalR = 0, totalG = 0, totalB = 0;
    let brightnessSum = 0;
    const colorCounts = {};

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      totalR += r;
      totalG += g;
      totalB += b;
      
      brightnessSum += (r + g + b) / 3;
      
      // 量化颜色
      const colorKey = `${Math.floor(r/32)},${Math.floor(g/32)},${Math.floor(b/32)}`;
      colorCounts[colorKey] = (colorCounts[colorKey] || 0) + 1;
    }

    const pixelCount = data.length / 4;
    const avgBrightness = brightnessSum / pixelCount;
    const avgR = totalR / pixelCount;
    const avgG = totalG / pixelCount;
    const avgB = totalB / pixelCount;

    // 获取主要颜色
    const sortedColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(c => parseInt(c) * 32);
        return `rgb(${r},${g},${b})`;
      });

    return {
      colors: sortedColors,
      brightness: avgBrightness / 255,
      dominantColor: { r: avgR, g: avgG, b: avgB },
      pixelCount
    };
  }

  /**
   * 生成描述
   */
  _generateDescription(analysis) {
    const brightness = analysis.brightness;
    const dominant = analysis.dominantColor;
    
    let brightnessDesc = 'brightness moderate';
    if (brightness < 0.3) brightnessDesc = 'dark scene';
    else if (brightness > 0.7) brightnessDesc = 'bright scene';
    
    return `The image shows a ${brightnessDesc}. ` +
           `Primary colors: ${analysis.colors.slice(0, 3).join(', ')}. ` +
           `Resolution: ${analysis.pixelCount} pixels.`;
  }

  /**
   * OCR文字识别
   */
  async recognizeText(imageData) {
    // 使用Tesseract.js或调用API
    if (typeof Tesseract !== 'undefined') {
      const result = await Tesseract.recognize(imageData, 'eng+chi_sim', {
        logger: m => console.log('[OCR]', m)
      });
      return result.data.text;
    }

    // 调用API
    if (this.options.ocrEndpoint) {
      const response = await fetch(this.options.ocrEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });
      const data = await response.json();
      return data.text;
    }

    throw new Error('OCR not available');
  }

  /**
   * 对象检测
   */
  async detectObjects(imageData) {
    // 使用TensorFlow.js或调用API
    if (this.options.detectionEndpoint) {
      const response = await fetch(this.options.detectionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: imageData })
      });
      return response.json();
    }

    return [];
  }

  /**
   * 获取截图历史
   */
  getScreenshotHistory(count = 10) {
    return this.screenshotHistory.slice(-count);
  }

  /**
   * 获取分析历史
   */
  getAnalysisHistory(count = 10) {
    return this.analysisHistory.slice(-count);
  }

  /**
   * 清除历史
   */
  clearHistory() {
    this.screenshotHistory = [];
    this.analysisHistory = [];
  }

  /**
   * 销毁
   */
  destroy() {
    this.stopAutoCapture();
    this.clearHistory();
  }
}

if (typeof window !== 'undefined') {
  window.VisionSystem = VisionSystem;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = VisionSystem;
}
