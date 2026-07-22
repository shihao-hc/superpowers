const { SkillDiscovery } = require('../../src/skills/agent/SkillDiscovery');

describe('SkillDiscovery', () => {
  let skillManager;
  let skillLoader;
  let mockSkill;

  function createDiscovery(opts = {}) {
    return new SkillDiscovery({ skillManager, skillLoader, ...opts });
  }

  beforeEach(() => {
    mockSkill = {
      id: 'test-driven-development',
      name: 'test-driven-development',
      description: 'TDD methodology for unit testing and test-first development',
      category: 'testing',
      riskLevel: 'low',
      version: '1.0.0',
      inputs: [
        { name: 'framework', type: 'string', description: 'Test framework', required: true },
        { name: 'coverage', type: 'number', description: 'Coverage target', default: 80 }
      ],
      outputs: [{ name: 'tests', description: 'Generated tests' }],
      tags: ['test', 'tdd', 'unit-test', 'jest'],
      examples: ['Use TDD for new feature', 'Write tests before code'],
      synonyms: ['tdd', 'test-first'],
      useCases: ['Unit testing', 'Test automation']
    };

    skillManager = { getAllSkills: jest.fn().mockReturnValue([mockSkill]) };
    skillLoader = {};
  });

  describe('constructor', () => {
    it('should initialize with skill registry and config', () => {
      const sd = createDiscovery();
      expect(sd.skillManager).toBe(skillManager);
      expect(sd.skillLoader).toBe(skillLoader);
      expect(sd.feedbackSystem).toBeNull();
      expect(sd.skillIndex instanceof Map).toBe(true);
      expect(sd.intentPatterns instanceof Map).toBe(true);
      expect(sd.learningData.acceptedRecommendations instanceof Map).toBe(true);
      expect(sd.learningData.rejectedRecommendations instanceof Map).toBe(true);
      expect(sd.learningData.skillSuccessRates instanceof Map).toBe(true);
      expect(sd.learningData.contextMappings instanceof Map).toBe(true);
      expect(sd.learningData.keywordWeights instanceof Map).toBe(true);
      expect(sd.config.maxSkillsInPrompt).toBe(20);
      expect(sd.config.confidenceThreshold).toBe(0.6);
      expect(sd.config.enableAutoSelect).toBe(true);
      expect(sd.config.enableConfirmation).toBe(true);
      expect(sd.config.contextWindow).toBe(10);
      expect(sd.config.learningEnabled).toBe(true);
      expect(sd.config.adaptiveThreshold).toBe(true);
      expect(sd.performanceStats.totalRecommendations).toBe(0);
      expect(sd.performanceStats.acceptedRecommendations).toBe(0);
      expect(sd.performanceStats.rejectedRecommendations).toBe(0);
      expect(sd.performanceStats.averageConfidence).toBe(0);
    });

    it('should build skill index on construction', () => {
      const sd = createDiscovery();
      expect(skillManager.getAllSkills).toHaveBeenCalledTimes(1);
      expect(sd.skillIndex.size).toBe(1);
      const entry = sd.skillIndex.get('test-driven-development');
      expect(entry).toBeDefined();
      expect(entry.id).toBe('test-driven-development');
      expect(entry.name).toBe('test-driven-development');
      expect(entry.description).toBe(mockSkill.description);
      expect(entry.category).toBe('testing');
      expect(entry.riskLevel).toBe('low');
      expect(entry.keywords).toBeDefined();
      expect(Array.isArray(entry.keywords)).toBe(true);
      expect(entry.intentPatterns).toBeDefined();
      expect(Array.isArray(entry.intentPatterns)).toBe(true);
    });

    it('should handle empty skill manager', () => {
      const sm = { getAllSkills: jest.fn().mockReturnValue([]) };
      const sd = new SkillDiscovery({ skillManager: sm });
      expect(sd.skillIndex.size).toBe(0);
    });

    it('should handle getAllSkills that is not a function', () => {
      const sm = { getAllSkills: null };
      const sd = new SkillDiscovery({ skillManager: sm });
      expect(sd.skillIndex.size).toBe(0);
    });

    it('should handle error in getAllSkills gracefully', () => {
      const sm = { getAllSkills: jest.fn().mockImplementation(() => { throw new Error('fail'); }) };
      const sd = new SkillDiscovery({ skillManager: sm });
      expect(sd.skillIndex.size).toBe(0);
    });

    it('should handle feedbackSystem option', () => {
      const fb = { record: jest.fn() };
      const sd = createDiscovery({ feedbackSystem: fb });
      expect(sd.feedbackSystem).toBe(fb);
    });

    it('should accept learningEnabled option', () => {
      const sd = createDiscovery({ learningEnabled: false });
      expect(sd.config.learningEnabled).toBe(false);
    });

    it('should accept adaptiveThreshold option', () => {
      const sd = createDiscovery({ adaptiveThreshold: false });
      expect(sd.config.adaptiveThreshold).toBe(false);
    });

    it('should handle skill with minimal fields', () => {
      const sm = {
        getAllSkills: jest.fn().mockReturnValue([{ name: 'minimal' }])
      };
      const sd = new SkillDiscovery({ skillManager: sm });
      const entry = sd.skillIndex.get('minimal');
      expect(entry.name).toBe('minimal');
      expect(entry.description).toBe('');
      expect(entry.category).toBe('general');
      expect(entry.riskLevel).toBe('low');
      expect(entry.version).toBe('1.0.0');
      // name + undefined description + undefined tags => "minimal undefined "
      expect(entry.keywords).toEqual(expect.arrayContaining(['minimal']));
    });

    it('should handle skill with id being name fallback', () => {
      const sm = {
        getAllSkills: jest.fn().mockReturnValue([{ name: 'no-id-skill', description: 'test' }])
      };
      const sd = new SkillDiscovery({ skillManager: sm });
      const entry = sd.skillIndex.get('no-id-skill');
      expect(entry.id).toBe('no-id-skill');
    });

    it('should create instance without options', () => {
      const sd = new SkillDiscovery();
      expect(sd).toBeDefined();
      expect(sd.config.maxSkillsInPrompt).toBe(20);
      expect(sd.skillIndex).toBeDefined();
    });
  });

  describe('_extractKeywords', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should extract unique keywords from text', () => {
      const kw = sd._extractKeywords('unit test development testing');
      expect(kw).toContain('unit');
      expect(kw).toContain('test');
      expect(kw).toContain('development');
      expect(kw).toContain('testing');
      expect(new Set(kw).size).toBe(kw.length);
    });

    it('should handle Chinese text as single tokens', () => {
      const kw = sd._extractKeywords('创建了一个新的测试');
      // CJK characters are not split by whitespace, so the whole string is one token
      expect(kw).toContain('创建了一个新的测试');
    });

    it('should filter single-character words', () => {
      const kw = sd._extractKeywords('a b c testing');
      expect(kw).not.toContain('a');
      expect(kw).not.toContain('b');
      expect(kw).not.toContain('c');
      expect(kw).toContain('testing');
    });

    it('should strip punctuation', () => {
      const kw = sd._extractKeywords('hello, world! testing...');
      expect(kw).toContain('hello');
      expect(kw).toContain('world');
      expect(kw).toContain('testing');
    });

    it('should return empty array for empty input', () => {
      expect(sd._extractKeywords('')).toEqual([]);
    });

    it('should return empty array for null/undefined', () => {
      expect(sd._extractKeywords(null)).toEqual([]);
      expect(sd._extractKeywords(undefined)).toEqual([]);
    });

    it('should lowercase English keywords', () => {
      const kw = sd._extractKeywords('TDD Unit TEST');
      expect(kw).toContain('tdd');
      expect(kw).not.toContain('TDD');
    });

    it('should preserve Chinese characters', () => {
      const kw = sd._extractKeywords('测试驱动开发 单元测试');
      expect(kw).toContain('测试驱动开发');
      expect(kw).toContain('单元测试');
    });
  });

  describe('_extractIntentPatterns', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should extract intent patterns from skill name match', () => {
      const patterns = sd._extractIntentPatterns({ name: 'canvas-draw', description: 'Drawing tool' });
      expect(patterns.length).toBeGreaterThan(0);
      expect(patterns).toContain('画图');
      expect(patterns).toContain('生成图片');
    });

    it('should extract intent patterns from description match', () => {
      const patterns = sd._extractIntentPatterns({ name: 'random', description: 'Generate pdf files' });
      expect(patterns).toContain('生成pdf');
    });

    it('should de-duplicate patterns', () => {
      const patterns = sd._extractIntentPatterns({ name: 'pdf-generator', description: 'Generate pdf files' });
      const pdfPatterns = patterns.filter((p) => p.includes('pdf'));
      expect(new Set(pdfPatterns).size).toBe(pdfPatterns.length);
    });

    it('should return empty for no matches', () => {
      const patterns = sd._extractIntentPatterns({ name: 'foo', description: 'bar baz' });
      expect(patterns).toEqual([]);
    });
  });

  describe('_calculateMatchScore', () => {
    let sd;
    let skillIndex;

    beforeEach(() => {
      sd = createDiscovery();
      skillIndex = {
        keywords: ['test', 'tdd', 'unit', 'jest'],
        intentPatterns: ['写测试', '单元测试'],
        description: 'TDD methodology for unit testing',
        synonyms: ['tdd', 'test-first']
      };
    });

    it('should return score based on keyword match', () => {
      const score = sd._calculateMatchScore(skillIndex, 'write unit test', ['write', 'unit', 'test'], []);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should return 0 for no match', () => {
      const score = sd._calculateMatchScore(skillIndex, 'zzzz yyyy', ['zzzz', 'yyyy'], []);
      expect(score).toBe(0);
    });

    it('should incorporate intent pattern match', () => {
      const scoreWithIntent = sd._calculateMatchScore(skillIndex, '我要写单元测试', ['写', '单元测试'], []);
      const scoreWithout = sd._calculateMatchScore(skillIndex, 'zzzz yyyy', ['zzzz', 'yyyy'], []);
      expect(scoreWithIntent).toBeGreaterThan(scoreWithout);
    });

    it('should incorporate synonym match', () => {
      const scoreWithSyn = sd._calculateMatchScore(skillIndex, 'tdd', ['tdd'], []);
      const scoreWithout = sd._calculateMatchScore(skillIndex, 'unknown', ['unknown'], []);
      expect(scoreWithSyn).toBeGreaterThan(scoreWithout);
    });

    it('should handle empty keywords gracefully', () => {
      const empty = { keywords: [], intentPatterns: [], description: '', synonyms: [] };
      const score = sd._calculateMatchScore(empty, 'test', ['test'], []);
      expect(score).toBe(0);
    });

    it('should cap score at 1.0', () => {
      const high = {
        keywords: ['a', 'b', 'c', 'd', 'e', 'f'],
        intentPatterns: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        description: 'a b c d e f g',
        synonyms: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      };
      const score = sd._calculateMatchScore(high, 'a b c d e f g', ['a', 'b', 'c', 'd', 'e', 'f', 'g'], []);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should handle undefined synonyms', () => {
      const skill = {
        keywords: ['test'],
        intentPatterns: [],
        description: 'test',
        synonyms: undefined
      };
      const score = sd._calculateMatchScore(skill, 'test', ['test'], []);
      expect(score).toBeGreaterThan(0);
    });
  });

  describe('analyzeInput', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should match skills based on user input', () => {
      // Use lower threshold to guarantee match
      const sd2 = new SkillDiscovery({
        skillManager: { getAllSkills: () => [mockSkill] },
        confidenceThreshold: 0.001
      });
      const result = sd2.analyzeInput('tdd unit testing development');
      expect(result.hasMatch).toBe(true);
      expect(result.matchedSkills.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return no match for irrelevant input', () => {
      const result = sd.analyzeInput('zzzz yyyy xxxx');
      expect(result.hasMatch).toBe(false);
      expect(result.matchedSkills).toEqual([]);
      expect(result.confidence).toBe(0);
    });

    it('should return top 3 matched skills sorted by score', () => {
      const sm = {
        getAllSkills: jest.fn().mockReturnValue([
          { name: 'skill-a', description: 'unit test development', tags: ['test'] },
          { name: 'skill-b', description: 'also unit test', tags: ['test'] },
          { name: 'skill-c', description: 'test related', tags: ['test'] },
          { name: 'skill-d', description: 'unrelated thing', tags: ['other'] }
        ])
      };
      const sd2 = new SkillDiscovery({ skillManager: sm });
      const result = sd2.analyzeInput('unit test');
      expect(result.matchedSkills.length).toBeLessThanOrEqual(3);
      if (result.matchedSkills.length >= 2) {
        expect(result.matchedSkills[0].confidence).toBeGreaterThanOrEqual(result.matchedSkills[1].confidence);
      }
    });

    it('should set needsConfirmation for high risk skills', () => {
      const sm = {
        getAllSkills: jest.fn().mockReturnValue([
          { name: 'danger-skill', description: 'test', tags: ['test'], riskLevel: 'high' }
        ])
      };
      const sd2 = new SkillDiscovery({ skillManager: sm, confidenceThreshold: 0, learningEnabled: false, adaptiveThreshold: false });
      expect(sd2.skillIndex.size).toBe(1);
      const result = sd2.analyzeInput('danger test');
      expect(result.matchedSkills.length).toBeGreaterThan(0);
      expect(result.matchedSkills[0].riskLevel).toBe('high');
      expect(result.needsConfirmation).toBe(true);
    });

    it('should not set needsConfirmation for low risk skills', () => {
      const result = sd.analyzeInput('write unit test');
      expect(result.needsConfirmation).toBe(false);
    });

    it('should generate clarification when confidence is medium', () => {
      const sm = {
        getAllSkills: jest.fn().mockReturnValue([
          { name: 'test-driven-development', description: 'TDD methodology for unit testing and test-first development', tags: ['test', 'tdd'] }
        ])
      };
      const sd2 = new SkillDiscovery({ skillManager: sm, confidenceThreshold: 0.1 });
      const result = sd2.analyzeInput('unit test');
      // score should be between 0.1 and 0.8, triggering clarification
      if (result.hasMatch && result.confidence >= 0.1 && result.confidence < 0.8) {
        expect(result.suggestedClarification).toBeTruthy();
        expect(typeof result.suggestedClarification).toBe('string');
      } else {
        // If confidence >= 0.8, no clarification needed - that's also correct behavior
        expect(result.suggestedClarification).toBeNull();
      }
    });

    it('should not generate clarification for high confidence match', () => {
      const sm = {
        getAllSkills: jest.fn().mockReturnValue([
          { name: 'test-driven-development', description: 'tdd unit test development', tags: ['test', 'tdd'], synonyms: ['tdd'] }
        ])
      };
      const sd2 = new SkillDiscovery({ skillManager: sm, confidenceThreshold: 0.1 });
      const result = sd2.analyzeInput('tdd unit test development');
      if (result.confidence >= 0.8) {
        expect(result.suggestedClarification).toBeNull();
      }
    });

    it('should not generate clarification for very low confidence', () => {
      const result = sd.analyzeInput('zzzz yyyy');
      expect(result.suggestedClarification).toBeNull();
    });

    it('should accept conversation history', () => {
      const result = sd.analyzeInput('write unit test', ['previous message']);
      expect(result).toBeDefined();
    });
  });

  describe('_getMatchReasons', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should return keyword match reasons', () => {
      const idx = { keywords: ['test', 'tdd', 'jest'], intentPatterns: [] };
      const reasons = sd._getMatchReasons(idx, 'unit test jest', ['unit', 'test', 'jest']);
      expect(reasons.length).toBeGreaterThan(0);
      expect(reasons.some((r) => r.includes('关键词匹配'))).toBe(true);
    });

    it('should return intent match reasons', () => {
      const idx = { keywords: [], intentPatterns: ['写测试', '单元测试'] };
      const reasons = sd._getMatchReasons(idx, '我要写测试', ['写', '测试']);
      expect(reasons.some((r) => r.includes('意图匹配'))).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const idx = { keywords: [], intentPatterns: [] };
      expect(sd._getMatchReasons(idx, 'zzzz', ['zzzz'])).toEqual([]);
    });
  });

  describe('_generateClarificationQuestion', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should generate a clarification question', () => {
      const q = sd._generateClarificationQuestion({ name: 'test-skill', description: 'Test description' }, 'input');
      expect(typeof q).toBe('string');
      expect(q.length).toBeGreaterThan(0);
      expect(q).toContain('test-skill');
    });
  });

  describe('getSkillsForLLM', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should return tools array', () => {
      const result = sd.getSkillsForLLM();
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      expect(result.toolCount).toBe(result.tools.length);
      expect(result.totalSkills).toBe(1);
    });

    it('should filter by category', () => {
      const result = sd.getSkillsForLLM({ category: 'testing' });
      expect(result.tools.length).toBe(1);
    });

    it('should return empty for non-matching category', () => {
      const result = sd.getSkillsForLLM({ category: 'nonexistent' });
      expect(result.tools).toEqual([]);
    });

    it('should respect maxSkills limit', () => {
      const sm = {
        getAllSkills: jest.fn().mockReturnValue([
          { name: 's1', description: 'test' },
          { name: 's2', description: 'test' },
          { name: 's3', description: 'test' }
        ])
      };
      const sd2 = new SkillDiscovery({ skillManager: sm });
      const result = sd2.getSkillsForLLM({ maxSkills: 2 });
      expect(result.tools.length).toBe(2);
    });
  });

  describe('_convertToToolFormat', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should convert skill to OpenAI function format', () => {
      const entry = sd.skillIndex.get('test-driven-development');
      const tool = sd._convertToToolFormat(entry);
      expect(tool.type).toBe('function');
      expect(tool.function.name).toBe('test-driven-development');
      expect(tool.function.parameters.type).toBe('object');
      expect(tool.function.parameters.properties.framework).toBeDefined();
      expect(tool.function.parameters.required).toContain('framework');
      expect(tool.function.metadata.category).toBe('testing');
      expect(tool.function.metadata.riskLevel).toBe('low');
    });

    it('should handle skill without inputs', () => {
      const entry = { name: 'no-inputs', description: '', inputs: [] };
      const tool = sd._convertToToolFormat(entry);
      expect(tool.function.parameters.properties).toEqual({});
      expect(tool.function.parameters.required).toEqual([]);
    });

    it('should handle input with enum', () => {
      const entry = {
        name: 'enum-skill', description: '',
        inputs: [{ name: 'mode', type: 'string', enum: ['fast', 'slow'] }]
      };
      const tool = sd._convertToToolFormat(entry);
      expect(tool.function.parameters.properties.mode.enum).toEqual(['fast', 'slow']);
    });

    it('should handle input with default value', () => {
      const entry = {
        name: 'default-skill', description: '',
        inputs: [{ name: 'count', type: 'number', default: 10 }]
      };
      const tool = sd._convertToToolFormat(entry);
      expect(tool.function.parameters.properties.count.default).toBe(10);
    });

    it('should handle skill with undefined inputs prop', () => {
      const entry = { name: 'no-inputs-prop', description: '' };
      const tool = sd._convertToToolFormat(entry);
      expect(tool.function.parameters.properties).toEqual({});
    });

    it('should handle input without type', () => {
      const entry = {
        name: 'no-type', description: '',
        inputs: [{ name: 'unnamed' }]
      };
      const tool = sd._convertToToolFormat(entry);
      expect(tool.function.parameters.properties.unnamed.type).toBe('string');
    });

    it('should handle input without description', () => {
      const entry = {
        name: 'no-desc', description: '',
        inputs: [{ name: 'undesc', type: 'string' }]
      };
      const tool = sd._convertToToolFormat(entry);
      expect(tool.function.parameters.properties.undesc.description).toBe('');
    });
  });

  describe('_formatDescription', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should include examples', () => {
      const desc = sd._formatDescription(mockSkill);
      expect(desc).toContain('用法示例');
      expect(desc).toContain('Use TDD for new feature');
    });

    it('should include use cases', () => {
      const desc = sd._formatDescription(mockSkill);
      expect(desc).toContain('适用场景');
      expect(desc).toContain('Unit testing');
    });

    it('should add risk warning for high risk level', () => {
      const desc = sd._formatDescription({ ...mockSkill, riskLevel: 'high' });
      expect(desc).toContain('高风险');
    });

    it('should not add risk warning for low risk', () => {
      const desc = sd._formatDescription({ ...mockSkill, riskLevel: 'low' });
      expect(desc).not.toContain('高风险');
    });
  });

  describe('generateToolCall', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should generate a tool call', () => {
      const call = sd.generateToolCall('test-driven-development', { framework: 'jest' });
      expect(call.id).toMatch(/^call_/);
      expect(call.type).toBe('function');
      expect(call.function.name).toBe('test-driven-development');
      expect(JSON.parse(call.function.arguments)).toEqual({ framework: 'jest' });
      expect(call.metadata.skillId).toBe('test-driven-development');
      expect(call.metadata.riskLevel).toBe('low');
      expect(call.metadata.requestedAt).toBeDefined();
    });

    it('should throw for unknown skill', () => {
      expect(() => sd.generateToolCall('nonexistent', {})).toThrow('Skill not found');
    });
  });

  describe('parseToolCalls', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should parse OpenAI format tool_calls', () => {
      const llmResponse = {
        tool_calls: [
          { id: 'call_1', function: { name: 'test', arguments: '{"key":"value"}' } }
        ]
      };
      const calls = sd.parseToolCalls(llmResponse);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('test');
      expect(calls[0].arguments).toEqual({ key: 'value' });
    });

    it('should parse Anthropic format content blocks', () => {
      const llmResponse = {
        content: [
          { type: 'tool_use', id: 'tool_1', name: 'test', input: { key: 'value' } }
        ]
      };
      const calls = sd.parseToolCalls(llmResponse);
      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe('test');
      expect(calls[0].arguments).toEqual({ key: 'value' });
    });

    it('should parse both formats simultaneously', () => {
      const llmResponse = {
        tool_calls: [
          { id: 'call_1', function: { name: 'tool1', arguments: '{}' } }
        ],
        content: [
          { type: 'tool_use', id: 'tool_2', name: 'tool2', input: {} }
        ]
      };
      const calls = sd.parseToolCalls(llmResponse);
      expect(calls).toHaveLength(2);
    });

    it('should handle empty response', () => {
      expect(sd.parseToolCalls({})).toEqual([]);
    });

    it('should handle invalid JSON gracefully', () => {
      const llmResponse = {
        tool_calls: [
          { id: 'call_1', function: { name: 'test', arguments: '{invalid}' } }
        ]
      };
      expect(() => sd.parseToolCalls(llmResponse)).toThrow();
    });

    it('should handle tool call without arguments', () => {
      const llmResponse = {
        tool_calls: [
          { id: 'call_1', function: { name: 'test' } }
        ]
      };
      const calls = sd.parseToolCalls(llmResponse);
      expect(calls).toHaveLength(1);
      expect(calls[0].arguments).toEqual({});
    });

    it('should skip non-tool_use content blocks', () => {
      const llmResponse = {
        content: [{ type: 'text', text: 'hello' }]
      };
      const calls = sd.parseToolCalls(llmResponse);
      expect(calls).toEqual([]);
    });
  });

  describe('formatToolResult', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should format execution result', () => {
      const result = sd.formatToolResult({ success: true, text: 'done', data: { id: 1 } }, 'exec_1');
      expect(result.tool_call_id).toBe('exec_1');
      expect(result.output.success).toBe(true);
      expect(result.output.text).toBe('done');
      expect(result.output.data).toEqual({ id: 1 });
      expect(result.output.executionId).toBe('exec_1');
    });

    it('should use message fallback for text', () => {
      const result = sd.formatToolResult({ message: 'fallback' }, 'exec_2');
      expect(result.output.text).toBe('fallback');
    });

    it('should default success to true', () => {
      const result = sd.formatToolResult({}, 'exec_3');
      expect(result.output.success).toBe(true);
    });

    it('should include attachments', () => {
      const result = sd.formatToolResult({ attachments: [{ url: 'file.pdf' }] }, 'exec_4');
      expect(result.output.attachments).toHaveLength(1);
    });
  });

  describe('getSkillSummary', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should return summary of skills', () => {
      const summary = sd.getSkillSummary();
      expect(summary.totalSkills).toBe(1);
      expect(summary.skills).toHaveLength(1);
      expect(summary.skills[0].name).toBe('test-driven-development');
      expect(summary.skills[0].description.length).toBeLessThanOrEqual(100);
      expect(summary.usage).toContain('test-driven-development');
    });

    it('should respect maxSkills limit', () => {
      const sm = {
        getAllSkills: jest.fn().mockReturnValue([
          { name: 's1', description: 'one' },
          { name: 's2', description: 'two' },
          { name: 's3', description: 'three' }
        ])
      };
      const sd2 = new SkillDiscovery({ skillManager: sm });
      expect(sd2.getSkillSummary(1).skills).toHaveLength(1);
    });
  });

  describe('refreshIndex', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should clear and rebuild skill index', () => {
      sd.skillIndex.set('stale', { name: 'stale' });
      expect(sd.skillIndex.size).toBe(2);
      sd.refreshIndex();
      expect(sd.skillIndex.size).toBe(1);
      expect(sd.skillIndex.has('stale')).toBe(false);
      expect(skillManager.getAllSkills).toHaveBeenCalledTimes(2);
    });
  });

  describe('recordRecommendationResult', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should record accepted recommendation', () => {
      sd.recordRecommendationResult('test-driven-development', 'write unit test', true, 0.8);
      expect(sd.performanceStats.totalRecommendations).toBe(1);
      expect(sd.performanceStats.acceptedRecommendations).toBe(1);
      expect(sd.learningData.acceptedRecommendations.get('test-driven-development')).toBe(1);
      expect(sd.performanceStats.averageConfidence).toBe(0.8);
    });

    it('should record rejected recommendation', () => {
      sd.recordRecommendationResult('test-driven-development', 'something else', false, 0.6);
      expect(sd.performanceStats.totalRecommendations).toBe(1);
      expect(sd.performanceStats.rejectedRecommendations).toBe(1);
      expect(sd.learningData.rejectedRecommendations.get('test-driven-development')).toBe(1);
    });

    it('should update keyword weights on accepted', () => {
      sd.recordRecommendationResult('skill', 'unit test keyword', true);
      const w = sd.learningData.keywordWeights.get('unit');
      expect(w).toBeDefined();
      expect(w.accepted).toBe(1);
      expect(w.rejected).toBe(0);
    });

    it('should update context mappings on accepted', () => {
      sd.recordRecommendationResult('skill', 'unit test', true);
      expect(sd.learningData.contextMappings.size).toBeGreaterThan(0);
    });

    it('should average confidence correctly', () => {
      sd.recordRecommendationResult('s1', 'test', true, 0.5);
      sd.recordRecommendationResult('s1', 'test', true, 1.0);
      expect(sd.performanceStats.averageConfidence).toBe(0.75);
    });

    it('should not update when learning disabled', () => {
      const sd2 = createDiscovery({ learningEnabled: false });
      sd2.recordRecommendationResult('test', 'test', true, 0.5);
      expect(sd2.performanceStats.totalRecommendations).toBe(0);
    });

    it('should increment accepted count for same skill', () => {
      sd.recordRecommendationResult('skill', 'test', true);
      sd.recordRecommendationResult('skill', 'test', true);
      expect(sd.learningData.acceptedRecommendations.get('skill')).toBe(2);
    });
  });

  describe('recordSkillExecutionResult', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should record successful execution', () => {
      sd.recordSkillExecutionResult('test-driven-development', true, 100);
      const data = sd.learningData.skillSuccessRates.get('test-driven-development');
      expect(data.total).toBe(1);
      expect(data.successful).toBe(1);
      expect(data.failed).toBe(0);
      expect(data.avgDuration).toBe(100);
    });

    it('should record failed execution', () => {
      sd.recordSkillExecutionResult('test-driven-development', false);
      const data = sd.learningData.skillSuccessRates.get('test-driven-development');
      expect(data.total).toBe(1);
      expect(data.successful).toBe(0);
      expect(data.failed).toBe(1);
    });

    it('should record ratings', () => {
      sd.recordSkillExecutionResult('test-driven-development', true, null, 5);
      const data = sd.learningData.skillSuccessRates.get('test-driven-development');
      expect(data.ratings).toContain(5);
    });

    it('should accumulate multiple executions', () => {
      sd.recordSkillExecutionResult('skill', true, 100);
      sd.recordSkillExecutionResult('skill', true, 200);
      sd.recordSkillExecutionResult('skill', false, 300);
      const data = sd.learningData.skillSuccessRates.get('skill');
      expect(data.total).toBe(3);
      expect(data.successful).toBe(2);
      expect(data.failed).toBe(1);
      expect(data.totalDuration).toBe(600);
      expect(data.avgDuration).toBe(200);
    });
  });

  describe('getSkillSuccessRate', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should return 0.5 for unknown skill', () => {
      expect(sd.getSkillSuccessRate('nonexistent')).toBe(0.5);
    });

    it('should return success rate', () => {
      sd.recordSkillExecutionResult('skill', true);
      sd.recordSkillExecutionResult('skill', true);
      sd.recordSkillExecutionResult('skill', false);
      expect(sd.getSkillSuccessRate('skill')).toBe(2 / 3);
    });
  });

  describe('getRecommendationAcceptanceRate', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should return null for no data', () => {
      expect(sd.getRecommendationAcceptanceRate('skill')).toBeNull();
    });

    it('should return acceptance rate', () => {
      sd.recordRecommendationResult('skill', 'test', true);
      sd.recordRecommendationResult('skill', 'test', true);
      sd.recordRecommendationResult('skill', 'test', false);
      expect(sd.getRecommendationAcceptanceRate('skill')).toBe(2 / 3);
    });
  });

  describe('getAdaptiveThreshold', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should return base threshold when adaptive disabled', () => {
      const sd2 = createDiscovery({ adaptiveThreshold: false });
      expect(sd2.getAdaptiveThreshold()).toBe(0.6);
    });

    it('should return base threshold with no data', () => {
      expect(sd.getAdaptiveThreshold()).toBe(0.6);
    });

    it('should increase threshold when acceptance rate is low', () => {
      sd.recordRecommendationResult('s1', 'test', false);
      sd.recordRecommendationResult('s1', 'test', false);
      sd.recordRecommendationResult('s1', 'test', false);
      sd.recordRecommendationResult('s1', 'test', true);
      const threshold = sd.getAdaptiveThreshold();
      expect(threshold).toBeGreaterThan(0.6);
    });

    it('should increase threshold moderately when acceptance rate is between 0.3 and 0.5', () => {
      sd.recordRecommendationResult('s1', 'test', false);
      sd.recordRecommendationResult('s1', 'test', false);
      sd.recordRecommendationResult('s1', 'test', false);
      sd.recordRecommendationResult('s1', 'test', false);
      sd.recordRecommendationResult('s1', 'test', true);
      sd.recordRecommendationResult('s1', 'test', true);
      // acceptance rate = 2/6 = 0.333, between 0.3 and 0.5
      const threshold = sd.getAdaptiveThreshold();
      expect(threshold).toBeGreaterThan(0.6);
      expect(threshold).toBeLessThanOrEqual(0.8);
    });

    it('should decrease threshold when acceptance rate is high', () => {
      sd.recordRecommendationResult('s1', 'test', true);
      sd.recordRecommendationResult('s1', 'test', true);
      sd.recordRecommendationResult('s1', 'test', true);
      const threshold = sd.getAdaptiveThreshold();
      expect(threshold).toBeLessThan(0.6);
    });
  });

  describe('getOptimizedMatchScore', () => {
    let sd;
    let skillIndex;

    beforeEach(() => {
      sd = createDiscovery();
      skillIndex = {
        name: 'test-driven-development',
        keywords: ['test', 'tdd'],
        intentPatterns: [],
        description: 'test',
        synonyms: []
      };
    });

    it('should return base score when learning disabled', () => {
      const sd2 = createDiscovery({ learningEnabled: false });
      const score = sd2.getOptimizedMatchScore(skillIndex, 'test', ['test'], []);
      expect(score).toBeGreaterThan(0);
    });

    it('should boost score for high success rate', () => {
      sd.recordSkillExecutionResult('test-driven-development', true, 100);
      sd.recordSkillExecutionResult('test-driven-development', true, 100);
      const base = sd._calculateMatchScore(skillIndex, 'test', ['test'], []);
      const optimized = sd.getOptimizedMatchScore(skillIndex, 'test', ['test'], []);
      expect(optimized).toBeGreaterThan(base);
    });

    it('should reduce score for low success rate', () => {
      sd.recordSkillExecutionResult('test-driven-development', false, 100);
      sd.recordSkillExecutionResult('test-driven-development', false, 100);
      sd.recordSkillExecutionResult('test-driven-development', false, 100);
      const base = sd._calculateMatchScore(skillIndex, 'test', ['test'], []);
      const optimized = sd.getOptimizedMatchScore(skillIndex, 'test', ['test'], []);
      expect(optimized).toBeLessThanOrEqual(base);
    });

    it('should boost score for high acceptance rate', () => {
      sd.recordRecommendationResult('test-driven-development', 'test', true);
      sd.recordRecommendationResult('test-driven-development', 'test', true);
      sd.recordRecommendationResult('test-driven-development', 'test', true);
      const base = sd._calculateMatchScore(skillIndex, 'test', ['test'], []);
      const optimized = sd.getOptimizedMatchScore(skillIndex, 'test', ['test'], []);
      expect(optimized).toBeGreaterThanOrEqual(base);
    });

    it('should reduce score for low acceptance rate', () => {
      sd.recordRecommendationResult('test-driven-development', 'test', false);
      sd.recordRecommendationResult('test-driven-development', 'test', false);
      sd.recordRecommendationResult('test-driven-development', 'test', false);
      sd.recordRecommendationResult('test-driven-development', 'test', false);
      sd.recordRecommendationResult('test-driven-development', 'test', true);
      const base = sd._calculateMatchScore(skillIndex, 'test', ['test'], []);
      const optimized = sd.getOptimizedMatchScore(skillIndex, 'test', ['test'], []);
      // acceptance rate = 1/5 = 0.2 < 0.3, should reduce
      expect(optimized).toBeLessThanOrEqual(base);
    });

    it('should cap at 1.0', () => {
      const high = { name: 'test', keywords: ['test', 'a', 'b', 'c'], intentPatterns: [], description: 'test a b c d', synonyms: [] };
      const score = sd.getOptimizedMatchScore(high, 'test a b c d', ['test', 'a', 'b', 'c', 'd'], []);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should not adjust score for medium acceptance rate', () => {
      sd.recordRecommendationResult('test-driven-development', 'alpha beta', true);
      sd.recordRecommendationResult('test-driven-development', 'gamma delta', true);
      sd.recordRecommendationResult('test-driven-development', 'epsilon zeta', true);
      sd.recordRecommendationResult('test-driven-development', 'eta theta', true);
      sd.recordRecommendationResult('test-driven-development', 'iota kappa', true);
      sd.recordRecommendationResult('test-driven-development', 'test', false);
      sd.recordRecommendationResult('test-driven-development', 'test', false);
      sd.recordRecommendationResult('test-driven-development', 'test', false);
      sd.recordRecommendationResult('test-driven-development', 'test', false);
      sd.recordRecommendationResult('test-driven-development', 'test', false);
      const base = sd._calculateMatchScore(skillIndex, 'test', ['test'], []);
      const optimized = sd.getOptimizedMatchScore(skillIndex, 'test', ['test'], []);
      expect(optimized).toBe(base);
    });

    it('should not adjust score for keyword with low score ratio', () => {
      sd.importLearningData({
        keywordWeights: { test: { accepted: 3, rejected: 3 } }
      });
      sd.recordRecommendationResult('other-skill', 'test', true);
      const base = sd._calculateMatchScore(skillIndex, 'test', ['test'], []);
      const optimized = sd.getOptimizedMatchScore(skillIndex, 'test', ['test'], []);
      expect(optimized).toBe(base);
    });
  });

  describe('analyzeRecommendationPatterns', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should return pattern structure with empty data', () => {
      const patterns = sd.analyzeRecommendationPatterns();
      expect(patterns.topAcceptedSkills).toEqual([]);
      expect(patterns.topRejectedSkills).toEqual([]);
      expect(patterns.highPerformingSkills).toEqual([]);
      expect(patterns.lowPerformingSkills).toEqual([]);
    });

    it('should sort accepted/rejected skills', () => {
      sd.recordRecommendationResult('s1', 'test', true);
      sd.recordRecommendationResult('s2', 'test', false);
      const patterns = sd.analyzeRecommendationPatterns();
      expect(patterns.topAcceptedSkills.length).toBeGreaterThan(0);
    });

    it('should handle skills with zero success rate', () => {
      sd.recordRecommendationResult('s1', 'test', true);
      sd.recordSkillExecutionResult('s1', false, 100);
      const patterns = sd.analyzeRecommendationPatterns();
      // successRate = 0, filtered out by .filter(s => s.successRate > 0)
      expect(patterns.lowPerformingSkills).toEqual([]);
      expect(patterns.highPerformingSkills).toEqual([]);
    });

    it('should populate high/low performing skills', () => {
      sd.recordRecommendationResult('s1', 'test', true);
      sd.recordRecommendationResult('s2', 'test', true);
      sd.recordSkillExecutionResult('s1', true, 100);
      sd.recordSkillExecutionResult('s1', true, 100);
      sd.recordSkillExecutionResult('s2', true, 50);
      sd.recordSkillExecutionResult('s2', false, 50);
      const patterns = sd.analyzeRecommendationPatterns();
      expect(patterns.highPerformingSkills.length).toBe(2);
      expect(patterns.lowPerformingSkills.length).toBe(2);
      expect(patterns.highPerformingSkills[0].name).toBe('s1');
      expect(patterns.lowPerformingSkills[0].name).toBe('s2');
    });

    it('should handle null acceptance rates from imported data', () => {
      sd.importLearningData({
        acceptedRecommendations: { 's1': 0, 's2': 0, 's3': 0 }
      });
      const patterns = sd.analyzeRecommendationPatterns();
      expect(patterns.topAcceptedSkills.length).toBe(3);
    });
  });

  describe('generateImprovementSuggestions', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should return empty suggestions with no data', () => {
      expect(sd.generateImprovementSuggestions()).toEqual([]);
    });

    it('should suggest for low acceptance rate skills', () => {
      // Need at least 1 accepted to appear in analysis (iterates acceptedRecommendations)
      sd.recordRecommendationResult('bad-skill', 'test', false);
      sd.recordRecommendationResult('bad-skill', 'test', false);
      sd.recordRecommendationResult('bad-skill', 'test', false);
      sd.recordRecommendationResult('bad-skill', 'test', false);
      sd.recordRecommendationResult('bad-skill', 'test', true);
      sd.recordRecommendationResult('bad-skill', 'test', false);
      const suggestions = sd.generateImprovementSuggestions();
      // acceptance rate = 1/6 = 0.167 < 0.3, total = 6 >= 5
      const metadataSuggestions = suggestions.filter((s) => s.type === 'skill_metadata');
      expect(metadataSuggestions.length).toBeGreaterThan(0);
      expect(metadataSuggestions[0].type).toBe('skill_metadata');
    });

    it('should suggest for low success rate skills', () => {
      // Need successRate > 0 to appear in lowPerformingSkills and accepted+rejected >= 3
      sd.recordSkillExecutionResult('failing-skill', true, 100);
      sd.recordSkillExecutionResult('failing-skill', false, 100);
      sd.recordSkillExecutionResult('failing-skill', false, 100);
      sd.recordSkillExecutionResult('failing-skill', false, 100);
      sd.recordRecommendationResult('failing-skill', 'test', true);
      sd.recordRecommendationResult('failing-skill', 'test', false);
      sd.recordRecommendationResult('failing-skill', 'test', false);
      const suggestions = sd.generateImprovementSuggestions();
      // successRate = 1/4 = 0.25 < 0.5, accepted+rejected = 3 >= 3
      const qualitySuggestions = suggestions.filter((s) => s.type === 'skill_quality');
      expect(qualitySuggestions.length).toBeGreaterThan(0);
      expect(qualitySuggestions[0].type).toBe('skill_quality');
    });

    it('should suggest algorithm improvement for low overall accuracy', () => {
      for (let i = 0; i < 10; i++) {
        sd.recordRecommendationResult('s1', 'test', false);
      }
      const suggestions = sd.generateImprovementSuggestions();
      expect(suggestions.some((s) => s.type === 'algorithm')).toBe(true);
    });

    it('should not suggest algorithm improvement when accuracy is sufficient', () => {
      for (let i = 0; i < 5; i++) {
        sd.recordRecommendationResult('s1', 'test', true);
      }
      for (let i = 0; i < 5; i++) {
        sd.recordRecommendationResult('s1', 'test', false);
      }
      const suggestions = sd.generateImprovementSuggestions();
      expect(suggestions.some((s) => s.type === 'algorithm')).toBe(false);
    });

    it('should handle null acceptance rate from imported data', () => {
      sd.importLearningData({
        acceptedRecommendations: { 's1': 0 }
      });
      const suggestions = sd.generateImprovementSuggestions();
      expect(suggestions).toEqual([]);
    });

    it('should handle zero acceptance rate', () => {
      sd.importLearningData({
        acceptedRecommendations: { 's1': 0 }
      });
      for (let i = 0; i < 5; i++) {
        sd.recordRecommendationResult('s1', 'test', false);
      }
      const suggestions = sd.generateImprovementSuggestions();
      const metadataSuggestions = suggestions.filter((s) => s.type === 'skill_metadata');
      expect(metadataSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe('getPerformanceStats', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should return stats with zero values', () => {
      const stats = sd.getPerformanceStats();
      expect(stats.totalRecommendations).toBe(0);
      expect(stats.acceptedRecommendations).toBe(0);
      expect(stats.rejectedRecommendations).toBe(0);
      expect(stats.overallAccuracy).toBe(0);
      expect(stats.averageConfidence).toBe(0);
      expect(stats.currentThreshold).toBe(0.6);
      expect(stats.skillCount).toBe(1);
    });

    it('should reflect recorded data', () => {
      sd.recordRecommendationResult('s1', 'test', true, 0.9);
      sd.recordRecommendationResult('s2', 'test', false, 0.5);
      const stats = sd.getPerformanceStats();
      expect(stats.totalRecommendations).toBe(2);
      expect(stats.acceptedRecommendations).toBe(1);
      expect(stats.rejectedRecommendations).toBe(1);
      expect(stats.overallAccuracy).toBe(0.5);
    });
  });

  describe('exportLearningData', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should export learning data as plain objects', () => {
      sd.recordRecommendationResult('s1', 'test', true);
      sd.recordSkillExecutionResult('s1', true, 100);
      const data = sd.exportLearningData();
      expect(typeof data.acceptedRecommendations).toBe('object');
      expect(data.acceptedRecommendations.s1).toBe(1);
      expect(typeof data.skillSuccessRates).toBe('object');
      expect(data.skillSuccessRates.s1).toBeDefined();
      expect(data.performanceStats.totalRecommendations).toBe(1);
    });
  });

  describe('importLearningData', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should import learning data', () => {
      sd.importLearningData({
        acceptedRecommendations: { s1: 5 },
        rejectedRecommendations: { s2: 3 },
        skillSuccessRates: { s1: { total: 10, successful: 8, failed: 2, totalDuration: 500, avgDuration: 50, ratings: [4, 5] } },
        keywordWeights: { test: { accepted: 3, rejected: 1 } },
        performanceStats: { totalRecommendations: 8, acceptedRecommendations: 5, rejectedRecommendations: 3, averageConfidence: 0.75 }
      });

      expect(sd.learningData.acceptedRecommendations.get('s1')).toBe(5);
      expect(sd.learningData.rejectedRecommendations.get('s2')).toBe(3);
      expect(sd.learningData.skillSuccessRates.get('s1').total).toBe(10);
      expect(sd.learningData.keywordWeights.get('test').accepted).toBe(3);
      expect(sd.performanceStats.totalRecommendations).toBe(8);
      expect(sd.performanceStats.averageConfidence).toBe(0.75);
    });

    it('should not break on empty import', () => {
      sd.importLearningData({});
      expect(sd.performanceStats.totalRecommendations).toBe(0);
    });

    it('should merge performance stats partially', () => {
      sd.performanceStats.totalRecommendations = 5;
      sd.importLearningData({ performanceStats: { averageConfidence: 0.8 } });
      expect(sd.performanceStats.totalRecommendations).toBe(5);
      expect(sd.performanceStats.averageConfidence).toBe(0.8);
    });
  });

  describe('_extractContextKey', () => {
    let sd;

    beforeEach(() => {
      sd = createDiscovery();
    });

    it('should extract context key from text', () => {
      const key = sd._extractContextKey('unit test development');
      expect(typeof key).toBe('string');
      expect(key.split('_').length).toBeLessThanOrEqual(3);
    });
  });
});
