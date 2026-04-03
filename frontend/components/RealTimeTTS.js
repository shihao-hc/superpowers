/**
 * RealTimeTTS - 实时语音合成系统
 * 
 * 功能:
 * - 浏览器原生SpeechSynthesis
 * - 多引擎支持(ElevenLabs/Azure/Google)
 * - 流式播放
 * - 音频文件播放(RVC歌曲)
 * - 语音队列管理
 */

class RealTimeTTS {
  constructor(options = {}) {
    this.options = {
      // 引擎: 'browser' | 'elevenlabs' | 'azure' | 'google' | 'edge'
      engine: options.engine || 'browser',
      // 语音设置
      voice: options.voice || null,
      rate: options.rate || 1.0,
      pitch: options.pitch || 1.0,
      volume: options.volume || 1.0,
      // 语言
      language: options.language || 'zh-CN',
      // ElevenLabs配置
      elevenLabsApiKey: options.elevenLabsApiKey || null,
      elevenLabsVoiceId: options.elevenLabsVoiceId || 'default',
      // Azure配置
      azureApiKey: options.azureApiKey || null,
      azureRegion: options.azureRegion || 'eastus',
      // 音频播放
      audioContext: options.audioContext || null,
      // 队列
      queueEnabled: options.queueEnabled !== false,
      // 回调
      onStart: options.onStart || null,
      onEnd: options.onEnd || null,
      onProgress: options.onProgress || null,
      onError: options.onError || null,
      ...options
    };

    // 状态
    this.isSpeaking = false;
    this.isPaused = false;
    this.queue = [];
    this.currentUtterance = null;

    // 音频播放器
    this.audioPlayer = new Audio();
    this.audioPlayer.onended = () => this._onAudioEnd();
    
    // 统计
    this.stats = {
      totalUtterances: 0,
      totalDuration: 0,
      queueLength: 0
    };

    // 初始化
    this._init();
  }

  /**
   * 初始化
   */
  async _init() {
    // 获取可用语音
    await this._loadVoices();
    
    // 根据语言选择语音
    if (!this.options.voice && this.voices.length > 0) {
      const voice = this.voices.find(v => v.lang.startsWith(this.options.language.split('-')[0]));
      this.options.voice = voice || this.voices[0];
    }
  }

  /**
   * 加载可用语音
   */
  async _loadVoices() {
    return new Promise((resolve) => {
      // 语音可能需要异步加载
      const loadVoices = () => {
        this.voices = speechSynthesis.getVoices();
        if (this.voices.length > 0) {
          resolve(this.voices);
        }
      };

      loadVoices();
      
      // Chrome需要等待voiceschanged事件
      if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = loadVoices;
      }
      
      // 超时处理
      setTimeout(() => {
        if (this.voices.length === 0) {
          this.voices = [];
          resolve([]);
        }
      }, 1000);
    });
  }

  /**
   * 说话
   */
  speak(text, options = {}) {
    if (!text || typeof text !== 'string') return;

    const utterance = {
      text: text.trim(),
      options: {
        rate: options.rate || this.options.rate,
        pitch: options.pitch || this.options.pitch,
        volume: options.volume || this.options.volume,
        voice: options.voice || this.options.voice,
        ...options
      }
    };

    if (this.options.queueEnabled) {
      this.queue.push(utterance);
      this.stats.queueLength = this.queue.length;
      this._processQueue();
    } else {
      this._speakImmediate(utterance);
    }
  }

  /**
   * 立即说话
   */
  async _speakImmediate(utterance) {
    this.isSpeaking = true;
    this.stats.totalUtterances++;

    try {
      switch (this.options.engine) {
        case 'browser':
          await this._speakBrowser(utterance);
          break;
        case 'elevenlabs':
          await this._speakElevenLabs(utterance);
          break;
        case 'edge':
          await this._speakEdge(utterance);
          break;
        default:
          await this._speakBrowser(utterance);
      }
    } catch (error) {
      console.error('[RealTimeTTS] Speak error:', error);
      if (this.options.onError) this.options.onError(error);
    }
  }

  /**
   * 处理队列
   */
  async _processQueue() {
    if (this.isSpeaking || this.queue.length === 0) return;

    const utterance = this.queue.shift();
    this.stats.queueLength = this.queue.length;
    
    await this._speakImmediate(utterance);
  }

  /**
   * 浏览器原生TTS
   */
  _speakBrowser(utterance) {
    return new Promise((resolve, reject) => {
      if (!speechSynthesis) {
        reject(new Error('SpeechSynthesis not supported'));
        return;
      }

      // 取消之前的
      speechSynthesis.cancel();

      const ssml = new SpeechSynthesisUtterance(utterance.text);
      ssml.rate = utterance.options.rate;
      ssml.pitch = utterance.options.pitch;
      ssml.volume = utterance.options.volume;
      
      if (utterance.options.voice) {
        ssml.voice = utterance.options.voice;
      }

      ssml.onstart = () => {
        if (this.options.onStart) this.options.onStart(utterance);
      };

      ssml.onend = () => {
        this.isSpeaking = false;
        if (this.options.onEnd) this.options.onEnd(utterance);
        this._onUtteranceEnd();
        resolve();
      };

      ssml.onerror = (event) => {
        this.isSpeaking = false;
        reject(new Error(`SpeechSynthesis error: ${event.error}`));
      };

      // 进度回调
      ssml.onboundary = (event) => {
        if (this.options.onProgress) {
          this.options.onProgress({
            charIndex: event.charIndex,
            charLength: event.charLength,
            elapsed: event.elapsedTime
          });
        }
      };

      this.currentUtterance = ssml;
      speechSynthesis.speak(ssml);
    });
  }

  /**
   * ElevenLabs TTS
   */
  async _speakElevenLabs(utterance) {
    if (!this.options.elevenLabsApiKey) {
      throw new Error('ElevenLabs API key required');
    }

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.options.elevenLabsVoiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.options.elevenLabsApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: utterance.text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs error: ${response.status}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    return this._playAudio(audioUrl);
  }

  /**
   * Edge TTS (免费高质量)
   */
  async _speakEdge(utterance) {
    const voice = 'zh-CN-XiaoxiaoNeural'; // 中文女声
    const ssml = `
      <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="zh-CN">
        <voice name="${voice}">
          <prosody rate="${utterance.options.rate * 100}%" pitch="${utterance.options.pitch > 1 ? '+' : ''}${(utterance.options.pitch - 1) * 50}%">
            ${utterance.text}
          </prosody>
        </voice>
      </speak>
    `;

    const response = await fetch('https://speech.platform.bing.com/speech/synthesize/readaloud/streams/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
      },
      body: ssml
    });

    if (!response.ok) {
      throw new Error(`Edge TTS error: ${response.status}`);
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    
    return this._playAudio(audioUrl);
  }

  /**
   * 播放音频文件
   */
  async playAudioFile(url, options = {}) {
    return new Promise((resolve, reject) => {
      this.audioPlayer.src = url;
      this.audioPlayer.volume = options.volume || this.options.volume;
      this.isSpeaking = true;

      this.audioPlayer.onended = () => {
        this.isSpeaking = false;
        if (this.options.onEnd) this.options.onEnd();
        resolve();
      };

      this.audioPlayer.onerror = (e) => {
        this.isSpeaking = false;
        reject(new Error('Audio playback error'));
      };

      if (options.onStart) options.onStart();
      if (this.options.onStart) this.options.onStart();

      this.audioPlayer.play().catch(reject);
    });
  }

  /**
   * 播放音频URL
   */
  async _playAudio(url) {
    return this.playAudioFile(url);
  }

  /**
   * 说话结束回调
   */
  _onUtteranceEnd() {
    // 处理队列中的下一个
    if (this.queue.length > 0) {
      setTimeout(() => this._processQueue(), 100);
    }
  }

  _onAudioEnd() {
    this.isSpeaking = false;
    this._onUtteranceEnd();
  }

  /**
   * 暂停
   */
  pause() {
    if (this.options.engine === 'browser') {
      speechSynthesis.pause();
    } else {
      this.audioPlayer.pause();
    }
    this.isPaused = true;
  }

  /**
   * 恢复
   */
  resume() {
    if (this.options.engine === 'browser') {
      speechSynthesis.resume();
    } else {
      this.audioPlayer.play();
    }
    this.isPaused = false;
  }

  /**
   * 停止
   */
  stop() {
    if (this.options.engine === 'browser') {
      speechSynthesis.cancel();
    } else {
      this.audioPlayer.pause();
      this.audioPlayer.currentTime = 0;
    }
    
    this.queue = [];
    this.isSpeaking = false;
    this.isPaused = false;
    this.stats.queueLength = 0;
  }

  /**
   * 设置语速
   */
  setRate(rate) {
    this.options.rate = Math.max(0.1, Math.min(10, rate));
  }

  /**
   * 设置音调
   */
  setPitch(pitch) {
    this.options.pitch = Math.max(0, Math.min(2, pitch));
  }

  /**
   * 设置音量
   */
  setVolume(volume) {
    this.options.volume = Math.max(0, Math.min(1, volume));
    this.audioPlayer.volume = this.options.volume;
  }

  /**
   * 根据情感设置参数
   */
  setMood(mood) {
    const moods = {
      happy: { rate: 1.15, pitch: 1.1 },
      sad: { rate: 0.85, pitch: 0.9 },
      excited: { rate: 1.2, pitch: 1.15 },
      calm: { rate: 0.95, pitch: 1.0 },
      angry: { rate: 1.2, pitch: 0.95 }
    };

    const settings = moods[mood] || moods.calm;
    this.setRate(settings.rate);
    this.setPitch(settings.pitch);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * 获取可用语音
   */
  getVoices() {
    return this.voices || [];
  }

  /**
   * 销毁
   */
  destroy() {
    this.stop();
    this.audioPlayer.src = '';
  }
}

if (typeof window !== 'undefined') {
  window.RealTimeTTS = RealTimeTTS;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RealTimeTTS;
}
