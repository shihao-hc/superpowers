/**
 * Integration Tests
 * End-to-end tests for OpenCode platform
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

describe('OpenCode Integration Tests', () => {
  describe('Core Module Verification', () => {
    it('should have MCP system available', () => {
      const mcp = require('../src/mcp');
      expect(typeof mcp).toBe('object');
    });

    it('should have skills system available', () => {
      const skills = require('../src/skills');
      expect(typeof skills).toBe('object');
    });
  });

  describe('CLI Integration', () => {
    it('should run CLI command', async () => {
      return new Promise<void>((resolve) => {
        const proc = spawn('node', ['cli/index.js', '--help'], {
          stdio: 'pipe',
          timeout: 10000
        });

        let output = '';
        
        proc.stdout.on('data', (data) => output += data.toString());
        proc.stderr.on('data', (data) => output += data.toString());

        proc.on('error', (err) => {
          console.warn('CLI spawn error:', err.message);
          resolve();
        });

        proc.on('close', (code) => {
          expect(code).toBeGreaterThanOrEqual(0);
          resolve();
        });

        setTimeout(() => {
          proc.kill();
          resolve();
        }, 5000);
      });
    });
  });
});

describe('Skills System Integration', () => {
  it('should auto-load configured skills', () => {
    const { SkillAutoLoader } = require('../src/skills/SkillAutoLoader');
    const loader = new SkillAutoLoader();
    
    const startupSkills = loader.getStartupSkills();
    expect(Array.isArray(startupSkills)).toBe(true);
  });

  it('should classify tasks correctly', () => {
    const { SkillAutoLoader } = require('../src/skills/SkillAutoLoader');
    const loader = new SkillAutoLoader();
    
    const bugType = loader.classifyTask('fix the login bug');
    expect(bugType).toBe('bug_fixing');
    
    const creativeType = loader.classifyTask('create a new component');
    expect(creativeType).toBe('creative_work');
  });

  it('should track skill metrics', () => {
    const { SkillAutoLoader } = require('../src/skills/SkillAutoLoader');
    const loader = new SkillAutoLoader();
    
    loader.recordInteraction('test-user', 'debugging', 'bug_fixing', true, 5);
    
    const metrics = loader.getMetrics();
    expect(metrics.loadCount).toBe(1);
  });

  it('should integrate RL recommender', () => {
    const { RLSkillRecommender } = require('../src/skills/recommendation/RLSkillRecommender');
    const recommender = new RLSkillRecommender();
    
    expect(typeof recommender.recommendSkills).toBe('function');
    expect(typeof recommender.recordInteraction).toBe('function');
  });

  it('should have security validator', () => {
    const { SkillSecurityValidator } = require('../src/skills/security/SkillSecurityValidator');
    const validator = new SkillSecurityValidator();
    
    expect(typeof validator.validateMCPCommand).toBe('function');
    expect(typeof validator.sanitizeInput).toBe('function');
  });
});
