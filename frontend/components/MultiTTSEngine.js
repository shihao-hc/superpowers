/**
 * MultiTTSEngine - 多TTS引擎支持
 * 
 * 支持:
 * - ElevenLabs API
 * - Web Speech API (本地)
 * - Azure Cognitive Services
 * - Google Cloud TTS
 */

class MultiTTSEngine {
  constructor(options = {}) {
    this.currentEngine = options.engine || 'auto';
    this.defaultVoice = options.voice || null;
    this.defaultRate = options.rate || 1;
    this.defaultPitch = options.pitch || 1;
    this.defaultVolume = options.volume || 1;
    
    this.engines = {
      elevenlabs: new ElevenLabsEngine(options.elevenlabs || {}),
      browser: new BrowserSpeechEngine(),
      azure: options.azure ? new AzureTTSEngine(options.azure) : null,
      google: options.google ? new GoogleTTSEngine(options.google) : null
    };
    
    this.cache = options.cache !== false ? new Map() : null;
    this.maxCacheSize = options.maxCacheSize || 50;
    
    this.onSpeakStart = options.onSpeakStart || (() => {});
    this.onSpeakEnd = options.onSpeakEnd || (() => {});
    this.onPhoneme = options.onPhoneme || (() => {});
    this.onerror = options.onerror || (() => {});
  }

  async speak(text, options = {}) {
    const engine = options.engine || this._selectBestEngine();
    const engineInstance = this.engines[engine];
    
    if (!engineInstance || !engineInstance.isAvailable()) {
      console.warn(`[TTS] Engine ${engine} not available, falling back to browser`);
      return this.engines.browser.speak(text, options);
    }

    const cacheKey = `${engine}:${text}:${JSON.stringify(options)}`;
    if (this.cache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return this._playAudio(cached, options);
      }
    }

    try {
      const result = await engineInstance.synthesize(text, {
        voice: options.voice || this.defaultVoice,
        rate: options.rate || this.defaultRate,
        pitch: options.pitch || this.defaultPitch,
        volume: options.volume || this.defaultVolume,
        ...options
      });

      if (this.cache && result.audioData) {
        this._addToCache(cacheKey, result.audioData);
      }

      return this._playAudio(result, options);
    } catch (error) {
      console.error(`[TTS] ${engine} failed:`, error);
      this.onerror(error);
      
      if (engine !== 'browser') {
        console.log('[TTS] Falling back to browser speech');
        return this.engines.browser.speak(text, options);
      }
      throw error;
    }
  }

  _selectBestEngine() {
    if (this.currentEngine !== 'auto') {
      return this.currentEngine;
    }

    if (this.engines.elevenlabs.isAvailable()) {
      return 'elevenlabs';
    }
    
    if (this.engines.azure && this.engines.azure.isAvailable()) {
      return 'azure';
    }
    
    if (this.engines.google && this.engines.google.isAvailable()) {
      return 'google';
    }
    
    return 'browser';
  }

  async _playAudio(result, options) {
    this.onSpeakStart({ text: result.text, engine: result.engine });

    if (result.audioElement) {
      return new Promise((resolve, reject) => {
        result.audioElement.onended = () => {
          this.onSpeakEnd({ text: result.text, engine: result.engine });
          resolve();
        };
        result.audioElement.onerror = (e) => {
          this.onerror(e);
          reject(e);
        };
        result.audioElement.play();
      });
    }

    if (options.onPhoneme && result.phonemes) {
      this._animatePhonemes(result.phonemes, options.onPhoneme);
    }

    this.onSpeakEnd({ text: result.text, engine: result.engine });
    return result;
  }

  _animatePhonemes(phonemes, callback) {
    let index = 0;
    const startTime = performance.now();

    const animate = () => {
      if (index >= phonemes.length) return;

      const elapsed = performance.now() - startTime;
      const currentPhoneme = phonemes[index];

      if (elapsed >= currentPhoneme.start) {
        callback(currentPhoneme);
        index++;
      }

      requestAnimationFrame(animate);
    };

    animate();
  }

  _addToCache(key, data) {
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, data);
  }

  setEngine(engine) {
    if (this.engines[engine] || engine === 'auto') {
      this.currentEngine = engine;
    }
  }

  getAvailableEngines() {
    return Object.entries(this.engines)
      .filter(([_, engine]) => engine && engine.isAvailable())
      .map(([name]) => name);
  }

  stop() {
    Object.values(this.engines).forEach(engine => {
      if (engine && engine.stop) {
        engine.stop();
      }
    });
  }

  clearCache() {
    if (this.cache) {
      this.cache.clear();
    }
  }

  dispose() {
    this.stop();
    this.clearCache();
  }
}

/**
 * BrowserSpeechEngine - 浏览器本地TTS
 */
class BrowserSpeechEngine {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
  }

  isAvailable() {
    return !!this.synth;
  }

  async synthesize(text, options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.synth) {
        reject(new Error('Speech synthesis not available'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.lang || 'zh-CN';
      utterance.rate = options.rate || 1;
      utterance.pitch = options.pitch || 1;
      utterance.volume = options.volume || 1;

      if (options.voice) {
        const voices = this.synth.getVoices();
        const voice = voices.find(v => v.name === options.voice || v.lang === options.voice);
        if (voice) utterance.voice = voice;
      }

      resolve({
        audioElement: null,
        text,
        engine: 'browser',
        utterance
      });
    });
  }

  stop() {
    if (this.synth) {
      this.synth.cancel();
    }
  }

  getVoices() {
    if (!this.synth) return [];
    return this.synth.getVoices().map(v => ({
      name: v.name,
      lang: v.lang,
      localService: v.localService
    }));
  }
}

/**
 * ElevenLabsEngine - ElevenLabs TTS (via server proxy)
 */
class ElevenLabsEngine {
  constructor(options = {}) {
    this.proxyUrl = options.proxyUrl || '/api/tts/elevenlabs';
    this.voiceId = options.voiceId || '21m00Tcm4TlvDq8ikWAM';
    this.modelId = options.modelId || 'eleven_multilingual_v2';
  }

  isAvailable() {
    return !!this.proxyUrl;
  }

  async synthesize(text, options = {}) {
    const ssml = this._buildSSML(text, options);

    const response = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ssml, text })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs API error: ${response.status}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audioElement = new Audio(audioUrl);

    return {
      audioElement,
      audioBlob,
      text,
      engine: 'elevenlabs'
    };
  }

  stop() {
    document.querySelectorAll('audio[src^="blob:"]').forEach(audio => {
      audio.pause();
      audio.src = '';
    });
  }
}

/**
 * AzureTTSEngine - Azure Cognitive Services TTS (via server proxy)
 */
class AzureTTSEngine {
  constructor(options = {}) {
    this.proxyUrl = options.proxyUrl || '/api/tts/azure';
    this.region = options.region || 'eastus';
  }

  isAvailable() {
    return !!this.apiKey;
  }

  _escapeXml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  async synthesize(text, options = {}) {
    const escapedText = this._escapeXml(text);
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
        <voice name="${this._escapeXml(options.voice || 'zh-CN-XiaoxiaoNeural')}">
          <prosody rate="${options.rate || 1}" pitch="${options.pitch || 0}%">
            ${escapedText}
          </prosody>
        </voice>
      </speak>
    `;

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
      },
      body: ssml
    });

    if (!response.ok) {
      throw new Error(`Azure TTS error: ${response.status}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audioElement = new Audio(audioUrl);

    return {
      audioElement,
      audioBlob,
      text,
      engine: 'azure'
    };
  }

  stop() {
    document.querySelectorAll('audio[src^="blob:"]').forEach(audio => {
      audio.pause();
      audio.src = '';
    });
  }
}

/**
 * GoogleTTSEngine - Google Cloud TTS (via server proxy)
 */
class GoogleTTSEngine {
  constructor(options = {}) {
    this.proxyUrl = options.proxyUrl || '/api/tts/google';
  }

  isAvailable() {
    return !!this.proxyUrl;
  }

  async synthesize(text, options = {}) {
    const response = await fetch(this.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        lang: options.lang || 'zh-CN',
        voice: options.voice || 'zh-CN-Wavenet-A',
        speakingRate: options.rate || 1,
        pitch: options.pitch || 0
      })
    });

    if (!response.ok) {
      throw new Error(`Google TTS error: ${response.status}`);
    }

    const data = await response.json();
    const audioBlob = this._base64ToBlob(data.audioContent, 'audio/mp3');
    const audioUrl = URL.createObjectURL(audioBlob);
    const audioElement = new Audio(audioUrl);

    return {
      audioElement,
      audioBlob,
      text,
      engine: 'google'
    };
  }

  _base64ToBlob(base64, mimeType) {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType });
  }

  stop() {
    document.querySelectorAll('audio[src^="blob:"]').forEach(audio => {
      audio.pause();
      audio.src = '';
    });
  }
}

if (typeof window !== 'undefined') {
  window.MultiTTSEngine = MultiTTSEngine;
  window.BrowserSpeechEngine = BrowserSpeechEngine;
  window.ElevenLabsEngine = ElevenLabsEngine;
  window.AzureTTSEngine = AzureTTSEngine;
  window.GoogleTTSEngine = GoogleTTSEngine;
}

if (typeof module !== 'undefined') {
  module.exports = {
    MultiTTSEngine,
    BrowserSpeechEngine,
    ElevenLabsEngine,
    AzureTTSEngine,
    GoogleTTSEngine
  };
}
