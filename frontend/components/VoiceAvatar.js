class TTSSystem {
  constructor(options = {}) {
    this.enabled = false;
    this.lang = options.lang || 'zh-CN';
    this.rate = options.rate || 1.0;
    this.pitch = options.pitch || 1.0;
    this.volume = options.volume || 1.0;
    this.voice = null;
    this.isSpeaking = false;
    this.currentUtterance = null;
    this.onStart = options.onStart || (() => {});
    this.onEnd = options.onEnd || (() => {});
    this.onError = options.onError || ((e) => console.error('TTS Error:', e));
    
    this.phonemeMap = {
      'a': 0.8, 'e': 0.7, 'i': 0.5, 'o': 0.6, 'u': 0.4,
      'b': 0.3, 'd': 0.4, 'g': 0.3, 'k': 0.3, 'l': 0.2,
      'm': 0.3, 'n': 0.3, 'p': 0.3, 'r': 0.2, 's': 0.3,
      't': 0.3, 'v': 0.3, 'w': 0.2, 'y': 0.3, 'z': 0.3,
      'zh': 0.4, 'ch': 0.4, 'sh': 0.4, 'ai': 0.6, 'ei': 0.6,
      'ao': 0.7, 'ou': 0.6, 'an': 0.5, 'en': 0.5, 'ang': 0.6,
      'eng': 0.5, 'ong': 0.6
    };
    
    this.mouthShapes = {
      closed: 0,
      slightlyOpen: 0.3,
      halfOpen: 0.5,
      open: 0.7,
      wideOpen: 1.0
    };
    
    this.phonemeMouthMap = {
      'a': 'open', 'e': 'halfOpen', 'i': 'slightlyOpen',
      'o': 'open', 'u': 'slightlyOpen', 'ai': 'halfOpen',
      'ei': 'halfOpen', 'ao': 'open', 'ou': 'halfOpen',
      'm': 'closed', 'n': 'closed', 'ng': 'closed',
      'b': 'closed', 'p': 'closed', 'f': 'slightlyOpen',
      'l': 'halfOpen', 's': 'slightlyOpen', 'sh': 'slightlyOpen',
      'zh': 'slightlyOpen', 'ch': 'slightlyOpen', 't': 'halfOpen',
      'd': 'halfOpen', 'g': 'halfOpen', 'k': 'halfOpen',
      'default': 'slightlyOpen'
    };
    
    this.initVoices();
  }

  initVoices() {
    if ('speechSynthesis' in window) {
      const loadVoices = () => {
        const voices = speechSynthesis.getVoices();
        this.voices = voices;
        this.voice = voices.find(v => v.lang.includes('zh')) || 
                     voices.find(v => v.lang.includes('en')) ||
                     voices[0] || null;
      };
      
      loadVoices();
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
      }
    }
  }

  setLanguage(lang) {
    this.lang = lang;
  }

  setVoice(voiceName) {
    if (this.voices) {
      this.voice = this.voices.find(v => v.name === voiceName) || this.voice;
    }
  }

  setMoodRatePitch(mood, rateVariants, pitchVariants) {
    this.rate = rateVariants?.[mood] || 1.0;
    this.pitch = pitchVariants?.[mood] || 1.0;
  }

  speak(text, options = {}) {
    if (!('speechSynthesis' in window)) {
      console.warn('Speech synthesis not supported');
      return;
    }

    this.stop();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = options.lang || this.lang;
    utterance.rate = options.rate || this.rate;
    utterance.pitch = options.pitch || this.pitch;
    utterance.volume = options.volume || this.volume;
    
    if (this.voice) {
      utterance.voice = this.voice;
    }

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.currentUtterance = utterance;
      this.onStart(text);
    };

    utterance.onend = () => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      this.onEnd();
    };

    utterance.onerror = (event) => {
      this.isSpeaking = false;
      this.currentUtterance = null;
      if (event.error !== 'canceled') {
        this.onError(event);
      }
    };

    speechSynthesis.speak(utterance);
    return utterance;
  }

  stop() {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.currentUtterance = null;
  }

  pause() {
    if ('speechSynthesis' in window && speechSynthesis.pause) {
      speechSynthesis.pause();
    }
  }

  resume() {
    if ('speechSynthesis' in window && speechSynthesis.resume) {
      speechSynthesis.resume();
    }
  }

  isSupported() {
    return 'speechSynthesis' in window;
  }

  getVoices() {
    return this.voices || [];
  }

  getMouthValue(text, charIndex) {
    if (charIndex >= text.length) return 0;
    
    const char = text[charIndex].toLowerCase();
    
    if (/[aeiou]/.test(char)) {
      const shape = this.phonemeMouthMap[char] || 'default';
      return this.mouthShapes[shape];
    }
    
    return this.mouthShapes.closed;
  }

  estimatePhonemeSequence(text) {
    const phonemes = [];
    const chinesePattern = /[\u4e00-\u9fa5]/g;
    const englishPattern = /[a-zA-Z]+/g;
    
    let match;
    let lastIndex = 0;
    
    while ((match = englishPattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        const chinesePart = text.slice(lastIndex, match.index);
        for (const char of chinesePart) {
          phonemes.push({ char, mouth: 0.3, duration: 150 });
        }
      }
      
      const word = match[0];
      for (const char of word) {
        const mouthVal = this.getMouthValue(word, word.indexOf(char));
        phonemes.push({ char, mouth: mouthVal, duration: 100 });
      }
      lastIndex = match.index + word.length;
    }
    
    if (lastIndex < text.length) {
      const remaining = text.slice(lastIndex);
      for (const char of remaining) {
        phonemes.push({ char, mouth: 0.3, duration: 150 });
      }
    }
    
    return phonemes;
  }
}

class LipSyncAnimator {
  constructor(live2dComponent, options = {}) {
    this.live2d = live2dComponent;
    this.isAnimating = false;
    this.animationTimer = null;
    this.currentPhonemeIndex = 0;
    this.phonemes = [];
    this.phonemeTimings = [];
    this.onLipSyncUpdate = options.onLipSyncUpdate || (() => {});
  }

  start(text) {
    if (!this.live2d) return;
    
    this.stop();
    this.phonemes = this.estimatePhonemeSequence(text);
    this.currentPhonemeIndex = 0;
    this.isAnimating = true;
    this.animate();
  }

  stop() {
    this.isAnimating = false;
    if (this.animationTimer) {
      clearTimeout(this.animationTimer);
      this.animationTimer = null;
    }
    this.resetMouth();
  }

  estimatePhonemeSequence(text) {
    const phonemes = [];
    const chars = text.split('');
    
    chars.forEach((char, i) => {
      let mouthValue = 0.2;
      
      if (/[aeiouAEIOU]/.test(char)) {
        mouthValue = 0.6;
      } else if (/[bpmf]/.test(char.toLowerCase())) {
        mouthValue = 0.1;
      } else if (/[gkh]/.test(char.toLowerCase())) {
        mouthValue = 0.3;
      }
      
      phonemes.push({
        char,
        mouthValue,
        duration: 80 + Math.random() * 40
      });
    });
    
    return phonemes;
  }

  animate() {
    if (!this.isAnimating) return;
    
    if (this.currentPhonemeIndex < this.phonemes.length) {
      const phoneme = this.phonemes[this.currentPhonemeIndex];
      
      this.updateLive2DMouth(phoneme.mouthValue);
      this.onLipSyncUpdate(phoneme);
      
      this.animationTimer = setTimeout(() => {
        this.currentPhonemeIndex++;
        this.animate();
      }, phoneme.duration);
    } else {
      this.stop();
    }
  }

  updateLive2DMouth(value) {
    if (this.live2d && this.live2d.oml2d) {
      try {
        if (typeof this.live2d.oml2d.setLipSync === 'function') {
          this.live2d.oml2d.setLipSync(true);
          this.live2d.oml2d.setLipSyncValue?.(value);
        } else if (typeof this.live2d.oml2d.setParameter === 'function') {
          this.live2d.oml2d.setParameter('MouthOpenY', value);
        }
      } catch (e) {
        // Model may not support this parameter
      }
    }
  }

  resetMouth() {
    this.updateLive2DMouth(0);
  }
}

class VoiceAvatar {
  constructor(live2dComponent, options = {}) {
    this.live2d = live2dComponent;
    this.tts = new TTSSystem({
      onStart: () => this.onSpeakingStart(),
      onEnd: () => this.onSpeakingEnd(),
      onError: (e) => this.onSpeakingError(e)
    });
    this.lipSync = new LipSyncAnimator(live2dComponent);
    this.moodLipSync = options.moodLipSync !== false;
  }

  speak(text, moodConfig = {}) {
    if (!text || !text.trim()) return;
    
    this.stop();
    
    this.tts.setMoodRatePitch(
      moodConfig.mood,
      moodConfig.rateVariants,
      moodConfig.pitchVariants
    );
    
    this.tts.speak(text);
    
    if (this.moodLipSync) {
      this.lipSync.start(text);
    }
  }

  stop() {
    this.tts.stop();
    this.lipSync.stop();
  }

  setMood(mood) {
    // Mood-specific TTS adjustments
    const moodConfigs = {
      happy: { rate: 1.1, pitch: 1.1 },
      excited: { rate: 1.3, pitch: 1.2 },
      sad: { rate: 0.8, pitch: 0.9 },
      calm: { rate: 0.9, pitch: 0.95 },
      curious: { rate: 1.0, pitch: 1.05 },
      shy: { rate: 0.9, pitch: 1.1 },
      proud: { rate: 1.0, pitch: 1.1 }
    };
    
    const config = moodConfigs[mood] || moodConfigs.calm;
    this.tts.rate = config.rate;
    this.tts.pitch = config.pitch;
  }

  onSpeakingStart() {
    if (this.live2d) {
      this.live2d.speak();
    }
  }

  onSpeakingEnd() {
    if (this.live2d) {
      this.live2d.stopSpeaking();
    }
  }

  onSpeakingError(error) {
    console.error('Speaking error:', error);
    this.lipSync.stop();
  }

  isSpeaking() {
    return this.tts.isSpeaking;
  }

  enable() {
    this.tts.enabled = true;
  }

  disable() {
    this.tts.stop();
    this.tts.enabled = false;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TTSSystem, LipSyncAnimator, VoiceAvatar };
}
