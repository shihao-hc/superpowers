const fs = require('fs');
const os = require('os');
const path = require('path');

const { SkillLoader, parseFrontmatter, parseYamlSimple } = require('../../src/skills/loaders/SkillLoader');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skillloader-'));
}

function writeSkillMd(skillDir, content) {
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
}

function buildSkillMd(name, opts = {}) {
  const lines = ['---', `name: ${name}`];
  if (opts.description) lines.push(`description: ${opts.description}`);
  lines.push('---', 'Skill body content');
  return lines.join('\n');
}

const SAMPLE_SKILL = [
  '---',
  'name: demo-skill',
  'description: A demo skill',
  'version: 1.2.0',
  'tags:',
  '  - test',
  '  - "quoted"',
  '---',
  'Skill body content'
].join('\n');

describe('parseFrontmatter', () => {
  it('returns empty metadata when no frontmatter', () => {
    const { metadata, content } = parseFrontmatter('just content');
    expect(metadata).toEqual({});
    expect(content).toBe('just content');
  });

  it('parses frontmatter metadata and body', () => {
    const { metadata, content } = parseFrontmatter(SAMPLE_SKILL);
    expect(metadata.name).toBe('demo-skill');
    expect(metadata.description).toBe('A demo skill');
    expect(content).toBe('Skill body content');
  });
});

describe('parseYamlSimple', () => {
  it('parses simple key-value pairs', () => {
    const result = parseYamlSimple('name: x\ndescription: y');
    expect(result.name).toBe('x');
    expect(result.description).toBe('y');
  });

  it('strips single-quoted values', () => {
    expect(parseYamlSimple('a: \'hello\'').a).toBe('hello');
  });

  it('strips double-quoted values', () => {
    expect(parseYamlSimple('a: "hello"').a).toBe('hello');
  });

  it('parses unquoted array items', () => {
    const result = parseYamlSimple('tags:\n  - one\n  - two');
    expect(result.tags).toEqual(['one', 'two']);
  });

  it('parses quoted array items via parseString', () => {
    const result = parseYamlSimple('tags:\n  - "one"\n  - \'two\'');
    expect(result.tags).toEqual(['one', 'two']);
  });

  it('handles empty value keys and trailing array save', () => {
    const result = parseYamlSimple('list:\n  - a\n  - b');
    expect(result.list).toEqual(['a', 'b']);
  });

  it('handles pipe-block value key (key left unset)', () => {
    const result = parseYamlSimple('script: |\n  echo hi');
    expect(result.script).toBeUndefined();
  });

  it('skips blank lines', () => {
    const result = parseYamlSimple('a: 1\n\nb: 2');
    expect(result.a).toBe('1');
    expect(result.b).toBe('2');
  });

  it('ignores lines without colon', () => {
    const result = parseYamlSimple('no colon here\na: 1');
    expect(result.a).toBe('1');
  });

  it('flushes array when a new key follows', () => {
    const result = parseYamlSimple('tags:\n  - one\nafter: 1');
    expect(result.tags).toEqual(['one']);
    expect(result.after).toBe('1');
  });

  it('returns empty object for empty input', () => {
    expect(parseYamlSimple('')).toEqual({});
  });
});

describe('SkillLoader', () => {
  let tmpRoot;
  let loader;

  beforeEach(() => {
    tmpRoot = makeTempDir();
    loader = new SkillLoader(tmpRoot);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe('loadSkill', () => {
    it('returns null when SKILL.md missing', () => {
      const skillDir = path.join(tmpRoot, 'noskill');
      fs.mkdirSync(skillDir, { recursive: true });
      expect(loader.loadSkill('noskill')).toBeNull();
    });

    it('loads skill by relative name', () => {
      writeSkillMd(path.join(tmpRoot, 'demo-skill'), buildSkillMd('demo-skill', { description: 'A demo skill' }));
      const skill = loader.loadSkill('demo-skill');
      expect(skill).toBeTruthy();
      expect(skill.name).toBe('demo-skill');
      expect(skill.description).toBe('A demo skill');
      expect(skill.content).toBe('Skill body content');
      expect(skill.path).toBe(path.join(tmpRoot, 'demo-skill'));
    });

    it('loads skill by absolute path', () => {
      const absDir = path.join(tmpRoot, 'abs-skill');
      writeSkillMd(absDir, buildSkillMd('abs-skill'));
      const skill = loader.loadSkill(absDir);
      expect(skill.name).toBe('abs-skill');
    });

    it('falls back to directory basename when metadata name missing', () => {
      const skillDir = path.join(tmpRoot, 'no-name');
      writeSkillMd(skillDir, ['---', 'description: d', '---', 'body'].join('\n'));
      const skill = loader.loadSkill('no-name');
      expect(skill.name).toBe('no-name');
      expect(skill.description).toBe('d');
    });

    it('defaults description to empty string', () => {
      const skillDir = path.join(tmpRoot, 'no-desc');
      writeSkillMd(skillDir, ['---', 'name: nd', '---', 'body'].join('\n'));
      const skill = loader.loadSkill('no-desc');
      expect(skill.name).toBe('nd');
      expect(skill.description).toBe('');
    });

    it('caches loaded skill by name', () => {
      writeSkillMd(path.join(tmpRoot, 'cached'), buildSkillMd('cached'));
      loader.loadSkill('cached');
      expect(loader.skillCache.has('cached')).toBe(true);
    });

    it('handles content without frontmatter', () => {
      const skillDir = path.join(tmpRoot, 'raw');
      writeSkillMd(skillDir, 'no frontmatter at all');
      const skill = loader.loadSkill('raw');
      expect(skill.name).toBe('raw');
      expect(skill.content).toBe('no frontmatter at all');
    });
  });

  describe('_scanSkillFiles', () => {
    it('scans scripts, references and assets subdirs', () => {
      const skillDir = path.join(tmpRoot, 'full');
      writeSkillMd(skillDir, SAMPLE_SKILL);
      fs.mkdirSync(path.join(skillDir, 'scripts'), { recursive: true });
      fs.mkdirSync(path.join(skillDir, 'references'), { recursive: true });
      fs.mkdirSync(path.join(skillDir, 'assets'), { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'scripts', 'run.js'), 'x');
      fs.writeFileSync(path.join(skillDir, 'references', 'ref.md'), 'x');
      fs.writeFileSync(path.join(skillDir, 'assets', 'img.png'), 'x');
      const files = loader._scanSkillFiles(skillDir);
      const types = files.map((f) => f.type);
      expect(types).toContain('script');
      expect(types).toContain('reference');
      expect(types).toContain('asset');
      expect(files).toHaveLength(3);
    });

    it('returns empty when no subdirs', () => {
      const skillDir = path.join(tmpRoot, 'bare');
      writeSkillMd(skillDir, SAMPLE_SKILL);
      expect(loader._scanSkillFiles(skillDir)).toEqual([]);
    });
  });

  describe('_loadScripts', () => {
    it('returns empty when scripts dir missing', () => {
      const skillDir = path.join(tmpRoot, 'no-scripts');
      writeSkillMd(skillDir, SAMPLE_SKILL);
      expect(loader._loadScripts(skillDir)).toEqual([]);
    });

    it('loads only .js and .sh scripts with content', () => {
      const skillDir = path.join(tmpRoot, 'scripts2');
      writeSkillMd(skillDir, SAMPLE_SKILL);
      fs.mkdirSync(path.join(skillDir, 'scripts'));
      fs.writeFileSync(path.join(skillDir, 'scripts', 'run.js'), 'console.log(1)');
      fs.writeFileSync(path.join(skillDir, 'scripts', 'setup.sh'), 'echo hi');
      fs.writeFileSync(path.join(skillDir, 'scripts', 'notes.txt'), 'ignored');
      const scripts = loader._loadScripts(skillDir);
      expect(scripts).toHaveLength(2);
      expect(scripts[0].name).toBe('run');
      expect(scripts[0].content).toBe('console.log(1)');
    });
  });

  describe('_loadReferences', () => {
    it('returns empty when references dir missing', () => {
      const skillDir = path.join(tmpRoot, 'no-refs');
      writeSkillMd(skillDir, SAMPLE_SKILL);
      expect(loader._loadReferences(skillDir)).toEqual([]);
    });

    it('loads only .md and .txt references', () => {
      const skillDir = path.join(tmpRoot, 'refs2');
      writeSkillMd(skillDir, SAMPLE_SKILL);
      fs.mkdirSync(path.join(skillDir, 'references'));
      fs.writeFileSync(path.join(skillDir, 'references', 'guide.md'), '# Guide');
      fs.writeFileSync(path.join(skillDir, 'references', 'notes.txt'), 'notes');
      fs.writeFileSync(path.join(skillDir, 'references', 'skip.json'), '{}');
      const refs = loader._loadReferences(skillDir);
      expect(refs).toHaveLength(2);
      expect(refs[0].name).toBe('guide');
    });
  });

  describe('getAllSkills', () => {
    it('returns empty when skillsDir missing', () => {
      const missing = new SkillLoader(path.join(tmpRoot, 'nope'));
      expect(missing.getAllSkills()).toEqual([]);
    });

    it('loads all skill subdirectories', () => {
      writeSkillMd(path.join(tmpRoot, 'one'), buildSkillMd('one'));
      writeSkillMd(path.join(tmpRoot, 'two'), buildSkillMd('two'));
      const skills = loader.getAllSkills();
      expect(skills.map((s) => s.name).sort()).toEqual(['one', 'two']);
    });

    it('skips non-directory entries and skills without md', () => {
      writeSkillMd(path.join(tmpRoot, 'valid'), buildSkillMd('valid'));
      fs.writeFileSync(path.join(tmpRoot, 'file.txt'), 'x');
      fs.mkdirSync(path.join(tmpRoot, 'nomd'));
      const skills = loader.getAllSkills();
      expect(skills.map((s) => s.name)).toEqual(['valid']);
    });

    it('returns empty for empty dir', () => {
      expect(loader.getAllSkills()).toEqual([]);
    });
  });

  describe('getSkillTree', () => {
    it('maps skills to tree entries with file names', () => {
      const skillDir = path.join(tmpRoot, 'tree-skill');
      writeSkillMd(skillDir, buildSkillMd('tree-skill', { description: 'd' }));
      fs.mkdirSync(path.join(skillDir, 'scripts'));
      fs.writeFileSync(path.join(skillDir, 'scripts', 'a.js'), 'x');
      const tree = loader.getSkillTree();
      expect(tree).toHaveLength(1);
      expect(tree[0].name).toBe('tree-skill');
      expect(tree[0].description).toBe('d');
      expect(tree[0].hasScripts).toBe(true);
      expect(tree[0].hasReferences).toBe(false);
      expect(tree[0].files).toEqual(['a.js']);
    });
  });

  describe('clearCache', () => {
    it('clears the skill cache', () => {
      writeSkillMd(path.join(tmpRoot, 'c'), buildSkillMd('c'));
      loader.loadSkill('c');
      expect(loader.skillCache.size).toBe(1);
      loader.clearCache();
      expect(loader.skillCache.size).toBe(0);
    });
  });

  describe('searchSkills', () => {
    beforeEach(() => {
      writeSkillMd(path.join(tmpRoot, 'web-tool'), ['---', 'name: web-tool', 'description: web scraping helper', '---', 'body with browser automation'].join('\n'));
      writeSkillMd(path.join(tmpRoot, 'db-tool'), ['---', 'name: db-tool', 'description: database access', '---', 'body'].join('\n'));
    });

    it('matches by name (case insensitive)', () => {
      const results = loader.searchSkills('WEB');
      expect(results.map((s) => s.name)).toEqual(['web-tool']);
    });

    it('matches by description', () => {
      const results = loader.searchSkills('scraping');
      expect(results.map((s) => s.name)).toEqual(['web-tool']);
    });

    it('matches by content', () => {
      const results = loader.searchSkills('browser');
      expect(results.map((s) => s.name)).toEqual(['web-tool']);
    });

    it('returns empty for no match', () => {
      expect(loader.searchSkills('zzz')).toEqual([]);
    });
  });
});
