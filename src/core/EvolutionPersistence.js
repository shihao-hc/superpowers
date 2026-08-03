/**
 * EvolutionPersistence - 持久化进化系统 (v11.0)
 * 让AI具备持续学习和记忆能力
 *
 * Extracted from BrainSystem.js (v22.1)
 */

const fs = require('fs');
const path = require('path');

const PERSISTENCE_DIR = path.join(process.cwd(), '.opencode', 'evolution');
const CURATED_DIR = path.join(process.cwd(), '.opencode');

const Persistence = {
  init() {
    if (!fs.existsSync(PERSISTENCE_DIR)) {
      fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
    }
  },

  save(filename, data) {
    this.init();
    const file = path.join(PERSISTENCE_DIR, `${filename}.json`);
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return { success: true, path: file };
  },

  load(filename, defaultValue = {}) {
    this.init();
    const file = path.join(PERSISTENCE_DIR, `${filename}.json`);
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch (e) {
        return defaultValue;
      }
    }
    return defaultValue;
  },

  saveLessons(lessons) {
    this.init();
    const file = path.join(PERSISTENCE_DIR, 'lessons.json');
    try {
      fs.writeFileSync(file, JSON.stringify(lessons, null, 2));
    } catch (e) {
      console.warn('[BrainSystem] SaveLessons failed:', e.message);
    }
  },

  loadLessons() {
    const curatedFile = path.join(CURATED_DIR, 'lessons.json');
    if (fs.existsSync(curatedFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(curatedFile, 'utf-8'));
        return data.lessons || data;
      } catch (e) {
        console.warn('[BrainSystem] Curated lessons file corrupted:', e.message);
      }
    }
    const file = path.join(PERSISTENCE_DIR, 'lessons.json');
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch (e) {
        return [];
      }
    }
    return [];
  },

  saveUserProfile(profile) {
    this.init();
    const file = path.join(PERSISTENCE_DIR, 'user_profile.json');
    fs.writeFileSync(file, JSON.stringify(profile, null, 2));
  },

  loadUserProfile() {
    const file = path.join(PERSISTENCE_DIR, 'user_profile.json');
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch (e) {
        console.warn('[BrainSystem] LoadUserProfile failed:', e.message);
        return {};
      }
    }
    return {};
  },

  saveGrowth(growth) {
    this.init();
    const file = path.join(PERSISTENCE_DIR, 'growth.json');
    fs.writeFileSync(file, JSON.stringify(growth, null, 2));
  },

  loadGrowth() {
    const file = path.join(PERSISTENCE_DIR, 'growth.json');
    if (fs.existsSync(file)) {
      try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
      } catch (e) {
        return { totalInteractions: 0, lessonsLearned: 0, improvements: [] };
      }
    }
    return { totalInteractions: 0, lessonsLearned: 0, improvements: [] };
  },

  persistAll(brainInstance) {
    this.init();

    if (brainInstance.lessonLibrary) {
      const lessons = brainInstance.lessonLibrary.getStats();
      this.saveLessons(lessons);
    }

    if (brainInstance.memory) {
      const profile = brainInstance.memory.getUserProfile?.() || {};
      this.saveUserProfile(profile);
    }

    const growth = this.loadGrowth();
    growth.totalInteractions = (growth.totalInteractions || 0) + 1;
    growth.lastUpdated = Date.now();
    this.saveGrowth(growth);

    return { saved: true, timestamp: Date.now() };
  },

  incrementalUpdate(key, value) {
    this.init();
    const validKeys = ['lessons', 'userProfile', 'growth'];
    if (!validKeys.includes(key)) {
      throw new Error(`Invalid key: ${key}`);
    }

    const loaders = {
      lessons: 'loadLessons',
      userProfile: 'loadUserProfile',
      growth: 'loadGrowth'
    };

    const savers = {
      lessons: 'saveLessons',
      userProfile: 'saveUserProfile',
      growth: 'saveGrowth'
    };

    const current = this[loaders[key]]();
    const merged = this._deepMerge(current, value);
    this[savers[key]](merged);

    return { key, updated: true, timestamp: Date.now() };
  },

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  },

  getStats() {
    return {
      lessons: this.loadLessons(),
      userProfile: this.loadUserProfile(),
      growth: this.loadGrowth(),
      storageDir: PERSISTENCE_DIR
    };
  },

  loadAll() {
    return {
      lessons: this.loadLessons(),
      userProfile: this.loadUserProfile(),
      growth: this.loadGrowth()
    };
  },

  append(filename, item) {
    this.init();
    const file = path.join(PERSISTENCE_DIR, `${filename}.json`);
    let data = { items: [], total: 0 };
    if (fs.existsSync(file)) {
      try {
        data = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (!data.items) {data.items = [];}
      } catch (e) {
        console.warn('[BrainSystem] Log data corrupted:', e.message);
      }
    }
    data.items.push({ ...item, timestamp: Date.now() });
    data.total = (data.total || 0) + 1;

    if (data.items.length > 100) {
      data.items = data.items.slice(-100);
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    return { appended: true, total: data.total };
  }
};

module.exports = Persistence;