const fs = require('fs');

jest.mock('fs');

const { AnnotationLoader, annotationLoader } = require('../../src/mcp/AnnotationLoader');

describe('AnnotationLoader', () => {
  let loader;

  beforeEach(() => {
    jest.clearAllMocks();
    loader = new AnnotationLoader();
  });

  describe('constructor', () => {
    it('uses default annotations dir when none given', () => {
      expect(loader.annotationsDir).toMatch(/annotations$/);
      expect(loader.cache).toBeInstanceOf(Map);
      expect(loader.cache.size).toBe(0);
      expect(loader.allAnnotations).toBeInstanceOf(Map);
      expect(loader.allAnnotations.size).toBe(0);
    });

    it('uses custom annotations dir', () => {
      const custom = new AnnotationLoader('/custom/path');
      expect(custom.annotationsDir).toBe('/custom/path');
    });
  });

  describe('_parseValue', () => {
    it('parses "true" as boolean true', () => {
      expect(loader._parseValue('true')).toBe(true);
    });

    it('parses "false" as boolean false', () => {
      expect(loader._parseValue('false')).toBe(false);
    });

    it('parses numeric strings as numbers', () => {
      expect(loader._parseValue('42')).toBe(42);
      expect(loader._parseValue('3.14')).toBe(3.14);
    });

    it('returns non-numeric strings as-is', () => {
      expect(loader._parseValue('hello')).toBe('hello');
    });
  });

  describe('_parseYaml', () => {
    it('returns empty object for empty content', () => {
      expect(loader._parseYaml('')).toEqual({});
    });

    it('skips comment lines and blank lines', () => {
      const yaml = '# comment\n  \nfilesystem:\n  # tool section\n  tools:\n    read_text_file\n      key: value\n';
      const result = loader._parseYaml(yaml);
      expect(result).toHaveProperty('filesystem');
      expect(result.filesystem).toHaveProperty('tools');
      expect(result.filesystem.tools).toHaveProperty('read_text_file');
    });

    it('parses MCP name at indent 0', () => {
      const result = loader._parseYaml('filesystem:\n  tools:\n    read_text_file');
      expect(result).toEqual({ filesystem: { tools: { read_text_file: { readOnlyHint: false, idempotentHint: true, destructiveHint: false } } } });
    });

    it('parses section at indent 2', () => {
      const result = loader._parseYaml('mcp:\n  operations:\n    my_tool');
      expect(result.mcp.operations.my_tool).toBeDefined();
    });

    it('parses tool name at indent 4 (no colon)', () => {
      const result = loader._parseYaml('mcp:\n  tools:\n    my_tool');
      expect(result.mcp.tools.my_tool).toEqual({ readOnlyHint: false, idempotentHint: true, destructiveHint: false });
    });

    it('parses tool properties at indent 6', () => {
      const yaml = 'mcp:\n  tools:\n    my_tool\n      readOnlyHint: true\n      idempotentHint: false\n      destructiveHint: true\n      risk: high';
      const result = loader._parseYaml(yaml);
      expect(result.mcp.tools.my_tool.readOnlyHint).toBe(true);
      expect(result.mcp.tools.my_tool.idempotentHint).toBe(false);
      expect(result.mcp.tools.my_tool.destructiveHint).toBe(true);
      expect(result.mcp.tools.my_tool.risk).toBe('high');
    });

    it('skips indent 6 lines without colon', () => {
      const result = loader._parseYaml('m:\n  s:\n    t\n      no_colon_here\n');
      expect(result.m.s.t.no_colon_here).toBeUndefined();
    });

    it('handles multiple MCPs', () => {
      const yaml = 'fs:\n  sec:\n    read\n      priority: 1\nmem:\n  sec:\n    store\n      priority: 2\n';
      const result = loader._parseYaml(yaml);
      expect(result.fs.sec.read.priority).toBe(1);
      expect(result.mem.sec.store.priority).toBe(2);
    });

    it('creates empty object for tool if indent 6 comes before indent 4', () => {
      const yaml = 'mcp:\n  tools:\n      someKey: val\n';
      const result = loader._parseYaml(yaml);
      const toolEntries = Object.keys(result.mcp.tools);
      expect(toolEntries.length).toBe(0);
    });
  });

  describe('loadAll', () => {
    it('returns {} and warns when dir does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = loader.loadAll();
      expect(result).toEqual({});
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('not found'));
      warn.mockRestore();
    });

    it('loads .yaml and .yml files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['fs.yaml', 'git.yml', 'notes.txt']);
      fs.readFileSync.mockImplementation((fp) => {
        if (fp.endsWith('fs.yaml')) return 'fs:\n  ops:\n    read\n      hint: ok\n';
        if (fp.endsWith('git.yml')) return 'git:\n  ops:\n    clone\n      hint: fast\n';
        return '';
      });
      const result = loader.loadAll();
      expect(result).toHaveProperty('fs');
      expect(result).toHaveProperty('git');
      expect(result).not.toHaveProperty('notes');
      expect(loader.allAnnotations.size).toBe(2);
    });

    it('uses path.basename to derive MCP name from file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['my-service.yaml']);
      fs.readFileSync.mockReturnValue('my-service:\n  ops:\n    do\n      x: 1\n');
      const result = loader.loadAll();
      expect(result).toHaveProperty('my-service');
    });
  });

  describe('loadMcpAnnotations', () => {
    it('returns cached annotations on subsequent call', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('fs:\n  ops:\n    read\n');
      const first = loader.loadMcpAnnotations('fs');
      fs.readFileSync.mockClear();
      const second = loader.loadMcpAnnotations('fs');
      expect(second).toBe(first);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('returns null when file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(loader.loadMcpAnnotations('missing')).toBeNull();
    });

    it('loads and caches on first call', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('mycool:\n  sec:\n    toolx\n      val: true\n');
      const result = loader.loadMcpAnnotations('mycool');
      expect(result).toHaveProperty('mycool');
      expect(loader.cache.get('mcp:mycool')).toBe(result);
    });
  });

  describe('getToolAnnotation', () => {
    it('returns null for unknown MCP', () => {
      fs.existsSync.mockReturnValue(false);
      expect(loader.getToolAnnotation('nope', 'tool')).toBeNull();
    });

    it('returns null for unknown tool', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('m:\n  s:\n    known_tool\n');
      expect(loader.getToolAnnotation('m', 'unknown')).toBeNull();
    });

    it('returns tool annotation when found', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('m:\n  my_tool:\n');
      const ann = loader.getToolAnnotation('m', 'my_tool');
      expect(ann).toEqual({});
    });

    it('returns null when mcpAnnotations root has no entries', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('');
      expect(loader.getToolAnnotation('empty', 'tool')).toBeNull();
    });
  });

  describe('getMcpTools', () => {
    it('returns empty array for unknown MCP', () => {
      fs.existsSync.mockReturnValue(false);
      expect(loader.getMcpTools('nope')).toEqual([]);
    });

    it('returns empty array when first annotation value is falsy', () => {
      loader.cache.set('mcp:empty', { empty: null });
      expect(loader.getMcpTools('empty')).toEqual([]);
    });

    it('returns section entries as tools', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('m:\n  s:\n    tool1\n      x: a\n    tool2\n      y: b\n');
      const tools = loader.getMcpTools('m');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('s');
      expect(tools[0].tool1).toBeDefined();
      expect(tools[0].tool2).toBeDefined();
    });

    it('returns section as tool entry even when section has no sub-tools', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('m:\n  s:\n');
      const tools = loader.getMcpTools('m');
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('s');
    });
  });

  describe('getAllAnnotations', () => {
    it('returns empty object when no annotations loaded', () => {
      expect(loader.getAllAnnotations()).toEqual({});
    });

    it('returns flat map of tools across MCPs', () => {
      loader.allAnnotations.set('fs', { ops: { read: { readonly: true }, write: { readonly: false } } });
      loader.allAnnotations.set('git', { ops: { clone: { fast: true } } });
      const flat = loader.getAllAnnotations();
      expect(flat).toHaveProperty('read');
      expect(flat).toHaveProperty('write');
      expect(flat).toHaveProperty('clone');
      expect(flat.read).toEqual({ readonly: true });
    });

    it('handles MCP entries with no tools', () => {
      loader.allAnnotations.set('empty', {});
      expect(loader.getAllAnnotations()).toEqual({});
    });
  });

  describe('mergeWithCodeAnnotations', () => {
    it('returns codeAnnotations when no yaml annotations loaded', () => {
      expect(loader.mergeWithCodeAnnotations({ a: 1 })).toEqual({ a: 1 });
    });

    it('merges yaml annotations into codeAnnotations', () => {
      loader.allAnnotations.set('fs', { ops: { read: { readonly: true } } });
      const merged = loader.mergeWithCodeAnnotations({ read: { cached: false } });
      expect(merged.read).toEqual({ cached: false, readonly: true });
    });

    it('adds yaml-only tools to merged result', () => {
      loader.allAnnotations.set('fs', { ops: { read: { readonly: true } } });
      const merged = loader.mergeWithCodeAnnotations({});
      expect(merged.read).toEqual({ readonly: true });
    });
  });

  describe('clearCache', () => {
    it('clears cache and calls loadAll', () => {
      loader.cache.set('x', 1);
      fs.existsSync.mockReturnValue(false);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      loader.clearCache();
      expect(loader.cache.size).toBe(0);
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('reload', () => {
    it('clears both caches and reloads', () => {
      loader.cache.set('x', 1);
      loader.allAnnotations.set('y', {});
      fs.existsSync.mockReturnValue(false);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = loader.reload();
      expect(loader.allAnnotations.size).toBe(0);
      expect(loader.cache.size).toBe(0);
      expect(result).toEqual({});
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('singleton', () => {
    it('exports a pre-created instance', () => {
      expect(annotationLoader).toBeInstanceOf(AnnotationLoader);
    });
  });

  describe('_loadYamlFile (error handling)', () => {
    it('logs error and returns {} when read fails', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(() => { throw new Error('ENOENT'); });
      const errLog = jest.spyOn(console, 'error').mockImplementation(() => {});
      const result = loader._loadYamlFile('noexist.yaml');
      expect(result).toEqual({});
      expect(errLog).toHaveBeenCalled();
      errLog.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('handles indent 0 line without colon', () => {
      const result = loader._parseYaml('justtext:\n  ops:\n    do\n');
      expect(result).toHaveProperty('justtext');
    });

    it('handles indent 6 when currentTool is null', () => {
      const result = loader._parseYaml('mcp:\n  sec:\n      orphan: val\n');
      expect(result.mcp.sec).toEqual({});
    });

    it('throws when indent 4 hits with null currentSection', () => {
      expect(() => loader._parseYaml('mcp:\n    tool1\n')).toThrow();
    });

    it('creates empty tool object when indent 6 runs with stale currentTool across sections', () => {
      const result = loader._parseYaml('m:\n  sec1:\n    tool1\n  sec2:\n      key: val\n');
      expect(result.m.sec2.tool1).toEqual({ key: 'val' });
    });

    it('returns null from getToolAnnotation when mcpAnnotations values are empty', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('m:\n');
      expect(loader.getToolAnnotation('m', 't')).toBeNull();
    });
  });
});
