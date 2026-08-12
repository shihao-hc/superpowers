jest.mock('fs');
jest.mock('../../src/skills/recommendation/RLSkillRecommender', () => {
  return {
    RLSkillRecommender: jest.fn().mockImplementation(() => ({
      recommendSkills: jest.fn().mockReturnValue([]),
      recordInteraction: jest.fn().mockReturnValue({ success: true }),
      getStats: jest.fn().mockReturnValue({ totalInteractions: 0 }),
      exportModel: jest.fn().mockReturnValue({ version: 1 }),
      importModel: jest.fn(),
      getProactiveSuggestion: jest.fn().mockReturnValue(null),
    })),
  };
});
jest.mock('../../src/skills/security/SkillSecurityValidator', () => {
  return {
    SkillSecurityValidator: jest.fn().mockImplementation(() => ({
      validateSkill: jest.fn().mockReturnValue({ valid: true, errors: [] }),
    })),
  };
});

const fs = require('fs');
const _path = require('path');
const { SkillAutoLoader } = require('../../src/skills/SkillAutoLoader');

describe('SkillAutoLoader', () => {
  let autoLoader;
  const configPath = '/fake/.opencode/skill-auto-load.json';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should load config from file when it exists', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        skillAutoLoad: { enabled: true, loadOnStartup: ['using-superpowers'] },
        rules: { requireSkillBeforeAction: true },
        behavior: { skills: {} },
      }));
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.config).toBeTruthy();
      expect(autoLoader.isEnabled()).toBe(true);
    });

    it('should use default config when file not found', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.config).toBeTruthy();
      expect(autoLoader.config.skillAutoLoad.loadOnStartup).toEqual(['using-superpowers']);
    });

    it('should use default config on parse error', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('not json');
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.config).toBeTruthy();
    });

    it('should initialize with default metrics', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.metrics.loadCount).toBe(0);
      expect(autoLoader.metrics.loadSuccess).toBe(0);
      expect(autoLoader.metrics.loadFailure).toBe(0);
    });

    it('should use default configPath when not provided', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader();
      expect(autoLoader.configPath).toContain('skill-auto-load.json');
      expect(autoLoader.config).toBeTruthy();
    });
  });

  describe('isEnabled', () => {
    it('should return true when enabled is true', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        skillAutoLoad: { enabled: true },
      }));
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.isEnabled()).toBe(true);
    });

    it('should return false when enabled is false', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        skillAutoLoad: { enabled: false },
      }));
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.isEnabled()).toBe(false);
    });

    it('should return true when enabled key is missing (default)', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.isEnabled()).toBe(true);
    });
  });

  describe('getStartupSkills', () => {
    it('should return startup skills from config', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        skillAutoLoad: { loadOnStartup: ['a', 'b', 'c'] },
      }));
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.getStartupSkills()).toEqual(['a', 'b', 'c']);
    });

    it('should return default when not configured', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.getStartupSkills()).toEqual(['using-superpowers']);
    });

    it('should fall back to default when loadOnStartup missing', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        skillAutoLoad: { enabled: true },
      }));
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.getStartupSkills()).toEqual(['using-superpowers']);
    });
  });

  describe('getConfiguredSkills', () => {
    it('should return configured skills', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        behavior: {
          skills: {
            'skill-a': { trigger: 'always', priority: 1 },
          },
        },
      }));
      autoLoader = new SkillAutoLoader({ configPath });
      const skills = autoLoader.getConfiguredSkills();
      expect(skills['skill-a']).toBeTruthy();
    });

    it('should return default configured skills when not configured', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      const skills = autoLoader.getConfiguredSkills();
      expect(skills).toHaveProperty('using-superpowers');
      expect(skills).toHaveProperty('brainstorming');
      expect(skills).toHaveProperty('systematic-debugging');
    });

    it('should return empty when behavior missing', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ skillAutoLoad: {} }));
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.getConfiguredSkills()).toEqual({});
    });
  });

  describe('classifyTask', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
    });

    it('should classify bug fixing tasks', () => {
      expect(autoLoader.classifyTask('fix this bug')).toBe('bug_fixing');
      expect(autoLoader.classifyTask('there is an error')).toBe('bug_fixing');
      expect(autoLoader.classifyTask('修复这个错误')).toBe('bug_fixing');
      expect(autoLoader.classifyTask('crash on startup')).toBe('bug_fixing');
      expect(autoLoader.classifyTask('exception thrown')).toBe('bug_fixing');
      expect(autoLoader.classifyTask('the issue is here')).toBe('bug_fixing');
      expect(autoLoader.classifyTask('失败了')).toBe('bug_fixing');
      expect(autoLoader.classifyTask('崩溃了')).toBe('bug_fixing');
      expect(autoLoader.classifyTask('异常')).toBe('bug_fixing');
      expect(autoLoader.classifyTask('问题')).toBe('bug_fixing');
    });

    it('should classify creative work tasks', () => {
      expect(autoLoader.classifyTask('create a new feature')).toBe('creative_work');
      expect(autoLoader.classifyTask('build something')).toBe('creative_work');
      expect(autoLoader.classifyTask('add functionality')).toBe('creative_work');
      expect(autoLoader.classifyTask('implement this')).toBe('creative_work');
      expect(autoLoader.classifyTask('新建功能')).toBe('creative_work');
      expect(autoLoader.classifyTask('创建组件')).toBe('creative_work');
      expect(autoLoader.classifyTask('开发模块')).toBe('creative_work');
      expect(autoLoader.classifyTask('实现接口')).toBe('creative_work');
      expect(autoLoader.classifyTask('添加特性')).toBe('creative_work');
    });

    it('should classify planning tasks', () => {
      expect(autoLoader.classifyTask('make a plan')).toBe('planning');
      expect(autoLoader.classifyTask('design the architecture')).toBe('planning');
      expect(autoLoader.classifyTask('规划项目')).toBe('planning');
      expect(autoLoader.classifyTask('设计系统')).toBe('planning');
      expect(autoLoader.classifyTask('架构设计')).toBe('planning');
    });

    it('should classify testing tasks', () => {
      expect(autoLoader.classifyTask('write a test')).toBe('testing');
      expect(autoLoader.classifyTask('run the test suite')).toBe('testing');
      expect(autoLoader.classifyTask('check behavior')).toBe('testing');
      expect(autoLoader.classifyTask('运行测试')).toBe('testing');
      expect(autoLoader.classifyTask('验证结果')).toBe('testing');
    });

    it('should classify refactoring tasks', () => {
      expect(autoLoader.classifyTask('refactor this code')).toBe('refactoring');
      expect(autoLoader.classifyTask('optimize performance')).toBe('refactoring');
      expect(autoLoader.classifyTask('improve the module')).toBe('refactoring');
      expect(autoLoader.classifyTask('重构代码')).toBe('refactoring');
      expect(autoLoader.classifyTask('优化算法')).toBe('refactoring');
      expect(autoLoader.classifyTask('改进流程')).toBe('refactoring');
    });

    it('should return general for unmatched messages', () => {
      expect(autoLoader.classifyTask('hello world')).toBe('general');
      expect(autoLoader.classifyTask('what is 2+2')).toBe('general');
    });

    it('should prioritize bug fixing over creative work', () => {
      expect(autoLoader.classifyTask('fix the create button')).toBe('bug_fixing');
    });
  });

  describe('getSkillsForTaskType', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
    });

    it('should return skills matching task type', () => {
      const skills = autoLoader.getSkillsForTaskType('bug_fixing');
      const names = skills.map((s) => s.name);
      expect(names).toContain('systematic-debugging');
    });

    it('should always include always-trigger skills', () => {
      const skills = autoLoader.getSkillsForTaskType('unknown_type');
      const names = skills.map((s) => s.name);
      expect(names).toContain('using-superpowers');
    });

    it('should return skills sorted by priority', () => {
      const skills = autoLoader.getSkillsForTaskType('bug_fixing');
      for (let i = 1; i < skills.length; i++) {
        expect(skills[i].priority).toBeGreaterThanOrEqual(skills[i - 1].priority);
      }
    });

    it('should include name, priority, and description in results', () => {
      const skills = autoLoader.getSkillsForTaskType('bug_fixing');
      for (const s of skills) {
        expect(s).toHaveProperty('name');
        expect(s).toHaveProperty('priority');
        expect(s).toHaveProperty('description');
      }
    });

    it('should use default priority 999 when skill has no priority', () => {
      autoLoader.config.behavior.skills['no-priority'] = { trigger: 'always' };
      const skills = autoLoader.getSkillsForTaskType('anything');
      const skill = skills.find((s) => s.name === 'no-priority');
      expect(skill.priority).toBe(999);
    });
  });

  describe('getSkillsForMessage', () => {
    beforeEach(() => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
    });

    it('should classify and return matching skills', () => {
      const result = autoLoader.getSkillsForMessage('fix this bug');
      expect(result.taskType).toBe('bug_fixing');
      expect(result.skills).toContain('systematic-debugging');
      expect(result.shouldLoad).toBe(true);
    });

    it('should set shouldLoad false when no skills match', () => {
      // Remove all configured skills to test empty case
      autoLoader.config.behavior.skills = {};
      const result = autoLoader.getSkillsForMessage('some random text');
      expect(result.taskType).toBe('general');
      expect(result.skills).toEqual([]);
      expect(result.shouldLoad).toBe(false);
    });
  });

  describe('getRules', () => {
    it('should return rules from config', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        rules: { requireSkillBeforeAction: false, autoDiscovery: false },
      }));
      autoLoader = new SkillAutoLoader({ configPath });
      const rules = autoLoader.getRules();
      expect(rules.requireSkillBeforeAction).toBe(false);
    });

    it('should return defaults when config missing', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      const rules = autoLoader.getRules();
      expect(rules.requireSkillBeforeAction).toBe(true);
      expect(rules.fallbackSkill).toBe('using-superpowers');
    });

    it('should return defaults when config has no rules', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({ skillAutoLoad: { enabled: true } }));
      autoLoader = new SkillAutoLoader({ configPath });
      const rules = autoLoader.getRules();
      expect(rules.requireSkillBeforeAction).toBe(true);
      expect(rules.fallbackSkill).toBe('using-superpowers');
    });
  });

  describe('getMetrics', () => {
    it('should return initial zero metrics', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      const metrics = autoLoader.getMetrics();
      expect(metrics.loadCount).toBe(0);
      expect(metrics.successRate).toBe('0%');
    });

    it('should update metrics on recordInteraction', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      autoLoader.recordInteraction('user1', 'test-skill', 'bug_fixing', true, 5);
      const metrics = autoLoader.getMetrics();
      expect(metrics.loadCount).toBe(1);
      expect(metrics.loadSuccess).toBe(1);
      expect(metrics.byTaskType['bug_fixing'].total).toBe(1);
      expect(metrics.bySkill['test-skill'].total).toBe(1);
    });

    it('should track failures', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      autoLoader.recordInteraction('user1', 'test-skill', 'bug_fixing', false);
      const metrics = autoLoader.getMetrics();
      expect(metrics.loadFailure).toBe(1);
      expect(metrics.byTaskType['bug_fixing'].success).toBe(0);
    });

    it('should calculate correct success rate', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      autoLoader.recordInteraction('user1', 'a', 'ctx', true);
      autoLoader.recordInteraction('user1', 'b', 'ctx', true);
      autoLoader.recordInteraction('user1', 'c', 'ctx', false);
      const metrics = autoLoader.getMetrics();
      expect(metrics.successRate).toBe('66.67%');
    });

    it('should accumulate metrics for existing skill', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      autoLoader.recordInteraction('user1', 'skill-a', 'ctx', true);
      autoLoader.recordInteraction('user1', 'skill-a', 'ctx', false);
      const metrics = autoLoader.getMetrics();
      expect(metrics.bySkill['skill-a'].total).toBe(2);
      expect(metrics.bySkill['skill-a'].success).toBe(1);
    });
  });

  describe('recordInteraction', () => {
    it('should delegate to RL recommender', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      const result = autoLoader.recordInteraction('user1', 'skill-a', 'context', true, 4, 'good');
      expect(result).toEqual({ success: true });
      expect(autoLoader.rlRecommender.recordInteraction).toHaveBeenCalledWith(
        'user1', 'skill-a', 'context', true, 4, 'good'
      );
    });
  });

  describe('getRLRecommendations', () => {
    it('should delegate to RL recommender', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      autoLoader.getRLRecommendations('ctx', 'user1', ['s1'], []);
      expect(autoLoader.rlRecommender.recommendSkills).toHaveBeenCalledWith(
        'ctx', 'user1', ['s1'], [], 3
      );
    });

    it('should default conversationHistory to empty array', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      autoLoader.getRLRecommendations('ctx', 'user1', ['s1']);
      expect(autoLoader.rlRecommender.recommendSkills).toHaveBeenCalledWith(
        'ctx', 'user1', ['s1'], [], 3
      );
    });
  });

  describe('validateSkill', () => {
    it('should delegate to security validator', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      const result = autoLoader.validateSkill('/some/path');
      expect(result).toEqual({ valid: true, errors: [] });
      expect(autoLoader.securityValidator.validateSkill).toHaveBeenCalledWith('/some/path');
    });
  });

  describe('getProactiveSuggestion', () => {
    it('should delegate to RL recommender', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      autoLoader.getProactiveSuggestion('ctx', 'user1', []);
      expect(autoLoader.rlRecommender.getProactiveSuggestion).toHaveBeenCalledWith('ctx', 'user1', []);
    });

    it('should default conversationHistory to empty array', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      autoLoader.getProactiveSuggestion('ctx', 'user1');
      expect(autoLoader.rlRecommender.getProactiveSuggestion).toHaveBeenCalledWith('ctx', 'user1', []);
    });
  });

  describe('exportRLModel / importRLModel', () => {
    it('should delegate export to RL recommender', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      const data = autoLoader.exportRLModel();
      expect(data).toEqual({ version: 1 });
    });

    it('should delegate import to RL recommender', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      autoLoader.importRLModel({ some: 'data' });
      expect(autoLoader.rlRecommender.importModel).toHaveBeenCalledWith({ some: 'data' });
    });
  });

  describe('reload', () => {
    it('should reload config from disk', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      expect(autoLoader.getStartupSkills()).toEqual(['using-superpowers']);

      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        skillAutoLoad: { loadOnStartup: ['new-skill'] },
      }));
      autoLoader.reload();
      expect(autoLoader.getStartupSkills()).toEqual(['new-skill']);
    });
  });

  describe('getConfig', () => {
    it('should return full config object', () => {
      fs.existsSync.mockReturnValue(false);
      autoLoader = new SkillAutoLoader({ configPath });
      const config = autoLoader.getConfig();
      expect(config).toHaveProperty('skillAutoLoad');
      expect(config).toHaveProperty('rules');
      expect(config).toHaveProperty('behavior');
    });
  });
});
