/**
 * SelfEvolutionRecorder - 自我进化改进记录器
 * 自动记录每次改进和成长
 *
 * Extracted from BrainSystem.js (v22.1)
 */

const fs = require('fs');
const path = require('path');

const PERSISTENCE_DIR = path.join(process.cwd(), '.opencode', 'evolution');

const SelfEvolutionRecorder = {
  _improvements: [],
  _version: '15.0',

  record(type, description, details = {}) {
    const improvement = {
      id: Date.now(),
      type,
      description,
      details,
      timestamp: new Date().toISOString(),
      version: this._version
    };

    this._improvements.push(improvement);
    this._persistImprovement(improvement);

    return improvement;
  },

  recordCompletion(feature, status = 'completed') {
    return this.record('feature', feature, { status });
  },

  recordFix(issue, fix) {
    return this.record('fix', issue, { fix });
  },

  recordLearning(lesson) {
    return this.record('learning', lesson);
  },

  _persistImprovement(improvement) {
    try {
      if (!fs.existsSync(PERSISTENCE_DIR)) {
        fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
      }

      const file = path.join(PERSISTENCE_DIR, 'improvements.json');
      let existing = [];

      if (fs.existsSync(file)) {
        try {
          existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
        } catch (e) {
          existing = [];
        }
      }

      existing.push(improvement);
      fs.writeFileSync(file, JSON.stringify(existing, null, 2));
    } catch (e) {
      console.log('[SelfEvolution] 记录失败:', e.message);
    }
  },

  getHistory(limit = 10) {
    return this._improvements.slice(-limit).reverse();
  },

  getStats() {
    return {
      total: this._improvements.length,
      byType: this._groupByType(),
      version: this._version
    };
  },

  _groupByType() {
    const groups = {};
    for (const imp of this._improvements) {
      groups[imp.type] = (groups[imp.type] || 0) + 1;
    }
    return groups;
  }
};

module.exports = SelfEvolutionRecorder;
