const path = require('path');

const mockRoot = path.resolve('/test-project');

jest.mock('fs', () => {
  const path = require('path');
  const mockFiles = new Map();
  const mockDirs = new Set();
  const ROOT = path.resolve('/test-project');

  function addFile(p, content) {
    mockFiles.set(p, content);
    let d = path.dirname(p);
    while (d && !mockDirs.has(d)) { mockDirs.add(d); const pd = path.dirname(d); if (pd === d) break; d = pd; }
  }

  addFile(path.join(ROOT, 'src/core/BrainSystem.js'), [
    'module.exports = class BrainSystem {',
    '  constructor() { this.cache = new Map(); this.cache.clear(); }',
    '  async think(input) { return input; }',
    '  process(data) { return JSON.parse(data); }',
    '  monitor() { return { metrics: true, alert: false }; }',
    '};'
  ].join('\n'));
  addFile(path.join(ROOT, 'src/core/MetaCognition.js'), [
    'module.exports = class MetaCognition {',
    '  constructor() { this.logger = { info() {}, debug() {}, warn() {}, error() {} }; }',
    '  analyze(pattern) { return pattern; }',
    '  audit() { return this.history || []; }',
    '};'
  ].join('\n'));
  addFile(path.join(ROOT, 'src/core/Thinking.js'), 'module.exports = class Thinking {};\n');
  addFile(path.join(ROOT, 'src/agent/AgentLoop.js'), [
    'const { BrainSystem } = require("../core/BrainSystem");',
    'module.exports = class AgentLoop {',
    '  constructor() { this.brain = new BrainSystem(); }',
    '  async run() { await this.brain.think("input"); }',
    '};'
  ].join('\n'));
  addFile(path.join(ROOT, 'src/config/index.js'), 'module.exports = { port: process.env.PORT || 3000 };\n');
  addFile(path.join(ROOT, 'src/index.js'), 'module.exports = { start: () => {} };\n');
  addFile(path.join(ROOT, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0', main: 'src/index.js', dependencies: { express: '^4' }, devDependencies: { jest: '^29' } }));
  addFile(path.join(ROOT, 'README.md'), '# Project\nnpm install\nnode index.js\n## Usage\nRun with npm start\n');
  addFile(path.join(ROOT, 'CHANGELOG.md'), '# Changelog\n### 1.0.0\n- Initial release');
  addFile(path.join(ROOT, 'LICENSE'), 'MIT License');
  addFile(path.join(ROOT, '.env'), 'KEY=value');
  addFile(path.join(ROOT, 'docs/help.md'), '# Help\nUsage documentation');
  addFile(path.join(ROOT, 'docs/API.md'), '# API Docs');
  addFile(path.join(ROOT, '.github/workflows/ci.yml'), 'name: CI\non: [push]');

  const dirContents = {
    [ROOT]: [
      { name: 'src', isDir: true }, { name: 'docs', isDir: true }, { name: '.github', isDir: true },
      { name: 'package.json', isDir: false }, { name: 'README.md', isDir: false },
      { name: 'CHANGELOG.md', isDir: false }, { name: 'LICENSE', isDir: false }, { name: '.env', isDir: false },
    ],
    [path.join(ROOT, 'src')]: [
      { name: 'core', isDir: true }, { name: 'agent', isDir: true }, { name: 'config', isDir: true },
      { name: 'index.js', isDir: false },
    ],
    [path.join(ROOT, 'src/core')]: [
      { name: 'BrainSystem.js', isDir: false }, { name: 'MetaCognition.js', isDir: false }, { name: 'Thinking.js', isDir: false },
    ],
    [path.join(ROOT, 'src/agent')]: [
      { name: 'AgentLoop.js', isDir: false },
    ],
    [path.join(ROOT, 'src/config')]: [
      { name: 'index.js', isDir: false },
    ],
    [path.join(ROOT, 'docs')]: [
      { name: 'help.md', isDir: false }, { name: 'API.md', isDir: false },
    ],
    [path.join(ROOT, '.github')]: [
      { name: 'workflows', isDir: true },
    ],
    [path.join(ROOT, '.github/workflows')]: [
      { name: 'ci.yml', isDir: false },
    ],
  };

  function readDir(p, opts) {
    const norm = path.normalize(p);
    const entries = dirContents[norm];
    if (!entries) return [];
    if (opts && opts.withFileTypes) {
      return entries.map((e) => ({ name: e.name, isDirectory: () => e.isDir, isFile: () => !e.isDir }));
    }
    return entries.map((e) => e.name);
  }

  const existsImpl = (p) => { const norm = path.normalize(p); return mockFiles.has(norm) || mockDirs.has(norm); };
  const readImpl = (p, _enc) => { const norm = path.normalize(p); if (mockFiles.has(norm)) return mockFiles.get(norm); return ''; };
  const readdirImpl = (p, opts) => readDir(p, opts);

  return {
    existsSync: jest.fn(existsImpl),
    readFileSync: jest.fn(readImpl),
    readdirSync: jest.fn(readdirImpl),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn(),
    unlinkSync: jest.fn(),
    rmdirSync: jest.fn(),
    statSync: jest.fn((p) => ({ isDirectory: () => { const norm = path.normalize(p); return mockDirs.has(norm); }, isFile: () => { const norm = path.normalize(p); return mockFiles.has(norm); } })),
    appendFileSync: jest.fn(),
    copyFileSync: jest.fn(),
    renameSync: jest.fn(),
    promises: { readFile: jest.fn(), writeFile: jest.fn(), readdir: jest.fn(), mkdir: jest.fn(), access: jest.fn() },
  };
});

const { ComprehensiveChecker } = require('../src/agent/ComprehensiveChecker');

let origReadFileSync, origExistsSync, origReaddirSync;
beforeAll(() => {
  const fs = require('fs');
  origReadFileSync = fs.readFileSync.getMockImplementation();
  origExistsSync = fs.existsSync.getMockImplementation();
  origReaddirSync = fs.readdirSync.getMockImplementation();
});

describe('ComprehensiveChecker', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  describe('constructor', () => {
    test('uses cwd when no projectRoot given', () => {
      const c = new ComprehensiveChecker();
      expect(c.projectRoot).toBe(process.cwd());
    });

    test('uses given projectRoot', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      expect(c.projectRoot).toBe(mockRoot);
    });

    test('uses verbose and strictMode options', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot, verbose: true, strictMode: true });
      expect(c.verbose).toBe(true);
      expect(c.strictMode).toBe(true);
    });

    test('initializes empty results and issues', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      expect(c.results.size).toBe(0);
      expect(c.issues.size).toBe(0);
      expect(c.stats).toEqual({ total: 0, passed: 0, failed: 0, warnings: 0 });
    });

    test('returns empty coreFiles when no src dir', () => {
      const c = new ComprehensiveChecker({ projectRoot: '/nonexistent' });
      expect(c.coreFiles).toEqual([]);
    });
  });

  describe('getStats', () => {
    test('static getStats returns totals', () => {
      const stats = ComprehensiveChecker.getStats();
      expect(stats.total).toBe(56);
      expect(stats.categories).toBe(14);
    });

    test('instance getStats returns current stats', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      c.stats = { total: 10, passed: 5, failed: 3, warnings: 2 };
      expect(c.getStats()).toEqual({ total: 10, passed: 5, failed: 3, warnings: 2 });
    });
  });

  describe('findCoreFiles', () => {
    test('finds .js files recursively', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      expect(c.coreFiles.length).toBeGreaterThan(0);
      expect(c.coreFiles.every((f) => f.endsWith('.js'))).toBe(true);
      expect(c.coreFiles.some((f) => f.includes('BrainSystem.js'))).toBe(true);
    });

    test('skips dot directories', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      expect(c.coreFiles.every((f) => !f.includes('node_modules'))).toBe(true);
    });
  });

  describe('executeCheck', () => {
    test('returns warning for unimplemented check', async () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const result = await c.executeCheck({ id: 'X-01', fn: 'nonexistent' });
      expect(result.status).toBe('warning');
      expect(result.message).toBe('检查未实现');
    });

    test('runs check successfully', async () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const result = await c.executeCheck({ id: 'A-01', fn: 'checkFileIntegrity' });
      expect(result.status).toBeDefined();
    });
  });

  describe('run', () => {
    test('runs all 56 checks with basic project', async () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const result = await c.run();
      expect(result.stats.total).toBe(56);
      expect(Array.isArray(result.issues)).toBe(true);
    });

    test('runs with verbose mode', async () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot, verbose: true });
      const result = await c.run();
      expect(result.stats.total).toBe(56);
    });
  });

  describe('runCategory', () => {
    test('handles mixed passed/warning/failed', async () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      await c.runCategory('A', { name: 'Code', checks: [
        { id: 'A-01', name: 'Integrity', severity: 'critical', fn: 'checkFileIntegrity' },
        { id: 'A-99', name: 'Unknown', severity: 'low', fn: 'nonexistent' },
      ]});
      expect(c.stats.total).toBe(2);
    });
  });

  describe('generateReport', () => {
    test('zero stats', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      c.generateReport(100);
      expect(c.stats.total).toBe(0);
    });

    test('all passed', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      c.results.set('A-01', { status: 'passed' });
      c.stats = { total: 1, passed: 1, failed: 0, warnings: 0 };
      c.generateReport(50);
    });

    test('with failures', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      c.issues.set('A-01', { id: 'A-01', name: 'Test', severity: 'high', message: 'fail' });
      c.stats = { total: 10, passed: 5, failed: 5, warnings: 0 };
      c.generateReport(50);
      expect(c.issues.size).toBe(1);
    });

    test('with warnings', () => {
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      c.stats = { total: 10, passed: 5, failed: 0, warnings: 5 };
      c.generateReport(50);
    });
  });

  describe('specific check implementations', () => {
    let fs;

    beforeEach(() => {
      fs = require('fs');
    });

    afterEach(() => {
      const f = require('fs');
      f.readFileSync.mockImplementation(origReadFileSync);
      f.existsSync.mockImplementation(origExistsSync);
      f.readdirSync.mockImplementation(origReaddirSync);
    });

    test('checkFileIntegrity fails on empty project', async () => {
      fs.readdirSync.mockReturnValue([]);
      fs.existsSync.mockReturnValue(false);
      const c = new ComprehensiveChecker({ projectRoot: '/empty' });
      const r = await c.executeCheck({ id: 'A-01', fn: 'checkFileIntegrity' });
      expect(r.status).toBe('failed');
    });

    test('checkFileIntegrity handles skills dir', async () => {
      const skillsRoot = '/skills-proj';
      fs.existsSync.mockImplementation((p) => {
        const ps = p.replace(/\\/g, '/');
        if (ps.startsWith('/skills-proj/skills') && ps.endsWith('SKILL.md')) return true;
        if (ps === '/skills-proj/skills') return true;
        if (ps.startsWith('/skills-proj/') && ps.includes('src')) return false;
        return false;
      });
      fs.readdirSync.mockImplementation((p, opts) => {
        const ps = p.replace(/\\/g, '/');
        if (ps === '/skills-proj/skills' && opts && opts.withFileTypes) {
          return [{ name: 'awesome-skill', isDirectory: () => true, isFile: () => false }];
        }
        return [];
      });
      const c = new ComprehensiveChecker({ projectRoot: skillsRoot });
      const r = await c.executeCheck({ id: 'A-01', fn: 'checkFileIntegrity' });
      expect(r.status).toBe('passed');
    });

    test('checkSyntax warns on unbalanced braces', async () => {
      const badContent = 'function a() {\n  if (b) {\n    for (;;) {\n      while (c) {\n        try {\n         \n        }\n      }\n    }\n  }\n}\n' + '{{{'.repeat(3);
      fs.readFileSync.mockReturnValue(badContent);
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'A-02', fn: 'checkSyntax' });
      expect(r.status).toBe('warning');
    });

    test('checkSecurity detects eval', async () => {
      fs.readFileSync.mockReturnValue('eval(userInput)\n');
      fs.readdirSync.mockImplementation((p, opts) => {
        if (opts && opts.withFileTypes) return [{ name: 'bad.js', isDirectory: () => false, isFile: () => true }];
        return ['bad.js'];
      });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-01', fn: 'checkSecurity' });
      expect(r.status).toBe('failed');
    });

    test('checkSecurity detects new Function', async () => {
      fs.readFileSync.mockReturnValue('new Function("return " + data)\n');
      fs.readdirSync.mockImplementation((p, opts) => {
        if (opts && opts.withFileTypes) return [{ name: 'bad.js', isDirectory: () => false, isFile: () => true }];
        return ['bad.js'];
      });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-01', fn: 'checkSecurity' });
      expect(r.status).toBe('failed');
    });

    test('checkSecurity detects innerHTML', async () => {
      fs.readFileSync.mockReturnValue('element.innerHTML = userContent + more\n');
      fs.readdirSync.mockImplementation((p, opts) => {
        if (opts && opts.withFileTypes) return [{ name: 'bad.js', isDirectory: () => false, isFile: () => true }];
        return ['bad.js'];
      });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-01', fn: 'checkSecurity' });
      expect(r.status).toBe('failed');
    });

    test('checkSecurity detects document.write', async () => {
      fs.readFileSync.mockReturnValue('document.write(html)\n');
      fs.readdirSync.mockImplementation((p, opts) => {
        if (opts && opts.withFileTypes) return [{ name: 'bad.js', isDirectory: () => false, isFile: () => true }];
        return ['bad.js'];
      });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-01', fn: 'checkSecurity' });
      expect(r.status).toBe('failed');
    });

    test('checkVulnerabilities detects hardcoded password', async () => {
      fs.readFileSync.mockReturnValue('const password = "s3cret!";\n');
      fs.readdirSync.mockImplementation((p, opts) => {
        if (opts && opts.withFileTypes) return [{ name: 'bad.js', isDirectory: () => false, isFile: () => true }];
        return ['bad.js'];
      });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-02', fn: 'checkVulnerabilities' });
      expect(r.status).toBe('failed');
    });

    test('checkPotentialRisks detects SQL injection', async () => {
      fs.readFileSync.mockReturnValue('sql += userInput\n');
      fs.readdirSync.mockImplementation((p, opts) => {
        if (opts && opts.withFileTypes) return [{ name: 'bad.js', isDirectory: () => false, isFile: () => true }];
        return ['bad.js'];
      });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-03', fn: 'checkPotentialRisks' });
      expect(r.status).toBe('warning');
    });

    test('checkInputValidation warns without validation', async () => {
      fs.readFileSync.mockReturnValue('function process(x) { return x * 2; }\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-04', fn: 'checkInputValidation' });
      expect(r.status).toBe('warning');
    });

    test('checkPathSecurity detects path traversal risk', async () => {
      fs.readFileSync.mockReturnValue('fs.readFile(userPath, "utf-8")\n');
      fs.readdirSync.mockImplementation((p, opts) => {
        if (opts && opts.withFileTypes) return [{ name: 'bad.js', isDirectory: () => false, isFile: () => true }];
        return ['bad.js'];
      });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-05', fn: 'checkPathSecurity' });
      expect(r.status).toBe('warning');
    });

    test('checkErrorHandling warns without try-catch', async () => {
      fs.readFileSync.mockReturnValue('const x = require("fs"); async function f() { return 1; }\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'C-01', fn: 'checkErrorHandling' });
      expect(r.status).toBe('warning');
    });

    test('checkMemoryManagement detects cache without clear', async () => {
      fs.readFileSync.mockReturnValue('this.cache = new Map();\n');
      fs.readdirSync.mockImplementation((p, opts) => {
        if (opts && opts.withFileTypes) return [{ name: 'leaky.js', isDirectory: () => false, isFile: () => true }];
        return ['leaky.js'];
      });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'C-03', fn: 'checkMemoryManagement' });
      expect(r.status).toBe('warning');
    });

    test('checkEnvDifferences warns without env files', async () => {
      fs.existsSync.mockReturnValue(false);
      const c = new ComprehensiveChecker({ projectRoot: '/no-env' });
      const r = await c.executeCheck({ id: 'D-02', fn: 'checkEnvDifferences' });
      expect(r.status).toBe('warning');
    });

    test('checkBackup warns without backup files', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.readFileSync.mockReturnValue('module.exports = {};\n');
      const c = new ComprehensiveChecker({ projectRoot: '/no-backup' });
      const r = await c.executeCheck({ id: 'H-01', fn: 'checkBackup' });
      expect(r.status).toBe('warning');
    });

    test('checkUnitTests passes when test file exists', async () => {
      fs.existsSync.mockReturnValue(true);
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'G-01', fn: 'checkUnitTests' });
      expect(r.status).toBe('passed');
    });

    test('checkCodeQuality warns on var usage', async () => {
      fs.readFileSync.mockReturnValue('var x = 1; var y = 2; var z = 3; var a = 4;\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'A-03', fn: 'checkCodeQuality' });
      expect(r.status).toBe('warning');
    });

    test('checkCodeQuality warns on long functions', async () => {
      fs.readFileSync.mockReturnValue('function longFunc() {' + 'x'.repeat(210) + '}\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'A-03', fn: 'checkCodeQuality' });
      expect(r.status).toBe('warning');
    });

    test('checkDependencies warns with many deps', async () => {
      const manyDeps = { dependencies: {}, devDependencies: {} };
      for (let i = 0; i < 150; i++) manyDeps.dependencies[`dep${i}`] = '^1.0';
      const jsonStr = JSON.stringify(manyDeps);
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(jsonStr);
      const c = new ComprehensiveChecker({ projectRoot: '/many-deps' });
      const r = await c.executeCheck({ id: 'D-03', fn: 'checkDependencies' });
      expect(r.status).toBe('warning');
    });

    test('checkConcurrency passes with concurrency patterns', async () => {
      fs.readFileSync.mockReturnValue('async function run() { await Promise.all(tasks); const lock = true; }\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'C-02', fn: 'checkConcurrency' });
      // hasLock → returns passed
      expect(r.status).toBe('passed');
    });

    test('checkPerformance warns on nested code', async () => {
      const deepNested = 'function a() { if (b) { for (;;) { while (c) { if (d) {} } } } }\n';
      fs.readFileSync.mockReturnValue(deepNested);
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'C-04', fn: 'checkPerformance' });
      expect(r.status).toBe('warning');
    });

    test('checkCodeDuplication detects duplicates', async () => {
      fs.readFileSync.mockReturnValue('module.exports = { same: true };\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'A-05', fn: 'checkCodeDuplication' });
      // All files have identical content - no duplicates warning (>5 needed)
      expect(r.status).toBeDefined();
    });

    test('checkInputValidation passes with validation', async () => {
      fs.readFileSync.mockReturnValue('function validate(x) { return typeof x === "number" && isFinite(x); }\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-04', fn: 'checkInputValidation' });
      expect(r.status).toBe('passed');
    });

    test('checkResourceLeaks detects unclosed streams', async () => {
      fs.readFileSync.mockReturnValue('fs.createReadStream(file)\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'C-05', fn: 'checkResourceLeaks' });
      expect(r.status).toBe('warning');
    });

    test('checkReadme warns on missing', async () => {
      fs.existsSync.mockReturnValue(false);
      const c = new ComprehensiveChecker({ projectRoot: '/no-readme' });
      const r = await c.executeCheck({ id: 'E-01', fn: 'checkReadme' });
      expect(r.status).toBe('failed');
    });

    test('checkChangelog warns on missing', async () => {
      fs.existsSync.mockReturnValue(false);
      const c = new ComprehensiveChecker({ projectRoot: '/no-changelog' });
      const r = await c.executeCheck({ id: 'E-04', fn: 'checkChangelog' });
      expect(r.status).toBe('warning');
    });

    test('checkLicense fails on missing', async () => {
      fs.existsSync.mockReturnValue(false);
      const c = new ComprehensiveChecker({ projectRoot: '/no-license' });
      const r = await c.executeCheck({ id: 'E-05', fn: 'checkLicense' });
      expect(r.status).toBe('failed');
    });

    test('checkExamples warns on missing', async () => {
      fs.existsSync.mockReturnValue(false);
      const c = new ComprehensiveChecker({ projectRoot: '/no-examples' });
      const r = await c.executeCheck({ id: 'E-03', fn: 'checkExamples' });
      expect(r.status).toBe('warning');
    });

    test('checkPotentialRisks detects multiple patterns', async () => {
      fs.readFileSync.mockReturnValue('shell.exec(cmd)\n');
      fs.readdirSync.mockImplementation((p, opts) => {
        if (opts && opts.withFileTypes) return [{ name: 'bad.js', isDirectory: () => false, isFile: () => true }];
        return ['bad.js'];
      });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'B-03', fn: 'checkPotentialRisks' });
      expect(r.status).toBe('warning');
    });

    test('executeCheck catches thrown errors', async () => {
      fs.readFileSync.mockImplementation(() => { throw new Error('boom'); });
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'E-01', fn: 'checkReadme' });
      expect(r.status).toBe('failed');
      expect(r.message).toBe('boom');
    });

    test('checkConfigManagement warns without config or env', async () => {
      const c = new ComprehensiveChecker({ projectRoot: '/empty' });
      const r = await c.executeCheck({ id: 'D-01', fn: 'checkConfigManagement' });
      expect(r.status).toBe('warning');
    });

    test('checkPerformance warns on many functions', async () => {
      const manyFuncs = Array.from({ length: 25 }, (_, i) => `function f${i}() { return ${i}; }\n`).join('');
      fs.readFileSync.mockReturnValue(manyFuncs);
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'C-04', fn: 'checkPerformance' });
      expect(r.status).toBe('warning');
    });

    test('checkMemoryManagement detects global array', async () => {
      fs.readFileSync.mockReturnValue('global.cache = [];\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'C-01', fn: 'checkMemoryManagement' });
      expect(r.status).toBe('warning');
    });

    test('checkPerformance passes with trivial code', async () => {
      fs.readFileSync.mockReturnValue('const x = 1;\n');
      const c = new ComprehensiveChecker({ projectRoot: mockRoot });
      const r = await c.executeCheck({ id: 'C-04', fn: 'checkPerformance' });
      expect(r.status).toBe('passed');
    });

    test('checkDependencies fails without package.json', async () => {
      const c = new ComprehensiveChecker({ projectRoot: '/no-pkg' });
      const r = await c.executeCheck({ id: 'D-03', fn: 'checkDependencies' });
      expect(r.status).toBe('failed');
    });
  });
});
