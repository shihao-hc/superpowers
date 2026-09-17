const fs = require('fs');
const path = require('path');

class LessonLearner {
  constructor(options = {}) {
    this._pendingPath = options.pendingPath || path.join(process.cwd(), '.opencode', 'evolution', 'pending-lessons.json');
    this._lessonsPath = options.lessonsPath || path.join(process.cwd(), '.opencode', 'lessons.json');
    this._audit = options.audit || null;
    this._autoApprovalThreshold = options.autoApprovalThreshold || 0.8;
    this._requireApproval = options.requireApproval !== false;
    this._ensureDir();
  }

  _ensureDir() {
    const dir = path.dirname(this._pendingPath);
    if (!fs.existsSync(dir)) {fs.mkdirSync(dir, { recursive: true });}
  }

  _str(value) {
    if (typeof value === 'string') {return value;}
    if (value === null || value === undefined) {return '';}
    if (typeof value === 'object') {
      try {return JSON.stringify(value);} catch (e) {return String(value);}
    }
    return String(value);
  }

  recordEvent(eventType, data, confidence) {
    if (eventType !== 'POST_TOOL_USE') {return null;}
    const isFix = this._isFixOperation(data);
    if (!isFix) {return null;}
    // 修复：无实质内容不产生垃圾教训——MCP 工具结果（JSON 含 success/fixed/pass 键）此前
    // 被判定为 fix，生成空内容教训并 3 次同步写盘，持续污染共享教训库。精准拦截 JSON 结果标记
    const resultText = this._str(data.result || '');
    const resultIsJsonMarker = /^\s*\{\s*["']?success/.test(resultText) || /^\s*\{\s*["']?ok\s*:/.test(resultText);
    const content = this._str(data.input || data.error || '');
    if (content.length < 5 && resultIsJsonMarker) {return null;}
    // 自动批准: high confidence 且不要求审批
    const autoOk = !this._requireApproval && typeof confidence === 'number' && confidence >= this._autoApprovalThreshold;
    if (autoOk) {
      return this._autoApproveLesson(data);
    }
    return this._extractLesson(data);
  }

  /**
   * 从对话反馈中学习（用户纠正 → 教训）
   * 让学习闭环在真实对话中运转（对话路径触发，非仅 MCP 工具）
   */
  recordFeedback({ feedback, previousReply, userId }) {
    const text = this._str(feedback);
    if (!text) { return null; }
    // 纠正/负面信号检测
    const isCorrection = /不对|错了|不是这样|应该是|应该用|改成|修正|有误|不正确|不合适|wrong|incorrect|should be|that's not/i.test(text);
    if (!isCorrection) { return null; }
    const data = {
      input: `用户纠正: ${text.substring(0, 150)}`,
      result: 'corrected',
      tags: ['fix', 'correction'],
      userId: userId || null,
      context: previousReply ? `上一轮回复: ${this._str(previousReply).substring(0, 80)}` : 'conversation'
    };
    return this._extractLesson(data);
  }

  _autoApproveLesson(data) {
    // 从 fix 数据自动推断教训内容
    const lesson = this._inferLessonText(data);
    const improvement = this._inferImprovement(data);
    const tags = this._inferTags(data);
    const record = {
      id: `lesson-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      date: new Date().toISOString(),
      type: 'auto',
      category: 'fix',
      problem: (data.error || data.input || '').substring(0, 500),
      lesson: lesson.substring(0, 500),
      improvement: improvement.substring(0, 500),
      context: (data.context || data.input || '').substring(0, 200),
      source: 'lesson-learner-auto',
      userId: data.userId || null,
      tags: tags,
      priority: 'medium',
      applied: false,
      applyCount: 0
    };
    this._insertIntoLibrary(record);
    if (this._audit) {this._audit.log({ level: 'info', module: 'learner', action: 'auto_approved', id: record.id, tags: tags.join(',') });}
    console.log(`[LessonLearner] \u81ea\u52a8\u6279\u51c6\u6559\u8bad: ${record.id} (${lesson.substring(0, 60)})`);
    return { status: 'auto_approved', lesson: record };
  }

  _inferLessonText(data) {
    const input = this._str(data.input);
    const error = this._str(data.error);
    const result = this._str(data.result);
    if (error) {return `\u4fee\u590d\u95ee\u9898: ${error.substring(0, 100)}`;}
    if (result.includes('fixed') || result.includes('pass')) {return `\u6210\u529f\u4fee\u590d: ${input.substring(0, 100)}`;}
    return `\u4ece\u5b9e\u8df5\u4e2d\u5b66\u4e60: ${input.substring(0, 100)}`;
  }

  _inferImprovement(data) {
    const result = this._str(data.result);
    const error = this._str(data.error);
    if (result.includes('fixed')) {return '\u5e94\u7528\u76f8\u540c\u7684\u4fee\u590d\u7b56\u7565\u5230\u7c7b\u4f3c\u95ee\u9898';}
    if (error) {return `\u907f\u514d\u540c\u6837\u7684${error.substring(0, 60)}`;}
    return '\u4fdd\u6301\u826f\u597d\u5b9e\u8df5';
  }

  _isFixOperation(data) {
    if (!data) {return false;}
    const tags = data.tags || [];
    if (tags.some((t) => /fix|debug|bug|repair|correct/i.test(t))) {return true;}
    const input = this._str(data.input).toLowerCase();
    if (/fix|debug|bug|repair|correct|error|异常|错误|调试/.test(input)) {return true;}
    const result = this._str(data.result).toLowerCase();
    if (result.includes('success') || result.includes('fixed') || result.includes('pass')) {return true;}
    return false;
  }

  _extractLesson(data) {
    // 生成实质教训内容（而非占位符），使 pending 可读、可审核、可生效
    const pending = {
      id: `pending-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      date: new Date().toISOString(),
      problem: this._str(data.error || data.input || '').substring(0, 500),
      lesson: this._inferLessonText(data).substring(0, 500),
      improvement: this._inferImprovement(data).substring(0, 500),
      context: this._str(data.context || data.input || '').substring(0, 200),
      source: 'lesson-learner',
      userId: data.userId || null,
      status: 'pending',
      tags: this._inferTags(data),
      priority: this._inferTags(data).includes('security') ? 'high' : 'medium'
    };
    this._savePending(pending);
    if (this._audit) {this._audit.log({ level: 'info', module: 'learner', action: 'pending_added', id: pending.id });}
    return pending;
  }

  _inferTags(data) {
    const tags = [];
    const text = (`${this._str(data.input)} ${this._str(data.error)} ${this._str(data.result)}`).toLowerCase();
    if (/安全|security|漏洞|injection|xss/.test(text)) {tags.push('security');}
    if (/性能|performance|慢|slow|latency/.test(text)) {tags.push('performance');}
    if (/测试|test|assert|expect/.test(text)) {tags.push('test');}
    if (/类型|type|typescript|interface/.test(text)) {tags.push('typescript');}
    if (/异步|async|promise|await|callback/.test(text)) {tags.push('async');}
    if (/内存|memory|leak|oom/.test(text)) {tags.push('memory');}
    if (/并发|race|deadlock|锁|lock/.test(text)) {tags.push('concurrency');}
    return tags;
  }

  getPendingLessons() {
    try {
      if (!fs.existsSync(this._pendingPath)) {return [];}
      return JSON.parse(fs.readFileSync(this._pendingPath, 'utf8'));
    } catch (e) {
      return [];
    }
  }

  /**
   * 自动审核低风险 pending 教训（使学习闭环运转）
   * - 非 security 标签 + 有实质内容的教训 → 自动生效
   * - security 教训保持人工审核（防污染风险决策）
   */
  autoApproveSafeLessons() {
    const pendings = this.getPendingLessons();
    const safe = pendings.filter((p) => {
      const tags = p.tags || [];
      const hasContent = p.lesson && p.lesson !== '（待审核）' && p.lesson.length > 5;
      return !tags.includes('security') && hasContent;
    });
    let approved = 0;
    for (const p of safe) {
      const r = this.approveLesson(p.id);
      if (r && r.status === 'approved') { approved++; }
    }
    return { approved, remaining: this.getPendingLessons().length };
  }

  approveLesson(id, edits = {}) {
    const pendings = this.getPendingLessons();
    const idx = pendings.findIndex((l) => l.id === id);
    if (idx === -1) {return { error: 'not_found' };}
    const lesson = { ...pendings[idx], ...edits, status: 'approved' };
    // 修复：先插入成功再删 pending（原先删后插，插入失败则教训两头消失 = 数据丢失）
    const inserted = this._insertIntoLibrary(lesson);
    if (!inserted) {
      return { error: 'insert_failed', lesson };
    }
    this._removePending(id);
    if (this._audit) {this._audit.log({ level: 'info', module: 'learner', action: 'approved', id, lessonId: inserted ? inserted.id : null });}
    return { status: 'approved', lesson: inserted };
  }

  rejectLesson(id) {
    const pendings = this.getPendingLessons();
    const idx = pendings.findIndex((l) => l.id === id);
    if (idx === -1) {return { error: 'not_found' };}
    this._removePending(id);
    if (this._audit) {this._audit.log({ level: 'info', module: 'learner', action: 'rejected', id });}
    return { status: 'rejected', id };
  }

  _removePending(id) {
    const pendings = this.getPendingLessons().filter((l) => l.id !== id);
    fs.writeFileSync(this._pendingPath, JSON.stringify(pendings, null, 2));
  }

  _insertIntoLibrary(lesson) {
    try {
      if (!fs.existsSync(this._lessonsPath)) {return null;}
      const lib = JSON.parse(fs.readFileSync(this._lessonsPath, 'utf8'));
      const record = {
        id: `lesson-auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: new Date().toISOString(),
        type: lesson.type || 'general',
        category: lesson.category || 'pattern',
        problem: (lesson.problem || '').substring(0, 500),
        lesson: (lesson.lesson || '').substring(0, 500),
        improvement: (lesson.improvement || '').substring(0, 500),
        context: (lesson.context || '').substring(0, 200),
        source: lesson.source || 'lesson-learner',
        // 修复：保留 userId（此前转 active 时丢弃 → 用户纠正教训变共享 → 跨用户 prompt 注入）
        userId: lesson.userId || null,
        tags: lesson.tags || [],
        priority: lesson.priority || 'medium',
        applied: false,
        applyCount: 0
      };
      lib.lessons.push(record);
      fs.writeFileSync(this._lessonsPath, JSON.stringify(lib, null, 2));
      this._incrementGrowthCounter();
      return record;
    } catch (e) {
      return null;
    }
  }

  /**
   * 更新成长计数（growth.lessonsLearned）——让学习效果在 growth 可观测
   */
  _incrementGrowthCounter() {
    try {
      const growthFile = path.join(process.cwd(), '.opencode', 'evolution', 'growth.json');
      let growth = {};
      if (fs.existsSync(growthFile)) {
        growth = JSON.parse(fs.readFileSync(growthFile, 'utf8')) || {};
      }
      growth.lessonsLearned = (growth.lessonsLearned || 0) + 1;
      growth.lastUpdated = Date.now();
      fs.writeFileSync(growthFile, JSON.stringify(growth, null, 2));
    } catch (e) { /* 计数器更新失败不影响学习 */ }
  }

  _savePending(entry) {
    const pendings = this.getPendingLessons();
    pendings.push(entry);
    fs.writeFileSync(this._pendingPath, JSON.stringify(pendings, null, 2));
  }

  getStats() {
    const pendings = this.getPendingLessons();
    return { pendingCount: pendings.length };
  }
}

module.exports = LessonLearner;
