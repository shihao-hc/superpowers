/**
 * Persistence Module - v22.1
 * Handles saving and loading of lessons, memory, growth, etc.
 */

const fs = require('fs');
const path = require('path');

// Data directory
const DATA_DIR = path.join(__dirname, '../../data');

// Ensure data dir exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

class Persistence {
  static save(filename, data) {
    const filePath = path.join(DATA_DIR, `${filename}.json`);
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return { success: true, path: filePath };
    } catch (e) {
      console.error(`[Persistence] Error saving ${filename}:`, e.message);
      return { success: false, error: e.message };
    }
  }

  static load(filename, defaultValue = {}) {
    const filePath = path.join(DATA_DIR, `${filename}.json`);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
      }
    } catch (e) {
      console.error(`[Persistence] Error loading ${filename}:`, e.message);
    }
    return defaultValue;
  }

  static append(filename, newItem) {
    const data = this.load(filename, { items: [] });
    if (!data.items) {data.items = [];}
    data.items.push({ ...newItem, timestamp: Date.now() });
    data.total = (data.total || 0) + 1;
    return this.save(filename, data);
  }

  static loadAll() {
    return {
      lessons: this.load('lessons'),
      memory: this.load('memory'),
      growth: this.load('growth'),
      intents: this.load('intents')
    };
  }

  static persistAll(_instance) {
    // In a full implementation, this would extract data from the instance
    // For now, we save empty structures if needed or rely on append operations
    const current = this.loadAll();
    return { success: true, saved: Object.keys(current).length };
  }
}

module.exports = Persistence;
