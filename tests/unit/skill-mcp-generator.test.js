const fs = require('fs');
const path = require('path');

const mockGetNodeDefinition = jest.fn();
jest.mock('../../src/skills/SkillNodeDefinitions', () => {
  const MockClass = jest.fn().mockImplementation(() => ({
    getNodeTypes: jest.fn(() => ['action', 'condition', 'loop', 'parallel']),
    getNodeDefinition: jest.fn(() => ({ name: 'test', inputs: [], outputs: [] })),
  }));
  MockClass.getNodeDefinition = mockGetNodeDefinition;
  return { SkillNodeDefinitions: MockClass };
});

jest.mock('fs');

const mockValidateMCPCommand = jest.fn();
const mockSanitizeInput = jest.fn((x) => x);
jest.mock('../../src/skills/security/SkillSecurityValidator', () => ({
  SkillSecurityValidator: jest.fn().mockImplementation(() => ({
    validateScript: jest.fn(() => ({ safe: true, issues: [] })),
    sanitizeInput: mockSanitizeInput,
    validateSkill: jest.fn(() => ({ safe: true, issues: [] })),
    validateMCPCommand: mockValidateMCPCommand,
  }))
}));

const { SkillMCPGenerator } = require('../../src/skills/mcp/SkillMCPGenerator');

describe('SkillMCPGenerator', () => {
  let generator;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockReturnValue(undefined);
    fs.writeFileSync.mockReturnValue(undefined);
    fs.chmodSync.mockReturnValue(undefined);
    fs.readdirSync.mockReturnValue([]);
    fs.unlinkSync.mockReturnValue(undefined);
    mockValidateMCPCommand.mockReturnValue({ valid: true });
    mockSanitizeInput.mockImplementation((x) => x);
    generator = new SkillMCPGenerator();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      expect(generator.generatedServers).toBeInstanceOf(Map);
      expect(generator.generatedServers.size).toBe(0);
      expect(generator.allowedCommands).toBeInstanceOf(Set);
      expect(generator.allowedCommands.has('node')).toBe(true);
      expect(generator.allowedCommands.has('npm')).toBe(true);
    });

    it('should accept custom securityValidator', () => {
      const customValidator = { validateMCPCommand: jest.fn(), sanitizeInput: jest.fn() };
      const gen = new SkillMCPGenerator({ securityValidator: customValidator });
      expect(gen.securityValidator).toBe(customValidator);
    });

    it('should accept custom allowedCommands', () => {
      const customCommands = new Set(['custom-cmd']);
      const gen = new SkillMCPGenerator({ allowedCommands: customCommands });
      expect(gen.allowedCommands).toBe(customCommands);
      expect(gen.allowedCommands.has('custom-cmd')).toBe(true);
      expect(gen.allowedCommands.has('node')).toBe(false);
    });
  });

  describe('validateMCPCommand', () => {
    it('should reject commands not in allowedCommands', () => {
      const result = generator.validateMCPCommand('rm', ['-rf', '/']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('rm');
      expect(result.allowed).toContain('node');
      expect(mockValidateMCPCommand).not.toHaveBeenCalled();
    });

    it('should delegate to securityValidator for allowed commands', () => {
      mockValidateMCPCommand.mockReturnValue({ valid: true });
      const result = generator.validateMCPCommand('npm', ['install']);
      expect(result).toEqual({ valid: true });
      expect(mockValidateMCPCommand).toHaveBeenCalledWith('npm', ['install']);
    });

    it('should pass through validation failure from securityValidator', () => {
      mockValidateMCPCommand.mockReturnValue({ valid: false, error: 'Bad args' });
      const result = generator.validateMCPCommand('node', ['script.js']);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Bad args');
    });
  });

  describe('createSecureCommandConfig', () => {
    it('should throw for invalid command', () => {
      mockValidateMCPCommand.mockReturnValue({ valid: false, error: 'not allowed' });
      expect(() => generator.createSecureCommandConfig('node', ['script.js']))
        .toThrow('Invalid MCP command: not allowed');
    });

    it('should return config for valid command', () => {
      const result = generator.createSecureCommandConfig('node', ['script.js']);
      expect(result).toEqual({
        command: 'node',
        args: ['script.js'],
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });

    it('should sanitize command arguments', () => {
      mockSanitizeInput.mockImplementation((x) => `sanitized:${x}`);
      const result = generator.createSecureCommandConfig('node', ['arg1', 'arg2']);
      expect(result.args).toEqual(['sanitized:arg1', 'sanitized:arg2']);
      expect(mockSanitizeInput).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateMCPConfig', () => {
    const testSkill = { name: 'docx', skillPath: '/skills/docx', description: 'Docx skill' };

    beforeEach(() => {
      mockGetNodeDefinition.mockReturnValue({
        name: 'docx',
        inputs: [],
        outputs: [],
        actions: [{ name: 'create', label: 'Create', description: 'Create doc', inputs: {}, outputs: {} }],
      });
    });

    it('should generate MCP config for a skill', () => {
      const config = generator.generateMCPConfig(testSkill);
      expect(config.name).toBe('skill-docx');
      expect(config.command).toBe('node');
      expect(config.args.length).toBe(1);
      expect(config.args[0]).toContain('docx-mcp-server.js');
      expect(config.timeout).toBe(30000);
      expect(config.maxRetries).toBe(2);
      expect(config.retryDelay).toBe(1000);
      expect(config.heartbeatInterval).toBe(30000);
    });

    it('should set env vars from skill properties', () => {
      const config = generator.generateMCPConfig(testSkill);
      expect(config.env.SKILL_NAME).toBe('docx');
      expect(config.env.SKILL_PATH).toBe('/skills/docx');
      expect(config.env.SKILL_DESCRIPTION).toBe('Docx skill');
    });

    it('should store in generatedServers map', () => {
      generator.generateMCPConfig(testSkill);
      const servers = generator.getGeneratedServers();
      expect(servers.size).toBe(1);
      expect(servers.has('docx')).toBe(true);
      const entry = servers.get('docx');
      expect(entry.skill).toEqual(testSkill);
      expect(entry.config.name).toBe('skill-docx');
    });

    it('should call getNodeDefinition and createServerScript', () => {
      mockGetNodeDefinition.mockReturnValue({ name: 'docx', actions: [] });
      generator.generateMCPConfig(testSkill);
      expect(mockGetNodeDefinition).toHaveBeenCalledWith('docx');
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should handle skill without nodeDefinition', () => {
      mockGetNodeDefinition.mockReturnValue(null);
      const config = generator.generateMCPConfig({ name: 'unknown', skillPath: '/skills/unknown' });
      expect(config.name).toBe('skill-unknown');
    });

    it('should handle missing description', () => {
      const config = generator.generateMCPConfig({ name: 'test', skillPath: '/test' });
      expect(config.env.SKILL_DESCRIPTION).toBe('');
    });
  });

  describe('createServerScript', () => {
    const scriptDir = path.join(__dirname, '..', '..', 'src', 'skills', 'mcp', 'generated');

    it('should create directory if not exists', () => {
      fs.existsSync.mockReturnValue(false);
      generator.createServerScript({ name: 'test', skillPath: '/test' }, { name: 'test' });
      expect(fs.mkdirSync).toHaveBeenCalledWith(scriptDir, { recursive: true });
    });

    it('should not create directory if exists', () => {
      fs.existsSync.mockReturnValue(true);
      generator.createServerScript({ name: 'test', skillPath: '/test' }, { name: 'test' });
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should write script file', () => {
      const result = generator.createServerScript({ name: 'test', skillPath: '/test' }, { name: 'test' });
      const expectedPath = path.join(scriptDir, 'test-mcp-server.js');
      expect(result).toBe(expectedPath);
      expect(fs.writeFileSync).toHaveBeenCalledWith(expectedPath, expect.any(String), 'utf8');
    });

    it('should make script executable', () => {
      generator.createServerScript({ name: 'test', skillPath: '/test' }, { name: 'test' });
      const expectedPath = path.join(scriptDir, 'test-mcp-server.js');
      expect(fs.chmodSync).toHaveBeenCalledWith(expectedPath, '755');
    });

    it('should handle chmod failure gracefully', () => {
      fs.chmodSync.mockImplementation(() => { throw new Error('EACCES'); });
      expect(() => generator.createServerScript({ name: 'test', skillPath: '/test' }, { name: 'test' }))
        .not.toThrow();
    });

    it('should use actions from nodeDefinition if available', () => {
      const nodeDef = {
        actions: [
          { name: 'create', description: 'Create', inputs: { title: { type: 'string', required: true } } },
          { name: 'delete', description: 'Delete', inputs: { id: { type: 'number' } } },
        ],
      };
      generator.createServerScript({ name: 'test', skillPath: '/test' }, nodeDef);
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('"create"');
      expect(writtenContent).toContain('"delete"');
      expect(writtenContent).toContain('"title"');
      expect(writtenContent).toContain('"id"');
    });

    it('should create default action if nodeDefinition has no actions', () => {
      const nodeDef = { name: 'test', inputs: [], outputs: [] };
      generator.createServerScript({ name: 'test', skillPath: '/test', description: 'Test skill' }, nodeDef);
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('"execute"');
      expect(writtenContent).toContain('Test skill');
    });

    it('should create default action if nodeDefinition is null', () => {
      generator.createServerScript({ name: 'test', skillPath: '/test' }, null);
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('"execute"');
    });

    it('should include tool definitions in generated script', () => {
      generator.createServerScript({ name: 'test', skillPath: '/test' }, null);
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('class SkillMCPServer');
      expect(writtenContent).toContain('SKILL_NAME = \'test\'');
      expect(writtenContent).toContain('tools/list');
      expect(writtenContent).toContain('tools/call');
      expect(writtenContent).toContain('jsonrpc');
    });

    it('should include input schema in tool definitions', () => {
      const nodeDef = {
        actions: [{
          name: 'execute',
          inputs: {
            action: { type: 'string', required: true, description: 'Action' },
            param: { type: 'number', description: 'Param', default: 0 },
          },
        }],
      };
      generator.createServerScript({ name: 'test', skillPath: '/test' }, nodeDef);
      const writtenContent = fs.writeFileSync.mock.calls[0][1];
      expect(writtenContent).toContain('"action"');
      expect(writtenContent).toContain('"param"');
      expect(writtenContent).toContain('"default"');
      expect(writtenContent).toContain('"required"');
    });
  });

  describe('extractInputsFromSkill', () => {
    it('should return empty object for skill without inputs', () => {
      expect(generator.extractInputsFromSkill({})).toEqual({});
      expect(generator.extractInputsFromSkill({ inputs: null })).toEqual({});
      expect(generator.extractInputsFromSkill({ inputs: 'not-array' })).toEqual({});
    });

    it('should extract inputs from skill definition', () => {
      const skill = {
        inputs: [
          { name: 'title', type: 'string', description: 'Title', required: true },
          { name: 'count', type: 'number', description: 'Count', required: false },
        ],
      };
      const result = generator.extractInputsFromSkill(skill);
      expect(result.title).toEqual({ type: 'string', description: 'Title', required: true });
      expect(result.count).toEqual({ type: 'number', description: 'Count', required: false });
    });

    it('should handle inputs with enum values', () => {
      const skill = {
        inputs: [
          { name: 'format', type: 'string', enum: ['pdf', 'docx'], required: true },
        ],
      };
      const result = generator.extractInputsFromSkill(skill);
      expect(result.format.enum).toEqual(['pdf', 'docx']);
    });

    it('should handle inputs with default values', () => {
      const skill = {
        inputs: [
          { name: 'count', type: 'number', default: 42 },
        ],
      };
      const result = generator.extractInputsFromSkill(skill);
      expect(result.count.default).toBe(42);
    });

    it('should use input name as description when description is missing', () => {
      const skill = {
        inputs: [
          { name: 'myParam' },
        ],
      };
      const result = generator.extractInputsFromSkill(skill);
      expect(result.myParam.description).toBe('myParam');
    });
  });

  describe('mapTypeToJSONSchema', () => {
    it('should return string for null or undefined', () => {
      expect(generator.mapTypeToJSONSchema(null)).toBe('string');
      expect(generator.mapTypeToJSONSchema(undefined)).toBe('string');
    });

    it('should map basic types correctly', () => {
      expect(generator.mapTypeToJSONSchema('string')).toBe('string');
      expect(generator.mapTypeToJSONSchema('number')).toBe('number');
      expect(generator.mapTypeToJSONSchema('boolean')).toBe('boolean');
      expect(generator.mapTypeToJSONSchema('object')).toBe('object');
      expect(generator.mapTypeToJSONSchema('array')).toBe('array');
    });

    it('should map file and image types to string', () => {
      expect(generator.mapTypeToJSONSchema('file')).toBe('string');
      expect(generator.mapTypeToJSONSchema('image')).toBe('string');
    });

    it('should map compound types to their first component', () => {
      expect(generator.mapTypeToJSONSchema('string|array')).toBe('string');
      expect(generator.mapTypeToJSONSchema('object|string')).toBe('object');
      expect(generator.mapTypeToJSONSchema('number|object')).toBe('number');
      expect(generator.mapTypeToJSONSchema('boolean|string')).toBe('boolean');
    });

    it('should return string for unknown types', () => {
      expect(generator.mapTypeToJSONSchema('unknown')).toBe('string');
      expect(generator.mapTypeToJSONSchema('')).toBe('string');
    });
  });

  describe('getGeneratedServers', () => {
    it('should return the generated servers map', () => {
      const servers = generator.getGeneratedServers();
      expect(servers).toBe(generator.generatedServers);
      expect(servers).toBeInstanceOf(Map);
    });
  });

  describe('getServerConfig', () => {
    it('should return config for existing skill', () => {
      mockGetNodeDefinition.mockReturnValue({ name: 'docx', actions: [] });
      generator.generateMCPConfig({ name: 'docx', skillPath: '/skills/docx' });
      const config = generator.getServerConfig('docx');
      expect(config).not.toBeNull();
      expect(config.name).toBe('skill-docx');
    });

    it('should return null for unknown skill', () => {
      expect(generator.getServerConfig('nonexistent')).toBeNull();
    });
  });

  describe('cleanup', () => {
    const scriptDir = path.join(__dirname, '..', '..', 'src', 'skills', 'mcp', 'generated');

    it('should remove generated server files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readdirSync.mockReturnValue([
        'test-mcp-server.js',
        'other-mcp-server.js',
        'keep-this.txt',
      ]);
      generator.cleanup();
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(scriptDir, 'test-mcp-server.js'));
      expect(fs.unlinkSync).toHaveBeenCalledWith(path.join(scriptDir, 'other-mcp-server.js'));
      expect(fs.unlinkSync).not.toHaveBeenCalledWith(path.join(scriptDir, 'keep-this.txt'));
    });

    it('should clear the generated servers map', () => {
      mockGetNodeDefinition.mockReturnValue({ name: 'docx', actions: [] });
      generator.generateMCPConfig({ name: 'docx', skillPath: '/skills/docx' });
      expect(generator.getGeneratedServers().size).toBe(1);
      generator.cleanup();
      expect(generator.getGeneratedServers().size).toBe(0);
    });

    it('should handle missing directory', () => {
      fs.existsSync.mockReturnValue(false);
      expect(() => generator.cleanup()).not.toThrow();
      expect(fs.readdirSync).not.toHaveBeenCalled();
    });
  });
});
