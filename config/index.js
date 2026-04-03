const fs = require('fs');
const path = require('path');

class Config {
  constructor() {
    this.config = {};
    this.env = process.env.NODE_ENV || 'development';
  }

  load() {
    const configDir = path.resolve(process.cwd(), 'config');
    const defaultPath = path.join(configDir, 'default.json');
    const envPath = path.join(configDir, `${this.env}.json`);
    const localPath = path.join(configDir, 'local.json');
    
    this.config = this.loadFile(defaultPath);
    
    if (fs.existsSync(envPath)) {
      this.config = this.merge(this.config, this.loadFile(envPath));
    }
    
    if (fs.existsSync(localPath) && this.env === 'development') {
      this.config = this.merge(this.config, this.loadFile(localPath));
    }
    
    this.applyEnvOverrides();
    
    return this.config;
  }

  loadFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch (e) {
      console.warn(`[Config] Failed to load ${filePath}:`, e.message);
    }
    return {};
  }

  merge(base, override) {
    const PROTECTED_KEYS = ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__'];
    const result = Object.create(null);
    for (const key in base) {
      if (PROTECTED_KEYS.includes(key)) continue;
      result[key] = base[key];
    }
    for (const key in override) {
      if (PROTECTED_KEYS.includes(key)) continue;
      if (override[key] === null) {
        delete result[key];
        continue;
      }
      if (typeof override[key] === 'object' && !Array.isArray(override[key]) && override[key] !== null) {
        result[key] = this.merge(result[key] || Object.create(null), override[key]);
      } else {
        result[key] = override[key];
      }
    }
    return result;
  }

  applyEnvOverrides() {
    if (process.env.PORT) this.config.server.port = parseInt(process.env.PORT);
    if (process.env.OLLAMA_HOST) this.config.inference.ollama.host = process.env.OLLAMA_HOST;
    if (process.env.OLLAMA_PORT) this.config.inference.ollama.port = parseInt(process.env.OLLAMA_PORT);
    if (process.env.OLLAMA_MODEL) this.config.inference.ollama.defaultModel = process.env.OLLAMA_MODEL;
    if (process.env.MAX_TOKENS) this.config.inference.ollama.maxTokens = parseInt(process.env.MAX_TOKENS);
    if (process.env.ENABLE_GAME) this.config.game.enabled = process.env.ENABLE_GAME === 'true';
    if (process.env.INFERENCE_ENGINE) this.config.inference.engine = process.env.INFERENCE_ENGINE;
    if (process.env.MINECRAFT_HOST) this.config.game.minecraft.host = process.env.MINECRAFT_HOST;
    if (process.env.MINECRAFT_PORT) this.config.game.minecraft.port = parseInt(process.env.MINECRAFT_PORT);
    if (process.env.LOG_LEVEL) this.config.logging.level = process.env.LOG_LEVEL;
  }

  get(key, defaultValue = undefined) {
    const keys = key.split('.');
    let value = this.config;
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!(keys[i] in obj)) obj[keys[i]] = {};
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
  }

  getAll() {
    return this.config;
  }
}

const config = new Config();
config.load();

module.exports = config;
