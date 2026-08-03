/**
 * UnifiedIntelligence - 统一智能处理器
 * 整合所有模块，提供单一入口
 *
 * Extracted from BrainSystem.js (v22.1)
 */

const DeepIntentAnalyzer = require('./DeepIntentAnalyzer');
const MultiDimensionPredictor = require('./MultiDimensionPredictor');
const EmotionExpress = require('./EmotionExpress');

class UnifiedIntelligence {
  constructor({ proactiveThinking, predictor } = {}) {
    this._initialized = false;
    this._proactiveThinking = proactiveThinking;
    this._predictor = predictor || new MultiDimensionPredictor();
  }

  process(input, context = {}) {
    const intentResult = this._analyzeIntent(input, context);
    const proactiveResult = this._proactiveThink(input, context);
    const predictionResult = this._predict(input, context);
    const emotionResult = this._expressEmotion(input, '');

    return {
      intent: intentResult,
      proactive: proactiveResult,
      prediction: predictionResult,
      emotion: emotionResult,
      suggestions: this._combineSuggestions(intentResult, proactiveResult, predictionResult),
      confidence: this._calculateConfidence(intentResult, predictionResult),
      processed: true,
      timestamp: Date.now()
    };
  }

  _analyzeIntent(input, context) {
    const analyzer = new DeepIntentAnalyzer();
    return analyzer.analyze(input, context);
  }

  _proactiveThink(input, context) {
    if (this._proactiveThinking) {
      this._proactiveThinking.think(input, context);
      return {
        questions: this._proactiveThinking.generateQuestions?.(input, context) || [],
        suggestions: this._proactiveThinking.generateSuggestions?.(input, context) || []
      };
    }
    return { questions: [], suggestions: [] };
  }

  _predict(input, context) {
    return this._predictor.predict(input, context);
  }

  _expressEmotion(input, response) {
    return EmotionExpress.express(input, response);
  }

  _combineSuggestions(intentResult, proactiveResult, predictionResult) {
    const suggestions = new Set();

    if (intentResult.suggestions) {
      intentResult.suggestions.forEach((s) => suggestions.add(s));
    }

    if (proactiveResult.suggestions) {
      proactiveResult.suggestions.forEach((s) => {
        if (typeof s === 'object') { suggestions.add(s.name || s.type); }
        else { suggestions.add(s); }
      });
    }

    if (predictionResult.skill?.skill) {
      suggestions.add(predictionResult.skill.skill);
    }

    return Array.from(suggestions);
  }

  _calculateConfidence(intentResult, predictionResult) {
    return Math.max(
      intentResult.confidence || 0,
      predictionResult.confidence || 0
    );
  }
}

module.exports = UnifiedIntelligence;
