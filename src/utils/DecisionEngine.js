/**
 * DecisionEngine - 决策引擎
 *
 * 处理决策前/后的元认知、教训应用追踪、自检触发
 */
const BrainUtils = require('./BrainUtils');

class DecisionEngine {
  constructor(bs) {
    this.bs = bs;
  }

  beforeDecision(context) {
    const bs = this.bs;
    if (!bs.enabled || !bs.config.enableMetaCognition) {
      return { questions: [], selfCheck: { status: 'disabled' } };
    }

    bs.state.decisionCount++;
    bs.state.lastContext = context;
    bs.state.activeThinking = true;

    const metaQuestions = bs.metaCognition.beforeAsk(context);
    const selfCheck = bs.metaCognition.check(context);

    const lessonSuggestions = bs.lessonLibrary.getSuggestions(context);
    const relatedLessons = bs.lessonLibrary.getRelated(context, 3);

    const enhancedQuestions = BrainUtils._enhanceWithLessons(metaQuestions, lessonSuggestions, context);

    const pendingWarnings = lessonSuggestions
      .filter((s) => s.priority === 'high' && !this._isRecentApplied(s.lessonId))
      .map((s) => ({
        type: 'lesson-warning',
        lessonId: s.lessonId,
        message: `相关教训: ${s.lesson}`,
        improvement: s.improvement
      }));

    if (lessonSuggestions.length > 0) {
      console.log(`[BrainSystem] 决策前查询教训库: ${lessonSuggestions.length} 条建议`);
    }

    if (bs.selfLearning && bs.selfLearning.recordIntent) {
      try {
        bs.selfLearning.recordIntent(context, 'brain-decision', true);
      } catch (e) {
        console.warn('[BrainSystem] SelfLearning recordIntent error:', e.message);
      }
    }

    return {
      questions: enhancedQuestions,
      selfCheck,
      context,
      lessonWarnings: pendingWarnings,
      relatedLessons: relatedLessons.map((l) => ({ id: l.id, lesson: l.lesson, applied: l.applied })),
      timestamp: Date.now()
    };
  }

  _isRecentApplied(lessonId) {
    const lesson = this.bs.lessonLibrary.get(lessonId);
    if (!lesson || !lesson.lastApplied) {return false;}

    const hoursSinceApplied = (Date.now() - new Date(lesson.lastApplied).getTime()) / (1000 * 60 * 60);
    return hoursSinceApplied < 24;
  }

  afterDecision(context, result, action = null) {
    const bs = this.bs;
    if (!bs.enabled) {return;}

    bs.state.lastResult = result;
    bs.state.activeThinking = false;

    const reflection = bs.metaCognition.afterReview(context, result);

    if (bs.config.enableAutoEvolution) {
      bs.evolution.learn(context, action, result);
    }

    const autoReview = bs._autoSelfReview(context, result, action);
    const lessonTracking = bs._trackLessonUsage(context, result, action);
    const comprehensiveResult = bs._autoComprehensiveCheck(context, result, action);

    if (bs.selfLearning && bs.selfLearning.recordResponse) {
      try {
        bs.selfLearning.recordResponse(context, result,
          result.success ? 0.8 : 0.4
        );
      } catch (e) {
        console.warn('[BrainSystem] SelfLearning recordResponse error:', e.message);
      }
    }

    return {
      reflection,
      context,
      result,
      autoReview,
      lessonTracking,
      comprehensiveCheck: comprehensiveResult,
      timestamp: Date.now()
    };
  }

  _hasRecentLesson(context) {
    const recent = this.bs.lessonLibrary.search(context, { limit: 1 });
    if (recent.length === 0) {return false;}

    const hoursSince = (Date.now() - new Date(recent[0].date).getTime()) / (1000 * 60 * 60);
    return hoursSince < 2;
  }
}

module.exports = DecisionEngine;
