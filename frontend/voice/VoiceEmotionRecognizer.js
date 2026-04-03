class VoiceEmotionRecognizer {
  constructor(options = {}) {
    this.recognition = null;
    this.audioContext = null;
    this.analyser = null;
    this.stream = null;
    this.enabled = false;
    this.continuous = options.continuous || false;
    this.interimResults = options.interimResults || false;
    this.language = options.language || 'zh-CN';
    this.lastResult = null;
    this.onEmotionDetected = options.onEmotionDetected || (() => {});
    this.onSpeechResult = options.onSpeechResult || (() => {});
    this.onError = options.onError || (() => {});
  }

  async checkAvailable() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.enabled = !!SpeechRecognition;
    
    if (this.enabled) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = this.continuous;
      this.recognition.interimResults = this.interimResults;
      this.recognition.lang = this.language;
      
      this.recognition.onresult = (event) => {
        const result = event.results[event.results.length - 1];
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;
        
        this.lastResult = {
          transcript,
          confidence,
          isFinal: result.isFinal
        };
        
        const emotion = this._detectEmotionFromText(transcript);
        this.onSpeechResult(this.lastResult);
        this.onEmotionDetected(emotion);
      };
      
      this.recognition.onerror = (event) => {
        console.error('[VoiceEmotion] Error:', event.error);
        this.onError(event.error);
      };
      
      this.recognition.onend = () => {
        if (this.continuous && this.enabled) {
          setTimeout(() => this.start(), 100);
        }
      };
    }
    
    return this.enabled;
  }

  _detectEmotionFromText(text) {
    const lowerText = text.toLowerCase();
    
    const emotionPatterns = {
      angry: ['生气', '愤怒', '烦', '讨厌', '滚', '什么鬼', 'shit', 'fuck', 'damn', '讨厌', '怒'],
      sad: ['难过', '伤心', '悲伤', '哭', '好可怜', 'sad', 'depressed', 'crying'],
      happy: ['开心', '高兴', '太好了', '太棒了', '哈哈', '嘻嘻', 'happy', 'great', 'awesome', 'love'],
      excited: ['哇', '太厉害了', '惊了', '哇塞', '哇哦', 'wow', 'omg', 'amazing', 'incredible'],
      fearful: ['害怕', '吓人', '恐怖', '紧张', 'worried', 'scared', 'afraid', 'nervous'],
      surprised: ['惊讶', '不会吧', '真的假的', 'surprised', 'wow', 'really', 'seriously'],
      disgusted: ['恶心', '吐了', '受不了', 'disgusting', 'gross', 'yuck'],
      neutral: []
    };
    
    for (const [emotion, patterns] of Object.entries(emotionPatterns)) {
      if (patterns.some(pattern => lowerText.includes(pattern))) {
        return emotion;
      }
    }
    
    return 'neutral';
  }

  async _setupAudioAnalysis() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(this.stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      source.connect(this.analyser);
    } catch (err) {
      console.warn('[VoiceEmotion] Audio analysis not available:', err.message);
    }
  }

  getAudioFeatures() {
    if (!this.analyser) return null;
    
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const max = Math.max(...dataArray);
    const min = Math.min(...dataArray);
    
    let lowFreq = 0, midFreq = 0, highFreq = 0;
    const third = Math.floor(dataArray.length / 3);
    for (let i = 0; i < third; i++) lowFreq += dataArray[i];
    for (let i = third; i < third * 2; i++) midFreq += dataArray[i];
    for (let i = third * 2; i < dataArray.length; i++) highFreq += dataArray[i];
    
    return {
      average,
      max,
      min,
      range: max - min,
      lowFreqEnergy: lowFreq / third,
      midFreqEnergy: midFreq / third,
      highFreqEnergy: highFreq / third,
      timestamp: Date.now()
    };
  }

  _detectEmotionFromAudio(features) {
    if (!features) return 'neutral';
    
    const { lowFreqEnergy, highFreqEnergy, range } = features;
    
    if (highFreqEnergy > lowFreqEnergy * 1.5 && range > 100) {
      return 'excited';
    }
    if (range < 30 && lowFreqEnergy > 100) {
      return 'calm';
    }
    if (highFreqEnergy > 150) {
      return 'angry';
    }
    
    return 'neutral';
  }

  start() {
    if (this.recognition && this.enabled) {
      try {
        this.recognition.start();
        console.log('[VoiceEmotion] Listening...');
      } catch (err) {
        console.error('[VoiceEmotion] Start error:', err.message);
      }
    }
  }

  stop() {
    if (this.recognition) {
      try {
        this.recognition.stop();
        console.log('[VoiceEmotion] Stopped');
      } catch (err) {
        console.error('[VoiceEmotion] Stop error:', err.message);
      }
    }
  }

  setLanguage(lang) {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  destroy() {
    this.stop();
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    if (this.audioContext) {
      this.audioContext.close();
    }
    this.enabled = false;
  }

  getStatus() {
    return {
      enabled: this.enabled,
      continuous: this.continuous,
      language: this.language,
      lastResult: this.lastResult
    };
  }
}

window.VoiceEmotionRecognizer = VoiceEmotionRecognizer;
