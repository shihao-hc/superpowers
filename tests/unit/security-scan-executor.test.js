const os = require('os');
const path = require('path');
const fs = require('fs');
const { SecurityScanExecutor } = require('../../src/skills/executors/SecurityScanExecutor');

describe('SecurityScanExecutor (deterministic security scan, no LLM)', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secscan-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects hardcoded secrets in scanned code', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'config.js'), 'const JWT_SECRET = \'super-secret-value-123\';\nmodule.exports = { JWT_SECRET };\n');
    const r = await SecurityScanExecutor.execute({ root: tmpDir, limit: 100 });
    expect(r.ok).toBe(true);
    expect(r.result.findings.some((f) => f.type === 'hardcoded-secret' && f.file === 'src/config.js')).toBe(true);
  });

  it('returns zero findings for clean code', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'ok.js'), 'const secret = process.env.JWT_SECRET;\nconsole.log(\'safe\');\n');
    const r = await SecurityScanExecutor.execute({ root: tmpDir, limit: 100 });
    expect(r.ok).toBe(true);
    expect(r.result.findings.length).toBe(0);
  });

  it('skips node_modules and test files', async () => {
    fs.mkdirSync(path.join(tmpDir, 'src', 'node_modules', 'dep'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'node_modules', 'dep', 'index.js'), 'const API_KEY = \'should-be-skipped-123\';\n');
    fs.writeFileSync(path.join(tmpDir, 'src', 'foo.test.js'), 'const TOKEN = \'should-be-skipped-456\';\n');
    const r = await SecurityScanExecutor.execute({ root: tmpDir, limit: 100 });
    expect(r.ok).toBe(true);
    expect(r.result.findings.length).toBe(0);
  });

  it('returns honest failure on invalid root', async () => {
    const r = await SecurityScanExecutor.execute({ root: path.join(tmpDir, 'nonexistent'), limit: 100 });
    expect(r.ok).toBe(true); // 目录不存在 → 空结果，不崩溃
    expect(r.result.findings.length).toBe(0);
  });
});