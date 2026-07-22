const { ThinkingChain, thinkingChain } = require('../../src/mcp/engines/ThinkingChain');

describe('ThinkingChain', () => {
  let tc;

  beforeEach(() => {
    jest.restoreAllMocks();
    tc = new ThinkingChain();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    test('should set default values', () => {
      expect(tc.chains).toBeInstanceOf(Map);
      expect(tc.branches).toBeInstanceOf(Map);
      expect(tc.currentChainId).toBeNull();
    });
  });

  describe('createChain', () => {
    test('should create a chain with initial thought', () => {
      const chain = tc.createChain('initial thought', { task: 'test' });
      expect(chain.id).toMatch(/^chain_/);
      expect(chain.createdAt).toBeDefined();
      expect(chain.metadata).toEqual({ task: 'test' });
      expect(chain.thoughts).toHaveLength(1);
      expect(chain.thoughts[0].thought).toBe('initial thought');
      expect(chain.thoughts[0].thoughtNumber).toBe(1);
      expect(chain.thoughts[0].nextThoughtNeeded).toBe(true);
      expect(chain.thoughts[0].reasoning).toBeNull();
      expect(chain.thoughts[0].criticism).toBeNull();
      expect(chain.thoughts[0].reflectionOf).toBeNull();
      expect(chain.thoughts[0].branchId).toBeNull();
      expect(chain.status).toBe('in_progress');
      expect(tc.currentChainId).toBe(chain.id);
    });

    test('should store chain in map', () => {
      const chain = tc.createChain('thinking');
      expect(tc.chains.get(chain.id)).toBe(chain);
    });
  });

  describe('addThought', () => {
    test('should add thought to chain', () => {
      const chain = tc.createChain('start');
      const step = tc.addThought(chain.id, 'next step');
      expect(step.id).toBe('step_2');
      expect(step.thought).toBe('next step');
      expect(step.thoughtNumber).toBe(2);
      expect(step.totalThoughts).toBe(2);
      expect(step.nextThoughtNeeded).toBe(true);
      expect(step.reasoning).toBeNull();
      expect(step.criticism).toBeNull();
      expect(step.reflectionOf).toBeNull();
      expect(step.branchId).toBeNull();
      expect(step.metadata).toEqual({});
      expect(chain.thoughts).toHaveLength(2);
    });

    test('should throw for non-existent chain', () => {
      expect(() => tc.addThought('invalid', 'test')).toThrow('Chain not found: invalid');
    });

    test('should accept options', () => {
      const chain = tc.createChain('start');
      const step = tc.addThought(chain.id, 'refined', {
        nextThoughtNeeded: false,
        reasoning: 'because',
        criticism: 'bad',
        reflectionOf: 'step_1',
        branchId: 'br1',
        metadata: { key: 'val' }
      });
      expect(step.nextThoughtNeeded).toBe(false);
      expect(step.reasoning).toBe('because');
      expect(step.criticism).toBe('bad');
      expect(step.reflectionOf).toBe('step_1');
      expect(step.branchId).toBe('br1');
      expect(step.metadata).toEqual({ key: 'val' });
    });
  });

  describe('createBranch', () => {
    test('should create a branch from a thought', () => {
      const chain = tc.createChain('start');
      const branch = tc.createBranch(chain.id, 'step_1', 'alt', 'try different approach');
      expect(branch.id).toMatch(/^branch_/);
      expect(branch.name).toBe('alt');
      expect(branch.parentThoughtId).toBe('step_1');
      expect(branch.direction).toBe('try different approach');
      expect(branch.status).toBe('active');
      expect(chain.branches).toHaveLength(1);
      expect(chain.currentBranch).toBe(branch.id);
    });

    test('should default branch name', () => {
      const chain = tc.createChain('start');
      const branch = tc.createBranch(chain.id, 'step_1', null, 'new dir');
      expect(branch.name).toBe('Branch 1');
    });

    test('should throw for non-existent chain', () => {
      expect(() => tc.createBranch('invalid', 'step_1', 'b', 'd')).toThrow('Chain not found: invalid');
    });

    test('should throw for non-existent thought', () => {
      const chain = tc.createChain('start');
      expect(() => tc.createBranch(chain.id, 'step_99', 'b', 'd')).toThrow('Thought not found: step_99');
    });
  });

  describe('switchBranch', () => {
    test('should switch to existing branch', () => {
      const chain = tc.createChain('start');
      const branch = tc.createBranch(chain.id, 'step_1', 'alt', 'd');
      const switched = tc.switchBranch(chain.id, branch.id);
      expect(switched.id).toBe(branch.id);
      expect(chain.currentBranch).toBe(branch.id);
    });

    test('should throw for non-existent chain', () => {
      expect(() => tc.switchBranch('invalid', 'b1')).toThrow('Chain not found: invalid');
    });

    test('should throw for non-existent branch', () => {
      const chain = tc.createChain('start');
      expect(() => tc.switchBranch(chain.id, 'bogus')).toThrow('Branch not found: bogus');
    });
  });

  describe('switchToMain', () => {
    test('should set currentBranch to null', () => {
      const chain = tc.createChain('start');
      tc.createBranch(chain.id, 'step_1', 'alt', 'd');
      const result = tc.switchToMain(chain.id);
      expect(chain.currentBranch).toBeNull();
      expect(result).toBe(chain);
    });

    test('should throw for non-existent chain', () => {
      expect(() => tc.switchToMain('invalid')).toThrow('Chain not found: invalid');
    });
  });

  describe('reflectOnStep', () => {
    test('should create a correction thought', () => {
      const chain = tc.createChain('initial wrong idea');
      const reflection = tc.reflectOnStep(chain.id, 'step_1', {
        correction: 'correct approach',
        explanation: 'because it is right',
        criticism: 'wrong assumption',
        improvement: 'better result'
      });
      expect(reflection.original.id).toBe('step_1');
      expect(reflection.correction.thought).toBe('correct approach');
      expect(reflection.correction.reasoning).toBe('because it is right');
      expect(reflection.correction.criticism).toBe('wrong assumption');
      expect(reflection.correction.reflectionOf).toBe('step_1');
      expect(reflection.relationship).toBe('reflection_on_previous');
      expect(reflection.improvement).toBe('better result');
      expect(chain.thoughts).toHaveLength(2);
    });

    test('should throw for non-existent chain', () => {
      expect(() => tc.reflectOnStep('invalid', 'step_1', { correction: 'c', explanation: 'e' })).toThrow('Chain not found: invalid');
    });

    test('should throw for non-existent thought', () => {
      const chain = tc.createChain('start');
      expect(() => tc.reflectOnStep(chain.id, 'step_99', { correction: 'c', explanation: 'e' })).toThrow('Thought not found: step_99');
    });
  });

  describe('getChain', () => {
    test('should return enriched chain', () => {
      const chain = tc.createChain('start', { task: 'test' });
      tc.addThought(chain.id, 'next');
      const result = tc.getChain(chain.id);
      expect(result.id).toBe(chain.id);
      expect(result.metadata).toEqual({ task: 'test' });
      expect(result.thoughts).toHaveLength(2);
      expect(result.serialized).toBeDefined();
      expect(result.serialized).toContain('[1]');
      expect(result.serialized).toContain('[2]');
      expect(result.summary).toBeDefined();
      expect(result.summary.totalSteps).toBe(2);
      expect(result.summary.status).toBe('in_progress');
    });

    test('should include branch name in serialized output', () => {
      const chain = tc.createChain('start');
      const branch = tc.createBranch(chain.id, 'step_1', 'alt-path', 'try other');
      tc.addThought(chain.id, 'branch thought', { branchId: branch.id });
      const result = tc.getChain(chain.id);
      expect(result.serialized).toContain('(alt-path)');
    });

    test('should include reflection marker in serialized output', () => {
      const chain = tc.createChain('start');
      tc.reflectOnStep(chain.id, 'step_1', { correction: 'fix', explanation: 'e' });
      const result = tc.getChain(chain.id);
      expect(result.serialized).toContain('[REFLECTION]');
    });

    test('should return null for non-existent chain', () => {
      expect(tc.getChain('invalid')).toBeNull();
    });

    test('should mark unknown branch in serialized output', () => {
      const chain = tc.createChain('start');
      tc.addThought(chain.id, 'orphan thought', { branchId: 'nonexistent_branch' });
      const result = tc.getChain(chain.id);
      expect(result.serialized).toContain('(unknown)');
    });
  });

  describe('getAllChains', () => {
    test('should return all chains summary', () => {
      tc.createChain('first');
      tc.createChain('second', { task: 'test' });
      const all = tc.getAllChains();
      expect(all).toHaveLength(2);
      expect(all[0].id).toBeDefined();
      expect(all[0].thoughtCount).toBe(1);
      expect(all[1].thoughtCount).toBe(1);
    });

    test('should include branches in summary when present', () => {
      const chain = tc.createChain('main');
      tc.createBranch(chain.id, 'step_1', 'alt', 'd');
      const all = tc.getAllChains();
      expect(all[0].branches).toHaveLength(1);
      expect(all[0].branches[0].name).toBe('alt');
    });
  });

  describe('addReflection', () => {
    test('should add criticism to thought', () => {
      const chain = tc.createChain('start');
      const result = tc.addReflection(chain.id, 'step_1', 'should be improved');
      expect(chain.thoughts[0].reflection).toBe('should be improved');
      expect(chain.thoughts[0].reflectionOf).toBe('step_1');
      expect(chain.thoughts[0].reflectedAt).toBeDefined();
      expect(chain.updatedAt).toBeDefined();
      expect(result).toBeDefined();
    });

    test('should throw for non-existent chain', () => {
      expect(() => tc.addReflection('invalid', 'step_1', 'crit')).toThrow('Chain not found: invalid');
    });

    test('should throw for non-existent thought', () => {
      const chain = tc.createChain('start');
      expect(() => tc.addReflection(chain.id, 'step_99', 'crit')).toThrow('Thought not found: step_99');
    });
  });

  describe('getBranches', () => {
    test('should return branches', () => {
      const chain = tc.createChain('start');
      tc.createBranch(chain.id, 'step_1', 'alt', 'd');
      const branches = tc.getBranches(chain.id);
      expect(branches).toHaveLength(1);
      expect(branches[0].name).toBe('alt');
    });

    test('should return empty array for non-existent chain', () => {
      expect(tc.getBranches('invalid')).toEqual([]);
    });
  });

  describe('getBranchThoughts', () => {
    test('should return thoughts for a branch', () => {
      const chain = tc.createChain('start');
      const branch = tc.createBranch(chain.id, 'step_1', 'alt', 'd');
      tc.addThought(chain.id, 'branch thought', { branchId: branch.id });
      const thoughts = tc.getBranchThoughts(chain.id, branch.id);
      expect(thoughts).toHaveLength(1);
      expect(thoughts[0].thought).toBe('branch thought');
    });

    test('should return empty array for non-existent chain', () => {
      expect(tc.getBranchThoughts('invalid', 'b1')).toEqual([]);
    });
  });

  describe('toResource', () => {
    test('should return MCP resource format', () => {
      const chain = tc.createChain('thinking about X');
      const resource = tc.toResource(chain.id);
      expect(resource.uri).toMatch(/^thinking:\/\//);
      expect(resource.name).toContain('推理链');
      expect(resource.description).toContain('1');
      expect(resource.mimeType).toBe('text/plain');
      expect(resource.content).toBeDefined();
    });

    test('should return null for non-existent chain', () => {
      expect(tc.toResource('invalid')).toBeNull();
    });
  });

  describe('serialize', () => {
    test('should return serialized chain', () => {
      const chain = tc.createChain('start', { task: 'test' });
      tc.addThought(chain.id, 'second');
      const serialized = tc.serialize(chain.id);
      expect(serialized.id).toBe(chain.id);
      expect(serialized.metadata).toEqual({ task: 'test' });
      expect(serialized.steps).toHaveLength(2);
      expect(serialized.steps[0].number).toBe(1);
      expect(serialized.steps[0].thought).toBe('start');
      expect(serialized.steps[0].hasReflection).toBe(false);
      expect(serialized.steps[0].branch).toBeNull();
      expect(serialized.branches).toEqual([]);
      expect(serialized.currentBranch).toBeNull();
    });

    test('should include branch info in steps', () => {
      const chain = tc.createChain('start');
      const branch = tc.createBranch(chain.id, 'step_1', 'alt', 'd');
      tc.addThought(chain.id, 'branch thought', { branchId: branch.id });
      const serialized = tc.serialize(chain.id);
      const branchStep = serialized.steps.find((s) => s.thought === 'branch thought');
      expect(branchStep.branch).toBe('alt');
    });

    test('should return null for non-existent chain', () => {
      expect(tc.serialize('invalid')).toBeNull();
    });
  });

  describe('generateSummary', () => {
    test('should generate summary', () => {
      const chain = tc.createChain('start');
      tc.addThought(chain.id, 'middle');
      tc.addThought(chain.id, 'end');
      const summary = tc.generateSummary(chain);
      expect(summary.totalSteps).toBe(3);
      expect(summary.branches).toBe(0);
      expect(summary.reflections).toBe(0);
      expect(summary.currentStep).toBe(3);
      expect(summary.status).toBe('in_progress');
    });

    test('should count reflections', () => {
      const chain = tc.createChain('start');
      tc.reflectOnStep(chain.id, 'step_1', { correction: 'fix', explanation: 'e' });
      const summary = tc.generateSummary(chain);
      expect(summary.reflections).toBe(1);
    });

    test('should include branches count', () => {
      const chain = tc.createChain('start');
      tc.createBranch(chain.id, 'step_1', 'alt', 'd');
      const summary = tc.generateSummary(chain);
      expect(summary.branches).toBe(1);
    });
  });

  describe('calculateDuration', () => {
    test('should return null for single thought', () => {
      const chain = tc.createChain('start');
      expect(tc.calculateDuration(chain)).toBeNull();
    });

    test('should return seconds for short duration', () => {
      const chain = tc.createChain('start');
      chain.thoughts[0].timestamp = new Date(Date.now() - 5000).toISOString();
      tc.addThought(chain.id, 'next');
      const dur = tc.calculateDuration(chain);
      expect(dur).toMatch(/^\d+s$/);
    });

    test('should return minutes for medium duration', () => {
      const chain = tc.createChain('start');
      chain.thoughts[0].timestamp = new Date(Date.now() - 120000).toISOString();
      tc.addThought(chain.id, 'next');
      const dur = tc.calculateDuration(chain);
      expect(dur).toMatch(/^\d+m$/);
    });

    test('should return hours for long duration', () => {
      const chain = tc.createChain('start');
      chain.thoughts[0].timestamp = new Date(Date.now() - 7200000).toISOString();
      tc.addThought(chain.id, 'next');
      const dur = tc.calculateDuration(chain);
      expect(dur).toMatch(/^\d+h$/);
    });
  });

  describe('completeChain', () => {
    test('should mark chain as completed', () => {
      const chain = tc.createChain('start');
      const result = tc.completeChain(chain.id, 'final answer');
      expect(result.status).toBe('completed');
      expect(result.conclusion).toBe('final answer');
      expect(result.completedAt).toBeDefined();
    });

    test('should throw for non-existent chain', () => {
      expect(() => tc.completeChain('invalid', 'conclusion')).toThrow('Chain not found: invalid');
    });
  });

  describe('deleteChain', () => {
    test('should delete chain and return true', () => {
      const chain = tc.createChain('start');
      expect(tc.deleteChain(chain.id)).toBe(true);
      expect(tc.chains.has(chain.id)).toBe(false);
    });

    test('should clean up branches', () => {
      const chain = tc.createChain('start');
      const branch = tc.createBranch(chain.id, 'step_1', 'alt', 'd');
      tc.deleteChain(chain.id);
      expect(tc.branches.has(branch.id)).toBe(false);
    });

    test('should clear currentChainId if matches', () => {
      const chain = tc.createChain('start');
      tc.deleteChain(chain.id);
      expect(tc.currentChainId).toBeNull();
    });

    test('should not clear currentChainId when deleting different chain', () => {
      const chainA = tc.createChain('A');
      const chainB = tc.createChain('B');
      tc.deleteChain(chainA.id);
      expect(tc.currentChainId).toBe(chainB.id);
    });

    test('should return false for non-existent chain', () => {
      expect(tc.deleteChain('invalid')).toBe(false);
    });
  });

  describe('getCurrentChain', () => {
    test('should return current chain', () => {
      const chain = tc.createChain('start');
      const current = tc.getCurrentChain();
      expect(current.id).toBe(chain.id);
    });

    test('should return null when no current chain', () => {
      tc.createChain('start');
      tc.currentChainId = null;
      expect(tc.getCurrentChain()).toBeNull();
    });
  });

  describe('listChains', () => {
    test('should list all chains', () => {
      tc.createChain('first');
      tc.createChain('second');
      const list = tc.listChains();
      expect(list).toHaveLength(2);
      expect(list[0].steps).toBe(1);
      expect(list[0].branches).toBe(0);
      expect(list[0].status).toBe('in_progress');
    });
  });

  describe('singleton', () => {
    test('should export a singleton instance', () => {
      expect(thinkingChain).toBeInstanceOf(ThinkingChain);
    });
  });
});
