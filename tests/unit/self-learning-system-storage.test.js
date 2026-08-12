jest.mock('../../src/core/BrainSystem', () => ({
  BrainSystem: jest.fn(() => ({}))
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const SelfLearningSystem = require('../../src/core/SelfLearningSystem');

describe('SelfLearningSystem storage persistence', () => {
  let tmpRoot;
  let originalCwd;
  let system;

  beforeEach(() => {
    jest.clearAllMocks();
    originalCwd = process.cwd();
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sls-storage-'));
    process.chdir(tmpRoot);
    system = new SelfLearningSystem();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.chdir(originalCwd);
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writeStorage(data) {
    fs.mkdirSync(path.join(tmpRoot, '.opencode'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpRoot, '.opencode', 'self-learning.json'),
      JSON.stringify(data)
    );
  }

  describe('_loadFromStorage', () => {
    test('loads existing data and restores Maps', () => {
      writeStorage({
        intents: { 'test:intent': { count: 3, successCount: 2, variants: ['a', 'b'] } },
        suggestions: { 'tip:test': { shown: 5, adopted: 3, ignored: 1, rejected: 1 } },
        skills: { 'skill:test': { loaded: 2, helpfulCount: 1, contexts: ['coding'] } },
        patterns: { word: { count: 2, qualitySum: 1.8, successRate: 0.9, recommended: 'use x' } },
        responses: [{ timestamp: 1, message: 'm', response: 'r', quality: 0.8 }],
        feedback: [{ content: 'c', type: 't', sentiment: 'positive' }],
        adjustments: { suggestionFrequency: 1, responseStyle: 'detailed' }
      });

      const sys = new SelfLearningSystem();
      expect(sys.data.intents.get('test:intent').count).toBe(3);
      expect(sys.data.intents.get('test:intent').variants).toBeInstanceOf(Set);
      expect(sys.data.suggestions.get('tip:test').shown).toBe(5);
      expect(sys.data.skills.get('skill:test').contexts).toBeInstanceOf(Set);
      expect(sys.data.patterns.get('word').successRate).toBe(0.9);
      expect(sys.data.responses).toHaveLength(1);
      expect(sys.data.feedback).toHaveLength(1);
      expect(sys.data.adjustments.suggestionFrequency).toBe(1);
    });

    test('skips loading when file is missing', () => {
      const sys = new SelfLearningSystem();
      expect(sys.data.intents.size).toBe(0);
      expect(sys.data.responses).toHaveLength(0);
    });

    test('handles corrupt JSON gracefully', () => {
      fs.mkdirSync(path.join(tmpRoot, '.opencode'), { recursive: true });
      fs.writeFileSync(path.join(tmpRoot, '.opencode', 'self-learning.json'), '{ invalid json');
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const sys = new SelfLearningSystem();
      expect(sys.data.intents.size).toBe(0);
      expect(warnSpy).toHaveBeenCalled();
    });

    test('loads sparse data with absent fields and non-arrays', () => {
      writeStorage({
        suggestions: { 'tip:a': { shown: 1, adopted: 1, ignored: 0, rejected: 0 } },
        patterns: { word: { count: 1, qualitySum: 0.9, successRate: 0.9 } },
        responses: 'not-an-array',
        feedback: null
      });

      const sys = new SelfLearningSystem();
      expect(sys.data.intents.size).toBe(0);
      expect(sys.data.suggestions.size).toBe(1);
      expect(sys.data.skills.size).toBe(0);
      expect(sys.data.patterns.size).toBe(1);
      expect(sys.data.responses).toEqual([]);
      expect(sys.data.feedback).toEqual([]);
      expect(sys.data.adjustments.suggestionFrequency).toBe(0);
    });

    test('restores intents and skills missing variants/contexts', () => {
      writeStorage({
        intents: { i: { count: 1, successCount: 1 } },
        skills: { s: { loaded: 1, helpfulCount: 0 } }
      });

      const sys = new SelfLearningSystem();
      expect(sys.data.intents.get('i').variants).toBeInstanceOf(Set);
      expect(sys.data.skills.get('s').contexts).toBeInstanceOf(Set);
    });
  });

  describe('_saveToStorage', () => {
    test('saves data and creates directory', () => {
      system.data.intents.set('k', { count: 1, successCount: 1, variants: new Set(['a']) });
      system.data.skills.set('s', { loaded: 1, helpfulCount: 1, contexts: new Set(['c']) });
      system.data.patterns.set('p', { count: 1, qualitySum: 0.9, successRate: 0.9 });
      system.data.responses.push({ timestamp: 1, message: 'm', response: 'r', quality: 0.8 });
      system.data.feedback.push({ content: 'f', type: 't', sentiment: 'positive' });

      system._saveToStorage();

      const storagePath = path.join(tmpRoot, '.opencode', 'self-learning.json');
      expect(fs.existsSync(storagePath)).toBe(true);
      const saved = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
      expect(saved.intents.k.variants).toEqual(['a']);
      expect(saved.skills.s.contexts).toEqual(['c']);
      expect(saved.patterns.p.successRate).toBe(0.9);
      expect(saved.responses).toHaveLength(1);
      expect(saved.feedback).toHaveLength(1);
    });

    test('reuses existing directory and skips Set conversion for arrays', () => {
      fs.mkdirSync(path.join(tmpRoot, '.opencode'), { recursive: true });
      system.data.intents.set('k', { count: 1, successCount: 1, variants: ['a'] });
      system.data.skills.set('s', { loaded: 1, helpfulCount: 1, contexts: ['c'] });

      system._saveToStorage();

      const saved = JSON.parse(
        fs.readFileSync(path.join(tmpRoot, '.opencode', 'self-learning.json'), 'utf8')
      );
      expect(saved.intents.k.variants).toEqual(['a']);
      expect(saved.skills.s.contexts).toEqual(['c']);
    });

    test('prevents recursive save when lock is held', () => {
      system._isSaving = true;
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      system._saveToStorage();

      expect(warnSpy).toHaveBeenCalled();
      expect(fs.existsSync(path.join(tmpRoot, '.opencode', 'self-learning.json'))).toBe(false);
    });

    test('handles write failure gracefully and releases lock', () => {
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('disk full');
      });
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation();

      system.data.intents.set('k', { count: 1, successCount: 1, variants: ['a'] });
      system._saveToStorage();

      expect(warnSpy).toHaveBeenCalled();
      expect(system._isSaving).toBe(false);
    });
  });
});
