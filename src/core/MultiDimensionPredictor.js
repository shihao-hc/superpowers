/**
 * MultiDimensionPredictor - 多维度预测系统
 * 意图/技能/动作/时间 四维度预测
 */

class MultiDimensionPredictor {
  constructor() {
    this._history = [];
    this._maxHistory = 50;
    this._dimensions = {
      intent: {},
      skill: {},
      action: {},
      time: { morning: 0, afternoon: 0, evening: 0, night: 0 }
    };
  }

  learn(input, intent, skill = null, action = null) {
    const entry = {
      input,
      intent,
      skill,
      action,
      hour: new Date().getHours(),
      timestamp: Date.now()
    };

    this._history.push(entry);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    if (intent) {
      this._dimensions.intent[intent] = (this._dimensions.intent[intent] || 0) + 1;
    }
    if (skill) {
      this._dimensions.skill[skill] = (this._dimensions.skill[skill] || 0) + 1;
    }
    if (action) {
      this._dimensions.action[action] = (this._dimensions.action[action] || 0) + 1;
    }

    const timeSlot = this._getTimeSlot(entry.hour);
    this._dimensions.time[timeSlot]++;
  }

  _getTimeSlot(hour) {
    if (hour >= 6 && hour < 12) { return 'morning'; }
    if (hour >= 12 && hour < 18) { return 'afternoon'; }
    if (hour >= 18 && hour < 22) { return 'evening'; }
    return 'night';
  }

  predict(currentInput, _context = {}) {
    const predictions = {
      intent: this._predictIntent(currentInput),
      skill: this._predictSkill(),
      nextAction: this._predictNextAction(),
      timeBased: this._predictTimeBased(),
      confidence: 0
    };

    const scores = [
      predictions.intent.confidence,
      predictions.skill.confidence,
      predictions.nextAction.confidence,
      predictions.timeBased.confidence
    ].filter((s) => s > 0);

    predictions.confidence = scores.length > 0
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    return predictions;
  }

  _predictIntent(currentInput) {
    const lower = currentInput.toLowerCase();

    if (lower.includes('写') || lower.includes('创建')) {
      return { intent: 'code_create', confidence: 0.8, reason: 'input_keyword' };
    }
    if (lower.includes('优化') || lower.includes('性能')) {
      return { intent: 'optimize_performance', confidence: 0.8, reason: 'input_keyword' };
    }
    if (lower.includes('测试') || lower.includes('test')) {
      return { intent: 'test', confidence: 0.7, reason: 'input_keyword' };
    }
    if (lower.includes('安全')) {
      return { intent: 'security', confidence: 0.7, reason: 'input_keyword' };
    }

    const topIntent = this._getTop('intent');
    if (topIntent) {
      return { intent: topIntent, confidence: 0.6, reason: 'history_trend' };
    }

    return { intent: null, confidence: 0, reason: 'no_data' };
  }

  _predictSkill() {
    const topSkill = this._getTop('skill');
    if (topSkill) {
      return { skill: topSkill, confidence: 0.6, reason: 'history_trend' };
    }

    const timeSlot = this._getTimeSlot(new Date().getHours());
    const timeMap = {
      morning: 'learning',
      afternoon: 'TDD',
      evening: 'code-review',
      night: 'test-generation'
    };

    return { skill: timeMap[timeSlot] || null, confidence: 0.4, reason: 'time_based' };
  }

  _predictNextAction() {
    const actions = this._history.slice(-5).map((h) => h.action).filter(Boolean);
    if (actions.length === 0) {
      return { action: null, confidence: 0 };
    }

    const topAction = this._getTop('action');
    return { action: topAction, confidence: 0.5, reason: 'history' };
  }

  _predictTimeBased() {
    const timeSlot = this._getTimeSlot(new Date().getHours());
    const total = Object.values(this._dimensions.time).reduce((a, b) => a + b, 0);

    if (total === 0) {
      return { slot: timeSlot, activity: null, confidence: 0 };
    }

    const slotActivity = this._findSlotActivity(timeSlot);
    return {
      slot: timeSlot,
      activity: slotActivity,
      confidence: this._dimensions.time[timeSlot] / total
    };
  }

  _findSlotActivity(timeSlot) {
    const entries = this._history.filter((h) => this._getTimeSlot(h.hour) === timeSlot);
    if (entries.length === 0) { return null; }

    const intents = entries.map((e) => e.intent).filter(Boolean);
    if (intents.length === 0) { return null; }

    return this._getTopFromArray(intents);
  }

  _getTop(dimension) {
    return this._getTopFromArray(Object.entries(this._dimensions[dimension]));
  }

  _getTopFromArray(entries) {
    if (entries.length === 0) { return null; }
    const sorted = Array.isArray(entries[0])
      ? entries.sort((a, b) => b[1] - a[1])
      : Object.entries(this._countOccurrences(entries)).sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
  }

  _countOccurrences(arr) {
    return arr.reduce((acc, val) => {
      acc[val] = (acc[val] || 0) + 1;
      return acc;
    }, {});
  }
}

module.exports = MultiDimensionPredictor;
