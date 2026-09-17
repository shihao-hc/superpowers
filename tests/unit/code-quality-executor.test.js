jest.mock('child_process', () => ({ execFileSync: jest.fn() }));
const fs = require('fs');
const { execFileSync } = require('child_process');
const { CodeQualityExecutor } = require('../../src/skills/executors/CodeQualityExecutor');

describe('CodeQualityExecutor (deterministic eslint, no LLM)', () => {
  beforeEach(() => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    execFileSync.mockReset();
  });

  it('parses eslint json output into error/warning stats', async () => {
    execFileSync.mockReturnValue(JSON.stringify([
      { filePath: 'D:/x/src/a.js', errorCount: 2, warningCount: 1 },
      { filePath: 'D:/x/src/b.js', errorCount: 0, warningCount: 0 }
    ]));
    const r = await CodeQualityExecutor.execute({ root: 'D:/x' });
    expect(r.ok).toBe(true);
    expect(r.result.errors).toBe(2);
    expect(r.result.warnings).toBe(1);
    expect(r.result.scannedFiles).toBe(2);
    expect(r.result.issues[0].file).toBe('src/a.js');
  });

  it('returns clean result when eslint reports zero problems', async () => {
    execFileSync.mockReturnValue('[]');
    const r = await CodeQualityExecutor.execute({ root: 'D:/x' });
    expect(r.ok).toBe(true);
    expect(r.result.errors).toBe(0);
    expect(r.result.issues).toEqual([]);
  });

  it('returns honest failure when eslint not installed', async () => {
    fs.existsSync.mockReturnValue(false);
    const r = await CodeQualityExecutor.execute({ root: 'D:/x' });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('eslint not installed');
  });
});