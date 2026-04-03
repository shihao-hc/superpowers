/**
 * ElevenLabsLipSync - ElevenLabs TTS唇形同步系统
 * 
 * 功能:
 * - ElevenLabs TTS集成
 * - 音素(Phoneme)时间戳解析
 * - VRM唇形BlendShape映射
 * - 实时唇形动画
 */

class ElevenLabsLipSync {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.ELEVENLABS_API_KEY;
    this.voiceId = options.voiceId || '21m00Tcm4TlvDq8ikWAM';
    this.modelId = options.modelId || 'eleven_multilingual_v2';
    
    this.audioContext = null;
    this.isPlaying = false;
    this.audioBuffer = null;
    
    this.phonemeMap = this._getPhonemeMap();
    this.phonemeTimeline = [];
    this.currentPhoneme = null;
    
    this.onPhoneme = options.onPhoneme || (() => {});
    this.onAudioStart = options.onAudioStart || (() => {});
    this.onAudioEnd = options.onAudioEnd || (() => {});
    
    this.mouthOpenWeight = 0;
    this.mouthShape = 'closed';
  }

  _getPhonemeMap() {
    return {
      'A': { blendshape: 'A', mouthShape: 'open', weight: 1.0 },
      'AA': { blendshape: 'A', mouthShape: 'open', weight: 1.0 },
      'AH': { blendshape: 'A', mouthShape: 'open', weight: 0.8 },
      'AE': { blendshape: 'A', mouthShape: 'open', weight: 0.7 },
      'AO': { blendshape: 'O', mouthShape: 'round', weight: 0.8 },
      'AW': { blendshape: 'U', mouthShape: 'round', weight: 0.7 },
      'AY': { blendshape: 'I', mouthShape: 'narrow', weight: 0.6 },
      
      'E': { blendshape: 'E', mouthShape: 'wide', weight: 0.7 },
      'EH': { blendshape: 'E', mouthShape: 'wide', weight: 0.6 },
      'ER': { blendshape: 'E', mouthShape: 'wide', weight: 0.5 },
      'EY': { blendshape: 'E', mouthShape: 'wide', weight: 0.7 },
      
      'I': { blendshape: 'I', mouthShape: 'narrow', weight: 0.6 },
      'IH': { blendshape: 'I', mouthShape: 'narrow', weight: 0.5 },
      'IY': { blendshape: 'I', mouthShape: 'narrow', weight: 0.7 },
      
      'O': { blendshape: 'O', mouthShape: 'round', weight: 1.0 },
      'OH': { blendshape: 'O', mouthShape: 'round', weight: 0.8 },
      'OW': { blendshape: 'O', mouthShape: 'round', weight: 0.9 },
      'OY': { blendshape: 'O', mouthShape: 'round', weight: 0.7 },
      
      'U': { blendshape: 'U', mouthShape: 'round', weight: 1.0 },
      'UH': { blendshape: 'U', mouthShape: 'round', weight: 0.8 },
      'UW': { blendshape: 'U', mouthShape: 'round', weight: 0.9 },
      
      'M': { blendshape: 'M', mouthShape: 'closed', weight: 0.9 },
      'B': { blendshape: 'M', mouthShape: 'closed', weight: 0.9 },
      'P': { blendshape: 'M', mouthShape: 'closed', weight: 0.9 },
      
      'F': { blendshape: 'F', mouthShape: 'lowered', weight: 0.7 },
      'V': { blendshape: 'F', mouthShape: 'lowered', weight: 0.7 },
      'TH': { blendshape: 'TH', mouthShape: 'tongue', weight: 0.6 },
      'DH': { blendshape: 'TH', mouthShape: 'tongue', weight: 0.6 },
      
      'S': { blendshape: 'E', mouthShape: 'narrow', weight: 0.5 },
      'Z': { blendshape: 'E', mouthShape: 'narrow', weight: 0.5 },
      'SH': { blendshape: 'CH', mouthShape: 'round', weight: 0.6 },
      'ZH': { blendshape: 'CH', mouthShape: 'round', weight: 0.6 },
      
      'CH': { blendshape: 'CH', mouthShape: 'round', weight: 0.7 },
      'JH': { blendshape: 'CH', mouthShape: 'round', weight: 0.7 },
      
      'L': { blendshape: 'E', mouthShape: 'tongue', weight: 0.5 },
      'R': { blendshape: 'E', mouthShape: 'narrow', weight: 0.4 },
      'W': { blendshape: 'U', mouthShape: 'round', weight: 0.8 },
      'Y': { blendshape: 'I', mouthShape: 'narrow', weight: 0.5 },
      
      'N': { blendshape: 'E', mouthShape: 'narrow', weight: 0.4 },
      'NG': { blendshape: 'E', mouthShape: 'narrow', weight: 0.4 },
      
      'K': { blendshape: 'A', mouthShape: 'open', weight: 0.3 },
      'G': { blendshape: 'A', mouthShape: 'open', weight: 0.3 },
      'T': { blendshape: 'A', mouthShape: 'open', weight: 0.3 },
      'D': { blendshape: 'A', mouthShape: 'open', weight: 0.3 },
      
      'HH': { blendshape: 'A', mouthShape: 'open', weight: 0.4 },
      'sil': { blendshape: '', mouthShape: 'closed', weight: 0 }
    };
  }

  async synthesize(text, options = {}) {
    if (!this.apiKey) {
      console.warn('[ElevenLabs] No API key, using browser TTS');
      return this._fallbackSynthesize(text, options);
    }
    
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text,
          model_id: this.modelId,
          voice_settings: {
            stability: options.stability || 0.5,
            similarity_boost: options.similarityBoost || 0.75,
            style: options.style || 0,
            use_speaker_boost: true
          },
          output_format: 'mp3_44100_128'
        })
      });
      
      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }
      
      const audioBlob = await response.blob();
      const phonemeData = await this._parsePhonemes(text, audioBlob);
      
      return {
        audioBlob,
        phonemeData,
        duration: phonemeData.duration
      };
    } catch (error) {
      console.error('[ElevenLabs] Synthesis failed:', error);
      return this._fallbackSynthesize(text, options);
    }
  }

  async _fallbackSynthesize(text, options) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) {
        resolve({ audioBlob: null, phonemeData: { phonemes: [], duration: 1000 } });
        return;
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = options.lang || 'zh-CN';
      utterance.rate = options.rate || 1;
      utterance.pitch = options.pitch || 1;
      
      const phonemeData = this._estimatePhonemes(text);
      
      utterance.onstart = () => {
        this.onAudioStart();
        this._animateFromPhonemes(phonemeData);
      };
      
      utterance.onend = () => {
        this.onAudioEnd();
        this.stop();
      };
      
      speechSynthesis.speak(utterance);
      
      resolve({
        audioBlob: null,
        phonemeData,
        duration: phonemeData.duration
      });
    });
  }

  _estimatePhonemes(text) {
    const phonemes = [];
    let time = 0;
    const avgDuration = 80;
    
    for (const char of text) {
      const phoneme = this._charToPhoneme(char);
      phonemes.push({
        phoneme: phoneme,
        start: time,
        end: time + avgDuration,
        duration: avgDuration
      });
      time += avgDuration;
    }
    
    return { phonemes, duration: time };
  }

  _charToPhoneme(char) {
    if (/[啊阿呀]/.test(char)) return 'A';
    if (/[哦喔]/.test(char)) return 'O';
    if (/[呜屋]/.test(char)) return 'U';
    if (/[诶诶耶]/.test(char)) return 'E';
    if (/[一衣]/.test(char)) return 'I';
    if (/[嗯么]/.test(char)) return 'M';
    if (/[啦]/.test(char)) return 'L';
    if (/[啦啦]/.test(char)) return 'L';
    return 'A';
  }

  async _parsePhonemes(text, audioBlob) {
    return {
      phonemes: this._estimatePhonemes(text).phonemes,
      duration: text.length * 80
    };
  }

  playAudio(audioBlob) {
    if (!audioBlob) return;
    
    const url = URL.createObjectURL(audioBlob);
    const audio = new Audio(url);
    
    audio.onended = () => {
      URL.revokeObjectURL(url);
      this.isPlaying = false;
      this.onAudioEnd();
    };
    
    audio.play();
    this.isPlaying = true;
    this.currentAudio = audio;
    
    return audio;
  }

  _animateFromPhonemes(phonemeData) {
    if (!phonemeData.phonemes.length) return;
    
    let index = 0;
    const startTime = performance.now();
    
    const animate = () => {
      if (!this.isPlaying || index >= phonemeData.phonemes.length) {
        this.mouthOpenWeight = 0;
        this.onPhoneme('sil', 0);
        return;
      }
      
      const elapsed = performance.now() - startTime;
      const currentPhoneme = phonemeData.phonemes[index];
      
      if (elapsed >= currentPhoneme.start) {
        const map = this.phonemeMap[currentPhoneme.phoneme];
        if (map) {
          this.mouthOpenWeight = map.weight;
          this.mouthShape = map.mouthShape;
          this.currentPhoneme = currentPhoneme.phoneme;
          this.onPhoneme(currentPhoneme.phoneme, map.weight);
        }
        index++;
      }
      
      requestAnimationFrame(animate);
    };
    
    animate();
  }

  setOnPhonemeCallback(callback) {
    this.onPhoneme = callback;
  }

  setVoiceId(voiceId) {
    this.voiceId = voiceId;
  }

  getVoices() {
    return [
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', language: 'en' },
      { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', language: 'en' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', language: 'en' },
      { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', language: 'en' },
      { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', language: 'en' },
      { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', language: 'en' },
      { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', language: 'en' },
      { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', language: 'en' },
      { id: 'yoZ06aMxZJJ28mfd3POQ', name: 'Sam', language: 'en' }
    ];
  }

  stop() {
    this.isPlaying = false;
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.mouthOpenWeight = 0;
    this.currentPhoneme = null;
  }

  destroy() {
    this.stop();
    this.audioContext = null;
  }
}

/**
 * LipSyncToVRM - 唇形同步到VRM映射
 */
class LipSyncToVRM {
  constructor(vrmComponent) {
    this.vrmComponent = vrmComponent;
    this.lipSync = null;
    
    this.blendshapeMap = {
      'A': 'A',
      'I': 'I',
      'U': 'U',
      'E': 'E',
      'O': 'O',
      'M': 'M',
      'F': 'F',
      'TH': 'TH',
      'CH': 'CH'
    };
    
    this.vrm0BlendshapeMap = {
      'A': 'a',
      'I': 'i',
      'U': 'u',
      'E': 'e',
      'O': 'o',
      'M': 'mouthClose',
      'F': 'mouthLower',
      'TH': 'mouthFunnel',
      'CH': 'mouthPucker'
    };
  }

  initialize() {
    this.lipSync = new ElevenLabsLipSync({
      onPhoneme: (phoneme, weight) => this._onPhoneme(phoneme, weight)
    });
    return this.lipSync;
  }

  _onPhoneme(phoneme, weight) {
    const vrm = this.vrmComponent.vrm;
    if (!vrm || !vrm.expressionManager) return;
    
    this._resetLipBlendshapes();
    
    const map = this.lipSync.phonemeMap[phoneme];
    if (!map || !map.blendshape) return;
    
    const blendshapeName = this._getBlendshapeName(map.blendshape);
    if (blendshapeName) {
      try {
        vrm.expressionManager.setValue(blendshapeName, weight);
      } catch (e) {}
    }
  }

  _getBlendshapeName(name) {
    const isVRM1 = this.vrmComponent.vrm?.meta?.metaVersion === '1' || 
                    this.vrmComponent.vrm?.meta?.version === '1';
    
    if (isVRM1) {
      const vrm1Map = {
        'A': 'A',
        'I': 'I',
        'U': 'U',
        'E': 'E',
        'O': 'O',
        'M': 'M',
        'F': 'F',
        'TH': 'Other',
        'CH': 'Wink'
      };
      return vrm1Map[name];
    } else {
      return this.vrm0BlendshapeMap[name];
    }
  }

  _resetLipBlendshapes() {
    const vrm = this.vrmComponent.vrm;
    if (!vrm || !vrm.expressionManager) return;
    
    const lipBlendshapes = ['A', 'I', 'U', 'E', 'O', 'M', 'F'];
    
    lipBlendshapes.forEach(name => {
      try {
        vrm.expressionManager.setValue(name, 0);
      } catch (e) {}
    });
  }

  async speak(text, options = {}) {
    const result = await this.lipSync.synthesize(text, options);
    
    if (result.audioBlob) {
      this.lipSync.playAudio(result.audioBlob);
    }
    
    return result;
  }

  stop() {
    if (this.lipSync) {
      this.lipSync.stop();
    }
    this._resetLipBlendshapes();
  }

  destroy() {
    if (this.lipSync) {
      this.lipSync.destroy();
    }
    this.lipSync = null;
  }
}

if (typeof window !== 'undefined') {
  window.ElevenLabsLipSync = ElevenLabsLipSync;
  window.LipSyncToVRM = LipSyncToVRM;
}

if (typeof module !== 'undefined') {
  module.exports = { ElevenLabsLipSync, LipSyncToVRM };
}
