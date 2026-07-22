const fs = require('fs');
const path = require('path');
const { readFileLines } = require('../utils/UltraWorkUtils');

class AuditLogger {
  constructor(options = {}) {
    this._logDir = options.logDir || path.join(process.cwd(), '.opencode', 'evolution', 'audit');
    this._maxDays = options.maxDays || 90;
    if (!fs.existsSync(this._logDir)) {
      fs.mkdirSync(this._logDir, { recursive: true });
    }
    this._cleanOld();
  }

  log(entry) {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(this._logDir, `${today}.jsonl`);
    const line = `${JSON.stringify({
      ts: new Date().toISOString(),
      ...entry
    })}\n`;
    fs.appendFileSync(file, line, 'utf8');
  }

  _cleanOld() {
    try {
      const files = fs.readdirSync(this._logDir);
      const cutoff = Date.now() - this._maxDays * 86400000;
      for (const f of files) {
        const fp = path.join(this._logDir, f);
        const stat = fs.statSync(fp);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(fp);
        }
      }
    } catch (e) { /* 清理失败不中断 */ }
  }

  getTodayLog() {
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(this._logDir, `${today}.jsonl`);
    if (!fs.existsSync(file)) {return [];}
    return readFileLines(file).filter(Boolean).map((l) => JSON.parse(l));
  }
}

module.exports = AuditLogger;

// adversarial test
