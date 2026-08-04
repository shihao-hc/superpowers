jest.mock('fs');

const fs = require('fs');
const path = require('path');
const { SkillRegistry } = require('../../src/skills/SkillRegistry');

function setupSkillDir(skillsDir, skillDirs) {
  fs.existsSync.mockImplementation((p) => {
    if (p === skillsDir) return true;
    for (const sd of skillDirs) {
      const skillPath = path.join(skillsDir, sd.name);
      if (p === skillPath) return true;
      if (p === path.join(skillPath, 'SKILL.md')) return sd.hasSkillMd !== false;
      if (p === path.join(skillPath, 'package.json')) return sd.hasPkg !== false;
      if (p === path.join(skillPath, 'index.js')) return sd.hasIndex !== false;
    }
    return false;
  });

  fs.readdirSync.mockImplementation((p) => {
    if (p === skillsDir) return skillDirs.map((d) => d.dirName || d.name);
    return [];
  });

  fs.statSync.mockImplementation((p) => {
    for (const sd of skillDirs) {
      const skillPath = path.join(skillsDir, sd.dirName || sd.name);
      if (p === skillPath) {
        return { isDirectory: () => true, size: 100 };
      }
    }
    if (p.endsWith('SKILL.md')) return { isDirectory: () => false, size: 200 };
    if (p.endsWith('package.json')) return { isDirectory: () => false, size: 150 };
    if (p.endsWith('index.js')) return { isDirectory: () => false, size: 80 };
    return { isDirectory: () => false, size: 50 };
  });

  fs.readFileSync.mockImplementation((p) => {
    for (const sd of skillDirs) {
      const skillPath = path.join(skillsDir, sd.dirName || sd.name);
      if (p === path.join(skillPath, 'SKILL.md')) {
        return sd.skillMdContent || `---\nname: ${sd.name}\ndescription: ${sd.description || 'A skill'}\ncategory: ${sd.category || 'general'}\ntags:\n  - ${sd.tag || 'test'}\nversion: ${sd.version || '1.0.0'}\n---\nSkill body`;
      }
      if (p === path.join(skillPath, 'package.json')) {
        return JSON.stringify({ version: sd.version || '1.0.0', description: sd.description || 'A skill' });
      }
      if (p === path.join(skillPath, 'index.js')) {
        return sd.indexContent || 'module.exports = {};';
      }
    }
    return '';
  });
}

describe('SkillRegistry', () => {
  let registry;
  const skillsDir = '/fake/skills';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and _loadRegistry', () => {
    it('should create registry with default skillsDir', () => {
      setupSkillDir(skillsDir, []);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry).toBeInstanceOf(Map);
      expect(registry.categories).toBeInstanceOf(Map);
      expect(registry.tags).toBeInstanceOf(Map);
    });

    it('should handle missing skillsDir gracefully', () => {
      fs.existsSync.mockReturnValue(false);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.size).toBe(0);
    });

    it('should discover and register skills from subdirectories', () => {
      setupSkillDir(skillsDir, [
        { name: 'skill-a', description: 'Skill A', category: 'testing', tag: 'unit-test' },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.size).toBe(1);
      expect(registry.registry.has('skill-a')).toBe(true);
    });

    it('should index by category', () => {
      setupSkillDir(skillsDir, [
        { name: 's1', category: 'testing' },
        { name: 's2', category: 'testing' },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.categories.get('testing')).toEqual(['s1', 's2']);
    });

    it('should index by tags', () => {
      setupSkillDir(skillsDir, [
        { name: 's1', tag: 'jest' },
        { name: 's2', tag: 'jest' },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.tags.get('jest')).toEqual(['s1', 's2']);
    });

    it('should skip non-directory entries', () => {
      fs.existsSync.mockImplementation((p) => {
        if (p === skillsDir) return true;
        return false;
      });
      fs.readdirSync.mockReturnValue(['file.txt']);
      fs.statSync.mockReturnValue({ isDirectory: () => false });
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.size).toBe(0);
    });

    it('should handle skill without SKILL.md', () => {
      setupSkillDir(skillsDir, [
        { name: 'no-md', hasSkillMd: false },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.has('no-md')).toBe(true);
      const skill = registry.registry.get('no-md');
      expect(skill.hasSKILLMd).toBe(false);
    });
  });

  describe('getAllSkills', () => {
    beforeEach(() => {
      setupSkillDir(skillsDir, [
        { name: 'active-skill', description: 'Active', category: 'dev', tag: 'util' },
        { name: 'dep-skill', description: 'Deprecated', category: 'old', indexContent: 'DEPRECATED: true' },
      ]);
      registry = new SkillRegistry(skillsDir);
    });

    it('should return all non-deprecated skills by default', () => {
      const skills = registry.getAllSkills();
      const names = skills.map((s) => s.name);
      expect(names).toContain('active-skill');
      expect(names).not.toContain('dep-skill');
    });

    it('should include deprecated when option set', () => {
      const skills = registry.getAllSkills({ includeDeprecated: true });
      expect(skills.length).toBe(2);
    });

    it('should filter by category', () => {
      const skills = registry.getAllSkills({ category: 'dev' });
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('active-skill');
    });

    it('should filter by tag', () => {
      const skills = registry.getAllSkills({ tag: 'util' });
      expect(skills.length).toBe(1);
      expect(skills[0].name).toBe('active-skill');
    });

    it('should filter by search query matching name', () => {
      const skills = registry.getAllSkills({ search: 'active' });
      expect(skills.length).toBe(1);
    });

    it('should filter by search query matching description', () => {
      const skills = registry.getAllSkills({ search: 'Active' });
      expect(skills.length).toBe(1);
    });

    it('should filter by search query matching tag', () => {
      const skills = registry.getAllSkills({ search: 'util' });
      expect(skills.length).toBe(1);
    });
  });

  describe('getSkill', () => {
    it('should return skill by name', () => {
      setupSkillDir(skillsDir, [
        { name: 'my-skill', description: 'My Skill' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const skill = registry.getSkill('my-skill');
      expect(skill).toBeTruthy();
      expect(skill.name).toBe('my-skill');
    });

    it('should return null for nonexistent skill', () => {
      setupSkillDir(skillsDir, []);
      registry = new SkillRegistry(skillsDir);
      expect(registry.getSkill('nonexistent')).toBeNull();
    });

    it('should include replacementSkill for deprecated skills with replacement', () => {
      setupSkillDir(skillsDir, [
        { name: 'old-skill', description: 'Old', indexContent: 'DEPRECATED: true;' },
        { name: 'new-skill', description: 'New' },
      ]);
      registry = new SkillRegistry(skillsDir);
      // Manually set replacement
      const oldSkill = registry.registry.get('old-skill');
      oldSkill.deprecated = true;
      oldSkill.replacement = 'new-skill';

      const result = registry.getSkill('old-skill');
      expect(result.replacementSkill).toBeTruthy();
      expect(result.replacementSkill.name).toBe('new-skill');
    });
  });

  describe('listSkills', () => {
    it('should return simplified skill list', () => {
      setupSkillDir(skillsDir, [
        { name: 's1', description: 'S1' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const list = registry.listSkills();
      expect(list.length).toBe(1);
      expect(list[0]).toHaveProperty('name');
      expect(list[0]).toHaveProperty('description');
      expect(list[0]).toHaveProperty('category');
      expect(list[0]).toHaveProperty('version');
    });
  });

  describe('listCategories', () => {
    it('should return categories sorted by skill count desc', () => {
      setupSkillDir(skillsDir, [
        { name: 's1', category: 'small' },
        { name: 's2', category: 'big' },
        { name: 's3', category: 'big' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const cats = registry.listCategories();
      expect(cats[0].name).toBe('big');
      expect(cats[0].skillCount).toBe(2);
      expect(cats[1].name).toBe('small');
      expect(cats[1].skillCount).toBe(1);
    });
  });

  describe('listTags', () => {
    it('should return tags sorted by skill count desc', () => {
      setupSkillDir(skillsDir, [
        { name: 's1', tag: 'rare' },
        { name: 's2', tag: 'common' },
        { name: 's3', tag: 'common' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const tags = registry.listTags();
      expect(tags[0].name).toBe('common');
      expect(tags[0].skillCount).toBe(2);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      setupSkillDir(skillsDir, [
        { name: 's1', category: 'c1', tag: 't1', description: 'D1' },
        { name: 's2', category: 'c1', tag: 't1', description: 'D2', indexContent: '@deprecated' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const stats = registry.getStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(1);
      expect(stats.deprecated).toBe(1);
      expect(stats.withSKILLMd).toBe(2);
      expect(stats.categories).toBe(1);
      expect(stats.tags).toBe(1);
    });
  });

  describe('search', () => {
    it('should return results with relevance scores', () => {
      setupSkillDir(skillsDir, [
        { name: 'testing-tool', description: 'A testing tool', tag: 'test' },
        { name: 'deploy-tool', description: 'A deploy tool', tag: 'deploy' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const results = registry.search('testing');
      expect(results.length).toBe(1);
      expect(results[0].name).toBe('testing-tool');
      expect(results[0].relevance).toBeGreaterThan(0);
    });

    it('should sort by relevance descending', () => {
      setupSkillDir(skillsDir, [
        { name: 'test', description: 'test skill', tag: 'testing' },
        { name: 'other', description: 'contains test word', tag: 'other' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const results = registry.search('test');
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].relevance).toBeGreaterThanOrEqual(results[1].relevance);
    });
  });

  describe('register and unregister', () => {
    it('should register a new skill at runtime', () => {
      setupSkillDir(skillsDir, []);
      registry = new SkillRegistry(skillsDir);
      registry.register({ name: 'runtime-skill', description: 'Runtime' });
      expect(registry.registry.has('runtime-skill')).toBe(true);
      const skill = registry.registry.get('runtime-skill');
      expect(skill).toHaveProperty('registered');
    });

    it('should unregister a skill', () => {
      setupSkillDir(skillsDir, [{ name: 'to-remove' }]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.has('to-remove')).toBe(true);
      registry.unregister('to-remove');
      expect(registry.registry.has('to-remove')).toBe(false);
    });
  });

  describe('reload', () => {
    it('should reload registry and return stats', () => {
      setupSkillDir(skillsDir, [{ name: 's1' }]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.size).toBe(1);

      setupSkillDir(skillsDir, [{ name: 's1' }, { name: 's2' }]);
      const stats = registry.reload();
      expect(registry.registry.size).toBe(2);
      expect(stats.total).toBe(2);
    });
  });

  describe('export', () => {
    it('should export full registry data', () => {
      setupSkillDir(skillsDir, [{ name: 's1', description: 'S1', category: 'c1', tag: 't1' }]);
      registry = new SkillRegistry(skillsDir);
      const data = registry.export();
      expect(data).toHaveProperty('exportedAt');
      expect(data).toHaveProperty('stats');
      expect(data).toHaveProperty('categories');
      expect(data).toHaveProperty('tags');
      expect(data).toHaveProperty('skills');
    });
  });

  describe('getTree', () => {
    it('should return skills grouped by category', () => {
      setupSkillDir(skillsDir, [
        { name: 's1', category: 'cat-a' },
        { name: 's2', category: 'cat-a' },
        { name: 's3', category: 'cat-b' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const tree = registry.getTree();
      expect(tree.path).toBe(skillsDir);
      expect(tree.categories['cat-a'].length).toBe(2);
      expect(tree.categories['cat-b'].length).toBe(1);
    });

    it('should put uncategorized skills under "uncategorized"', () => {
      setupSkillDir(skillsDir, [{ name: 's1', skillMdContent: '---\nname: s1\ndescription: D\n---\nBody' }]);
      registry = new SkillRegistry(skillsDir);
      const tree = registry.getTree();
      expect(tree.categories['uncategorized']).toBeTruthy();
    });
  });

  describe('getSkillRegistry singleton', () => {
    it('should return same instance on repeated calls', () => {
      setupSkillDir(skillsDir, []);
      // Reset the module singleton
      const mod = require('../../src/skills/SkillRegistry');
      const a = mod.getSkillRegistry({ skillsDir });
      const b = mod.getSkillRegistry({ skillsDir });
      expect(a).toBe(b);
    });
  });

  describe('_calculateRelevance', () => {
    it('should give exact name match highest score', () => {
      setupSkillDir(skillsDir, []);
      registry = new SkillRegistry(skillsDir);
      const skill = { name: 'test', description: '', tags: [], category: null };
      const score = registry._calculateRelevance(skill, 'test');
      expect(score).toBe(100);
    });

    it('should give partial name match medium score', () => {
      setupSkillDir(skillsDir, []);
      registry = new SkillRegistry(skillsDir);
      const skill = { name: 'testing-tool', description: '', tags: [], category: null };
      const score = registry._calculateRelevance(skill, 'test');
      expect(score).toBe(50);
    });

    it('should score description match', () => {
      setupSkillDir(skillsDir, []);
      registry = new SkillRegistry(skillsDir);
      const skill = { name: 'foo', description: 'a test skill', tags: [], category: null };
      const score = registry._calculateRelevance(skill, 'test');
      expect(score).toBe(20);
    });

    it('should score exact tag match', () => {
      setupSkillDir(skillsDir, []);
      registry = new SkillRegistry(skillsDir);
      const skill = { name: 'foo', description: '', tags: ['test'], category: null };
      const score = registry._calculateRelevance(skill, 'test');
      expect(score).toBe(30);
    });

    it('should score category match', () => {
      setupSkillDir(skillsDir, []);
      registry = new SkillRegistry(skillsDir);
      const skill = { name: 'foo', description: '', tags: [], category: 'test' };
      const score = registry._calculateRelevance(skill, 'test');
      expect(score).toBe(25);
    });
  });
});
