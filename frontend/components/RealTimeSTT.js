/**
 * RealTimeSTT - 实时语音识别系统
 * 
 * 功能:
 * - 浏览器原生Web Speech API
 * - Whisper API云端识别
 * - VAD(语音活动检测)
 * - 唤醒词检测
 * - 流式识别
 */

class RealTimeSTT {
  constructor(options = {}) {
    this.options = {
      // 引擎: 'webspeech' | 'whisper' | 'vosk'
      engine: options.engine || 'webspeech',
      // 语言
      language: options.language || 'zh-CN',
      // 连续识别
      continuous: options.continuous !== false,
      // 中间结果
      interimResults: options.interimResults !== false,
      // VAD设置
      vadEnabled: options.vadEnabled !== false,
      vadSensitivity: options.vadSensitivity || 0.5,
      // 唤醒词
      wakeWord: options.wakeWord || null,
      // Whisper API配置
      whisperApiKey: options.whisperApiKey || null,
      whisperEndpoint: options.whisperEndpoint || 'https://api.openai.com/v1/audio/transcriptions',
      // 回调
      onResult: options.onResult || null,
      onInterim: options.onInterim || null,
      onStart: options.onStart || null,
      onEnd: options.onEnd || null,
      onWakeWord: options.onWakeWord || null,
      onError: options.onError || null,
      ...options
    };

    // 状态
    this.isListening = false;
    this.isPaused = false;
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
    
    // 统计
    this.stats = {
      totalSegments: 0,
      totalDuration: 0,
      wakeWordDetected: 0,
      errors: 0
    };

    // 唤醒词相关
    this.wakeWordBuffer = '';
    this.wakeWordDetected = false;

    // 初始化
    this._checkSupport();
  }

  /**
   * 检查浏览器支持
   */
  _checkSupport() {
    this.support = {
      webSpeech: 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window,
      audioContext: 'AudioContext' in window || 'webkitAudioContext' in window,
      mediaDevices: 'mediaDevices' in navigator
    };
    
    console.log('[RealTimeSTT] Browser support:', this.support);
    return this.support;
  }

  /**
   * 开始监听
   */
  async start() {
    if (this.isListening) return;

    try {
      switch (this.options.engine) {
        case 'webspeech':
          await this._startWebSpeech();
          break;
        case 'whisper':
          await this._startWhisper();
          break;
        default:
          await this._startWebSpeech();
      }
      
      this.isListening = true;
      if (this.options.onStart) this.options.onStart();
      
    } catch (error) {
      console.error('[RealTimeSTT] Start error:', error);
      if (this.options.onError) this.options.onError(error);
      throw error;
    }
  }

  /**
   * 停止监听
   */
  stop() {
    if (!this.isListening) return;

    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.isListening = false;
    if (this.options.onEnd) this.options.onEnd();
  }

  /**
   * 暂停/恢复
   */
  pause() {
    if (this.recognition && this.isListening) {
      this.recognition.stop();
      this.isPaused = true;
    }
  }

  resume() {
    if (this.isPaused && this.isListening) {
      this._startWebSpeech();
      this.isPaused = false;
    }
  }

  /**
   * 使用Web Speech API
   */
  async _startWebSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    this.recognition = new SpeechRecognition();
    this.recognition.lang = this.options.language;
    this.recognition.continuous = this.options.continuous;
    this.recognition.interimResults = this.options.interimResults;
    this.recognition.maxAlternatives = 3;

    // 事件处理
    this.recognition.onstart = () => {
      console.log('[RealTimeSTT] Recognition started');
    };

    this.recognition.onresult = (event) => {
      this._handleWebSpeechResult(event);
    };

    this.recognition.onerror = (event) => {
      console.error('[RealTimeSTT] Recognition error:', event.error);
      this.stats.errors++;
      if (this.options.onError) {
        this.options.onError(new Error(event.error));
      }
    };

    this.recognition.onend = () => {
      // 自动重启
      if (this.isListening && !this.isPaused) {
        try {
          this.recognition.start();
        } catch (e) {
          console.log('[RealTimeSTT] Auto-restart failed');
        }
      }
    };

    this.recognition.start();
    
    // 初始化音频分析(用于VAD)
    if (this.options.vadEnabled) {
      await this._initAudioAnalyser();
    }
  }

  /**
   * 处理Web Speech结果
   */
  _handleWebSpeechResult(event) {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;

      if (result.isFinal) {
        // 最终结果
        this.stats.totalSegments++;
        
        // 唤醒词检测
        if (this.options.wakeWord && !this.wakeWordDetected) {
          if (this._checkWakeWord(transcript)) {
            this.wakeWordDetected = true;
            this.stats.wakeWordDetected++;
            if (this.options.onWakeWord) {
              this.options.onWakeWord({ transcript });
            }
            return;
          }
        }

        // 触发回调
        if (this.options.onResult) {
          this.options.onResult({
            transcript: transcript.trim(),
            confidence,
            isFinal: true,
            timestamp: Date.now()
          });
        }
      } else {
        // 中间结果
        if (this.options.onInterim) {
          this.options.onInterim({
            transcript: transcript.trim(),
            confidence,
            isFinal: false
          });
        }
      }
    }
  }

  /**
   * 使用Whisper API
   */
  async _startWhisper() {
    if (!this.options.whisperApiKey) {
      throw new Error('Whisper API key required');
    }

    // 获取麦克风流
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    this.mediaStream = stream;
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);

    // 持续录制和识别
    this._startWhisperLoop();
  }

  /**
   * Whisper循环识别
   */
  async _startWhisperLoop() {
    const chunkDuration = 3000; // 3秒
    const recorder = new MediaRecorder(this.mediaStream, {
      mimeType: 'audio/webm;codecs=opus'
    });

    const chunks = [];
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = async () => {
      if (!this.isListening || this.isPaused) return;
      
      const blob = new Blob(chunks, { type: 'audio/webm' });
      chunks.length = 0;
      
      // 发送到Whisper
      try {
        const result = await this._transcribeWithWhisper(blob);
        if (result && this.options.onResult) {
          this.options.onResult({
            transcript: result,
            confidence: 0.9,
            isFinal: true,
            timestamp: Date.now()
          });
        }
      } catch (error) {
        console.error('[RealTimeSTT] Whisper error:', error);
      }
      
      // 继续录制
      if (this.isListening && !this.isPaused) {
        setTimeout(() => {
          try {
            recorder.start();
            setTimeout(() => recorder.stop(), chunkDuration);
          } catch (e) {}
        }, 100);
      }
    };

    recorder.start();
    setTimeout(() => recorder.stop(), chunkDuration);
    this.recorder = recorder;
  }

  /**
   * Whisper API调用
   */
  async _transcribeWithWhisper(audioBlob) {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', this.options.language.split('-')[0]);
    formData.append('response_format', 'json');

    const response = await fetch(this.options.whisperEndpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.options.whisperApiKey}`
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Whisper API error: ${response.status}`);
    }

    const data = await response.json();
    return data.text;
  }

  /**
   * 初始化音频分析器
   */
  async _initAudioAnalyser() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new AudioContext();
      
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
      
      // 开始VAD检测
      this._startVAD();
      
    } catch (e) {
      console.warn('[RealTimeSTT] VAD initialization failed:', e);
    }
  }

  /**
   * VAD检测
   */
  _startVAD() {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    
    const checkVAD = () => {
      if (!this.isListening || !this.analyser) return;
      
      this.analyser.getByteFrequencyData(dataArray);
      
      // 计算音量
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const average = sum / dataArray.length;
      const volume = average / 255;
      
      // 静音检测
      this.isSpeaking = volume > this.options.vadSensitivity;
      
      requestAnimationFrame(checkVAD);
    };
    
    checkVAD();
  }

  /**
   * 检查唤醒词
   */
  _checkWakeWord(transcript) {
    if (!this.options.wakeWord) return false;
    
    const lowerTranscript = transcript.toLowerCase();
    const wakeWord = this.options.wakeWord.toLowerCase();
    
    return lowerTranscript.includes(wakeWord);
  }

  /**
   * 获取当前音量
   */
  getVolume() {
    if (!this.analyser) return 0;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    const sum = dataArray.reduce((a, b) => a + b, 0);
    return sum / dataArray.length / 255;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 销毁
   */
  destroy() {
    this.stop();
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
  }
}

if (typeof window !== 'undefined') {
  window.RealTimeSTT = RealTimeSTT;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RealTimeSTT;
}
