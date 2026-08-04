describe('OpenAPIGenerator', () => {
  let OpenAPIGenerator;
  let generator;

  beforeAll(() => {
    OpenAPIGenerator = require('../../src/docs/OpenAPIGenerator');
    OpenAPIGenerator = OpenAPIGenerator.OpenAPIGenerator || OpenAPIGenerator;
  });

  beforeEach(() => {
    generator = new OpenAPIGenerator();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('creates valid base spec', () => {
      expect(generator.spec.openapi).toBe('3.0.3');
      expect(generator.spec.info.title).toBe('UltraWork AI Platform API');
      expect(generator.spec.servers).toHaveLength(3);
      expect(generator.spec.paths).toEqual({});
      expect(generator.paths).toEqual([]);
    });
  });

  describe('setServer', () => {
    it('adds server entry', () => {
      generator.setServer('https://test.com', 'Test');
      expect(generator.spec.servers).toHaveLength(4);
      expect(generator.spec.servers[3].url).toBe('https://test.com');
    });
  });

  describe('addTag', () => {
    it('adds tag', () => {
      generator.addTag('Test', 'Test tag');
      expect(generator.spec.tags).toHaveLength(1);
      expect(generator.spec.tags[0].name).toBe('Test');
    });
  });

  describe('addSecurityScheme', () => {
    it('adds security scheme', () => {
      generator.addSecurityScheme('ApiKey', { type: 'apiKey', in: 'header', name: 'X-API-Key' });
      expect(generator.spec.components.securitySchemes.ApiKey).toBeDefined();
      expect(generator.spec.components.securitySchemes.ApiKey.type).toBe('apiKey');
    });
  });

  describe('addSchema', () => {
    it('adds schema to components', () => {
      generator.addSchema('TestModel', { type: 'object', properties: { id: { type: 'string' } } });
      expect(generator.spec.components.schemas.TestModel).toBeDefined();
      expect(generator.spec.components.schemas.TestModel.type).toBe('object');
    });
  });

  describe('addPath', () => {
    it('adds path entry', () => {
      generator.addPath('get', '/test', {
        operationId: 'testOp', summary: 'Test', tags: ['Test'],
        responses: { '200': { description: 'OK' } }
      });
      expect(generator.spec.paths['/test'].get).toBeDefined();
      expect(generator.spec.paths['/test'].get.operationId).toBe('testOp');
    });

    it('supports security on path', () => {
      generator.addPath('get', '/secure', {
        operationId: 'secureOp', summary: 'Secure',
        responses: { '200': { description: 'OK' } },
        security: [{ BearerAuth: [] }]
      });
      expect(generator.spec.paths['/secure'].get.security).toBeDefined();
    });

    it('tracks paths array', () => {
      generator.addPath('get', '/a', { operationId: 'op1', summary: 'A', responses: {} });
      generator.addPath('post', '/b', { operationId: 'op2', summary: 'B', responses: {} });
      expect(generator.paths).toHaveLength(2);
    });

    it('applies default responses when omitted', () => {
      generator.addPath('get', '/default', { operationId: 'op', summary: 'Default' });
      expect(generator.spec.paths['/default'].get.responses['200'].description).toBe('Success');
      expect(generator.spec.paths['/default'].get.deprecated).toBe(false);
    });
  });

  describe('HTTP method shortcuts', () => {
    it('get delegates to addPath', () => {
      generator.get('/test', { operationId: 'getTest', summary: 'GET', responses: {} });
      expect(generator.spec.paths['/test'].get).toBeDefined();
    });

    it('post delegates to addPath', () => {
      generator.post('/test', { operationId: 'postTest', summary: 'POST', responses: {} });
      expect(generator.spec.paths['/test'].post).toBeDefined();
    });

    it('put delegates to addPath', () => {
      generator.put('/test', { operationId: 'putTest', summary: 'PUT', responses: {} });
      expect(generator.spec.paths['/test'].put).toBeDefined();
    });

    it('delete delegates to addPath', () => {
      generator.delete('/test', { operationId: 'delTest', summary: 'DEL', responses: {} });
      expect(generator.spec.paths['/test'].delete).toBeDefined();
    });

    it('patch delegates to addPath', () => {
      generator.patch('/test', { operationId: 'patchTest', summary: 'PATCH', responses: {} });
      expect(generator.spec.paths['/test'].patch).toBeDefined();
    });
  });

  describe('generateSchemas', () => {
    it('adds all standard schemas', () => {
      generator.generateSchemas();
      const schemaKeys = Object.keys(generator.spec.components.schemas);
      expect(schemaKeys).toContain('Skill');
      expect(schemaKeys).toContain('Workflow');
      expect(schemaKeys).toContain('Model');
      expect(schemaKeys).toContain('Error');
      expect(schemaKeys).toContain('Pagination');
      expect(schemaKeys).toContain('CostReport');
      expect(schemaKeys).toContain('User');
      expect(schemaKeys).toContain('ComplianceReport');
      expect(schemaKeys.length).toBeGreaterThanOrEqual(13);
    });
  });

  describe('addStandardResponses', () => {
    it('returns standard error responses', () => {
      const responses = generator.addStandardResponses('op1');
      expect(responses['400']).toBeDefined();
      expect(responses['401']).toBeDefined();
      expect(responses['403']).toBeDefined();
      expect(responses['404']).toBeDefined();
      expect(responses['500']).toBeDefined();
      expect(responses['400'].description).toBe('Bad Request');
    });
  });

  describe('generate', () => {
    it('calls generateSchemas and returns spec', () => {
      const result = generator.generate();
      expect(result).toBe(generator.spec);
      expect(generator.spec.components.schemas.Skill).toBeDefined();
    });
  });

  describe('saveToFile', () => {
    it('writes JSON file', () => {
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      const result = generator.saveToFile('/tmp/api.json');
      expect(result).toBe('/tmp/api.json');
    });

    it('creates directory when missing', () => {
      const fs = require('fs');
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      generator.saveToFile('/new/dir/api.json');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/new/dir', { recursive: true });
    });
  });

  describe('toMarkdown', () => {
    it('generates markdown with title', () => {
      const md = generator.toMarkdown();
      expect(md).toContain('UltraWork AI Platform API');
      expect(md).toContain('Base URL');
    });

    it('includes authentication section when schemes exist', () => {
      generator.addSecurityScheme('BearerAuth', { type: 'http', scheme: 'bearer' });
      const md = generator.toMarkdown();
      expect(md).toContain('Authentication');
    });

    it('includes API categories', () => {
      generator.addTag('Skills', 'Skill APIs');
      const md = generator.toMarkdown();
      expect(md).toContain('API Categories');
    });

    it('includes endpoints', () => {
      generator.get('/api/test', { operationId: 'test', summary: 'Test endpoint', tags: ['Test'], responses: {} });
      const md = generator.toMarkdown();
      expect(md).toContain('GET /api/test');
      expect(md).toContain('Test endpoint');
    });

    it('includes full endpoint details', () => {
      generator.post('/api/full', {
        operationId: 'fullOp', summary: 'Full endpoint', description: 'A described endpoint',
        tags: ['Test'],
        parameters: [
          { name: 'typed', schema: { type: 'integer' }, required: true, description: 'typed param' },
          { name: 'plain' }
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } },
        responses: { '201': { description: 'Created' } }
      });
      const md = generator.toMarkdown();
      expect(md).toContain('POST /api/full');
      expect(md).toContain('A described endpoint');
      expect(md).toContain('**Parameters:**');
      expect(md).toContain('typed param');
      expect(md).toContain('**Request Body:**');
      expect(md).toContain('201');
      expect(md).toContain('Created');
    });

    it('includes schema descriptions', () => {
      generator.addSchema('Described', {
        type: 'object', description: 'A described model',
        properties: { id: { type: 'string', description: 'ID field' } }
      });
      const md = generator.toMarkdown();
      expect(md).toContain('A described model');
      expect(md).toContain('ID field');
    });

    it('handles schema without properties', () => {
      generator.addSchema('Bare', { type: 'object' });
      const md = generator.toMarkdown();
      expect(md).toContain('Bare');
      expect(md).not.toContain('| Property |');
    });

    it('includes data models section', () => {
      generator.generateSchemas();
      const md = generator.toMarkdown();
      expect(md).toContain('Data Models');
    });
  });

  describe('generateFullAPIDoc', () => {
    it('returns generator with all endpoint categories', () => {
      const { generateFullAPIDoc } = require('../../src/docs/OpenAPIGenerator');
      const gen = generateFullAPIDoc();
      const spec = gen.generate();
      expect(spec.paths['/api/v1/skills'].get).toBeDefined();
      expect(spec.paths['/api/v1/workflows'].get).toBeDefined();
      expect(spec.paths['/api/v1/intent/understand'].post).toBeDefined();
      expect(spec.paths['/api/v1/costs/report'].get).toBeDefined();
      expect(spec.paths['/api/v1/compliance/frameworks'].get).toBeDefined();
      expect(spec.paths['/api/v1/workspaces'].get).toBeDefined();
      expect(spec.tags.length).toBeGreaterThanOrEqual(6);
    });
  });
});
