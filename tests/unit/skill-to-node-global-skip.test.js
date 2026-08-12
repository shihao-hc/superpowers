jest.mock('../../src/performance/PythonEnvManager', () => {
  const MockPythonEnvManager = jest.fn().mockImplementation(() => ({
    runPythonScript: jest.fn().mockRejectedValue(new Error('no py')),
    ensureEnvironment: jest.fn().mockResolvedValue(),
    getMetrics: jest.fn().mockReturnValue({ totalExecutions: 0 }),
    getCacheStats: jest.fn().mockReturnValue({ hits: 0, misses: 0 }),
    clearCache: jest.fn()
  }));
  return { PythonEnvManager: MockPythonEnvManager };
});

jest.mock('../../src/utils/SafeExec', () => ({
  safeExecFile: jest.fn((_cmd, _args, _opts, cb) => { if (typeof cb === 'function') { cb(null, { stdout: '{}', stderr: '' }); } })
}));

jest.mock('fs');

jest.mock('../../src/skills/SkillNodeDefinitions');

jest.mock('../../src/skills/executors/DocxExecutor', () => ({
  DocxExecutor: jest.fn(),
  execute: undefined
}));
jest.mock('../../src/skills/executors/PdfExecutor', () => ({
  PdfExecutor: jest.fn(),
  execute: undefined
}));
jest.mock('../../src/skills/executors/CanvasExecutor', () => ({
  CanvasExecutor: jest.fn(),
  execute: undefined
}));

const { SkillToNode } = require('../../src/skills/SkillToNode');
const fs = require('fs');
const { safeExecFile } = require('../../src/utils/SafeExec');

describe('SkillToNode global executor skip (isolated)', () => {
  let converter;
  const baseSkill = { name: 'test-skill', description: 'desc', skillPath: '/skills/test', version: '1.0', inputs: [], scripts: [] };
  const baseScript = { language: 'node', entry: 'index.js' };

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    converter = new SkillToNode({ registerNodeType: jest.fn() }, {}, {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should skip docx global executor when execute is missing', async () => {
    await converter.executeSkillScript({ ...baseSkill, name: 'docx' }, baseScript, {});
    expect(safeExecFile).toHaveBeenCalled();
  });

  it('should skip pdf global executor when execute is missing', async () => {
    fs.existsSync.mockImplementation((p) => p.includes('PdfExecutor'));
    await converter.executeSkillScript({ ...baseSkill, name: 'pdf' }, baseScript, {});
    expect(safeExecFile).toHaveBeenCalled();
  });

  it('should skip canvas global executor when execute is missing', async () => {
    fs.existsSync.mockImplementation((p) => p.includes('CanvasExecutor'));
    await converter.executeSkillScript({ ...baseSkill, name: 'canvas-design' }, baseScript, {});
    expect(safeExecFile).toHaveBeenCalled();
  });
});
