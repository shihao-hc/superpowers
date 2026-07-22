const fs = require('fs');
const path = require('path');

class DecisionTracker {
  constructor(options = {}) {
    this._storagePath = options.storagePath || path.join(process.cwd(), '.opencode', 'evolution', 'decisions.json');
    this._audit = options.audit || null;
    this._maxEntries = options.maxEntries || 500;
    this._ensure();
  }

  _ensure() {
    const dir = path.dirname(this._storagePath);
    try {
      if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
    } catch {}
    try {
      if (!fs.existsSync(this._storagePath)) {
        fs.writeFileSync(this._storagePath, JSON.stringify({ decisions: [], lastUpdated: new Date().toISOString() }, null, 2));
      }
    } catch {}
  }

  _load() {
    try {
      return JSON.parse(fs.readFileSync(this._storagePath, 'utf8'));
    } catch (e) {
      return { decisions: [] };
    }
  }

  _save(data) {
    if (data.decisions.length > this._maxEntries) {
      data.decisions = data.decisions.slice(-this._maxEntries);
    }
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this._storagePath, JSON.stringify(data, null, 2));
  }

  record(entry) {
    if (!entry || typeof entry !== 'object') {return null;}
    const record = {
      id: `dec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      ts: new Date().toISOString(),
      input: (entry.input || '').substring(0, 200),
      taskType: entry.taskType || null,
      decision: entry.decision || null,
      outcome: entry.outcome || null,
      riskLevel: entry.riskLevel || 'low',
      lessonsApplied: entry.lessonsApplied || [],
      durationMs: entry.durationMs || 0
    };
    const data = this._load();
    data.decisions.push(record);
    this._save(data);
    if (this._audit) {this._audit.log({ level: 'info', module: 'tracker', action: 'recorded', id: record.id, taskType: record.taskType });}
    return record;
  }

  getHistory(limit) {
    const data = this._load();
    const decs = data.decisions;
    if (!limit || limit >= decs.length) {return decs.reverse();}
    return decs.slice(-limit).reverse();
  }

  getStats() {
    const data = this._load();
    const decs = data.decisions;
    const byType = {};
    decs.forEach((d) => { byType[d.taskType] = (byType[d.taskType] || 0) + 1; });
    const applied = decs.filter((d) => d.lessonsApplied && d.lessonsApplied.length > 0);
    return {
      total: decs.length,
      byType: byType,
      withLessonsApplied: applied.length,
      applicationRate: decs.length > 0 ? Math.round(applied.length / decs.length * 100) : 0
    };
  }

  getRecentLessons(limit) {
    const data = this._load();
    const applied = {};
    data.decisions.forEach((d) => {
      (d.lessonsApplied || []).forEach((lid) => { applied[lid] = (applied[lid] || 0) + 1; });
    });
    return Object.entries(applied)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit || 10)
      .map(([id, count]) => ({ lessonId: id, applyCount: count }));
  }
}

module.exports = DecisionTracker;
