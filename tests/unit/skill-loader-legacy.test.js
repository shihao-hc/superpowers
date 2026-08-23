const fs = require('fs');
const os = require('os');
const path = require('path');
const { SkillLoader } = require('../../src/skills/SkillLoader');

describe('SkillLoader (legacy skill.md loader)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-loader-legacy-'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(relPath, content) {
    const filePath = path.join(tmpDir, relPath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  }

  describe('constructor', () => {
    it('uses the default skills-source directory when no options given', () => {
      const loader = new SkillLoader();
      expect(loader.skillsDir).toBe(path.join(process.cwd(), 'skills-source', 'skills'));
      expect(loader.skills).toBeInstanceOf(Map);
    });

    it('accepts a custom skills directory', () => {
      const loader = new SkillLoader(tmpDir);
      expect(loader.skillsDir).toBe(tmpDir);
      expect(loader.skills.size).toBe(0);
    });
  });

  describe('loadAll', () => {
    it('warns and returns [] when the directory is missing', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const missing = path.join(tmpDir, 'nope');
      const loader = new SkillLoader(missing);
      expect(loader.loadAll()).toEqual([]);
      expect(warn).toHaveBeenCalledWith(`Skills directory not found: ${missing}`);
    });

    it('returns [] for an empty directory', () => {
      const loader = new SkillLoader(tmpDir);
      expect(loader.loadAll()).toEqual([]);
    });

    it('loads all skill directories into the map', () => {
      writeFile('alpha/skill.md', '---\nname: alpha\n---\nBody');
      writeFile('beta/README.md', '---\nname: beta\n---\nBody');
      const loader = new SkillLoader(tmpDir);
      const skills = loader.loadAll();
      expect(skills).toHaveLength(2);
      expect(loader.getAllSkills()).toHaveLength(2);
      expect(loader.getSkill('alpha').name).toBe('alpha');
      expect(loader.getSkill('beta').name).toBe('beta');
    });

    it('skips non-directory entries', () => {
      writeFile('notes.txt', 'not a skill');
      const loader = new SkillLoader(tmpDir);
      expect(loader.loadAll()).toEqual([]);
    });

    it('ignores directories without a skill file', () => {
      writeFile('empty-skill/placeholder.txt', 'x');
      const loader = new SkillLoader(tmpDir);
      expect(loader.loadAll()).toEqual([]);
    });

    it('logs and continues when a skill fails to load', () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      writeFile('broken/skill.md/x', 'x');
      const loader = new SkillLoader(tmpDir);
      expect(loader.loadAll()).toEqual([]);
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load skill broken'),
        expect.any(String)
      );
    });
  });

  describe('loadSkill', () => {
    it('returns null when the folder does not exist', () => {
      const loader = new SkillLoader(tmpDir);
      expect(loader.loadSkill('missing')).toBeNull();
    });

    it('returns null when the folder has no skill.md or README.md', () => {
      writeFile('empty/placeholder.txt', 'x');
      const loader = new SkillLoader(tmpDir);
      expect(loader.loadSkill('empty')).toBeNull();
    });

    it('prefers skill.md over README.md', () => {
      writeFile('dual/skill.md', '---\nname: from-md\n---\nMD body');
      writeFile('dual/README.md', '---\nname: from-readme\n---\nREADME body');
      const loader = new SkillLoader(tmpDir);
      const skill = loader.loadSkill('dual');
      expect(skill.name).toBe('from-md');
      expect(skill.rawContent).toContain('MD body');
    });

    it('falls back to README.md when skill.md is absent', () => {
      writeFile('readme-only/README.md', '---\nname: from-readme\n---\nREADME body');
      const loader = new SkillLoader(tmpDir);
      const skill = loader.loadSkill('readme-only');
      expect(skill.name).toBe('from-readme');
      expect(skill.rawContent).toContain('README body');
    });
  });

  describe('parseSkill', () => {
    it('parses a full frontmatter skill', () => {
      const content = [
        '---',
        'name: full-skill',
        'description: A full skill',
        'version: 2.0.0',
        'pure: true',
        'riskLevel: high',
        'inputs:',
        '  - name: query',
        'outputs:',
        '  - name: result',
        'scripts:',
        '  - main.js',
        'dependencies:',
        '  - dep1',
        'license: MIT',
        '---',
        'Body'
      ].join('\n');
      const loader = new SkillLoader(tmpDir);
      const skill = loader.parseSkill(content, 'full-skill');
      expect(skill.name).toBe('full-skill');
      expect(skill.description).toBe('A full skill');
      expect(skill.version).toBe('2.0.0');
      expect(skill.pure).toBe(true);
      expect(skill.riskLevel).toBe('high');
      expect(skill.inputs).toEqual([{ name: 'query' }]);
      expect(skill.outputs).toEqual([{ name: 'result' }]);
      expect(skill.scripts).toEqual(['main.js']);
      expect(skill.dependencies).toEqual(['dep1']);
      expect(skill.license).toBe('MIT');
      expect(skill.rawContent).toBe(content);
      expect(skill.skillPath).toBe(path.join(tmpDir, 'full-skill'));
    });

    it('applies fallbacks for a minimal frontmatter', () => {
      const loader = new SkillLoader(tmpDir);
      const skill = loader.parseSkill('---\nname: minimal\n---\nBody', 'minimal');
      expect(skill.description).toBe('');
      expect(skill.version).toBe('1.0.0');
      expect(skill.pure).toBe(false);
      expect(skill.riskLevel).toBe('low');
      expect(skill.inputs).toEqual([]);
      expect(skill.outputs).toEqual([]);
      expect(skill.scripts).toEqual([]);
      expect(skill.dependencies).toEqual([]);
      expect(skill.license).toBe('');
    });

    it('uses data.risk when riskLevel is absent', () => {
      const loader = new SkillLoader(tmpDir);
      const skill = loader.parseSkill('---\nname: risky\nrisk: medium\n---\nBody', 'risky');
      expect(skill.riskLevel).toBe('medium');
    });

    it('uses skillName when name is absent from frontmatter', () => {
      const loader = new SkillLoader(tmpDir);
      const skill = loader.parseSkill('---\ndescription: no name\n---\nBody', 'named-fallback');
      expect(skill.name).toBe('named-fallback');
    });

    it('delegates to parseFromContent when there is no frontmatter', () => {
      const loader = new SkillLoader(tmpDir);
      const skill = loader.parseSkill('# No FM\nDesc from body', 'no-fm');
      expect(skill.name).toBe('no-fm');
      expect(skill.description).toBe('Desc from body');
    });

    it('warns and falls back to defaults on invalid YAML', () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const loader = new SkillLoader(tmpDir);
      const skill = loader.parseSkill('---\nname: bad\ntags: [unclosed\n---\nBody', 'bad');
      expect(skill.name).toBe('bad');
      expect(skill.description).toBe('');
      expect(skill.version).toBe('1.0.0');
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse frontmatter for skill bad'),
        expect.any(String)
      );
    });

    it('keeps frontmatter description and skips the content merge', () => {
      const loader = new SkillLoader(tmpDir);
      const content = '---\nname: x\ndescription: has desc\n---\n# Title\nShould not override.';
      expect(loader.parseSkill(content, 'x').description).toBe('has desc');
    });

    it('skips the content merge when inputs are already provided', () => {
      const loader = new SkillLoader(tmpDir);
      const content = '---\nname: x\ninputs:\n  - name: q\n---\n# Title\nNot merged.';
      const skill = loader.parseSkill(content, 'x');
      expect(skill.inputs).toEqual([{ name: 'q' }]);
      expect(skill.description).toBe('');
    });

    it('merges description from content when frontmatter lacks it', () => {
      const loader = new SkillLoader(tmpDir);
      const skill = loader.parseSkill('---\nname: x\n---\n# Title\nFrom content body.\n', 'x');
      expect(skill.description).toBe('From content body.');
      expect(skill.inputs).toEqual([]);
    });

    it('merges inputs from content when frontmatter lacks both', () => {
      const content = [
        '---',
        'name: x',
        '---',
        '# Title',
        'A description.',
        'inputs:',
        '  - name: foo',
        '',
        '  - name: bar',
        ''
      ].join('\n');
      const loader = new SkillLoader(tmpDir);
      const skill = loader.parseSkill(content, 'x');
      expect(skill.inputs).toEqual([
        { name: 'foo', type: 'string', required: false },
        { name: 'bar', type: 'string', required: false }
      ]);
    });

    it('keeps fallbacks when content has no extractable description', () => {
      const loader = new SkillLoader(tmpDir);
      const skill = loader.parseSkill('---\nname: x\n---\nNo title in body', 'x');
      expect(skill.description).toBe('');
      expect(skill.inputs).toEqual([]);
    });

    it('handles CRLF frontmatter', () => {
      const loader = new SkillLoader(tmpDir);
      const content = '---\r\nname: crlf\r\ndescription: CRLF skill\r\n---\r\nBody';
      const skill = loader.parseSkill(content, 'crlf');
      expect(skill.name).toBe('crlf');
      expect(skill.description).toBe('CRLF skill');
    });
  });

  describe('parseFromContent', () => {
    it('extracts description after a # title', () => {
      const loader = new SkillLoader(tmpDir);
      const result = loader.parseFromContent('# Title\nline1\nline2', 's1');
      expect(result.name).toBe('s1');
      expect(result.description).toBe('line1 line2');
      expect(result.inputs).toEqual([]);
      expect(result.outputs).toEqual([]);
      expect(result.scripts).toEqual([]);
      expect(result.dependencies).toEqual([]);
    });

    it('handles ## subtitles', () => {
      const loader = new SkillLoader(tmpDir);
      expect(loader.parseFromContent('## Sub\nDesc here', 's2').description).toBe('Desc here');
    });

    it('stops collecting description at the next heading', () => {
      const loader = new SkillLoader(tmpDir);
      const result = loader.parseFromContent('# Title\ndesc\n### Next\nignored', 's3');
      expect(result.description).toBe('desc');
    });

    it('returns an empty description when no title is found', () => {
      const loader = new SkillLoader(tmpDir);
      const result = loader.parseFromContent('plain text without heading', 's4');
      expect(result.description).toBe('');
      expect(result.inputs).toEqual([]);
    });

    it('parses the inputs block, skipping lines without a name', () => {
      const loader = new SkillLoader(tmpDir);
      const result = loader.parseFromContent('inputs:\n  - name: alpha\n\n  - name: beta\n', 's5');
      expect(result.inputs).toEqual([
        { name: 'alpha', type: 'string', required: false },
        { name: 'beta', type: 'string', required: false }
      ]);
    });
  });

  describe('getSkill / getAllSkills', () => {
    it('getSkill returns undefined for unknown names', () => {
      const loader = new SkillLoader(tmpDir);
      expect(loader.getSkill('nope')).toBeUndefined();
    });

    it('getAllSkills returns [] on a fresh loader', () => {
      const loader = new SkillLoader(tmpDir);
      expect(loader.getAllSkills()).toEqual([]);
    });
  });
});