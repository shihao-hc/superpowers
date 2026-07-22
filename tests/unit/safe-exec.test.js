const { safeExecSync, safeSpawn, safeExecFile, validateCommand, configure, ALLOWED_COMMANDS } = require('../../src/utils/SafeExec');

describe('SafeExec - 命令注入防护回归测试', () => {
  afterEach(() => {
    configure(ALLOWED_COMMANDS);
  });

  describe('validateCommand', () => {
    it('应允许白名单命令', () => {
      expect(validateCommand('node')).toBe(true);
      expect(validateCommand('git')).toBe(true);
      expect(validateCommand('npm')).toBe(true);
    });

    it('应拒绝非白名单命令', () => {
      expect(validateCommand('rm')).toBe(false);
      expect(validateCommand('wget')).toBe(false);
      expect(validateCommand('nc')).toBe(false);
      expect(validateCommand('malicious')).toBe(false);
    });

    it('应忽略可执行文件扩展名', () => {
      expect(validateCommand('node.exe')).toBe(true);
      expect(validateCommand('git.exe')).toBe(true);
      expect(validateCommand('npm.cmd')).toBe(true);
    });
  });

  describe('validateArgs', () => {
    it('应接受有效的字符串参数数组', () => {
      expect(safeExecSync('node', ['-e', 'console.log("ok")']).trim()).toBe('ok');
    });

    it('应拒绝非数组参数', () => {
      expect(() => safeExecSync('node', null)).toThrow('Invalid arguments');
      expect(() => safeExecSync('node', 'string')).toThrow('Invalid arguments');
      expect(() => safeExecSync('node', {})).toThrow('Invalid arguments');
    });

    it('应拒绝含 null byte 的参数', () => {
      expect(() => safeExecSync('echo', ['hello\0world'])).toThrow('Invalid arguments');
    });

    it('应拒绝超长参数', () => {
      const longArg = 'a'.repeat(10241);
      expect(() => safeExecSync('echo', [longArg])).toThrow('Invalid arguments');
    });
  });

  describe('safeExecSync', () => {
    it('应返回标准输出', () => {
      const result = safeExecSync('node', ['-e', 'console.log("safe-exec-test")']).trim();
      expect(result).toBe('safe-exec-test');
    });

    it('应拒绝非白名单命令', () => {
      expect(() => safeExecSync('rm', ['-rf', '/'])).toThrow('Command not allowed');
    });

    it('应在命令失败时抛出', () => {
      expect(() => safeExecSync('node', ['-e', 'process.exit(1)'])).toThrow('Command failed');
    });

    it('应用 encoding 选项', () => {
      const result = safeExecSync('node', ['-e', 'console.log("encoding")'], { encoding: 'utf8' }).trim();
      expect(result).toBe('encoding');
    });
  });

  describe('safeSpawn', () => {
    it('应拒绝 shell 模式', () => {
      expect(() => safeSpawn('node', ['-e', ''], { shell: true })).toThrow('shell mode is disabled');
    });

    it('应拒绝非白名单命令', () => {
      expect(() => safeSpawn('wget', ['http://evil.com'], {})).toThrow('Command not allowed');
    });
  });

  describe('safeExecFile', () => {
    it('应拒绝非白名单命令', () => {
      expect(() => safeExecFile('rm', ['-rf', '/'])).toThrow('Command not allowed');
    });

    it('应覆盖 shell 模式为 false', () => {
      expect(() => safeExecFile('node', ['-e', 'console.log("ok")'], { shell: true })).not.toThrow();
    });
  });

  describe('configure', () => {
    it('应更新白名单', () => {
      configure(['echo']);
      expect(validateCommand('echo')).toBe(true);
      expect(validateCommand('node')).toBe(false);
    });

    it('应还原白名单', () => {
      configure(['echo']);
      configure(ALLOWED_COMMANDS);
      expect(validateCommand('node')).toBe(true);
    });
  });

  describe('回归: SC-001 (白名单绕过)', () => {
    it('路径遍历命令不应绕过白名单', () => {
      expect(validateCommand('/usr/bin/rm')).toBe(false);
      expect(validateCommand('../evil')).toBe(false);
      expect(validateCommand('./malicious')).toBe(false);
    });
  });

  describe('safeSpawn 补全覆盖', () => {
    it('应拒绝无效参数', () => {
      expect(() => safeSpawn('node', null)).toThrow('Invalid arguments');
      expect(() => safeSpawn('node', 'string')).toThrow('Invalid arguments');
    });

    it('应成功生成子进程', () => {
      const child = safeSpawn('node', ['-e', 'console.log("ok")']);
      expect(child).toBeDefined();
      expect(child.pid).toBeGreaterThan(0);
      child.kill();
    });
  });

  describe('safeExecFile 补全覆盖', () => {
    it('应拒绝无效参数', () => {
      expect(() => safeExecFile('node', null)).toThrow('Invalid arguments');
    });

    it('应成功执行文件', (done) => {
      const child = safeExecFile('node', ['-e', 'process.exit(0)']);
      expect(child).toBeDefined();
      child.on('exit', (code) => {
        expect(code).toBe(0);
        done();
      });
    });
  });

  describe('safeExecSync 补全覆盖', () => {
    it('应在 spawn 错误时抛出', () => {
      expect(() => safeExecSync('deno', ['--version'])).toThrow();
    });

    it('应处理空输出', () => {
      const result = safeExecSync('node', ['-e', '']);
      expect(result).toBe('');
    });
  });
});
