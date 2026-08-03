const fs = require('fs');

jest.mock('../../src/mcp/MCPBridge', () => ({
  MCPBridge: jest.fn().mockImplementation(() => ({
    register: jest.fn()
  }))
}));

const mockGenerateMCPConfig = jest.fn();
const mockCreateServerScript = jest.fn();
const mockCleanup = jest.fn();
jest.mock('../../src/skills/mcp/SkillMCPGenerator', () => ({
  SkillMCPGenerator: jest.fn().mockImplementation(() => ({
    generateMCPConfig: mockGenerateMCPConfig,
    createServerScript: mockCreateServerScript,
    cleanup: mockCleanup
  }))
}));

jest.mock('../../src/skills/SkillNodeDefinitions', () => ({
  SkillNodeDefinitions: {
    getNodeDefinition: jest.fn()
  }
}));

jest.mock('../../src/utils/SafeExec', () => ({
  safeSpawn: jest.fn(),
  safeExecFile: jest.fn()
}));

const { safeSpawn } = require('../../src/utils/SafeExec');
const { SkillNodeDefinitions } = require('../../src/skills/SkillNodeDefinitions');
const { SkillToMCP } = require('../../src/skills/SkillToMCP');

function makeSkill(overrides = {}) {
  return {
    name: 'test-skill',
    description: 'A test skill',
    inputs: [],
    scripts: [],
    ...overrides
  };
}

function makeAction(name, overrides = {}) {
  return { name, description: `Action ${name}`, inputs: [], ...overrides };
}

function makeScript(overrides = {}) {
  return { path: 'script.js', language: 'javascript', ...overrides };
}

function makeMCPConfig(overrides = {}) {
  return {
    name: 'test-skill-mcp',
    command: 'node',
    args: ['server.js'],
    env: {},
    ...overrides
  };
}

describe('SkillToMCP', () => {
  let bridge;
  let skillLoader;
  let converter;

  beforeEach(() => {
    jest.clearAllMocks();
    bridge = { register: jest.fn() };
    skillLoader = {
      getSkill: jest.fn(),
      getAllSkills: jest.fn()
    };
    converter = new SkillToMCP(bridge, skillLoader);
  });

  describe('constructor', () => {
    it('should store dependencies and initialize maps', () => {
      expect(converter.mcpBridge).toBe(bridge);
      expect(converter.skillLoader).toBe(skillLoader);
      expect(converter.mcpGenerator).toBeDefined();
      expect(converter.registeredTools).toBeInstanceOf(Map);
      expect(converter.registeredServers).toBeInstanceOf(Map);
      expect(converter.registeredTools.size).toBe(0);
      expect(converter.registeredServers.size).toBe(0);
    });

    it('should create SkillMCPGenerator instance', () => {
      const { SkillMCPGenerator } = require('../../src/skills/mcp/SkillMCPGenerator');
      expect(SkillMCPGenerator).toHaveBeenCalledTimes(1);
    });
  });

  describe('convertSkillToMCPTools', () => {
    it('should throw when skill is not found', async () => {
      skillLoader.getSkill.mockReturnValue(null);

      await expect(converter.convertSkillToMCPTools('nonexistent'))
        .rejects.toThrow('Skill not found: nonexistent');
    });

    it('should register tools from node definition actions', async () => {
      const skill = makeSkill({ inputs: [] });
      const mcpConfig = makeMCPConfig();
      skillLoader.getSkill.mockReturnValue(skill);
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue({
        actions: [makeAction('action1'), makeAction('action2')]
      });

      const result = await converter.convertSkillToMCPTools('test-skill');

      expect(result).toBe(mcpConfig);
      expect(converter.registeredTools.size).toBe(2);
      expect(converter.registeredTools.has('test-skill:action1')).toBe(true);
      expect(converter.registeredTools.has('test-skill:action2')).toBe(true);
      expect(converter.registeredServers.get('test-skill')).toBe(mcpConfig);
    });

    it('should skip already registered tools', async () => {
      const skill = makeSkill();
      const mcpConfig = makeMCPConfig();
      skillLoader.getSkill.mockReturnValue(skill);
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue({
        actions: [makeAction('dup'), makeAction('dup')]
      });

      await converter.convertSkillToMCPTools('test-skill');

      expect(converter.registeredTools.size).toBe(1);
      expect(converter.registeredTools.get('test-skill:dup').action).toBe('dup');
    });

    it('should deduplicate scripts with same default action', async () => {
      const skill = makeSkill({ scripts: [makeScript({ path: 'run.sh' }), makeScript({ path: 'build.sh' })] });
      const mcpConfig = makeMCPConfig();
      skillLoader.getSkill.mockReturnValue(skill);
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);

      await converter.convertSkillToMCPTools('test-skill');

      expect(converter.registeredTools.size).toBe(1);
      expect(converter.registeredTools.has('test-skill:execute')).toBe(true);
      expect(converter.registeredServers.get('test-skill')).toBe(mcpConfig);
    });

    it('should create generic tool when no scripts and no node actions', async () => {
      const skill = makeSkill({ scripts: [], description: 'Generic skill' });
      const mcpConfig = makeMCPConfig();
      skillLoader.getSkill.mockReturnValue(skill);
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue({});

      await converter.convertSkillToMCPTools('test-skill');

      expect(converter.registeredTools.has('test-skill:generic')).toBe(true);
      expect(converter.registeredServers.get('test-skill')).toBe(mcpConfig);
    });

    it('should skip generic tool when no description', async () => {
      const skill = makeSkill({ scripts: [], description: '' });
      const mcpConfig = makeMCPConfig();
      skillLoader.getSkill.mockReturnValue(skill);
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);

      await converter.convertSkillToMCPTools('test-skill');

      expect(converter.registeredTools.size).toBe(0);
      expect(converter.registeredServers.get('test-skill')).toBe(mcpConfig);
    });
  });

  describe('createMCPToolFromScript', () => {
    it('should register tool from script with action from inputs', async () => {
      const skill = makeSkill({
        name: 'test-skill',
        inputs: [{ name: 'action', enum: ['run'] }]
      });
      const mcpConfig = makeMCPConfig();

      const result = await converter.createMCPToolFromScript(skill, makeScript(), mcpConfig);

      expect(result).toBe('test-skill:run');
      const saved = converter.registeredTools.get('test-skill:run');
      expect(saved.skillName).toBe('test-skill');
      expect(saved.action).toBe('run');
      expect(saved.script).toBeDefined();
      expect(saved.mcpConfig).toBe(mcpConfig);
    });

    it('should default action to execute when no action input', async () => {
      const skill = makeSkill({ inputs: [{ name: 'other', enum: ['val'] }] });
      const mcpConfig = makeMCPConfig();

      const result = await converter.createMCPToolFromScript(skill, makeScript(), mcpConfig);

      expect(result).toBe('test-skill:execute');
      expect(converter.registeredTools.get('test-skill:execute').action).toBe('execute');
    });

    it('should return existing tool if already registered', async () => {
      const skill = makeSkill({ inputs: [{ name: 'action', enum: ['run'] }] });
      const mcpConfig = makeMCPConfig();
      converter.registeredTools.set('test-skill:run', { existing: true });

      const result = await converter.createMCPToolFromScript(skill, makeScript(), mcpConfig);

      expect(result).toEqual({ existing: true });
    });

    it('should extract inputs from skill for definition', async () => {
      const skill = makeSkill({
        inputs: [
          { name: 'input1', type: 'string', description: 'desc1', required: true },
          { name: 'input2', type: 'number', description: 'desc2', required: false }
        ]
      });
      const mcpConfig = makeMCPConfig();

      await converter.createMCPToolFromScript(skill, makeScript(), mcpConfig);

      const saved = converter.registeredTools.get('test-skill:execute');
      expect(saved.definition.inputs).toEqual({
        input1: { type: 'string', description: 'desc1', required: true },
        input2: { type: 'number', description: 'desc2', required: false }
      });
    });
  });

  describe('createGenericMCPTool', () => {
    it('should register generic tool for skill with description', async () => {
      const skill = makeSkill({ description: 'My great skill' });
      const mcpConfig = makeMCPConfig();

      const result = await converter.createGenericMCPTool(skill, mcpConfig);

      expect(result).toBe('test-skill:generic');
      const saved = converter.registeredTools.get('test-skill:generic');
      expect(saved.action).toBe('generic');
      expect(saved.definition.description).toBe('My great skill');
      expect(saved.mcpConfig).toBe(mcpConfig);
    });

    it('should fallback description when skill has none', async () => {
      const skill = makeSkill({ description: '' });

      await converter.createGenericMCPTool(skill, makeMCPConfig());

      const saved = converter.registeredTools.get('test-skill:generic');
      expect(saved.definition.description).toBe('Generic action for test-skill');
    });

    it('should return existing tool if already registered', async () => {
      converter.registeredTools.set('test-skill:generic', { existing: true });

      const result = await converter.createGenericMCPTool(makeSkill({ description: 'test' }), makeMCPConfig());

      expect(result).toEqual({ existing: true });
    });
  });

  describe('registerAsMCPTool', () => {
    it('should throw when skill is not found', async () => {
      skillLoader.getSkill.mockReturnValue(null);

      await expect(converter.registerAsMCPTool('nonexistent'))
        .rejects.toThrow('Skill not found: nonexistent');
    });

    it('should generate config and register with bridge', async () => {
      const skill = makeSkill();
      const mcpConfig = makeMCPConfig({ name: 'test-skill-mcp' });
      skillLoader.getSkill.mockReturnValue(skill);
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);
      bridge.register.mockResolvedValue({ toolsCount: 3 });

      const result = await converter.registerAsMCPTool('test-skill');

      expect(bridge.register).toHaveBeenCalledWith(mcpConfig);
      expect(result).toEqual({
        success: true,
        skillName: 'test-skill',
        toolName: 'test-skill:execute',
        serverName: 'test-skill-mcp',
        toolsCount: 3,
        mcpConfig
      });
    });

    it('should use cached config if already generated', async () => {
      const mcpConfig = makeMCPConfig({ name: 'test-skill-mcp' });
      converter.registeredServers.set('test-skill', mcpConfig);
      const skill = makeSkill();
      skillLoader.getSkill.mockReturnValue(skill);
      bridge.register.mockResolvedValue({ toolsCount: 2 });

      const result = await converter.registerAsMCPTool('test-skill', 'custom-action');

      expect(mockGenerateMCPConfig).not.toHaveBeenCalled();
      expect(result.toolName).toBe('test-skill:custom-action');
    });

    it('should use generic tool when explicit falsy action and generic exists', async () => {
      const skill = makeSkill();
      const mcpConfig = makeMCPConfig({ name: 'test-skill-mcp' });
      converter.registeredServers.set('test-skill', mcpConfig);
      converter.registeredTools.set('test-skill:generic', { existing: true });
      skillLoader.getSkill.mockReturnValue(skill);
      bridge.register.mockResolvedValue({ toolsCount: 1 });

      const result = await converter.registerAsMCPTool('test-skill', null);

      expect(result.toolName).toBe('test-skill:generic');
    });

    it('should return error info when bridge registration fails', async () => {
      const skill = makeSkill();
      const mcpConfig = makeMCPConfig();
      skillLoader.getSkill.mockReturnValue(skill);
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);
      bridge.register.mockRejectedValue(new Error('Server already registered'));

      const result = await converter.registerAsMCPTool('test-skill');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server already registered');
      expect(result.skillName).toBe('test-skill');
    });

    it('should mark tool as registered in bridge on success', async () => {
      const skill = makeSkill();
      const mcpConfig = makeMCPConfig();
      skillLoader.getSkill.mockReturnValue(skill);
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);
      bridge.register.mockResolvedValue({ toolsCount: 1 });
      const toolKey = 'test-skill:execute';
      converter.registeredTools.set(toolKey, { skillName: 'test-skill', action: 'execute' });

      await converter.registerAsMCPTool('test-skill');

      expect(converter.registeredTools.get(toolKey).registeredInBridge).toBe(true);
      expect(converter.registeredTools.get(toolKey).bridgeResult).toEqual({ toolsCount: 1 });
    });

    it('should still mark as registered even when tool not in map', async () => {
      const skill = makeSkill({ scripts: [], description: '' });
      const mcpConfig = makeMCPConfig();
      skillLoader.getSkill.mockReturnValue(skill);
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);
      bridge.register.mockResolvedValue({ toolsCount: 0 });

      const result = await converter.registerAsMCPTool('test-skill');

      expect(result.success).toBe(true);
    });
  });

  describe('registerAllSkills', () => {
    it('should register all skills and return results', async () => {
      const skills = [
        makeSkill({ name: 'skill-a' }),
        makeSkill({ name: 'skill-b' })
      ];
      skillLoader.getAllSkills.mockReturnValue(skills);
      skillLoader.getSkill.mockImplementation((name) => skills.find(s => s.name === name));
      const mcpConfig = makeMCPConfig();
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);
      bridge.register.mockResolvedValue({ toolsCount: 2 });

      const results = await converter.registerAllSkills();

      expect(results).toHaveLength(2);
      expect(results[0].skillName).toBe('skill-a');
      expect(results[0].success).toBe(true);
      expect(results[1].skillName).toBe('skill-b');
      expect(results[1].success).toBe(true);
    });

    it('should handle individual skill registration failures', async () => {
      const skills = [
        makeSkill({ name: 'skill-a' }),
        makeSkill({ name: 'skill-b' })
      ];
      skillLoader.getAllSkills.mockReturnValue(skills);
      skillLoader.getSkill.mockImplementation((name) => {
        if (name === 'skill-a') return skills[0];
        return null;
      });
      const mcpConfig = makeMCPConfig();
      mockGenerateMCPConfig.mockReturnValue(mcpConfig);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);
      bridge.register.mockResolvedValue({ toolsCount: 2 });

      const results = await converter.registerAllSkills();

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBeDefined();
    });

    it('should catch exceptions from registerAsMCPTool', async () => {
      const skills = [makeSkill({ name: 'skill-a' })];
      skillLoader.getAllSkills.mockReturnValue(skills);
      skillLoader.getSkill.mockReturnValue(null);

      const results = await converter.registerAllSkills();

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error).toBe('Skill not found: skill-a');
    });

    it('should return empty array when no skills', async () => {
      skillLoader.getAllSkills.mockReturnValue([]);

      const results = await converter.registerAllSkills();

      expect(results).toEqual([]);
    });
  });

  describe('extractInputsFromSkill', () => {
    it('should extract inputs with all fields', () => {
      const skill = makeSkill({
        inputs: [
          { name: 'url', type: 'string', description: 'The URL', required: true },
          { name: 'count', type: 'number', description: 'Count', required: false, default: 10 },
          { name: 'mode', type: 'string', description: 'Mode', enum: ['auto', 'manual'] }
        ]
      });

      const result = converter.extractInputsFromSkill(skill);

      expect(result).toEqual({
        url: { type: 'string', description: 'The URL', required: true },
        count: { type: 'number', description: 'Count', required: false, default: 10 },
        mode: { type: 'string', description: 'Mode', required: false, enum: ['auto', 'manual'] }
      });
    });

    it('should return empty object when no inputs', () => {
      const skill = makeSkill({ inputs: [] });

      expect(converter.extractInputsFromSkill(skill)).toEqual({});
    });

    it('should return empty object when inputs is not an array', () => {
      const skill = makeSkill({ inputs: null });

      expect(converter.extractInputsFromSkill(skill)).toEqual({});
    });

    it('should handle undefined inputs', () => {
      const skill = makeSkill({});
      delete skill.inputs;

      expect(converter.extractInputsFromSkill(skill)).toEqual({});
    });

    it('should use input name as description when description missing', () => {
      const skill = makeSkill({
        inputs: [{ name: 'unnamed' }]
      });

      const result = converter.extractInputsFromSkill(skill);

      expect(result.unnamed.description).toBe('unnamed');
    });

    it('should default required to false', () => {
      const skill = makeSkill({
        inputs: [{ name: 'opt' }]
      });

      expect(converter.extractInputsFromSkill(skill).opt.required).toBe(false);
    });
  });

  describe('getRegisteredTools', () => {
    it('should return tools matching skill name', () => {
      converter.registeredTools.set('skill-a:action1', {
        skillName: 'skill-a',
        action: 'action1',
        definition: { description: 'desc1' }
      });
      converter.registeredTools.set('skill-a:action2', {
        skillName: 'skill-a',
        action: 'action2',
        definition: { description: 'desc2' }
      });
      converter.registeredTools.set('skill-b:action1', {
        skillName: 'skill-b',
        action: 'action1'
      });

      const result = converter.getRegisteredTools('skill-a');

      expect(result).toHaveLength(2);
      expect(result.find(t => t.action === 'action1').description).toBe('desc1');
      expect(result.find(t => t.action === 'action2').description).toBe('desc2');
    });

    it('should return empty array when skill has no tools', () => {
      converter.registeredTools.set('other-skill:action', { skillName: 'other-skill' });

      expect(converter.getRegisteredTools('skill-a')).toEqual([]);
    });

    it('should return empty array when no tools at all', () => {
      expect(converter.getRegisteredTools('skill-a')).toEqual([]);
    });
  });

  describe('getAllRegisteredTools', () => {
    it('should return all registered tools', () => {
      converter.registeredTools.set('tool1', { skillName: 'skill-a', action: 'act1', definition: { description: 'd1' }, registeredInBridge: true });
      converter.registeredTools.set('tool2', { skillName: 'skill-b', action: 'act2', definition: { description: 'd2' }, registeredInBridge: false });

      const result = converter.getAllRegisteredTools();

      expect(result).toHaveLength(2);
      expect(result.find(t => t.toolName === 'tool1').registeredInBridge).toBe(true);
      expect(result.find(t => t.toolName === 'tool2').registeredInBridge).toBe(false);
    });

    it('should return empty array when no tools registered', () => {
      expect(converter.getAllRegisteredTools()).toEqual([]);
    });
  });

  describe('getMCPConfigs', () => {
    it('should return server configs', () => {
      converter.registeredServers.set('skill-a', { name: 'server-a', command: 'node', args: ['a.js'] });
      converter.registeredServers.set('skill-b', { name: 'server-b', command: 'python', args: ['b.py'] });

      const result = converter.getMCPConfigs();

      expect(result).toHaveLength(2);
      expect(result.find(c => c.skillName === 'skill-a').serverName).toBe('server-a');
      expect(result.find(c => c.skillName === 'skill-b').command).toBe('python');
      expect(result.find(c => c.skillName === 'skill-b').scriptPath).toBe('b.py');
    });

    it('should return empty array when no servers', () => {
      expect(converter.getMCPConfigs()).toEqual([]);
    });
  });

  describe('clearRegisteredTools', () => {
    it('should clear maps and call cleanup', () => {
      converter.registeredTools.set('tool', {});
      converter.registeredServers.set('server', {});

      converter.clearRegisteredTools();

      expect(converter.registeredTools.size).toBe(0);
      expect(converter.registeredServers.size).toBe(0);
      expect(mockCleanup).toHaveBeenCalledTimes(1);
    });

    it('should work when maps are already empty', () => {
      converter.clearRegisteredTools();

      expect(mockCleanup).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateMCPServerScript', () => {
    it('should throw when skill is not found', () => {
      skillLoader.getSkill.mockReturnValue(null);

      expect(() => converter.generateMCPServerScript('nonexistent'))
        .toThrow('Skill not found: nonexistent');
    });

    it('should return file content from generated script path', () => {
      const skill = makeSkill();
      skillLoader.getSkill.mockReturnValue(skill);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue({ nodeDef: true });
      mockCreateServerScript.mockReturnValue('/tmp/server.js');
      jest.spyOn(fs, 'readFileSync').mockReturnValue('server script content');

      const result = converter.generateMCPServerScript('test-skill');

      expect(result).toBe('server script content');
      expect(mockCreateServerScript).toHaveBeenCalledWith(skill, { nodeDef: true });
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/server.js', 'utf8');
    });

    it('should propagate readFileSync errors', () => {
      const skill = makeSkill();
      skillLoader.getSkill.mockReturnValue(skill);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);
      mockCreateServerScript.mockReturnValue('/tmp/server.js');
      jest.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('ENOENT'); });

      expect(() => converter.generateMCPServerScript('test-skill'))
        .toThrow('ENOENT');
    });
  });

  describe('testMCPServer', () => {
    let childMock;
    let stdoutHandlers;
    let stderrHandlers;
    let exitHandlers;
    let errorHandlers;

    function makeChildMock() {
      const handlers = {};
      return {
        stdout: { on: (evt, fn) => { stdoutHandlers[evt] = fn; } },
        stderr: { on: (evt, fn) => { stderrHandlers[evt] = fn; } },
        stdin: { write: jest.fn() },
        kill: jest.fn(),
        on: (evt, fn) => { handlers[evt] = fn; }
      };
    }

    beforeEach(() => {
      jest.useFakeTimers();
      stdoutHandlers = {};
      stderrHandlers = {};
      exitHandlers = {};
      errorHandlers = {};

      childMock = makeChildMock();
      // Capture error and exit handlers from childMock.on
      childMock.on = (evt, fn) => {
        if (evt === 'exit') exitHandlers[evt] = fn;
        if (evt === 'error') errorHandlers[evt] = fn;
      };

      safeSpawn.mockReturnValue(childMock);
      converter.registeredServers.set('test-skill', makeMCPConfig({
        command: 'node',
        args: ['server.mjs'],
        env: { foo: 'bar' }
      }));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should throw when no MCP config exists', async () => {
      await expect(converter.testMCPServer('unknown'))
        .rejects.toThrow('MCP server not generated for skill: unknown');
    });

    it('should resolve on successful initialization', async () => {
      const promise = converter.testMCPServer('test-skill');

      expect(safeSpawn).toHaveBeenCalledWith('node', ['server.mjs'], {
        env: expect.objectContaining({ foo: 'bar' }),
        stdio: ['pipe', 'pipe', 'pipe']
      });

      stdoutHandlers.data(Buffer.from(JSON.stringify({ protocolVersion: '2024-11-05' })));

      const result = await promise;
      expect(result.success).toBe(true);
      expect(result.skillName).toBe('test-skill');
      expect(result.serverName).toBe('test-skill-mcp');
      expect(result.initializationTime).toBeGreaterThanOrEqual(0);
      expect(result.response).toBeDefined();
      expect(childMock.kill).toHaveBeenCalled();
    });

    it('should reject on child process error', async () => {
      const promise = converter.testMCPServer('test-skill');

      errorHandlers.error(new Error('Process crashed'));

      await expect(promise).rejects.toEqual({
        success: false,
        skillName: 'test-skill',
        error: 'Process crashed',
        stderr: ''
      });
    });

    it('should reject on process exit without initialization', async () => {
      const promise = converter.testMCPServer('test-skill');

      exitHandlers.exit(1, null);

      await expect(promise).rejects.toEqual(expect.objectContaining({
        success: false,
        skillName: 'test-skill',
        error: 'Process exited with code 1 and signal null'
      }));
    });

    it('should include stderr on process exit rejection', async () => {
      const promise = converter.testMCPServer('test-skill');

      stderrHandlers.data(Buffer.from('Error: something failed'));
      exitHandlers.exit(1, 'SIGTERM');

      await expect(promise).rejects.toEqual(expect.objectContaining({
        success: false,
        skillName: 'test-skill',
        error: expect.stringContaining('code 1'),
        stderr: expect.stringContaining('Error: something failed')
      }));
    });

    it('should reject on initialization timeout', async () => {
      const promise = converter.testMCPServer('test-skill');

      jest.advanceTimersByTime(10000);

      await expect(promise).rejects.toEqual(expect.objectContaining({
        success: false,
        skillName: 'test-skill',
        error: 'Initialization timeout'
      }));
      expect(childMock.kill).toHaveBeenCalled();
    });

    it('should send initialize message via stdin', async () => {
      const promise = converter.testMCPServer('test-skill');

      stdoutHandlers.data(Buffer.from(JSON.stringify({ protocolVersion: '2024-11-05' })));
      await promise;

      expect(childMock.stdin.write).toHaveBeenCalledWith(expect.stringContaining('"jsonrpc":"2.0"'));
      expect(childMock.stdin.write).toHaveBeenCalledWith(expect.stringContaining('"initialize"'));
    });
  });
});
