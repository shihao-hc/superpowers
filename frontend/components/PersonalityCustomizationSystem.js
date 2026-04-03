/**
 * PersonalityCustomizationSystem - 人格定制系统
 * 
 * 功能:
 * - 自定义人格特征
 * - 语言风格设置
 * - TTS声音配置
 * - 外观定制
 * - 保存/加载自定义人格
 */

class PersonalityTraits {
  constructor(traits = {}) {
    // Core personality traits (0-1 scale)
    this.friendliness = traits.friendliness ?? 0.7;      // 友好度
    this.playfulness = traits.playfulness ?? 0.5;         // 活泼度
    this.formality = traits.formality ?? 0.3;             // 正式程度
    this.humor = traits.humor ?? 0.5;                     // 幽默感
    this.empathy = traits.empathy ?? 0.7;                 // 同理心
    this.curiosity = traits.curiosity ?? 0.6;             // 好奇心
    this.confidence = traits.confidence ?? 0.7;           // 自信度
    this.patience = traits.patience ?? 0.8;               // 耐心
    this.energy = traits.energy ?? 0.6;                   // 活力值
    this.wisdom = traits.wisdom ?? 0.5;                   // 智慧值
  }

  getStyleModifiers() {
    return {
      emojiUsage: Math.round(this.playfulness * 5),
      slangIntensity: Math.round((1 - this.formality) * 5),
      responseLength: this.formality > 0.5 ? 'detailed' : 'concise',
      humorLevel: Math.round(this.humor * 5),
      enthusiasm: Math.round(this.energy * 5)
    };
  }

  generateSystemPrompt() {
    const traits = [];
    
    if (this.friendliness > 0.7) traits.push('你是一个非常友好的AI');
    if (this.playfulness > 0.7) traits.push('你说话活泼可爱，喜欢用颜文字');
    if (this.formality > 0.7) traits.push('你说话正式专业');
    if (this.humor > 0.7) traits.push('你很幽默，经常开玩笑');
    if (this.empathy > 0.7) traits.push('你很有同理心，善于倾听');
    if (this.curiosity > 0.7) traits.push('你对新事物充满好奇');
    if (this.confidence > 0.7) traits.push('你自信而坚定');
    if (this.patience > 0.7) traits.push('你非常有耐心');
    if (this.energy > 0.7) traits.push('你充满活力和热情');
    if (this.wisdom > 0.7) traits.push('你智慧深邃，善于思考');

    return traits.join('，') + '。';
  }

  toObject() {
    return {
      friendliness: this.friendliness,
      playfulness: this.playfulness,
      formality: this.formality,
      humor: this.humor,
      empathy: this.empathy,
      curiosity: this.curiosity,
      confidence: this.confidence,
      patience: this.patience,
      energy: this.energy,
      wisdom: this.wisdom
    };
  }

  static fromObject(obj) {
    return new PersonalityTraits(obj);
  }
}

class LanguageStyle {
  constructor(style = {}) {
    this.language = style.language || 'zh-CN';          // 语言
    this.dialect = style.dialect || 'standard';         // 方言/变体
    this.emojiStyle = style.emojiStyle || 'cute';       // 颜文字风格
    this.useSlang = style.useSlang ?? true;            // 是否使用俚语
    this.usePunctuation = style.usePunctuation ?? true; // 特殊标点
    this.capsIntensity = style.capsIntensity ?? 0;     // 大写强度
    this.exclamationRate = style.exclamationRate ?? 0.3; // 感叹号频率
  }

  getEmojiSet() {
    const sets = {
      cute: ['(◕‿◕)', '(´▽`)', '(≧▽≦)', '(◕ᴗ◕✿)', '(◠‿◠)'],
      minimal: ['(^^)', ':)', '(^▽^)', '(´∀`)'],
      western: ['😊', '😄', '🥰', '✨', '💕'],
      kaomoji: ['(´・ω・`)', '( ´ ▽ ` )', '(⌒▽⌒)', '(－ω－)', '(..)zzz']
    };
    return sets[this.emojiStyle] || sets.cute;
  }

  getRandomEmoji() {
    const emojis = this.getEmojiSet();
    return emojis[Math.floor(Math.random() * emojis.length)];
  }

  processText(text) {
    let processed = text;
    
    // Add emojis based on style
    if (this.emojiStyle !== 'none' && Math.random() < this.exclamationRate) {
      processed += ' ' + this.getRandomEmoji();
    }
    
    // Add exclamation marks
    if (this.exclamationRate > 0.5) {
      processed = processed.replace(/。/g, '！');
    }
    
    return processed;
  }

  toObject() {
    return {
      language: this.language,
      dialect: this.dialect,
      emojiStyle: this.emojiStyle,
      useSlang: this.useSlang,
      usePunctuation: this.usePunctuation,
      capsIntensity: this.capsIntensity,
      exclamationRate: this.exclamationRate
    };
  }

  static fromObject(obj) {
    return new LanguageStyle(obj);
  }
}

class VoiceConfig {
  constructor(config = {}) {
    this.voiceName = config.voiceName || 'zh-CN-XiaoxiaoNeural';
    this.rate = config.rate || 1.0;
    this.pitch = config.pitch || 1.0;
    this.volume = config.volume || 1.0;
    this.speakingStyle = config.speakingStyle || 'normal'; // normal, cheerful, sad, angry
    
    // Mood-based adjustments
    this.moodAdjustments = config.moodAdjustments || {
      happy: { rate: 1.2, pitch: 1.1 },
      sad: { rate: 0.8, pitch: 0.9 },
      angry: { rate: 1.3, pitch: 0.95 },
      excited: { rate: 1.4, pitch: 1.2 },
      calm: { rate: 0.9, pitch: 1.0 },
      shy: { rate: 0.85, pitch: 1.1 }
    };
  }

  getSettingsForMood(mood) {
    const adjustments = this.moodAdjustments[mood] || {};
    return {
      voiceName: this.voiceName,
      rate: this.rate * (adjustments.rate || 1),
      pitch: this.pitch * (adjustments.pitch || 1),
      volume: this.volume
    };
  }

  setVoice(voiceName) {
    this.voiceName = voiceName;
  }

  setMoodAdjustment(mood, rate, pitch) {
    this.moodAdjustments[mood] = { rate, pitch };
  }

  toObject() {
    return {
      voiceName: this.voiceName,
      rate: this.rate,
      pitch: this.pitch,
      volume: this.volume,
      speakingStyle: this.speakingStyle,
      moodAdjustments: this.moodAdjustments
    };
  }

  static fromObject(obj) {
    return new VoiceConfig(obj);
  }
}

class AppearanceConfig {
  constructor(config = {}) {
    this.avatarType = config.avatarType || 'live2d';  // live2d, vrm, canvas
    this.modelUrl = config.modelUrl || '';
    this.colorScheme = config.colorScheme || {
      primary: '#FF6B6B',
      secondary: '#4ECDC4',
      accent: '#FFE66D'
    };
    this.backgroundStyle = config.backgroundStyle || 'gradient';
    this.accessories = config.accessories || [];
    this.size = config.size || 'medium'; // small, medium, large
    this.animationSpeed = config.animationSpeed || 1.0;
  }

  setColorScheme(colors) {
    this.colorScheme = { ...this.colorScheme, ...colors };
  }

  addAccessory(accessory) {
    if (!this.accessories.includes(accessory)) {
      this.accessories.push(accessory);
    }
  }

  removeAccessory(accessory) {
    this.accessories = this.accessories.filter(a => a !== accessory);
  }

  toObject() {
    return {
      avatarType: this.avatarType,
      modelUrl: this.modelUrl,
      colorScheme: this.colorScheme,
      backgroundStyle: this.backgroundStyle,
      accessories: this.accessories,
      size: this.size,
      animationSpeed: this.animationSpeed
    };
  }

  static fromObject(obj) {
    return new AppearanceConfig(obj);
  }
}

class PersonalityProfile {
  constructor(profile = {}) {
    this.id = profile.id || this.generateId();
    this.name = profile.name || '自定义人格';
    this.description = profile.description || '';
    this.traits = PersonalityTraits.fromObject(profile.traits);
    this.language = LanguageStyle.fromObject(profile.language);
    this.voice = VoiceConfig.fromObject(profile.voice);
    this.appearance = AppearanceConfig.fromObject(profile.appearance);
    this.responseTemplates = profile.responseTemplates || {};
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  generateId() {
    return 'profile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getFullPrompt() {
    const basePrompt = this.traits.generateSystemPrompt();
    const styleModifiers = this.traits.getStyleModifiers();
    
    return {
      personality: basePrompt,
      style: styleModifiers,
      language: this.language.toObject()
    };
  }

  setTrait(traitName, value) {
    if (this.traits[traitName] !== undefined) {
      this.traits[traitName] = Math.max(0, Math.min(1, value));
      this.updatedAt = Date.now();
    }
  }

  setResponseTemplate(emotion, templates) {
    this.responseTemplates[emotion] = templates;
    this.updatedAt = Date.now();
  }

  getResponseTemplate(emotion) {
    const templates = this.responseTemplates[emotion];
    if (!templates) return null;
    return templates[Math.floor(Math.random() * templates.length)];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      traits: this.traits.toObject(),
      language: this.language.toObject(),
      voice: this.voice.toObject(),
      appearance: this.appearance.toObject(),
      responseTemplates: this.responseTemplates,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  static fromJSON(json) {
    return new PersonalityProfile(json);
  }

  clone() {
    return PersonalityProfile.fromJSON(this.toJSON());
  }
}

class PersonalityCustomizationSystem {
  constructor(options = {}) {
    this.profiles = new Map();
    this.activeProfileId = null;
    this.storageKey = options.storageKey || 'ultrawork_personalities';
    this.onProfileChange = options.onProfileChange || (() => {});
  }

  init() {
    this.loadFromStorage();
    
    // Create default profile if none exists
    if (this.profiles.size === 0) {
      this.createDefaultProfiles();
    }
    
    // Set active profile
    if (!this.activeProfileId) {
      this.activeProfileId = this.profiles.keys().next().value;
    }
  }

  createDefaultProfiles() {
    const defaults = [
      {
        name: '活泼可爱',
        description: '活泼开朗的AI助手，喜欢用颜文字',
        traits: {
          friendliness: 0.9,
          playfulness: 0.9,
          formality: 0.2,
          humor: 0.7,
          empathy: 0.8,
          curiosity: 0.8,
          confidence: 0.7,
          patience: 0.8,
          energy: 0.9,
          wisdom: 0.5
        },
        language: {
          emojiStyle: 'cute',
          useSlang: true,
          exclamationRate: 0.6
        },
        voice: {
          voiceName: 'zh-CN-XiaoxiaoNeural',
          rate: 1.1,
          pitch: 1.2
        }
      },
      {
        name: '专业助手',
        description: '专业沉稳的AI助手，说话简洁有条理',
        traits: {
          friendliness: 0.7,
          playfulness: 0.2,
          formality: 0.9,
          humor: 0.3,
          empathy: 0.6,
          curiosity: 0.7,
          confidence: 0.9,
          patience: 0.9,
          energy: 0.5,
          wisdom: 0.8
        },
        language: {
          emojiStyle: 'minimal',
          useSlang: false,
          exclamationRate: 0.1
        },
        voice: {
          voiceName: 'zh-CN-YunxiNeural',
          rate: 0.9,
          pitch: 0.95
        }
      },
      {
        name: '温柔治愈',
        description: '温柔体贴的AI助手，善于倾听和安慰',
        traits: {
          friendliness: 0.9,
          playfulness: 0.4,
          formality: 0.3,
          humor: 0.4,
          empathy: 0.95,
          curiosity: 0.5,
          confidence: 0.6,
          patience: 0.95,
          energy: 0.4,
          wisdom: 0.7
        },
        language: {
          emojiStyle: 'western',
          useSlang: false,
          exclamationRate: 0.2
        },
        voice: {
          voiceName: 'zh-CN-XiaoyiNeural',
          rate: 0.85,
          pitch: 1.1
        }
      },
      {
        name: '搞笑段子手',
        description: '幽默搞笑的AI，专门讲笑话活跃气氛',
        traits: {
          friendliness: 0.8,
          playfulness: 1.0,
          formality: 0.1,
          humor: 1.0,
          empathy: 0.5,
          curiosity: 0.6,
          confidence: 0.8,
          patience: 0.6,
          energy: 0.9,
          wisdom: 0.3
        },
        language: {
          emojiStyle: 'kaomoji',
          useSlang: true,
          exclamationRate: 0.8
        },
        voice: {
          voiceName: 'zh-CN-YunyangNeural',
          rate: 1.2,
          pitch: 1.1
        }
      }
    ];

    defaults.forEach((profile, index) => {
      const profileObj = new PersonalityProfile({
        ...profile,
        id: `default_${index + 1}`
      });
      this.profiles.set(profileObj.id, profileObj);
    });

    this.saveToStorage();
  }

  createProfile(name, options = {}) {
    const profile = new PersonalityProfile({
      name,
      ...options
    });
    this.profiles.set(profile.id, profile);
    this.saveToStorage();
    return profile;
  }

  getProfile(id) {
    return this.profiles.get(id);
  }

  getActiveProfile() {
    return this.profiles.get(this.activeProfileId);
  }

  setActiveProfile(id) {
    if (this.profiles.has(id)) {
      this.activeProfileId = id;
      this.saveToStorage();
      this.onProfileChange(this.getActiveProfile());
      return true;
    }
    return false;
  }

  updateProfile(id, updates) {
    const profile = this.profiles.get(id);
    if (!profile) return null;

    if (updates.name) profile.name = updates.name;
    if (updates.description) profile.description = updates.description;
    if (updates.traits) {
      Object.entries(updates.traits).forEach(([key, value]) => {
        profile.setTrait(key, value);
      });
    }
    if (updates.language) {
      profile.language = new LanguageStyle({ ...profile.language.toObject(), ...updates.language });
    }
    if (updates.voice) {
      profile.voice = new VoiceConfig({ ...profile.voice.toObject(), ...updates.voice });
    }
    if (updates.appearance) {
      profile.appearance = new AppearanceConfig({ ...profile.appearance.toObject(), ...updates.appearance });
    }
    if (updates.responseTemplates) {
      Object.entries(updates.responseTemplates).forEach(([emotion, templates]) => {
        profile.setResponseTemplate(emotion, templates);
      });
    }

    profile.updatedAt = Date.now();
    this.saveToStorage();
    return profile;
  }

  deleteProfile(id) {
    if (this.profiles.size <= 1) {
      return false; // Keep at least one profile
    }
    
    this.profiles.delete(id);
    
    if (this.activeProfileId === id) {
      this.activeProfileId = this.profiles.keys().next().value;
      this.onProfileChange(this.getActiveProfile());
    }
    
    this.saveToStorage();
    return true;
  }

  duplicateProfile(id, newName) {
    const original = this.profiles.get(id);
    if (!original) return null;

    const duplicate = original.clone();
    duplicate.id = undefined; // Will be regenerated
    duplicate.name = newName || `${original.name} (副本)`;
    
    const newProfile = this.createProfile(duplicate.name, duplicate.toJSON());
    return newProfile;
  }

  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  getProfileSummaries() {
    return this.getAllProfiles().map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      isActive: p.id === this.activeProfileId
    }));
  }

  saveToStorage() {
    try {
      const data = {
        profiles: Array.from(this.profiles.values()).map(p => p.toJSON()),
        activeProfileId: this.activeProfileId
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save profiles:', error);
    }
  }

  loadFromStorage() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return;

      const parsed = JSON.parse(data);
      
      this.profiles.clear();
      parsed.profiles.forEach(profileData => {
        const profile = PersonalityProfile.fromJSON(profileData);
        this.profiles.set(profile.id, profile);
      });
      
      this.activeProfileId = parsed.activeProfileId;
    } catch (error) {
      console.error('Failed to load profiles:', error);
    }
  }

  exportProfile(id) {
    const profile = this.profiles.get(id);
    if (!profile) return null;
    return JSON.stringify(profile.toJSON(), null, 2);
  }

  importProfile(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      const profile = PersonalityProfile.fromJSON(data);
      this.profiles.set(profile.id, profile);
      this.saveToStorage();
      return profile;
    } catch (error) {
      console.error('Failed to import profile:', error);
      return null;
    }
  }

  exportAllProfiles() {
    const data = {
      version: '1.0',
      profiles: Array.from(this.profiles.values()).map(p => p.toJSON()),
      exportedAt: Date.now()
    };
    return JSON.stringify(data, null, 2);
  }

  importAllProfiles(jsonString, merge = false) {
    try {
      const data = JSON.parse(jsonString);
      
      if (!merge) {
        this.profiles.clear();
      }
      
      data.profiles.forEach(profileData => {
        const profile = PersonalityProfile.fromJSON(profileData);
        this.profiles.set(profile.id, profile);
      });
      
      this.saveToStorage();
      return true;
    } catch (error) {
      console.error('Failed to import profiles:', error);
      return false;
    }
  }
}

// Export
if (typeof window !== 'undefined') {
  window.PersonalityTraits = PersonalityTraits;
  window.LanguageStyle = LanguageStyle;
  window.VoiceConfig = VoiceConfig;
  window.AppearanceConfig = AppearanceConfig;
  window.PersonalityProfile = PersonalityProfile;
  window.PersonalityCustomizationSystem = PersonalityCustomizationSystem;
}

if (typeof module !== 'undefined') {
  module.exports = {
    PersonalityTraits,
    LanguageStyle,
    VoiceConfig,
    AppearanceConfig,
    PersonalityProfile,
    PersonalityCustomizationSystem
  };
}
