jest.mock('fs');

const fs = require('fs');
const path = require('path');
const { SkillRegistry } = require('../../src/skills/SkillRegistry');

function buildSkillMd(name, overrides = {}) {
  const lines = ['---', `name: ${name}`];
  if (overrides.description !== undefined) lines.push(`description: ${overrides.description}`);
  if (overrides.category !== undefined) lines.push(`category: ${overrides.category}`);
  if (overrides.tags) {
    lines.push('tags:');
    for (const t of overrides.tags) lines.push(`  - ${t}`);
  }
  if (overrides.version !== undefined) lines.push(`version: ${overrides.version}`);
  if (overrides.deprecated) lines.push('deprecated: true');
  if (overrides.replacement) lines.push(`replacement: ${overrides.replacement}`);
  lines.push('---', overrides.body || 'Skill content');
  return lines.join('\n');
}

function setupFs(skillsDir, skillDirs) {
  fs.existsSync.mockImplementation((p) => {
    if (p === skillsDir) return true;
    for (const sd of skillDirs) {
      const sp = path.join(skillsDir, sd.dirName || sd.name);
      if (p === sp) return true;
      if (p === path.join(sp, 'SKILL.md')) return sd.hasSkillMd !== false;
      if (p === path.join(sp, 'package.json')) return sd.hasPkg !== false;
      if (p === path.join(sp, 'index.js')) return sd.hasIndex !== false;
      for (const sub of ['scripts', 'references', 'assets', 'test', 'tests']) {
        if (p === path.join(sp, sub)) return sd[`has${sub.charAt(0).toUpperCase() + sub.slice(1)}Dir`] === true;
      }
    }
    return false;
  });

  fs.readdirSync.mockImplementation((p) => {
    for (const sd of skillDirs) {
      const sp = path.join(skillsDir, sd.dirName || sd.name);
      if (p === sp) {
        const entries = [];
        if (sd.hasSkillMd !== false) entries.push('SKILL.md');
        if (sd.hasPkg !== false) entries.push('package.json');
        if (sd.hasIndex !== false) entries.push('index.js');
        for (const sub of ['scripts', 'references', 'assets', 'test', 'tests']) {
          if (sd[`has${sub.charAt(0).toUpperCase() + sub.slice(1)}Dir`] === true) entries.push(sub);
        }
        if (sd.hasExtraFile) entries.push('extra.txt');
        return entries;
      }
      for (const sub of ['scripts', 'references', 'assets', 'test', 'tests']) {
        if (p === path.join(sp, sub) && sd[`has${sub.charAt(0).toUpperCase() + sub.slice(1)}Dir`] === true) {
          return sd[`${sub}Files`] || ['file.js'];
        }
      }
    }
    if (p === skillsDir) return skillDirs.map((d) => d.dirName || d.name);
    return [];
  });

  fs.statSync.mockImplementation((p) => {
    for (const sd of skillDirs) {
      const sp = path.join(skillsDir, sd.dirName || sd.name);
      if (p === sp) return { isDirectory: () => true, size: 100 };
      for (const sub of ['scripts', 'references', 'assets', 'test', 'tests']) {
        const subPath = path.join(sp, sub);
        if (p === subPath) return { isDirectory: () => true, size: 100 };
        if (sd[`has${sub.charAt(0).toUpperCase() + sub.slice(1)}Dir`] === true && sd[`${sub}Files`]) {
          for (const f of sd[`${sub}Files`]) {
            if (p === path.join(subPath, f)) return { isDirectory: () => false, size: f.length * 10 + 50 };
          }
        }
      }
    }
    if (p.endsWith('SKILL.md')) return { isDirectory: () => false, size: 200 };
    if (p.endsWith('package.json')) return { isDirectory: () => false, size: 150 };
    if (p.endsWith('index.js')) return { isDirectory: () => false, size: 80 };
    if (p.endsWith('extra.txt')) return { isDirectory: () => false, size: 30 };
    return { isDirectory: () => false, size: 50 };
  });

  fs.readFileSync.mockImplementation((p) => {
    for (const sd of skillDirs) {
      const sp = path.join(skillsDir, sd.dirName || sd.name);
      if (p === path.join(sp, 'SKILL.md')) {
        return sd.skillMdContent || buildSkillMd(sd.name, sd);
      }
      if (p === path.join(sp, 'package.json')) {
        return JSON.stringify(sd.pkgContent || {
          version: '2.0.0',
          description: 'Pkg desc',
          ...(sd.pkgKeywords ? { keywords: sd.pkgKeywords } : {}),
          ...(sd.pkgCategory ? { category: sd.pkgCategory } : {})
        });
      }
      if (p === path.join(sp, 'index.js')) {
        return sd.indexContent || 'module.exports = {};';
      }
      for (const sub of ['scripts', 'references', 'assets', 'test', 'tests']) {
        if (sd[`has${sub.charAt(0).toUpperCase() + sub.slice(1)}Dir`] === true && sd[`${sub}Files`]) {
          for (const f of sd[`${sub}Files`]) {
            if (p === path.join(sp, sub, f)) return 'file content';
          }
        }
      }
    }
    return '';
  });
}

describe('SkillRegistry — edge cases', () => {
  const skillsDir = '/fake/skills';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('_discoverSkill', () => {
    it('should parse SKILL.md frontmatter metadata', () => {
      setupFs(skillsDir, [{
        name: 'my-skill',
        hasPkg: false,
        description: 'A great skill',
        category: 'utility',
        tags: ['tool', 'helper'],
        version: '2.1.0'
      }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('my-skill');
      expect(skill.description).toBe('A great skill');
      expect(skill.category).toBe('utility');
      expect(skill.tags).toEqual(['tool', 'helper']);
      expect(skill.version).toBe('2.1.0');
    });

    it('should fall back to dir name when name missing in SKILL.md', () => {
      setupFs(skillsDir, [{
        name: 'fallback-name',
        skillMdContent: '---\ndescription: No name field\n---\nBody'
      }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('fallback-name');
      expect(skill.name).toBe('fallback-name');
    });

    it('should handle bad SKILL.md gracefully', () => {
      setupFs(skillsDir, [{
        name: 'bad-md',
        skillMdContent: 'no frontmatter at all'
      }]);
      const reg = new SkillRegistry(skillsDir);
      expect(reg.registry.has('bad-md')).toBe(true);
      const skill = reg.registry.get('bad-md');
      expect(skill.name).toBe('bad-md');
    });

    it('should merge package.json metadata (keywords as tags)', () => {
      setupFs(skillsDir, [{
        name: 'pkg-skill',
        hasSkillMd: false,
        pkgContent: { version: '3.0.0', keywords: ['pkg-tag'] }
      }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('pkg-skill');
      expect(skill.version).toBe('3.0.0');
      expect(skill.tags).toEqual(['pkg-tag']);
    });

    it('should use package.json category when missing from SKILL.md', () => {
      setupFs(skillsDir, [{
        name: 'cat-from-pkg',
        skillMdContent: '---\nname: cat-from-pkg\n---\nBody',
        pkgContent: { category: 'from-pkg' }
      }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('cat-from-pkg');
      expect(skill.category).toBe('from-pkg');
    });

    it('should use SKILL.md tags over package.json keywords', () => {
      setupFs(skillsDir, [{
        name: 'tag-priority',
        tags: ['md-tag'],
        pkgKeywords: ['pkg-tag']
      }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('tag-priority');
      expect(skill.tags).toEqual(['md-tag']);
    });

    it('should detect deprecated from index.js content', () => {
      setupFs(skillsDir, [{
        name: 'dep-via-index',
        indexContent: '@deprecated\nmodule.exports = {};'
      }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('dep-via-index');
      expect(skill.deprecated).toBe(true);
    });

    it('should detect DEPRECATED: true from index.js', () => {
      setupFs(skillsDir, [{
        name: 'dep-via-string',
        indexContent: '// DEPRECATED: true\nmodule.exports = {};'
      }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('dep-via-string');
      expect(skill.deprecated).toBe(true);
    });

    it('should handle package.json parse failure with console.warn', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      setupFs(skillsDir, [{
        name: 'bad-pkg',
        hasPkg: true,
        pkgContent: '{invalid json'
      }]);
      const reg = new SkillRegistry(skillsDir);
      expect(reg.registry.has('bad-pkg')).toBe(true);
      warnSpy.mockRestore();
    });
  });

  describe('_scanFiles', () => {
    it('should scan scripts, references, assets, test, tests directories', () => {
      setupFs(skillsDir, [{
        name: 'scannable',
        hasScriptsDir: true,
        scriptsFiles: ['run.js', 'deploy.sh'],
        hasReferencesDir: true,
        referencesFiles: ['readme.md'],
        hasAssetsDir: true,
        assetsFiles: ['icon.png'],
        hasTestDir: true,
        testFiles: ['test.js'],
        hasTestsDir: true,
        testsFiles: ['spec.js']
      }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('scannable');
      const names = skill.files.map((f) => f.name);
      expect(names).toContain('run.js');
      expect(names).toContain('deploy.sh');
      expect(names).toContain('readme.md');
      expect(names).toContain('icon.png');
      expect(names).toContain('test.js');
      expect(names).toContain('spec.js');
    });

    it('should not recurse into non-standard subdirectories', () => {
      setupFs(skillsDir, [{
        dirName: 'no-extra',
        name: 'no-extra',
        hasExtraDir: true
      }]);
      const reg = new SkillRegistry(skillsDir);
      const names = reg.registry.get('no-extra').files.map((f) => f.name);
      expect(names).not.toContain('extra.txt');
    });

    it('should include relPath and size for scanned files', () => {
      setupFs(skillsDir, [{
        name: 'meta',
        hasScriptsDir: true,
        scriptsFiles: ['task.sh']
      }]);
      const reg = new SkillRegistry(skillsDir);
      const files = reg.registry.get('meta').files;
      const scriptFile = files.find((f) => f.name === 'task.sh');
      expect(scriptFile).toBeTruthy();
      expect(scriptFile.path).toBe('scripts/task.sh');
      expect(scriptFile.size).toBeGreaterThan(0);
      expect(scriptFile.fullPath).toMatch(/task\.sh$/);
    });

    it('should include root-level files (SKILL.md, pkg.json, index.js)', () => {
      setupFs(skillsDir, [{
        name: 'mixed'
      }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('mixed');
      const names = skill.files.map((f) => f.name);
      expect(names).toContain('SKILL.md');
      expect(names).toContain('package.json');
      expect(names).toContain('index.js');
    });
  });

  describe('register', () => {
    it('should register skill with full data and timestamp', () => {
      setupFs(skillsDir, []);
      const reg = new SkillRegistry(skillsDir);
      const data = { name: 'dynamic', description: 'Added at runtime', category: 'test' };
      const result = reg.register(data);
      expect(result.name).toBe('dynamic');
      expect(result.description).toBe('Added at runtime');
      expect(result.category).toBe('test');
      expect(result).toHaveProperty('registered');
      expect(reg.registry.has('dynamic')).toBe(true);
    });
  });

  describe('unregister', () => {
    it('should return false for non-existent skill', () => {
      setupFs(skillsDir, []);
      const reg = new SkillRegistry(skillsDir);
      expect(reg.unregister('nonexistent')).toBe(false);
    });

    it('should return true on successful removal', () => {
      setupFs(skillsDir, [{ name: 'temp' }]);
      const reg = new SkillRegistry(skillsDir);
      expect(reg.unregister('temp')).toBe(true);
    });
  });

  describe('search', () => {
    it('should return empty array for no matches', () => {
      setupFs(skillsDir, [{ name: 'alpha' }]);
      const reg = new SkillRegistry(skillsDir);
      expect(reg.search('zzz')).toEqual([]);
    });

    it('should return results sorted by relevance descending', () => {
      setupFs(skillsDir, [
        { name: 'data-tool', description: 'Data processing tool' },
        { name: 'tool', description: 'A tool' }
      ]);
      const reg = new SkillRegistry(skillsDir);
      const results = reg.search('tool');
      expect(results.length).toBe(2);
      expect(results[0].relevance).toBeGreaterThanOrEqual(results[1].relevance);
    });

    it('should match by name, description, or tags (not category alone)', () => {
      setupFs(skillsDir, [
        { name: 'only-match', category: 'data-pipeline', description: 'Processes data' }
      ]);
      const reg = new SkillRegistry(skillsDir);
      const results = reg.search('data-pipeline');
      expect(results.length).toBe(0);
      const descResults = reg.search('Processes');
      expect(descResults.length).toBe(1);
    });
  });

  describe('getSkill', () => {
    it('should return null for missing skill', () => {
      setupFs(skillsDir, []);
      const reg = new SkillRegistry(skillsDir);
      expect(reg.getSkill('missing')).toBeNull();
    });

    it('should not inject replacementSkill when replacement is missing from registry', () => {
      setupFs(skillsDir, [{ name: 'orphan' }]);
      const reg = new SkillRegistry(skillsDir);
      const skill = reg.registry.get('orphan');
      skill.deprecated = true;
      skill.replacement = 'nonexistent';
      const result = reg.getSkill('orphan');
      expect(result.replacementSkill).toBeUndefined();
    });
  });

  describe('getAllSkills', () => {
    it('should combine category + tag + search filters', () => {
      setupFs(skillsDir, [
        { name: 'match', category: 'dev', tags: ['js'], description: 'build tool' },
        { name: 'no-cat', category: 'ops', tags: ['js'], description: 'build tool' },
        { name: 'no-tag', category: 'dev', tags: ['py'], description: 'build tool' },
        { name: 'no-search', category: 'dev', tags: ['js'], description: 'other tool' }
      ]);
      const reg = new SkillRegistry(skillsDir);
      const result = reg.getAllSkills({ category: 'dev', tag: 'js', search: 'build' });
      expect(result.length).toBe(1);
      expect(result[0].name).toBe('match');
    });

    it('should return empty array when no skill matches', () => {
      setupFs(skillsDir, [{ name: 'only-one', category: 'test' }]);
      const reg = new SkillRegistry(skillsDir);
      expect(reg.getAllSkills({ category: 'nonexistent' })).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return zeros for empty registry', () => {
      setupFs(skillsDir, []);
      const reg = new SkillRegistry(skillsDir);
      const stats = reg.getStats();
      expect(stats).toEqual({ total: 0, active: 0, deprecated: 0, withSKILLMd: 0, categories: 0, tags: 0 });
    });
  });

  describe('getTree', () => {
    it('should return tree with empty categories for empty registry', () => {
      setupFs(skillsDir, []);
      const reg = new SkillRegistry(skillsDir);
      const tree = reg.getTree();
      expect(tree.path).toBe(skillsDir);
      expect(tree.categories).toEqual({});
    });
  });

  describe('reload', () => {
    it('should reload with empty dir and return zeros', () => {
      setupFs(skillsDir, [{ name: 'temp' }]);
      const reg = new SkillRegistry(skillsDir);
      expect(reg.registry.size).toBe(1);
      setupFs(skillsDir, []);
      const stats = reg.reload();
      expect(reg.registry.size).toBe(0);
      expect(stats.total).toBe(0);
    });
  });

  describe('export', () => {
    it('should export empty registry', () => {
      setupFs(skillsDir, []);
      const reg = new SkillRegistry(skillsDir);
      const data = reg.export();
      expect(data.exportedAt).toBeTruthy();
      expect(data.stats.total).toBe(0);
      expect(data.skills).toEqual([]);
      expect(data.categories).toEqual([]);
      expect(data.tags).toEqual([]);
    });
  });

  describe('listSkills', () => {
    it('should pass includeDeprecated through to getAllSkills', () => {
      setupFs(skillsDir, [
        { name: 'active', description: 'Active' },
        { name: 'dep', description: 'Dep', indexContent: '@deprecated' }
      ]);
      const reg = new SkillRegistry(skillsDir);
      const deprecatedList = reg.listSkills({ includeDeprecated: true });
      expect(deprecatedList.length).toBe(2);
      const activeOnly = reg.listSkills();
      expect(activeOnly.length).toBe(1);
    });
  });

  describe('getSkillRegistry singleton', () => {
    it('should return same instance for repeated calls', () => {
      jest.resetModules();
      const mod = require('../../src/skills/SkillRegistry');
      setupFs('/fake/a', []);
      const a = mod.getSkillRegistry({ skillsDir: '/fake/a' });
      const b = mod.getSkillRegistry({ skillsDir: '/fake/a' });
      expect(a).toBe(b);
    });
  });

  describe('_calculateRelevance', () => {
    it('should accumulate scores from name + description + tags + category', () => {
      setupFs(skillsDir, []);
      const reg = new SkillRegistry(skillsDir);
      const skill = {
        name: 'data-analyzer',
        description: 'data analysis tool',
        tags: ['data', 'analysis'],
        category: 'data'
      };
      const score = reg._calculateRelevance(skill, 'data');
      expect(score).toBeGreaterThan(100);
    });

    it('should handle null tags gracefully', () => {
      setupFs(skillsDir, []);
      const reg = new SkillRegistry(skillsDir);
      const skill = { name: 'x', description: '', tags: null, category: null };
      expect(() => reg._calculateRelevance(skill, 'x')).not.toThrow();
      expect(reg._calculateRelevance(skill, 'x')).toBe(100);
    });
  });
});
