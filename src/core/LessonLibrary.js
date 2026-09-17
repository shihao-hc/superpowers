class LessonLibrary {
  constructor(options = {}) {
    this._lessons = [];
    this._categories = {
      security: '安全性',
      performance: '性能',
      architecture: '架构',
      workflow: '工作流',
      communication: '沟通',
      error: '错误处理'
    };
    this._quiet = options.quiet || false;
    this._load();
  }

  get lessons() { return this._lessons; }
  get categories() { return this._categories; }

  getSuggestions(_context) {
    // 返回完整教训字段（lesson/priority/improvement）——修复：原只返回 {lessonId, score}，
    // DecisionEngine 读 s.priority/s.lesson 恒 undefined → forceThink 教训警告永远为空
    return this._lessons
      .filter((l) => !l._applied)
      .slice(0, 3)
      .map((l) => ({
        lessonId: l.id,
        lesson: l.lesson || l.problem || l.title || '',
        priority: l.priority || 'medium',
        improvement: l.improvement || '',
        score: 1
      }));
  }

  getRelated(query, limit = 3) {
    // 修复：原完全忽略 query 恒返回前 N 条（forceThink 的相关教训与用户输入无关）
    if (query) {
      const matches = this.search(query, { limit });
      if (matches.length > 0) { return matches; }
    }
    return this._lessons.slice(0, limit);
  }

  get(id) {
    return this._lessons.find((l) => l.id === id) || null;
  }

  add(lesson) {
    const record = { id: `lesson_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, ...lesson };
    this._lessons.push(record);
    this._save();
    return record;
  }

  search(query, options = {}) {
    let results = [...this._lessons];
    if (query) {
      // 中文感知：整句 includes 对中文自然语言查询永不命中（真实缺陷，与 SmartMemory 同源）
      // 改为 bigram 分词，任一 token 命中即匹配
      const tokens = LessonLibrary._tokenize(query);
      results = results.filter((l) => {
        const text = `${l.title || ''} ${l.problem || ''} ${l.lesson || ''} ${l.context || ''} ${(l.tags || []).join(' ')}`.toLowerCase();
        return tokens.some((t) => t.length >= 2 && text.includes(t));
      });
    }
    if (options.type && options.type === 'success') {
      results = results.filter((l) => l._applied);
    }
    // 修复：用户纠正产生的教训按 userId 隔离——带 userId 的教训只对本人可见（防跨用户 prompt 注入）；
    // 无 userId 的教训（系统/开发者）共享给所有人
    if (options.userId) {
      results = results.filter((l) => !l.userId || l.userId === options.userId);
    }
    if (options.limit) { results = results.slice(0, options.limit); }
    return results;
  }

  /**
   * 中文感知分词：英文词原样，中文连续段切 CJK 二元组（bigram）
   * 与 SmartMemory._tokenize 逻辑一致（保持检索语义统一）
   */
  static _tokenize(text) {
    const s = String(text || '').toLowerCase();
    const tokens = [];
    const enWords = s.match(/[a-z0-9][a-z0-9._-]*/g) || [];
    tokens.push(...enWords);
    const cjkRuns = s.match(/[\u4e00-\u9fff]+/g) || [];
    for (const run of cjkRuns) {
      if (run.length <= 2) {
        if (!tokens.includes(run)) { tokens.push(run); }
      } else {
        for (let i = 0; i < run.length - 1; i++) {
          const bigram = run.slice(i, i + 2);
          if (!tokens.includes(bigram)) { tokens.push(bigram); }
        }
      }
    }
    return tokens;
  }

  /**
   * 按问题类型/标签匹配相关未应用教训（供自我改进关联教训使用）
   */
  searchByType(issueType, tags = []) {
    const typeKeywords = {
      'duplicate-require': ['duplicate', 'require', '重复', 'code-quality', 'refactor', 'clean'],
      'empty-catch': ['catch', 'error', '错误', 'empty', 'exception', '静默'],
      'version-inconsistency': ['version', '版本', 'inconsistency'],
      'unused-variable': ['unused', '变量', 'dead'],
      'console-log-leak': ['console', 'log', '日志'],
      'sync-file-ops': ['sync', '同步', 'file'],
      'security-hardcoded-secret': ['security', 'secret', '安全', '密钥', 'hardcode']
    };
    const keywords = [...(typeKeywords[issueType] || [issueType]), ...tags];
    const kw = keywords.map((k) => k.toLowerCase());
    if (kw.length === 0) { return []; }
    return this._lessons.filter((l) => {
      if (l._applied) { return false; }
      const hay = [
        l.tags ? l.tags.join(' ') : '',
        l.category || '',
        l.lesson || '',
        l.improvement || '',
        l.problem || ''
      ].join(' ').toLowerCase();
      return kw.some((k) => hay.includes(k));
    });
  }

  markApplied(lessonId) {
    const lesson = this._lessons.find((l) => l.id === lessonId);
    if (lesson) { lesson._applied = true; }
    this._save();
  }

  export(format) {
    if (format === 'json') { return JSON.stringify(this._lessons, null, 2); }
    return { lessons: this._lessons, categories: this._categories };
  }

  getStats() {
    const applied = this._lessons.filter((l) => l._applied).length;
    const unapplied = this._lessons.length - applied;
    return {
      total: this._lessons.length,
      applied,
      // 修复：消费者（SelfCheckEngine/BrainUtils/LessonTracker/StatusReporter）读 stats.unapplied，
      // 此前从未返回该字段 → 这些分支恒为 undefined > 0 = false（死代码）
      unapplied,
      active: unapplied,
      categories: Object.keys(this._categories).length
    };
  }

  _load() {
    try {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(process.cwd(), '.opencode', 'lessons.json');
      if (fs.existsSync(file)) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        this._lessons = Array.isArray(parsed) ? parsed : (parsed.lessons || []);
      }
    } catch (e) { /* silent */ }
  }

  _save() {
    try {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(process.cwd(), '.opencode', 'lessons.json');
      fs.writeFileSync(file, JSON.stringify({ lessons: this._lessons }, null, 2));
    } catch (e) { /* silent */ }
  }
}

module.exports = LessonLibrary;
