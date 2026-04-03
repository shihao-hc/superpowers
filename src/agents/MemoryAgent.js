const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROTECTED_KEYS = ['__proto__', 'constructor', 'prototype', '__defineGetter__', '__defineSetter__'];
const MAX_KEY_LENGTH = 200;
const MAX_VALUE_SIZE = 50000;
const MAX_MEMORY_ENTRIES = 10000;

const ENCRYPTION_KEY = process.env.MEMORY_ENCRYPTION_KEY || null;
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';

function getEncryptionKey() {
  if (!ENCRYPTION_KEY) return null;
  return crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
}

function encrypt(data) {
  const key = getEncryptionKey();
  if (!key) return JSON.stringify(data);
  
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
    const json = JSON.stringify(data);
    const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString('base64'),
      data: encrypted.toString('base64'),
      tag: authTag.toString('base64')
    });
  } catch (e) {
    console.warn('[MemoryAgent] Encryption failed, storing unencrypted:', e.message);
    return JSON.stringify(data);
  }
}

function decrypt(encryptedData) {
  const key = getEncryptionKey();
  if (!key) {
    try {
      return JSON.parse(encryptedData);
    } catch {
      return {};
    }
  }
  
  try {
    const payload = JSON.parse(encryptedData);
    const iv = Buffer.from(payload.iv, 'base64');
    const encrypted = Buffer.from(payload.data, 'base64');
    const authTag = Buffer.from(payload.tag, 'base64');
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch (e) {
    console.warn('[MemoryAgent] Decryption failed:', e.message);
    try {
      return JSON.parse(encryptedData);
    } catch {
      return {};
    }
  }
}

function sanitizeKey(key) {
  if (typeof key !== 'string') return false;
  if (PROTECTED_KEYS.includes(key)) return false;
  if (key.length > MAX_KEY_LENGTH) return false;
  if (!/^[a-zA-Z0-9_\-:.]+$/.test(key)) return false;
  return true;
}

function sanitizeValue(value) {
  if (value === null || value === undefined) return true;
  const str = JSON.stringify(value);
  return str.length <= MAX_VALUE_SIZE;
}

function deepSanitize(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => deepSanitize(item));
  }
  const sanitized = {};
  for (const key of Object.keys(obj)) {
    if (!PROTECTED_KEYS.includes(key)) {
      sanitized[key] = deepSanitize(obj[key]);
    }
  }
  return sanitized;
}

class MemoryAgent {
  constructor(options = {}) {
    this.pageSize = options.pageSize || 50;
    this.memory = {};
    this.memoryPath = options.memoryPath || path.resolve(process.cwd(), '.opencode', 'memory.json');
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.memoryPath)) {
        const raw = fs.readFileSync(this.memoryPath, 'utf8');
        const parsed = decrypt(raw);
        for (const key of PROTECTED_KEYS) {
          delete parsed[key];
        }
        this.memory = deepSanitize(parsed);
      }
    } catch (e) {
      console.warn('[MemoryAgent] Load error, starting fresh:', e.message);
      this.memory = {};
    }
  }

  remember(key, value) {
    if (!sanitizeKey(key)) {
      console.warn('[MemoryAgent] Invalid key rejected:', key);
      return false;
    }
    if (!sanitizeValue(value)) {
      console.warn('[MemoryAgent] Value too large rejected');
      return false;
    }
    if (Object.keys(this.memory).length >= MAX_MEMORY_ENTRIES) {
      console.warn('[MemoryAgent] Memory limit reached');
      return false;
    }
    this.memory[key] = deepSanitize(value);
    this.persist();
    return true;
  }

  persist() {
    try {
      const dir = path.dirname(this.memoryPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const encrypted = encrypt(this.memory);
      fs.writeFileSync(this.memoryPath, encrypted, 'utf8');
    } catch (e) {
      console.error('[MemoryAgent] Persist failed:', e.message);
    }
  }

  retrieve(key) {
    return this.memory[key];
  }

  remove(key) {
    delete this.memory[key];
    this.persist();
  }

  clear() {
    this.memory = {};
    this.persist();
  }

  dump() {
    return this.memory;
  }

  list(options = {}) {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.min(100, options.pageSize || this.pageSize);
    const query = String(options.query || '').substring(0, 100).toLowerCase();

    const entries = Object.entries(this.memory);
    let filtered = entries;

    if (query) {
      filtered = entries.filter(([key, value]) => 
        key.toLowerCase().includes(query) ||
        JSON.stringify(value).toLowerCase().includes(query)
      );
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize).map(([key, value]) => ({
      key,
      value,
      timestamp: typeof value === 'object' && value?.at ? value.at : null
    }));

    return {
      items,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    };
  }

  export(format = 'json') {
    const entries = Object.entries(this.memory);
    
    if (format === 'csv') {
      const header = 'key,value,timestamp\n';
      const rows = entries.map(([key, value]) => {
        const timestamp = typeof value === 'object' && value?.at ? value.at : '';
        const escapedKey = `"${String(key).replace(/"/g, '""')}"`;
        const escapedValue = `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        return `${escapedKey},${escapedValue},${timestamp}`;
      }).join('\n');
      return header + rows;
    }
    
    return JSON.stringify(this.memory, null, 2);
  }

  *streamExport(format = 'json') {
    if (format === 'csv') {
      yield 'key,value,timestamp\n';
      for (const [key, value] of Object.entries(this.memory)) {
        const timestamp = typeof value === 'object' && value?.at ? value.at : '';
        const escapedKey = `"${String(key).replace(/"/g, '""')}"`;
        const escapedValue = `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        yield `${escapedKey},${escapedValue},${timestamp}\n`;
      }
    } else {
      yield '{"data":\n';
      const entries = Object.entries(this.memory);
      for (let i = 0; i < entries.length; i++) {
        const [key, value] = entries[i];
        const comma = i < entries.length - 1 ? ',' : '';
        yield JSON.stringify({ key, value }) + comma + '\n';
      }
      yield '}';
    }
  }

  getStats() {
    return {
      total: Object.keys(this.memory).length,
      keys: Object.keys(this.memory)
    };
  }
}

module.exports = MemoryAgent;
