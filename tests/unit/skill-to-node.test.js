jest.mock('../../src/performance/PythonEnvManager', () => {
  const mockRunPythonScript = jest.fn();
  const mockEnsureEnvironment = jest.fn();
  const mockGetMetrics = jest.fn().mockReturnValue({ totalExecutions: 0 });
  const mockGetCacheStats = jest.fn().mockReturnValue({ hits: 0, misses: 0 });
  const mockClearCache = jest.fn();

  const MockPythonEnvManager = jest.fn().mockImplementation(() => ({
    runPythonScript: mockRunPythonScript,
    ensureEnvironment: mockEnsureEnvironment,
    getMetrics: mockGetMetrics,
    getCacheStats: mockGetCacheStats,
    clearCache: mockClearCache
  }));

  return { PythonEnvManager: MockPythonEnvManager };
});

jest.mock('../../src/utils/SafeExec', () => ({
  safeExecFile: jest.fn()
}));

jest.mock('fs');

const mockDocxTopExecute = jest.fn().mockResolvedValue({ success: true, file: 'doc.docx' });
const mockPdfTopExecute = jest.fn().mockResolvedValue({ success: true, file: 'doc.pdf' });
const mockCanvasTopExecute = jest.fn().mockResolvedValue({ success: true, image: 'img.png' });

jest.mock('../../src/skills/executors/DocxExecutor', () => {
  const DocxExecutorMock = jest.fn();
  DocxExecutorMock.execute = jest.fn().mockResolvedValue({ success: true });
  return { DocxExecutor: DocxExecutorMock, execute: mockDocxTopExecute };
});

jest.mock('../../src/skills/executors/PdfExecutor', () => {
  const PdfExecutorMock = jest.fn();
  PdfExecutorMock.execute = jest.fn().mockResolvedValue({ success: true });
  return { PdfExecutor: PdfExecutorMock, execute: mockPdfTopExecute };
});

jest.mock('../../src/skills/executors/CanvasExecutor', () => {
  const CanvasExecutorMock = jest.fn();
  CanvasExecutorMock.execute = jest.fn().mockResolvedValue({ success: true });
  return { CanvasExecutor: CanvasExecutorMock, execute: mockCanvasTopExecute };
});

jest.mock('../../src/skills/SkillNodeDefinitions');

const path = require('path');
const { SkillToNode } = require('../../src/skills/SkillToNode');
const { SkillNodeDefinitions } = require('../../src/skills/SkillNodeDefinitions');
const fs = require('fs');
const { safeExecFile } = require('../../src/utils/SafeExec');

describe('SkillToNode', () => {
  let converter;
  let mockWorkflowEngine;
  let mockMcpBridge;
  let mockSkillLoader;
  let pyEnvMock;

  beforeEach(() => {
    mockWorkflowEngine = { registerNodeType: jest.fn() };
    mockMcpBridge = {};
    mockSkillLoader = { getSkill: jest.fn() };

    jest.clearAllMocks();

    safeExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      if (typeof cb === 'function') {
        cb(null, { stdout: JSON.stringify({}), stderr: '' });
      }
    });

    fs.existsSync.mockReturnValue(false);

    pyEnvMock = SkillToNode._pyEnv;
    pyEnvMock.runPythonScript.mockRejectedValue(new Error('no py'));
    pyEnvMock.ensureEnvironment.mockResolvedValue();

    converter = new SkillToNode(mockWorkflowEngine, mockMcpBridge, mockSkillLoader);
  });

  describe('constructor', () => {
    it('should initialize properties', () => {
      expect(converter.workflowEngine).toBe(mockWorkflowEngine);
      expect(converter.mcpBridge).toBe(mockMcpBridge);
      expect(converter.skillLoader).toBe(mockSkillLoader);
      expect(converter.convertedNodes).toBeInstanceOf(Map);
      expect(converter.convertedNodes.size).toBe(0);
      expect(converter._resultCache).toBeInstanceOf(Map);
    });
  });

  describe('mapSkillTypeToNodeType', () => {
    const cases = [
      ['string', 'string'], ['number', 'number'], ['boolean', 'boolean'],
      ['object', 'object'], ['array', 'array'], ['file', 'string'],
      ['any', 'any'], ['unknown', 'string'], ['', 'string']
    ];

    it.each(cases)('should map %s to %s', (input, expected) => {
      expect(converter.mapSkillTypeToNodeType(input)).toBe(expected);
    });
  });

  describe('mapEnhancedTypeToNodeType', () => {
    const cases = [
      ['string', 'string'], ['number', 'number'], ['boolean', 'boolean'],
      ['object', 'object'], ['array', 'array'], ['file', 'file'],
      ['image', 'image'], ['any', 'any'],
      ['string|array', 'string'], ['object|string', 'object'],
      ['number|object', 'number'], ['number|array', 'number'],
      ['boolean|string', 'boolean'], ['object|array', 'object'],
      ['custom_unknown', 'any']
    ];

    it.each(cases)('should map %s to %s', (input, expected) => {
      expect(converter.mapEnhancedTypeToNodeType(input)).toBe(expected);
    });

    it('should return any for null/undefined', () => {
      expect(converter.mapEnhancedTypeToNodeType(null)).toBe('any');
      expect(converter.mapEnhancedTypeToNodeType(undefined)).toBe('any');
    });
  });

  describe('mapSkillInputsToNodeInputs', () => {
    it('should map empty array to empty object', () => {
      expect(converter.mapSkillInputsToNodeInputs([])).toEqual({});
    });

    it('should map skill inputs correctly', () => {
      const inputs = [
        { name: 'title', type: 'string', required: true },
        { name: 'count', type: 'number' },
        { name: 'files', type: 'file' }
      ];

      expect(converter.mapSkillInputsToNodeInputs(inputs)).toEqual({
        title: { type: 'string', required: true },
        count: { type: 'number', required: false },
        files: { type: 'string', required: false }
      });
    });

    it('should default type to string when not specified', () => {
      expect(converter.mapSkillInputsToNodeInputs([{ name: 'name' }])).toEqual({
        name: { type: 'string', required: false }
      });
    });
  });

  describe('mapSkillOutputsToNodeOutputs', () => {
    it('should map empty array to empty array', () => {
      expect(converter.mapSkillOutputsToNodeOutputs([])).toEqual([]);
    });

    it('should map skill outputs correctly', () => {
      expect(converter.mapSkillOutputsToNodeOutputs([
        { name: 'file', type: 'file' },
        { name: 'path', type: 'string' },
        { name: 'result', type: 'object' }
      ])).toEqual([
        { name: 'file', type: 'string' },
        { name: 'path', type: 'string' },
        { name: 'result', type: 'object' }
      ]);
    });

    it('should default type to object when not specified', () => {
      expect(converter.mapSkillOutputsToNodeOutputs([{ name: 'data' }])).toEqual([
        { name: 'data', type: 'object' }
      ]);
    });
  });

  describe('mapEnhancedInputsToNodeInputs', () => {
    it('should return empty object for null/undefined', () => {
      expect(converter.mapEnhancedInputsToNodeInputs(null)).toEqual({});
      expect(converter.mapEnhancedInputsToNodeInputs(undefined)).toEqual({});
    });

    it('should map enhanced inputs with description/default/enum', () => {
      const defs = {
        title: { type: 'string', required: true, description: 'Document title', default: 'Untitled' },
        count: { type: 'number', required: false, description: 'Item count' },
        color: { type: 'string', required: false, description: 'Color', enum: ['red', 'blue'] }
      };

      expect(converter.mapEnhancedInputsToNodeInputs(defs)).toEqual({
        title: { type: 'string', required: true, description: 'Document title', default: 'Untitled', enum: undefined },
        count: { type: 'number', required: false, description: 'Item count', default: undefined, enum: undefined },
        color: { type: 'string', required: false, description: 'Color', default: undefined, enum: ['red', 'blue'] }
      });
    });
  });

  describe('mapEnhancedOutputsToNodeOutputs', () => {
    it('should return empty array for null/undefined', () => {
      expect(converter.mapEnhancedOutputsToNodeOutputs(null)).toEqual([]);
      expect(converter.mapEnhancedOutputsToNodeOutputs(undefined)).toEqual([]);
    });

    it('should map enhanced outputs with description', () => {
      expect(converter.mapEnhancedOutputsToNodeOutputs({
        file: { type: 'file', description: 'Generated file' },
        size: { type: 'number', description: 'File size' }
      })).toEqual([
        { name: 'file', type: 'file', description: 'Generated file' },
        { name: 'size', type: 'number', description: 'File size' }
      ]);
    });
  });

  describe('createGenericNode', () => {
    const skill = {
      name: 'test-skill',
      description: 'A test skill',
      inputs: [{ name: 'input1', type: 'string' }],
      outputs: [{ name: 'result', type: 'object' }],
      scripts: []
    };

    it('should create and register a generic node', async () => {
      const result = await converter.createGenericNode(skill);

      expect(result).toBe('skill.test-skill.generic');
      expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledTimes(1);
      expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledWith(
        'skill.test-skill.generic',
        expect.objectContaining({
          name: 'Skill: test-skill',
          category: 'Skill: test-skill',
          inputs: { input1: { type: 'string', required: false } },
          outputs: [{ name: 'result', type: 'object' }]
        })
      );
    });

    it('should return cached node if already converted', async () => {
      await converter.createGenericNode(skill);
      mockWorkflowEngine.registerNodeType.mockClear();

      expect(await converter.createGenericNode(skill)).toBe('skill.test-skill.generic');
      expect(mockWorkflowEngine.registerNodeType).not.toHaveBeenCalled();
    });

    it('execute function should return skill description and inputs', async () => {
      await converter.createGenericNode(skill);
      const nodeType = mockWorkflowEngine.registerNodeType.mock.calls[0][1];

      const execResult = await nodeType.execute({}, { input1: 'value1' });

      expect(execResult).toEqual({
        message: 'Executed skill test-skill',
        inputs: { input1: 'value1' },
        skillDescription: 'A test skill'
      });
    });

    it('should default outputs when skill has no outputs', async () => {
      await converter.createGenericNode({ ...skill, outputs: undefined });

      expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledWith(
        'skill.test-skill.generic',
        expect.objectContaining({
          outputs: [{ name: 'result', type: 'object' }]
        })
      );
    });
  });

  describe('createNodeFromScript', () => {
    const baseSkill = {
      name: 'test-skill',
      description: 'A test skill',
      inputs: [{ name: 'input1', type: 'string' }],
      outputs: [{ name: 'result', type: 'object' }],
      scripts: [{ language: 'node', entry: 'index.js' }]
    };

    describe('with enhanced node definition', () => {
      const nodeDefinition = {
        category: 'Test Category',
        description: 'Enhanced description',
        actions: [
          { name: 'action1', label: 'Action One', description: 'First action', inputs: {}, outputs: {} },
          { name: 'action2', label: 'Action Two', description: 'Second action', inputs: { data: { type: 'string', required: true } }, outputs: { result: { type: 'object' } } }
        ]
      };

      beforeEach(() => {
        SkillNodeDefinitions.getNodeDefinition.mockReturnValue(nodeDefinition);
      });

      it('should create nodes for each action', async () => {
        const result = await converter.createNodeFromScript(baseSkill, baseSkill.scripts[0]);

        expect(result).toBe('skill.test-skill.action1');
        expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledTimes(2);
        expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledWith(
          'skill.test-skill.action1',
          expect.objectContaining({ name: 'Action One', category: 'Test Category', description: 'First action' })
        );
        expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledWith(
          'skill.test-skill.action2',
          expect.objectContaining({ name: 'Action Two', description: 'Second action' })
        );
      });

      it('should skip already-converted nodes', async () => {
        converter.convertedNodes.set('test-skill:action1', 'skill.test-skill.action1');

        await converter.createNodeFromScript(baseSkill, baseSkill.scripts[0]);

        expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledTimes(1);
        expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledWith(
          'skill.test-skill.action2',
          expect.any(Object)
        );
      });

      it('should use fallback label/category/description when action fields missing', async () => {
        const sparseDef = {
          actions: [
            { name: 'bare' }
          ]
        };
        SkillNodeDefinitions.getNodeDefinition.mockReturnValue(sparseDef);

        await converter.createNodeFromScript(baseSkill, baseSkill.scripts[0]);

        expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledWith(
          'skill.test-skill.bare',
          expect.objectContaining({
            name: 'Skill: test-skill - bare',
            category: 'Skill: test-skill',
            description: undefined
          })
        );
      });

      it('execute function should call executeSkillScript with action', async () => {
        const executeSpy = jest.spyOn(converter, 'executeSkillScript').mockResolvedValue({ success: true });

        await converter.createNodeFromScript(baseSkill, baseSkill.scripts[0]);

        const nodeType = mockWorkflowEngine.registerNodeType.mock.calls.find(
          c => c[0] === 'skill.test-skill.action1'
        )[1];

        expect(await nodeType.execute({}, { input1: 'value1' })).toEqual({ success: true });
        expect(executeSpy).toHaveBeenCalledWith(
          baseSkill,
          baseSkill.scripts[0],
          { input1: 'value1', action: 'action1', skill: { name: 'test-skill' } }
        );

        executeSpy.mockRestore();
      });
    });

    describe('without enhanced node definition (fallback)', () => {
      beforeEach(() => {
        SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);
      });

      it('should create a node with action from enum', async () => {
        const skillWithEnum = {
          ...baseSkill,
          inputs: [
            { name: 'action', type: 'string', enum: ['run'] },
            { name: 'data', type: 'object' }
          ],
          outputs: [{ name: 'result', type: 'object' }]
        };

        const result = await converter.createNodeFromScript(skillWithEnum, skillWithEnum.scripts[0]);

        expect(result).toBe('skill.test-skill.run');
        expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledWith(
          'skill.test-skill.run',
          expect.objectContaining({
            name: 'Skill: test-skill - run',
            inputs: {
              action: { type: 'string', required: false },
              data: { type: 'object', required: false }
            }
          })
        );
      });

      it('should default action to execute if no enum', async () => {
        expect(await converter.createNodeFromScript(baseSkill, baseSkill.scripts[0]))
          .toBe('skill.test-skill.execute');
      });

      it('fallback node execute should call executeSkillScript', async () => {
        const executeSpy = jest.spyOn(converter, 'executeSkillScript').mockResolvedValue({ success: true });

        await converter.createNodeFromScript(baseSkill, baseSkill.scripts[0]);

        const nodeType = mockWorkflowEngine.registerNodeType.mock.calls.find(
          (c) => c[0] === 'skill.test-skill.execute'
        )[1];

        await nodeType.execute(null, { data: 1 });
        expect(executeSpy).toHaveBeenCalledWith(baseSkill, baseSkill.scripts[0], { data: 1 });
        executeSpy.mockRestore();
      });

      it('should return cached node key if already converted', async () => {
        await converter.createNodeFromScript(baseSkill, baseSkill.scripts[0]);
        mockWorkflowEngine.registerNodeType.mockClear();

        expect(await converter.createNodeFromScript(baseSkill, baseSkill.scripts[0]))
          .toBe('skill.test-skill.execute');
        expect(mockWorkflowEngine.registerNodeType).not.toHaveBeenCalled();
      });

      it('should default outputs when skill has no outputs', async () => {
        await converter.createNodeFromScript({ ...baseSkill, outputs: undefined }, baseSkill.scripts[0]);

        expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledWith(
          'skill.test-skill.execute',
          expect.objectContaining({
            outputs: [{ name: 'result', type: 'object' }]
          })
        );
      });
    });
  });

  describe('convertSkillToNodes', () => {
    it('should throw for missing skill', async () => {
      mockSkillLoader.getSkill.mockReturnValue(null);
      await expect(converter.convertSkillToNodes('nonexistent')).rejects.toThrow('Skill not found: nonexistent');
    });

    it('should iterate over scripts and create nodes', async () => {
      const skill = {
        name: 'multi-script',
        description: 'desc',
        inputs: [{ name: 'action', type: 'string', enum: ['run'] }],
        scripts: [
          { language: 'node', entry: 'main.js' },
          { language: 'python', entry: 'helper.py' }
        ]
      };
      mockSkillLoader.getSkill.mockReturnValue(skill);
      SkillNodeDefinitions.getNodeDefinition.mockReturnValue(null);

      await converter.convertSkillToNodes('multi-script');

      expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledTimes(1);
      expect(converter.convertedNodes.size).toBe(1);
    });

    it('should create generic node when no scripts but has description', async () => {
      mockSkillLoader.getSkill.mockReturnValue({ name: 'desc-only', description: 'desc', inputs: [], scripts: [] });

      await converter.convertSkillToNodes('desc-only');

      expect(mockWorkflowEngine.registerNodeType).toHaveBeenCalledWith('skill.desc-only.generic', expect.any(Object));
    });

    it('should do nothing when no scripts and no description', async () => {
      mockSkillLoader.getSkill.mockReturnValue({ name: 'empty', description: '', inputs: [], scripts: [] });

      await converter.convertSkillToNodes('empty');

      expect(mockWorkflowEngine.registerNodeType).not.toHaveBeenCalled();
    });
  });

  describe('executeSkillScript', () => {
    const baseSkill = { name: 'test-skill', description: 'desc', skillPath: '/skills/test', version: '1.0', inputs: [], scripts: [] };
    const baseScript = { language: 'node', entry: 'index.js' };

    describe('python execution path', () => {
      it('should run python script via PythonEnvManager', async () => {
        pyEnvMock.runPythonScript.mockResolvedValue({ status: 'ok' });

        expect(await converter.executeSkillScript(
          { ...baseSkill, skillPath: '/skills/test' },
          { language: 'python', entry: 'main.py' },
          { data: 'test' }
        )).toEqual({ status: 'ok' });

        expect(pyEnvMock.runPythonScript).toHaveBeenCalledWith(
          'test-skill',
          path.join('/skills/test', 'main.py'),
          { data: 'test' },
          { requirements: [], isPure: false, forceDocker: false, forceLocal: false }
        );
      });

      it('should fall through on python failure', async () => {
        pyEnvMock.runPythonScript.mockRejectedValue(new Error('Python error'));
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await converter.executeSkillScript(baseSkill, { language: 'python', entry: 'main.py' }, {});

        expect(warnSpy).toHaveBeenCalledWith('[PythonExec] Failed to run Python skill:', 'Python error');
        warnSpy.mockRestore();
      });

      it('should default python entry to main.py', async () => {
        pyEnvMock.runPythonScript.mockResolvedValue({ status: 'ok' });

        await converter.executeSkillScript(
          { ...baseSkill, skillPath: '/skills/test' },
          { language: 'python' },
          {}
        );

        expect(pyEnvMock.runPythonScript).toHaveBeenCalledWith(
          'test-skill',
          path.join('/skills/test', 'main.py'),
          {},
          expect.anything()
        );
      });

      it('should warn when ensureEnvironment fails', async () => {
        pyEnvMock.runPythonScript.mockRejectedValue(new Error('no py'));
        pyEnvMock.ensureEnvironment.mockRejectedValue(new Error('env setup failed'));
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const skillWithDeps = {
          ...baseSkill,
          dependencies: ['numpy'],
          skillPath: '/skills/test'
        };

        await converter.executeSkillScript(skillWithDeps, { language: 'node', entry: 'index.js' }, {});

        expect(warnSpy).toHaveBeenCalledWith('[PythonEnvManager] env setup warning:', 'env setup failed');
        warnSpy.mockRestore();
      });
    });

    describe('first dynamic executor path (per-skill executor)', () => {
      it('should use module.execute when fs.existsSync is true', async () => {
        fs.existsSync.mockImplementation((p) => p.includes('docxExecutor') || p.includes('DocxExecutor'));

        await converter.executeSkillScript({ ...baseSkill, name: 'docx' }, baseScript, { title: 'Test' });

        expect(mockDocxTopExecute).toHaveBeenCalledWith({ action: 'test', inputs: { title: 'Test' } });
      });
    });

    describe('global executor paths', () => {
      it('should use docx global executor when first path skipped', async () => {
        await converter.executeSkillScript({ ...baseSkill, name: 'docx' }, baseScript, { title: 'Test' });

        expect(mockDocxTopExecute).toHaveBeenCalledWith({ title: 'Test' });
      });

      it('should use pdf global executor', async () => {
        fs.existsSync.mockImplementation((p) => {
          if (p.includes('pdfExecutor')) { return false; }
          if (p.includes('PdfExecutor')) { return true; }
          return false;
        });

        await converter.executeSkillScript({ ...baseSkill, name: 'pdf' }, baseScript, { title: 'Test' });

        expect(mockPdfTopExecute).toHaveBeenCalledWith({ title: 'Test' });
      });

      it('should use canvas global executor', async () => {
        fs.existsSync.mockImplementation((p) => {
          if (p.includes('canvasExecutor')) { return false; }
          if (p.includes('CanvasExecutor')) { return true; }
          return false;
        });

        await converter.executeSkillScript({ ...baseSkill, name: 'canvas-design' }, baseScript, { title: 'Test' });

        expect(mockCanvasTopExecute).toHaveBeenCalledWith({ title: 'Test' });
      });
    });

    describe('second generic executor path', () => {
      it('should call module.execute(inputs) when file exists', async () => {
        fs.existsSync.mockImplementation((p) => p.includes('docxExecutor') || p.includes('DocxExecutor'));

        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await converter.executeSkillScript({ ...baseSkill, name: 'docx' }, baseScript, {});

        expect(warnSpy).not.toHaveBeenCalled();
        warnSpy.mockRestore();
      });

      it('should fall back on executor failure', async () => {
        fs.existsSync.mockImplementation((p) => p.includes('failingExec'));

        await converter.executeSkillScript(baseSkill, baseScript, {});
      });
    });

    describe('named executor binds in first dynamic executor path', () => {
      function absExec(name) {
        return path.resolve(__dirname, '..', '..', 'src', 'skills', 'executors', `${name}.js`);
      }

      it('should bind DocxExecutor.execute when no top-level execute', async () => {
        const fakeExec = { DocxExecutor: { execute: jest.fn().mockResolvedValue({ success: true, via: 'docx' }) } };
        jest.doMock(absExec('namedDocxExecutor'), () => fakeExec, { virtual: true });

        fs.existsSync.mockImplementation((p) => p.includes('namedDocxExecutor'));

        const result = await converter.executeSkillScript(
          { ...baseSkill, name: 'namedDocx' },
          baseScript,
          {}
        );

        expect(fakeExec.DocxExecutor.execute).toHaveBeenCalledWith({ action: 'test', inputs: {} });
        expect(result.via).toBe('docx');
        jest.dontMock(absExec('namedDocxExecutor'));
      });

      it('should bind PdfExecutor.execute when no top-level execute', async () => {
        const fakeExec = { PdfExecutor: { execute: jest.fn().mockResolvedValue({ success: true, via: 'pdf' }) } };
        jest.doMock(absExec('namedPdfExecutor'), () => fakeExec, { virtual: true });

        fs.existsSync.mockImplementation((p) => p.includes('namedPdfExecutor'));

        const result = await converter.executeSkillScript(
          { ...baseSkill, name: 'namedPdf' },
          baseScript,
          {}
        );

        expect(fakeExec.PdfExecutor.execute).toHaveBeenCalledWith({ action: 'test', inputs: {} });
        expect(result.via).toBe('pdf');
        jest.dontMock(absExec('namedPdfExecutor'));
      });

      it('should bind CanvasExecutor.execute when no top-level execute', async () => {
        const fakeExec = { CanvasExecutor: { execute: jest.fn().mockResolvedValue({ success: true, via: 'canvas' }) } };
        jest.doMock(absExec('namedCanvasExecutor'), () => fakeExec, { virtual: true });

        fs.existsSync.mockImplementation((p) => p.includes('namedCanvasExecutor'));

        const result = await converter.executeSkillScript(
          { ...baseSkill, name: 'namedCanvas' },
          baseScript,
          {}
        );

        expect(fakeExec.CanvasExecutor.execute).toHaveBeenCalledWith({ action: 'test', inputs: {} });
        expect(result.via).toBe('canvas');
        jest.dontMock(absExec('namedCanvasExecutor'));
      });

      it('should warn and fall through when first executor throws', async () => {
        const fakeExec = { execute: jest.fn().mockRejectedValue(new Error('executor boom')) };
        jest.doMock(absExec('namedBoomExecutor'), () => fakeExec, { virtual: true });

        fs.existsSync.mockImplementation((p) => p.includes('namedBoomExecutor'));
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await converter.executeSkillScript(
          { ...baseSkill, name: 'namedBoom' },
          baseScript,
          {}
        );

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed, falling back'));
        warnSpy.mockRestore();
        jest.dontMock(absExec('namedBoomExecutor'));
      });

      it('should fall through to script execution when no execFn found', async () => {
        const fakeExec = { SomeOther: { execute: jest.fn() } };
        jest.doMock(absExec('namedNoopExecutor'), () => fakeExec, { virtual: true });

        fs.existsSync.mockImplementation((p) => p.includes('namedNoopExecutor'));

        await converter.executeSkillScript(
          { ...baseSkill, name: 'namedNoop' },
          baseScript,
          {}
        );

        expect(safeExecFile).toHaveBeenCalled();
        jest.dontMock(absExec('namedNoopExecutor'));
      });
    });

    describe('second generic executor path catch', () => {
      it('should warn and fall back when executor execute throws', async () => {
        const fakeExec = { execute: jest.fn().mockRejectedValue(new Error('second path boom')) };
        jest.doMock(path.resolve(__dirname, '..', '..', 'src', 'skills', 'executors', 'secondPathExecutor.js'), () => fakeExec, { virtual: true });

        fs.existsSync.mockImplementation((p) => p.includes('secondPathExecutor'));
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await converter.executeSkillScript(
          { ...baseSkill, name: 'secondPath' },
          baseScript,
          {}
        );

        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('failed, falling back'));
        warnSpy.mockRestore();
        jest.dontMock(path.resolve(__dirname, '..', '..', 'src', 'skills', 'executors', 'secondPathExecutor.js'));
      });
    });

    describe('fallback execFileAsync script execution', () => {
      beforeEach(() => {
        fs.existsSync.mockReturnValue(false);
      });

      it('should use node for javascript/node scripts', async () => {
        await converter.executeSkillScript(baseSkill, { language: 'node', entry: 'run.js' }, { data: 1 });

        expect(safeExecFile).toHaveBeenCalledWith(
          'node',
          [path.join('/skills/test', 'run.js')],
          expect.objectContaining({ encoding: 'utf8', timeout: 30000, maxBuffer: 1048576 }),
          expect.any(Function)
        );
      });

      it('should use python for python scripts (post-python-executor fallthrough)', async () => {
        await converter.executeSkillScript(baseSkill, { language: 'python', entry: 'script.py' }, {});

        expect(safeExecFile).toHaveBeenCalledWith(
          'python',
          [path.join('/skills/test', 'script.py')],
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should use bash for shell scripts', async () => {
        await converter.executeSkillScript(baseSkill, { language: 'bash', entry: 'run.sh' }, {});

        expect(safeExecFile).toHaveBeenCalledWith(
          'bash',
          [path.join('/skills/test', 'run.sh')],
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should default unknown language to node', async () => {
        await converter.executeSkillScript(baseSkill, { language: 'ruby', entry: 'script.rb' }, {});

        expect(safeExecFile).toHaveBeenCalledWith(
          'node',
          [path.join('/skills/test', 'script.rb')],
          expect.any(Object),
          expect.any(Function)
        );
      });

      it('should default entries for python, node, bash and unknown languages', async () => {
        await converter.executeSkillScript(baseSkill, { language: 'python' }, {});
        expect(safeExecFile).toHaveBeenCalledWith('python', [path.join('/skills/test', 'main.py')], expect.any(Object), expect.any(Function));

        await converter.executeSkillScript(baseSkill, { language: 'node' }, {});
        expect(safeExecFile).toHaveBeenCalledWith('node', [path.join('/skills/test', 'index.js')], expect.any(Object), expect.any(Function));

        await converter.executeSkillScript(baseSkill, { language: 'bash' }, {});
        expect(safeExecFile).toHaveBeenCalledWith('bash', [path.join('/skills/test', 'script.sh')], expect.any(Object), expect.any(Function));

        await converter.executeSkillScript(baseSkill, { language: 'ruby' }, {});
        expect(safeExecFile).toHaveBeenCalledWith('node', [path.join('/skills/test', 'index.js')], expect.any(Object), expect.any(Function));
      });

      it('should parse stdout as JSON result', async () => {
        safeExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
          cb(null, { stdout: JSON.stringify({ custom: 'data' }), stderr: '' });
        });

        expect(await converter.executeSkillScript(baseSkill, baseScript, {}))
          .toEqual({ custom: 'data' });
      });

      it('should return stdout as text output when JSON parsing fails', async () => {
        safeExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
          cb(null, { stdout: 'plain text output', stderr: '' });
        });

        expect(await converter.executeSkillScript(baseSkill, baseScript, {}))
          .toEqual({ output: 'plain text output' });
      });

      it('should include stderr in result if present', async () => {
        safeExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
          cb(null, { stdout: '{}', stderr: 'some warning' });
        });

        const result = await converter.executeSkillScript(baseSkill, baseScript, {});
        expect(result).toEqual({ stderr: 'some warning' });
      });

      it('should pass env with dependencies to execFileAsync', async () => {
        const skillWithDeps = { ...baseSkill, dependencies: ['lodash'] };

        await converter.executeSkillScript(skillWithDeps, baseScript, {});

        const callArgs = safeExecFile.mock.calls[0];
        const options = callArgs[2];
        expect(JSON.parse(options.env.SKILL_DEPENDENCIES)).toEqual(['lodash']);
      });

      it('should throw error when execFileAsync fails', async () => {
        safeExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
          cb(new Error('Command failed'));
        });

        await expect(converter.executeSkillScript(baseSkill, baseScript, {}))
          .rejects.toThrow('Failed to execute skill test-skill: Command failed');
      });
    });
  });

  describe('getConvertedNodes', () => {
    it('should return matching nodes for a skill', () => {
      converter.convertedNodes.set('docx:create', 'skill.docx.create');
      converter.convertedNodes.set('docx:read', 'skill.docx.read');
      converter.convertedNodes.set('pdf:create', 'skill.pdf.create');

      expect(converter.getConvertedNodes('docx')).toEqual(['skill.docx.create', 'skill.docx.read']);
      expect(converter.getConvertedNodes('pdf')).toEqual(['skill.pdf.create']);
      expect(converter.getConvertedNodes('unknown')).toEqual([]);
    });
  });

  describe('clearConvertedNodes', () => {
    it('should clear all converted nodes', () => {
      converter.convertedNodes.set('docx:create', 'skill.docx.create');
      converter.convertedNodes.set('pdf:create', 'skill.pdf.create');
      converter.clearConvertedNodes();
      expect(converter.convertedNodes.size).toBe(0);
    });
  });

  describe('static PythonEnvManager methods', () => {
    it('getPythonEnvMetrics should delegate to _pyEnv', () => {
      expect(SkillToNode.getPythonEnvMetrics()).toEqual({ totalExecutions: 0 });
      expect(pyEnvMock.getMetrics).toHaveBeenCalled();
    });

    it('getPythonEnvCacheStats should delegate to _pyEnv', () => {
      expect(SkillToNode.getPythonEnvCacheStats()).toEqual({ hits: 0, misses: 0 });
      expect(pyEnvMock.getCacheStats).toHaveBeenCalled();
    });

    it('clearPythonEnvCache should delegate to _pyEnv', () => {
      SkillToNode.clearPythonEnvCache();
      expect(pyEnvMock.clearCache).toHaveBeenCalled();
    });
  });
});
