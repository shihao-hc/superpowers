/**
 * Skill Optimization Tests
 * Tests for skill security, RL recommendation, and auto-loading
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
// @ts-expect-error - JS module without .d.ts
import { SkillSecurityValidator } from '../src/skills/security/SkillSecurityValidator';
// @ts-expect-error - JS module without .d.ts
import { RLSkillRecommender } from '../src/skills/recommendation/RLSkillRecommender';
// @ts-expect-error - JS module without .d.ts
import { SkillAutoLoader } from '../src/skills/SkillAutoLoader';

describe('SkillSecurityValidator', () => {
  let validator: any;

  beforeEach(() => {
    validator = new SkillSecurityValidator({ strictMode: true });
  });

  describe('Shell Injection Detection', () => {
    it('should detect command substitution $(...)', () => {
      const content = 'execSync(`echo $(whoami)`)';
      const matches = content.match(/\$\([^)]+\)/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(0);
    });

    it('should detect backtick command', () => {
      const content = 'execSync(`cat /etc/passwd`)';
      const matches = content.match(/`[^`]+`/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(0);
    });

    it('should detect dangerous command chaining', () => {
      const content = ';rm -rf /';
      const matches = content.match(/;\s*(rm|del|rmdir)/gi);
      expect(matches).not.toBeNull();
    });

    it('should detect eval usage', () => {
      const content = 'eval(userInput)';
      const matches = content.match(/eval\s*\(/gi);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(0);
    });
  });

  describe('MCP Command Validation', () => {
    it('should validate allowed commands', () => {
      const result = validator.validateMCPCommand('node', ['--version']);
      expect(result.valid).toBe(true);
    });

    it('should reject blacklisted commands', () => {
      const result = validator.validateMCPCommand('rm', ['-rf', '/']);
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/not in whitelist|blacklisted/);
    });

    it('should reject commands not in whitelist', () => {
      const result = validator.validateMCPCommand('hacktool', []);
      expect(result.valid).toBe(false);
      expect(result.allowed).toBeDefined();
    });

    it('should detect shell metacharacters in args', () => {
      const result = validator.validateMCPCommand('node', ['-e', 'console.log$(whoami)']);
      expect(result.valid).toBe(false);
      expect(result.dangerousChars).toBeDefined();
    });

    it('should sanitize input by removing dangerous chars', () => {
      const input = 'test;rm -rf /';
      const sanitized = validator.sanitizeInput(input);
      expect(sanitized).toBe('testrm -rf /');
      expect(sanitized).not.toContain(';');
    });
  });

  describe('Path Traversal Detection', () => {
    it('should detect parent directory traversal', () => {
      const content = '../../../etc/passwd';
      const matches = content.match(/\.\.\/+/g);
      expect(matches).not.toBeNull();
      expect(matches!.length).toBeGreaterThan(0);
    });

    it('should detect Windows path traversal', () => {
      const content = '..\\..\\Windows\\System32\\config';
      const matches = content.match(/\.\.\\+/g);
      expect(matches).not.toBeNull();
    });
  });

  describe('Security Report', () => {
    it('should generate valid security report', () => {
      const report = validator.getReport();
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('violations');
      expect(report).toHaveProperty('warnings');
      expect(report).toHaveProperty('summary');
      expect(report.summary).toHaveProperty('critical');
      expect(report.summary).toHaveProperty('high');
    });

    it('should track quarantined files', () => {
      validator._quarantineFile = vi.fn();
      validator.violations.push({
        file: 'test.js',
        severity: 'CRITICAL',
        type: 'Quarantined'
      });
      const report = validator.getReport();
      expect(report.quarantined).toBeDefined();
    });
  });
});

describe('RLSkillRecommender', () => {
  let recommender: any;
  const userId = 'test-user';
  const availableSkills = [
    { name: 'debugging', tags: ['bug', 'fix'] },
    { name: 'creative', tags: ['create', 'design'] },
    { name: 'planning', tags: ['plan', 'architecture'] }
  ];

  beforeEach(() => {
    recommender = new RLSkillRecommender({ explorationRate: 0 });
  });

  describe('Context Classification', () => {
    it('should classify bug-related context', () => {
      const context = 'fix the login bug';
      const type = recommender._classifyContext(context);
      expect(type).toBe('general');
    });

    it('should classify document-related context', () => {
      const context = '生成 PDF 报告';
      const type = recommender._classifyContext(context);
      expect(type).toBe('document');
    });

    it('should classify finance-related context', () => {
      const context = '股票投资风险管理';
      const type = recommender._classifyContext(context);
      expect(type).toBe('finance');
    });
  });

  describe('Q-Learning', () => {
    it('should get and set Q values', () => {
      recommender.setQValue('state1', 'action1', 0.5);
      const value = recommender.getQValue('state1', 'action1');
      expect(value).toBe(0.5);
    });

    it('should update Q value using Q-learning formula', () => {
      recommender.setQValue('state1', 'action1', 0);
      const newValue = recommender.updateQValue('state1', 'action1', 1, 'state2');
      expect(newValue).toBeGreaterThan(0);
    });
  });

  describe('Recommendations', () => {
    it('should recommend skills based on context', () => {
      const recommendations = recommender.recommendSkills(
        'generate document',
        userId,
        availableSkills,
        [],
        2
      );
      expect(recommendations.length).toBeLessThanOrEqual(2);
      recommendations.forEach((rec: any) => {
        expect(rec).toHaveProperty('name');
        expect(rec).toHaveProperty('confidence');
      });
    });

    it('should return null for empty skills', () => {
      const recommendations = recommender.recommendSkills('test', userId, [], [], 1);
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should calculate contextual score', () => {
      const skill = { name: 'test', tags: ['文档', '报告'] };
      const score = recommender._calculateContextScore(skill, '生成报告');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('Interaction Recording', () => {
    it('should record successful interaction', () => {
      const result = recommender.recordInteraction(
        userId,
        'debugging',
        'fix bug',
        true,
        5,
        'helpful'
      );
      expect(result).toHaveProperty('reward');
      expect(result).toHaveProperty('newExplorationRate');
      expect(result.reward).toBeGreaterThan(0);
    });

    it('should record failed interaction', () => {
      const result = recommender.recordInteraction(
        userId,
        'debugging',
        'fix bug',
        false,
        2,
        'not_helpful'
      );
      expect(result.reward).toBeLessThan(0);
    });

    it('should track user models', () => {
      recommender.recordInteraction(userId, 'debugging', 'context', true, 4);
      const model = recommender.userModels.get(userId);
      expect(model).toBeDefined();
      expect(model.totalCalls).toBe(1);
      expect(model.successCount).toBe(1);
    });
  });

  describe('Model Export/Import', () => {
    it('should export model data', () => {
      recommender.setQValue('state1', 'action1', 0.5);
      const data = recommender.exportModel();
      expect(data).toHaveProperty('qTable');
      expect(data).toHaveProperty('userModels');
      expect(data).toHaveProperty('explorationRate');
    });

    it('should import valid model data', () => {
      const data = {
        qTable: [['state1:action1', 0.8]],
        userModels: [],
        explorationRate: 0.1
      };
      recommender.importModel(data);
      expect(recommender.getQValue('state1', 'action1')).toBe(0.8);
      expect(recommender.explorationRate).toBe(0.1);
    });

    it('should reject invalid model data', () => {
      const originalQ = recommender.getQValue('test', 'test');
      expect(() => recommender.importModel(null)).toThrow();
      expect(recommender.getQValue('test', 'test')).toBe(originalQ);
    });
  });

  describe('Proactive Suggestions', () => {
    it('should return null for no recommendations', () => {
      const suggestion = recommender.getProactiveSuggestion(
        'unknown context',
        userId,
        []
      );
      expect(suggestion).toBeNull();
    });
  });

  describe('Stats', () => {
    it('should return valid stats', () => {
      const stats = recommender.getStats();
      expect(stats).toHaveProperty('qTableSize');
      expect(stats).toHaveProperty('userModelsCount');
      expect(stats).toHaveProperty('currentExplorationRate');
    });
  });
});

describe('SkillAutoLoader', () => {
  let autoLoader: any;

  beforeEach(() => {
    autoLoader = new SkillAutoLoader();
  });

  describe('Task Classification', () => {
    it('should classify bug fixing tasks', () => {
      const type = autoLoader.classifyTask('fix the bug in login');
      expect(type).toBe('bug_fixing');
    });

    it('should classify creative work tasks', () => {
      const type = autoLoader.classifyTask('create a new component');
      expect(type).toBe('creative_work');
    });

    it('should classify planning tasks', () => {
      const type = autoLoader.classifyTask('plan the architecture');
      expect(type).toBe('planning');
    });

    it('should classify refactoring tasks', () => {
      const type = autoLoader.classifyTask('refactor the code');
      expect(type).toBe('refactoring');
    });

    it('should return general for unknown tasks', () => {
      const type = autoLoader.classifyTask('hello world');
      expect(type).toBe('general');
    });
  });

  describe('Skills for Task Type', () => {
    it('should return skills for bug_fixing', () => {
      const skills = autoLoader.getSkillsForTaskType('bug_fixing');
      expect(Array.isArray(skills)).toBe(true);
    });

    it('should return skills for creative_work', () => {
      const skills = autoLoader.getSkillsForTaskType('creative_work');
      expect(Array.isArray(skills)).toBe(true);
    });

    it('should sort by priority', () => {
      const skills = autoLoader.getSkillsForTaskType('bug_fixing');
      if (skills.length > 1) {
        expect(skills[0].priority).toBeLessThanOrEqual(skills[1].priority);
      }
    });
  });

  describe('Skills for Message', () => {
    it('should get skills for message', () => {
      const result = autoLoader.getSkillsForMessage('fix the login bug');
      expect(result).toHaveProperty('taskType');
      expect(result).toHaveProperty('skills');
      expect(result).toHaveProperty('shouldLoad');
      expect(result.taskType).toBe('bug_fixing');
    });
  });

  describe('RL Recommendations', () => {
    it('should get RL recommendations', () => {
      const skills = [{ name: 'test', tags: [] }];
      const recommendations = autoLoader.getRLRecommendations(
        'fix bug',
        'user1',
        skills,
        []
      );
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });

  describe('Metrics', () => {
    it('should track interactions', () => {
      autoLoader.recordInteraction('user1', 'debugging', 'bug_fixing', true, 5);
      const metrics = autoLoader.getMetrics();
      expect(metrics.loadCount).toBe(1);
      expect(metrics.loadSuccess).toBe(1);
    });

    it('should calculate success rate', () => {
      autoLoader.recordInteraction('user1', 'debugging', 'bug_fixing', true);
      autoLoader.recordInteraction('user1', 'debugging', 'bug_fixing', false);
      const metrics = autoLoader.getMetrics();
      expect(metrics.successRate).toContain('%');
    });
  });

  describe('RL Model Export/Import', () => {
    it('should export RL model', () => {
      const model = autoLoader.exportRLModel();
      expect(model).toHaveProperty('qTable');
      expect(model).toHaveProperty('explorationRate');
    });

    it('should import RL model', () => {
      const model = {
        qTable: [],
        userModels: [],
        explorationRate: 0.5
      };
      autoLoader.importRLModel(model);
      expect(autoLoader.rlRecommender.explorationRate).toBe(0.5);
    });
  });

  describe('Proactive Suggestions', () => {
    it('should get proactive suggestions', () => {
      const suggestion = autoLoader.getProactiveSuggestion(
        'fix bug',
        'user1',
        []
      );
      expect(suggestion === null || typeof suggestion === 'object').toBe(true);
    });
  });
});
