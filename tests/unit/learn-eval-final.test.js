const path = require('path');

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn()
}));

const fs = require('fs');
const { extractFinalSkills, run } = require('../../src/learnEvalFinal');

describe('extractFinalSkills', () => {
  let skills;

  beforeAll(() => {
    skills = extractFinalSkills();
  });

  test('returns object with correct top-level shape', () => {
    expect(skills).toEqual(expect.objectContaining({
      phase: 'phase-final',
      timestamp: expect.any(String),
      summary: expect.any(String),
      skills: expect.any(Object),
      patterns: expect.any(Array),
      benchmarks: expect.any(Array),
      reports: expect.any(Array),
      metrics: expect.any(Object)
    }));
    expect(skills.skills).toEqual(expect.objectContaining({
      security: expect.any(Object),
      monitoring: expect.any(Object),
      deployment: expect.any(Object),
      cicd: expect.any(Object),
      services: expect.any(Object),
      tools: expect.any(Object),
      commands: expect.any(Object),
      hooksInk: expect.any(Object),
      core: expect.any(Object)
    }));
  });

  test.each(['security', 'monitoring', 'deployment', 'cicd'])('skills.%s has name, patterns, implementations, learnings', (cat) => {
    const catObj = skills.skills[cat];
    expect(catObj).toEqual(expect.objectContaining({
      name: expect.any(String),
      patterns: expect.any(Array),
      implementations: expect.any(Array),
      learnings: expect.any(Array)
    }));
    expect(catObj.patterns.length).toBeGreaterThan(0);
    expect(catObj.implementations.length).toBeGreaterThan(0);
    expect(catObj.learnings.length).toBeGreaterThan(0);
  });

  test.each(['services', 'tools', 'commands', 'hooksInk', 'core'])('skills.%s has name and arrays', (cat) => {
    const catObj = skills.skills[cat];
    expect(catObj).toEqual(expect.objectContaining({
      name: expect.any(String),
      patterns: expect.any(Array),
      implementations: expect.any(Array),
      learnings: expect.any(Array)
    }));
    expect(catObj.patterns.length).toBeGreaterThan(0);
    expect(catObj.implementations.length).toBeGreaterThan(0);
    expect(catObj.learnings.length).toBeGreaterThan(0);
  });

  test('benchmarks has at least 5 entries with name and operations', () => {
    expect(skills.benchmarks.length).toBeGreaterThanOrEqual(5);
    for (const b of skills.benchmarks) {
      expect(b).toEqual(expect.objectContaining({
        name: expect.any(String),
        operations: expect.any(Number),
        unit: expect.any(String),
        status: expect.any(String)
      }));
    }
  });

  test('reports has entries', () => {
    expect(skills.reports.length).toBeGreaterThan(0);
  });

  test('deepLearning has expected structure', () => {
    expect(skills.deepLearning).toEqual(expect.objectContaining({
      module: 'tools',
      filesRead: expect.any(Array),
      testsAdded: expect.any(String),
      conceptsVerified: expect.any(Array),
      understanding: expect.objectContaining({
        architecture: expect.any(String),
        designPatterns: expect.any(String),
        codeDetails: expect.any(String),
        security: expect.any(String)
      })
    }));
    expect(skills.deepLearning.filesRead.length).toBeGreaterThan(0);
    expect(skills.deepLearning.conceptsVerified.length).toBeGreaterThan(0);
  });

  test('metrics has security, monitoring, deployment, testing', () => {
    expect(skills.metrics).toEqual(expect.objectContaining({
      security: expect.objectContaining({
        criticalIssues: expect.any(Number),
        highIssues: expect.any(Number),
        fixed: expect.any(Number),
        implemented: expect.any(Array)
      }),
      monitoring: expect.objectContaining({
        modules: expect.any(Number),
        benchmarks: expect.any(Number),
        reportsGenerated: expect.any(Number)
      }),
      deployment: expect.objectContaining({
        dockerFiles: expect.any(Number),
        helmCharts: expect.any(Number),
        ciWorkflows: expect.any(Number)
      }),
      testing: expect.objectContaining({
        unitTests: expect.any(String),
        integrationTests: expect.any(String),
        cicdValidation: expect.any(String)
      })
    }));
  });

  test('summary is a non-empty string', () => {
    expect(skills.summary).toEqual(expect.any(String));
    expect(skills.summary.length).toBeGreaterThan(100);
  });

  test('summary includes computed values from metrics', () => {
    expect(skills.summary).toContain(String(skills.metrics.security.criticalIssues));
    expect(skills.summary).toContain(String(skills.metrics.security.highIssues));
    expect(skills.summary).toContain(String(skills.metrics.security.fixed));
    expect(skills.summary).toContain(skills.benchmarks[0].name);
  });

  test('summary includes key learning points', () => {
    expect(skills.summary).toContain('Command injection prevention');
    expect(skills.summary).toContain('Rate limiting');
    expect(skills.summary).toContain('Non-root containers');
  });

  test('security learnings contain expected items', () => {
    const learnings = skills.skills.security.learnings;
    expect(learnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('NEVER'),
        expect.stringContaining('ALWAYS')
      ])
    );
  });

  test('total skills extracted is sum of pattern counts', () => {
    const securityCount = skills.skills.security.patterns.length;
    const monitoringCount = skills.skills.monitoring.patterns.length;
    const deploymentCount = skills.skills.deployment.patterns.length;
    const cicdCount = skills.skills.cicd.patterns.length;
    const total = securityCount + monitoringCount + deploymentCount + cicdCount;
    expect(skills.summary).toContain(`Total Skills Extracted: ${total}`);
  });

  test('calling multiple times returns fresh objects', () => {
    const s1 = extractFinalSkills();
    const s2 = extractFinalSkills();
    expect({ ...s1, timestamp: s2.timestamp }).toEqual(s2);
    expect(s1).not.toBe(s2);
  });

  test('security patterns include Command Injection Prevention', () => {
    const names = skills.skills.security.patterns.map(p => p.name);
    expect(names).toContain('Command Injection Prevention');
    expect(names).toContain('Input Validation');
    expect(names).toContain('Rate Limiting');
    expect(names).toContain('Audit Logging');
    expect(names).toContain('Non-root Container');
  });

  test('monitoring patterns include Prometheus Metrics', () => {
    const names = skills.skills.monitoring.patterns.map(p => p.name);
    expect(names).toContain('Prometheus Metrics');
    expect(names).toContain('Health Check');
    expect(names).toContain('Performance Manager');
    expect(names).toContain('Benchmark Runner');
  });

  test('deployment patterns include Docker and K8s', () => {
    const names = skills.skills.deployment.patterns.map(p => p.name);
    expect(names).toContain('Multi-stage Dockerfile');
    expect(names).toContain('Docker Compose Production');
    expect(names).toContain('Kubernetes Helm');
  });

  test('cicd patterns include pipeline and scanning', () => {
    const names = skills.skills.cicd.patterns.map(p => p.name);
    expect(names).toContain('6-Phase Pipeline');
    expect(names).toContain('Parallel Execution');
    expect(names).toContain('Security Scanning');
  });

  test('services patterns include all 8 entries', () => {
    const names = skills.skills.services.patterns.map(p => p.name);
    expect(names).toEqual([
      'Lazy Schema',
      'Cached Stale',
      'Event Queue',
      'Feature Gate',
      'Type Marker',
      'Retry Backoff',
      'MCP Transport',
      'OAuth Flow'
    ]);
  });

  test('security implementations mention real source files', () => {
    for (const impl of skills.skills.security.implementations) {
      expect(impl).toMatch(/^(src|\.github)/);
    }
  });

  test('benchmark operations are positive numbers', () => {
    for (const b of skills.benchmarks) {
      expect(b.operations).toBeGreaterThan(0);
    }
  });

  test('timestamp is valid ISO string', () => {
    const ts = new Date(skills.timestamp);
    expect(ts.toISOString()).toBe(skills.timestamp);
  });
});

describe('run', () => {
  let consoleSpy;
  let result;

  beforeAll(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    fs.existsSync.mockReturnValue(false);
    fs.writeFileSync.mockClear();
    fs.mkdirSync.mockClear();
    result = run();
  });

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  test('returns skills object', () => {
    expect(result).toEqual(expect.objectContaining({
      phase: 'phase-final',
      skills: expect.any(Object)
    }));
  });

  test('ensures output directory exists', () => {
    expect(fs.existsSync).toHaveBeenCalled();
    expect(fs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('.opencode'),
      { recursive: true }
    );
  });

  test('writes phase-final.json and latest.json', () => {
    const calls = fs.writeFileSync.mock.calls;
    expect(calls.length).toBe(2);
    expect(calls[0][0]).toContain('phase-final.json');
    expect(calls[1][0]).toContain('latest.json');
    for (const [, content] of calls) {
      const parsed = JSON.parse(content);
      expect(parsed.phase).toBe('phase-final');
    }
  });

  test('writes with UTF-8 encoding and pretty formatting', () => {
    const calls = fs.writeFileSync.mock.calls;
    for (const [, , encoding] of calls) {
      expect(encoding).toBe('utf8');
    }
    const firstContent = calls[0][1];
    expect(firstContent).toContain('\n  ');
    expect(firstContent).toContain('"phase"');
  });

  test('output path uses skills subdirectory', () => {
    const outPath = fs.writeFileSync.mock.calls[0][0];
    expect(outPath).toContain(path.join('.opencode', 'skills'));
  });

  test('calls console.log three times', () => {
    expect(consoleSpy).toHaveBeenCalledTimes(3);
    expect(consoleSpy.mock.calls[0][0]).toContain('Learn-Eval');
    expect(consoleSpy.mock.calls[1][0]).toContain('Output:');
  });

  test('calls extractFinalSkills to build the skills data', () => {
    const skillsFromRun = result;
    expect(skillsFromRun.skills.security.patterns.length).toBeGreaterThan(0);
    expect(skillsFromRun.skills.monitoring.patterns.length).toBeGreaterThan(0);
  });

  test('ensureDir creates parent when missing', () => {
    const existsCalls = fs.existsSync.mock.calls;
    const mkdirCalls = fs.mkdirSync.mock.calls;
    expect(mkdirCalls.length).toBeGreaterThanOrEqual(1);
    expect(existsCalls.length).toBeGreaterThanOrEqual(1);
  });
});

describe('run with existing directory', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    fs.existsSync.mockReturnValue(true);
    fs.writeFileSync.mockClear();
    fs.mkdirSync.mockClear();
    run();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test('skips mkdirSync when dir exists', () => {
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });
});

describe('module self-invocation', () => {
  let originalMain;

  beforeAll(() => {
    originalMain = require.main;
  });

  afterAll(() => {
    require.main = originalMain;
  });

  test('run() not invoked automatically when required', () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    require.main = { filename: 'not_learnEvalFinal' };
    fs.writeFileSync.mockClear();
    jest.resetModules();
    jest.doMock('fs', () => ({
      existsSync: jest.fn(),
      mkdirSync: jest.fn(),
      writeFileSync: jest.fn()
    }));
    require('../../src/learnEvalFinal');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
    spy.mockRestore();
    jest.dontMock('fs');
  });
});
