const fs = require('fs');
const os = require('os');
const path = require('path');

const SR_PATH = '../../src/plugins/SandboxRunner';
const PM_PATH = '../../src/plugins/PluginManager';

describe('PluginManager', () => {
  let tmpDir;
  let prevCwd;
  let savedSandboxEnv;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pmgr-'));
    prevCwd = process.cwd();
    savedSandboxEnv = process.env.PLUGIN_SANDBOX;
    delete process.env.PLUGIN_SANDBOX;
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (savedSandboxEnv === undefined) {
      delete process.env.PLUGIN_SANDBOX;
    } else {
      process.env.PLUGIN_SANDBOX = savedSandboxEnv;
    }
    process.chdir(prevCwd);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePlugin(name, body) {
    const dir = path.join(tmpDir, 'plugins', name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.js'), body, 'utf8');
  }

  function writeManifest(entries) {
    const dir = path.join(tmpDir, 'plugins');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'manifest.json'),
      JSON.stringify({ plugins: entries }),
      'utf8'
    );
  }

  test('constructor defaults to cwd base and empty state', () => {
    process.chdir(tmpDir);
    const PM = require(PM_PATH);
    const pm = new PM();
    expect(pm.basePath).toBe(tmpDir);
    expect(pm.pluginDir).toBe(path.join(tmpDir, 'plugins'));
    expect(pm.manifestPath).toBe(path.join(tmpDir, 'plugins', 'manifest.json'));
    expect(pm.plugins).toEqual([]);
    expect(pm.instances).toEqual([]);
    expect(pm.useSandbox).toBe(false);
  });

  test('constructor accepts basePath and resolves paths', () => {
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    expect(pm.basePath).toBe(tmpDir);
    expect(pm.pluginDir).toBe(path.join(tmpDir, 'plugins'));
  });

  test('constructor enables sandbox via PLUGIN_SANDBOX=1', () => {
    process.env.PLUGIN_SANDBOX = '1';
    const PM = require(PM_PATH);
    expect(new PM(tmpDir).useSandbox).toBe(true);
  });

  test('constructor enables sandbox via PLUGIN_SANDBOX=true', () => {
    process.env.PLUGIN_SANDBOX = 'true';
    const PM = require(PM_PATH);
    expect(new PM(tmpDir).useSandbox).toBe(true);
  });

  test('loadPlugins reads manifest and loads plugin instances', () => {
    writeManifest([{ name: 'alpha', path: './plugins/alpha' }]);
    writePlugin(
      'alpha',
      'module.exports = class { init() { this.inited = true; } onMessage(m) { return { message: \'a:\' + m }; } }'
    );
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    pm.loadPlugins();
    expect(pm.plugins).toHaveLength(1);
    expect(pm.plugins[0].name).toBe('alpha');
    expect(pm.instances).toHaveLength(1);
    expect(pm.instances[0].name).toBe('alpha');
    expect(pm.instances[0].instance.inited).toBe(true);
  });

  test('loadPlugins calls init only when present', () => {
    writeManifest([{ name: 'noinit', path: './plugins/noinit' }]);
    writePlugin('noinit', 'module.exports = class { onMessage(m) { return { message: m }; } }');
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    pm.loadPlugins();
    expect(pm.instances).toHaveLength(1);
    expect(pm.instances[0].instance.init).toBeUndefined();
  });

  test('loadPlugins auto-discovers plugins when manifest missing', () => {
    writePlugin('found', 'module.exports = class {}');
    fs.mkdirSync(path.join(tmpDir, 'plugins', 'noindex'), { recursive: true });
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    pm.loadPlugins();
    expect(pm.plugins.map((p) => p.name)).toEqual(['found']);
    expect(pm.instances).toHaveLength(1);
    expect(pm.instances[0].name).toBe('found');
  });

  test('loadPlugins tolerates missing plugin dir', () => {
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    pm.loadPlugins();
    expect(pm.plugins).toEqual([]);
    expect(pm.instances).toEqual([]);
  });

  test('loadPlugins handles manifest with undefined plugins', () => {
    const dir = path.join(tmpDir, 'plugins');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'manifest.json'), '{"noplugins":true}', 'utf8');
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    pm.loadPlugins();
    expect(pm.plugins).toEqual([]);
  });

  test('loadPlugins warns when plugin module fails to load', () => {
    writeManifest([{ name: 'broken', path: './plugins/broken' }]);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    pm.loadPlugins();
    expect(warnSpy).toHaveBeenCalled();
    expect(pm.instances).toHaveLength(0);
    warnSpy.mockRestore();
  });

  test('loadPlugins creates sandbox proxies in sandbox mode', async () => {
    writeManifest([{ name: 'sandy', path: './plugins/sandy' }]);
    writePlugin('sandy', 'module.exports = class { onMessage(m) { return { message: m }; } }');
    process.env.PLUGIN_SANDBOX = '1';
    await jest.isolateModulesAsync(async () => {
      jest.doMock(SR_PATH, () => ({ run: jest.fn() }));
      const PM = require(PM_PATH);
      const SR = require(SR_PATH);
      SR.run.mockResolvedValue({ ok: true });
      const pm = new PM(tmpDir);
      pm.loadPlugins();
      expect(pm.instances).toHaveLength(1);
      const { instance } = pm.instances[0];
      const msg = await instance.onMessage('hi', {});
      expect(SR.run).toHaveBeenCalledWith(
        path.join(tmpDir, 'plugins', 'sandy', 'index.js'),
        'onMessage',
        ['hi', {}],
        2000
      );
      expect(msg).toEqual({ ok: true });
    });
  });

  test('sandbox onMessage falls back on failure', async () => {
    writeManifest([{ name: 'sandy', path: './plugins/sandy' }]);
    writePlugin('sandy', 'module.exports = class { onMessage(m) { return { message: m }; } }');
    process.env.PLUGIN_SANDBOX = '1';
    await jest.isolateModulesAsync(async () => {
      jest.doMock(SR_PATH, () => ({ run: jest.fn() }));
      const PM = require(PM_PATH);
      const SR = require(SR_PATH);
      SR.run.mockRejectedValue(new Error('boom'));
      const pm = new PM(tmpDir);
      pm.loadPlugins();
      const { instance } = pm.instances[0];
      const msg = await instance.onMessage('hi', {});
      expect(msg).toEqual({ message: 'hi' });
    });
  });

  test('sandbox onMemory ignores errors', async () => {
    writeManifest([{ name: 'sandy', path: './plugins/sandy' }]);
    writePlugin('sandy', 'module.exports = class {}');
    process.env.PLUGIN_SANDBOX = '1';
    await jest.isolateModulesAsync(async () => {
      jest.doMock(SR_PATH, () => ({ run: jest.fn() }));
      const PM = require(PM_PATH);
      const SR = require(SR_PATH);
      SR.run.mockRejectedValue(new Error('boom'));
      const pm = new PM(tmpDir);
      pm.loadPlugins();
      const { instance } = pm.instances[0];
      await expect(instance.onMemory({ a: 1 }, {})).resolves.toBeUndefined();
      expect(SR.run).toHaveBeenCalledWith(
        path.join(tmpDir, 'plugins', 'sandy', 'index.js'),
        'onMemory',
        [{ a: 1 }, {}],
        1000
      );
    });
  });

  test('sandbox onEvent ignores errors', async () => {
    writeManifest([{ name: 'sandy', path: './plugins/sandy' }]);
    writePlugin('sandy', 'module.exports = class {}');
    process.env.PLUGIN_SANDBOX = '1';
    await jest.isolateModulesAsync(async () => {
      jest.doMock(SR_PATH, () => ({ run: jest.fn() }));
      const PM = require(PM_PATH);
      const SR = require(SR_PATH);
      SR.run.mockRejectedValue(new Error('boom'));
      const pm = new PM(tmpDir);
      pm.loadPlugins();
      const { instance } = pm.instances[0];
      await expect(instance.onEvent({ e: 1 }, {})).resolves.toBeUndefined();
    });
  });

  test('falls back to direct load when SandboxRunner unavailable', () => {
    writeManifest([{ name: 'direct', path: './plugins/direct' }]);
    writePlugin('direct', 'module.exports = class { onMessage(m) { return { message: m }; } }');
    process.env.PLUGIN_SANDBOX = '1';
    jest.isolateModules(() => {
      jest.doMock(SR_PATH, () => {
        throw new Error('sandbox runner failed to load');
      });
      const PM = require(PM_PATH);
      const pm = new PM(tmpDir);
      pm.loadPlugins();
      expect(pm.instances).toHaveLength(1);
      expect(pm.instances[0].instance.onMessage('hi', {})).toEqual({ message: 'hi' });
    });
  });

  test('loadPlugins resolves plugin without explicit path', () => {
    writeManifest([{ name: 'nopath' }]);
    writePlugin('nopath', 'module.exports = class { onMessage(m) { return { message: m }; } }');
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    pm.loadPlugins();
    expect(pm.instances).toHaveLength(1);
    expect(pm.instances[0].name).toBe('nopath');
  });

  test('onMessage chains through instances and transforms message', () => {
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    pm.instances = [
      { name: 'a', instance: { onMessage: jest.fn((m) => ({ message: 'a:' + m })) } },
      { name: 'b', instance: { onMessage: jest.fn((m) => ({ message: 'b:' + m })) } },
      { name: 'c', instance: { onMessage: jest.fn((_m) => ({ nonMessage: true })) } },
      { name: 'd', instance: {} }
    ];
    const out = pm.onMessage('hi');
    expect(out).toEqual({ message: 'b:a:hi' });
    expect(pm.instances[0].instance.onMessage).toHaveBeenCalledWith('hi', {});
    expect(pm.instances[1].instance.onMessage).toHaveBeenCalledWith('a:hi', {});
    expect(pm.instances[2].instance.onMessage).toHaveBeenCalledWith('b:a:hi', {});
    expect(pm.instances[3].instance.onMessage).toBeUndefined();
  });

  test('onMessage skips instances returning null', () => {
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    pm.instances = [{ name: 'a', instance: { onMessage: jest.fn(() => null) } }];
    expect(pm.onMessage('hi')).toEqual({ message: 'hi' });
  });

  test('onMemory calls instance handlers with context', () => {
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    const handler = jest.fn();
    pm.instances = [
      { name: 'a', instance: { onMemory: handler } },
      { name: 'b', instance: {} }
    ];
    pm.onMemory({ m: 1 }, { ctx: true });
    expect(handler).toHaveBeenCalledWith({ m: 1 }, { ctx: true });
  });

  test('onMemory defaults context when omitted', () => {
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    const handler = jest.fn();
    pm.instances = [{ name: 'a', instance: { onMemory: handler } }];
    pm.onMemory({ m: 1 });
    expect(handler).toHaveBeenCalledWith({ m: 1 }, {});
  });

  test('onEvent calls instance handlers with context', () => {
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    const handler = jest.fn();
    pm.instances = [
      { name: 'a', instance: { onEvent: handler } },
      { name: 'b', instance: {} }
    ];
    pm.onEvent({ e: 1 }, { ctx: true });
    expect(handler).toHaveBeenCalledWith({ e: 1 }, { ctx: true });
  });

  test('onEvent defaults context when omitted', () => {
    const PM = require(PM_PATH);
    const pm = new PM(tmpDir);
    const handler = jest.fn();
    pm.instances = [{ name: 'a', instance: { onEvent: handler } }];
    pm.onEvent({ e: 1 });
    expect(handler).toHaveBeenCalledWith({ e: 1 }, {});
  });
});
