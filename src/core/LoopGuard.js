const fs = require('fs');
const path = require('path');

class LoopGuard {
  constructor(options = {}) {
    this.maxHistory = options.maxHistory || 50;
    this.maxPerMinute = options.maxPerMinute || 3;
    this._history = [];
    this._tripped = false;
    this._trippedPattern = null;
    this._persistPath = path.join(process.cwd(), '.opencode', 'evolution', 'loop-guard.json');
    this._load();
  }

  get isTripped() { return this._tripped; }

  check(module, action) {
    const now = Date.now();
    const key = `${module}:${action}`;

    this._history = this._history.filter((e) => now - e.time < 60000);
    const recent = this._history.filter((e) => e.key === key);

    this._history.push({ key, time: now });
    if (this._history.length > this.maxHistory) {
      this._history = this._history.slice(-this.maxHistory);
    }

    if (recent.length >= this.maxPerMinute) {
      this._tripped = true;
      this._trippedPattern = key;
      this._save();
      return { tripped: true, pattern: key };
    }

    if (this._tripped && this._history.filter((e) => e.key === this._trippedPattern).length === 0) {
      this._tripped = false;
      this._trippedPattern = null;
    }

    return { tripped: false };
  }

  _load() {
    try {
      if (fs.existsSync(this._persistPath)) {
        const data = JSON.parse(fs.readFileSync(this._persistPath, 'utf8'));
        this._history = data.history || [];
        this._tripped = data.tripped || false;
        this._trippedPattern = data.trippedPattern || null;
      }
    } catch (e) {
      // ignore
    }
  }

  _save() {
    try {
      const dir = path.dirname(this._persistPath);
      if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
      fs.writeFileSync(this._persistPath, JSON.stringify({
        history: this._history.slice(-this.maxHistory),
        tripped: this._tripped,
        trippedPattern: this._trippedPattern,
        updatedAt: new Date().toISOString()
      }));
    } catch (e) {
      // ignore
    }
  }
}

module.exports = LoopGuard;
