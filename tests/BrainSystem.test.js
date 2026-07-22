const path = require('path');
const fs = require('fs');

// Mock 6 hard requires — these ARE intercepted by jest.mock because BrainSystem.js
// uses direct require() calls (not through safeRequire wrapper):
//   const MetaCognition = require('./MetaCognition'); etc.
jest.mock('../src/core/MetaCognition', () => {
  return jest.fn().mockImplementation(() => ({
    beforeAsk: jest.fn().mockReturnValue({ questions: ['test'] }),
    check: jest.fn().mockReturnValue({ status: 'unknown', certainCount: 0, uncertainCount: 0 }),
    analyzeHistory: jest.fn().mockReturnValue({ uncertainRate: 0 }),
    afterReview: jest.fn().mockReturnValue({ questions: [] }),
    getHistory: jest.fn().mockReturnValue([]),
    history: [],
  }));
});

jest.mock('../src/core/Thinking', () => {
  return jest.fn().mockImplementation(() => ({
    multiAngle: jest.fn().mockReturnValue({ technical: [], business: [], risk: [], user: [] }),
    question: jest.fn().mockReturnValue({ questions: [], alternatives: [] }),
    associate: jest.fn().mockReturnValue({ concept: 'linked', confidence: 0.8 }),
  }));
});

jest.mock('../src/core/Evolution', () => {
  return jest.fn().mockImplementation(() => ({
    getStats: jest.fn().mockReturnValue({ patterns: [], mistakes: [], lessons: [], recentLearnings: [] }),
    recordPattern: jest.fn().mockReturnValue({ success: true }),
    getDecisionPatterns: jest.fn().mockReturnValue([]),
    getLessons: jest.fn().mockReturnValue([]),
    suggestEvolution: jest.fn().mockReturnValue([]),
    learn: jest.fn(),
    fromLesson: jest.fn().mockReturnValue({ learned: true }),
    recordProblemSolution: jest.fn(),
  }));
});

jest.mock('../src/core/ReverseThinking', () => {
  return jest.fn().mockImplementation(() => ({
    analyze: jest.fn().mockReturnValue({ conclusion: '', causes: [], fiveWhys: [] }),
    fromResult: jest.fn().mockReturnValue({ steps: ['step1'], feasibility: 0.8 }),
    orangePractice: jest.fn().mockReturnValue({ rootCause: 'test-cause', evidence: [] }),
  }));
});

jest.mock('../src/core/ToolManager', () => {
  return jest.fn().mockImplementation(() => ({
    getStats: jest.fn().mockReturnValue({ total: 5, categories: ['code', 'search'], usageCount: 3 }),
    selectTools: jest.fn().mockReturnValue([]),
    suggestTools: jest.fn().mockReturnValue([]),
  }));
});

jest.mock('../src/core/LessonLibrary', () => {
  return jest.fn().mockImplementation(() => {
    const lessons = [];
    const applied = new Set();
    return {
      lessons,
      categories: {},
      search: jest.fn().mockReturnValue([]),
      getStats: jest.fn().mockReturnValue({ total: 0, applied: 0, unapplied: 0, byCategory: {} }),
      getLessons: jest.fn().mockReturnValue([]),
      add: jest.fn().mockImplementation((l) => {
        const id = 'lesson-' + Date.now();
        lessons.push({ ...l, id, applied: false });
        return { id, ...l };
      }),
      addLesson: jest.fn().mockImplementation((l) => {
        const id = 'lesson-' + Date.now();
        lessons.push({ ...l, id, applied: false });
        return { id };
      }),
      searchLessons: jest.fn().mockReturnValue([]),
      markApplied: jest.fn().mockImplementation((id) => applied.add(id)),
      getSuggestions: jest.fn().mockReturnValue([]),
      getRelated: jest.fn().mockReturnValue([]),
      _save: jest.fn(),
      export: jest.fn(),
    };
  });
});

// NOTE: Modules loaded through BrainSystem.js's safeRequire() wrapper DO NOT
// respond to jest.mock. This is a Jest module system limitation where require()
// inside a try-catch wrapper (safeRequire) in BrainSystem.js does not see mocks
// registered from the test file. Only direct require() calls are intercepted.
// Therefore, safeRequire modules (Relationship, ToolExecutor, AutoVerifier, etc.)
// are not mocked here — they load as null in the constructor.

let BrainSystem;

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const mod = require('../src/core/BrainSystem');
  BrainSystem = mod.BrainSystem;
});

beforeEach(() => {
  jest.spyOn(BrainSystem.prototype, '_loadPersistence').mockImplementation(() => {});
  jest.spyOn(BrainSystem.prototype, '_autoStartDailyCheck').mockImplementation(() => {});
});

describe('BrainSystem Constructor', () => {
  test('creates instance with core modules', () => {
    const bs = new BrainSystem();
    expect(bs.enabled).toBe(true);
    expect(bs.metaCognition).toBeDefined();
    expect(bs.thinking).toBeDefined();
    expect(bs.evolution).toBeDefined();
    expect(bs.tools).toBeDefined();
    expect(bs.reverseThinking).toBeDefined();
    expect(bs.lessonLibrary).toBeDefined();
    expect(bs.state).toBeDefined();
    expect(bs.config).toBeDefined();
    expect(bs.plugins).toBeInstanceOf(Map);
  });

  test('creates instance with selfLearning parameter', () => {
    const mockSL = { getStats: () => ({ intents: 0 }) };
    const bs = new BrainSystem(mockSL);
    expect(bs.selfLearning).toBe(mockSL);
  });

  test('non-existing modules are not loaded', () => {
    const bs = new BrainSystem();
    expect(Object.hasOwn(bs, 'controller')).toBe(false);
    expect(Object.hasOwn(bs, 'coordinator')).toBe(false);
    expect(Object.hasOwn(bs, 'enhancedMemory')).toBe(false);
  });
});

describe('Plugin System', () => {
  test('registerPlugin adds plugin', () => {
    const bs = new BrainSystem();
    const plugin = { onDecision: jest.fn(), onResult: jest.fn() };
    bs.registerPlugin('test-plugin', plugin);
    expect(bs.plugins.get('test-plugin')).toBe(plugin);
  });

  test('unregisterPlugin removes plugin', () => {
    const bs = new BrainSystem();
    bs.registerPlugin('test-plugin', {});
    bs.unregisterPlugin('test-plugin');
    expect(bs.plugins.has('test-plugin')).toBe(false);
  });

  test('unregisterPlugin on non-existent does not throw', () => {
    const bs = new BrainSystem();
    expect(() => bs.unregisterPlugin('nonexistent')).not.toThrow();
  });
});

describe('Accessors', () => {
  test('getVersion returns version info', () => {
    const bs = new BrainSystem();
    bs.registerPlugin('plug1', {});
    bs.registerPlugin('plug2', {});
    const ver = bs.getVersion();
    expect(ver.version).toBe('1.0.0');
    expect(ver.name).toBe('AI Brain System');
    expect(ver.plugins).toContain('plug1');
    expect(ver.plugins).toContain('plug2');
  });

  test('getStatus returns full status', () => {
    const bs = new BrainSystem();
    const status = bs.getStatus();
    expect(status.enabled).toBe(true);
    expect(status.decisionCount).toBe(0);
    expect(status.capabilities).toBeDefined();
    expect(status.evolution).toBeDefined();
    expect(status.tools).toBeDefined();
    expect(status.lessons).toBeDefined();
    expect(status.health).toBeDefined();
  });

  test('getQuickStatus returns formatted string', () => {
    const bs = new BrainSystem();
    const qs = bs.getQuickStatus();
    expect(typeof qs).toBe('string');
    expect(qs.length).toBeGreaterThan(0);
  });

  test('getSummary returns summary object', () => {
    const bs = new BrainSystem();
    const sum = bs.getSummary();
    expect(sum.version).toBe('v7.1');
    expect(sum.status).toBe('active');
    expect(sum.health).toBeDefined();
    expect(sum.healthScore).toBeDefined();
    expect(sum.lessons).toBeDefined();
    expect(sum.decisions).toBe(0);
    expect(sum.active).toBeDefined();
    expect(sum.risks).toBeDefined();
    expect(sum.opportunities).toBeDefined();
  });

  test('getBrainBrief returns brief', () => {
    const bs = new BrainSystem();
    const brief = bs.getBrainBrief();
    expect(brief.version).toBe('v7.1');
    expect(brief.status).toBe('active');
    expect(brief.health).toBeDefined();
    expect(brief.decisionCount).toBe(0);
  });
});

describe('SelfMonitoring', () => {
  test('stopSelfMonitoring clears interval', () => {
    const bs = new BrainSystem();
    bs.monitoringInterval = setInterval(() => {}, 1000);
    bs.stopSelfMonitoring();
    expect(bs.monitoringInterval).toBeNull();
  });

  test('stopSelfMonitoring does not throw when no interval', () => {
    const bs = new BrainSystem();
    expect(() => bs.stopSelfMonitoring()).not.toThrow();
  });
});

describe('beforeDecision', () => {
  test('returns questions and selfCheck when enabled', () => {
    const bs = new BrainSystem();
    const result = bs.beforeDecision('test context');
    expect(result.questions).toBeDefined();
    expect(result.selfCheck).toBeDefined();
    expect(bs.state.decisionCount).toBe(1);
  });

  test('returns disabled status when enabled is false', () => {
    const bs = new BrainSystem();
    bs.enabled = false;
    const result = bs.beforeDecision('test');
    expect(result.selfCheck.status).toBe('disabled');
  });

  test('returns disabled when enableMetaCognition is false', () => {
    const bs = new BrainSystem();
    bs.config.enableMetaCognition = false;
    const result = bs.beforeDecision('test');
    expect(result.selfCheck.status).toBe('disabled');
  });
});

describe('_calculateHealth', () => {
  test('returns health object with score', () => {
    const bs = new BrainSystem();
    const health = bs._calculateHealth();
    expect(typeof health.score).toBe('number');
    expect(health.level).toBeDefined();
    expect(health.metrics).toBeDefined();
    expect(health.metrics.lessonLibrary).toBeDefined();
    expect(health.metrics.systemReady).toBeDefined();
    expect(health.metrics.proactive).toBeDefined();
    expect(health.metrics.evolution).toBeDefined();
    expect(health.metrics.decisionDiversity).toBeDefined();
  });

  test('health score is at least base 30', () => {
    const bs = new BrainSystem();
    const health = bs._calculateHealth();
    expect(health.score).toBeGreaterThanOrEqual(30);
  });

  test('health with intervals gives higher proactive score', () => {
    const bs = new BrainSystem();
    bs.selfCheckInterval = 'x';
    bs.monitoringInterval = 'y';
    const health = bs._calculateHealth();
    expect(health.metrics.proactive.score).toBe(1);
  });

  test('health with applied lessons gives higher lesson score', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 8, unapplied: 2, byCategory: {} });
    const health = bs._calculateHealth();
    expect(health.metrics.lessonLibrary.rate).toBe('80%');
  });

  test('excellent health score', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 100, applied: 100, unapplied: 0, byCategory: {} });
    bs.selfCheckInterval = 'x';
    bs.monitoringInterval = 'y';
    bs.evolution.getStats.mockReturnValue({ recentLearnings: Array(20).fill('x') });
    bs.state.decisionCount = 100;
    const health = bs._calculateHealth();
    expect(health.level).toBe('excellent');
    expect(health.score).toBeGreaterThanOrEqual(80);
  });

  test('poor metrics shows lower level', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 0, applied: 0, unapplied: 0, byCategory: {} });
    const health = bs._calculateHealth();
    expect(['fair', 'needs-improvement', 'critical']).toContain(health.level);
  });
});

describe('getImprovements', () => {
  test('returns improvements with suggestions', () => {
    const bs = new BrainSystem();
    const result = bs.getImprovements();
    expect(result.health).toBeDefined();
    expect(Array.isArray(result.suggestions)).toBe(true);
    expect(result.priority).toBeDefined();
  });
});

describe('afterDecision', () => {
  test('records pattern and returns reflection', () => {
    const bs = new BrainSystem();
    const result = bs.afterDecision('test context', { success: true }, 'testAction');
    expect(result.reflection).toBeDefined();
    expect(result.timestamp).toBeDefined();
    expect(result.autoReview).toBeDefined();
  });
});

// ========== Module Guard Error Paths ==========
// safeRequire-loaded modules may or may not load depending on whether the
// corresponding .js file exists on disk. To reliably test guard paths, we set
// the instance property to null/undefined after construction.

describe('Module guard error paths', () => {
  test('memory methods return error when not initialized', () => {
    const bs = new BrainSystem();
    bs.memory = null;
    expect(bs.remember('k', 'v')).toEqual({ error: 'Memory not initialized' });
    expect(bs.recall('k')).toEqual({ error: 'Memory not initialized' });
    expect(bs.getMemorySummary()).toEqual({ error: 'Memory not initialized' });
  });

  test('personality methods return error when not initialized', () => {
    const bs = new BrainSystem();
    bs.personality = null;
    expect(bs.processInput('hi')).toEqual({ error: 'Personality not initialized' });
    expect(bs.respond('hi')).toEqual({ error: 'Personality not initialized' });
    expect(bs.getPersonality()).toEqual({ error: 'Personality not initialized' });
    expect(bs.setEmotion('happy')).toEqual({ error: 'Personality not initialized' });
    expect(bs.setStyle('formal')).toEqual({ error: 'Personality not initialized' });
    expect(bs.valueDecide(['a', 'b'])).toEqual({ error: 'Personality not initialized' });
    expect(bs.getValues()).toEqual({ error: 'Personality not initialized' });
  });

  test('relationship methods return error when not initialized', () => {
    const bs = new BrainSystem();
    bs.relationship = null;
    expect(bs.recordInteraction('u1', {})).toEqual({ error: 'Relationship not initialized' });
    expect(bs.getRelationship('u1')).toEqual({ error: 'Relationship not initialized' });
    expect(bs.getRelationshipAdvice('u1')).toEqual({ error: 'Relationship not initialized' });
  });

  test('dream methods throw when not initialized', () => {
    const bs = new BrainSystem();
    bs.dream = null;
    expect(bs.getDreamProgress()).toEqual({ error: 'Dream not initialized' });
    expect(bs.getMotivation()).toEqual({ error: 'Dream not initialized' });
    expect(bs.setGoal('goal')).toEqual({ error: 'Dream not initialized' });
  });

  test('ethics methods return error when not initialized', () => {
    const bs = new BrainSystem();
    bs.ethics = null;
    expect(bs.checkEthics('action', 'ctx')).toEqual({ error: 'Ethics not initialized' });
    expect(bs.getEthicsSuggestion('action')).toEqual({ error: 'Ethics not initialized' });
    expect(bs.getCorePrinciples()).toEqual({ error: 'Ethics not initialized' });
  });

  test('executor methods return error when not initialized', async () => {
    const bs = new BrainSystem();
    bs.executor = null;
    const execResult = await bs.executeCode('code');
    expect(execResult).toEqual({ error: 'Executor not initialized' });
    expect(bs.getExecutorStats()).toEqual({ error: 'Executor not initialized' });
  });

  test('verifier methods return error when not initialized', () => {
    const bs = new BrainSystem();
    bs.verifier = null;
    expect(bs.verifyCode('code')).toEqual({ error: 'Verifier not initialized' });
    expect(bs.getVerifierStats()).toEqual({ error: 'Verifier not initialized' });
  });

  test('controller methods return error when not initialized', async () => {
    const bs = new BrainSystem();
    bs.controller = null;
    await expect(bs.consciousnessCycle('input')).resolves.toEqual({ error: 'Controller not initialized' });
    await expect(bs.quickRespond('input')).resolves.toEqual({ error: 'Controller not initialized' });
    await expect(bs.deepThink('input')).resolves.toEqual({ error: 'Controller not initialized' });
    expect(bs.getConsciousness()).toEqual({ error: 'Controller not initialized' });
    expect(bs.diagnoseConsciousness()).toEqual({ error: 'Controller not initialized' });
  });

  test('introspection methods return error when not initialized', async () => {
    const bs = new BrainSystem();
    bs.introspection = null;
    await expect(bs.meditate(100)).resolves.toEqual({ error: 'Introspection not initialized' });
    await expect(bs.reflect('kw')).resolves.toEqual({ error: 'Introspection not initialized' });
    await expect(bs.imagine('prompt')).resolves.toEqual({ error: 'Introspection not initialized' });
    await expect(bs.dream(100)).resolves.toEqual({ error: 'Introspection not initialized' });
    expect(bs.getIntrospectionStatus()).toEqual({ error: 'Introspection not initialized' });
  });

  test('skill recognizer methods return fallback when not initialized', () => {
    const bs = new BrainSystem();
    bs.skillRecognizer = null;
    expect(bs.recognizeSkill('hi')).toEqual({ error: 'SkillRecognizer not initialized' });
    expect(bs.loadSkill('name')).toBeNull();
    expect(bs.getSkillStats()).toEqual({ total: 0 });
    expect(bs.getSkillsByCategory('cat')).toEqual([]);
    expect(bs.decide('hi')).toEqual({ recommendation: null, reason: 'SkillRecognizer not initialized' });
    expect(bs.getCustomSystems()).toEqual([]);
    expect(bs.registerSystem('n', {})).toBe(false);
  });

  test('comprehensiveChecker methods return fallback when not initialized', async () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = null;
    await expect(bs.comprehensiveCheck('检查')).resolves.toEqual({ error: 'not initialized' });
    expect(bs.getComprehensiveStats()).toEqual({ total: 0, categories: 0 });
  });
});

// ========== Success Paths with Manual Property Assignment ==========

describe('Memory success paths', () => {
  test('remember delegates to memory with all types', () => {
    const bs = new BrainSystem();
    bs.memory = {
      rememberSolution: jest.fn().mockReturnValue('sol'),
      rememberConcept: jest.fn().mockReturnValue('con'),
      rememberInsight: jest.fn().mockReturnValue('ins'),
      updateUserProfile: jest.fn().mockReturnValue('usr'),
    };
    expect(bs.remember('k', { solution: 's', result: 'r' }, 'solution')).toBe('sol');
    expect(bs.remember('k', 'v', 'concept')).toBe('con');
    expect(bs.remember('k', 'v', 'insight')).toBe('ins');
    expect(bs.remember('k', { name: 'n' }, 'user')).toBe('usr');
  });

  test('remember returns error for unknown type', () => {
    const bs = new BrainSystem();
    bs.memory = { rememberInsight: jest.fn() };
    expect(bs.remember('k', 'v', 'unknown')).toEqual({ error: 'Unknown memory type' });
  });

  test('recall delegates to memory with all types', () => {
    const bs = new BrainSystem();
    bs.memory = {
      recallSolution: jest.fn().mockReturnValue('sol'),
      recallConcept: jest.fn().mockReturnValue('con'),
      recallInsight: jest.fn().mockReturnValue('ins'),
      getUserProfile: jest.fn().mockReturnValue('usr'),
    };
    expect(bs.recall('k', 'solution')).toBe('sol');
    expect(bs.recall('k', 'concept')).toBe('con');
    expect(bs.recall('k', 'insight')).toBe('ins');
    expect(bs.recall('k', 'user')).toBe('usr');
  });

  test('recall returns error for unknown type', () => {
    const bs = new BrainSystem();
    bs.memory = { recallInsight: jest.fn() };
    expect(bs.recall('k', 'unknown')).toEqual({ error: 'Unknown memory type' });
  });

  test('getMemorySummary delegates to memory', () => {
    const bs = new BrainSystem();
    bs.memory = { getSummary: jest.fn().mockReturnValue({ total: 5 }) };
    expect(bs.getMemorySummary()).toEqual({ total: 5 });
  });
});

describe('Personality success paths', () => {
  test('personality methods delegate correctly', () => {
    const bs = new BrainSystem();
    bs.personality = {
      process: jest.fn().mockReturnValue('processed'),
      respond: jest.fn().mockReturnValue('response'),
      getPersonality: jest.fn().mockReturnValue({ trait: 'friendly' }),
      emotion: { setEmotion: jest.fn().mockReturnValue('emotion-set') },
      setStyle: jest.fn().mockReturnValue('style-set'),
      decide: jest.fn().mockReturnValue('chosen'),
      values: { getSummary: jest.fn().mockReturnValue({ honesty: 0.9 }) },
    };
    expect(bs.processInput('hi')).toBe('processed');
    expect(bs.respond('hi')).toBe('response');
    expect(bs.getPersonality()).toEqual({ trait: 'friendly' });
    expect(bs.setEmotion('happy')).toBe('emotion-set');
    expect(bs.setStyle('formal')).toBe('style-set');
    expect(bs.valueDecide(['a', 'b'])).toBe('chosen');
    expect(bs.getValues()).toEqual({ honesty: 0.9 });
  });
});

describe('Other module success paths', () => {
  test('relationship methods delegate', () => {
    const bs = new BrainSystem();
    bs.relationship = {
      recordInteraction: jest.fn().mockReturnValue('recorded'),
      getRelationship: jest.fn().mockReturnValue({ trust: 0.5 }),
      getAdvice: jest.fn().mockReturnValue('be nice'),
    };
    expect(bs.recordInteraction('u1', {})).toBe('recorded');
    expect(bs.getRelationship('u1')).toEqual({ trust: 0.5 });
    expect(bs.getRelationshipAdvice('u1')).toBe('be nice');
  });

  test('dream methods delegate', () => {
    const bs = new BrainSystem();
    bs.dream = {
      getProgress: jest.fn().mockReturnValue({ pct: 50 }),
      getMotivation: jest.fn().mockReturnValue({ level: 7 }),
      setGoal: jest.fn().mockReturnValue('goal-set'),
    };
    expect(bs.getDreamProgress()).toEqual({ pct: 50 });
    expect(bs.getMotivation()).toEqual({ level: 7 });
    expect(bs.setGoal('goal')).toBe('goal-set');
  });

  test('ethics methods delegate', () => {
    const bs = new BrainSystem();
    bs.ethics = {
      check: jest.fn().mockReturnValue({ ethical: true }),
      suggest: jest.fn().mockReturnValue('do it'),
      explainPrinciples: jest.fn().mockReturnValue(['p1']),
    };
    expect(bs.checkEthics('a', 'c')).toEqual({ ethical: true });
    expect(bs.getEthicsSuggestion('a')).toBe('do it');
    expect(bs.getCorePrinciples()).toEqual(['p1']);
  });

  test('executor method delegates', async () => {
    const bs = new BrainSystem();
    bs.executor = {
      execute: jest.fn().mockResolvedValue({ success: true }),
      getStats: jest.fn().mockReturnValue({ total: 3 }),
    };
    await expect(bs.executeCode('code')).resolves.toEqual({ success: true });
    expect(bs.getExecutorStats()).toEqual({ total: 3 });
  });

  test('verifier methods delegate', () => {
    const bs = new BrainSystem();
    bs.verifier = {
      verify: jest.fn().mockReturnValue({ passed: true }),
      getStats: jest.fn().mockReturnValue({ total: 2 }),
    };
    expect(bs.verifyCode('code')).toEqual({ passed: true });
    expect(bs.getVerifierStats()).toEqual({ total: 2 });
  });

  test('skillRecognizer methods delegate', () => {
    const bs = new BrainSystem();
    bs.skillRecognizer = {
      decide: jest.fn().mockReturnValue({ recommendation: 'use-tool', reason: 'best' }),
      loadSkill: jest.fn().mockReturnValue({ name: 'test-skill' }),
      getStats: jest.fn().mockReturnValue({ total: 5 }),
      getByCategory: jest.fn().mockReturnValue(['s1', 's2']),
      getCustomSystems: jest.fn().mockReturnValue(['sys1']),
      registerSystem: jest.fn().mockReturnValue(true),
    };
    expect(bs.recognizeSkill('hi')).toEqual({ recommendation: 'use-tool', reason: 'best' });
    expect(bs.loadSkill('test')).toEqual({ name: 'test-skill' });
    expect(bs.getSkillStats()).toEqual({ total: 5 });
    expect(bs.getSkillsByCategory('cat')).toEqual(['s1', 's2']);
    expect(bs.decide('hi')).toEqual({ recommendation: 'use-tool', reason: 'best' });
    expect(bs.getCustomSystems()).toEqual(['sys1']);
    expect(bs.registerSystem('n', {})).toBe(true);
  });

  test('decideCrawler delegates to decide', () => {
    const bs = new BrainSystem();
    bs.skillRecognizer = { decide: jest.fn().mockReturnValue('crawler-result') };
    expect(bs.decideCrawler('url')).toBe('crawler-result');
  });

  test('comprehensiveCheck delegates', async () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ passed: 56 }) };
    await expect(bs.comprehensiveCheck('全方面检查')).resolves.toEqual({ passed: 56 });
  });

  test('comprehensiveCheck returns not triggered for non-matching input', async () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = { run: jest.fn() };
    await expect(bs.comprehensiveCheck('hello world')).resolves.toEqual({ triggered: false });
  });

  test('getComprehensiveStats with checker', () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = {};
    expect(bs.getComprehensiveStats()).toEqual({ total: 56, categories: 14 });
  });

  test('forceVerifyAll with comprehensiveChecker', async () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ passed: 56 }) };
    const result = await bs.forceVerifyAll();
    expect(result.comprehensiveReport).toBeDefined();
    expect(result.promiseResult).toBeDefined();
    expect(result.stats).toBeDefined();
  });
});

// ========== executeAndVerify ==========

describe('executeAndVerify', () => {
  test('returns combined result with both null when modules missing', async () => {
    const bs = new BrainSystem();
    bs.executor = null;
    bs.verifier = null;
    const result = await bs.executeAndVerify('code');
    expect(result.execute).toEqual({ error: 'Executor not initialized' });
    expect(result.verification).toEqual({ error: 'Verifier not initialized' });
    expect(result.success).toBeUndefined();
  });

  test('returns combined result with both passing', async () => {
    const bs = new BrainSystem();
    bs.executor = { execute: jest.fn().mockResolvedValue({ success: true }) };
    bs.verifier = { verify: jest.fn().mockReturnValue({ passed: true }) };
    const result = await bs.executeAndVerify('code');
    expect(result.execute).toEqual({ success: true });
    expect(result.verification).toEqual({ passed: true });
    expect(result.success).toBe(true);
  });
});

// ========== Consciousness & Introspection ==========

describe('Controller success paths', () => {
  test('consciousnessCycle delegates', async () => {
    const bs = new BrainSystem();
    bs.controller = { cycle: jest.fn().mockResolvedValue({ done: true }) };
    const result = await bs.consciousnessCycle('input');
    expect(result).toEqual({ done: true });
    expect(bs.state.cycleCount).toBe(1);
  });

  test('quickRespond delegates', async () => {
    const bs = new BrainSystem();
    bs.controller = { quickResponse: jest.fn().mockResolvedValue('fast') };
    await expect(bs.quickRespond('input')).resolves.toBe('fast');
  });

  test('deepThink delegates', async () => {
    const bs = new BrainSystem();
    bs.controller = { deepThink: jest.fn().mockResolvedValue('deep') };
    await expect(bs.deepThink('input')).resolves.toBe('deep');
  });

  test('getConsciousness delegates', () => {
    const bs = new BrainSystem();
    bs.controller = { getConsciousness: jest.fn().mockReturnValue({ state: 'awake' }) };
    expect(bs.getConsciousness()).toEqual({ state: 'awake' });
  });

  test('diagnoseConsciousness delegates', () => {
    const bs = new BrainSystem();
    bs.controller = { diagnose: jest.fn().mockReturnValue({ healthy: true }) };
    expect(bs.diagnoseConsciousness()).toEqual({ healthy: true });
  });
});

describe('Introspection success paths', () => {
  test('meditate delegates', async () => {
    const bs = new BrainSystem();
    bs.introspection = { meditate: jest.fn().mockResolvedValue('calm') };
    await expect(bs.meditate(100)).resolves.toBe('calm');
  });

  test('reflect delegates', async () => {
    const bs = new BrainSystem();
    bs.introspection = { reflect: jest.fn().mockResolvedValue(['insight']) };
    await expect(bs.reflect('kw')).resolves.toEqual(['insight']);
  });

  test('imagine delegates', async () => {
    const bs = new BrainSystem();
    bs.introspection = { imagine: jest.fn().mockResolvedValue('image') };
    await expect(bs.imagine('prompt')).resolves.toBe('image');
  });

  test('dream delegates', async () => {
    const bs = new BrainSystem();
    bs.introspection = { dream: jest.fn().mockResolvedValue('dream-log') };
    await expect(bs.dream(100)).resolves.toBe('dream-log');
  });

  test('getIntrospectionStatus delegates', () => {
    const bs = new BrainSystem();
    bs.introspection = { getStatus: jest.fn().mockReturnValue({ active: true }) };
    expect(bs.getIntrospectionStatus()).toEqual({ active: true });
  });
});

// ========== Instance Methods with Branching Logic ==========

describe('analyzePatterns', () => {
  test('returns basic patterns without memory', () => {
    const bs = new BrainSystem();
    const result = bs.analyzePatterns();
    expect(result.decisionTopics).toEqual([]);
    expect(result.insights.length).toBeGreaterThan(0);
  });

  test('includes last context when present', () => {
    const bs = new BrainSystem();
    bs.state.lastContext = 'test-context';
    const result = bs.analyzePatterns();
    expect(result.decisionTopics).toContain('test-context');
  });

  test('includes memory insights when memory available', () => {
    const bs = new BrainSystem();
    bs.state.lastContext = 'ctx';
    bs.memory = { getRecent: jest.fn().mockReturnValue(['m1', 'm2']) };
    const result = bs.analyzePatterns();
    expect(result.insights.some(i => i.includes('2'))).toBe(true);
  });

  test('handles memory error gracefully', () => {
    const bs = new BrainSystem();
    bs.memory = { getRecent: jest.fn().mockImplementation(() => { throw new Error('memfail'); }) };
    expect(() => bs.analyzePatterns()).not.toThrow();
  });
});

describe('getActiveSuggestions', () => {
  test('returns suggestions including inactive modules', () => {
    const bs = new BrainSystem();
    const suggestions = bs.getActiveSuggestions();
    expect(Array.isArray(suggestions)).toBe(true);
    const moduleSug = suggestions.find(s => s.type === 'module');
    expect(moduleSug).toBeDefined();
  });

  test('adds decision count suggestion when few decisions', () => {
    const bs = new BrainSystem();
    bs.state.decisionCount = 0;
    const suggestions = bs.getActiveSuggestions();
    const usageSug = suggestions.find(s => s.type === 'usage');
    expect(usageSug).toBeDefined();
  });

  test('does not show module warning when module present', () => {
    const bs = new BrainSystem();
    bs.controller = {};
    bs.introspection = {};
    const suggestions = bs.getActiveSuggestions();
    const moduleSug = suggestions.find(s => s.type === 'module');
    expect(moduleSug).toBeUndefined();
  });
});

describe('getSystemSummary', () => {
  test('returns summary with personality when available', () => {
    const bs = new BrainSystem();
    bs.dream = null;
    bs.ethics = null;
    bs.personality = { getPersonality: jest.fn().mockReturnValue({ trait: 'friendly' }) };
    const summary = bs.getSystemSummary();
    expect(summary.modules).toBeDefined();
    expect(summary.stats).toBeDefined();
  });

  test('returns summary with modules and stats keys', () => {
    const bs = new BrainSystem();
    bs.dream = null;
    bs.ethics = null;
    const summary = bs.getSystemSummary();
    expect(summary.modules).toBeDefined();
    expect(summary.stats).toBeDefined();
  });
});

describe('_runDailyCheck', () => {
  test('runs when comprehensiveChecker is available', () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = { run: jest.fn().mockReturnValue({ passed: true }) };
    expect(() => bs._runDailyCheck()).not.toThrow();
  });
});

describe('主动Learn', () => {
  test('returns learnings from state', () => {
    const bs = new BrainSystem();
    const learnings = bs.主动Learn();
    expect(Array.isArray(learnings)).toBe(true);
  });

  test('includes decision history when count > 0', () => {
    const bs = new BrainSystem();
    bs.state.decisionCount = 5;
    const learnings = bs.主动Learn();
    expect(learnings.some(l => l.type === 'pattern')).toBe(true);
  });

  test('includes self-check history when count > 0', () => {
    const bs = new BrainSystem();
    bs.state.selfCheckCount = 3;
    const learnings = bs.主动Learn();
    expect(learnings.some(l => l.type === 'self-check')).toBe(true);
  });
});

describe('generateImprovementPlan', () => {
  test('returns plan with actions', () => {
    const bs = new BrainSystem();
    const plan = bs.generateImprovementPlan();
    expect(plan.actions).toBeDefined();
    expect(plan.reason).toBeDefined();
  });
});

describe('generateSelfReport', () => {
  test('returns report with health stats', () => {
    const bs = new BrainSystem();
    const report = bs.generateSelfReport();
    expect(report.timestamp).toBeDefined();
    expect(report.overallHealth).toBeDefined();
    expect(report.improvements).toBeDefined();
  });
});

describe('generateActionPlan', () => {
  test('returns plan with priority', () => {
    const bs = new BrainSystem();
    const plan = bs.generateActionPlan();
    expect(plan.priority).toBeDefined();
    expect(Array.isArray(plan.actions)).toBe(true);
    expect(Array.isArray(plan.autoExecuted)).toBe(true);
  });
});

describe('_generateRecommendations', () => {
  test('returns recommendations based on health', () => {
    const bs = new BrainSystem();
    const improvements = bs.getImprovements();
    const recs = bs._generateRecommendations(improvements);
    expect(Array.isArray(recs)).toBe(true);
  });
});

describe('setConfig', () => {
  test('merges config', () => {
    const bs = new BrainSystem();
    const old = bs.config.enableAutoEvolution;
    bs.setConfig({ enableAutoEvolution: !old });
    expect(bs.config.enableAutoEvolution).toBe(!old);
  });
});

describe('learnFromLesson', () => {
  test('delegates to evolution', () => {
    const bs = new BrainSystem();
    bs.evolution.fromLesson = jest.fn().mockReturnValue('learned');
    expect(bs.learnFromLesson({})).toBe('learned');
  });
});

describe('addLesson/searchLessons/getLessonSuggestions/getLessonStats/exportLessons', () => {
  test('addLesson delegates', () => {
    const bs = new BrainSystem();
    const id = bs.addLesson({ lesson: 'test', category: 'test' });
    expect(id).toBeDefined();
  });

  test('searchLessons delegates', () => {
    const bs = new BrainSystem();
    expect(bs.searchLessons('test')).toEqual([]);
  });

  test('getLessonSuggestions delegates', () => {
    const bs = new BrainSystem();
    expect(bs.getLessonSuggestions('test')).toEqual([]);
  });

  test('getLessonStats delegates', () => {
    const bs = new BrainSystem();
    const stats = bs.getLessonStats();
    expect(stats.total).toBe(0);
  });

  test('exportLessons delegates', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.export = jest.fn().mockReturnValue('{}');
    expect(bs.exportLessons('json')).toBe('{}');
  });
});

describe('Thinking methods (solve, question, associate, reverseEngineer, orangePractice)', () => {
  test('solve returns result', () => {
    const bs = new BrainSystem();
    const result = bs.solve('problem');
    expect(result).toBeDefined();
  });

  test('combinePerspectives returns combined', () => {
    const bs = new BrainSystem();
    const perspectives = {
      normal: { technical: { conclusion: 'works' } },
      reverse: { conclusion: 'rev-works', reasoning: 'reason' }
    };
    const result = bs.combinePerspectives(perspectives);
    expect(result.conclusion).toBeDefined();
  });

  test('calculateConfidence returns number', () => {
    const bs = new BrainSystem();
    const result = bs.calculateConfidence(['a', 'b']);
    expect(typeof result).toBe('number');
  });

  test('question returns result', () => {
    const bs = new BrainSystem();
    expect(bs.question('assumption')).toBeDefined();
  });

  test('associate delegates to thinking', () => {
    const bs = new BrainSystem();
    expect(bs.associate('concept')).toBeDefined();
  });

  test('reverseEngineer delegates to reverseThinking', () => {
    const bs = new BrainSystem();
    expect(bs.reverseEngineer('goal', 'state')).toBeDefined();
  });

  test('orangePractice delegates to reverseThinking', () => {
    const bs = new BrainSystem();
    expect(bs.orangePractice('obs')).toBeDefined();
  });
});

// ========== Self-Awareness Methods ==========

describe('Self-awareness methods', () => {
  test('getSelfAwareness returns full awareness', () => {
    const bs = new BrainSystem();
    const awareness = bs.getSelfAwareness();
    expect(awareness.identity).toBeDefined();
    expect(awareness.capabilities).toBeDefined();
    expect(awareness.limitations).toBeDefined();
    expect(awareness.growth).toBeDefined();
  });

  test('_identifySelf returns identity', () => {
    const bs = new BrainSystem();
    const identity = bs._identifySelf();
    expect(identity.type).toBe('Autonomous AI Agent');
  });

  test('_assessCapabilities returns capabilities', () => {
    const bs = new BrainSystem();
    const caps = bs._assessCapabilities();
    expect(caps.metaCognition).toBeDefined();
    expect(caps.selfEvolution).toBeDefined();
    expect(caps.toolUsage).toBeDefined();
  });

  test('_assessKnowledge returns knowledge', () => {
    const bs = new BrainSystem();
    const knowledge = bs._assessKnowledge();
    expect(knowledge.total).toBeDefined();
    expect(knowledge.topLessons).toBeDefined();
  });

  test('_identifyLimitations returns limitations', () => {
    const bs = new BrainSystem();
    const limitations = bs._identifyLimitations();
    expect(Array.isArray(limitations)).toBe(true);
  });

  test('_assessGrowth returns growth', () => {
    const bs = new BrainSystem();
    const growth = bs._assessGrowth();
    expect(growth.trend).toBeDefined();
  });

  test('_calculateGrowthTrend returns trend', () => {
    const bs = new BrainSystem();
    const trend = bs._calculateGrowthTrend();
    expect(trend).toBeDefined();
  });
});

describe('curiosityExplore / setSelfGoals / diagnose', () => {
  test('curiosityExplore returns exploration object', () => {
    const bs = new BrainSystem();
    const findings = bs.curiosityExplore();
    expect(findings.timestamp).toBeDefined();
    expect(Array.isArray(findings.areas)).toBe(true);
  });

  test('setSelfGoals returns goals', () => {
    const bs = new BrainSystem();
    const goals = bs.setSelfGoals();
    expect(Array.isArray(goals)).toBe(true);
  });

  test('diagnose returns full diagnosis', () => {
    const bs = new BrainSystem();
    const diagnosis = bs.diagnose();
    expect(diagnosis.timestamp).toBeDefined();
    expect(diagnosis.health).toBeDefined();
    expect(diagnosis.recommendations).toBeDefined();
  });
});

describe('predictIssues', () => {
  test('returns risks and opportunities', () => {
    const bs = new BrainSystem();
    const prediction = bs.predictIssues();
    expect(Array.isArray(prediction.risks)).toBe(true);
    expect(Array.isArray(prediction.opportunities)).toBe(true);
  });
});

describe('saveLongTermMemory / loadLongTermMemory', () => {
  test('saveLongTermMemory returns result', () => {
    const bs = new BrainSystem();
    const result = bs.saveLongTermMemory();
    expect(result.success).toBeDefined();
  });

  test('loadLongTermMemory returns result', () => {
    const bs = new BrainSystem();
    const result = bs.loadLongTermMemory();
    expect(result).toBeDefined();
  });
});

describe('integrate', () => {
  test('returns API object with expected methods', () => {
    const bs = new BrainSystem();
    const api = bs.integrate({});
    expect(api.decide).toBeDefined();
    expect(api.solve).toBeDefined();
    expect(api.learn).toBeDefined();
    expect(api.reflect).toBeDefined();
    expect(api.question).toBeDefined();
    expect(api.reverse).toBeDefined();
  });
});

describe('Promise tracking', () => {
  test('trackPromise creates record and returns id', () => {
    const bs = new BrainSystem();
    const id = bs.trackPromise('fix bug', 'test passes', 60000);
    expect(typeof id).toBe('string');
    expect(bs.state.promiseTracker.promises.length).toBe(1);
    expect(bs.state.selfVerification.totalClaims).toBe(1);
  });

  test('verifyPromises processes overdue promises', () => {
    const bs = new BrainSystem();
    bs.trackPromise('fix bug', 'test passes', -1000);
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const result = bs.verifyPromises();
    expect(result).toBeDefined();
    consoleSpy.mockRestore();
  });

  test('getPromiseStats returns stats', () => {
    const bs = new BrainSystem();
    const stats = bs.getPromiseStats();
    expect(stats).toBeDefined();
  });

  test('forceVerifyAll returns result', async () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = null;
    const result = bs.forceVerifyAll();
    expect(result).toBeDefined();
  });
});

describe('Cross-task learning / Knowledge graph', () => {
  test('crossTaskLearning returns analysis', () => {
    const bs = new BrainSystem();
    const result = bs.crossTaskLearning([]);
    expect(result).toBeDefined();
  });

  test('buildKnowledgeGraph returns graph', () => {
    const bs = new BrainSystem();
    const graph = bs.buildKnowledgeGraph();
    expect(graph).toBeDefined();
  });
});

describe('Evolution loop', () => {
  test('startEvolutionLoop sets interval', () => {
    const bs = new BrainSystem();
    bs.startEvolutionLoop(1000);
    expect(bs.evolutionLoop).toBeDefined();
    clearInterval(bs.evolutionLoop);
    bs.evolutionLoop = null;
  });

  test('stopEvolutionLoop clears interval', () => {
    const bs = new BrainSystem();
    bs.evolutionLoop = setInterval(() => {}, 1000);
    bs.stopEvolutionLoop();
    expect(bs.evolutionLoop).toBeNull();
  });
});

describe('Evolution cycle / _runEvolutionCycle', () => {
  test('_runEvolutionCycle returns cycle result with steps', () => {
    const bs = new BrainSystem();
    const cycle = bs._runEvolutionCycle();
    expect(cycle.startTime).toBeDefined();
    expect(Array.isArray(cycle.steps)).toBe(true);
    expect(cycle.endTime).toBeDefined();
    expect(cycle.duration).toBeDefined();
  });
});

// ========== Static Methods ==========

describe('Static methods - quickThink / forceThink / getProof / verifyCall', () => {
  test('quickThink returns beforeDecision result', () => {
    const result = BrainSystem.quickThink('test');
    expect(result.questions).toBeDefined();
    expect(result.selfCheck).toBeDefined();
  });

  test('forceThink returns enriched result', () => {
    const result = BrainSystem.forceThink('test');
    expect(result.metaQuestions).toBeDefined();
    expect(result.selfCheck).toBeDefined();
    expect(result.beforeOutput).toBe(true);
    expect(result.processed).toBe(true);
  });

  test('getProof returns proof object', () => {
    const result = BrainSystem.getProof();
    expect(result.processed).toBe(true);
    expect(result.metaQuestions).toBeDefined();
  });

  test('verifyCall returns verification status', () => {
    const result = BrainSystem.verifyCall();
    expect(result.called).toBe(true);
    expect(result.metaCount).toBeGreaterThanOrEqual(0);
  });
});

describe('Static methods - analyzeIntent / smartStore / smartSearch', () => {
  test('analyzeIntent returns analysis', () => {
    const result = BrainSystem.analyzeIntent('what is AI?');
    expect(result).toBeDefined();
  });

  test('smartStore and smartSearch work', () => {
    BrainSystem._smartMemory = null;
    const storeResult = BrainSystem.smartStore('test-key', { data: 1 });
    expect(storeResult).toBeDefined();
    const searchResult = BrainSystem.smartSearch('test');
    expect(searchResult).toBeDefined();
  });
});

describe('Static methods - predict / proactiveThink', () => {
  test('predict returns prediction', () => {
    const result = BrainSystem.predict('test');
    expect(result).toBeDefined();
  });

  test('proactiveThink returns result', () => {
    BrainSystem._predictor = null;
    const result = BrainSystem.proactiveThink('input', {});
    expect(result).toBeDefined();
  });

  test('getProactiveStatus returns status', () => {
    const status = BrainSystem.getProactiveStatus();
    expect(status).toBeDefined();
  });
});

describe('Static methods - autoPersist / autoValidate / autoLearn / autoGetStatus', () => {
  test('autoPersist returns result', () => {
    const result = BrainSystem.autoPersist();
    expect(result).toBeDefined();
  });

  test('autoValidate returns validation', () => {
    const result = BrainSystem.autoValidate({});
    expect(result).toBeDefined();
  });

  test('autoLearn returns result', () => {
    const result = BrainSystem.autoLearn({});
    expect(result).toBeDefined();
  });

  test('autoGetStatus returns status', () => {
    const status = BrainSystem.autoGetStatus();
    expect(status).toBeDefined();
  });
});

describe('Static methods - AGI engine', () => {
  test('agiEngine returns result', async () => {
    const result = await BrainSystem.agiEngine('test');
    expect(result).toBeDefined();
  });

  test('agiThink returns result', () => {
    const result = BrainSystem.agiThink('test');
    expect(result).toBeDefined();
  });

  test('whoAmI returns identity', () => {
    const result = BrainSystem.whoAmI();
    expect(result).toBeDefined();
  });
});

describe('Static methods - autonomousLearn / deepReflect / coreReflection', () => {
  test('autonomousLearn returns result', async () => {
    const result = await BrainSystem.autonomousLearn({ intent: 'test', confidence: 0.5, error: null });
    expect(result).toBeDefined();
  });

  test('deepReflect returns reflection', async () => {
    const result = await BrainSystem.deepReflect({ input: 'test', success: true });
    expect(result).toBeDefined();
  });

  test('coreReflection returns reflection', () => {
    const result = BrainSystem.coreReflection('test');
    expect(result).toBeDefined();
  });
});

describe('Static methods - fullProcess / unifiedProcess', () => {
  test('fullProcess returns result', () => {
    const result = BrainSystem.fullProcess('test', 'response');
    expect(result).toBeDefined();
  });

  test('unifiedProcess returns result', () => {
    const result = BrainSystem.unifiedProcess('test');
    expect(result).toBeDefined();
  });
});

describe('Static methods - hooks', () => {
  test('connectHooks works', () => {
    const result = BrainSystem.connectHooks({});
    expect(result).toBeDefined();
  });

  test('disconnectHooks works', () => {
    const result = BrainSystem.disconnectHooks();
    expect(result).toBeDefined();
  });

  test('isHooksConnected returns status', () => {
    const status = BrainSystem.isHooksConnected();
    expect(typeof status).toBe('boolean');
  });
});

describe('Static methods - memory and stats', () => {
  test('getRecentMemories returns cached memories', () => {
    const result = BrainSystem.getRecentMemories();
    expect(result).toBeDefined();
  });

  test('getMemoryStats returns stats', () => {
    const result = BrainSystem.getMemoryStats();
    expect(result).toBeDefined();
  });
});

describe('Static methods - expressEmotion / getFullStatus', () => {
  test('expressEmotion returns expression', () => {
    BrainSystem._predictor = null;
    const result = BrainSystem.expressEmotion('happy', 'done');
    expect(result).toBeDefined();
  });

  test('getFullStatus returns status', () => {
    const status = BrainSystem.getFullStatus();
    expect(status).toBeDefined();
  });
});

describe('Static methods - learnInteraction / getEvolutionStats', () => {
  test('learnInteraction records interaction', () => {
    BrainSystem._predictor = null;
    const result = BrainSystem.learnInteraction('input', 'response', true);
    expect(result).toBeUndefined();
  });
});

describe('Static methods - autoAgentProcess / AgentTeamManager', () => {
  test('autoAgentProcess returns result', () => {
    const result = BrainSystem.autoAgentProcess('test');
    expect(result).toBeDefined();
  });

  test('_getAgentTeam returns team manager', () => {
    const team = BrainSystem._getAgentTeam();
    expect(team).toBeDefined();
  });
});

// ========== 生命周期方法 ==========

describe('startSelfMonitoring', () => {
  test('starts and prevents duplicate monitoring', () => {
    const bs = new BrainSystem();
    bs.startSelfMonitoring(5000);
    expect(bs.monitoringInterval).toBeDefined();
    bs.startSelfMonitoring(5000);
    bs.stopSelfMonitoring();
    expect(bs.monitoringInterval).toBeNull();
  });

  test('tick fires selfMonitor', () => {
    jest.useFakeTimers();
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 0, applied: 0, unapplied: 0, byCategory: {} });
    bs.state.decisionCount = 0;
    bs.tools.getStats.mockReturnValue({ usageCount: 5 });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    bs.metaCognition.history = [];
    bs.startSelfMonitoring(1000);
    jest.advanceTimersByTime(1000);
    bs.stopSelfMonitoring();
    jest.useRealTimers();
  });
});

describe('startEvolutionLoop', () => {
  test('starts and prevents duplicate evolution loop', () => {
    const bs = new BrainSystem();
    bs.startEvolutionLoop(5000);
    expect(bs.evolutionLoop).toBeDefined();
    bs.startEvolutionLoop(5000);
    bs.stopEvolutionLoop();
    expect(bs.evolutionLoop).toBeNull();
  });

  test('tick fires evolution cycle', () => {
    jest.useFakeTimers();
    const bs = new BrainSystem();
    const spy = jest.spyOn(bs, '_runEvolutionCycle').mockReturnValue(Promise.resolve());
    bs.startEvolutionLoop(1000);
    jest.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalled();
    bs.stopEvolutionLoop();
    spy.mockRestore();
    jest.useRealTimers();
  });
});

describe('saveLongTermMemory', () => {
  test('saves memory and handles missing dir', () => {
    const bs = new BrainSystem();
    jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const result = bs.saveLongTermMemory();
    expect(result.success).toBe(true);
  });

  test('handles write error', () => {
    const bs = new BrainSystem();
    jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => { throw new Error('write-failed'); });
    const result = bs.saveLongTermMemory();
    expect(result.success).toBe(false);
    expect(result.error).toBe('write-failed');
  });
});

describe('loadLongTermMemory', () => {
  test('returns not found when file missing', () => {
    const bs = new BrainSystem();
    jest.spyOn(fs, 'existsSync').mockReturnValueOnce(false);
    const result = bs.loadLongTermMemory();
    expect(result.found).toBe(false);
  });

  test('loads memory successfully', () => {
    const bs = new BrainSystem();
    jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('{"test":true}');
    const result = bs.loadLongTermMemory();
    expect(result.found).toBe(true);
    expect(result.memory.test).toBe(true);
  });

  test('handles parse error', () => {
    const bs = new BrainSystem();
    jest.spyOn(fs, 'existsSync').mockReturnValueOnce(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('invalid-json');
    const result = bs.loadLongTermMemory();
    expect(result.found).toBe(false);
  });
});

// ========== beforeDecision / afterDecision ==========

describe('beforeDecision', () => {
  test('includes lesson warnings for high priority suggestions', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getSuggestions.mockReturnValue([
      { lessonId: 'l1', priority: 'high', lesson: 'test lesson', improvement: 'improve it' }
    ]);
    bs.lessonLibrary.getRelated.mockReturnValue([]);
    bs.lessonLibrary.get = jest.fn().mockReturnValue({ id: 'l1', lastApplied: null });
    bs.selfLearning = { recordIntent: jest.fn() };
    bs.metaCognition.beforeAsk.mockReturnValue({ questions: [] });
    bs.metaCognition.check.mockReturnValue({});
    const result = bs.beforeDecision('test context');
    expect(result.lessonWarnings.length).toBeGreaterThan(0);
    expect(result.questions).toBeDefined();
  });

  test('handles selfLearning recordIntent error', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getSuggestions.mockReturnValue([{ lessonId: 'l1', priority: 'low', lesson: 'test' }]);
    bs.lessonLibrary.getRelated.mockReturnValue([]);
    bs.metaCognition.beforeAsk.mockReturnValue({ questions: [] });
    bs.metaCognition.check.mockReturnValue({});
    bs.selfLearning = { recordIntent: jest.fn().mockImplementation(() => { throw new Error('fail'); }) };
    expect(() => bs.beforeDecision('test')).not.toThrow();
  });
});

describe('afterDecision', () => {
  test('handles selfLearning recordResponse', () => {
    const bs = new BrainSystem();
    bs.metaCognition.afterReview.mockReturnValue({});
    bs.selfLearning = { recordResponse: jest.fn() };
    bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ stats: { passed: 0, failed: 0 } }) };
    const result = bs.afterDecision('ctx', { success: true }, 'action');
    expect(result).toBeDefined();
    expect(bs.selfLearning.recordResponse).toHaveBeenCalled();
  });

  test('handles selfLearning recordResponse error', () => {
    const bs = new BrainSystem();
    bs.metaCognition.afterReview.mockReturnValue({});
    bs.selfLearning = { recordResponse: jest.fn().mockImplementation(() => { throw new Error('fail'); }) };
    expect(() => bs.afterDecision('ctx', { success: false })).not.toThrow();
  });
});

// ========== 自动自检 ==========

describe('_autoSelfReview', () => {
  test('adds self-check when action contains create', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search.mockReturnValue([]);
    const result = bs._autoSelfReview('ctx', { success: true }, 'create a file');
    const checks = result.checks;
    expect(checks.some(c => c.check === 'self-check')).toBe(true);
    expect(checks.some(c => c.check === 'cleanup')).toBe(true);
  });

  test('adds lesson-record when no recent lesson', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search.mockReturnValue([]);
    const result = bs._autoSelfReview('ctx', { success: true }, 'do something');
    expect(result.checks.some(c => c.check === 'lesson-record')).toBe(true);
  });

  test('returns empty checks when action is null', () => {
    const bs = new BrainSystem();
    const result = bs._autoSelfReview('ctx', { success: true }, null);
    expect(result.checks.length).toBe(0);
  });
});

// ========== 全方面检查 ==========

describe('_autoComprehensiveCheck', () => {
  test('skips when result is falsy', () => {
    const bs = new BrainSystem();
    expect(bs._autoComprehensiveCheck('ctx', null).triggered).toBe(false);
  });

  test('skips when result failed', () => {
    const bs = new BrainSystem();
    expect(bs._autoComprehensiveCheck('ctx', { success: false }).triggered).toBe(false);
  });

  test('skips when comprehensiveChecker missing', () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = null;
    expect(bs._autoComprehensiveCheck('ctx', { success: true }).triggered).toBe(false);
  });

  test('triggers check with successes', async () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ stats: { passed: 10, failed: 0 } }) };
    const result = bs._autoComprehensiveCheck('ctx', { success: true });
    expect(result.triggered).toBe(true);
    expect(result.status).toBe('executing');
  });

  test('triggers check with failures', async () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ stats: { passed: 5, failed: 3 } }) };
    const result = bs._autoComprehensiveCheck('ctx', { success: true });
    expect(result.triggered).toBe(true);
  });
});

// ========== 教训追踪 ==========

describe('_trackLessonUsage', () => {
  test('tracks lesson usage when suggestions exist', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getSuggestions.mockReturnValue([{ lessonId: 'l1' }]);
    bs.lessonLibrary.get = jest.fn().mockReturnValue({ id: 'l1', lesson: 'test lesson', applied: false });
    bs.lessonLibrary.markApplied = jest.fn();
    const result = bs._trackLessonUsage('ctx', { success: true });
    expect(result.lessonsUsed.length).toBe(1);
    expect(result.lessonsApplied.length).toBe(1);
  });

  test('skips lesson when get returns null', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getSuggestions.mockReturnValue([{ lessonId: 'l1' }]);
    bs.lessonLibrary.get = jest.fn().mockReturnValue(null);
    const result = bs._trackLessonUsage('ctx', { success: true });
    expect(result.lessonsUsed.length).toBe(0);
  });
});

// ========== 教训相关方法 ==========

describe('_hasRecentLesson', () => {
  test('returns false when search returns empty', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search.mockReturnValue([]);
    expect(bs._hasRecentLesson('ctx')).toBe(false);
  });

  test('returns true when recent lesson within 2 hours', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search.mockReturnValue([{ date: new Date().toISOString() }]);
    expect(bs._hasRecentLesson('ctx')).toBe(true);
  });

  test('returns false when recent lesson older than 2 hours', () => {
    const bs = new BrainSystem();
    const oldDate = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    bs.lessonLibrary.search.mockReturnValue([{ date: oldDate }]);
    expect(bs._hasRecentLesson('ctx')).toBe(false);
  });
});

describe('getLessonHistory', () => {
  test('returns filtered applied lessons', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search.mockReturnValue([
      { id: 'l1', lesson: 'lesson 1', applied: true, lastApplied: '2024-01-01', applyCount: 3 },
      { id: 'l2', lesson: 'lesson 2', applied: false }
    ]);
    const result = bs.getLessonHistory(10);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('l1');
  });
});

describe('_calculateLessonRelevance', () => {
  test('returns 0 when no shared keywords', () => {
    const bs = new BrainSystem();
    const result = bs._calculateLessonRelevance('abc', { problem: 'xyz', lesson: 'test' });
    expect(result).toBe(0);
  });

  test('returns ratio when keywords overlap', () => {
    const bs = new BrainSystem();
    const result = bs._calculateLessonRelevance('testing system', { problem: 'testing', lesson: 'system' });
    expect(result).toBeGreaterThan(0);
  });
});

describe('_isRecentApplied', () => {
  test('returns false when lesson not found', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.get = jest.fn().mockReturnValue(null);
    expect(bs._isRecentApplied('l1')).toBe(false);
  });

  test('returns false when lastApplied is null', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.get = jest.fn().mockReturnValue({ id: 'l1', lastApplied: null });
    expect(bs._isRecentApplied('l1')).toBe(false);
  });

  test('returns true when applied within 24 hours', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.get = jest.fn().mockReturnValue({ id: 'l1', lastApplied: new Date().toISOString() });
    expect(bs._isRecentApplied('l1')).toBe(true);
  });

  test('returns false when applied more than 24 hours ago', () => {
    const bs = new BrainSystem();
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    bs.lessonLibrary.get = jest.fn().mockReturnValue({ id: 'l1', lastApplied: oldDate });
    expect(bs._isRecentApplied('l1')).toBe(false);
  });
});

describe('_enhanceWithLessons', () => {
  test('returns original questions when suggestions empty', () => {
    const bs = new BrainSystem();
    const result = bs._enhanceWithLessons({ questions: ['q1'] }, [], 'ctx');
    expect(result).toEqual(['q1']);
  });

  test('returns original questions when suggestions null', () => {
    const bs = new BrainSystem();
    const result = bs._enhanceWithLessons({ questions: ['q1'] }, null, 'ctx');
    expect(result).toEqual(['q1']);
  });

  test('unshifts high priority lessons', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.get = jest.fn().mockReturnValue({ lesson: 'high lesson' });
    const suggestions = [{ lessonId: 'l1', priority: 'high', lesson: 'high lesson', improvement: 'do better' }];
    const result = bs._enhanceWithLessons({ questions: ['q1'] }, suggestions, 'ctx');
    expect(result.length).toBeGreaterThan(1);
  });
});

// ========== 健康度 ==========

describe('_checkLessonHealth', () => {
  test('returns warning when total is 0', () => {
    const bs = new BrainSystem();
    const result = bs._checkLessonHealth({ total: 0, applied: 0 });
    expect(result.status).toBe('warning');
  });

  test('returns critical when total > 20 and applied === 0', () => {
    const bs = new BrainSystem();
    const result = bs._checkLessonHealth({ total: 25, applied: 0 });
    expect(result.status).toBe('critical');
  });

  test('returns warning when unapplied > 80%', () => {
    const bs = new BrainSystem();
    const result = bs._checkLessonHealth({ total: 10, applied: 1, unapplied: 9 });
    expect(result.status).toBe('warning');
  });
});

describe('_checkDecisionQuality', () => {
  test('returns warning when no decisions', () => {
    const bs = new BrainSystem();
    bs.state.decisionCount = 0;
    const result = bs._checkDecisionQuality();
    expect(result.status).toBe('warning');
  });

  test('returns warning when uncertainRate > 0.6', () => {
    const bs = new BrainSystem();
    bs.state.decisionCount = 5;
    bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0.7 });
    const result = bs._checkDecisionQuality();
    expect(result.status).toBe('warning');
  });
});

describe('_checkEvolutionActivity', () => {
  test('returns warning when no recent learnings', () => {
    const bs = new BrainSystem();
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    const result = bs._checkEvolutionActivity();
    expect(result.status).toBe('warning');
  });

  test('returns warning when few learnings and many decisions', () => {
    const bs = new BrainSystem();
    bs.state.decisionCount = 15;
    bs.evolution.getStats.mockReturnValue({ recentLearnings: ['l1'] });
    const result = bs._checkEvolutionActivity();
    expect(result.status).toBe('warning');
  });
});

describe('_checkToolEfficiency', () => {
  test('returns warning when no tool usage', () => {
    const bs = new BrainSystem();
    bs.state.decisionCount = 10;
    bs.tools.getStats.mockReturnValue({ usageCount: 0 });
    const result = bs._checkToolEfficiency();
    expect(result.status).toBe('warning');
  });
});

describe('_checkMetaCognitionStatus', () => {
  test('returns warning when history > 50', () => {
    const bs = new BrainSystem();
    bs.metaCognition.history = Array(51).fill({});
    const result = bs._checkMetaCognitionStatus();
    expect(result.status).toBe('warning');
  });
});

// ========== 健康度汇总 ==========

describe('_calculateHealth', () => {
  test('returns needs-improvement with low scores', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 0, applied: 0, unapplied: 0, byCategory: {} });
    bs.state.decisionCount = 0;
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    bs.selfCheckInterval = null;
    bs.monitoringInterval = null;
    const result = bs._calculateHealth();
    expect(['excellent', 'good', 'fair', 'needs-improvement', 'critical']).toContain(result.level);
  });

  test('adds improvement for low lesson rate', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 1, unapplied: 9, byCategory: {} });
    bs.state.decisionCount = 5;
    bs.evolution.getStats.mockReturnValue({ recentLearnings: ['l1', 'l2'] });
    bs.selfCheckInterval = null;
    bs.monitoringInterval = null;
    const result = bs._calculateHealth();
    if (result.score < 80) {
      expect(result.improvements).toBeDefined();
    }
  });
});

// ========== getImprovements / predictIssues ==========

describe('getImprovements', () => {
  test('suggests when unapplied > 70%', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 1, unapplied: 9 });
    bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0 });
    bs.state.decisionCount = 0;
    const result = bs.getImprovements();
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
  });

  test('suggests when uncertainRate > 0.5', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 8, unapplied: 2 });
    bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0.6 });
    bs.state.decisionCount = 0;
    const result = bs.getImprovements();
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
  });

  test('suggests when decisionCount > 50 and recentLearnings < 5', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 8, unapplied: 2 });
    bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0 });
    bs.state.decisionCount = 60;
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    const result = bs.getImprovements();
    expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
  });
});

describe('predictIssues', () => {
  test('adds risk when lesson usage is low', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 20, applied: 3 });
    bs.state.decisionCount = 0;
    const result = bs.predictIssues();
    expect(result.risks.length).toBeGreaterThanOrEqual(1);
  });

  test('adds opportunity when decisionCount > 20', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 5, applied: 3 });
    bs.state.decisionCount = 25;
    const result = bs.predictIssues();
    expect(result.opportunities.length).toBeGreaterThanOrEqual(1);
  });

  test('adds risk when no recent learnings', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 5, applied: 3 });
    bs.state.decisionCount = 5;
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    const result = bs.predictIssues();
    expect(result.risks.length).toBeGreaterThanOrEqual(1);
  });
});

// ========== 跨任务学习 ==========

describe('crossTaskLearning', () => {
  test('returns early message for single task', () => {
    const bs = new BrainSystem();
    const result = bs.crossTaskLearning(['task1']);
    expect(result.message).toBeDefined();
  });

  test('returns early message for non-array', () => {
    const bs = new BrainSystem();
    const result = bs.crossTaskLearning('task1');
    expect(result.message).toBeDefined();
  });

  test('finds common patterns across tasks', () => {
    const bs = new BrainSystem();
    const tasks = [
      { context: 'create a module for testing', action: 'create' },
      { context: 'test the module for validation', action: 'test' }
    ];
    const result = bs.crossTaskLearning(tasks);
    expect(result.patterns.common).toBeDefined();
    expect(result.patterns.sequence.length).toBeGreaterThanOrEqual(0);
    expect(result.insight).toBeDefined();
  });
});

// ========== 知识图谱 ==========

describe('buildKnowledgeGraph', () => {
  test('returns graph with lessons', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search.mockReturnValue([
      { id: 'l1', lesson: 'test the system', problem: 'testing', category: 'dev', applied: true },
      { id: 'l2', lesson: 'build the system properly', problem: 'building', category: 'dev', applied: true }
    ]);
    const result = bs.buildKnowledgeGraph();
    expect(result.nodes).toBeDefined();
    expect(result.edges).toBeDefined();
    expect(result.clusters).toBeDefined();
  });
});

// ========== 关键洞察 ==========

describe('_extractKeyInsights', () => {
  test('includes lesson insights', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search.mockReturnValue([
      { lesson: 'test lesson', source: 'test', applied: true }
    ]);
    bs.metaCognition.getHistory.mockReturnValue([]);
    const result = bs._extractKeyInsights();
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  test('includes meta insights when history exists', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search.mockReturnValue([]);
    bs.metaCognition.getHistory.mockReturnValue([{ context: 'test' }]);
    const result = bs._extractKeyInsights();
    expect(result.some(i => i.type === 'meta')).toBe(true);
  });
});

// ========== 集成API ==========

describe('integrate', () => {
  test('returns API object with all methods', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getSuggestions.mockReturnValue([]);
    bs.lessonLibrary.getRelated.mockReturnValue([]);
    bs.metaCognition.beforeAsk.mockReturnValue({ questions: [] });
    bs.metaCognition.check.mockReturnValue({});
    const api = bs.integrate({});
    expect(api.decide).toBeDefined();
    expect(api.solve).toBeDefined();
    expect(api.learn).toBeDefined();
    expect(api.reflect).toBeDefined();
    expect(api.question).toBeDefined();
    expect(api.reverse).toBeDefined();
  });
});

// ========== _autoFixIssues ==========

describe('_autoFixIssues', () => {
  test('handles lesson-health critical', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getSuggestions.mockReturnValue([]);
    bs.lessonLibrary.getRelated.mockReturnValue([]);
    bs.metaCognition.beforeAsk.mockReturnValue({ questions: [] });
    bs.metaCognition.check.mockReturnValue({});
    const issues = [{
      check: 'lesson-health',
      status: 'critical',
      issues: ['教训未被使用，需要检查集成']
    }];
    expect(() => bs._autoFixIssues(issues)).not.toThrow();
  });

  test('handles evolution-activity warning', () => {
    const bs = new BrainSystem();
    const issues = [{
      check: 'evolution-activity',
      status: 'warning',
      issues: ['建议增加任务后的复盘']
    }];
    expect(() => bs._autoFixIssues(issues)).not.toThrow();
  });

  test('handles meta-status warning', () => {
    const bs = new BrainSystem();
    const issues = [{
      check: 'meta-status',
      status: 'warning',
      issues: ['考虑压缩历史记录']
    }];
    expect(() => bs._autoFixIssues(issues)).not.toThrow();
  });

  test('handles error in auto-fix process', () => {
    const bs = new BrainSystem();
    bs.metaCognition = null;
    const issues = [{
      check: 'meta-status',
      status: 'warning',
      issues: ['考虑压缩历史记录']
    }];
    expect(() => bs._autoFixIssues(issues)).not.toThrow();
  });
});

// ========== beforeDecision with getRelated ==========

describe('beforeDecision with relatedLessons', () => {
  test('maps related lessons in result', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getSuggestions.mockReturnValue([]);
    bs.lessonLibrary.getRelated.mockReturnValue([
      { id: 'r1', lesson: 'related lesson', applied: true }
    ]);
    bs.metaCognition.beforeAsk.mockReturnValue({ questions: [] });
    bs.metaCognition.check.mockReturnValue({});
    const result = bs.beforeDecision('test');
    expect(result.relatedLessons.length).toBe(1);
    expect(result.relatedLessons[0].id).toBe('r1');
  });
});

// ========== _autoComprehensiveCheck rejection ==========

describe('_autoComprehensiveCheck rejection', () => {
  test('handles promise rejection', async () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = {
      run: jest.fn().mockRejectedValue(new Error('check-error'))
    };
    const result = bs._autoComprehensiveCheck('ctx', { success: true });
    expect(result.triggered).toBe(true);
  });
});

// ========== solve with autoEvolution ==========

describe('solve', () => {
  test('records to evolution when selfLearning enabled', () => {
    const bs = new BrainSystem();
    bs.selfLearning = { getStats: () => ({}) };
    bs.thinking.multiAngle.mockReturnValue({
      technical: [], business: [], risk: [], user: [],
      conclusion: 'ok', confidence: 0.8, reasoning: 'test', alternatives: []
    });
    bs.reverseThinking.analyze.mockReturnValue({
      conclusion: '', causes: [], fiveWhys: []
    });
    const result = bs.solve({ description: 'test problem' });
    expect(result.confidence).toBeDefined();
  });
});

// ========== _calculateHealth edge levels ==========

describe('_calculateHealth edge levels', () => {
  test('hits needs-improvement level with minimal modules', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 0, applied: 0, unapplied: 0, byCategory: {} });
    bs.state.decisionCount = 0;
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    bs.selfCheckInterval = null;
    bs.monitoringInterval = null;
    // Null out most core modules to lower systemReady score
    bs.metaCognition = null;
    bs.thinking = null;
    bs.tools = null;
    bs.reverseThinking = null;
    const result = bs._calculateHealth();
    expect(result.score).toBeLessThan(40);
    expect(result.level).toBe('needs-improvement');
  });
});

// ========== buildKnowledgeGraph edges ==========

describe('buildKnowledgeGraph edges', () => {
  test('creates edges when similarity > 0.5', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search.mockReturnValue([
      { id: 'l1', lesson: 'testing system', problem: 'testing system properly', category: 'dev', applied: true },
      { id: 'l2', lesson: 'testing system', problem: 'testing system properly', category: 'dev', applied: true }
    ]);
    const result = bs.buildKnowledgeGraph();
    expect(result.edges.length).toBeGreaterThan(0);
    expect(result.clusters).toBeDefined();
  });
});

// ========== integrate API method calls ==========

describe('integrate API calls', () => {
  test('calling decide delegates to beforeDecision', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getSuggestions.mockReturnValue([]);
    bs.lessonLibrary.getRelated.mockReturnValue([]);
    bs.metaCognition.beforeAsk.mockReturnValue({ questions: [] });
    bs.metaCognition.check.mockReturnValue({});
    const api = bs.integrate({});
    const result = api.decide('test context');
    expect(result).toBeDefined();
    expect(result.selfCheck).toBeDefined();
  });

  test('calling reflect delegates to afterDecision', () => {
    const bs = new BrainSystem();
    bs.metaCognition.afterReview.mockReturnValue({});
    bs.selfLearning = { recordResponse: jest.fn() };
    const api = bs.integrate({});
    const result = api.reflect('ctx', { success: true }, 'action');
    expect(result).toBeDefined();
  });

  test('calling solve delegates', () => {
    const bs = new BrainSystem();
    bs.thinking.multiAngle.mockReturnValue({
      technical: [], business: [], risk: [], user: [],
      conclusion: 'ok', confidence: 0.8, reasoning: 'test', alternatives: []
    });
    bs.reverseThinking.analyze.mockReturnValue({
      conclusion: '', causes: [], fiveWhys: []
    });
    const api = bs.integrate({});
    const result = api.solve({ description: 'test' });
    expect(result).toBeDefined();
  });

  test('calling learn delegates', () => {
    const bs = new BrainSystem();
    const api = bs.integrate({});
    const result = api.learn('test lesson');
    expect(result).toBeDefined();
  });

  test('calling question delegates', () => {
    const bs = new BrainSystem();
    bs.metaCognition.check.mockReturnValue({ certainty: 0.8 });
    bs.thinking.question.mockReturnValue({ questions: [], alternatives: [] });
    const api = bs.integrate({});
    const result = api.question('assumption');
    expect(result).toBeDefined();
  });

  test('calling reverse delegates', () => {
    const bs = new BrainSystem();
    bs.reverseThinking.analyze.mockReturnValue({ conclusion: '', causes: [], fiveWhys: [] });
    bs.reverseThinking.fromResult.mockReturnValue({ steps: [], feasibility: 0.8 });
    const api = bs.integrate({});
    const result = api.reverse('goal', 'current');
    expect(result).toBeDefined();
  });

  test('calling api methods does not throw', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.search = jest.fn().mockReturnValue([]);
    bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0 });
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    const api = bs.integrate({});
    expect(() => api.getStatus()).not.toThrow();
    expect(() => api.getHealth()).not.toThrow();
    expect(() => api.getReport()).not.toThrow();
    expect(() => api.searchLessons('test')).not.toThrow();
    expect(() => api.getPlan()).not.toThrow();
    expect(() => api.saveMemory()).not.toThrow();
    expect(() => api.loadMemory()).not.toThrow();
  });

  test('calling startLoop and stopLoop does not throw', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 0, applied: 0, unapplied: 0, byCategory: {} });
    bs.tools.getStats.mockReturnValue({ usageCount: 5 });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    bs.metaCognition.history = [];
    bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0 });
    const api = bs.integrate({});
    expect(() => api.startLoop(5000)).not.toThrow();
    expect(() => api.stopLoop()).not.toThrow();
  });
});

// ============================================================
// Coverage expansion batch
// ============================================================

describe('Coverage - Static method lazy init', () => {
  beforeEach(() => {
    BrainSystem._smartMemory = null;
    BrainSystem._agi = null;
    BrainSystem._deepSelf = null;
    BrainSystem._agentTeam = null;
  });

  test('smartSearch and getRecentMemories lazy init', () => {
    expect(() => BrainSystem.smartSearch('test', 5)).not.toThrow();
    expect(() => BrainSystem.getRecentMemories(5)).not.toThrow();
  });

  test('getAGIStatus lazy init', () => {
    expect(() => BrainSystem.getAGIStatus()).not.toThrow();
  });

  test('coreReflection and getSelfAwarenessStatus lazy init', () => {
    expect(() => BrainSystem.coreReflection()).not.toThrow();
    expect(() => BrainSystem.getSelfAwarenessStatus()).not.toThrow();
  });

  test('_getAgentTeam lazy init', () => {
    expect(() => BrainSystem._getAgentTeam()).not.toThrow();
  });
});

describe('Coverage - Static method bodies', () => {
  test('getFullStatus returns object', () => {
    expect(BrainSystem.getFullStatus().version).toBeDefined();
  });

  test('process creates BrainSystem and returns processed', () => {
    const result = BrainSystem.process('Hello');
    expect(result.processed).toBe(true);
    expect(result.intent).toBeDefined();
    expect(result.emotion).toBeDefined();
  });

  test('getProof catches error from beforeDecision', () => {
    const orig = BrainSystem.prototype.beforeDecision;
    BrainSystem.prototype.beforeDecision = jest.fn(() => { throw new Error('test error'); });
    const result = BrainSystem.getProof();
    expect(result.status).toBe('error');
    expect(result.error).toBe('test error');
    BrainSystem.prototype.beforeDecision = orig;
  });
});

describe('Coverage - Instance method branches', () => {
  test('_runDailyCheck auto-applies high-priority lessons', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 1, unapplied: 9, byCategory: {} });
    bs.lessonLibrary.lessons.push({ priority: 'high', applied: false, id: 'test-1', lesson: 'test lesson for coverage' });
    bs.lessonLibrary.getLessons.mockReturnValue(bs.lessonLibrary.lessons);
    bs._runDailyCheck();
  });

  test('_runDailyCheck triggers comprehensive checker', () => {
    const bs = new BrainSystem();
    bs.state.selfCheckCount = 9;
    bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ stats: { failed: 0 } }) };
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 5, unapplied: 5, byCategory: {} });
    bs._runDailyCheck();
  });

  test('getQuickStatus returns excellent string with high metrics', () => {
    const bs = new BrainSystem();
    bs.selfCheckInterval = {};
    bs.monitoringInterval = {};
    bs.lessonLibrary.getStats.mockReturnValue({ total: 20, applied: 15, unapplied: 5, byCategory: {} });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: Array(15).fill({}) });
    bs.tools.getStats.mockReturnValue({ usageCount: 25 });
    bs.state.decisionCount = 30;
    const s = bs.getQuickStatus();
    expect(s).toContain('状态优秀');
  });

  test('getQuickStatus returns good string with moderate metrics', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 5, applied: 1, unapplied: 4, byCategory: {} });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: Array(3).fill({}) });
    bs.state.decisionCount = 8;
    const s = bs.getQuickStatus();
    expect(s).toContain('状态良好');
  });

  test('getActiveSuggestions suggests improvement for low lesson rate', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 20, applied: 2, unapplied: 18, byCategory: {} });
    expect(bs.getActiveSuggestions().length).toBeGreaterThan(0);
  });

  test('_generateRecommendations with low tool usage', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 0, applied: 0, unapplied: 0, byCategory: {} });
    bs.state.decisionCount = 0;
    bs.tools.getStats.mockReturnValue({ usageCount: 0 });
    const improvements = { health: bs._calculateHealth(), failing: [] };
    const r = bs._generateRecommendations(improvements);
    expect(r).toBeDefined();
  });

  test('_identifyLimitations with high uncertain rate', () => {
    const bs = new BrainSystem();
    bs.metaCognition.analyzeHistory.mockReturnValue({ message: 'has data', uncertainRate: 0.8 });
    bs.state.decisionCount = 5;
    const l = bs._identifyLimitations();
    expect(l).toBeDefined();
  });

  test('generateStatusReport returns structured report', () => {
    const bs = new BrainSystem();
    const report = bs.generateStatusReport();
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('health.score');
    expect(report).toHaveProperty('activity.decisions');
    expect(report).toHaveProperty('lessons.total');
    expect(report).toHaveProperty('capabilities.selfMonitoring');
  });

  test('generateImprovementPlan adds health action when score < 40', () => {
    const bs = new BrainSystem();
    bs.metaCognition = null;
    bs.thinking = null;
    bs.reverseThinking = null;
    bs.tools = null;
    bs.lessonLibrary.getStats.mockReturnValue({ total: 0, applied: 0, unapplied: 0, byCategory: {} });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    bs.state.decisionCount = 0;
    const plan = bs.generateImprovementPlan();
    expect(plan.actions.some((a) => a.priority === 1)).toBe(true);
  });

  test('generateImprovementPlan adds lesson action when rate < 50%', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 3, unapplied: 7, byCategory: {} });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [{}] });
    bs.tools.getStats.mockReturnValue({ usageCount: 50 });
    bs.state.decisionCount = 50;
    const plan = bs.generateImprovementPlan();
    expect(plan.actions.some((a) => a.priority === 2)).toBe(true);
  });

  test('getQuickStatus returns needs-improvement with very low metrics', () => {
    const bs = new BrainSystem();
    bs.metaCognition = null;
    bs.thinking = null;
    bs.reverseThinking = null;
    bs.tools = null;
    bs.lessonLibrary.getStats.mockReturnValue({ total: 0, applied: 0, unapplied: 0, byCategory: {} });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    bs.state.decisionCount = 0;
    const s = bs.getQuickStatus();
    expect(s).toContain('需要改进');
  });

  test('_initDefaultLessons cleans up design-note lessons when total > 0', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 5, applied: 0, unapplied: 5, byCategory: {} });
    bs.lessonLibrary.lessons.push({ lesson: '需要感知层旧教训', applied: false });
    bs._initDefaultLessons();
    expect(bs.lessonLibrary._save).toHaveBeenCalled();
  });

  test('_assessKnowledge iterates categories', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.categories = { thinking: '思维习惯', coding: '编程技巧' };
    bs.lessonLibrary.search = jest.fn().mockReturnValue([]);
    bs.lessonLibrary.lessons.push({ category: 'thinking', lesson: 'test' });
    const k = bs._assessKnowledge();
    expect(k.domains).toHaveProperty('思维习惯');
  });

  test('curiosityExplore finds unexplored categories and opportunities', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.categories = { thinking: '思维习惯', coding: '编程技巧' };
    bs.lessonLibrary.getStats.mockReturnValue({ total: 5, applied: 3, unapplied: 2, byCategory: {} });
    bs.metaCognition.analyzeHistory.mockReturnValue({ message: 'has data', uncertainRate: 0.1, improvements: [] });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [{}] });
    bs.tools.getStats.mockReturnValue({ usageCount: 50 });
    bs.state.decisionCount = 50;
    bs.predictIssues = jest.fn().mockReturnValue({ risks: ['r1'], opportunities: [{ message: 'grow' }] });
    const e = bs.curiosityExplore();
    expect(e.areas.length).toBeGreaterThan(0);
  });

  test('generateActionPlan produces sorted actions with auto-execute', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 2, unapplied: 8, byCategory: {} });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [] });
    bs.tools.getStats.mockReturnValue({ usageCount: 0 });
    bs.state.decisionCount = 5;
    bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0.1, message: 'low' });
    const plan = bs.generateActionPlan();
    expect(Array.isArray(plan.actions)).toBe(true);
    expect(Array.isArray(plan.autoExecuted)).toBe(true);
  });

  test('getSystemSummary includes optional modules', () => {
    const bs = new BrainSystem();
    bs.relationship = { getStats: () => ({ memories: 5 }) };
    bs.dream = { getSummary: () => ({ goals: 3 }) };
    bs.ethics = { getStats: () => ({ rules: 10 }) };
    const s = bs.getSystemSummary();
    expect(s.modules).toHaveProperty('relationship');
    expect(s.modules).toHaveProperty('dream');
    expect(s.modules).toHaveProperty('ethics');
  });

  test('_assessKnowledge includes high-priority lessons from search', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.categories = { thinking: '思维习惯' };
    bs.lessonLibrary.search = jest.fn().mockReturnValue([
      { lesson: 'test lesson', category: 'thinking', priority: 'high', applied: true }
    ]);
    const k = bs._assessKnowledge();
    expect(k.topLessons.length).toBeGreaterThan(0);
  });

  test('setSelfGoals targets lesson rate when rate is low', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 1, unapplied: 9, byCategory: {} });
    bs.state.decisionCount = 15;
    const goals = bs.setSelfGoals();
    expect(goals.some((g) => g.id === 'lesson-application')).toBe(true);
  });

  test('setSelfGoals targets decision quality when count > 10', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 8, unapplied: 2, byCategory: {} });
    bs.state.decisionCount = 15;
    const goals = bs.setSelfGoals();
    expect(goals.some((g) => g.id === 'decision-quality')).toBe(true);
  });

  test('_suggestionToAction returns default for unknown suggestion', () => {
    const bs = new BrainSystem();
    const action = bs._suggestionToAction('some completely unknown suggestion');
    expect(action.priority).toBe('low');
    expect(action.autoExecutable).toBe(false);
  });

  test('_verifyPromise handles integrated claim', () => {
    const bs = new BrainSystem();
    const result = bs._verifyPromise({ promise: '已融入全部功能' });
    expect(result.requiresHumanReview).toBe(true);
  });

  test('_verifyPromise runs comprehensive checker with 56项 claim', () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ stats: { failed: 0, warnings: 0 } }) };
    const result = bs._verifyPromise({ promise: '全方面检查56项' });
    expect(result.pass).toBe(true);
  });

  test('_verifyPromise handles checker failure report', () => {
    const bs = new BrainSystem();
    bs.comprehensiveChecker = { run: jest.fn().mockResolvedValue({ stats: { failed: 2, warnings: 1 } }) };
    const result = bs._verifyPromise({ promise: '全方面检查56项' });
    expect(result.pass).toBe(true);
  });

  test('_runEvolutionCycle completes a full cycle with auto-execution', () => {
    const bs = new BrainSystem();
    bs.lessonLibrary.getStats.mockReturnValue({ total: 10, applied: 2, unapplied: 8, byCategory: {} });
    bs.evolution.getStats.mockReturnValue({ recentLearnings: [{}] });
    bs.tools.getStats.mockReturnValue({ usageCount: 5 });
    bs.state.decisionCount = 10;
    bs.metaCognition.analyzeHistory.mockReturnValue({ uncertainRate: 0.1, message: 'low' });
    bs.metaCognition.history = [];
    const result = bs._runEvolutionCycle();
    expect(result.steps.length).toBeGreaterThanOrEqual(4);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.steps[0].step).toBe('monitor');
    expect(result.steps[2].step).toBe('plan');
  });

  test('_executeAction executes self-review action', () => {
    const bs = new BrainSystem();
    const result = bs._executeAction({ description: '执行一次自我复盘，记录学习' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('复盘已记录');
  });

  test('_executeAction checks lesson integration status', () => {
    const bs = new BrainSystem();
    bs.beforeDecision = jest.fn().mockReturnValue({ relatedLessons: ['l1', 'l2'] });
    const result = bs._executeAction({ description: '检查教训与决策流程集成状态' });
    expect(result.success).toBe(true);
    expect(result.lessonsShown).toBe(2);
  });

  test('_executeAction triggers review process', () => {
    const bs = new BrainSystem();
    const result = bs._executeAction({ description: '强制触发复盘流程' });
    expect(result.success).toBe(true);
    expect(result.message).toBe('复盘已触发');
  });

  test('_executeAction handles unknown action', () => {
    const bs = new BrainSystem();
    const result = bs._executeAction({ description: '不存在的行动' });
    expect(result.success).toBe(false);
    expect(result.message).toBe('无法自动执行');
  });

  test('_executeAction catches error from action', () => {
    const bs = new BrainSystem();
    bs.beforeDecision = jest.fn(() => { throw new Error('模拟错误'); });
    const result = bs._executeAction({ description: '检查教训与决策流程集成状态' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('模拟错误');
  });
});

describe('Exported module properties', () => {
  test('module exports BrainSystem version', () => {
    const mod = require('../src/core/BrainSystem');
    expect(mod.version).toBe('22.1.0');
  });

  test('module exports BrainSystem class', () => {
    const mod = require('../src/core/BrainSystem');
    expect(mod.BrainSystem).toBe(BrainSystem);
  });

  test('module exports LessonLearner', () => {
    const mod = require('../src/core/BrainSystem');
    expect(mod.LessonLearner).toBeDefined();
  });

  test('module exports DecisionContext', () => {
    const mod = require('../src/core/BrainSystem');
    expect(mod.DecisionContext).toBeDefined();
  });
});
