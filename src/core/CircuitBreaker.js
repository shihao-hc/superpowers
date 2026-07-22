const fs = require('fs');
const path = require('path');

class CircuitBreaker {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.resetAfterMs = options.resetAfterMs || 60000;
    this.persist = options.persist === true; // 默认不持久化
    this._state = 'OPEN';
    this._failureCount = 0;
    this._lastFailureTime = 0;
    this._stateFile = path.join(process.cwd(), '.opencode', 'evolution', 'circuit-breaker.json');
    if (this.persist) {this._load();}
  }

  get state() { return this._state; }
  get failureCount() { return this._failureCount; }

  isAllowed() {
    if (this._state === 'CLOSED') {
      if (Date.now() - this._lastFailureTime >= this.resetAfterMs) {
        this._state = 'HALF_OPEN';
        this._save();
        return true;
      }
      return false;
    }
    if (this._state === 'HALF_OPEN') {
      if (Date.now() - this._lastFailureTime >= this.resetAfterMs) {
        this._state = 'OPEN';
        this._failureCount = 0;
        this._save();
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this._failureCount = 0;
    this._state = 'OPEN';
    this._save();
  }

  recordFailure() {
    this._failureCount++;
    this._lastFailureTime = Date.now();
    if (this._failureCount >= this.maxRetries) {
      this._state = 'CLOSED';
    }
    this._save();
  }

  reset() {
    this._state = 'OPEN';
    this._failureCount = 0;
    this._lastFailureTime = 0;
    this._save();
  }

  _load() {
    try {
      if (fs.existsSync(this._stateFile)) {
        const data = JSON.parse(fs.readFileSync(this._stateFile, 'utf8'));
        this._failureCount = data.failureCount || 0;
        this._lastFailureTime = data.lastFailureTime || 0;
        // 状态由当前配置 + 失败计数重新计算，不依赖持久化状态
        this._state = this._failureCount >= this.maxRetries ? 'CLOSED' : 'OPEN';
      }
    } catch (e) { /* 使用默认值 */ }
  }

  _save() {
    if (!this.persist) {return;}
    try {
      const dir = path.dirname(this._stateFile);
      if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
      fs.writeFileSync(this._stateFile, JSON.stringify({
        failureCount: this._failureCount,
        lastFailureTime: this._lastFailureTime
      }));
    } catch (e) { /* 持久化失败不影响运行 */ }
  }
}

module.exports = CircuitBreaker;
