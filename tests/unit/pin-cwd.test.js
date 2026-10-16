const os = require('os');

describe('pinCwd', () => {
  let orig;
  const { pinCwd, ROOT } = require('../../src/utils/pinCwd');

  beforeEach(() => { orig = process.cwd(); });
  afterEach(() => { try { process.chdir(orig); } catch (e) { /* ignore */ } });

  it('从外部 cwd 调用后回到项目根', () => {
    process.chdir(os.tmpdir());
    const r = pinCwd();
    expect(r.ok).toBe(true);
    expect(process.cwd()).toBe(ROOT);
  });

  it('已在项目根时幂等（no-op，仍返回 ok）', () => {
    process.chdir(ROOT);
    const r = pinCwd();
    expect(r.ok).toBe(true);
    expect(process.cwd()).toBe(ROOT);
  });

  it('ROOT 锚定 __dirname（= 项目根，含 package.json）', () => {
    const fs = require('fs');
    const path = require('path');
    expect(fs.existsSync(path.join(ROOT, 'package.json'))).toBe(true);
  });

  it('目标不存在时返回 ok:false 且不抛错', () => {
    const r = pinCwd(os.tmpdir() + '__no_such_dir__' + Date.now());
    expect(r.ok).toBe(false);
    expect(typeof r.error).toBe('string');
  });
});
