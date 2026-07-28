jest.mock('fs');
jest.mock('../../src/skills/SkillLoader', () => {
  return {
    SkillLoader: jest.fn().mockImplementation(() => ({
      loadAll: jest.fn().mockReturnValue([]),
      loadSkill: jest.fn().mockReturnValue(null),
      getSkill: jest.fn().mockReturnValue(null),
      getAllSkills: jest.fn().mockReturnValue([]),
    })),
  };
});
jest.mock('../../src/skills/SkillToNode', () => {
  return {
    SkillToNode: jest.fn().mockImplementation(() => ({
      convertSkillToNodes: jest.fn().mockResolvedValue(undefined),
      clearConvertedNodes: jest.fn(),
    })),
  };
});
jest.mock('../../src/skills/SkillToMCP', () => {
  return {
    SkillToMCP: jest.fn().mockImplementation(() => ({
      convertSkillToMCPTools: jest.fn().mockResolvedValue(undefined),
      clearRegisteredTools: jest.fn(),
    })),
  };
});

const fs = require('fs');
const _path = require('path');
const { SkillManager } = require('../../src/skills/SkillManager');
const { SkillLoader } = require('../../src/skills/SkillLoader');
const { SkillToNode } = require('../../src/skills/SkillToNode');
const { SkillToMCP } = require('../../src/skills/SkillToMCP');

describe('SkillManager', () => {
  let manager;
  let mockLoader;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new SkillManager({ skillsDir: '/fake/skills' });
    mockLoader = manager.skillLoader;
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const m = new SkillManager();
      expect(m.skillsDir).toContain('skills-source');
      expect(m.loadedSkills).toBeInstanceOf(Set);
      expect(m.enabledSkills).toBeInstanceOf(Set);
      expect(m.watchers).toBeInstanceOf(Map);
      expect(m.skillToNode).toBeNull();
      expect(m.skillToMCP).toBeNull();
    });

    it('should initialize with custom options', () => {
      expect(manager.skillsDir).toBe('/fake/skills');
      expect(manager.options.skillsDir).toBe('/fake/skills');
    });

    it('should create a SkillLoader instance', () => {
      expect(SkillLoader).toHaveBeenCalledWith('/fake/skills');
      expect(manager.skillLoader).toBeTruthy();
    });
  });

  describe('initialize', () => {
    it('should create SkillToNode and SkillToMCP instances', () => {
      const workflowEngine = {};
      const mcpBridge = {};
      manager.initialize(workflowEngine, mcpBridge);
      expect(SkillToNode).toHaveBeenCalledWith(workflowEngine, mcpBridge, manager.skillLoader);
      expect(SkillToMCP).toHaveBeenCalledWith(mcpBridge, manager.skillLoader);
      expect(manager.skillToNode).toBeTruthy();
      expect(manager.skillToMCP).toBeTruthy();
    });
  });

  describe('loadAllSkills', () => {
    it('should delegate to skillLoader.loadAll', () => {
      manager.loadAllSkills();
      expect(mockLoader.loadAll).toHaveBeenCalled();
    });

    it('should return loaded skills', () => {
      mockLoader.loadAll.mockReturnValue([{ name: 's1' }]);
      const result = manager.loadAllSkills();
      expect(result).toEqual([{ name: 's1' }]);
    });
  });

  describe('loadSkill', () => {
    it('should delegate to skillLoader.loadSkill', () => {
      manager.loadSkill('my-skill');
      expect(mockLoader.loadSkill).toHaveBeenCalledWith('my-skill');
    });

    it('should return skill when found', () => {
      mockLoader.loadSkill.mockReturnValue({ name: 'my-skill', version: '1.0.0' });
      const result = manager.loadSkill('my-skill');
      expect(result.name).toBe('my-skill');
    });

    it('should return null when skill not found', () => {
      const result = manager.loadSkill('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('isEnabled', () => {
    it('should return false for non-enabled skills', () => {
      expect(manager.isEnabled('any-skill')).toBe(false);
    });

    it('should return true for enabled skills', () => {
      manager.enabledSkills.add('my-skill');
      expect(manager.isEnabled('my-skill')).toBe(true);
    });
  });

  describe('getLoadedSkills', () => {
    it('should return empty array initially', () => {
      expect(manager.getLoadedSkills()).toEqual([]);
    });

    it('should return loaded skill names', () => {
      manager.loadedSkills.add('s1');
      manager.loadedSkills.add('s2');
      expect(manager.getLoadedSkills()).toEqual(['s1', 's2']);
    });
  });

  describe('getEnabledSkills', () => {
    it('should return empty array initially', () => {
      expect(manager.getEnabledSkills()).toEqual([]);
    });

    it('should return enabled skill names', () => {
      manager.enabledSkills.add('s1');
      expect(manager.getEnabledSkills()).toEqual(['s1']);
    });
  });

  describe('getAllAvailableSkills', () => {
    it('should delegate to skillLoader.getAllSkills', () => {
      manager.getAllAvailableSkills();
      expect(mockLoader.getAllSkills).toHaveBeenCalled();
    });
  });

  describe('getAllSkills', () => {
    it('should return skills with enabled status', () => {
      mockLoader.getAllSkills.mockReturnValue([
        { name: 's1' },
        { name: 's2' },
      ]);
      manager.enabledSkills.add('s1');
      const result = manager.getAllSkills();
      expect(result).toEqual([
        { name: 's1', enabled: true },
        { name: 's2', enabled: false },
      ]);
    });

    it('should return empty array when no skills available', () => {
      mockLoader.getAllSkills.mockReturnValue([]);
      expect(manager.getAllSkills()).toEqual([]);
    });
  });

  describe('getSkillInfo', () => {
    it('should return skill info with enabled status', () => {
      mockLoader.getSkill.mockReturnValue({ name: 's1', version: '1.0.0' });
      manager.enabledSkills.add('s1');
      const info = manager.getSkillInfo('s1');
      expect(info.name).toBe('s1');
      expect(info.enabled).toBe(true);
    });

    it('should return null for nonexistent skill', () => {
      mockLoader.getSkill.mockReturnValue(null);
      expect(manager.getSkillInfo('nonexistent')).toBeNull();
    });
  });

  describe('enableSkill', () => {
    it('should throw when skill not found', async () => {
      mockLoader.getSkill.mockReturnValue(null);
      mockLoader.loadSkill.mockReturnValue(null);
      await expect(manager.enableSkill('nonexistent')).rejects.toThrow('Skill not found: nonexistent');
    });

    it('should convert to nodes and MCP tools when initialized', async () => {
      mockLoader.getSkill.mockReturnValue({ name: 's1', version: '1.0.0' });
      manager.initialize({}, {});
      const result = await manager.enableSkill('s1');
      expect(manager.enabledSkills.has('s1')).toBe(true);
      expect(manager.loadedSkills.has('s1')).toBe(true);
      expect(result.name).toBe('s1');
    });

    it('should skip node/MCP conversion when not initialized', async () => {
      mockLoader.getSkill.mockReturnValue({ name: 's1', version: '1.0.0' });
      const result = await manager.enableSkill('s1');
      expect(result.name).toBe('s1');
      expect(manager.enabledSkills.has('s1')).toBe(true);
    });

    it('should skip node conversion when convertToNodes is false', async () => {
      manager = new SkillManager({ skillsDir: '/fake', convertToNodes: false });
      mockLoader = manager.skillLoader;
      mockLoader.getSkill.mockReturnValue({ name: 's1', version: '1.0.0' });
      manager.initialize({}, {});
      await manager.enableSkill('s1');
      expect(manager.skillToNode.convertSkillToNodes).not.toHaveBeenCalled();
    });

    it('should skip MCP conversion when convertToMCP is false', async () => {
      manager = new SkillManager({ skillsDir: '/fake', convertToMCP: false });
      mockLoader = manager.skillLoader;
      mockLoader.getSkill.mockReturnValue({ name: 's1', version: '1.0.0' });
      manager.initialize({}, {});
      await manager.enableSkill('s1');
      expect(manager.skillToMCP.convertSkillToMCPTools).not.toHaveBeenCalled();
    });

    it('should try loading skill first if not found via getSkill', async () => {
      const skillObj = { name: 's1', version: '1.0.0' };
      mockLoader.getSkill
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(skillObj);
      mockLoader.loadSkill.mockReturnValue(skillObj);
      await expect(manager.enableSkill('s1')).rejects.toThrow();
      expect(mockLoader.loadSkill).toHaveBeenCalledWith('s1');
    });

    it('should setup file watcher when hotReload is not false', async () => {
      mockLoader.getSkill.mockReturnValue({ name: 's1', version: '1.0.0' });
      fs.existsSync.mockReturnValue(true);
      fs.watch.mockReturnValue({ close: jest.fn() });
      await manager.enableSkill('s1');
      expect(manager.watchers.has('s1')).toBe(true);
    });

    it('should skip file watcher when hotReload is false', async () => {
      manager = new SkillManager({ skillsDir: '/fake', hotReload: false });
      mockLoader = manager.skillLoader;
      mockLoader.getSkill.mockReturnValue({ name: 's1', version: '1.0.0' });
      await manager.enableSkill('s1');
      expect(manager.watchers.has('s1')).toBe(false);
    });
  });

  describe('disableSkill', () => {
    it('should remove from loadedSkills and enabledSkills', async () => {
      manager.loadedSkills.add('s1');
      manager.enabledSkills.add('s1');
      await manager.disableSkill('s1');
      expect(manager.enabledSkills.has('s1')).toBe(false);
      expect(manager.loadedSkills.has('s1')).toBe(false);
    });

    it('should close and remove file watcher', async () => {
      const closeFn = jest.fn();
      manager.watchers.set('s1', { close: closeFn });
      await manager.disableSkill('s1');
      expect(closeFn).toHaveBeenCalled();
      expect(manager.watchers.has('s1')).toBe(false);
    });

    it('should clear converted nodes and tools when initialized', async () => {
      manager.initialize({}, {});
      await manager.disableSkill('s1');
      expect(manager.skillToNode.clearConvertedNodes).toHaveBeenCalled();
      expect(manager.skillToMCP.clearRegisteredTools).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should close all watchers', () => {
      const close1 = jest.fn();
      const close2 = jest.fn();
      manager.watchers.set('s1', { close: close1 });
      manager.watchers.set('s2', { close: close2 });
      manager.cleanup();
      expect(close1).toHaveBeenCalled();
      expect(close2).toHaveBeenCalled();
      expect(manager.watchers.size).toBe(0);
    });
  });

  describe('loadAll (alias)', () => {
    it('should be an alias for loadAllSkills', async () => {
      mockLoader.loadAll.mockReturnValue([{ name: 's1' }]);
      const result = await manager.loadAll();
      expect(mockLoader.loadAll).toHaveBeenCalled();
      expect(result).toEqual([{ name: 's1' }]);
    });
  });
});
