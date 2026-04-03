/**
 * VoiceInteractionManager - 统一的语音交互管理器
 * 
 * 功能:
 * - STT (Speech-to-Text): 语音识别
 * - TTS (Text-to-Text): 语音合成
 * - VAD (Voice Activity Detection): 语音活动检测
 * - 情绪识别: 根据语音语调判断情绪
 */

class VoiceActivityDetector {
  constructor(options = {}) {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.isListening = false;
    this.threshold = options.threshold || 0.02;
    this.onSpeechStart = options.onSpeechStart || (() => {});
    this.onSpeechEnd = options.onSpeechEnd || (() => {});
    this.silenceTimeout = null;
    this.silenceDuration = options.silenceDuration || 1500;
    this.speechStartTime = null;
  }

  async init() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.8;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.microphone = this.audioContext.createMediaStreamSource(stream);
      this.microphone.connect(this.analyser);
      
      return true;
    } catch (error) {
      console.error('VAD初始化失败:', error);
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
    if (this.silenceTimeout) {
      clearTimeout(this.silenceTimeout);
      this.silenceTimeout = null;
    }
  }

  detect() {
    if (!this.isListening) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);

    const volume = this.calculateVolume(dataArray);

    if (volume > this.threshold) {
      if (!this.speechStartTime) {
        this.speechStartTime = Date.now();
        this.onSpeechStart({ volume, timestamp: this.speechStartTime });
      }
      
      // Clear silence timeout
      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }
    } else if (this.speechStartTime) {
      // Start silence timeout
      if (!this.silenceTimeout) {
        this.silenceTimeout = setTimeout(() => {
          const duration = Date.now() - this.speechStartTime;
          this.onSpeechEnd({ 
            duration, 
            startTime: this.speechStartTime,
            endTime: Date.now() 
          });
          this.speechStartTime = null;
          this.silenceTimeout = null;
        }, this.silenceDuration);
      }
    }

    requestAnimationFrame(() => this.detect());
  }

  calculateVolume(dataArray) {
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / dataArray.length / 255;
  }

  getVolumeLevel() {
    if (!this.analyser) return 0;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    return this.calculateVolume(dataArray);
  }

  destroy() {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

class SpeechRecognition {
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

class EmotionDetector {
  constructor() {
    this.emotionPatterns = {
      happy: /开心|高兴|哈哈|太好了|棒|喜欢|爱|❤|😊|😄|🎉/,
      sad: /难过|伤心|哭泣|😭|😢|失望|沮丧/,
      angry: /生气|愤怒|讨厌|烦|😠|😡|😤/,
      surprised: /惊讶|哇|天哪|真的吗|😮|😲|🤔/,
      neutral: /.*/
    };

    this.toneEmotions = {
      highPitch: ['excited', 'happy', 'surprised'],
      lowPitch: ['calm', 'sad', 'serious'],
      fastRate: ['excited', 'happy', 'angry'],
      slowRate: ['calm', 'sad', 'thoughtful']
    };
  }

  detectFromText(text) {
    for (const [emotion, pattern] of Object.entries(this.emotionPatterns)) {
      if (pattern.test(text)) {
        return emotion;
      }
    }
    return 'neutral';
  }

  detectFromVoice(audioData) {
    // Analyze pitch, volume, and speaking rate
    const { pitch, volume, rate } = audioData;
    
    let emotions = [];
    
    if (pitch > 200) emotions.push(...this.toneEmotions.highPitch);
    else if (pitch < 100) emotions.push(...this.toneEmotions.lowPitch);
    
    if (rate > 150) emotions.push(...this.toneEmotions.fastRate);
    else if (rate < 80) emotions.push(...this.toneEmotions.slowRate);
    
    // Return most common emotion
    const counts = emotions.reduce((acc, e) => {
      acc[e] = (acc[e] || 0) + 1;
      return acc;
    }, {});
    
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || 'neutral';
  }

  detectFromVolume(volume) {
    if (volume > 0.7) return 'excited';
    if (volume > 0.4) return 'happy';
    if (volume > 0.2) return 'calm';
    return 'neutral';
  }
}

class VoiceInteractionManager {
  constructor(options = {}) {
    this.vad = new VoiceActivityDetector({
      threshold: options.vadThreshold || 0.02,
      silenceDuration: options.silenceDuration || 1500,
      onSpeechStart: (data) => this.handleSpeechStart(data),
      onSpeechEnd: (data) => this.handleSpeechEnd(data)
    });

    this.stt = new SpeechRecognition({
      language: options.language || 'zh-CN',
      continuous: options.continuous !== false,
      onResult: (data) => this.handleSTTResult(data),
      onInterim: (data) => this.handleSTTInterim(data),
      onError: (error) => this.handleSTTError(error)
    });

    this.emotionDetector = new EmotionDetector();
    
    this.tts = null; // Will be set from existing TTSSystem
    this.character = null; // Virtual character reference
    
    this.isVoiceEnabled = false;
    this.currentEmotion = 'neutral';
    this.conversationHistory = [];
    
    this.onUserMessage = options.onUserMessage || (() => {});
    this.onAIResponse = options.onAIResponse || (() => {});
    this.onEmotionChange = options.onEmotionChange || (() => {});
    
    this.autoRespond = options.autoRespond !== false;
    this.responseDelay = options.responseDelay || 500;
  }

  setTTS(ttsSystem) {
    this.tts = ttsSystem;
  }

  setCharacter(character) {
    this.character = character;
  }

  async init() {
    const vadReady = await this.vad.init();
    const sttSupported = this.stt.isSupported();
    
    console.log('Voice System Initialized:', {
      vad: vadReady,
      stt: sttSupported,
      tts: !!this.tts
    });
    
    return vadReady && sttSupported;
  }

  enable() {
    this.isVoiceEnabled = true;
    this.vad.start();
    this.stt.start();
    console.log('Voice interaction enabled');
  }

  disable() {
    this.isVoiceEnabled = false;
    this.vad.stop();
    this.stt.stop();
    if (this.tts) this.tts.stop();
    console.log('Voice interaction disabled');
  }

  handleSpeechStart(data) {
    console.log('Speech started:', data);
    if (this.character) {
      this.character.setMood('curious');
    }
  }

  handleSpeechEnd(data) {
    console.log('Speech ended:', data);
    // The STT will handle the final result
  }

  handleSTTResult(data) {
    const { transcript, confidence } = data;
    
    if (confidence < 0.5) {
      console.log('Low confidence result, ignoring:', transcript);
      return;
    }

    const detectedEmotion = this.emotionDetector.detectFromText(transcript);
    this.updateEmotion(detectedEmotion);
    
    const userMessage = {
      type: 'user',
      text: transcript,
      emotion: detectedEmotion,
      confidence,
      timestamp: Date.now()
    };
    
    this.conversationHistory.push(userMessage);
    this.onUserMessage(userMessage);
    
    if (this.autoRespond) {
      setTimeout(() => {
        this.generateResponse(transcript);
      }, this.responseDelay);
    }
  }

  handleSTTInterim(data) {
    // Could be used for real-time subtitle display
    if (this.character) {
      this.character.setMood('listening');
    }
  }

  handleSTTError(error) {
    console.error('STT Error:', error);
    if (error.error === 'no-speech') {
      // Restart listening
      if (this.isVoiceEnabled) {
        this.stt.start();
      }
    }
  }

  updateEmotion(emotion) {
    if (emotion !== this.currentEmotion) {
      this.currentEmotion = emotion;
      this.onEmotionChange(emotion);
      
      if (this.character) {
        this.character.setMood(emotion);
      }
    }
  }

  async generateResponse(userText) {
    // This should be connected to the main AI system
    // For now, emit event for external handler
    const response = await this.fetchAIResponse(userText);
    
    if (response) {
      const aiMessage = {
        type: 'ai',
        text: response.text,
        emotion: response.emotion || 'happy',
        timestamp: Date.now()
      };
      
      this.conversationHistory.push(aiMessage);
      this.onAIResponse(aiMessage);
      
      // Speak the response
      if (this.tts) {
        this.tts.speak(response.text);
      }
      
      // Update character emotion
      if (this.character) {
        this.character.setMood(response.emotion || 'happy');
        this.character.speak(response.text);
      }
    }
  }

  async fetchAIResponse(text) {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Failed to fetch AI response:', error);
    }
    
    return null;
  }

  speak(text, emotion = null) {
    if (!this.tts || !text) return;
    
    const detectedEmotion = emotion || this.emotionDetector.detectFromText(text);
    this.updateEmotion(detectedEmotion);
    
    this.tts.speak(text);
    
    if (this.character) {
      this.character.setMood(detectedEmotion);
      this.character.speak(text);
    }
  }

  stopSpeaking() {
    if (this.tts) this.tts.stop();
    if (this.character) this.character.stopSpeaking();
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

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.VoiceActivityDetector = VoiceActivityDetector;
  window.SpeechRecognition = SpeechRecognition;
  window.EmotionDetector = EmotionDetector;
  window.VoiceInteractionManager = VoiceInteractionManager;
}

if (typeof module !== 'undefined') {
  module.exports = {
    VoiceActivityDetector,
    SpeechRecognition,
    EmotionDetector,
    VoiceInteractionManager
  };
}
