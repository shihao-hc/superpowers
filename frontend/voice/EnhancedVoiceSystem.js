/**
 * EnhancedVoiceSystem - 增强的语音交互系统
 * 
 * 参考 AIRI 的 unspeech 和实时语音聊天实现
 * 和 Neuro-sama 的语音合成能力
 * 
 * 功能:
 * - VAD (Voice Activity Detection) 语音活动检测
 * - STT (Speech-to-Text) 语音识别
 * - TTS (Text-to-Speech) 情感语音合成
 * - 实时语音聊天
 * - 情感检测和映射
 */

class VoiceActivityDetector {
  constructor(options = {}) {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.isListening = false;
    
    this.config = {
      threshold: options.threshold || 0.02,
      silenceDuration: options.silenceDuration || 1500,
      minSpeechDuration: options.minSpeechDuration || 300,
      fftSize: options.fftSize || 2048,
      smoothing: options.smoothing || 0.8
    };
    
    this.speechStartTime = null;
    this.silenceTimer = null;
    this.volumeHistory = [];
    this.historySize = 10;
    
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.onVolumeChange = options.onVolumeChange || (() => {});
  }

  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = this.config.fftSize;
      this.analyser.smoothingTimeConstant = this.config.smoothing;

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);
      
      return true;
    } catch (error) {
      console.error('VAD initialization failed:', error);
      return false;
    }
  }

  start() {
    if (!this.audioContext || this.isListening) return;
    
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    this.isListening = true;
    this.detect();
  }

  stop() {
    this.isListening = false;
    this._clearTimers();
    if (this.speechStartTime) {
      this._handleSpeechEnd();
    }
  }

  detect() {
    if (!this.isListening) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    const volume = this._calculateVolume(dataArray);
    
    // 更新音量历史
    this.volumeHistory.push(volume);
    if (this.volumeHistory.length > this.historySize) {
      this.volumeHistory.shift();
    }
    
    // 计算平均音量
    const avgVolume = this.volumeHistory.reduce((a, b) => a + b, 0) / this.volumeHistory.length;
    
    this.onVolumeChange(avgVolume);

    if (avgVolume > this.config.threshold) {
      if (!this.speechStartTime) {
        this.speechStartTime = Date.now();
        this.onSpeechStart({ volume: avgVolume, timestamp: this.speechStartTime });
      }
      
      // 清除静音计时器
      this._clearSilenceTimer();
    } else if (this.speechStartTime) {
      // 开始静音计时
      if (!this.silenceTimer) {
        this.silenceTimer = setTimeout(() => {
          this._handleSpeechEnd();
        }, this.config.silenceDuration);
      }
    }

    requestAnimationFrame(() => this.detect());
  }

  _calculateVolume(dataArray) {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / dataArray.length / 255;
  }

  _handleSpeechEnd() {
    const duration = Date.now() - this.speechStartTime;
    if (duration >= this.config.minSpeechDuration) {
      this.onSpeechEnd({
        duration,
        startTime: this.speechStartTime,
        endTime: Date.now()
      });
    }
    this.speechStartTime = null;
    this._clearSilenceTimer();
  }

  _clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  _clearTimers() {
    this._clearSilenceTimer();
  }

  getVolumeLevel() {
    if (!this.analyser) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return this._calculateVolume(dataArray);
  }

  destroy() {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

class SpeechRecognizer {
  constructor(options = {}) {
    this.recognition = null;
    this.isListening = false;
    this.language = options.language || 'zh-CN';
    this.continuous = options.continuous !== false;
    this.interimResults = options.interimResults !== false;
    
    this.onResult = options.onResult || (() => {});
    this.onError = options.onError || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onInterim = options.onInterim || (() => {});
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    
    this.init();
  }

  init() {
    const SpeechRecognitionAPI = 
      window.SpeechRecognition || 
      window.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      console.warn('Speech Recognition API not supported');
      return false;
    }

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.lang = this.language;
    this.recognition.continuous = this.continuous;
    this.recognition.interimResults = this.interimResults;
    this.recognition.maxAlternatives = 3;

    this.recognition.onstart = () => {
      this.onSpeechStart();
    };

    this.recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const confidence = result[0].confidence;
      const isFinal = result.isFinal;

      if (isFinal) {
        this.onResult({
          transcript,
          confidence,
          isFinal: true,
          timestamp: Date.now()
        });
        this.onSpeechEnd();
      } else {
        this.onInterim({
          transcript,
          confidence,
          isFinal: false
        });
      }
    };

    this.recognition.onerror = (event) => {
      console.error('Speech Recognition Error:', event.error);
      this.onError({ error: event.error, message: event.message });
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.onEnd();
    };

    return true;
  }

  start() {
    if (!this.recognition) return false;
    
    try {
      this.recognition.start();
      this.isListening = true;
      return true;
    } catch (error) {
      console.error('Failed to start recognition:', error);
      return false;
    }
  }

  stop() {
    if (!this.recognition) return;
    
    try {
      this.recognition.stop();
      this.isListening = false;
    } catch (error) {
      console.error('Failed to stop recognition:', error);
    }
  }

  setLanguage(lang) {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }
}

class EmotionAnalyzer {
  constructor() {
    this.emotionPatterns = {
      happy: {
        text: /开心|高兴|哈哈|太好了|棒|喜欢|爱|❤|😊|😄|🎉|✨|嘿嘿|嘻嘻/,
        voice: { minPitch: 200, minRate: 120 }
      },
      sad: {
        text: /难过|伤心|哭泣|😭|😢|失望|沮丧|呜呜|唉/,
        voice: { maxPitch: 150, maxRate: 80 }
      },
      angry: {
        text: /生气|愤怒|讨厌|烦|😠|😡|😤|气死|可恶/,
        voice: { minPitch: 180, minRate: 140 }
      },
      surprised: {
        text: /惊讶|哇|天哪|真的吗|😮|😲|🤔|咦|啊/,
        voice: { minPitch: 220 }
      },
      shy: {
        text: /害羞|不好意思|腼腆|😳|🙈|哎呀/,
        voice: { maxRate: 90 }
      },
      curious: {
        text: /好奇|想知道|为什么|怎么|🤔|💭|❓|嗯？/,
        voice: { minPitch: 180, maxPitch: 220 }
      },
      excited: {
        text: /激动|兴奋|期待|🔥|💥|🎊|✨|太棒|冲啊/,
        voice: { minPitch: 220, minRate: 130 }
      },
      neutral: {
        text: /.*/,
        voice: {}
      }
    };
  }

  detectFromText(text) {
    for (const [emotion, patterns] of Object.entries(this.emotionPatterns)) {
      if (patterns.text.test(text)) {
        return {
          emotion,
          confidence: 0.8,
          source: 'text'
        };
      }
    }
    return { emotion: 'neutral', confidence: 0.5, source: 'text' };
  }

  detectFromVoice(voiceData) {
    const { pitch, rate, volume } = voiceData;
    const scores = {};
    
    for (const [emotion, patterns] of Object.entries(this.emotionPatterns)) {
      let score = 0;
      const voice = patterns.voice;
      
      if (voice.minPitch && pitch >= voice.minPitch) score += 0.3;
      if (voice.maxPitch && pitch <= voice.maxPitch) score += 0.3;
      if (voice.minRate && rate >= voice.minRate) score += 0.3;
      if (voice.maxRate && rate <= voice.maxRate) score += 0.3;
      if (volume > 0.5) score += 0.1;
      
      scores[emotion] = score;
    }
    
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
    return {
      emotion: best[0],
      confidence: best[1],
      source: 'voice'
    };
  }

  combineDetections(textResult, voiceResult) {
    if (textResult.confidence > voiceResult.confidence) {
      return textResult;
    }
    return voiceResult;
  }
}

class EmotionTTS {
  constructor(options = {}) {
    this.synth = window.speechSynthesis;
    this.language = options.language || 'zh-CN';
    this.enabled = options.enabled !== false;
    
    // 情感到语音参数的映射
    this.emotionParams = {
      happy: { rate: 1.15, pitch: 1.2, volume: 1.0 },
      sad: { rate: 0.85, pitch: 0.9, volume: 0.8 },
      angry: { rate: 1.2, pitch: 0.95, volume: 1.0 },
      excited: { rate: 1.25, pitch: 1.25, volume: 1.0 },
      shy: { rate: 0.9, pitch: 1.1, volume: 0.9 },
      curious: { rate: 1.0, pitch: 1.05, volume: 0.95 },
      surprised: { rate: 0.95, pitch: 1.2, volume: 1.0 },
      neutral: { rate: 1.0, pitch: 1.0, volume: 1.0 }
    };
    
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onError = options.onError || (() => {});
  }

  speak(text, emotion = 'neutral') {
    if (!this.enabled || !this.synth) return;
    
    // 停止当前播放
    this.stop();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const params = this.emotionParams[emotion] || this.emotionParams.neutral;
    
    utterance.lang = this.language;
    utterance.rate = params.rate;
    utterance.pitch = params.pitch;
    utterance.volume = params.volume;
    
    utterance.onstart = () => this.onStart({ text, emotion });
    utterance.onend = () => this.onEnd({ text, emotion });
    utterance.onerror = (e) => this.onError(e);
    
    this.synth.speak(utterance);
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
  }

  setEmotionParams(emotion, params) {
    this.emotionParams[emotion] = { ...this.emotionParams[emotion], ...params };
  }
}

class EnhancedVoiceSystem {
  constructor(options = {}) {
    this.vad = new VoiceActivityDetector(options.vad);
    this.recognizer = new SpeechRecognizer(options.recognizer);
    this.emotionAnalyzer = new EmotionAnalyzer();
    this.tts = new EmotionTTS(options.tts);
    
    this.isVoiceEnabled = false;
    this.currentEmotion = 'neutral';
    this.conversationHistory = [];
    
    // 回调
    this.onUserMessage = options.onUserMessage || (() => {});
    this.onAIResponse = options.onAIResponse || (() => {});
    this.onEmotionChange = options.onEmotionChange || (() => {});
    this.onVolumeChange = options.onVolumeChange || (() => {});
    
    // 自动响应
    this.autoRespond = options.autoRespond !== false;
    this.fetchAI = options.fetchAI || this._defaultFetchAI.bind(this);
    
    this._setupCallbacks();
  }

  _setupCallbacks() {
    this.vad.onSpeechStart = (data) => {
      this.recognizer.start();
    };

    this.vad.onSpeechEnd = (data) => {
      // Speech ended, recognizer will get final result
    };

    this.vad.onVolumeChange = (volume) => {
      this.onVolumeChange(volume);
    };

    this.recognizer.onResult = (data) => {
      this._handleRecognition(data);
    };

    this.recognizer.onInterim = (data) => {
      // 可用于实时字幕
    };
  }

  async _handleRecognition(data) {
    const { transcript, confidence } = data;
    
    if (confidence < 0.5) {
      console.log('Low confidence, ignoring:', transcript);
      return;
    }

    // 情感分析
    const textEmotion = this.emotionAnalyzer.detectFromText(transcript);
    this._updateEmotion(textEmotion.emotion);
    
    // 记录用户消息
    const userMessage = {
      type: 'user',
      text: transcript,
      emotion: textEmotion.emotion,
      confidence,
      timestamp: Date.now()
    };
    
    this.conversationHistory.push(userMessage);
    this.onUserMessage(userMessage);
    
    // 自动响应
    if (this.autoRespond) {
      try {
        const response = await this.fetchAI(transcript, this.conversationHistory);
        if (response) {
          this._handleAIResponse(response);
        }
      } catch (error) {
        console.error('AI response error:', error);
      }
    }
  }

  async _defaultFetchAI(text, history) {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text, 
          history: history.slice(-10).map(h => ({ role: h.type === 'user' ? 'user' : 'assistant', content: h.text }))
        })
      });
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Fetch AI error:', error);
    }
    return null;
  }

  _handleAIResponse(response) {
    const aiMessage = {
      type: 'ai',
      text: response.reply || response.text || response.message,
      emotion: response.mood || response.emotion || 'happy',
      timestamp: Date.now()
    };
    
    this.conversationHistory.push(aiMessage);
    this.onAIResponse(aiMessage);
    this.onEmotionChange(aiMessage.emotion);
    
    // TTS
    this.tts.speak(aiMessage.text, aiMessage.emotion);
  }

  _updateEmotion(emotion) {
    if (emotion !== this.currentEmotion) {
      this.currentEmotion = emotion;
      this.onEmotionChange(emotion);
    }
  }

  // 公共 API
  async init() {
    const vadReady = await this.vad.init();
    const sttSupported = this.recognizer.isSupported();
    
    console.log('Voice System:', { vadReady, sttSupported, tts: !!this.tts });
    
    return vadReady && sttSupported;
  }

  enable() {
    this.isVoiceEnabled = true;
    this.vad.start();
    console.log('Voice enabled');
  }

  disable() {
    this.isVoiceEnabled = false;
    this.vad.stop();
    this.recognizer.stop();
    this.tts.stop();
    console.log('Voice disabled');
  }

  speak(text, emotion = null) {
    const detectedEmotion = emotion || this.emotionAnalyzer.detectFromText(text).emotion;
    this.tts.speak(text, detectedEmotion);
  }

  stopSpeaking() {
    this.tts.stop();
  }

  getVolumeLevel() {
    return this.vad.getVolumeLevel();
  }

  getConversationHistory() {
    return this.conversationHistory;
  }

  clearHistory() {
    this.conversationHistory = [];
  }

  destroy() {
    this.disable();
    this.vad.destroy();
  }
}

// 导出
if (typeof window !== 'undefined') {
  window.EnhancedVoiceSystem = EnhancedVoiceSystem;
  window.VoiceActivityDetector = VoiceActivityDetector;
  window.SpeechRecognizer = SpeechRecognizer;
  window.EmotionAnalyzer = EmotionAnalyzer;
  window.EmotionTTS = EmotionTTS;
}

if (typeof module !== 'undefined') {
  module.exports = {
    EnhancedVoiceSystem,
    VoiceActivityDetector,
    SpeechRecognizer,
    EmotionAnalyzer,
    EmotionTTS
  };
}
