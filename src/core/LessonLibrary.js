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
    return this._lessons
      .filter((l) => !l._applied)
      .slice(0, 3)
      .map((l) => ({ lessonId: l.id, score: l.priority || 1 }));
  }

  getRelated(query, limit = 3) {
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
      const q = query.toLowerCase();
      results = results.filter((l) =>
        (l.title && l.title.toLowerCase().includes(q)) ||
        (l.problem && l.problem.toLowerCase().includes(q)) ||
        (l.lesson && l.lesson.toLowerCase().includes(q)) ||
        (l.tags && l.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }
    if (options.type && options.type === 'success') {
      results = results.filter((l) => l._applied);
    }
    if (options.limit) { results = results.slice(0, options.limit); }
    return results;
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
    return {
      total: this._lessons.length,
      applied: this._lessons.filter((l) => l._applied).length,
      active: this._lessons.filter((l) => !l._applied).length,
      categories: Object.keys(this._categories).length
    };
  }

  _load() {
    try {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(process.cwd(), '.lesson-library.json');
      if (fs.existsSync(file)) {
        this._lessons = JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    } catch (e) { /* silent */ }
  }

  _save() {
    try {
      const fs = require('fs');
      const path = require('path');
      const file = path.join(process.cwd(), '.lesson-library.json');
      fs.writeFileSync(file, JSON.stringify(this._lessons, null, 2));
    } catch (e) { /* silent */ }
  }
}

module.exports = LessonLibrary;
