const {
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
} = require('../../src/utils/BrainUtils');

describe('BrainUtils', () => {
  describe('calculateConfidence', () => {
    test('returns 0.5 for empty/null/undefined input', () => {
      expect(calculateConfidence([])).toBe(0.5);
      expect(calculateConfidence(null)).toBe(0.5);
      expect(calculateConfidence(undefined)).toBe(0.5);
    });

    test('returns 0.7 for single conclusion', () => {
      expect(calculateConfidence([{ type: 'normal', angle: 'a', conclusion: 'x' }])).toBe(0.7);
    });

    test('adds 0.15 when reverse type present', () => {
      const result = calculateConfidence([
        { type: 'normal', angle: 'a', conclusion: 'x' },
        { type: 'reverse', angle: 'b', conclusion: 'y' }
      ]);
      expect(result).toBe(0.65);
    });

    test('adds 0.2 when 3+ unique angles', () => {
      const result = calculateConfidence([
        { type: 'normal', angle: 'a', conclusion: 'x' },
        { type: 'normal', angle: 'b', conclusion: 'y' },
        { type: 'normal', angle: 'c', conclusion: 'z' }
      ]);
      expect(result).toBeCloseTo(0.8, 5);
    });

    test('adds 0.1 when 3+ conclusions', () => {
      const result = calculateConfidence([
        { type: 'normal', angle: 'a', conclusion: 'x' },
        { type: 'normal', angle: 'b', conclusion: 'y' },
        { type: 'normal', angle: 'c', conclusion: 'z' }
      ]);
      expect(result).toBeCloseTo(0.8, 5);
    });

    test('caps at 0.95 even with all bonuses', () => {
      const result = calculateConfidence([
        { type: 'normal', angle: 'a', conclusion: 'x' },
        { type: 'normal', angle: 'b', conclusion: 'y' },
        { type: 'normal', angle: 'c', conclusion: 'z' },
        { type: 'reverse', angle: 'd', conclusion: 'w' }
      ]);
      expect(result).toBeCloseTo(0.95, 5);
      expect(result).toBeLessThanOrEqual(0.95);
    });
  });

  describe('_shouldSelfCheck', () => {
    test('returns true for actions containing create', () => {
      expect(_shouldSelfCheck('create file')).toBe(true);
    });

    test('returns true for actions containing write', () => {
      expect(_shouldSelfCheck('write code')).toBe(true);
    });

    test('returns true for actions containing edit', () => {
      expect(_shouldSelfCheck('edit config')).toBe(true);
    });

    test('returns true for actions containing build', () => {
      expect(_shouldSelfCheck('build project')).toBe(true);
    });

    test('returns true for actions containing implement', () => {
      expect(_shouldSelfCheck('implement feature')).toBe(true);
    });

    test('returns true for actions containing add', () => {
      expect(_shouldSelfCheck('add module')).toBe(true);
    });

    test('returns true for actions containing modify', () => {
      expect(_shouldSelfCheck('modify function')).toBe(true);
    });

    test('is case insensitive', () => {
      expect(_shouldSelfCheck('CREATE FILE')).toBe(true);
      expect(_shouldSelfCheck('Edit Code')).toBe(true);
      expect(_shouldSelfCheck('BUILD')).toBe(true);
    });

    test('returns false for non-matching actions', () => {
      expect(_shouldSelfCheck('read file')).toBe(false);
      expect(_shouldSelfCheck('delete entry')).toBe(false);
      expect(_shouldSelfCheck('')).toBe(false);
    });
  });

  describe('_mayHaveLeftovers', () => {
    test('returns true for create keyword', () => {
      expect(_mayHaveLeftovers('create something')).toBe(true);
    });

    test('returns true for write keyword', () => {
      expect(_mayHaveLeftovers('write code')).toBe(true);
    });

    test('returns true for add keyword', () => {
      expect(_mayHaveLeftovers('add feature')).toBe(true);
    });

    test('returns true for new keyword', () => {
      expect(_mayHaveLeftovers('new project')).toBe(true);
    });

    test('returns false for non-creation keywords', () => {
      expect(_mayHaveLeftovers('delete file')).toBe(false);
      expect(_mayHaveLeftovers('read docs')).toBe(false);
      expect(_mayHaveLeftovers('')).toBe(false);
    });

    test('is case insensitive', () => {
      expect(_mayHaveLeftovers('ADD')).toBe(true);
      expect(_mayHaveLeftovers('New')).toBe(true);
    });
  });

  describe('_checkLessonHealth', () => {
    test('returns warning with score 30 when total is 0', () => {
      const result = _checkLessonHealth({ total: 0, applied: 0, unapplied: 0 });
      expect(result.status).toBe('warning');
      expect(result.score).toBe(30);
      expect(result.message).toBe('教训库为空');
      expect(result.issues).toContain('建议开始积累经验');
    });

    test('returns critical with score 10 when total > 20 and applied is 0', () => {
      const result = _checkLessonHealth({ total: 25, applied: 0, unapplied: 25 });
      expect(result.status).toBe('critical');
      expect(result.score).toBe(10);
      expect(result.message).toBe('教训应用率为0');
      expect(result.issues).toContain('教训未被使用，需要检查集成');
    });

    test('returns warning when unapplied > 80% of total', () => {
      const result = _checkLessonHealth({ total: 10, applied: 1, unapplied: 9 });
      expect(result.status).toBe('warning');
      expect(result.score).toBe(40);
      expect(result.message).toBe('未应用教训过多');
      expect(result.issues).toContain('考虑清理或应用低价值教训');
    });

    test('returns ok with score 100 for healthy stats', () => {
      const result = _checkLessonHealth({ total: 10, applied: 8, unapplied: 2 });
      expect(result.status).toBe('ok');
      expect(result.score).toBe(100);
      expect(result.message).toBe('正常');
      expect(result.issues).toEqual([]);
    });

    test('has check field set to lesson-health', () => {
      const result = _checkLessonHealth({ total: 0, applied: 0, unapplied: 0 });
      expect(result.check).toBe('lesson-health');
    });
  });

  describe('_calculateLessonRelevance', () => {
    test('returns 0 for empty context', () => {
      const lesson = { problem: 'bug fix', lesson: 'always validate' };
      expect(_calculateLessonRelevance('', lesson)).toBe(0);
    });

    test('returns positive ratio for overlapping keywords', () => {
      const lesson = { problem: 'validation error', lesson: 'validate input before processing' };
      const result = _calculateLessonRelevance('need to validate input', lesson);
      expect(result).toBeGreaterThan(0);
    });

    test('returns 0 for no overlap', () => {
      const lesson = { problem: 'database connection', lesson: 'use connection pooling' };
      expect(_calculateLessonRelevance('hello world test', lesson)).toBe(0);
    });

    test('filters Chinese stop words from keywords', () => {
      const lesson = { problem: '如何修复这个问题', lesson: '检查这个错误' };
      const result = _calculateLessonRelevance('那个问题如何解决', lesson);
      expect(typeof result).toBe('number');
    });

    test('filters words shorter than 3 characters', () => {
      const lesson = { problem: 'a b c', lesson: 'x y z' };
      expect(_calculateLessonRelevance('a b c', lesson)).toBe(0);
    });
  });

  describe('_suggestionToAction', () => {
    test('maps 教训应用率过低 to high priority action', () => {
      const result = _suggestionToAction('教训应用率过低');
      expect(result.priority).toBe('high');
      expect(result.autoExecutable).toBe(true);
      expect(result.steps).toBeInstanceOf(Array);
    });

    test('maps 进化系统无近期学习记录 to high priority action', () => {
      const result = _suggestionToAction('进化系统无近期学习记录');
      expect(result.priority).toBe('high');
      expect(result.autoExecutable).toBe(true);
    });

    test('maps 教训积累过多但应用率低 to medium priority', () => {
      const result = _suggestionToAction('教训积累过多但应用率低');
      expect(result.priority).toBe('medium');
      expect(result.autoExecutable).toBe(true);
    });

    test('maps 元认知不确定性较高 to medium priority non-auto', () => {
      const result = _suggestionToAction('元认知不确定性较高');
      expect(result.priority).toBe('medium');
      expect(result.autoExecutable).toBe(false);
    });

    test('maps 决策频繁但学习记录少 to medium priority', () => {
      const result = _suggestionToAction('决策频繁但学习记录少');
      expect(result.priority).toBe('medium');
      expect(result.autoExecutable).toBe(true);
    });

    test('falls back to low priority for unknown suggestions', () => {
      const result = _suggestionToAction('some random unknown suggestion');
      expect(result.priority).toBe('low');
      expect(result.autoExecutable).toBe(false);
      expect(result.description).toBe('some random unknown suggestion');
      expect(result.steps).toEqual(['人工分析', '制定方案', '执行改进']);
    });
  });

  describe('_generateRecommendations', () => {
    test('adds lesson rec when health level is not excellent', () => {
      const improvements = {
        health: { level: 'good', metrics: { evolution: { score: 0.5 }, toolUsage: { score: 0.5 } } }
      };
      const result = _generateRecommendations(improvements);
      expect(result.some(r => r.area === '教训库')).toBe(true);
    });

    test('adds evolution rec when evolution score < 0.3', () => {
      const improvements = {
        health: { level: 'excellent', metrics: { evolution: { score: 0.1 }, toolUsage: { score: 0.5 } } }
      };
      const result = _generateRecommendations(improvements);
      expect(result.some(r => r.area === '进化')).toBe(true);
    });

    test('adds tool usage rec when toolUsage score < 0.3', () => {
      const improvements = {
        health: { level: 'excellent', metrics: { evolution: { score: 0.5 }, toolUsage: { score: 0.1 } } }
      };
      const result = _generateRecommendations(improvements);
      expect(result.some(r => r.area === '工具使用')).toBe(true);
    });

    test('returns all three recommendations when all conditions met', () => {
      const improvements = {
        health: { level: 'poor', metrics: { evolution: { score: 0.1 }, toolUsage: { score: 0.1 } } }
      };
      const result = _generateRecommendations(improvements);
      expect(result.length).toBe(3);
    });

    test('returns empty array when all metrics excellent', () => {
      const improvements = {
        health: { level: 'excellent', metrics: { evolution: { score: 0.9 }, toolUsage: { score: 0.9 } } }
      };
      expect(_generateRecommendations(improvements)).toEqual([]);
    });
  });

  describe('_identifySelf', () => {
    test('returns identity object with expected fields', () => {
      const identity = _identifySelf();
      expect(identity).toHaveProperty('name', 'AI Brain System');
      expect(identity).toHaveProperty('version', 'v22.1');
      expect(identity).toHaveProperty('type', 'Autonomous AI Agent');
      expect(identity).toHaveProperty('core');
      expect(identity).toHaveProperty('purpose');
    });

    test('returns object with all string values', () => {
      const identity = _identifySelf();
      Object.values(identity).forEach(v => {
        expect(typeof v).toBe('string');
      });
    });
  });

  describe('_enhanceWithLessons', () => {
    const metaQuestions = { questions: ['基础问题1', '基础问题2'] };

    test('returns original questions when no lesson suggestions', () => {
      expect(_enhanceWithLessons(metaQuestions, null, 'ctx')).toEqual(metaQuestions.questions);
      expect(_enhanceWithLessons(metaQuestions, [], 'ctx')).toEqual(metaQuestions.questions);
    });

    test('prepends high priority lesson reminders', () => {
      const suggestions = [
        { lesson: '教训A', improvement: '改进A', priority: 'high', lessonId: '1' },
        { lesson: '教训B', improvement: '改进B', priority: 'high', lessonId: '2' }
      ];
      const result = _enhanceWithLessons(metaQuestions, suggestions, 'ctx');
      expect(result.length).toBe(metaQuestions.questions.length + 2);
      expect(result[0].type).toBe('lesson-reminder');
      expect(result[0].lessonId).toBe('1');
    });

    test('appends non-high priority lesson reminders', () => {
      const suggestions = [
        { lesson: '教训A', improvement: '改进A', priority: 'low', lessonId: '1' }
      ];
      const result = _enhanceWithLessons(metaQuestions, suggestions, 'ctx');
      expect(result.length).toBe(metaQuestions.questions.length + 1);
      expect(result[result.length - 1].type).toBe('lesson-reminder');
    });

    test('slices to at most 2 lesson reminders', () => {
      const suggestions = [
        { lesson: 'A', improvement: 'a', priority: 'low', lessonId: '1' },
        { lesson: 'B', improvement: 'b', priority: 'low', lessonId: '2' },
        { lesson: 'C', improvement: 'c', priority: 'low', lessonId: '3' }
      ];
      const result = _enhanceWithLessons(metaQuestions, suggestions, 'ctx');
      const reminders = result.filter(r => r.type === 'lesson-reminder');
      expect(reminders.length).toBe(2);
    });
  });

  describe('crossTaskLearning', () => {
    test('returns message when fewer than 2 tasks', () => {
      const result = crossTaskLearning(['task1']);
      expect(result).toEqual({ message: '需要至少2个任务才能进行跨任务学习' });
    });

    test('returns same for empty array', () => {
      expect(crossTaskLearning([])).toEqual({ message: '需要至少2个任务才能进行跨任务学习' });
    });

    test('returns same for non-array input', () => {
      expect(crossTaskLearning(null)).toEqual({ message: '需要至少2个任务才能进行跨任务学习' });
    });

    test('finds common words across string tasks', () => {
      const tasks = ['fix the login bug', 'fix the payment bug'];
      const result = crossTaskLearning(tasks);
      expect(result.patterns.common).toContain('the');
      expect(result.insight).toContain('这些任务可能属于同一领域');
    });

    test('finds sequence patterns from object tasks', () => {
      const tasks = [
        { context: 'debug', action: 'analyze' },
        { context: 'debug', action: 'fix' }
      ];
      const result = crossTaskLearning(tasks);
      expect(result.patterns.sequence).toContain('analyze → fix');
    });

    test('returns no-association insight when no common words', () => {
      const tasks = ['abcdef', 'xyz123'];
      const result = crossTaskLearning(tasks);
      expect(result.insight).toBe('任务之间暂无明显关联');
    });

    test('properly structures return object', () => {
      const tasks = ['task one two', 'task three four'];
      const result = crossTaskLearning(tasks);
      expect(result).toHaveProperty('taskCount', 2);
      expect(result).toHaveProperty('patterns');
      expect(result).toHaveProperty('patterns.common');
      expect(result).toHaveProperty('patterns.sequence');
      expect(result).toHaveProperty('patterns.context');
      expect(result).toHaveProperty('insight');
    });
  });

  describe('combinePerspectives', () => {
    test('combines normal perspectives', () => {
      const perspectives = {
        normal: {
          angle1: { conclusion: '结论A', reasoning: '推理A' },
          angle2: { conclusion: '结论B', reasoning: '推理B' }
        }
      };
      const result = combinePerspectives(perspectives);
      expect(result.conclusion).toBe('结论A');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.alternatives).toContain('结论B');
    });

    test('includes reverse perspective', () => {
      const perspectives = {
        normal: {
          angle1: { conclusion: '结论A', reasoning: '推理A' }
        },
        reverse: { conclusion: '反方结论', reasoning: '反方推理' }
      };
      const result = combinePerspectives(perspectives);
      expect(result.conclusion).toBeTruthy();
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('returns needs more info when no perspectives', () => {
      const result = combinePerspectives({});
      expect(result.conclusion).toBe('需要更多信息');
      expect(result.confidence).toBe(0.5);
    });

    test('ignores normal perspectives without conclusion', () => {
      const perspectives = {
        normal: {
          angle1: { conclusion: null, reasoning: '推理' }
        }
      };
      const result = combinePerspectives(perspectives);
      expect(result.conclusion).toBe('需要更多信息');
    });

    test('returns alternatives array', () => {
      const perspectives = {
        normal: {
          angle1: { conclusion: '主要结论', reasoning: '主要推理' },
          angle2: { conclusion: '备选结论', reasoning: '备选推理' },
          angle3: { conclusion: '第三结论', reasoning: '第三推理' }
        }
      };
      const result = combinePerspectives(perspectives);
      expect(result.alternatives.length).toBe(2);
    });
  });
});
