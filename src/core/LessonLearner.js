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
    // 自动批准: high confidence 且不要求审批
    const autoOk = !this._requireApproval && typeof confidence === 'number' && confidence >= this._autoApprovalThreshold;
    if (autoOk) {
      return this._autoApproveLesson(data);
    }
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
    const pending = {
      id: `pending-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      date: new Date().toISOString(),
      problem: this._str(data.error || data.input || '').substring(0, 500),
      lesson: '（待审核）',
      improvement: '（待审核）',
      context: this._str(data.context || data.input || '').substring(0, 200),
      source: 'lesson-learner',
      status: 'pending',
      tags: this._inferTags(data)
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

  approveLesson(id, edits = {}) {
    const pendings = this.getPendingLessons();
    const idx = pendings.findIndex((l) => l.id === id);
    if (idx === -1) {return { error: 'not_found' };}
    const lesson = { ...pendings[idx], ...edits, status: 'approved' };
    this._removePending(id);
    const inserted = this._insertIntoLibrary(lesson);
    if (this._audit) {this._audit.log({ level: 'info', module: 'learner', action: 'approved', id, lessonId: inserted ? inserted.id : null });}
    return { status: 'approved', lesson: inserted || lesson };
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
        id: `lesson-auto-${Date.now()}`,
        date: new Date().toISOString(),
        type: lesson.type || 'general',
        category: lesson.category || 'pattern',
        problem: (lesson.problem || '').substring(0, 500),
        lesson: (lesson.lesson || '').substring(0, 500),
        improvement: (lesson.improvement || '').substring(0, 500),
        context: (lesson.context || '').substring(0, 200),
        source: lesson.source || 'lesson-learner',
        tags: lesson.tags || [],
        priority: lesson.priority || 'medium',
        applied: false,
        applyCount: 0
      };
      lib.lessons.push(record);
      fs.writeFileSync(this._lessonsPath, JSON.stringify(lib, null, 2));
      return record;
    } catch (e) {
      return null;
    }
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
