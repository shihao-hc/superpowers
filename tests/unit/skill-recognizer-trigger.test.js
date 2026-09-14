const fs = require('fs');
const os = require('os');
const path = require('path');
const SkillRecognizer = require('../../src/core/SkillRecognizer');

describe('SkillRecognizer trigger keyword extraction', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-trigger-'));
  });

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* */ }
  });

  function createSkill(name, trigger) {
    const dir = path.join(tmpDir, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ntrigger: "${trigger}"\n---\n# ${name}\n内容`);
  }

  it('extracts trigger keywords from SKILL.md into keywordMap', () => {
    createSkill('my-skill', '触发词A | 触发词B');
    const sr = new SkillRecognizer({ skillsDir: tmpDir });
    expect(sr.keywordMap.get('触发词A')).toBe('my-skill');
    expect(sr.keywordMap.get('触发词B')).toBe('my-skill');
  });

  it('supports multiple separators', () => {
    createSkill('s2', '词一，词二,词三');
    const sr = new SkillRecognizer({ skillsDir: tmpDir });
    expect(sr.keywordMap.get('词一')).toBe('s2');
    expect(sr.keywordMap.get('词二')).toBe('s2');
    expect(sr.keywordMap.get('词三')).toBe('s2');
  });

  it('does not override existing hardcoded mappings', () => {
    createSkill('security-audit', '安全');
    const sr = new SkillRecognizer({ skillsDir: tmpDir });
    expect(sr.keywordMap.get('安全')).toBe('security-audit');
  });

  it('recognizes by extracted trigger keyword', () => {
    createSkill('perf-skill', '性能优化 | Redis缓存');
    const sr = new SkillRecognizer({ skillsDir: tmpDir });
    const r = sr.recognize('性能优化', { topN: 1 });
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].skill.name).toBe('perf-skill');
  });
});