/**
 * ProactiveThinking - 增强的主动思考模块
 * 学习用户意图模式，生成主动问题和建议
 *
 * Extracted from BrainSystem.js (v22.1)
 */

const PatternLearner = require('./PatternLearner');

/**
 * @param {object} persistence - Persistence adapter with load/save methods
 */
function createProactiveThinking(persistence) {
  const ProactiveThinking = {
    _lastInteractionTime: Date.now(),
    _interactionCount: 0,
    _patternsLearned: 0,
    _lastPatternTime: 0,
    _context: null,
    _patternLearner: null,
    _persistence: persistence,
    _initialized: false,

    _init() {
      try {
        const saved = this._persistence.load('proactive', { count: 0, lastTime: 0 });
        this._interactionCount = saved.count || 0;
        this._lastInteractionTime = saved.lastTime || Date.now();
      } catch (e) {
        // 使用默认值初始化
      }
    },

    _saveState() {
      try {
        this._persistence.save('proactive', {
          count: this._interactionCount,
          patternsLearned: this._patternsLearned,
          lastPatternTime: this._lastPatternTime,
          topIntent: this._patternLearner?.getTopIntent() || null,
          lastTime: this._lastInteractionTime
        });
      } catch (e) {
        console.error('[ProactiveThinking._saveState] Error:', e.message);
      }
    },

    think(userInput = '', context = {}) {
      if (!this._initialized) {
        this._init();
        this._initialized = true;
      }

      if (!this._patternLearner) {
        this._patternLearner = new PatternLearner('patternLearner');
      }

      this._interactionCount++;
      this._lastInteractionTime = Date.now();
      this._context = context;

      this._patternLearner.learn(userInput, context);

      const questions = this.generateQuestions(userInput, context);
      const suggestions = this.generateSuggestions(userInput, context);
      const predictions = this._patternLearner.predict();
      const review = this.maybeReview();
      const insights = this.generateInsights();

      if (userInput && userInput.length > 2) {
        this._patternsLearned++;
        this._lastPatternTime = Date.now();
      }

      if (questions.length > 0 || suggestions.length > 0 || insights.length > 0) {
        console.log('[ProactiveThinking] 💡 主动思考结果:');
        if (questions.length > 0) {
          questions.forEach((q) => console.log(`  ❓ ${q.text}`));
        }
        if (suggestions.length > 0) {
          suggestions.forEach((s) => console.log(`  💡 建议: ${s.name}`));
        }
        if (predictions.topIntent) {
          console.log(`  🔮 预测意图: ${predictions.topIntent} (置信度: ${predictions.nextPossible?.[0]?.confidence?.toFixed(2) || 'N/A'})`);
        }
        if (insights.length > 0) {
          insights.forEach((i) => console.log(`  📊 ${i.text}`));
        }
      }

      this._saveState();

      return { proactive: true, questions, suggestions, predictions, review, insights, interactionCount: this._interactionCount };
    },

    generateQuestions(userInput, _context) {
      const questions = [];
      const predictions = this._patternLearner?.predict() || {};

      if (predictions.nextPossible?.length > 0 && predictions.nextPossible[0].confidence > 0.7) {
        questions.push({ type: 'prediction', text: `你可能想问"${predictions.nextPossible[0].intent}"？` });
      }

      if (this._interactionCount % 10 === 1 && this._interactionCount > 1) {
        questions.push({ type: 'review', text: `已交流${this._interactionCount}次，需要复盘吗？` });
      }

      if (userInput.length > 0 && userInput.length < 10) {
        questions.push({ type: 'clarification', text: '请补充更多细节' });
      }

      return questions;
    },

    generateSuggestions(userInput, _context) {
      const suggestions = [];
      const input = (userInput || '').toLowerCase();
      const predictions = this._patternLearner?.predict() || {};

      if (predictions.nextPossible?.length > 0 && predictions.nextPossible[0].confidence > 0.5) {
        suggestions.push({ type: 'predicted', name: predictions.nextPossible[0].intent });
      }

      const keywords = {
        '代码|写|函数|类|bug': ['TDD', 'test-generation'],
        '学习|研究|分析|理解': ['learning'],
        '安全|审计|漏洞': ['security-audit'],
        '优化|性能|速度': ['performance-optimization'],
        '调试|debug|错误': ['systematic-debugging']
      };

      for (const [pattern, skills] of Object.entries(keywords)) {
        if (new RegExp(pattern).test(input)) {
          skills.forEach((s) => suggestions.push({ type: 'skill', name: s }));
          break;
        }
      }

      return suggestions;
    },

    generateInsights() {
      const insights = [];
      if (this._patternLearner?._intentCount > 5) {
        insights.push({ type: 'progress', text: `已探索${this._patternLearner._intentCount}个领域` });
      }
      return insights;
    },

    maybeReview() {
      return this._interactionCount > 0 && this._interactionCount % 10 === 0
        ? { needed: true, type: 'periodic', text: `已完成${this._interactionCount}次交互` }
        : { needed: false };
    },

    getStatus() {
      try {
        const saved = this._persistence.load('proactive', { count: 0, patternsLearned: 0, topIntent: null, lastTime: 0 });
        let top = saved.topIntent;
        if (this._patternLearner) {
          const live = this._patternLearner.getTopIntent();
          if (live) { top = live; }
        }
        return {
          interactionCount: saved.count || this._interactionCount,
          patternsLearned: saved.patternsLearned || this._patternsLearned,
          topIntent: top || null,
          lastInteraction: saved.lastTime || this._lastInteractionTime
        };
      } catch (e) {
        const live2 = this._patternLearner?.getTopIntent();
        return {
          interactionCount: this._interactionCount,
          patternsLearned: this._patternsLearned,
          topIntent: live2 || null,
          lastInteraction: this._lastInteractionTime
        };
      }
    }
  };

  return ProactiveThinking;
}

module.exports = createProactiveThinking;
