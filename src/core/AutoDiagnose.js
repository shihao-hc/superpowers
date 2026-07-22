const _fs = require('fs');
const _path = require('path');
const LessonLibrary = require('./LessonLibrary');

class AutoDiagnose {
  constructor(options = {}) {
    this._lessonLib = options.lessonLib || new LessonLibrary(options.lessonLibOptions || { quiet: true });
    this._audit = options.audit || null;
  }

  diagnose(errorMessage, limit = 3) {
    if (!errorMessage || typeof errorMessage !== 'string') {return [];}
    const tokens = this._tokenize(errorMessage);
    if (tokens.length === 0) {return [];}

    const scored = this._lessonLib.lessons.map((lesson) => ({
      lesson: {
        id: lesson.id,
        problem: lesson.problem,
        lesson: lesson.lesson,
        category: lesson.category,
        priority: lesson.priority,
        tags: lesson.tags
      },
      score: this._computeScore(tokens, lesson)
    }));

    const results = scored
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    if (this._audit) {
      this._audit.log({
        level: 'info',
        module: 'diagnose',
        action: 'diagnose',
        errorLength: errorMessage.length,
        matches: results.length,
        topScore: results.length > 0 ? results[0].score : 0
      });
    }

    return results;
  }

  _tokenize(text) {
    return text.toLowerCase()
      .split(/[\s,.;:!?()\[\]{}"'\/\\@#$%^&*+=<>|`~]+/) // eslint-disable-line no-useless-escape
      .filter((t) => (t.length > 2 || /[\u4e00-\u9fff\u3400-\u4dbf]/.test(t)) && !/^\d+$/.test(t));
  }

  _computeScore(tokens, lesson) {
    const lessonText = [
      lesson.problem || '',
      lesson.lesson || '',
      (lesson.tags || []).join(' ')
    ].join(' ').toLowerCase();

    let matchCount = 0;
    const matched = new Set();
    for (const token of tokens) {
      if (lessonText.includes(token)) {
        matchCount++;
        matched.add(token);
      }
    }
    if (matched.size === 0) {return 0;}

    const coverage = matchCount / Math.max(tokens.length, 1);
    const rarity = matched.size > 0 ? 1 : 0;
    return Math.round((coverage * 0.7 + rarity * 0.3) * 100) / 100;
  }

  searchByToken(token, limit = 5) {
    const t = token.toLowerCase();
    return this._lessonLib.lessons
      .filter((l) => (l.problem || '').toLowerCase().includes(t) || (l.lesson || '').toLowerCase().includes(t))
      .slice(0, limit)
      .map((l) => ({
        id: l.id,
        problem: l.problem,
        lesson: l.lesson,
        category: l.category,
        priority: l.priority
      }));
  }
}

module.exports = AutoDiagnose;
