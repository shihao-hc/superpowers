/**
 * LessonTracker - 教训应用追踪
 *
 * 自动自检、教训应用追踪、教训有效性评估、教训历史查询
 */
const BrainUtils = require('./BrainUtils');

class LessonTracker {
  constructor(bs) {
    this.bs = bs;
  }

  _autoSelfReview(context, result, action) {
    const bs = this.bs;
    const checks = [];

    const wasSuccessful = result && (result.success !== false);
    if (wasSuccessful && action && !bs._hasRecentLesson(context)) {
      checks.push({
        check: 'lesson-record',
        status: 'pending',
        suggestion: '是否需要将这次经验记录到教训库？'
      });
    }

    if (action && BrainUtils._shouldSelfCheck(action)) {
      checks.push({
        check: 'self-check',
        status: 'recommended',
        suggestion: '建议运行自检流程验证结果'
      });
    }

    if (action && BrainUtils._mayHaveLeftovers(action)) {
      checks.push({
        check: 'cleanup',
        status: 'recommended',
        suggestion: '检查是否有需要清理的临时文件或空目录'
      });
    }

    if (checks.length > 0) {
      console.log(`[BrainSystem] 自动自检: ${checks.length} 项待处理`);
    }

    return {
      checks,
      hasPendingChecks: checks.length > 0,
      timestamp: Date.now()
    };
  }

  _trackLessonUsage(context, _result, _action) {
    const bs = this.bs;
    const tracking = {
      lessonsUsed: [],
      lessonsApplied: [],
      effectiveness: null,
      timestamp: Date.now()
    };

    const suggestions = bs.lessonLibrary.getSuggestions(context);

    for (const suggestion of suggestions) {
      const lesson = bs.lessonLibrary.get(suggestion.lessonId);
      if (!lesson) {continue;}

      tracking.lessonsUsed.push({
        id: lesson.id,
        lesson: `${lesson.lesson.substring(0, 50)}...`,
        relevance: 'queried',
        wasApplied: lesson._applied
      });

      // 修复：查询≠应用——此前在此无条件 markApplied，导致所有被查询的教训被误标为"已应用"，
      // 教训库很快全部 _applied=true，LessonReminder/提醒机制永久失效（35 条全 applied 即此因）。
      // 此处仅统计"本次使用的未应用教训"，不再自动 markApplied（应用标记应由真正影响回复的路径触发）。
      if (!lesson._applied) {
        tracking.lessonsApplied.push(lesson.id);
      }
    }

    tracking.effectiveness = this._evaluateLessonEffectiveness();

    if (tracking.lessonsUsed.length > 0) {
      console.log(`[BrainSystem] 教训追踪: 查询 ${tracking.lessonsUsed.length} 条, 应用 ${tracking.lessonsApplied.length} 条`);
    }

    return tracking;
  }

  _evaluateLessonEffectiveness() {
    const stats = this.bs.lessonLibrary.getStats();

    const applied = stats.applied;
    const total = stats.total;
    const rate = total > 0 ? Math.round((applied / total) * 100) : 0;

    return {
      totalLessons: total,
      appliedCount: applied,
      unappliedCount: stats.unapplied,
      applicationRate: `${rate}%`,
      health: rate >= 50 ? 'good' : rate >= 30 ? 'fair' : 'needs-attention'
    };
  }

  getLessonHistory(limit = 10) {
    const applied = this.bs.lessonLibrary.search('', {
      type: 'success',
      limit: limit
    }).filter((l) => l._applied);

    return applied.map((l) => ({
      id: l.id,
      lesson: l.lesson,
      appliedAt: l.lastApplied,
      applyCount: l.applyCount
    }));
  }
}

module.exports = LessonTracker;
