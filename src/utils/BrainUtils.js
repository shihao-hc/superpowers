/**
 * BrainUtils - 纯函数工具集
 * 从 BrainSystem.js 类提取的零依赖纯函数
 */

function calculateConfidence(conclusions) {
  if (!conclusions || conclusions.length === 0) {return 0.5;}
  if (conclusions.length === 1) {return 0.7;}

  const hasReverse = conclusions.some((c) => c.type === 'reverse');
  const uniqueAngles = new Set(conclusions.map((c) => c.angle)).size;

  let confidence = 0.5;
  if (hasReverse) {confidence += 0.15;}
  if (uniqueAngles >= 3) {confidence += 0.2;}
  if (conclusions.length >= 3) {confidence += 0.1;}

  return Math.min(confidence, 0.95);
}

function _shouldSelfCheck(action) {
  const selfCheckKeywords = ['create', 'write', 'edit', 'build', 'implement', 'add', 'modify'];
  return selfCheckKeywords.some((k) => action.toLowerCase().includes(k));
}

function _mayHaveLeftovers(action) {
  const creationKeywords = ['create', 'write', 'add', 'new'];
  return creationKeywords.some((k) => action.toLowerCase().includes(k));
}

function _checkLessonHealth(stats) {
  const check = { check: 'lesson-health', status: 'ok', score: 100, message: '正常', issues: [] };

  if (stats.total === 0) {
    check.status = 'warning';
    check.score = 30;
    check.message = '教训库为空';
    check.issues.push('建议开始积累经验');
  } else if (stats.total > 20 && stats.applied === 0) {
    check.status = 'critical';
    check.score = 10;
    check.message = '教训应用率为0';
    check.issues.push('教训未被使用，需要检查集成');
  } else if (stats.unapplied > stats.total * 0.8) {
    check.status = 'warning';
    check.score = 40;
    check.message = '未应用教训过多';
    check.issues.push('考虑清理或应用低价值教训');
  }

  return check;
}

function _calculateLessonRelevance(context, lesson) {
  const contextLower = context.toLowerCase();
  const lessonLower = (`${lesson.problem} ${lesson.lesson}`).toLowerCase();

  const getKeywords = (text) => {
    return text.split(/\s+/)
      .filter((w) => w.length > 2)
      .filter((w) => !['这个', '那个', '什么', '怎么', '如何'].includes(w));
  };

  const contextWords = getKeywords(contextLower);
  const lessonWords = getKeywords(lessonLower);

  const overlap = contextWords.filter((w) => lessonWords.includes(w)).length;
  const maxLen = Math.max(contextWords.length, lessonWords.length);

  return maxLen > 0 ? overlap / maxLen : 0;
}

function _suggestionToAction(suggestion) {
  const actions = {
    '教训应用率过低': {
      description: '分析教训库内容，将高价值教训标记为优先',
      priority: 'high',
      autoExecutable: true,
      steps: ['遍历教训库', '评估教训价值', '优先显示高价值教训']
    },
    '进化系统无近期学习记录': {
      description: '执行一次自我复盘，记录学习',
      priority: 'high',
      autoExecutable: true,
      steps: ['触发afterDecision复盘', '提取模式', '更新进化系统']
    },
    '教训积累过多但应用率低': {
      description: '检查教训与决策流程集成状态',
      priority: 'medium',
      autoExecutable: true,
      steps: ['检查beforeDecision调用', '验证教训显示', '优化关联算法']
    },
    '元认知不确定性较高': {
      description: '增加信息收集意识',
      priority: 'medium',
      autoExecutable: false,
      steps: ['在决策前增加问题数量', '要求更多上下文']
    },
    '决策频繁但学习记录少': {
      description: '强制触发复盘流程',
      priority: 'medium',
      autoExecutable: true,
      steps: ['调用afterDecision', '提取经验', '更新教训库']
    }
  };

  for (const [key, action] of Object.entries(actions)) {
    if (suggestion.includes(key)) {
      return action;
    }
  }

  return {
    description: suggestion,
    priority: 'low',
    autoExecutable: false,
    steps: ['人工分析', '制定方案', '执行改进']
  };
}

function _generateRecommendations(improvements) {
  const recs = [];

  if (improvements.health.level !== 'excellent') {
    recs.push({
      area: '教训库',
      action: '将更多经验沉淀为教训，并确保在决策时被引用'
    });
  }

  if (improvements.health.metrics.evolution?.score < 0.3) {
    recs.push({
      area: '进化',
      action: '增加任务后的复盘频率，主动提取模式'
    });
  }

  if (improvements.health.metrics.toolUsage?.score < 0.3) {
    recs.push({
      area: '工具使用',
      action: '探索更多工具组合，提升工具利用率'
    });
  }

  return recs;
}

function _identifySelf() {
  return {
    name: 'AI Brain System',
    version: 'v22.1',
    type: 'Autonomous AI Agent',
    core: 'Self-evolving intelligence with五大核心能力',
    purpose: 'Assist and evolve through continuous learning'
  };
}

function _enhanceWithLessons(metaQuestions, lessonSuggestions, _context) {
  if (!lessonSuggestions || lessonSuggestions.length === 0) {
    return metaQuestions.questions;
  }

  const enhanced = [...metaQuestions.questions];

  const lessonReminders = lessonSuggestions.slice(0, 2).map((s, i) => ({
    question: s.lesson,
    hint: s.improvement,
    type: 'lesson-reminder',
    priority: s.priority,
    lessonId: s.lessonId,
    reason: `相关教训#${i + 1}`
  }));

  if (lessonSuggestions[0]?.priority === 'high') {
    enhanced.unshift(...lessonReminders);
  } else {
    enhanced.push(...lessonReminders);
  }

  return enhanced;
}

function crossTaskLearning(tasks) {
  if (!Array.isArray(tasks) || tasks.length < 2) {
    return { message: '需要至少2个任务才能进行跨任务学习' };
  }

  const patterns = {
    common: [],
    sequence: [],
    context: []
  };

  const taskContexts = tasks.map((t) => typeof t === 'string' ? t : t.context || '');
  const taskActions = tasks.map((t) => typeof t === 'string' ? '' : t.action || '');

  const wordCount = {};
  for (const ctx of taskContexts) {
    const words = ctx.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    for (const word of words) {
      wordCount[word] = (wordCount[word] || 0) + 1;
    }
  }

  const commonWords = Object.entries(wordCount)
    .filter(([_, count]) => count >= 2)
    .map(([word]) => word);

  patterns.common = commonWords;

  for (let i = 0; i < taskActions.length - 1; i++) {
    if (taskActions[i] && taskActions[i + 1]) {
      patterns.sequence.push(`${taskActions[i]} → ${taskActions[i + 1]}`);
    }
  }

  if (commonWords.length > 0) {
    const pattern = commonWords.join(', ');
    console.log(`[BrainSystem] 跨任务学习: 发现通用模式 "${pattern}"`);
  }

  return {
    taskCount: tasks.length,
    patterns,
    insight: commonWords.length > 0
      ? `这些任务可能属于同一领域: ${commonWords.slice(0, 3).join(', ')}`
      : '任务之间暂无明显关联'
  };
}

function combinePerspectives(perspectives) {
  const conclusions = [];
  const reasoning = [];

  if (perspectives.normal) {
    for (const [angle, result] of Object.entries(perspectives.normal)) {
      if (result.conclusion) {
        conclusions.push({ type: 'normal', angle, conclusion: result.conclusion });
        reasoning.push({ type: 'normal', angle, reason: result.reasoning });
      }
    }
  }

  if (perspectives.reverse) {
    conclusions.push({ type: 'reverse', angle: 'reverse', conclusion: perspectives.reverse.conclusion });
    reasoning.push({ type: 'reverse', angle: 'reverse', reason: perspectives.reverse.reasoning });
  }

  const confidence = calculateConfidence(conclusions);

  const sortedConclusions = conclusions.sort((a, b) => b.confidence - a.confidence);
  const primary = sortedConclusions[0];
  const alternatives = sortedConclusions.slice(1);

  return {
    conclusion: primary ? primary.conclusion : '需要更多信息',
    confidence,
    reasoning: reasoning.filter((r) => r.type === primary?.type),
    alternatives: alternatives.map((a) => a.conclusion)
  };
}

module.exports = {
  calculateConfidence,
  _shouldSelfCheck,
  _mayHaveLeftovers,
  _checkLessonHealth,
  _calculateLessonRelevance,
  _suggestionToAction,
  _generateRecommendations,
  _identifySelf,
  _enhanceWithLessons,
  crossTaskLearning,
  combinePerspectives
};