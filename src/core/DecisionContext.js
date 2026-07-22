const _fs = require('fs');
const _path = require('path');

class DecisionContext {
  constructor(options = {}) {
    this._audit = options.audit || null;
    this._tracker = options.tracker || null;
  }

  generate(input, taskType, lessons, history) {
    const riskLevel = this._calcRiskLevel(taskType, lessons);
    const recommendations = this._buildRecommendations(taskType, lessons, history);
    const priorityOverrides = this._calcOverrides(lessons, history);
    const toolRestrictions = this._calcRestrictions(taskType, riskLevel);
    const sessionContext = this._buildSessionContext(history);

    const ctx = {
      riskLevel,
      recommendations,
      priorityOverrides,
      toolRestrictions,
      sessionContext,
      generatedAt: new Date().toISOString()
    };

    if (this._audit) {
      this._audit.log({ level: 'info', module: 'decision', action: 'context_generated', riskLevel, recCount: recommendations.length });
    }

    return ctx;
  }

  _calcRiskLevel(taskType, lessons) {
    if (!taskType) {return 'low';}
    const high = taskType === 'security' || taskType === 'fix';
    if (high) {return 'high';}
    const highWarnings = (lessons || []).filter((l) => l.priority === 'high').length;
    if (highWarnings >= 3) {return 'high';}
    if (highWarnings >= 1) {return 'medium';}
    if (taskType === 'deploy' || taskType === 'review') {return 'medium';}
    return 'low';
  }

  _buildRecommendations(taskType, lessons, _history) {
    const recs = [];
    if (!taskType) {return recs;}

    const typeRecs = {
      code: ['\u5148\u5206\u6790\u9700\u6c42\u518d\u7f16\u7801', '\u6ce8\u610f\u8fb9\u754c\u6761\u4ef6\u548c\u5f02\u5e38\u5904\u7406'],
      fix: ['\u5148\u53d1\u73b0\u95ee\u9898\u518d\u52a8\u624b\u4fee\u590d', '\u786e\u4fdd\u4fee\u590d\u4e0d\u5f15\u5165\u65b0 bug'],
      security: ['\u4f18\u5148\u5904\u7406\u9ad8\u5371\u6f0f\u6d1e', '\u6240\u6709\u7528\u6237\u8f93\u5165\u5fc5\u987b\u9a8c\u8bc1'],
      test: ['\u5148\u5199\u6d4b\u8bd5\u518d\u5b9e\u73b0', '\u8986\u76d6\u8fb9\u754c\u60c5\u51b5'],
      refactor: ['\u4fdd\u6301\u63a5\u53e3\u4e0d\u53d8', '\u9010\u6b65\u8fc1\u79fb\uff0c\u907f\u514d\u5927\u9762\u79ef\u91cd\u5199'],
      deploy: ['\u786e\u4fdd\u56de\u6eda\u65b9\u6848', '\u5148\u53d1\u5e03\u5230\u6d4b\u8bd5\u73af\u5883'],
      default: ['\u5148\u7406\u89e3\u95ee\u9898\u518d\u884c\u52a8']
    };
    if (typeRecs[taskType]) {recs.push.apply(recs, typeRecs[taskType]);}

    const unapplied = (lessons || []).filter((l) => l.priority === 'high' && (!l.useCount || l.useCount < 1));
    unapplied.slice(0, 2).forEach((l) => {
      if (l.title) {recs.push(`\u5e94\u7528\u6559\u8bad: ${l.title}`);}
    });

    if (recs.length > 5) {recs.length = 5;}
    return recs;
  }

  _calcOverrides(lessons, _history) {
    const overrides = {};
    (lessons || []).forEach((l) => {
      if (l.priority === 'high' && l.category === 'security') {overrides[l.id] = 'high';}
      if (l.priority === 'low' && l.applyCount > 5) {overrides[l.id] = 'medium';}
    });
    return overrides;
  }

  _calcRestrictions(taskType, riskLevel) {
    if (riskLevel === 'high') {
      return [
        { op: 'delete', action: 'BLOCK', reason: '\u9ad8\u98ce\u9669\u72b6\u6001\u4e0b\u7981\u6b62\u5220\u9664\u64cd\u4f5c' },
        { op: 'write', target: 'src/core/*', action: 'WARN', reason: '\u4fee\u6539 core \u6587\u4ef6\u9700\u786e\u8ba4' }
      ];
    }
    if (riskLevel === 'medium') {
      return [
        { op: 'delete', action: 'WARN', reason: '\u5220\u9664\u524d\u8bf7\u786e\u8ba4\u6709\u5907\u4efd' },
        { op: 'write', target: '.opencode/*', action: 'WARN', reason: '\u4fee\u6539\u914d\u7f6e\u9700\u5907\u4efd' }
      ];
    }
    return [];
  }

  _buildSessionContext(history) {
    return {
      interactionCount: (history && history.interactionCount) || 0,
      topIntent: (history && history.topIntent) || null,
      recentDecisions: (history && history.recentDecisions) || []
    };
  }
}

module.exports = DecisionContext;
