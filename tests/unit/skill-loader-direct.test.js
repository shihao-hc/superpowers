const { parseFrontmatter, parseYamlSimple } = require('../../src/skills/loaders/SkillLoader');

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
    expect(metadata.version).toBe('1.2.0');
    expect(metadata.tags).toEqual(['test', 'quoted']);
    expect(content).toBe('Skill body content');
  });

  it('parses frontmatter with CRLF line endings (Windows)', () => {
    const crlf = [
      '---',
      'name: crlf-skill',
      'description: CRLF skill',
      '---',
      'Body line 1',
      'Body line 2'
    ].join('\r\n');
    const { metadata, content } = parseFrontmatter(crlf);
    expect(metadata.name).toBe('crlf-skill');
    expect(metadata.description).toBe('CRLF skill');
    expect(content).toBe('Body line 1\r\nBody line 2');
  });

  it('parses frontmatter without trailing body', () => {
    const { metadata, content } = parseFrontmatter('---\nname: only-meta\n---\n');
    expect(metadata.name).toBe('only-meta');
    expect(content).toBe('');
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

  it('handles CRLF line endings', () => {
    const result = parseYamlSimple('a: 1\r\nb: 2\r\ntags:\r\n  - x\r\n  - y');
    expect(result.a).toBe('1');
    expect(result.b).toBe('2');
    expect(result.tags).toEqual(['x', 'y']);
  });
});
