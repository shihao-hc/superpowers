const { ThinkingChain, thinkingChain } = require('../../src/mcp/engines/ThinkingChain');

describe('ThinkingChain', () => {
  let chain;

  beforeEach(() => {
    chain = new ThinkingChain();
  });

  describe('constructor', () => {
    it('initializes empty state', () => {
      expect(chain.chains.size).toBe(0);
      expect(chain.branches.size).toBe(0);
      expect(chain.currentChainId).toBeNull();
    });
  });

  describe('createChain', () => {
    it('creates a chain with initial thought', () => {
      const result = chain.createChain('Hello world');
      expect(result.id).toMatch(/^chain_/);
      expect(result.thoughts).toHaveLength(1);
      expect(result.thoughts[0].thought).toBe('Hello world');
      expect(result.status).toBe('in_progress');
    });

    it('stores metadata', () => {
      const result = chain.createChain('test', { source: 'cli' });
      expect(result.metadata.source).toBe('cli');
    });

    it('sets currentChainId', () => {
      const result = chain.createChain('first');
      expect(chain.currentChainId).toBe(result.id);
    });
  });

  describe('addThought', () => {
    it('adds a thought step to existing chain', () => {
      const { id } = chain.createChain('start');
      const step = chain.addThought(id, 'next step');
      expect(step.thoughtNumber).toBe(2);
      expect(step.nextThoughtNeeded).toBe(true);
    });

    it('throws for unknown chain', () => {
      expect(() => chain.addThought('nonexistent', 'x')).toThrow('Chain not found');
    });

    it('accepts options', () => {
      const { id } = chain.createChain('start');
      const step = chain.addThought(id, 'reflection', {
        nextThoughtNeeded: false,
        reasoning: 'because',
        criticism: 'bad',
        reflectionOf: 'step_1',
        branchId: null,
        metadata: { key: 'val' }
      });
      expect(step.reasoning).toBe('because');
      expect(step.criticism).toBe('bad');
      expect(step.reflectionOf).toBe('step_1');
      expect(step.metadata.key).toBe('val');
    });
  });

  describe('createBranch', () => {
    it('creates a branch from a thought', () => {
      const { id } = chain.createChain('start');
      chain.addThought(id, 'second');
      const branch = chain.createBranch(id, 'step_1', 'alt-path', 'try different');
      expect(branch.id).toMatch(/^branch_/);
      expect(branch.name).toBe('alt-path');
      expect(branch.parentThoughtId).toBe('step_1');
      expect(branch.direction).toBe('try different');
    });

    it('sets current branch', () => {
      const { id } = chain.createChain('start');
      const branch = chain.createBranch(id, 'step_1', 'alt');
      expect(chain.chains.get(id).currentBranch).toBe(branch.id);
    });

    it('throws for unknown chain', () => {
      expect(() => chain.createBranch('bad', 'step_1', 'a', 'b')).toThrow('Chain not found');
    });

    it('throws for unknown thought', () => {
      const { id } = chain.createChain('start');
      expect(() => chain.createBranch(id, 'step_99', 'a', 'b')).toThrow('Thought not found');
    });
  });

  describe('switchBranch', () => {
    it('switches to an existing branch', () => {
      const { id } = chain.createChain('start');
      const branch = chain.createBranch(id, 'step_1', 'alt');
      const result = chain.switchBranch(id, branch.id);
      expect(result.id).toBe(branch.id);
      expect(chain.chains.get(id).currentBranch).toBe(branch.id);
    });

    it('throws for unknown chain', () => {
      expect(() => chain.switchBranch('bad', 'b1')).toThrow('Chain not found');
    });

    it('throws for unknown branch', () => {
      const { id } = chain.createChain('start');
      expect(() => chain.switchBranch(id, 'bogus')).toThrow('Branch not found');
    });
  });

  describe('switchToMain', () => {
    it('resets currentBranch to null', () => {
      const { id } = chain.createChain('start');
      chain.createBranch(id, 'step_1', 'alt');
      const result = chain.switchToMain(id);
      expect(result.currentBranch).toBeNull();
    });

    it('throws for unknown chain', () => {
      expect(() => chain.switchToMain('bad')).toThrow('Chain not found');
    });
  });

  describe('reflectOnStep', () => {
    it('adds a correction thought', () => {
      const { id } = chain.createChain('start');
      const reflection = {
        correction: 'new thought',
        explanation: 'reason',
        criticism: 'original was wrong',
        improvement: 'better now'
      };
      const result = chain.reflectOnStep(id, 'step_1', reflection);
      expect(result.original).toBeDefined();
      expect(result.correction.thought).toBe('new thought');
      expect(result.correction.reflectionOf).toBe('step_1');
      expect(result.relationship).toBe('reflection_on_previous');
      expect(result.improvement).toBe('better now');
    });

    it('throws for unknown chain', () => {
      expect(() => chain.reflectOnStep('bad', 's1', {})).toThrow('Chain not found');
    });

    it('throws for unknown thought', () => {
      const { id } = chain.createChain('start');
      expect(() => chain.reflectOnStep(id, 'step_99', { correction: 'x', explanation: 'y' })).toThrow('Thought not found');
    });
  });

  describe('getChain', () => {
    it('returns null for unknown chain', () => {
      expect(chain.getChain('nonexistent')).toBeNull();
    });

    it('returns chain with serialized and summary', () => {
      const { id } = chain.createChain('first');
      const result = chain.getChain(id);
      expect(result.id).toBe(id);
      expect(result.serialized).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.serialized).toMatch(/^\[1\]/);
    });

    it('includes branch name in serialized output', () => {
      const { id } = chain.createChain('first');
      const branch = chain.createBranch(id, 'step_1', 'explore');
      chain.addThought(id, 'branch step', { branchId: branch.id });
      const result = chain.getChain(id);
      expect(result.serialized).toContain('(explore)');
    });
  });

  describe('getAllChains', () => {
    it('returns empty array when no chains', () => {
      expect(chain.getAllChains()).toEqual([]);
    });

    it('returns list of chain summaries', () => {
      chain.createChain('first');
      chain.createChain('second');
      const all = chain.getAllChains();
      expect(all).toHaveLength(2);
      expect(all[0].initialThought).toBe('first');
    });

    it('includes updatedAt after reflection', () => {
      const { id } = chain.createChain('test');
      chain.addReflection(id, 'step_1', 'critique');
      const all = chain.getAllChains();
      expect(all[0].updatedAt).toBeDefined();
    });
  });

  describe('addReflection', () => {
    it('adds criticism to a thought', () => {
      const { id } = chain.createChain('start');
      const result = chain.addReflection(id, 'step_1', 'this was wrong');
      expect(result).not.toBeNull();
      expect(chain.chains.get(id).thoughts[0].reflection).toBe('this was wrong');
    });

    it('throws for unknown chain', () => {
      expect(() => chain.addReflection('bad', 's1', 'x')).toThrow('Chain not found');
    });

    it('throws for unknown thought', () => {
      const { id } = chain.createChain('start');
      expect(() => chain.addReflection(id, 'step_99', 'x')).toThrow('Thought not found');
    });
  });

  describe('getBranches', () => {
    it('returns empty array for unknown chain', () => {
      expect(chain.getBranches('bad')).toEqual([]);
    });

    it('returns branches for chain', () => {
      const { id } = chain.createChain('start');
      const branch = chain.createBranch(id, 'step_1', 'explore');
      const branches = chain.getBranches(id);
      expect(branches).toHaveLength(1);
      expect(branches[0].id).toBe(branch.id);
    });
  });

  describe('getBranchThoughts', () => {
    it('returns empty for unknown chain', () => {
      expect(chain.getBranchThoughts('bad', 'b1')).toEqual([]);
    });

    it('returns thoughts on a branch', () => {
      const { id } = chain.createChain('start');
      const branch = chain.createBranch(id, 'step_1', 'explore');
      chain.addThought(id, 'branch step', { branchId: branch.id });
      chain.switchToMain(id);
      chain.addThought(id, 'main step');
      const thoughts = chain.getBranchThoughts(id, branch.id);
      expect(thoughts).toHaveLength(1);
      expect(thoughts[0].thought).toBe('branch step');
    });
  });

  describe('toResource', () => {
    it('returns null for unknown chain', () => {
      expect(chain.toResource('bad')).toBeNull();
    });

    it('returns MCP resource format', () => {
      const { id } = chain.createChain('hello');
      const resource = chain.toResource(id);
      expect(resource.uri).toMatch(/^thinking:\/\//);
      expect(resource.mimeType).toBe('text/plain');
      expect(resource.content).toBeDefined();
    });
  });

  describe('serialize', () => {
    it('returns null for unknown chain', () => {
      expect(chain.serialize('bad')).toBeNull();
    });

    it('returns structured chain data', () => {
      const { id } = chain.createChain('hello');
      const result = chain.serialize(id);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].thought).toBe('hello');
    });

    it('includes reflection info and branch name', () => {
      const { id } = chain.createChain('original');
      const branch = chain.createBranch(id, 'step_1', 'side');
      chain.addThought(id, 'branch step', { branchId: branch.id });
      chain.reflectOnStep(id, 'step_1', {
        correction: 'fixed', explanation: 'reason'
      });
      const serialized = chain.serialize(id);
      const reflectionStep = serialized.steps.find((s) => s.hasReflection);
      expect(reflectionStep).toBeDefined();
      const branchStep = serialized.steps.find((s) => s.branch);
      expect(branchStep.branch).toBe('side');
    });
  });

  describe('generateSummary', () => {
    it('returns summary stats', () => {
      const { id } = chain.createChain('start');
      chain.addThought(id, 'second');
      const summary = chain.generateSummary(chain.chains.get(id));
      expect(summary.totalSteps).toBe(2);
      expect(summary.currentStep).toBe(2);
      expect(summary.status).toBe('in_progress');
    });
  });

  describe('calculateDuration', () => {
    it('returns null with less than 2 thoughts', () => {
      const c = { thoughts: [{ timestamp: new Date().toISOString() }] };
      expect(chain.calculateDuration(c)).toBeNull();
    });

    it('returns seconds for short duration', () => {
      const now = new Date();
      const c = {
        thoughts: [
          { timestamp: now.toISOString() },
          { timestamp: new Date(now.getTime() + 30000).toISOString() }
        ]
      };
      expect(chain.calculateDuration(c)).toBe('30s');
    });

    it('returns minutes for medium duration', () => {
      const now = new Date();
      const c = {
        thoughts: [
          { timestamp: now.toISOString() },
          { timestamp: new Date(now.getTime() + 1800000).toISOString() }
        ]
      };
      expect(chain.calculateDuration(c)).toBe('30m');
    });

    it('returns hours for long duration', () => {
      const now = new Date();
      const c = {
        thoughts: [
          { timestamp: now.toISOString() },
          { timestamp: new Date(now.getTime() + 7200000).toISOString() }
        ]
      };
      expect(chain.calculateDuration(c)).toBe('2h');
    });
  });

  describe('completeChain', () => {
    it('marks chain as completed', () => {
      const { id } = chain.createChain('start');
      const result = chain.completeChain(id, 'we are done');
      expect(result.status).toBe('completed');
      expect(result.conclusion).toBe('we are done');
    });

    it('throws for unknown chain', () => {
      expect(() => chain.completeChain('bad', 'x')).toThrow('Chain not found');
    });
  });

  describe('deleteChain', () => {
    it('returns false for unknown chain', () => {
      expect(chain.deleteChain('bad')).toBe(false);
    });

    it('removes chain and resets currentChainId', () => {
      const { id } = chain.createChain('test');
      expect(chain.deleteChain(id)).toBe(true);
      expect(chain.chains.has(id)).toBe(false);
      expect(chain.currentChainId).toBeNull();
    });

    it('cleans up branch references', () => {
      const { id } = chain.createChain('test');
      const branch = chain.createBranch(id, 'step_1', 'alt');
      expect(chain.branches.has(branch.id)).toBe(true);
      chain.deleteChain(id);
      expect(chain.branches.has(branch.id)).toBe(false);
    });
  });

  describe('getCurrentChain', () => {
    it('returns null when no current chain', () => {
      expect(chain.getCurrentChain()).toBeNull();
    });

    it('returns the current chain', () => {
      const { id } = chain.createChain('test');
      const current = chain.getCurrentChain();
      expect(current.id).toBe(id);
    });
  });

  describe('listChains', () => {
    it('returns empty when no chains', () => {
      expect(chain.listChains()).toEqual([]);
    });

    it('lists all chains', () => {
      chain.createChain('first');
      chain.createChain('second');
      const list = chain.listChains();
      expect(list).toHaveLength(2);
      expect(list[0].status).toBe('in_progress');
    });
  });

  describe('singleton', () => {
    it('thinkingChain is a ThinkingChain instance', () => {
      expect(thinkingChain).toBeInstanceOf(ThinkingChain);
    });
  });
});
