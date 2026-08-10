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
        if (sd.skillMdThrows) { throw new Error('boom'); }
        return sd.skillMdContent || `---\nname: ${sd.name}\ndescription: ${sd.description || 'A skill'}\ncategory: ${sd.category || 'general'}\ntags:\n  - ${sd.tag || 'test'}\nversion: ${sd.version || '1.0.0'}\n---\nSkill body`;
      }
      if (p === path.join(skillPath, 'package.json')) {
        if (sd.pkgThrows) { throw new Error('boom'); }
        return sd.pkgContent || JSON.stringify({
          version: sd.version || '1.0.0',
          description: sd.description || 'A skill',
          ...(sd.pkgCategory ? { category: sd.pkgCategory } : {})
        });
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

    it('should use the default skills directory when none is provided', () => {
      fs.existsSync.mockReturnValue(false);
      registry = new SkillRegistry();
      expect(registry.registry.size).toBe(0);
    });

    it('should warn and continue when SKILL.md read fails', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      setupSkillDir(skillsDir, [
        { name: 'bad-md', skillMdThrows: true },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('解析 SKILL.md 失败'), 'boom');
      expect(registry.registry.has('bad-md')).toBe(true);
    });

    it('should fall back to directory name when SKILL.md has no name', () => {
      setupSkillDir(skillsDir, [
        { name: 'dir-name', skillMdContent: '---\ndescription: Only desc\n---\nBody' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const skill = registry.registry.get('dir-name');
      expect(skill.name).toBe('dir-name');
      expect(skill.description).toBe('Only desc');
    });

    it('should default description when SKILL.md has none', () => {
      setupSkillDir(skillsDir, [
        { name: 'no-desc', hasPkg: false, skillMdContent: '---\nname: no-desc\n---\nBody' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const skill = registry.registry.get('no-desc');
      expect(skill.description).toBe('');
    });

    it('should leave category null when SKILL.md has no category', () => {
      setupSkillDir(skillsDir, [
        { name: 'no-cat', skillMdContent: '---\nname: no-cat\ndescription: D\n---\nBody' },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.get('no-cat').category).toBeNull();
      expect(registry.categories.size).toBe(0);
    });

    it('should take category from package.json', () => {
      setupSkillDir(skillsDir, [
        { name: 'pkg-cat', pkgCategory: 'from-pkg' },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.get('pkg-cat').category).toBe('from-pkg');
    });

    it('should warn and continue when package.json parse fails', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      setupSkillDir(skillsDir, [
        { name: 'bad-pkg', pkgContent: 'not json' },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('解析 package.json 失败'), expect.stringContaining('Unexpected'));
      expect(registry.registry.has('bad-pkg')).toBe(true);
    });

    it('should keep SKILL.md version when package.json has none', () => {
      setupSkillDir(skillsDir, [
        { name: 'no-ver', pkgContent: JSON.stringify({ description: 'D' }) },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.get('no-ver').version).toBe('1.0.0');
    });

    it('should default description to empty when neither skill nor package has one', () => {
      setupSkillDir(skillsDir, [
        {
          name: 'no-desc-pkg',
          skillMdContent: '---\nname: no-desc-pkg\n---\nBody',
          pkgContent: JSON.stringify({})
        },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.get('no-desc-pkg').description).toBe('');
    });

    it('should use package.json keywords when skill has no tags', () => {
      setupSkillDir(skillsDir, [
        {
          name: 'pkg-tags',
          skillMdContent: '---\nname: pkg-tags\ndescription: D\n---\nBody',
          pkgContent: JSON.stringify({ version: '2.0.0', keywords: ['k1', 'k2'] })
        },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.get('pkg-tags').tags).toEqual(['k1', 'k2']);
    });

    it('should leave tags empty when neither skill nor package has tags', () => {
      setupSkillDir(skillsDir, [
        {
          name: 'no-tags',
          skillMdContent: '---\nname: no-tags\ndescription: D\n---\nBody',
          pkgContent: JSON.stringify({ version: '1.0.0' })
        },
      ]);
      registry = new SkillRegistry(skillsDir);
      expect(registry.registry.get('no-tags').tags).toEqual([]);
    });

    it('should discover skill without package.json', () => {
      setupSkillDir(skillsDir, [
        { name: 'no-pkg', hasPkg: false },
      ]);
      registry = new SkillRegistry(skillsDir);
      const skill = registry.registry.get('no-pkg');
      expect(skill.hasPackageJson).toBe(false);
      expect(skill.version).toBe('1.0.0');
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

    it('should return skill unchanged when replacement skill is missing', () => {
      setupSkillDir(skillsDir, [
        { name: 'old-skill', indexContent: 'DEPRECATED: true' },
      ]);
      registry = new SkillRegistry(skillsDir);
      const oldSkill = registry.registry.get('old-skill');
      oldSkill.deprecated = true;
      oldSkill.replacement = 'ghost';

      const result = registry.getSkill('old-skill');
      expect(result.replacementSkill).toBeUndefined();
      expect(result.name).toBe('old-skill');
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

    it('should not mark deprecated when index.js is missing', () => {
      setupSkillDir(skillsDir, [
        { name: 'no-index', description: 'No index', hasIndex: false },
      ]);
      registry = new SkillRegistry(skillsDir);
      const skill = registry.getSkill('no-index');
      expect(skill).toBeTruthy();
      expect(skill.deprecated).toBe(false);
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

    it('should handle skill without a tags property', () => {
      setupSkillDir(skillsDir, []);
      registry = new SkillRegistry(skillsDir);
      const skill = { name: 'foo', description: '', category: null };
      const score = registry._calculateRelevance(skill, 'foo');
      expect(score).toBe(100);
    });
  });

  describe('_scanFiles', () => {
    beforeEach(() => {
      registry = new SkillRegistry('/fake/empty');
    });

    it('should collect files recursively in standard subdirectories with prefixed paths', () => {
      const scanDir = '/fake/scan';
      const norm = (p) => String(p).replace(/\\/g, '/');
      fs.existsSync.mockImplementation((p) => norm(p).startsWith('/fake/scan'));
      fs.readdirSync.mockImplementation((p) => {
        switch (norm(p)) {
          case '/fake/scan': return ['readme.md', 'scripts', 'notes'];
          case '/fake/scan/scripts': return ['build.js'];
          case '/fake/scan/notes': return ['scratch.txt'];
          default: return [];
        }
      });
      fs.statSync.mockImplementation((p) => {
        if (norm(p) === '/fake/scan/scripts' || norm(p) === '/fake/scan/notes') {
          return { isDirectory: () => true, size: 100 };
        }
        return { isDirectory: () => false, size: 50 };
      });

      const files = registry._scanFiles(scanDir);
      expect(files.map((f) => f.name)).toEqual(expect.arrayContaining(['readme.md', 'build.js']));
      expect(files.map((f) => f.path)).toContain('scripts/build.js');
      expect(files.map((f) => f.path)).toContain('readme.md');
    });

    it('should not recurse into non-standard subdirectories', () => {
      const scanDir = '/fake/scan';
      const norm = (p) => String(p).replace(/\\/g, '/');
      fs.existsSync.mockImplementation((p) => norm(p).startsWith('/fake/scan'));
      fs.readdirSync.mockImplementation((p) => {
        switch (norm(p)) {
          case '/fake/scan': return ['notes'];
          case '/fake/scan/notes': return ['scratch.txt'];
          default: return [];
        }
      });
      fs.statSync.mockImplementation((p) => {
        if (norm(p) === '/fake/scan/notes') return { isDirectory: () => true, size: 100 };
        return { isDirectory: () => false, size: 50 };
      });

      const files = registry._scanFiles(scanDir);
      expect(files).toEqual([]);
    });

    it('should return an empty list when the directory does not exist', () => {
      fs.existsSync.mockImplementation((p) => p !== '/fake/scan');
      fs.readdirSync.mockReturnValue([]);
      fs.statSync.mockReturnValue({ isDirectory: () => false, size: 0 });

      const files = registry._scanFiles('/fake/scan');
      expect(files).toEqual([]);
    });
  });

  describe('getTree with files', () => {
    it('should expose file paths from discovered skills', () => {
      const base = '/fake/tree';
      const skillPath = path.join(base, 'tree-skill');
      fs.existsSync.mockImplementation((p) => {
        if (p === base || p === skillPath) return true;
        if (p === path.join(skillPath, 'SKILL.md')) return true;
        if (p === path.join(skillPath, 'scripts')) return true;
        return false;
      });
      fs.readdirSync.mockImplementation((p) => {
        if (p === base) return ['tree-skill'];
        if (p === skillPath) return ['scripts'];
        if (p === path.join(skillPath, 'scripts')) return ['run.js'];
        return [];
      });
      fs.statSync.mockImplementation((p) => {
        if (p === skillPath || p === path.join(skillPath, 'scripts')) {
          return { isDirectory: () => true, size: 100 };
        }
        return { isDirectory: () => false, size: 50 };
      });
      fs.readFileSync.mockImplementation((p) => {
        if (p === path.join(skillPath, 'SKILL.md')) return '---\nname: tree-skill\ndescription: Tree\n---\nBody';
        return '';
      });

      registry = new SkillRegistry(base);
      const skill = registry.registry.get('tree-skill');
      expect(skill.files.map((f) => f.path)).toEqual(['scripts/run.js']);

      const tree = registry.getTree();
      expect(tree.categories['uncategorized'][0].files).toContain('scripts/run.js');
    });
  });
});
