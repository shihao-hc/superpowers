const { SkillNodeDefinitions } = require('../../src/skills/SkillNodeDefinitions');

const ALL_SKILL_NAMES = [
  'docx', 'pdf', 'canvas-design', 'brand-guidelines', 'pptx', 'xlsx',
  'claude-api', 'mcp-builder', 'skill-creator', 'frontend-design',
  'doc-coauthoring', 'theme-factory', 'slack-gif-creator',
  'web-artifacts-builder', 'webapp-testing', 'internal-comms',
  'algorithmic-art'
];

describe('SkillNodeDefinitions', () => {
  describe('module exports', () => {
    it('should export SkillNodeDefinitions class', () => {
      expect(SkillNodeDefinitions).toBeDefined();
      expect(typeof SkillNodeDefinitions).toBe('function');
    });

    it('should have static methods', () => {
      expect(typeof SkillNodeDefinitions.getNodeDefinition).toBe('function');
      expect(typeof SkillNodeDefinitions.getAllNodeDefinitions).toBe('function');
    });

    it('should have static getter for each skill', () => {
      const methodNames = [
        'getDocxNodeDefinition', 'getPdfNodeDefinition', 'getCanvasNodeDefinition',
        'getBrandGuidelinesNodeDefinition', 'getPptxNodeDefinition', 'getXlsxNodeDefinition',
        'getClaudeApiNodeDefinition', 'getMcpBuilderNodeDefinition', 'getSkillCreatorNodeDefinition',
        'getFrontendDesignNodeDefinition', 'getDocCoauthoringNodeDefinition', 'getThemeFactoryNodeDefinition',
        'getSlackGifCreatorNodeDefinition', 'getWebArtifactsBuilderNodeDefinition',
        'getWebappTestingNodeDefinition', 'getInternalCommsNodeDefinition', 'getAlgorithmicArtNodeDefinition'
      ];
      methodNames.forEach(name => {
        expect(typeof SkillNodeDefinitions[name]).toBe('function');
      });
    });
  });

  describe('getAllNodeDefinitions', () => {
    it('should return all 17 skill definitions', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      expect(Object.keys(defs)).toHaveLength(17);
    });

    it('should return definitions for all known skill names', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      ALL_SKILL_NAMES.forEach(name => {
        expect(defs[name]).toBeDefined();
      });
    });

    it('should return independent copies on each call', () => {
      const defs1 = SkillNodeDefinitions.getAllNodeDefinitions();
      const defs2 = SkillNodeDefinitions.getAllNodeDefinitions();
      expect(defs1).not.toBe(defs2);
      expect(defs1).toEqual(defs2);
    });
  });

  describe('getNodeDefinition', () => {
    it('should return definition for known skill', () => {
      ALL_SKILL_NAMES.forEach(name => {
        const def = SkillNodeDefinitions.getNodeDefinition(name);
        expect(def).not.toBeNull();
      });
    });

    it('should return null for unknown skill', () => {
      expect(SkillNodeDefinitions.getNodeDefinition('unknown-skill')).toBeNull();
      expect(SkillNodeDefinitions.getNodeDefinition('')).toBeNull();
    });

    it('should be case-sensitive', () => {
      expect(SkillNodeDefinitions.getNodeDefinition('DOCX')).toBeNull();
      expect(SkillNodeDefinitions.getNodeDefinition('Docx')).toBeNull();
    });
  });

  describe('definition structure', () => {
    it('each definition should have category and description', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      Object.entries(defs).forEach(([_name, def]) => {
        expect(typeof def.category).toBe('string');
        expect(def.category.length).toBeGreaterThan(0);
        expect(typeof def.description).toBe('string');
        expect(def.description.length).toBeGreaterThan(0);
      });
    });

    it('each definition should have actions array', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      Object.entries(defs).forEach(([_name, def]) => {
        expect(Array.isArray(def.actions)).toBe(true);
        expect(def.actions.length).toBeGreaterThan(0);
      });
    });

    it('should have 4 document-processing, 2 design-system, 3 dev-tools categories', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      const cats = Object.values(defs).map(d => d.category);
      expect(cats.filter(c => c === 'Document Processing')).toHaveLength(4);
      expect(cats.filter(c => c === 'Design System')).toHaveLength(3);
      expect(cats.filter(c => c === 'Development Tools')).toHaveLength(3);
      expect(cats.filter(c => c === 'Graphics & Design')).toHaveLength(2);
    });

    it('some definitions should have riskLevel', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      const withRisk = Object.values(defs).filter(d => d.riskLevel !== undefined);
      expect(withRisk.length).toBeGreaterThan(0);
      ['low', 'medium', 'high'].forEach(level => {
        expect(Object.values(defs).some(d => d.riskLevel === level)).toBe(true);
      });
    });

    it('some definitions should have pure flag', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      const withPure = Object.values(defs).filter(d => d.pure !== undefined);
      expect(withPure.length).toBeGreaterThan(0);
      Object.values(defs).filter(d => d.pure !== undefined).forEach(d => {
        expect(d.pure).toBe(false);
      });
    });
  });

  describe('action structure', () => {
    it('each action should have name, label, description, inputs, outputs', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      Object.values(defs).forEach(def => {
        def.actions.forEach(action => {
          expect(typeof action.name).toBe('string');
          expect(action.name.length).toBeGreaterThan(0);
          expect(typeof action.label).toBe('string');
          expect(action.label.length).toBeGreaterThan(0);
          expect(typeof action.description).toBe('string');
          expect(action.description.length).toBeGreaterThan(0);
          expect(typeof action.inputs).toBe('object');
          expect(typeof action.outputs).toBe('object');
        });
      });
    });

    it('action names should be unique within each definition', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      Object.entries(defs).forEach(([_name, def]) => {
        const actionNames = def.actions.map(a => a.name);
        expect(new Set(actionNames).size).toBe(actionNames.length);
      });
    });

    it('should have required inputs on most actions', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      const allActions = Object.values(defs).flatMap(d => d.actions);
      const withRequired = allActions.filter(a => Object.values(a.inputs).some(inp => inp.required === true));
      expect(withRequired.length).toBeGreaterThan(allActions.length * 0.7);
    });
  });

  describe('input/output properties', () => {
    it('each input property should have type, description, optional required', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      Object.values(defs).forEach(def => {
        def.actions.forEach(action => {
          Object.entries(action.inputs).forEach(([_key, prop]) => {
            expect(typeof prop.type).toBe('string');
            expect(typeof prop.description).toBe('string');
            expect([true, false, undefined]).toContain(prop.required);
          });
        });
      });
    });

    it('each output property should have type and description', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      Object.values(defs).forEach(def => {
        def.actions.forEach(action => {
          Object.entries(action.outputs).forEach(([_key, prop]) => {
            expect(typeof prop.type).toBe('string');
            expect(typeof prop.description).toBe('string');
          });
        });
      });
    });

    it('some inputs should have default values', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      let hasDefault = false;
      Object.values(defs).forEach(def => {
        def.actions.forEach(action => {
          Object.values(action.inputs).forEach(inp => {
            if (inp.default !== undefined) hasDefault = true;
          });
        });
      });
      expect(hasDefault).toBe(true);
    });

    it('some inputs should have enum values', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      let hasEnum = false;
      Object.values(defs).forEach(def => {
        def.actions.forEach(action => {
          Object.values(action.inputs).forEach(inp => {
            if (inp.enum) hasEnum = true;
          });
        });
      });
      expect(hasEnum).toBe(true);
    });
  });

  describe('specific skill definitions', () => {
    it('docx: should have 7 actions with correct names', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('docx');
      const names = def.actions.map(a => a.name);
      expect(names).toEqual(['create', 'createWithHeadings', 'createWithTable', 'createWithImage', 'createReport', 'read', 'edit']);
    });

    it('pdf: should have 7 actions including createInvoice', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('pdf');
      const names = def.actions.map(a => a.name);
      expect(names).toEqual(['create', 'createWithForm', 'createWithTable', 'createReport', 'createInvoice', 'read', 'edit']);
    });

    it('canvas-design: should have 7 actions', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('canvas-design');
      expect(def.actions).toHaveLength(7);
      const names = def.actions.map(a => a.name);
      expect(names).toContain('createChart');
      expect(names).toContain('createIcon');
      expect(names).toContain('createBanner');
      expect(names).toContain('applyFilter');
      expect(names).toContain('resize');
    });

    it('brand-guidelines: category and single action', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('brand-guidelines');
      expect(def.category).toBe('Design System');
      expect(def.actions).toHaveLength(1);
      expect(def.actions[0].name).toBe('apply');
      expect(def.riskLevel).toBeUndefined();
    });

    it('pptx: single action with required title and slides', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('pptx');
      expect(def.category).toBe('Document Processing');
      expect(def.actions).toHaveLength(1);
      expect(def.actions[0].inputs.title.required).toBe(true);
      expect(def.actions[0].inputs.slides.required).toBe(true);
    });

    it('xlsx: single action with required sheets', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('xlsx');
      expect(def.category).toBe('Document Processing');
      expect(def.actions).toHaveLength(1);
      expect(def.actions[0].inputs.sheets.required).toBe(true);
    });

    it('claude-api: medium risk with chat action', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('claude-api');
      expect(def.riskLevel).toBe('medium');
      expect(def.actions).toHaveLength(1);
      expect(def.actions[0].name).toBe('chat');
      expect(def.actions[0].inputs.message.required).toBe(true);
    });

    it('mcp-builder: high risk with createServer action', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('mcp-builder');
      expect(def.riskLevel).toBe('high');
      expect(def.actions).toHaveLength(1);
      expect(def.actions[0].name).toBe('createServer');
    });

    it('canvas-design: createChart has enum chartType and correct inputs', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('canvas-design');
      const chartAction = def.actions.find(a => a.name === 'createChart');
      expect(chartAction.inputs.chartType.enum).toEqual(['bar', 'line', 'pie', 'doughnut']);
      expect(chartAction.inputs.data.required).toBe(true);
      expect(chartAction.inputs.labels.required).toBe(true);
    });

    it('canvas-design: createIcon has enum iconType', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('canvas-design');
      const iconAction = def.actions.find(a => a.name === 'createIcon');
      expect(iconAction.inputs.iconType.enum).toContain('check');
      expect(iconAction.inputs.iconType.enum).toContain('star');
      expect(iconAction.inputs.iconType.enum).toContain('heart');
    });

    it('canvas-design: applyFilter has enum filter types', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('canvas-design');
      const filterAction = def.actions.find(a => a.name === 'applyFilter');
      expect(filterAction.inputs.filter.enum).toEqual(['grayscale', 'sepia', 'invert', 'brightness', 'contrast']);
    });

    it('canvas-design: createBanner has pattern enum', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('canvas-design');
      const bannerAction = def.actions.find(a => a.name === 'createBanner');
      expect(bannerAction.inputs.pattern.enum).toEqual(['none', 'stripes', 'dots', 'grid']);
    });

    it('internal-comms: sendMessage has string|array to type', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('internal-comms');
      const action = def.actions[0];
      expect(action.name).toBe('sendMessage');
      expect(action.inputs.to.type).toBe('string|array');
      expect(action.inputs.to.required).toBe(true);
    });

    it('algorithmic-art: createArt with seed for reproducibility', () => {
      const def = SkillNodeDefinitions.getNodeDefinition('algorithmic-art');
      const action = def.actions[0];
      expect(action.name).toBe('createArt');
      expect(action.inputs.seed.type).toBe('number');
      expect(action.inputs.width.default).toBe(800);
      expect(action.inputs.height.default).toBe(800);
    });
  });

  describe('action counts across all skills', () => {
    it('should have at least 30 total actions', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      const total = Object.values(defs).reduce((sum, d) => sum + d.actions.length, 0);
      expect(total).toBeGreaterThanOrEqual(30);
    });

    it('docx, pdf, canvas-design should have the most actions (7 each)', () => {
      const defs = SkillNodeDefinitions.getAllNodeDefinitions();
      const counts = Object.entries(defs).map(([name, d]) => ({ name, count: d.actions.length }));
      const maxCount = Math.max(...counts.map(c => c.count));
      const top = counts.filter(c => c.count === maxCount).map(c => c.name);
      expect(top.sort()).toEqual(['canvas-design', 'docx', 'pdf']);
    });
  });

  describe('consistency between getNodeDefinition and getAllNodeDefinitions', () => {
    it('should return same data from both methods', () => {
      const all = SkillNodeDefinitions.getAllNodeDefinitions();
      ALL_SKILL_NAMES.forEach(name => {
        expect(SkillNodeDefinitions.getNodeDefinition(name)).toEqual(all[name]);
      });
    });
  });
});
