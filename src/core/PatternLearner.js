/**
 * PatternLearner - 模式学习器
 * 从用户输入中学习模式和意图
 * Extracted from BrainSystem.js v14.0
 */

const Persistence = require('./Persistence');

class PatternLearner {
  constructor(persistenceKey) {
    this._key = persistenceKey || 'patternLearner';
    this._intentHistory = {};
    this._intentCount = 0;
    this._avgInputLength = 0;
    this._totalLength = 0;
    this._samples = 0;
    this._load();
  }

  _load() {
    try {
      const saved = Persistence.load(this._key, {});
      if (saved.intentHistory) {this._intentHistory = saved.intentHistory;}
      if (saved.intentCount) {this._intentCount = saved.intentCount;}
      if (saved.totalLength) {this._totalLength = saved.totalLength;}
      if (saved.samples) {this._samples = saved.samples;}
      if (this._samples > 0) {this._avgInputLength = this._totalLength / this._samples;}
    } catch (e) {
      // 加载失败，使用默认值
    }
  }

  _save() {
    try {
      Persistence.save(this._key, {
        intentHistory: this._intentHistory,
        intentCount: this._intentCount,
        totalLength: this._totalLength,
        samples: this._samples
      });
    } catch (e) {
      // 持久化失败不影响运行
    }
  }

  learn(input, _context) {
    if (!input) {return;}

    this._totalLength += input.length;
    this._samples++;
    this._avgInputLength = this._totalLength / this._samples;

    const intent = this._detectIntent(input);
    if (intent) {
      this._intentHistory[intent] = (this._intentHistory[intent] || 0) + 1;
      this._intentCount = Object.keys(this._intentHistory).length;
    }
    this._save();
  }

  _detectIntent(input) {
    const text = input.toLowerCase();
    if (text.includes('代码') || text.includes('写') || text.includes('函数') || text.includes('类')) {return '代码';}
    if (text.includes('学习') || text.includes('研究') || text.includes('分析')) {return '学习';}
    if (text.includes('安全') || text.includes('审计')) {return '安全';}
    if (text.includes('优化') || text.includes('性能')) {return '优化';}
    if (text.includes('调试') || text.includes('debug') || text.includes('bug')) {return '调试';}
    if (text.includes('测试') || text.includes('test')) {return '测试';}
    return null;
  }

  getTopIntent() {
    const entries = Object.entries(this._intentHistory);
    if (entries.length === 0) {return null;}
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][0];
  }

  predict() {
    const topIntent = this.getTopIntent();
    const nextPossible = [];
    if (topIntent && this._intentHistory[topIntent] > 2) {
      nextPossible.push({
        intent: topIntent,
        confidence: Math.min(0.9, this._intentHistory[topIntent] * 0.2)
      });
    }
    return { topIntent, nextPossible, avgInputLength: Math.round(this._avgInputLength) };
  }
}

module.exports = PatternLearner;
