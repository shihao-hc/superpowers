const fs = require('fs');

jest.mock('fs');

const { SkillConsolidator } = require('../../src/skills/optimization/SkillConsolidator');

describe('SkillConsolidator', () => {
  const mockDataDir = '\\mock\\data\\consolidation';
  const mockConsolidationsFile = '\\mock\\data\\consolidation\\consolidations.json';
  let consolidator;
  let defaultSkills;

  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    consolidator = new SkillConsolidator({ dataDir: mockDataDir });
    defaultSkills = [
      {
        name: 'performance-optimization',
        description: 'Optimizes performance',
        features: ['caching', 'profiling'],
        dependencies: ['profiler', 'cache-manager'],
        config: { maxCache: 100 }
      },
      {
        name: 'performance-tuning',
        description: 'Tunes performance',
        features: ['profiling'],
        dependencies: ['profiler'],
        config: { threshold: 50 }
      },
      {
        name: 'stress-testing',
        description: 'Stress tests the system',
        features: ['load-test'],
        dependencies: ['load-generator']
      },
      {
        name: 'skill-creator',
        description: 'Core skill creator'
      },
      {
        name: 'isolated-tool',
        description: 'No dependents',
        dependencies: []
      }
    ];
  });

  /* ========== Constructor ========== */

  describe('constructor', () => {
    it('should create instance with default dataDir', () => {
      const c = new SkillConsolidator();
      expect(c.dataDir).toContain('data\\consolidation');
      expect(c.consolidations).toEqual([]);
      expect(c.redundantGroups.length).toBeGreaterThan(0);
    });

    it('should use provided dataDir', () => {
      expect(consolidator.dataDir).toBe(mockDataDir);
      expect(consolidator.consolidationsFile).toBe(mockConsolidationsFile);
    });

    it('should create dataDir if not exists', () => {
      expect(fs.existsSync).toHaveBeenCalledWith(mockDataDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockDataDir, { recursive: true });
    });

    it('should load existing consolidations file', () => {
      const saved = { consolidations: [{ type: 'merge', primary: 'a' }] };
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValueOnce(JSON.stringify(saved));
      const c = new SkillConsolidator({ dataDir: mockDataDir });
      expect(c.consolidations).toEqual(saved.consolidations);
    });

    it('should handle corrupt consolidation file gracefully', () => {
      fs.existsSync.mockReturnValueOnce(true);
      fs.readFileSync.mockReturnValueOnce('not json');
      const c = new SkillConsolidator({ dataDir: mockDataDir });
      expect(c.consolidations).toEqual([]);
    });
  });

  /* ========== _ensureDataDir ========== */

  describe('_ensureDataDir', () => {
    it('should not create dir if already exists', () => {
      jest.clearAllMocks();
      fs.existsSync.mockReturnValue(true);
      consolidator._ensureDataDir();
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  /* ========== _saveData ========== */

  describe('_saveData', () => {
    it('should persist consolidations to disk', () => {
      consolidator.consolidations = [{ type: 'test' }];
      consolidator._saveData();
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        mockConsolidationsFile,
        expect.stringContaining('"consolidations"')
      );
    });

    it('should handle write failure gracefully', () => {
      fs.writeFileSync.mockImplementationOnce(() => { throw new Error('permission denied'); });
      consolidator.consolidations = [{ type: 'test' }];
      expect(() => consolidator._saveData()).not.toThrow();
    });
  });

  /* ========== analyzeRedundancy ========== */

  describe('analyzeRedundancy', () => {
    it('should detect redundant groups with >=2 skills found', () => {
      const analysis = consolidator.analyzeRedundancy(defaultSkills);
      const perfGroup = analysis.redundantGroups.find((g) => g.id === 'performance-skills');
      expect(perfGroup).toBeDefined();
      expect(perfGroup.foundSkills.length).toBe(3);
    });

    it('should not include groups with fewer than 2 skills', () => {
      const skills = [{ name: 'performance-optimization' }];
      const analysis = consolidator.analyzeRedundancy(skills);
      expect(analysis.redundantGroups).toHaveLength(0);
    });

    it('should match skills by id field as fallback', () => {
      const skills = [
        { id: 'performance-optimization' },
        { id: 'performance-tuning' }
      ];
      const analysis = consolidator.analyzeRedundancy(skills);
      expect(analysis.redundantGroups).toHaveLength(1);
    });

    it('should identify orphaned skills', () => {
      const analysis = consolidator.analyzeRedundancy(defaultSkills);
      expect(analysis.orphanedSkills.some((s) => s.name === 'isolated-tool')).toBe(true);
    });

    it('should exclude core skills from orphaned list', () => {
      const analysis = consolidator.analyzeRedundancy(defaultSkills);
      expect(analysis.orphanedSkills.some((s) => s.name === 'skill-creator')).toBe(false);
    });

    it('should include dependencies map', () => {
      const analysis = consolidator.analyzeRedundancy(defaultSkills);
      expect(analysis.dependencies).toBeDefined();
    });

    it('should generate recommendations', () => {
      const analysis = consolidator.analyzeRedundancy(defaultSkills);
      expect(analysis.recommendations.length).toBeGreaterThan(0);
    });

    it('should generate merge recommendation for merge-action groups', () => {
      const analysis = consolidator.analyzeRedundancy(defaultSkills);
      const mergeRec = analysis.recommendations.find((r) => r.type === 'merge');
      expect(mergeRec).toBeDefined();
      expect(mergeRec.priority).toBe('high');
      expect(mergeRec.estimatedEffort).toBe('medium');
    });

    it('should generate hierarchy recommendation for hierarchy-action groups', () => {
      const skills = [
        { name: 'security-hardening' },
        { name: 'cli-tool-security' }
      ];
      const analysis = consolidator.analyzeRedundancy(skills);
      const hierRec = analysis.recommendations.find((r) => r.type === 'hierarchy');
      expect(hierRec).toBeDefined();
      expect(hierRec.priority).toBe('medium');
    });

    it('should generate cleanup recommendation when orphaned skills > 3', () => {
      const manyOrphans = [
        { name: 'a' }, { name: 'b' }, { name: 'c' },
        { name: 'd' }, { name: 'e' }
      ];
      const analysis = consolidator.analyzeRedundancy(manyOrphans);
      const cleanupRec = analysis.recommendations.find((r) => r.type === 'cleanup');
      expect(cleanupRec).toBeDefined();
      expect(cleanupRec.priority).toBe('low');
    });

    it('should not generate cleanup recommendation when orphaned skills <= 3', () => {
      const analysis = consolidator.analyzeRedundancy([
        { name: 'a' },
        { name: 'b' },
        { name: 'skill-creator' }
      ]);
      expect(analysis.recommendations.every((r) => r.type !== 'cleanup')).toBe(true);
    });
  });

  /* ========== _calculateOverlap ========== */

  describe('_calculateOverlap', () => {
    it('should return 0 for skills with no dependencies', () => {
      const a = { dependencies: [] };
      const b = [{ dependencies: [] }];
      expect(consolidator._calculateOverlap(a, b)).toBe(0);
    });

    it('should calculate correct overlap percentage', () => {
      const a = { dependencies: ['dep1', 'dep2'] };
      const b = [{ dependencies: ['dep1', 'dep3'] }];
      expect(consolidator._calculateOverlap(a, b)).toBe(33);
    });

    it('should return 0 when skill has no dependencies property', () => {
      const a = {};
      const b = [{}];
      expect(consolidator._calculateOverlap(a, b)).toBe(0);
    });
  });

  /* ========== _isCoreSkill ========== */

  describe('_isCoreSkill', () => {
    it('should return true for known core skills', () => {
      expect(consolidator._isCoreSkill({ name: 'skill-creator' })).toBe(true);
      expect(consolidator._isCoreSkill({ name: 'skill-manager' })).toBe(true);
      expect(consolidator._isCoreSkill({ name: 'skill-validator' })).toBe(true);
    });

    it('should return false for non-core skills', () => {
      expect(consolidator._isCoreSkill({ name: 'performance-optimization' })).toBe(false);
    });

    it('should match by id when name is absent', () => {
      expect(consolidator._isCoreSkill({ id: 'skill-loader' })).toBe(true);
      expect(consolidator._isCoreSkill({ id: 'random-skill' })).toBe(false);
    });
  });

  /* ========== mergeSkills ========== */

  describe('mergeSkills', () => {
    const primary = {
      name: 'performance-optimization',
      version: '2.0.0',
      features: ['caching'],
      dependencies: ['profiler'],
      config: { maxCache: 100 },
      metadata: { author: 'test' }
    };
    const secondary = {
      name: 'performance-tuning',
      features: ['profiling'],
      dependencies: ['tuner'],
      config: { threshold: 50 }
    };

    it('should merge features and dependencies', () => {
      const result = consolidator.mergeSkills(primary, [secondary]);
      expect(result.mergedSkill.features).toContain('caching');
      expect(result.mergedSkill.features).toContain('profiling');
      expect(result.mergedSkill.dependencies).toContain('profiler');
      expect(result.mergedSkill.dependencies).toContain('tuner');
    });

    it('should increment version in merged skill', () => {
      const result = consolidator.mergeSkills(primary, [secondary]);
      expect(result.mergedSkill.metadata.version).toBe('2.1.0');
    });

    it('should add merge metadata', () => {
      const result = consolidator.mergeSkills(primary, [secondary]);
      expect(result.mergedSkill.metadata.mergedFrom).toContain('performance-tuning');
      expect(result.mergedSkill.metadata.mergedAt).toBeDefined();
    });

    it('should record consolidation in non-dry-run mode', () => {
      consolidator.mergeSkills(primary, [secondary]);
      expect(consolidator.consolidations.length).toBe(1);
      expect(consolidator.consolidations[0].type).toBe('merge');
    });

    it('should not persist in dry-run mode', () => {
      consolidator.mergeSkills(primary, [secondary], { dryRun: true });
      expect(consolidator.consolidations).toHaveLength(0);
    });

    it('should report changes including added dependencies', () => {
      const result = consolidator.mergeSkills(primary, [secondary]);
      const depChanges = result.result.changes.filter((c) => c.type === 'dependency_added');
      expect(depChanges.length).toBeGreaterThan(0);
    });

    it('should report config changes from secondary', () => {
      const result = consolidator.mergeSkills(primary, [secondary]);
      const configChanges = result.result.changes.filter((c) => c.type === 'config_merged');
      expect(configChanges.length).toBeGreaterThan(0);
    });

    it('should handle empty features on secondary', () => {
      const noFeatures = [{ name: 'empty', dependencies: [] }];
      const result = consolidator.mergeSkills(primary, noFeatures);
      expect(result.mergedSkill.features).toEqual(['caching']);
    });

    it('should handle empty dependencies on secondary', () => {
      const noDeps = [{ name: 'empty', features: [] }];
      const result = consolidator.mergeSkills(primary, noDeps);
      expect(result.mergedSkill.dependencies).toEqual(['profiler']);
    });

    it('should handle secondary with no features/dependencies properties', () => {
      const sparse = [{ name: 'sparse' }];
      const result = consolidator.mergeSkills(primary, sparse);
      expect(result.success).toBe(true);
    });

    it('should default version to 1.0.0 when primary has no version', () => {
      const noVer = { name: 'test', features: [], dependencies: [] };
      const result = consolidator.mergeSkills(noVer, [secondary]);
      expect(result.mergedSkill.metadata.version).toBe('1.1.0');
    });

    it('should save data after successful merge', () => {
      jest.spyOn(consolidator, '_saveData');
      consolidator.mergeSkills(primary, [secondary]);
      expect(consolidator._saveData).toHaveBeenCalled();
    });
  });

  /* ========== establishHierarchy ========== */

  describe('establishHierarchy', () => {
    const parent = { name: 'security-hardening' };
    const children = [
      { name: 'cli-tool-security' },
      { name: 'mcp-security' }
    ];

    it('should create parent-child relationships', () => {
      const result = consolidator.establishHierarchy(parent, children);
      expect(result.hierarchy.primary).toBe('security-hardening');
      expect(result.hierarchy.children).toContain('cli-tool-security');
      expect(result.hierarchy.children).toContain('mcp-security');
    });

    it('should set relationship type to extends', () => {
      const result = consolidator.establishHierarchy(parent, children);
      expect(result.hierarchy.relationships[0].type).toBe('extends');
      expect(result.hierarchy.relationships[0].parent).toBe('security-hardening');
    });

    it('should record in consolidation history', () => {
      consolidator.establishHierarchy(parent, children);
      expect(consolidator.consolidations).toHaveLength(1);
      expect(consolidator.consolidations[0].type).toBe('hierarchy');
    });

    it('should handle empty children', () => {
      const result = consolidator.establishHierarchy(parent, []);
      expect(result.hierarchy.children).toEqual([]);
      expect(result.hierarchy.relationships).toEqual([]);
    });
  });

  /* ========== generateUnifiedExecutor ========== */

  describe('generateUnifiedExecutor', () => {
    it('should create executor with custom name', () => {
      const skills = [{ name: 'docx' }, { name: 'pdf' }];
      const executor = consolidator.generateUnifiedExecutor(skills, { name: 'DocExecutor' });
      expect(executor.name).toBe('DocExecutor');
    });

    it('should use default name when not provided', () => {
      const skills = [{ name: 'docx' }];
      const executor = consolidator.generateUnifiedExecutor(skills);
      expect(executor.name).toBe('UnifiedDocumentExecutor');
    });

    it('should collect supported actions from all skills', () => {
      const skills = [
        { name: 'docx', actions: ['create', 'export'] },
        { name: 'pdf', actions: ['convert', 'export'] }
      ];
      const executor = consolidator.generateUnifiedExecutor(skills);
      expect(executor.supportedActions).toContain('create');
      expect(executor.supportedActions).toContain('convert');
      expect(executor.supportedActions).toContain('export');
      expect(executor.supportedActions).toHaveLength(3);
    });

    it('should use default actions when skill has none', () => {
      const skills = [{ name: 'docx' }];
      const executor = consolidator.generateUnifiedExecutor(skills);
      expect(executor.supportedActions).toContain('create');
      expect(executor.supportedActions).toContain('read');
      expect(executor.supportedActions).toContain('update');
      expect(executor.supportedActions).toContain('delete');
      expect(executor.supportedActions).toContain('export');
    });

    it('should map implementations per skill', () => {
      const skills = [{ name: 'docx' }, { name: 'pdf' }];
      const executor = consolidator.generateUnifiedExecutor(skills);
      expect(executor.implementations.docx).toBeDefined();
      expect(executor.implementations.pdf).toBeDefined();
      expect(executor.implementations.docx.handler).toBe('docxHandler');
    });
  });

  /* ========== _extractSkillActions ========== */

  describe('_extractSkillActions', () => {
    it('should return skill actions when defined', () => {
      const skill = { actions: ['custom'] };
      expect(consolidator._extractSkillActions(skill)).toEqual(['custom']);
    });

    it('should return default actions when skill has no actions', () => {
      expect(consolidator._extractSkillActions({})).toEqual(['create', 'read', 'update', 'delete', 'export']);
    });
  });

  /* ========== _incrementVersion ========== */

  describe('_incrementVersion', () => {
    it('should increment patch by default', () => {
      expect(consolidator._incrementVersion('1.0.0')).toBe('1.0.1');
    });

    it('should increment minor', () => {
      expect(consolidator._incrementVersion('1.0.0', 'minor')).toBe('1.1.0');
    });

    it('should increment major', () => {
      expect(consolidator._incrementVersion('1.0.0', 'major')).toBe('2.0.0');
    });

    it('should reset sub-versions on major bump', () => {
      expect(consolidator._incrementVersion('2.5.3', 'major')).toBe('3.0.0');
    });

    it('should reset patch on minor bump', () => {
      expect(consolidator._incrementVersion('2.5.3', 'minor')).toBe('2.6.0');
    });
  });

  /* ========== getConsolidationHistory ========== */

  describe('getConsolidationHistory', () => {
    it('should return empty array initially', () => {
      expect(consolidator.getConsolidationHistory()).toEqual([]);
    });

    it('should return recorded consolidations', () => {
      consolidator.consolidations = [{ type: 'merge' }];
      expect(consolidator.getConsolidationHistory()).toHaveLength(1);
    });
  });

  /* ========== getRedundantGroups ========== */

  describe('getRedundantGroups', () => {
    it('should return all redundant groups', () => {
      const groups = consolidator.getRedundantGroups();
      expect(groups.length).toBeGreaterThan(0);
      expect(groups[0]).toHaveProperty('id');
      expect(groups[0]).toHaveProperty('skills');
    });
  });

  /* ========== generateReport ========== */

  describe('generateReport', () => {
    it('should return report with summary and analysis', () => {
      const report = consolidator.generateReport(defaultSkills);
      expect(report.summary.totalSkills).toBe(defaultSkills.length);
      expect(report.summary.redundantGroups).toBeGreaterThan(0);
      expect(report.summary.orphanedSkills).toBeGreaterThan(0);
      expect(report.summary.recommendations).toBeGreaterThan(0);
    });

    it('should include consolidation history (last 10)', () => {
      const report = consolidator.generateReport(defaultSkills);
      expect(report.history).toEqual([]);
    });

    it('should include timestamp in ISO format', () => {
      const report = consolidator.generateReport(defaultSkills);
      expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should handle empty skills array', () => {
      const report = consolidator.generateReport([]);
      expect(report.summary.totalSkills).toBe(0);
      expect(report.summary.redundantGroups).toBe(0);
    });
  });
});
