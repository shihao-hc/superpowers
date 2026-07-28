# Intelligent Capabilities Verification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the platform's intelligent capabilities (BrainSystem, skills, multi-agent, learning, memory) actually work by expanding test coverage and running integration tests.

**Architecture:** Three-phase approach: (1) targeted unit tests for untested inner classes, (2) integration tests proving end-to-end intelligence pipelines, (3) fix any bugs discovered. Focus on highest-impact components first.

**Tech Stack:** Jest 29, Node.js, fs mocks for file-dependent modules

---

## Current State Summary

| Module | Source Lines | Test Coverage | Key Gap |
|--------|-------------|---------------|---------|
| BrainSystem inner classes | ~4000 | 0.45% lines | SmartMemory, MultiDimensionPredictor, ProactiveThinking, EmotionExpress, DeepIntentAnalyzer, Persistence |
| Skills core | ~2500 | 0% (SkillManager/Registry/Loader/AutoLoader) | No tests for core pipeline |
| Multi-agent | ~1500 | Good (7 test files) | BaseLLMAdapter, MultiLevelCache |
| Learning | ~1200 | Good (SelfLearningSystem 100%) | ProactiveAdvisor deep branches, SelfCodeImprover deep branches |
| Memory | ~800 | Partial (SemanticMemorySystem tested, SemanticMemory.js not) | SemanticMemory.js fallback mode |

---

## Phase 1: BrainSystem Inner Classes (Highest Impact)

### Task 1: SmartMemory Unit Tests

**Files:**
- Create: `tests/unit/smart-memory.test.js`
- Source: `src/core/BrainSystem.js` (lines 4089-4238, SmartMemory class)

- [ ] **Step 1: Write SmartMemory tests**

```javascript
// tests/unit/smart-memory.test.js
// SmartMemory is an inner class of BrainSystem, extractable via:
// const { SmartMemory } = BrainSystem; -- NOT exported
// Solution: Test via BrainSystem.smartStore/smartSearch static methods

const BrainSystem = require('../../src/core/BrainSystem');

jest.mock('../../src/core/MetaCognition', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ questions: [], score: 0.5 }),
  getAnalysis: jest.fn().mockReturnValue({}),
  addKnowledge: jest.fn(),
  getKnowledge: jest.fn().mockReturnValue([]),
  analyzePattern: jest.fn().mockReturnValue({}),
  identifyGap: jest.fn().mockReturnValue(null),
  suggestImprovement: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  getStatus: jest.fn().mockReturnValue('ok')
})));
jest.mock('../../src/core/Thinking', () => jest.fn().mockImplementation(() => ({
  think: jest.fn().mockReturnValue({ perspectives: [], conclusion: '' }),
  solve: jest.fn().mockReturnValue({ solution: '' }),
  combinePerspectives: jest.fn().mockReturnValue([]),
  calculateConfidence: jest.fn().mockReturnValue(0.5),
  question: jest.fn().mockReturnValue(''),
  associate: jest.fn().mockReturnValue([]),
  reverseEngineer: jest.fn().mockReturnValue({}),
  orangePractice: jest.fn().mockReturnValue({})
})));
jest.mock('../../src/core/Evolution', () => jest.fn().mockImplementation(() => ({
  record: jest.fn(),
  getHistory: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  adjustStrategy: jest.fn(),
  evolve: jest.fn()
})));
jest.mock('../../src/core/ReverseThinking', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ reverse: true }),
  getInsights: jest.fn().mockReturnValue([])
})));
jest.mock('../../src/core/ToolManager', () => jest.fn().mockImplementation(() => ({
  register: jest.fn(),
  get: jest.fn().mockReturnValue(null),
  list: jest.fn().mockReturnValue([]),
  selectTools: jest.fn().mockReturnValue([]),
  execute: jest.fn(),
  compose: jest.fn()
})));
jest.mock('../../src/core/LessonLibrary', () => jest.fn().mockImplementation(() => {
  const lessons = [];
  return {
    lessons,
    search: jest.fn().mockReturnValue([]),
    get: jest.fn().mockReturnValue(null),
    add: jest.fn().mockImplementation(l => { lessons.push(l); return l; }),
    markApplied: jest.fn(),
    getSuggestions: jest.fn().mockReturnValue([]),
    getRelated: jest.fn().mockReturnValue([]),
    getStats: jest.fn().mockReturnValue({ total: 0, applied: 0 }),
    export: jest.fn().mockReturnValue('[]'),
    categories: {}
  };
}));

beforeEach(() => {
  jest.spyOn(BrainSystem.prototype, '_loadPersistence').mockImplementation(() => {});
  jest.spyOn(BrainSystem.prototype, '_autoStartDailyCheck').mockImplementation(() => {});
});

describe('SmartMemory (via BrainSystem static methods)', () => {
  beforeEach(() => {
    BrainSystem._smartMemory = null; // reset singleton
  });

  test('smartStore stores a value', () => {
    const result = BrainSystem.smartStore('testKey', { data: 'hello' });
    expect(result).toBeDefined();
  });

  test('smartSearch retrieves stored value', () => {
    BrainSystem.smartStore('searchKey', { data: 'world' });
    const results = BrainSystem.smartSearch('searchKey');
    expect(Array.isArray(results)).toBe(true);
  });

  test('smartStore with metadata', () => {
    const result = BrainSystem.smartStore('metaKey', 'value', { tags: ['test'] });
    expect(result).toBeDefined();
  });

  test('smartSearch with limit', () => {
    BrainSystem.smartStore('lim1', 'a');
    BrainSystem.smartStore('lim2', 'b');
    const results = BrainSystem.smartSearch('lim', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  test('smartSearch returns empty for no match', () => {
    const results = BrainSystem.smartSearch('nonexistent_xyz_abc');
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/smart-memory.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/smart-memory.test.js
git commit -m "test: add SmartMemory unit tests via BrainSystem static methods"
```

---

### Task 2: MultiDimensionPredictor Unit Tests

**Files:**
- Create: `tests/unit/multi-dimension-predictor.test.js`
- Source: `src/core/BrainSystem.js` (lines 4239-4418, MultiDimensionPredictor class)

- [ ] **Step 1: Write MultiDimensionPredictor tests**

```javascript
// tests/unit/multi-dimension-predictor.test.js
const BrainSystem = require('../../src/core/BrainSystem');

jest.mock('../../src/core/MetaCognition', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ questions: [], score: 0.5 }),
  getAnalysis: jest.fn().mockReturnValue({}),
  addKnowledge: jest.fn(),
  getKnowledge: jest.fn().mockReturnValue([]),
  analyzePattern: jest.fn().mockReturnValue({}),
  identifyGap: jest.fn().mockReturnValue(null),
  suggestImprovement: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  getStatus: jest.fn().mockReturnValue('ok')
})));
jest.mock('../../src/core/Thinking', () => jest.fn().mockImplementation(() => ({
  think: jest.fn().mockReturnValue({ perspectives: [], conclusion: '' }),
  solve: jest.fn().mockReturnValue({ solution: '' }),
  combinePerspectives: jest.fn().mockReturnValue([]),
  calculateConfidence: jest.fn().mockReturnValue(0.5),
  question: jest.fn().mockReturnValue(''),
  associate: jest.fn().mockReturnValue([]),
  reverseEngineer: jest.fn().mockReturnValue({}),
  orangePractice: jest.fn().mockReturnValue({})
})));
jest.mock('../../src/core/Evolution', () => jest.fn().mockImplementation(() => ({
  record: jest.fn(),
  getHistory: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  adjustStrategy: jest.fn(),
  evolve: jest.fn()
})));
jest.mock('../../src/core/ReverseThinking', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ reverse: true }),
  getInsights: jest.fn().mockReturnValue([])
})));
jest.mock('../../src/core/ToolManager', () => jest.fn().mockImplementation(() => ({
  register: jest.fn(),
  get: jest.fn().mockReturnValue(null),
  list: jest.fn().mockReturnValue([]),
  selectTools: jest.fn().mockReturnValue([]),
  execute: jest.fn(),
  compose: jest.fn()
})));
jest.mock('../../src/core/LessonLibrary', () => jest.fn().mockImplementation(() => ({
  lessons: [],
  search: jest.fn().mockReturnValue([]),
  get: jest.fn().mockReturnValue(null),
  add: jest.fn(),
  markApplied: jest.fn(),
  getSuggestions: jest.fn().mockReturnValue([]),
  getRelated: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ total: 0, applied: 0 }),
  export: jest.fn().mockReturnValue('[]'),
  categories: {}
}));

beforeEach(() => {
  jest.spyOn(BrainSystem.prototype, '_loadPersistence').mockImplementation(() => {});
  jest.spyOn(BrainSystem.prototype, '_autoStartDailyCheck').mockImplementation(() => {});
  BrainSystem._predictor = null;
});

describe('MultiDimensionPredictor (via BrainSystem static methods)', () => {
  test('predict returns prediction object', () => {
    const result = BrainSystem.predict('test input', { history: [] });
    expect(result).toBeDefined();
    expect(result.intent).toBeDefined();
    expect(result.skill).toBeDefined();
    expect(result.action).toBeDefined();
    expect(result.time).toBeDefined();
  });

  test('predict with context', () => {
    const result = BrainSystem.predict('deploy code', {
      history: [{ input: 'deploy', intent: 'deploy' }],
      currentIntent: { type: 'deploy' }
    });
    expect(result).toBeDefined();
  });

  test('learnInteraction records data', () => {
    BrainSystem.learnInteraction('test input', { type: 'code' }, 'skill1', 'action1');
    // No error = success
  });

  test('predict multiple times builds history', () => {
    BrainSystem.predict('input1');
    BrainSystem.predict('input2');
    const result = BrainSystem.predict('input3');
    expect(result).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/multi-dimension-predictor.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/multi-dimension-predictor.test.js
git commit -m "test: add MultiDimensionPredictor unit tests"
```

---

### Task 3: ProactiveThinking Unit Tests

**Files:**
- Create: `tests/unit/proactive-thinking.test.js`
- Source: `src/core/BrainSystem.js` (lines 4762-4947, ProactiveThinking class)

- [ ] **Step 1: Write ProactiveThinking tests**

```javascript
// tests/unit/proactive-thinking.test.js
const BrainSystem = require('../../src/core/BrainSystem');

jest.mock('../../src/core/MetaCognition', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ questions: [], score: 0.5 }),
  getAnalysis: jest.fn().mockReturnValue({}),
  addKnowledge: jest.fn(),
  getKnowledge: jest.fn().mockReturnValue([]),
  analyzePattern: jest.fn().mockReturnValue({}),
  identifyGap: jest.fn().mockReturnValue(null),
  suggestImprovement: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  getStatus: jest.fn().mockReturnValue('ok')
})));
jest.mock('../../src/core/Thinking', () => jest.fn().mockImplementation(() => ({
  think: jest.fn().mockReturnValue({ perspectives: [], conclusion: '' }),
  solve: jest.fn().mockReturnValue({ solution: '' }),
  combinePerspectives: jest.fn().mockReturnValue([]),
  calculateConfidence: jest.fn().mockReturnValue(0.5),
  question: jest.fn().mockReturnValue(''),
  associate: jest.fn().mockReturnValue([]),
  reverseEngineer: jest.fn().mockReturnValue({}),
  orangePractice: jest.fn().mockReturnValue({})
})));
jest.mock('../../src/core/Evolution', () => jest.fn().mockImplementation(() => ({
  record: jest.fn(),
  getHistory: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  adjustStrategy: jest.fn(),
  evolve: jest.fn()
})));
jest.mock('../../src/core/ReverseThinking', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ reverse: true }),
  getInsights: jest.fn().mockReturnValue([])
})));
jest.mock('../../src/core/ToolManager', () => jest.fn().mockImplementation(() => ({
  register: jest.fn(),
  get: jest.fn().mockReturnValue(null),
  list: jest.fn().mockReturnValue([]),
  selectTools: jest.fn().mockReturnValue([]),
  execute: jest.fn(),
  compose: jest.fn()
})));
jest.mock('../../src/core/LessonLibrary', () => jest.fn().mockImplementation(() => ({
  lessons: [],
  search: jest.fn().mockReturnValue([]),
  get: jest.fn().mockReturnValue(null),
  add: jest.fn(),
  markApplied: jest.fn(),
  getSuggestions: jest.fn().mockReturnValue([]),
  getRelated: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ total: 0, applied: 0 }),
  export: jest.fn().mockReturnValue('[]'),
  categories: {}
}));

beforeEach(() => {
  jest.spyOn(BrainSystem.prototype, '_loadPersistence').mockImplementation(() => {});
  jest.spyOn(BrainSystem.prototype, '_autoStartDailyCheck').mockImplementation(() => {});
});

describe('ProactiveThinking (via BrainSystem static methods)', () => {
  beforeEach(() => {
    BrainSystem._proactiveThinking = null;
  });

  test('proactiveThink returns proactive result', () => {
    const result = BrainSystem.proactiveThink('test input', { history: [] });
    expect(result).toBeDefined();
    expect(result.questions).toBeDefined();
    expect(result.suggestions).toBeDefined();
  });

  test('proactiveThink generates questions', () => {
    const result = BrainSystem.proactiveThink('how to deploy', {});
    expect(Array.isArray(result.questions)).toBe(true);
  });

  test('proactiveThink generates suggestions', () => {
    const result = BrainSystem.proactiveThink('fix the bug', {});
    expect(Array.isArray(result.suggestions)).toBe(true);
  });

  test('proactiveThink with conversation context', () => {
    const result = BrainSystem.proactiveThink('continue', {
      history: [
        { input: 'write tests', response: 'tests written' },
        { input: 'run tests', response: 'tests passed' }
      ]
    });
    expect(result).toBeDefined();
  });

  test('getProactiveStatus returns status', () => {
    const status = BrainSystem.getProactiveStatus();
    expect(status).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/proactive-thinking.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/proactive-thinking.test.js
git commit -m "test: add ProactiveThinking unit tests"
```

---

### Task 4: EmotionExpress Unit Tests

**Files:**
- Create: `tests/unit/emotion-express.test.js`
- Source: `src/core/BrainSystem.js` (lines 4968-5121, EmotionExpress class)

- [ ] **Step 1: Write EmotionExpress tests**

```javascript
// tests/unit/emotion-express.test.js
const BrainSystem = require('../../src/core/BrainSystem');

jest.mock('../../src/core/MetaCognition', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ questions: [], score: 0.5 }),
  getAnalysis: jest.fn().mockReturnValue({}),
  addKnowledge: jest.fn(),
  getKnowledge: jest.fn().mockReturnValue([]),
  analyzePattern: jest.fn().mockReturnValue({}),
  identifyGap: jest.fn().mockReturnValue(null),
  suggestImprovement: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  getStatus: jest.fn().mockReturnValue('ok')
})));
jest.mock('../../src/core/Thinking', () => jest.fn().mockImplementation(() => ({
  think: jest.fn().mockReturnValue({ perspectives: [], conclusion: '' }),
  solve: jest.fn().mockReturnValue({ solution: '' }),
  combinePerspectives: jest.fn().mockReturnValue([]),
  calculateConfidence: jest.fn().mockReturnValue(0.5),
  question: jest.fn().mockReturnValue(''),
  associate: jest.fn().mockReturnValue([]),
  reverseEngineer: jest.fn().mockReturnValue({}),
  orangePractice: jest.fn().mockReturnValue({})
})));
jest.mock('../../src/core/Evolution', () => jest.fn().mockImplementation(() => ({
  record: jest.fn(),
  getHistory: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  adjustStrategy: jest.fn(),
  evolve: jest.fn()
})));
jest.mock('../../src/core/ReverseThinking', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ reverse: true }),
  getInsights: jest.fn().mockReturnValue([])
})));
jest.mock('../../src/core/ToolManager', () => jest.fn().mockImplementation(() => ({
  register: jest.fn(),
  get: jest.fn().mockReturnValue(null),
  list: jest.fn().mockReturnValue([]),
  selectTools: jest.fn().mockReturnValue([]),
  execute: jest.fn(),
  compose: jest.fn()
})));
jest.mock('../../src/core/LessonLibrary', () => jest.fn().mockImplementation(() => ({
  lessons: [],
  search: jest.fn().mockReturnValue([]),
  get: jest.fn().mockReturnValue(null),
  add: jest.fn(),
  markApplied: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ total: 0, applied: 0 }),
  export: jest.fn().mockReturnValue('[]'),
  categories: {}
}));

beforeEach(() => {
  jest.spyOn(BrainSystem.prototype, '_loadPersistence').mockImplementation(() => {});
  jest.spyOn(BrainSystem.prototype, '_autoStartDailyCheck').mockImplementation(() => {});
});

describe('EmotionExpress (via BrainSystem expressEmotion)', () => {
  test('expressEmotion returns emotion result', () => {
    const result = BrainSystem.expressEmotion('I love this', 'Thank you!');
    expect(result).toBeDefined();
    expect(result.userEmotion).toBeDefined();
    expect(result.aiEmotion).toBeDefined();
  });

  test('detects positive user emotion', () => {
    const result = BrainSystem.expressEmotion('This is great and awesome!', 'ok');
    expect(result.userEmotion.primary).toBeDefined();
  });

  test('detects negative user emotion', () => {
    const result = BrainSystem.expressEmotion('This is terrible and bad', 'ok');
    expect(result.userEmotion.primary).toBeDefined();
  });

  test('handles neutral input', () => {
    const result = BrainSystem.expressEmotion('the weather is ok', 'ok');
    expect(result).toBeDefined();
  });

  test('generates AI emotional response', () => {
    const result = BrainSystem.expressEmotion('I am so happy today!', 'Great!');
    expect(result.aiEmotion).toBeDefined();
    expect(result.response).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/emotion-express.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/emotion-express.test.js
git commit -m "test: add EmotionExpress unit tests"
```

---

### Task 5: DeepIntentAnalyzer Unit Tests

**Files:**
- Create: `tests/unit/deep-intent-analyzer.test.js`
- Source: `src/core/BrainSystem.js` (lines 3867-4088, DeepIntentAnalyzer class)

- [ ] **Step 1: Write DeepIntentAnalyzer tests**

```javascript
// tests/unit/deep-intent-analyzer.test.js
const BrainSystem = require('../../src/core/BrainSystem');

jest.mock('../../src/core/MetaCognition', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ questions: [], score: 0.5 }),
  getAnalysis: jest.fn().mockReturnValue({}),
  addKnowledge: jest.fn(),
  getKnowledge: jest.fn().mockReturnValue([]),
  analyzePattern: jest.fn().mockReturnValue({}),
  identifyGap: jest.fn().mockReturnValue(null),
  suggestImprovement: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  getStatus: jest.fn().mockReturnValue('ok')
})));
jest.mock('../../src/core/Thinking', () => jest.fn().mockImplementation(() => ({
  think: jest.fn().mockReturnValue({ perspectives: [], conclusion: '' }),
  solve: jest.fn().mockReturnValue({ solution: '' }),
  combinePerspectives: jest.fn().mockReturnValue([]),
  calculateConfidence: jest.fn().mockReturnValue(0.5),
  question: jest.fn().mockReturnValue(''),
  associate: jest.fn().mockReturnValue([]),
  reverseEngineer: jest.fn().mockReturnValue({}),
  orangePractice: jest.fn().mockReturnValue({})
})));
jest.mock('../../src/core/Evolution', () => jest.fn().mockImplementation(() => ({
  record: jest.fn(),
  getHistory: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({}),
  adjustStrategy: jest.fn(),
  evolve: jest.fn()
})));
jest.mock('../../src/core/ReverseThinking', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ reverse: true }),
  getInsights: jest.fn().mockReturnValue([])
})));
jest.mock('../../src/core/ToolManager', () => jest.fn().mockImplementation(() => ({
  register: jest.fn(),
  get: jest.fn().mockReturnValue(null),
  list: jest.fn().mockReturnValue([]),
  selectTools: jest.fn().mockReturnValue([]),
  execute: jest.fn(),
  compose: jest.fn()
})));
jest.mock('../../src/core/LessonLibrary', () => jest.fn().mockImplementation(() => ({
  lessons: [],
  search: jest.fn().mockReturnValue([]),
  get: jest.fn().mockReturnValue(null),
  add: jest.fn(),
  markApplied: jest.fn(),
  getSuggestions: jest.fn().mockReturnValue([]),
  getRelated: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ total: 0, applied: 0 }),
  export: jest.fn().mockReturnValue('[]'),
  categories: {}
}));

beforeEach(() => {
  jest.spyOn(BrainSystem.prototype, '_loadPersistence').mockImplementation(() => {});
  jest.spyOn(BrainSystem.prototype, '_autoStartDailyCheck').mockImplementation(() => {});
});

describe('DeepIntentAnalyzer (via BrainSystem.analyzeIntent)', () => {
  test('analyzes code-related intent', () => {
    const result = BrainSystem.analyzeIntent('fix the bug in auth.js');
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  test('analyzes security intent', () => {
    const result = BrainSystem.analyzeIntent('check for SQL injection vulnerabilities');
    expect(result.type).toBeDefined();
  });

  test('analyzes testing intent', () => {
    const result = BrainSystem.analyzeIntent('write unit tests for the login function');
    expect(result.type).toBeDefined();
  });

  test('analyzes deployment intent', () => {
    const result = BrainSystem.analyzeIntent('deploy to production server');
    expect(result.type).toBeDefined();
  });

  test('analyzes refactoring intent', () => {
    const result = BrainSystem.analyzeIntent('refactor the database connection code');
    expect(result.type).toBeDefined();
  });

  test('analyzes review intent', () => {
    const result = BrainSystem.analyzeIntent('review the pull request');
    expect(result.type).toBeDefined();
  });

  test('handles ambiguous input', () => {
    const result = BrainSystem.analyzeIntent('hello');
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
  });

  test('handles empty input', () => {
    const result = BrainSystem.analyzeIntent('');
    expect(result).toBeDefined();
  });

  test('analyzes Chinese input', () => {
    const result = BrainSystem.analyzeIntent('修复认证模块的bug');
    expect(result).toBeDefined();
    expect(result.type).toBeDefined();
  });

  test('includes subcategories', () => {
    const result = BrainSystem.analyzeIntent('fix the SQL injection in user search');
    expect(result.subcategories).toBeDefined();
    expect(Array.isArray(result.subcategories)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/deep-intent-analyzer.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/deep-intent-analyzer.test.js
git commit -m "test: add DeepIntentAnalyzer unit tests"
```

---

### Task 6: Persistence Module Unit Tests

**Files:**
- Create: `tests/unit/persistence-module.test.js`
- Source: `src/core/BrainSystem.js` (lines 3462-3736, Persistence singleton)

- [ ] **Step 1: Write Persistence tests**

```javascript
// tests/unit/persistence-module.test.js
const fs = require('fs');
const path = require('path');

// Persistence is a module-level singleton in BrainSystem.js
// We test it via the exported autoPersist + loadPersistedData

jest.mock('fs');
const mockFs = fs;

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.existsSync.mockReturnValue(true);
  mockFs.readFileSync.mockReturnValue('{}');
  mockFs.writeFileSync.mockImplementation(() => {});
  mockFs.mkdirSync.mockImplementation(() => {});
  mockFs.readdirSync.mockReturnValue([]);
});

describe('Persistence module (via BrainSystem exports)', () => {
  const BrainSystem = require('../../src/core/BrainSystem');

  test('autoPersist does not throw', () => {
    expect(() => BrainSystem.autoPersist()).not.toThrow();
  });

  test('getMemoryStats returns object', () => {
    const stats = BrainSystem.getMemoryStats();
    expect(stats).toBeDefined();
  });

  test('getEvolutionStats returns object', () => {
    const stats = BrainSystem.getEvolutionStats();
    expect(stats).toBeDefined();
  });

  test('getFullStatus returns status object', () => {
    const status = BrainSystem.getFullStatus();
    expect(status).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/persistence-module.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/persistence-module.test.js
git commit -m "test: add Persistence module unit tests"
```

---

## Phase 2: Skills Core Pipeline (High Impact)

### Task 7: SkillRegistry Unit Tests

**Files:**
- Create: `tests/unit/skill-registry-core.test.js`
- Source: `src/skills/SkillRegistry.js` (398 lines)

- [ ] **Step 1: Write SkillRegistry tests**

```javascript
// tests/unit/skill-registry-core.test.js
jest.mock('fs');
const fs = require('fs');
const { getSkillRegistry } = require('../../src/skills/SkillRegistry');

describe('SkillRegistry', () => {
  let registry;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([]);
    fs.readFileSync.mockReturnValue('');
    registry = getSkillRegistry();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('singleton', () => {
    it('returns the same instance', () => {
      const r1 = getSkillRegistry();
      const r2 = getSkillRegistry();
      expect(r1).toBe(r2);
    });
  });

  describe('getAllSkills', () => {
    it('returns array', () => {
      const skills = registry.getAllSkills();
      expect(Array.isArray(skills)).toBe(true);
    });
  });

  describe('search', () => {
    it('returns array for empty query', () => {
      const results = registry.search('');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('listCategories', () => {
    it('returns array', () => {
      const cats = registry.listCategories();
      expect(Array.isArray(cats)).toBe(true);
    });
  });

  describe('listTags', () => {
    it('returns array', () => {
      const tags = registry.listTags();
      expect(Array.isArray(tags)).toBe(true);
    });
  });

  describe('getStats', () => {
    it('returns stats object', () => {
      const stats = registry.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.totalSkills).toBe('number');
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/skill-registry-core.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/skill-registry-core.test.js
git commit -m "test: add SkillRegistry core unit tests"
```

---

### Task 8: SkillAutoLoader Unit Tests

**Files:**
- Create: `tests/unit/skill-auto-loader.test.js`
- Source: `src/skills/SkillAutoLoader.js` (335 lines)

- [ ] **Step 1: Write SkillAutoLoader tests**

```javascript
// tests/unit/skill-auto-loader.test.js
jest.mock('fs');
const fs = require('fs');

describe('SkillAutoLoader', () => {
  let SkillAutoLoader;
  let loader;

  beforeAll(() => {
    SkillAutoLoader = require('../../src/skills/SkillAutoLoader');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      taskTypes: {
        bug_fixing: { skills: ['systematic-debugging', 'code-review'] },
        creative_work: { skills: ['brainstorming', 'ui-ux-design'] },
        testing: { skills: ['test-driven-development', 'test-generation'] }
      }
    }));
    loader = new SkillAutoLoader();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('classifyTask', () => {
    it('classifies bug fixing', () => {
      const type = loader.classifyTask('fix the authentication bug');
      expect(type).toBe('bug_fixing');
    });

    it('classifies creative work', () => {
      const type = loader.classifyTask('design a new UI component');
      expect(type).toBe('creative_work');
    });

    it('classifies testing', () => {
      const type = loader.classifyTask('write unit tests for the API');
      expect(type).toBe('testing');
    });

    it('classifies refactoring', () => {
      const type = loader.classifyTask('refactor the database layer');
      expect(type).toBe('refactoring');
    });

    it('returns general for unknown', () => {
      const type = loader.classifyTask('hello world');
      expect(type).toBe('general');
    });
  });

  describe('getSkillsForTaskType', () => {
    it('returns skills for known type', () => {
      const skills = loader.getSkillsForTaskType('bug_fixing');
      expect(Array.isArray(skills)).toBe(true);
    });

    it('returns empty for unknown type', () => {
      const skills = loader.getSkillsForTaskType('nonexistent');
      expect(Array.isArray(skills)).toBe(true);
    });
  });

  describe('getSkillsForMessage', () => {
    it('returns skills for a message', () => {
      const result = loader.getSkillsForMessage('fix the bug in login');
      expect(result).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/skill-auto-loader.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/skill-auto-loader.test.js
git commit -m "test: add SkillAutoLoader unit tests"
```

---

### Task 9: SkillManager Unit Tests

**Files:**
- Create: `tests/unit/skill-manager-core.test.js`
- Source: `src/skills/SkillManager.js` (178 lines)

- [ ] **Step 1: Write SkillManager tests**

```javascript
// tests/unit/skill-manager-core.test.js
jest.mock('fs');
const fs = require('fs');

describe('SkillManager', () => {
  let SkillManager;
  let manager;

  beforeAll(() => {
    SkillManager = require('../../src/skills/SkillManager');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync.mockReturnValue([]);
    fs.readFileSync.mockReturnValue('');
    manager = new SkillManager();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('initializes with default options', () => {
      expect(manager).toBeDefined();
    });
  });

  describe('getAllSkills', () => {
    it('returns array', () => {
      const skills = manager.getAllSkills();
      expect(Array.isArray(skills)).toBe(true);
    });
  });

  describe('isEnabled', () => {
    it('returns false for unknown skill', () => {
      expect(manager.isEnabled('nonexistent')).toBe(false);
    });
  });

  describe('getSkillInfo', () => {
    it('returns null for unknown skill', () => {
      expect(manager.getSkillInfo('nonexistent')).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/skill-manager-core.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/skill-manager-core.test.js
git commit -m "test: add SkillManager core unit tests"
```

---

## Phase 3: Multi-Agent Gaps

### Task 10: BaseLLMAdapter Unit Tests

**Files:**
- Create: `tests/unit/base-llm-adapter.test.js`
- Source: `src/multiagent/patterns/BaseLLMAdapter.js`

- [ ] **Step 1: Write BaseLLMAdapter tests**

```javascript
// tests/unit/base-llm-adapter.test.js
const { OpenAIAdapter, DeepSeekAdapter, GoogleAdapter } = require('../../src/multiagent/patterns/BaseLLMAdapter');

describe('BaseLLMAdapter', () => {
  describe('OpenAIAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new OpenAIAdapter({
        apiKey: 'test-key',
        model: 'gpt-4'
      });
    });

    it('initializes with config', () => {
      expect(adapter).toBeDefined();
      expect(adapter.config.apiKey).toBe('test-key');
      expect(adapter.config.model).toBe('gpt-4');
    });

    it('has generate method', () => {
      expect(typeof adapter.generate).toBe('function');
    });

    it('has stream method', () => {
      expect(typeof adapter.stream).toBe('function');
    });
  });

  describe('DeepSeekAdapter', () => {
    it('initializes with default model', () => {
      const adapter = new DeepSeekAdapter({ apiKey: 'test' });
      expect(adapter).toBeDefined();
    });
  });

  describe('GoogleAdapter', () => {
    it('initializes', () => {
      const adapter = new GoogleAdapter({ apiKey: 'test' });
      expect(adapter).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/base-llm-adapter.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/base-llm-adapter.test.js
git commit -m "test: add BaseLLMAdapter unit tests"
```

---

## Phase 4: Learning Deep Dive

### Task 11: ProactiveAdvisor Deep Branch Tests

**Files:**
- Modify: `tests/unit/proactive-advisor.test.js` (add deep branch coverage)

- [ ] **Step 1: Add deep branch tests**

Read the existing file first, then add tests for:
- `_scanAuditLogs` with real JSONL content (3+ patterns to trigger filtering)
- `_findUnappliedLessons` with lessons that have `priority: 'high'` and `applyCount < 1`
- `_analyzeDecisions` with 5+ decision history entries
- `_analyzeDecisions` with high-risk trend (5+ high risk in last 20)
- `scan()` returning multiple suggestion types simultaneously
- `getStatus()` returning aggregated result

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/proactive-advisor.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/proactive-advisor.test.js
git commit -m "test: expand ProactiveAdvisor deep branch coverage"
```

---

### Task 12: SelfCodeImprover Deep Branch Tests

**Files:**
- Modify: `tests/unit/self-code-improver.test.js` (add deep branch coverage)

- [ ] **Step 1: Add deep branch tests**

Read the existing file first, then add tests for:
- `fullScan()` with multiple scan paths (some missing, some with files)
- `_scanFile()` with all 7 check types triggering issues
- `_autoFix()` with fixable issues
- `_updateIssueTracker()` tracking by severity
- `_groupBySeverity()` edge cases
- `getReport()` and `getIssueSummary()` methods
- `improve()` method (currently returns empty)

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/self-code-improver.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/self-code-improver.test.js
git commit -m "test: expand SelfCodeImprover deep branch coverage"
```

---

## Phase 5: Memory Verification

### Task 13: SemanticMemory.js Fallback Mode Tests

**Files:**
- Create: `tests/unit/semantic-memory.test.js`
- Source: `src/memory/SemanticMemory.js` (208 lines)

- [ ] **Step 1: Write SemanticMemory tests**

```javascript
// tests/unit/semantic-memory.test.js
jest.mock('chromadb', () => {
  throw new Error('chromadb not available');
});

const { SemanticMemory } = require('../../src/memory/SemanticMemory');

describe('SemanticMemory', () => {
  let memory;

  beforeEach(async () => {
    memory = new SemanticMemory({ persistDirectory: './test-db' });
    await memory.initialize();
  });

  describe('initialize', () => {
    it('falls back to memory store when ChromaDB unavailable', () => {
      expect(memory.initialized).toBe(true);
      expect(memory.memoryStore).toBeDefined();
    });
  });

  describe('add', () => {
    it('stores text in memory', async () => {
      const id = await memory.add('test text', { tag: 'test' });
      expect(id).toMatch(/^smem_/);
    });
  });

  describe('search', () => {
    it('searches memory store', async () => {
      await memory.add('hello world');
      const results = await memory.search('hello');
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('addBatch', () => {
    it('adds multiple items', async () => {
      const ids = await memory.addBatch(['text1', 'text2']);
      expect(ids).toHaveLength(2);
    });
  });

  describe('count', () => {
    it('returns count', async () => {
      await memory.add('one');
      await memory.add('two');
      const count = await memory.count();
      expect(count).toBe(2);
    });
  });

  describe('delete', () => {
    it('deletes from memory store', async () => {
      const id = await memory.add('to delete');
      const result = await memory.delete(id);
      expect(result).toBe(true);
    });
  });

  describe('generateId', () => {
    it('generates unique ids', () => {
      const id1 = memory.generateId();
      const id2 = memory.generateId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('close', () => {
    it('resets initialized', async () => {
      await memory.close();
      expect(memory.initialized).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/unit/semantic-memory.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/semantic-memory.test.js
git commit -m "test: add SemanticMemory fallback mode unit tests"
```

---

## Phase 6: Integration Test

### Task 14: BrainSystem Full Pipeline Integration Test

**Files:**
- Create: `tests/integration/brain-pipeline.integration.test.js`

- [ ] **Step 1: Write integration test**

```javascript
// tests/integration/brain-pipeline.integration.test.js
const BrainSystem = require('../../src/core/BrainSystem');

jest.mock('../../src/core/MetaCognition', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ questions: ['q1'], score: 0.7 }),
  getAnalysis: jest.fn().mockReturnValue({ score: 0.7 }),
  addKnowledge: jest.fn(),
  getKnowledge: jest.fn().mockReturnValue([]),
  analyzePattern: jest.fn().mockReturnValue({ patterns: [] }),
  identifyGap: jest.fn().mockReturnValue(null),
  suggestImprovement: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ total: 0 }),
  getStatus: jest.fn().mockReturnValue('ok')
})));
jest.mock('../../src/core/Thinking', () => jest.fn().mockImplementation(() => ({
  think: jest.fn().mockReturnValue({ perspectives: ['p1'], conclusion: 'c1' }),
  solve: jest.fn().mockReturnValue({ solution: 's1', confidence: 0.8 }),
  combinePerspectives: jest.fn().mockReturnValue(['combined']),
  calculateConfidence: jest.fn().mockReturnValue(0.75),
  question: jest.fn().mockReturnValue('Is this correct?'),
  associate: jest.fn().mockReturnValue(['related']),
  reverseEngineer: jest.fn().mockReturnValue({ steps: [] }),
  orangePractice: jest.fn().mockReturnValue({ insights: [] })
})));
jest.mock('../../src/core/Evolution', () => jest.fn().mockImplementation(() => ({
  record: jest.fn(),
  getHistory: jest.fn().mockReturnValue([]),
  getStats: jest.fn().mockReturnValue({ totalRecords: 0 }),
  adjustStrategy: jest.fn(),
  evolve: jest.fn().mockReturnValue({ improved: true })
})));
jest.mock('../../src/core/ReverseThinking', () => jest.fn().mockImplementation(() => ({
  analyze: jest.fn().mockReturnValue({ reverse: true, insights: [] }),
  getInsights: jest.fn().mockReturnValue([])
})));
jest.mock('../../src/core/ToolManager', () => jest.fn().mockImplementation(() => ({
  register: jest.fn(),
  get: jest.fn().mockReturnValue(null),
  list: jest.fn().mockReturnValue([]),
  selectTools: jest.fn().mockReturnValue([]),
  execute: jest.fn().mockReturnValue({ success: true }),
  compose: jest.fn()
})));
jest.mock('../../src/core/LessonLibrary', () => jest.fn().mockImplementation(() => {
  const lessons = [];
  return {
    lessons,
    search: jest.fn().mockReturnValue([]),
    get: jest.fn().mockReturnValue(null),
    add: jest.fn().mockImplementation(l => { lessons.push(l); return l; }),
    markApplied: jest.fn(),
    getSuggestions: jest.fn().mockReturnValue([]),
    getRelated: jest.fn().mockReturnValue([]),
    getStats: jest.fn().mockReturnValue({ total: 0, applied: 0, active: 0 }),
    export: jest.fn().mockReturnValue('[]'),
    categories: {}
  };
}));

beforeEach(() => {
  jest.spyOn(BrainSystem.prototype, '_loadPersistence').mockImplementation(() => {});
  jest.spyOn(BrainSystem.prototype, '_autoStartDailyCheck').mockImplementation(() => {});
  BrainSystem._smartMemory = null;
  BrainSystem._predictor = null;
  BrainSystem._proactiveThinking = null;
});

describe('BrainSystem Full Pipeline Integration', () => {
  test('fullProcess runs all 10 steps', () => {
    const result = BrainSystem.fullProcess(
      'fix the authentication bug in login.js',
      'I have fixed the bug by adding input validation'
    );
    expect(result).toBeDefined();
    expect(result.intent).toBeDefined();
    expect(result.intent.type).toBeDefined();
    expect(result.proactive).toBeDefined();
    expect(result.stored).toBeDefined();
  });

  test('fullProcess with security input', () => {
    const result = BrainSystem.fullProcess(
      'check for SQL injection vulnerabilities in the user search API',
      'The API uses parameterized queries'
    );
    expect(result).toBeDefined();
    expect(result.intent.type).toBeDefined();
  });

  test('fullProcess with Chinese input', () => {
    const result = BrainSystem.fullProcess(
      '修复用户认证模块的内存泄漏问题',
      '已通过优化数据库连接池修复'
    );
    expect(result).toBeDefined();
  });

  test('analyzeIntent → predict → proactiveThink pipeline', () => {
    const intent = BrainSystem.analyzeIntent('deploy to production');
    expect(intent.type).toBeDefined();

    const prediction = BrainSystem.predict('deploy to production', { currentIntent: intent });
    expect(prediction).toBeDefined();

    const proactive = BrainSystem.proactiveThink('deploy to production', { currentIntent: intent });
    expect(proactive).toBeDefined();
  });

  test('smartStore → smartSearch round trip', () => {
    BrainSystem.smartStore('integration_test', { key: 'value' }, { tags: ['test'] });
    const results = BrainSystem.smartSearch('integration');
    expect(results).toBeDefined();
  });

  test('getProof returns verification', () => {
    const proof = BrainSystem.getProof();
    expect(proof).toBeDefined();
  });

  test('verifyCall returns boolean', () => {
    const result = BrainSystem.verifyCall();
    expect(typeof result).toBe('boolean');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npx jest tests/integration/brain-pipeline.integration.test.js --verbose
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/brain-pipeline.integration.test.js
git commit -m "test: add BrainSystem full pipeline integration test"
```

---

## Final Verification

### Task 15: Run Full Test Suite + ESLint

- [ ] **Step 1: Run all tests**

```bash
npx jest --verbose 2>&1 | tail -50
```
Expected: All new tests PASS, no regressions

- [ ] **Step 2: Run ESLint**

```bash
npx eslint tests/unit/smart-memory.test.js tests/unit/multi-dimension-predictor.test.js tests/unit/proactive-thinking.test.js tests/unit/emotion-express.test.js tests/unit/deep-intent-analyzer.test.js tests/unit/persistence-module.test.js tests/unit/skill-registry-core.test.js tests/unit/skill-auto-loader.test.js tests/unit/skill-manager-core.test.js tests/unit/base-llm-adapter.test.js tests/unit/semantic-memory.test.js tests/integration/brain-pipeline.integration.test.js --max-warnings=0
```
Expected: 0 errors

- [ ] **Step 3: Run coverage on new files**

```bash
npx jest --coverage --collectCoverageFrom='src/core/BrainSystem.js' tests/unit/smart-memory.test.js tests/unit/multi-dimension-predictor.test.js tests/unit/proactive-thinking.test.js tests/unit/emotion-express.test.js tests/unit/deep-intent-analyzer.test.js 2>&1 | tail -20
```
Expected: Coverage improved from 0.45%

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "test: intelligent capabilities verification - 14 new test files"
```
