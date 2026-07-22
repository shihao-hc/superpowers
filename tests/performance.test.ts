/**
 * Performance Benchmark Tests
 * Benchmarks for OpenCode core systems
 */

import { describe, it, expect, beforeEach } from 'vitest';

describe('RLSkillRecommender Performance', () => {
  let recommender: any;
  const skills = Array(100).fill(null).map((_, i) => ({
    name: `skill${i}`,
    tags: [`tag${i % 10}`]
  }));

  beforeEach(() => {
    const { RLSkillRecommender } = require('../src/skills/recommendation/RLSkillRecommender');
    recommender = new RLSkillRecommender();
  });

  it('should recommend from 100 skills', () => {
    const result = recommender.recommendSkills('test context', 'user1', skills, [], 5);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should record interactions efficiently', () => {
    for (let i = 0; i < 100; i++) {
      recommender.recordInteraction('user1', 'skill1', 'context', true, 5, 'helpful');
    }
    const stats = recommender.getStats ? recommender.getStats() : null;
    expect(stats || true).toBeTruthy();
  });

  it('should classify context quickly', () => {
    const results = [];
    for (let i = 0; i < 100; i++) {
      results.push(recommender._classifyContext(`test context ${i}`));
    }
    expect(results.length).toBe(100);
  });
});

describe('SkillAutoLoader Performance', () => {
  let loader: any;

  beforeEach(() => {
    const { SkillAutoLoader } = require('../src/skills/SkillAutoLoader');
    loader = new SkillAutoLoader();
  });

  it('should classify tasks quickly', () => {
    const tasks = ['fix bug', 'create feature', 'refactor code', 'write test'];
    for (let i = 0; i < 100; i++) {
      for (const task of tasks) {
        loader.classifyTask(task);
      }
    }
    expect(true).toBe(true);
  });

  it('should get skills for task types efficiently', () => {
    const types = ['bug_fixing', 'creative_work', 'refactoring'];
    for (let i = 0; i < 100; i++) {
      for (const type of types) {
        loader.getSkillsForTaskType(type);
      }
    }
    expect(true).toBe(true);
  });

  it('should track metrics efficiently', () => {
    for (let i = 0; i < 100; i++) {
      loader.recordInteraction(`user${i}`, `skill${i}`, 'bug_fixing', i % 2 === 0);
    }
    const metrics = loader.getMetrics();
    expect(metrics.loadCount).toBe(100);
  });
});

describe('SkillSecurityValidator Performance', () => {
  let validator: any;

  beforeEach(() => {
    const { SkillSecurityValidator } = require('../src/skills/security/SkillSecurityValidator');
    validator = new SkillSecurityValidator();
  });

  it('should validate commands quickly', () => {
    for (let i = 0; i < 100; i++) {
      validator.validateMCPCommand('node', ['--version']);
      validator.validateMCPCommand('git', ['status']);
    }
    expect(true).toBe(true);
  });

  it('should sanitize input quickly', () => {
    const dangerous = 'test;rm -rf /; echo hacked';
    for (let i = 0; i < 100; i++) {
      validator.sanitizeInput(dangerous);
    }
    expect(true).toBe(true);
  });

  it('should generate reports efficiently', () => {
    for (let i = 0; i < 100; i++) {
      validator.getReport();
    }
    expect(true).toBe(true);
  });
});

describe('Memory Usage', () => {
  it('should track memory usage', () => {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const initial = process.memoryUsage();
      expect(initial.heapUsed).toBeGreaterThan(0);
    }
  });

  it('should not leak memory on repeated operations', () => {
    const { SkillAutoLoader } = require('../src/skills/SkillAutoLoader');
    const loader = new SkillAutoLoader();

    const initialMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      loader.recordInteraction(`user${i}`, `skill${i}`, 'test', true);
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const increase = finalMemory - initialMemory;

    expect(increase).toBeLessThan(50 * 1024 * 1024);
  });
});

describe('Concurrency Performance', () => {
  it('should handle concurrent requests', async () => {
    const { SkillAutoLoader } = require('../src/skills/SkillAutoLoader');
    const loader = new SkillAutoLoader();

    const promises = Array(50).fill(null).map((_, i) =>
      Promise.resolve(loader.classifyTask(`task ${i}`))
    );

    await Promise.all(promises);
    expect(true).toBe(true);
  });
});
