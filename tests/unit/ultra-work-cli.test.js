const fs = require('fs');

jest.mock('fs');
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/').replace(/\\/g, '/')),
  basename: jest.fn((p) => p.split('/').pop() || p.split('\\').pop()),
  extname: jest.fn((p) => { const i = p.lastIndexOf('.'); return i >= 0 ? p.slice(i) : ''; }),
  dirname: jest.fn((p) => p.replace(/[/\\][^/\\]*$/, '') || '.'),
  resolve: jest.fn((...args) => args.join('/'))
}));
jest.mock('crypto', () => {
  const digest = jest.fn(() => 'mock-hash');
  const update = jest.fn(() => ({ digest }));
  return {
    randomBytes: jest.fn(() => Buffer.from('mock-random-bytes')),
    createHash: jest.fn(() => ({ update }))
  };
});

const { UltraWorkCLI } = require('../../src/ecosystem/UltraWorkCLI');

describe('UltraWorkCLI', () => {
  let cli;
  let consoleLogSpy;
  let consoleErrorSpy;
  const ORIGINAL_CWD = process.cwd;

  beforeAll(() => {
    process.cwd = jest.fn(() => '/test/project');
  });

  afterAll(() => {
    process.cwd = ORIGINAL_CWD;
  });

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.clearAllMocks();
    cli = new UltraWorkCLI();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('constructor', () => {
    it('should register all 8 commands', () => {
      expect(cli.commands.size).toBe(8);
    });

    it.each([
      'init', 'validate', 'test', 'publish',
      'list', 'search', 'install', 'generate'
    ])('should register command: %s', (cmd) => {
      expect(cli.commands.has(cmd)).toBe(true);
    });

    it.each([
      ['init', '创建新的技能项目'],
      ['validate', '验证技能配置'],
      ['test', '测试技能'],
      ['publish', '发布技能到市场'],
      ['list', '列出本地技能'],
      ['search', '搜索市场技能'],
      ['install', '安装技能'],
      ['generate', '生成代码']
    ])('command %s should have correct description', (cmd, desc) => {
      expect(cli.commands.get(cmd).description).toBe(desc);
    });
  });

  describe('_toPascalCase', () => {
    it('should convert kebab-case', () => {
      expect(cli._toPascalCase('my-skill')).toBe('MySkill');
    });

    it('should convert snake_case', () => {
      expect(cli._toPascalCase('my_skill')).toBe('MySkill');
    });

    it('should convert space separated', () => {
      expect(cli._toPascalCase('my skill')).toBe('MySkill');
    });

    it('should handle single word', () => {
      expect(cli._toPascalCase('hello')).toBe('Hello');
    });

    it('should lowercase remaining characters', () => {
      expect(cli._toPascalCase('MY-SKILL')).toBe('MySkill');
    });
  });

  describe('_bumpVersion', () => {
    it('should bump patch version', () => {
      expect(cli._bumpVersion('1.0.0')).toBe('1.0.1');
    });

    it('should bump from non-zero patch', () => {
      expect(cli._bumpVersion('2.3.9')).toBe('2.3.10');
    });
  });

  describe('_delay', () => {
    it('should return a promise that resolves after given ms', async () => {
      jest.useFakeTimers();
      const promise = cli._delay(100);
      jest.advanceTimersByTime(100);
      await expect(promise).resolves.toBeUndefined();
      jest.useRealTimers();
    });
  });

  describe('_parseArgs', () => {
    it('should parse positional args into _ array', () => {
      const result = cli._parseArgs(['init', 'my-project'], []);
      expect(result._).toEqual(['init', 'my-project']);
    });

    it('should parse long boolean flags', () => {
      const options = [{ name: 'typescript', type: 'boolean', default: false }];
      const result = cli._parseArgs(['--typescript'], options);
      expect(result.typescript).toBe(true);
    });

    it('should parse long string options', () => {
      const options = [{ name: 'template', type: 'string', default: 'basic' }];
      const result = cli._parseArgs(['--template', 'advanced'], options);
      expect(result.template).toBe('advanced');
    });

    it('should parse short boolean flags', () => {
      const options = [{ name: 'typescript', short: 'T', type: 'boolean', default: false }];
      const result = cli._parseArgs(['-T'], options);
      expect(result.typescript).toBe(true);
    });

    it('should parse short string options', () => {
      const options = [{ name: 'template', short: 't', type: 'string', default: 'basic' }];
      const result = cli._parseArgs(['-t', 'advanced'], options);
      expect(result.template).toBe('advanced');
    });

    it('should apply default values for missing options', () => {
      const options = [{ name: 'template', type: 'string', default: 'basic' }];
      const result = cli._parseArgs([], options);
      expect(result.template).toBe('basic');
    });

    it('should ignore unknown short flags gracefully', () => {
      const result = cli._parseArgs(['-x'], []);
      expect(result._).toEqual([]);
    });
  });

  describe('run', () => {
    it('should log error for unknown command', async () => {
      await cli.run(['nonexistent']);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown command: nonexistent');
    });

    it('should list available commands for unknown command', async () => {
      await cli.run(['bogus']);
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('init'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('validate'));
    });

    it('should dispatch to command handler', async () => {
      const handlerSpy = jest.fn();
      cli.commands.set('dummy', {
        name: 'dummy',
        description: 'test',
        usage: '',
        options: [],
        handler: handlerSpy
      });
      await cli.run(['dummy', 'arg1']);
      expect(handlerSpy).toHaveBeenCalledTimes(1);
      expect(handlerSpy.mock.calls[0][0]._).toEqual(['arg1']);
    });
  });

  describe('_handleInit', () => {
    const name = 'my-skill';

    it('should error if directory exists and no force', async () => {
      fs.existsSync.mockReturnValueOnce(true);
      await cli._handleInit({ name, template: 'basic', typescript: false, force: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('already exists'));
    });

    it('should create directory and files', async () => {
      fs.existsSync.mockReturnValue(false);
      await cli._handleInit({ name, template: 'basic', typescript: false, force: false });
      expect(fs.mkdirSync).toHaveBeenCalledWith('/test/project/my-skill', { recursive: true });
      expect(fs.writeFileSync).toHaveBeenCalledTimes(4);
    });

    it('should overwrite with force flag', async () => {
      fs.existsSync.mockReturnValue(true);
      await cli._handleInit({ name, template: 'basic', typescript: false, force: true });
      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log next steps on success', async () => {
      fs.existsSync.mockReturnValue(false);
      await cli._handleInit({ name, template: 'basic', typescript: false, force: false });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Next steps'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('ultrawork test'));
    });
  });

  describe('_generateProjectFiles', () => {
    it('should generate JS project files', () => {
      const files = cli._generateProjectFiles('my-skill', { template: 'basic', typescript: false });
      expect(Object.keys(files)).toContain('skill.md');
      expect(Object.keys(files)).toContain('index.js');
      expect(Object.keys(files)).toContain('test.js');
      expect(Object.keys(files)).toContain('package.json');
    });

    it('should generate TS project files', () => {
      const files = cli._generateProjectFiles('my-skill', { template: 'basic', typescript: true });
      expect(Object.keys(files)).toContain('index.ts');
      expect(Object.keys(files)).toContain('test.js');
    });

    it('should include class name in JS index content', () => {
      const files = cli._generateProjectFiles('hello-world', { template: 'basic', typescript: false });
      expect(files['index.js']).toContain('HelloWorld');
      expect(files['index.js']).toContain('module.exports = { HelloWorld }');
    });

    it('should generate valid package.json', () => {
      const files = cli._generateProjectFiles('my-skill', { template: 'basic', typescript: false });
      const pkg = JSON.parse(files['package.json']);
      expect(pkg.name).toBe('my-skill');
      expect(pkg.version).toBe('1.0.0');
      expect(pkg.main).toBe('index.js');
    });

    it('should set main to index.ts for TS projects', () => {
      const files = cli._generateProjectFiles('my-skill', { template: 'basic', typescript: true });
      const pkg = JSON.parse(files['package.json']);
      expect(pkg.main).toBe('index.ts');
    });

    it('should generate skill.md with project name', () => {
      const files = cli._generateProjectFiles('my-skill', { template: 'basic', typescript: false });
      expect(files['skill.md']).toContain('# my-skill');
      expect(files['skill.md']).toContain('name: my-skill');
    });
  });

  describe('_handleValidate', () => {
    it('should report missing required files', async () => {
      fs.existsSync.mockReturnValue(false);
      fs.readdirSync.mockReturnValue([]);
      const result = await cli._handleValidate({ path: '/skills/test', strict: false });
      expect(result.valid).toBe(false);
      expect(result.issues).toEqual(
        expect.arrayContaining([{ type: 'error', message: 'Missing required file: skill.md' }])
      );
    });

    it('should report missing YAML block in skill.md', async () => {
      fs.existsSync.mockImplementation((p) => p.includes('skill.md'));
      fs.readFileSync.mockReturnValue('# Test\nname: test');
      fs.readdirSync.mockReturnValue(['index.js']);
      const result = await cli._handleValidate({ path: '/skills/test', strict: false });
      expect(result.warnings).toEqual(
        expect.arrayContaining([{ type: 'warning', message: 'Missing YAML metadata block' }])
      );
    });

    it('should warn if no code files found', async () => {
      fs.existsSync.mockImplementation((p) => p.includes('skill.md'));
      fs.readFileSync.mockReturnValue('# Test\n```yaml\nname: test\n```');
      fs.readdirSync.mockReturnValue(['readme.md']);
      const result = await cli._handleValidate({ path: '/skills/test', strict: false });
      expect(result.warnings).toEqual(
        expect.arrayContaining([{ type: 'warning', message: 'No code files found' }])
      );
    });

    it('should return valid when no issues', async () => {
      fs.existsSync.mockImplementation((_p) => true);
      fs.readFileSync.mockReturnValue('# Test\n```yaml\nname: test\nversion: 1\ninputs:\noutputs:\n```');
      fs.readdirSync.mockReturnValue(['index.js', 'skill.md']);
      const result = await cli._handleValidate({ path: '/skills/test', strict: false });
      expect(result.valid).toBe(true);
    });

    it('should report missing required fields in skill.md', async () => {
      fs.existsSync.mockImplementation((p) => p.includes('skill.md'));
      fs.readFileSync.mockReturnValue('# Test\n```yaml\ndescription: foo\n```');
      fs.readdirSync.mockReturnValue(['index.js']);
      const result = await cli._handleValidate({ path: '/skills/test', strict: false });
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.map((i) => i.message)).toEqual(
        expect.arrayContaining([expect.stringContaining('Missing required field')])
      );
    });
  });

  let mockTestExecute;

  jest.mock('/skills/test/index.js', () => function MockSkill() {
    this.execute = mockTestExecute;
  }, { virtual: true });

  describe('_handleTest', () => {
    it('should error if no index.js', async () => {
      fs.existsSync.mockReturnValue(false);
      await cli._handleTest({ path: '/skills/test', input: null, watch: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('No index.js found'));
    });

    it('should execute test and report pass', async () => {
      mockTestExecute = jest.fn().mockResolvedValue({ success: true, result: {} });
      fs.existsSync.mockReturnValue(true);
      await cli._handleTest({ path: '/skills/test', input: '{"input":"hello"}', watch: false });
      expect(mockTestExecute).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Test passed'));
    });

    it('should handle invalid JSON input gracefully', async () => {
      mockTestExecute = jest.fn().mockResolvedValue({ success: true });
      fs.existsSync.mockReturnValue(true);
      await cli._handleTest({ path: '/skills/test', input: 'not-json', watch: false });
      expect(mockTestExecute).toHaveBeenCalledWith({ input: 'test' });
    });

    it('should catch and log execution errors', async () => {
      mockTestExecute = jest.fn().mockRejectedValue(new Error('exec error'));
      fs.existsSync.mockReturnValue(true);
      await cli._handleTest({ path: '/skills/test', input: null, watch: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('exec error'));
    });
  });

  describe('_handlePublish', () => {
    it('should abort if validation fails', async () => {
      jest.spyOn(cli, '_handleValidate').mockResolvedValue({ valid: false });
      await cli._handlePublish({ path: '/skills/test', version: null, isPrivate: false });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Cannot publish invalid skill'));
    });

    it('should publish and generate skill ID', async () => {
      jest.spyOn(cli, '_delay').mockResolvedValue(undefined);
      jest.spyOn(cli, '_handleValidate').mockResolvedValue({ valid: true });

      await cli._handlePublish({ path: '/skills/test', version: '2.0.0', isPrivate: true });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Published'));
    });

    it('should bump version if not specified', async () => {
      jest.spyOn(cli, '_delay').mockResolvedValue(undefined);
      jest.spyOn(cli, '_handleValidate').mockResolvedValue({ valid: true });
      const bumpSpy = jest.spyOn(cli, '_bumpVersion').mockReturnValue('2.0.1');

      await cli._handlePublish({ path: '/skills/test', version: null, isPrivate: false });
      expect(bumpSpy).toHaveBeenCalledWith('1.0.0');
    });
  });

  describe('_handleList', () => {
    it('should report no skills directory', async () => {
      fs.existsSync.mockReturnValue(false);
      await cli._handleList({ all: false });
      expect(consoleLogSpy).toHaveBeenCalledWith('  No skills directory found.');
    });

    it('should list skill directories', async () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue(['skill-a', 'skill-b', 'file.txt']);
      fs.statSync.mockImplementation((p) => ({
        isDirectory: () => !p.includes('file.txt')
      }));

      await cli._handleList({ all: false });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('skill-a'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('skill-b'));
    });
  });

  describe('_handleSearch', () => {
    it('should display search results', async () => {
      await cli._handleSearch({ _: ['test'], category: null, limit: 20 });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Image Analyzer'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Document Parser'));
    });

    it('should respect limit parameter', async () => {
      await cli._handleSearch({ _: ['test'], category: null, limit: 1 });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Image Analyzer'));
      expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('Document Parser'));
    });
  });

  describe('_handleInstall', () => {
    it('should log installation progress', async () => {
      jest.spyOn(cli, '_delay').mockResolvedValue(undefined);
      await cli._handleInstall({ _: ['skill_abc'], path: './skills' });
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Installing'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Installed'));
    });
  });

  describe('_handleGenerate', () => {
    it('should generate workflow file', async () => {
      await cli._handleGenerate({ _: ['workflow', 'my-flow'], path: '/gen' });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/gen/my-flow.workflow.json',
        expect.any(String)
      );
    });

    it('should generate trigger file', async () => {
      await cli._handleGenerate({ _: ['trigger', 'my-trigger'], path: '/gen' });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/gen/my-trigger.trigger.js',
        expect.any(String)
      );
    });

    it('should generate executor file with PascalCase class', async () => {
      await cli._handleGenerate({ _: ['executor', 'data-process'], path: '/gen' });
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        '/gen/data-processExecutor.js',
        expect.stringContaining('DataProcessExecutor')
      );
    });

    it('should log error for unknown type', async () => {
      await cli._handleGenerate({ _: ['unknown', 'x'], path: '/gen' });
      expect(consoleErrorSpy).toHaveBeenCalledWith('Unknown type: unknown');
    });
  });

  describe('_generateWorkflow', () => {
    it('should create workflow JSON file', async () => {
      await cli._generateWorkflow('test-flow', '/out');
      const content = JSON.parse(fs.writeFileSync.mock.calls[0][1]);
      expect(content.name).toBe('test-flow');
      expect(content.steps).toEqual([]);
      expect(content.triggers).toEqual([]);
    });
  });

  describe('_generateTrigger', () => {
    it('should create trigger JS file', async () => {
      await cli._generateTrigger('my-event', '/out');
      const content = fs.writeFileSync.mock.calls[0][1];
      expect(content).toMatch(/name: 'my-event'/);
      expect(content).toContain('module.exports');
    });
  });

  describe('_generateExecutor', () => {
    it('should create executor JS file with PascalCase class', async () => {
      await cli._generateExecutor('data-flow', '/out');
      const content = fs.writeFileSync.mock.calls[0][1];
      expect(content).toContain('DataFlowExecutor');
      expect(content).toContain('module.exports');
    });
  });
});
