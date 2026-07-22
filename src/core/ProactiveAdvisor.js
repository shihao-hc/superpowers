const fs = require('fs');
const path = require('path');
const { splitLines } = require('../utils/UltraWorkUtils');

class ProactiveAdvisor {
  constructor(options = {}) {
    this._auditDir = options.auditDir || path.join(process.cwd(), '.opencode', 'audit');
    this._lessonLibPath = options.lessonLibPath || path.join(process.cwd(), '.opencode', 'lessons.json');
    this._decisionPath = options.decisionPath || path.join(process.cwd(), '.opencode', 'evolution', 'decisions.json');
    this._audit = options.audit || null;
    this._maxResults = options.maxResults || 10;
  }

  scan() {
    const suggestions = [];

    // 1. 扫描审计日志中的高频错误
    const errorPatterns = this._scanAuditLogs();
    if (errorPatterns.length > 0) {
      suggestions.push({
        type: 'error_pattern',
        priority: 'high',
        title: '\u68c0\u6d4b\u5230\u9ad8\u9891\u9519\u8bef\u6a21\u5f0f',
        detail: errorPatterns.slice(0, 3).map(function(p) { return `${p.pattern} (\u51fa\u73b0${p.count}\u6b21)`; }).join('; '),
        items: errorPatterns.slice(0, this._maxResults)
      });
    }

    // 2. 检查未应用的高优先级教训
    const unappliedLessons = this._findUnappliedLessons();
    if (unappliedLessons.length > 0) {
      suggestions.push({
        type: 'unapplied_lessons',
        priority: 'medium',
        title: `\u6709${unappliedLessons.length}\u6761\u9ad8\u4f18\u5148\u7ea7\u6559\u8bad\u5c1a\u672a\u5e94\u7528`,
        detail: unappliedLessons.slice(0, 3).map(function(l) { return l.lesson || l.id; }).join('; '),
        items: unappliedLessons.slice(0, this._maxResults)
      });
    }

    // 3. 检查决策趋势
    const decisionTrends = this._analyzeDecisions();
    if (decisionTrends) {
      suggestions.push(decisionTrends);
    }

    return suggestions;
  }

  _scanAuditLogs() {
    const patterns = {};
    try {
      if (!fs.existsSync(this._auditDir)) {return [];}
      const files = fs.readdirSync(this._auditDir).filter(function(f) { return f.endsWith('.jsonl'); }).sort().slice(-7);
      const self = this;
      files.forEach(function(file) {
        try {
          const content = fs.readFileSync(path.join(self._auditDir, file), 'utf8');
          splitLines(content).forEach(function(line) {
            try {
              const entry = JSON.parse(line);
              if (entry.level === 'error' || entry.level === 'warn') {
                const key = `${entry.module || 'unknown'}:${entry.action || 'unknown'}`;
                if (!patterns[key]) {patterns[key] = { pattern: key, count: 0, lastSeen: null, firstSeen: null };}
                patterns[key].count++;
                if (!patterns[key].firstSeen) {patterns[key].firstSeen = entry.ts;}
                patterns[key].lastSeen = entry.ts;
              }
            } catch (e) { /* skip malformed lines */ }
          });
        } catch (e) { /* skip unreadable files */ }
      });
    } catch (e) { /* skip */ }

    return Object.values(patterns)
      .filter(function(p) { return p.count >= 3; })
      .sort(function(a, b) { return b.count - a.count; })
      .slice(0, this._maxResults);
  }

  _findUnappliedLessons() {
    try {
      if (!fs.existsSync(this._lessonLibPath)) {return [];}
      const lib = JSON.parse(fs.readFileSync(this._lessonLibPath, 'utf8'));
      return (lib.lessons || []).filter(function(l) {
        return l.priority === 'high' && (!l.applied || l.applyCount < 1);
      }).slice(0, this._maxResults);
    } catch (e) {
      return [];
    }
  }

  _analyzeDecisions() {
    try {
      if (!fs.existsSync(this._decisionPath)) {return null;}
      const data = JSON.parse(fs.readFileSync(this._decisionPath, 'utf8'));
      const history = Array.isArray(data) ? data : (data.history || []);
      if (history.length < 5) {return null;}

      const recent = history.slice(-20);
      const highRisk = recent.filter(function(d) { return d.riskLevel === 'high'; }).length;
      const errorDecisions = recent.filter(function(d) { return d.decision === 'error' || d.decision === 'failed'; }).length;
      const rate = Math.round(highRisk / recent.length * 100);

      if (highRisk >= 5) {
        return {
          type: 'risk_trend',
          priority: 'medium',
          title: `\u8fd1\u671f\u9ad8\u98ce\u9669\u51b3\u7b56\u5360\u6bd4${rate}%`,
          detail: `\u6700\u8fd120\u6b21\u51b3\u7b56\u4e2d\u9ad8\u98ce\u9669${highRisk}\u6b21\uff0c\u5931\u8d25${errorDecisions}\u6b21`,
          items: { total: history.length, recentHighRisk: highRisk, recentErrors: errorDecisions }
        };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  getStatus() {
    const suggestions = this.scan();
    return {
      timestamp: new Date().toISOString(),
      suggestionCount: suggestions.length,
      suggestions: suggestions
    };
  }
}

module.exports = ProactiveAdvisor;
