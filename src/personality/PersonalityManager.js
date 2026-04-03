const fs = require('fs');
const path = require('path');

class PersonalityManager {
  constructor(dataPath) {
    this.dataPath = dataPath;
    this.personalities = {};
    this.activeName = null;
    this.active = null;
    this.activeStorePath = path.resolve(process.cwd(), '.opencode', 'active-personality.json');
    this.driftTimer = null;
  }

  async load() {
    try {
      const raw = await fs.promises.readFile(this.dataPath, 'utf8');
      const json = JSON.parse(raw);
      this.personalities = json.personalities || {};
      this.activeName = json.active || null;
      this.active = this.activeName ? this.personalities[this.activeName] : null;
      if (this.active) {
        this._startMoodDrift();
      }
    } catch (e) {
      this.personalities = {};
    }
  }

  loadSync() {
    try {
      const raw = fs.readFileSync(this.dataPath, 'utf8');
      const json = JSON.parse(raw);
      this.personalities = json.personalities || {};
      if (fs.existsSync(this.activeStorePath)) {
        const activeRaw = fs.readFileSync(this.activeStorePath, 'utf8');
        const activeName = activeRaw.trim();
        if (activeName && this.personalities[activeName]) {
          this.activeName = activeName;
          this.active = this.personalities[activeName];
        }
      } else {
        this.activeName = json.active || null;
        this.active = this.activeName ? this.personalities[this.activeName] : null;
      }
      if (this.active) {
        this._startMoodDrift();
      }
    } catch (e) {
      this.personalities = {};
    }
  }

  _startMoodDrift() {
    if (this.driftTimer) clearInterval(this.driftTimer);
    const moodConfig = this.active?.mood;
    if (!moodConfig?.enabled) return;
    const interval = moodConfig.intervals || 300000;
    this.driftTimer = setInterval(() => {
      if (Math.random() < (moodConfig.drift || 0.2)) {
        const moods = moodConfig.moods || ['neutral'];
        this.active.mood = moods[Math.floor(Math.random() * moods.length)];
      }
    }, interval);
  }

  stopMoodDrift() {
    if (this.driftTimer) {
      clearInterval(this.driftTimer);
      this.driftTimer = null;
    }
  }

  setActive(name) {
    if (!name) return false;
    if (this.personalities[name]) {
      this.stopMoodDrift();
      this.activeName = name;
      this.active = this.personalities[name];
      this._saveActiveName();
      this._startMoodDrift();
      return true;
    }
    return false;
  }

  getMood() {
    return this.active?.mood?.default || this.active?.mood || 'neutral';
  }

  getTTSConfig() {
    if (!this.active?.tts?.enabled) return null;
    const mood = this.getMood();
    return {
      lang: this.active.tts.lang || 'zh-CN',
      rate: this.active.tts.rateVariants?.[mood] || 1.0,
      pitch: this.active.tts.pitchVariants?.[mood] || 1.0
    };
  }

  getRoutingKeywords(intent) {
    return this.active?.routing?.[intent] || [];
  }

  getResponse(type) {
    const responses = this.active?.responses?.[type];
    if (!responses || !responses.length) return null;
    return responses[Math.floor(Math.random() * responses.length)];
  }

  getSystemPrompt() {
    if (!this.active) return '';
    const traits = this.active.traits || {};
    const promptTemplate = this.active.systemPromptTemplate || '你是{name}，性格特点：{traits}，当前心情：{mood}';
    const traitsStr = Object.entries(traits).map(([k, v]) => `${k}:${v}`).join(', ');
    return promptTemplate
      .replace('{name}', this.active.name || 'AI')
      .replace('{traits}', traitsStr)
      .replace('{mood}', this.getMood());
  }

  getCurrentPersonality() {
    return this.active;
  }

  applyPersonality(basePrompt) {
    const persona = this.active || {};
    const mood = this.getMood();
    const name = persona.name || 'AI';
    const traits = persona.traits || {};
    const prefix = `(${name}) 心情:${mood} | 特点:${Object.keys(traits).join(',')} | `;
    return `${prefix}${basePrompt}`;
  }

  saveActive() {
    if (!this.activeName) return;
    try {
      const dir = path.dirname(this.activeStorePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.activeStorePath, this.activeName, 'utf8');
    } catch (e) {
      // ignore persist errors
    }
  }

  _saveActiveName() {
    this.saveActive();
  }

  createPersonality(name, config) {
    if (!name || this.personalities[name]) {
      return false;
    }

    const SAFE_TRAIT_KEYS = ['emoji', 'style', 'rate', 'playfulness', 'formality'];
    const safeTraits = {};
    
    if (config.traits && typeof config.traits === 'object') {
      for (const key of SAFE_TRAIT_KEYS) {
        if (key in config.traits) {
          const val = config.traits[key];
          if (typeof val === 'boolean' && key === 'emoji') {
            safeTraits[key] = val;
          } else if (typeof val === 'string' && (key === 'style' || key === 'formality')) {
            safeTraits[key] = String(val).substring(0, 20);
          } else if (typeof val === 'number' && key === 'rate') {
            safeTraits[key] = Math.max(0.5, Math.min(2.0, val));
          } else if (typeof val === 'number' && key === 'playfulness') {
            safeTraits[key] = Math.max(0, Math.min(1, val));
          }
        }
      }
    }
    
    if (!('emoji' in safeTraits)) safeTraits.emoji = config.traits?.emoji !== false;
    if (!('style' in safeTraits)) safeTraits.style = config.style || 'emoji';

    this.personalities[name] = {
      name: String(config.name || name).substring(0, 50),
      description: String(config.description || '自定义人格').substring(0, 200),
      traits: safeTraits,
      mood: {
        default: 'neutral',
        moods: ['neutral', 'happy', 'curious'],
        drift: 0.2,
        intervals: 60000
      },
      tts: {
        enabled: true,
        lang: 'zh-CN',
        rateVariants: {
          excited: 1.2,
          happy: 1.1,
          calm: 0.9,
          shy: 0.8
        }
      },
      model: {
        name: 'llama3.2',
        temperature: 0.8
      },
      routing: {
        keywords: {
          media: ['播放', '音乐', '视频', '电影'],
          game: ['游戏', '我的世界', 'minecraft'],
          memory: ['记得', '记住', '忘记']
        }
      },
      createdAt: new Date().toISOString(),
      custom: true
    };

    this._persistPersonalities();
    return true;
  }

  deletePersonality(name) {
    if (!name || !this.personalities[name]) {
      return false;
    }

    if (this.activeName === name) {
      const others = Object.keys(this.personalities).filter(k => k !== name);
      if (others.length > 0) {
        this.setActive(others[0]);
      }
    }

    delete this.personalities[name];
    this._persistPersonalities();
    return true;
  }

  _persistPersonalities() {
    try {
      const data = JSON.parse(fs.readFileSync(this.dataPath, 'utf8'));
      data.personalities = this.personalities;
      fs.writeFileSync(this.dataPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[PersonalityManager] Persist failed:', e.message);
    }
  }
}

module.exports = { PersonalityManager };
