'use strict';

jest.mock('fs');

const fs = require('fs');
const { CommandService } = require('../../src/agent/CommandService');

describe('CommandService', () => {
  let service;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new CommandService();
  });

  describe('constructor', () => {
    it('should create instance with default state', () => {
      expect(service.commands instanceof Map).toBe(true);
      expect(service.commands.size).toBe(0);
      expect(service.aliases instanceof Map).toBe(true);
      expect(service.aliases.size).toBe(0);
      expect(typeof service.availabilityCheck).toBe('function');
      expect(service.availabilityCheck()).toBe(true);
      expect(service.loadedSources instanceof Set).toBe(true);
      expect(service.loadedSources.size).toBe(0);
      expect(service).toBeInstanceOf(require('events').EventEmitter);
    });

    it('should accept custom availabilityCheck', () => {
      const mockCheck = { isClaudeAI: () => true, isConsole: () => false };
      const s = new CommandService({ availabilityCheck: mockCheck });
      expect(s.availabilityCheck).toBe(mockCheck);
    });
  });

  describe('register', () => {
    it('should throw if command has no name', () => {
      expect(() => service.register({ type: 'local' }))
        .toThrow('Command must have a name');
    });

    it('should throw for invalid command type', () => {
      expect(() => service.register({ name: 'test', type: 'invalid' }))
        .toThrow('Invalid command type: invalid');
    });

    it('should throw if prompt command lacks getPromptForCommand', () => {
      expect(() => service.register({ name: 'test', type: 'prompt' }))
        .toThrow('Prompt command must have getPromptForCommand');
    });

    it('should throw if local command lacks handler', () => {
      expect(() => service.register({ name: 'test', type: 'local' }))
        .toThrow('Local command must have handler');
    });

    it('should throw if localjsx command lacks component', () => {
      expect(() => service.register({ name: 'test', type: 'localjsx' }))
        .toThrow('LocalJSX command must have component');
    });

    it('should register a valid prompt command', () => {
      const cmd = service.register({
        name: 'greet',
        type: 'prompt',
        description: 'A greeting',
        getPromptForCommand: async () => 'Hello!'
      });

      expect(cmd.name).toBe('greet');
      expect(cmd.type).toBe('prompt');
      expect(cmd.description).toBe('A greeting');
      expect(cmd.aliases).toEqual([]);
      expect(cmd.isHidden).toBe(false);
      expect(cmd.source).toBe('builtin');
      expect(service.commands.size).toBe(1);
    });

    it('should register a valid local command', () => {
      const handler = async () => 'done';
      const cmd = service.register({
        name: 'run',
        type: 'local',
        handler
      });

      expect(cmd.name).toBe('run');
      expect(cmd.type).toBe('local');
      expect(cmd.handler).toBe(handler);
    });

    it('should register a valid localjsx command', () => {
      const component = '<div>Hello</div>';
      const cmd = service.register({
        name: 'panel',
        type: 'localjsx',
        component
      });

      expect(cmd.name).toBe('panel');
      expect(cmd.type).toBe('localjsx');
      expect(cmd.component).toBe(component);
    });

    it('should register aliases', () => {
      service.register({
        name: 'help',
        type: 'local',
        aliases: ['h', '?'],
        handler: async () => {}
      });

      expect(service.aliases.get('h')).toBe('help');
      expect(service.aliases.get('?')).toBe('help');
    });

    it('should emit commandRegistered event', () => {
      const listener = jest.fn();
      service.on('commandRegistered', listener);

      service.register({
        name: 'test',
        type: 'local',
        handler: async () => {}
      });

      expect(listener).toHaveBeenCalledWith({ name: 'test', type: 'local' });
    });

    it('should apply defaults for optional fields', () => {
      const cmd = service.register({
        name: 'minimal',
        type: 'local',
        handler: async () => {}
      });

      expect(cmd.description).toBe('');
      expect(cmd.aliases).toEqual([]);
      expect(cmd.availability).toBeNull();
      expect(typeof cmd.isEnabled).toBe('function');
      expect(cmd.isEnabled()).toBe(true);
      expect(cmd.isHidden).toBe(false);
      expect(cmd.source).toBe('builtin');
      expect(cmd.loadedFrom).toBe('builtin');
    });

    it('should override defaults with provided values', () => {
      const cmd = service.register({
        name: 'custom',
        type: 'local',
        handler: async () => {},
        isHidden: true,
        source: 'plugin',
        loadedFrom: 'custom',
        isEnabled: () => false
      });

      expect(cmd.isHidden).toBe(true);
      expect(cmd.source).toBe('plugin');
      expect(cmd.loadedFrom).toBe('custom');
      expect(cmd.isEnabled()).toBe(false);
    });
  });

  describe('registerMany', () => {
    it('should register multiple commands', () => {
      const commands = [
        { name: 'a', type: 'local', handler: async () => {} },
        { name: 'b', type: 'local', handler: async () => {} },
        { name: 'c', type: 'local', handler: async () => {} }
      ];

      const results = service.registerMany(commands);

      expect(results).toHaveLength(3);
      expect(service.commands.size).toBe(3);
    });

    it('should throw if any command is invalid (valid command still registered)', () => {
      const commands = [
        { name: 'valid', type: 'local', handler: async () => {} },
        { name: 'bad', type: 'local' }
      ];

      expect(() => service.registerMany(commands)).toThrow('Local command must have handler');
      // The valid command gets registered before the error on the second
      expect(service.commands.size).toBe(1);
      expect(service.commands.has('valid')).toBe(true);
    });
  });

  describe('unregister', () => {
    it('should remove a registered command', () => {
      service.register({ name: 'test', type: 'local', handler: async () => {} });
      expect(service.commands.size).toBe(1);

      const result = service.unregister('test');
      expect(result).toBe(true);
      expect(service.commands.size).toBe(0);
    });

    it('should remove aliases when unregistering', () => {
      service.register({
        name: 'help',
        type: 'local',
        aliases: ['h'],
        handler: async () => {}
      });
      expect(service.aliases.has('h')).toBe(true);

      service.unregister('help');
      expect(service.aliases.has('h')).toBe(false);
    });

    it('should return false for non-existent command', () => {
      expect(service.unregister('nonexistent')).toBe(false);
    });

    it('should emit commandUnregistered event', () => {
      const listener = jest.fn();
      service.on('commandUnregistered', listener);

      service.register({ name: 'test', type: 'local', handler: async () => {} });
      service.unregister('test');

      expect(listener).toHaveBeenCalledWith({ name: 'test' });
    });
  });

  describe('get', () => {
    it('should retrieve command by name', () => {
      service.register({ name: 'test', type: 'local', handler: async () => {} });
      const cmd = service.get('test');
      expect(cmd).toBeDefined();
      expect(cmd.name).toBe('test');
    });

    it('should retrieve command by alias', () => {
      service.register({
        name: 'help',
        type: 'local',
        aliases: ['h'],
        handler: async () => {}
      });

      expect(service.get('h').name).toBe('help');
    });

    it('should return undefined for non-existent command', () => {
      expect(service.get('nothing')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered command name', () => {
      service.register({ name: 'test', type: 'local', handler: async () => {} });
      expect(service.has('test')).toBe(true);
    });

    it('should return true for alias', () => {
      service.register({
        name: 'help',
        type: 'local',
        aliases: ['h'],
        handler: async () => {}
      });
      expect(service.has('h')).toBe(true);
    });

    it('should return false for unknown command', () => {
      expect(service.has('nothing')).toBe(false);
    });
  });

  describe('getAll', () => {
    it('should return all enabled, non-hidden commands', () => {
      service.register({ name: 'a', type: 'local', handler: async () => {} });
      service.register({ name: 'b', type: 'local', handler: async () => {} });

      const all = service.getAll();
      expect(all).toHaveLength(2);
    });

    it('should exclude hidden commands by default', () => {
      service.register({ name: 'visible', type: 'local', handler: async () => {} });
      service.register({ name: 'hidden', type: 'local', isHidden: true, handler: async () => {} });

      expect(service.getAll()).toHaveLength(1);
      expect(service.getAll({ includeHidden: true })).toHaveLength(2);
    });

    it('should exclude disabled commands', () => {
      service.register({ name: 'enabled', type: 'local', handler: async () => {} });
      service.register({
        name: 'disabled',
        type: 'local',
        isEnabled: () => false,
        handler: async () => {}
      });

      expect(service.getAll()).toHaveLength(1);
    });

    it('should exclude commands failing availability check', () => {
      const check = { isClaudeAI: () => false, isConsole: () => false };
      const s = new CommandService({ availabilityCheck: check });
      s.register({
        name: 'claudeOnly',
        type: 'local',
        availability: ['claude-ai'],
        handler: async () => {}
      });
      s.register({ name: 'generic', type: 'local', handler: async () => {} });

      const all = s.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('generic');
    });
  });

  describe('getByType', () => {
    it('should filter commands by type', () => {
      service.register({ name: 'prompt1', type: 'prompt', getPromptForCommand: async () => '' });
      service.register({ name: 'local1', type: 'local', handler: async () => {} });
      service.register({ name: 'local2', type: 'local', handler: async () => {} });

      const locals = service.getByType('local');
      expect(locals).toHaveLength(2);
    });

    it('should return empty array if no match', () => {
      const result = service.getByType('localjsx');
      expect(result).toEqual([]);
    });
  });

  describe('execute', () => {
    it('should execute a local command and return result', async () => {
      const handler = jest.fn().mockResolvedValue('result-data');
      service.register({ name: 'run', type: 'local', handler });

      const result = await service.execute('run', { arg1: 'val' }, { ctx: 1 });

      expect(handler).toHaveBeenCalledWith({ arg1: 'val' }, { ctx: 1 });
      expect(result).toBe('result-data');
    });

    it('should execute a prompt command and return result', async () => {
      const getPromptForCommand = jest.fn().mockResolvedValue('/help output');
      service.register({ name: 'help', type: 'prompt', getPromptForCommand });

      const result = await service.execute('help', { topic: 'all' }, {});

      expect(getPromptForCommand).toHaveBeenCalledWith({ topic: 'all' }, {});
      expect(result).toBe('/help output');
    });

    it('should execute a localjsx command and return component', async () => {
      service.register({ name: 'panel', type: 'localjsx', component: '<Panel />' });

      const result = await service.execute('panel');

      expect(result).toBe('<Panel />');
    });

    it('should throw for unknown command type', async () => {
      service.commands.set('bad', {
        name: 'bad',
        type: 'unknown',
        isEnabled: () => true,
        availability: null
      });

      await expect(service.execute('bad')).rejects.toThrow('Unknown command type: unknown');
    });

    it('should throw if command not found', async () => {
      await expect(service.execute('nothing')).rejects.toThrow('Command not found: nothing');
    });

    it('should throw if command is disabled', async () => {
      service.register({
        name: 'disabled',
        type: 'local',
        isEnabled: () => false,
        handler: async () => 'nope'
      });

      await expect(service.execute('disabled')).rejects.toThrow('Command disabled: disabled');
    });

    it('should throw if command is not available', async () => {
      const check = { isClaudeAI: () => false, isConsole: () => false };
      const s = new CommandService({ availabilityCheck: check });
      s.register({
        name: 'claudeOnly',
        type: 'local',
        availability: ['claude-ai'],
        handler: async () => 'secret'
      });

      await expect(s.execute('claudeOnly')).rejects.toThrow('Command not available: claudeOnly');
    });

    it('should emit commandExecuting and commandExecuted events', async () => {
      const executing = jest.fn();
      const executed = jest.fn();
      service.on('commandExecuting', executing);
      service.on('commandExecuted', executed);

      service.register({ name: 'run', type: 'local', handler: async () => 'ok' });
      await service.execute('run', { x: 1 });

      expect(executing).toHaveBeenCalledWith({ name: 'run', args: { x: 1 } });
      expect(executed).toHaveBeenCalledWith({ name: 'run', result: 'ok' });
    });

    it('should emit commandError and rethrow on handler failure', async () => {
      const errorListener = jest.fn();
      service.on('commandError', errorListener);

      service.register({
        name: 'fail',
        type: 'local',
        handler: async () => { throw new Error('bang'); }
      });

      await expect(service.execute('fail')).rejects.toThrow('bang');
      expect(errorListener).toHaveBeenCalledWith({ name: 'fail', error: 'bang' });
    });

    it('should resolve command by alias', async () => {
      const handler = jest.fn().mockResolvedValue('OK');
      service.register({
        name: 'status',
        type: 'local',
        aliases: ['st'],
        handler
      });

      const result = await service.execute('st');
      expect(result).toBe('OK');
    });
  });

  describe('_checkAvailability', () => {
    it('should return true if command has no availability', () => {
      expect(service._checkAvailability({ availability: null })).toBe(true);
    });

    it('should return true if availability array is empty', () => {
      expect(service._checkAvailability({ availability: [] })).toBe(true);
    });

    it('should return true if one availability check passes', () => {
      const check = { isClaudeAI: () => true, isConsole: () => false };
      const s = new CommandService({ availabilityCheck: check });
      expect(s._checkAvailability({ availability: ['claude-ai'] })).toBe(true);
    });

    it('should return false if no availability check passes', () => {
      const check = { isClaudeAI: () => false, isConsole: () => false };
      const s = new CommandService({ availabilityCheck: check });
      expect(s._checkAvailability({ availability: ['claude-ai', 'console'] })).toBe(false);
    });

    it('should return false for unknown availability type', () => {
      expect(service._checkAvailability({ availability: ['unknown-type'] })).toBe(false);
    });

    it('should return true if any availability passes (OR logic)', () => {
      const check = { isClaudeAI: () => false, isConsole: () => true };
      const s = new CommandService({ availabilityCheck: check });
      expect(s._checkAvailability({ availability: ['claude-ai', 'console'] })).toBe(true);
    });
  });

  describe('_loadBuiltinCommands', () => {
    it('should register help, status, compact commands', async () => {
      await service._loadBuiltinCommands();

      expect(service.commands.has('help')).toBe(true);
      expect(service.commands.has('status')).toBe(true);
      expect(service.commands.has('compact')).toBe(true);
      expect(service.loadedSources.has('builtin')).toBe(true);
    });

    it('should not load builtin commands twice', async () => {
      await service._loadBuiltinCommands();
      await service._loadBuiltinCommands();

      expect(service.commands.size).toBe(3);
    });

    it('should load help with aliases h and ?', async () => {
      await service._loadBuiltinCommands();

      expect(service.aliases.get('h')).toBe('help');
      expect(service.aliases.get('?')).toBe('help');
    });

    it('should load status with alias st', async () => {
      await service._loadBuiltinCommands();

      const result = await service.execute('st');
      expect(result).toHaveProperty('status', 'running');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('memory');
    });

    it('help getPromptForCommand should list all commands', async () => {
      await service._loadBuiltinCommands();

      const helpCmd = service.get('help');
      const output = await helpCmd.getPromptForCommand({}, {});
      expect(output).toContain('/help:');
      expect(output).toContain('/status:');
      expect(output).toContain('/compact:');
    });

    it('compact should emit compactRequested event', async () => {
      await service._loadBuiltinCommands();
      const listener = jest.fn();
      service.on('compactRequested', listener);

      const result = await service.execute('compact', { mode: 'full' });
      expect(result).toEqual({ success: true, message: 'Compact triggered' });
      expect(listener).toHaveBeenCalledWith({ mode: 'full' });
    });
  });

  describe('_loadSkillCommands', () => {
    it('should not load if skillDir is falsy', async () => {
      await service._loadSkillCommands();
      expect(service.loadedSources.size).toBe(0);
    });

    it('should not load if skillDir already loaded', async () => {
      service.loadedSources.add('skill:/fake');
      await service._loadSkillCommands('/fake');
      expect(fs.readdirSync).not.toHaveBeenCalled();
      expect(service.loadedSources.has('skill:/fake')).toBe(true);
    });

    it('should read skill directory and attempt to load files', async () => {
      fs.readdirSync.mockReturnValue(['cmdA.js', 'cmdB.js']);

      await service._loadSkillCommands('/skills');

      expect(fs.readdirSync).toHaveBeenCalledWith('/skills');
      expect(service.loadedSources.has('skill:/skills')).toBe(true);
    });

    it('should handle readdirSync error gracefully', async () => {
      fs.readdirSync.mockImplementation(() => { throw new Error('ENOENT'); });

      await service._loadSkillCommands('/invalid');

      expect(service.loadedSources.has('skill:/invalid')).toBe(false);
    });

    it('should handle individual command load error gracefully', async () => {
      fs.readdirSync.mockReturnValue(['bad.js']);

      await service._loadSkillCommands('/skills');

      expect(service.loadedSources.has('skill:/skills')).toBe(true);
    });
  });

  describe('_loadPluginCommands', () => {
    it('should mark plugin as loaded', async () => {
      await service._loadPluginCommands();
      expect(service.loadedSources.has('plugin')).toBe(true);
    });

    it('should not load plugin twice', async () => {
      await service._loadPluginCommands();
      await service._loadPluginCommands();
      expect(service.loadedSources.size).toBe(1);
    });
  });

  describe('_loadMCPCommands', () => {
    it('should register MCP tools as local commands', async () => {
      const tools = [
        { name: 'fetch_url', description: 'Fetch a URL' },
        { name: 'search_web', description: 'Search the web' }
      ];

      await service._loadMCPCommands(tools);

      expect(service.commands.has('fetch_url')).toBe(true);
      expect(service.commands.has('search_web')).toBe(true);

      const fetchCmd = service.get('fetch_url');
      expect(fetchCmd.type).toBe('local');
      expect(fetchCmd.isMcp).toBe(true);
      expect(fetchCmd.loadedFrom).toBe('mcp');
    });

    it('should not load if mcpTools is falsy', async () => {
      await service._loadMCPCommands();
      expect(service.commands.size).toBe(0);
    });

    it('should call mcpClient.callTool when executed with context', async () => {
      const _mcpClient = { callTool: jest.fn().mockResolvedValue('data') };
      await service._loadMCPCommands([{ name: 'fetch' }]);

      const result = await service.execute('fetch', { url: 'x' }, { mcpClient: _mcpClient });

      expect(_mcpClient.callTool).toHaveBeenCalledWith('fetch', { url: 'x' });
      expect(result).toBe('data');
    });

    it('should throw if MCP client not available in context', async () => {
      await service._loadMCPCommands([{ name: 'fetch' }]);

      await expect(service.execute('fetch')).rejects.toThrow('MCP client not available');
    });
  });

  describe('loadAll', () => {
    it('should load builtin commands', async () => {
      await service.loadAll();
      expect(service.commands.has('help')).toBe(true);
      expect(service.commands.has('status')).toBe(true);
      expect(service.commands.has('compact')).toBe(true);
    });

    it('should load skill commands if skillDir provided', async () => {
      fs.readdirSync.mockReturnValue(['cmd.js']);

      await service.loadAll({ skillDir: '/skills' });
      expect(fs.readdirSync).toHaveBeenCalledWith('/skills');
    });

    it('should load MCP commands if mcpTools provided', async () => {
      await service.loadAll({ mcpTools: [{ name: 'mcp_tool' }] });
      expect(service.commands.has('mcp_tool')).toBe(true);
    });

    it('should emit allLoaded event', async () => {
      const listener = jest.fn();
      service.on('allLoaded', listener);

      await service.loadAll();

      expect(listener).toHaveBeenCalledWith({ commandCount: 3 });
    });
  });

  describe('getStats', () => {
    it('should return zero stats for empty service', () => {
      const stats = service.getStats();
      expect(stats.total).toBe(0);
      expect(stats.enabled).toBe(0);
      expect(stats.byType.prompt).toBe(0);
      expect(stats.byType.local).toBe(0);
      expect(stats.byType.localjsx).toBe(0);
      expect(stats.bySource).toEqual({});
      expect(stats.mcpCommands).toBe(0);
    });

    it('should return correct stats after loading builtin', async () => {
      await service._loadBuiltinCommands();

      const stats = service.getStats();
      expect(stats.total).toBe(3);
      expect(stats.enabled).toBe(3);
      expect(stats.byType.prompt).toBe(1);  // help
      expect(stats.byType.local).toBe(2);   // status, compact
      expect(stats.byType.localjsx).toBe(0);
      expect(stats.mcpCommands).toBe(0);
    });

    it('should count MCP commands separately', async () => {
      await service._loadBuiltinCommands();
      await service._loadMCPCommands([{ name: 'mcp1' }, { name: 'mcp2' }]);

      const stats = service.getStats();
      expect(stats.total).toBe(5);
      expect(stats.mcpCommands).toBe(2);
    });

    it('should not count hidden commands in enabled count', () => {
      service.register({ name: 'visible', type: 'local', handler: async () => {} });
      service.register({ name: 'secret', type: 'local', isHidden: true, handler: async () => {} });

      const stats = service.getStats();
      expect(stats.total).toBe(2);
      expect(stats.enabled).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle register with empty aliases array', () => {
      service.register({
        name: 'test',
        type: 'local',
        aliases: [],
        handler: async () => {}
      });
      expect(service.aliases.size).toBe(0);
    });

    it('should handle execute with no args or context', async () => {
      const handler = jest.fn().mockResolvedValue('ok');
      service.register({ name: 'noop', type: 'local', handler });

      const result = await service.execute('noop');

      expect(handler).toHaveBeenCalledWith({}, {});
      expect(result).toBe('ok');
    });

    it('should handle unregister of already unregistered command', () => {
      service.register({ name: 'temp', type: 'local', handler: async () => {} });
      service.unregister('temp');
      expect(service.unregister('temp')).toBe(false);
    });

    it('should handle getAll with no registered commands', () => {
      expect(service.getAll()).toEqual([]);
      expect(service.getByType('local')).toEqual([]);
    });

    it('should preserve command spread properties', () => {
      const cmd = service.register({
        name: 'extended',
        type: 'local',
        handler: async () => {},
        extraProp: 'extra-value'
      });

      expect(cmd.extraProp).toBe('extra-value');
    });
  });
});
