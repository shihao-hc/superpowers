const fs = require('fs');
const path = require('path');

/**
 * ProactiveTaskEngine - 自主任务引擎
 *
 * 让系统从"被动等输入"变"主动发起"：
 * 1. 教训验证应用（只读启发式：扫描代码验证教训是否已体现 → markApplied / 记录待办）
 * 2. 健康巡检（只读：检测积压/异常 → 主动报告）
 *
 * 保守边界：只做只读验证 + 标记 + 报告，不自动改代码。
 * 自动修复由 SelfCodeImprover 扫描驱动（问题驱动），不属于本引擎范围。
 */
class ProactiveTaskEngine {
  constructor(options = {}) {
    this._lessonLib = options.lessonLib || null;
    this._actionsPath = options.actionsPath || path.join(process.cwd(), '.opencode', 'evolution', 'actions.json');
    this._pendingPath = options.pendingPath || path.join(process.cwd(), '.opencode', 'evolution', 'pending-lessons.json');
    this._srcDirs = options.srcDirs || this._defaultSrcDirs();
    this._maxFiles = options.maxFiles || 1500;
    this._srcIndex = null;
    this._engineLoop = null;
  }

  _defaultSrcDirs() {
    return ['core', 'agent', 'agents', 'skills', 'security', 'middleware']
      .map((d) => path.join(process.cwd(), 'src', d))
      .filter((d) => fs.existsSync(d));
  }

  _getLessonLib() {
    if (!this._lessonLib) {
      const LessonLibrary = require('./LessonLibrary');
      this._lessonLib = new LessonLibrary({ quiet: true });
    }
    return this._lessonLib;
  }

  /**
   * 执行所有自主任务
   */
  runTasks() {
    this._srcIndex = null; // 失效索引（代码可能变化）
    const lessonVerification = this.runLessonVerification();
    const healthCheck = this.runHealthCheck();
    return { lessonVerification, healthCheck };
  }

  /**
   * 任务1: 教训验证应用（启发式只读）
   * - active 教训扫描代码 → 关键词命中 → markApplied（视为已体现）
   * - 未命中 → 记录待办（不自动改代码）
   */
  runLessonVerification() {
    const lib = this._getLessonLib();
    const active = (lib.lessons || []).filter((l) => !l._applied);
    const index = this._buildSrcIndex();
    const results = { total: active.length, verified: [], pending: [] };

    for (const lesson of active) {
      const keywords = this._extractKeywords(lesson);
      const found = this._keywordsInIndex(index, keywords);
      if (found) {
        try { lib.markApplied(lesson.id); } catch (e) { /* 标记失败不阻塞 */ }
        this._recordAction({ type: 'lesson-verify', action: 'verify-applied', lessonRef: lesson.id, result: 'verified' });
        results.verified.push(lesson.id);
      } else {
        this._recordAction({ type: 'lesson-verify', action: 'verify-pending', lessonRef: lesson.id, result: 'needs-attention' });
        results.pending.push(lesson.id);
      }
    }
    return results;
  }

  /**
   * 从教训提取可扫描关键词（英文词 + 过滤停用词；中文教训提取能力有限，诚实标注启发式）
   */
  _extractKeywords(lesson) {
    const stopwords = new Set(['the', 'and', 'for', 'use', 'your', 'you', 'to', 'of', 'in', 'on', 'with', 'are', 'this', 'that', 'have', 'has', 'not', 'from', 'can', 'will', 'out', 'about', 'into', 'what', 'when', 'make', 'code', 'problem', 'lesson']);
    const text = [
      lesson.lesson, lesson.improvement, lesson.problem,
      ...(lesson.tags || [])
    ].filter(Boolean).join(' ').toLowerCase();
    const words = text.match(/[a-z]{3,}/g) || [];
    return [...new Set(words.filter((w) => !stopwords.has(w)))].slice(0, 5);
  }

  /**
   * 构建 src 索引（一次扫描，供所有教训匹配）
   */
  _buildSrcIndex() {
    if (this._srcIndex) { return this._srcIndex; }
    const index = [];
    let count = 0;
    for (const dir of this._srcDirs) {
      for (const file of this._collectFiles(dir)) {
        if (count >= this._maxFiles) { break; }
        try {
          index.push({ file, content: fs.readFileSync(file, 'utf8').toLowerCase() });
          count++;
        } catch (e) { /* 跳过不可读 */ }
      }
    }
    this._srcIndex = index;
    return index;
  }

  _collectFiles(dir) {
    const results = [];
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      let entries;
      try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (e) { continue; }
      for (const e of entries) {
        if (results.length >= this._maxFiles) { break; }
        const p = path.join(cur, e.name);
        if (e.isDirectory()) { stack.push(p); } else if (e.name.endsWith('.js')) { results.push(p); }
      }
    }
    return results;
  }

  _keywordsInIndex(index, keywords) {
    if (!keywords || keywords.length === 0) { return false; }
    return index.some(({ content }) => keywords.some((k) => content.includes(k)));
  }

  /**
   * 任务2: 健康巡检（只读，异常主动报告，健康无噪音）
   */
  runHealthCheck() {
    const report = { anomalies: [] };

    // 待审教训积压
    const pending = this._loadPending();
    if (pending.length > 0) {
      report.anomalies.push({ issue: 'pending-lessons-backlog', count: pending.length });
      this._recordAction({ type: 'health-check', action: 'pending-backlog', result: `pending:${pending.length}` });
    }

    // 行动日志 manual-required 积压
    const manual = this._loadActions().filter((a) => a.result === 'needs-human');
    if (manual.length > 0) {
      report.anomalies.push({ issue: 'manual-required-backlog', count: manual.length });
      this._recordAction({ type: 'health-check', action: 'manual-backlog', result: `manual:${manual.length}` });
    }

    // 教训 active 比例过高（学到的没应用到代码）
    const stats = this._getLessonLib().getStats();
    if (stats.total > 0 && stats.active / stats.total > 0.8) {
      report.anomalies.push({ issue: 'lessons-not-applied', active: stats.active, total: stats.total });
      this._recordAction({ type: 'health-check', action: 'lessons-unapplied', result: `active:${stats.active}/${stats.total}` });
    }

    return report;
  }

  _loadPending() {
    try {
      if (!fs.existsSync(this._pendingPath)) { return []; }
      const p = JSON.parse(fs.readFileSync(this._pendingPath, 'utf8'));
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  _loadActions() {
    try {
      if (!fs.existsSync(this._actionsPath)) { return []; }
      const p = JSON.parse(fs.readFileSync(this._actionsPath, 'utf8'));
      return Array.isArray(p) ? p : [];
    } catch (e) { return []; }
  }

  /**
   * 记录自主任务到行动日志（去重：同 type+action+lessonRef+result 不重复记录）
   */
  _recordAction(action) {
    try {
      const dir = path.dirname(this._actionsPath);
      if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
      const actions = this._loadActions();
      const dup = actions.some((a) =>
        a.type === action.type && a.action === action.action &&
        a.lessonRef === action.lessonRef && a.result === action.result
      );
      if (dup) { return { recorded: false, reason: 'duplicate' }; }
      actions.push({ timestamp: new Date().toISOString(), ...action });
      fs.writeFileSync(this._actionsPath, JSON.stringify(actions.slice(-200), null, 2));
      return { recorded: true };
    } catch (e) {
      return { recorded: false, reason: e.message };
    }
  }

  startAutoLoop(intervalMs) {
    if (this._engineLoop) {
      console.log('[ProactiveTaskEngine] 自主任务引擎已在运行');
      return this;
    }
    intervalMs = intervalMs || 30 * 60 * 1000;
    const self = this;
    this._engineLoop = setInterval(() => {
      try { self.runTasks(); } catch (e) { console.warn('[ProactiveTaskEngine] 任务失败:', e.message); }
    }, intervalMs);
    console.log(`[ProactiveTaskEngine] 自主任务引擎已启动 (间隔: ${intervalMs}ms)`);
    try { this.runTasks(); } catch (e) { console.warn('[ProactiveTaskEngine] 初始任务失败:', e.message); }
    return this;
  }

  stopAutoLoop() {
    if (this._engineLoop) {
      clearInterval(this._engineLoop);
      this._engineLoop = null;
      console.log('[ProactiveTaskEngine] 自主任务引擎已停止');
    }
  }
}

module.exports = ProactiveTaskEngine;