const fs = require('fs');

describe('WorkflowMarketplace', () => {
  let WorkflowMarketplace;
  let marketplace;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    WorkflowMarketplace = require('../../src/workflow/WorkflowMarketplace');
    WorkflowMarketplace = WorkflowMarketplace.WorkflowMarketplace || WorkflowMarketplace;
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    marketplace = new WorkflowMarketplace({ maxWorkflows: 10 });
    const result = marketplace.publishWorkflow({
      name: 'Test WF', author: 'tester', description: 'desc', category: 'general'
    });
    marketplace.WF_ID = result.id;
  });

  it('loads MCP templates', () => {
    expect(marketplace.mcpTemplates.size).toBe(4);
  });

  it('publishes version with bump', () => {
    const result = marketplace.publishVersion(marketplace.WF_ID, {});
    expect(result.success).toBe(true);
    expect(result.newVersion).toBe('1.0.1');
  });

  it('publishes version with custom version', () => {
    const result = marketplace.publishVersion(marketplace.WF_ID, { version: '2.0.0' });
    expect(result.success).toBe(true);
    expect(result.newVersion).toBe('2.0.0');
  });

  it('returns error for non-existent publishVersion', () => {
    expect(marketplace.publishVersion('none', {}).error).toBeDefined();
  });

  it('publishes workflow', () => {
    const result = marketplace.publishWorkflow({ name: 'My WF', author: 'me' });
    expect(result.id).toMatch(/^wf_/);
  });

  it('publishes workflow with sanitization', () => {
    const result = marketplace.publishWorkflow({ name: '<script>alert("xss")</script>' });
    expect(result.workflow.name).not.toContain('<');
  });

  it('rejects publish when name missing', () => {
    expect(marketplace.publishWorkflow({}).error).toContain('name');
  });

  it('rejects publish when marketplace full', () => {
    for (let i = 0; i < 9; i++) {
      const r = marketplace.publishWorkflow({ name: `WF_${i}` });
      expect(r.id).toBeDefined();
    }
    const result = marketplace.publishWorkflow({ name: 'Overflow' });
    expect(result.error).toContain('full');
  });

  it('updates workflow', () => {
    const result = marketplace.updateWorkflow(marketplace.WF_ID, { name: 'Updated', version: '2.0.0' });
    expect(result.workflow.name).toBe('Updated');
    expect(result.workflow.version).toBe('2.0.0');
  });

  it('returns error for update non-existent', () => {
    expect(marketplace.updateWorkflow('none', {}).error).toBeDefined();
  });

  it('downloads workflow', () => {
    const result = marketplace.downloadWorkflow(marketplace.WF_ID, 'user1');
    expect(result.workflow.name).toBe('Test WF');
    expect(marketplace.workflows.get(marketplace.WF_ID).downloads).toBe(1);
  });

  it('returns error for download non-existent', () => {
    expect(marketplace.downloadWorkflow('none', 'user1').error).toBeDefined();
  });

  it('rates workflow', () => {
    const result = marketplace.rateWorkflow(marketplace.WF_ID, 'user1', 4, 'Good');
    expect(result.rating).toBe(4);
    expect(result.reviewCount).toBe(1);
  });

  it('updates existing rating', () => {
    marketplace.rateWorkflow(marketplace.WF_ID, 'user1', 4);
    const result = marketplace.rateWorkflow(marketplace.WF_ID, 'user1', 5);
    expect(result.rating).toBe(5);
    expect(result.reviewCount).toBe(1);
  });

  it('clamps rating to 1-5', () => {
    const r1 = marketplace.rateWorkflow(marketplace.WF_ID, 'u1', 0);
    expect(r1.rating).toBe(1);
    const r2 = marketplace.rateWorkflow(marketplace.WF_ID, 'u2', 10);
    expect(r2.rating).toBe(3);
  });

  it('returns error for rate non-existent', () => {
    expect(marketplace.rateWorkflow('none', 'u1', 3).error).toBeDefined();
  });

  it('searches workflows by category', () => {
    marketplace.publishWorkflow({ name: 'Dev WF', category: 'development' });
    const results = marketplace.searchWorkflows({ category: 'development' });
    expect(results).toHaveLength(1);
  });

  it('searches workflows by keyword', () => {
    const results = marketplace.searchWorkflows({ keyword: 'Test' });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('searches workflows by author', () => {
    const results = marketplace.searchWorkflows({ author: 'tester' });
    expect(results).toHaveLength(1);
  });

  it('sorts workflows by downloads', () => {
    const results = marketplace.searchWorkflows({ sortBy: 'downloads' });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('sorts workflows by newest', () => {
    const results = marketplace.searchWorkflows({ sortBy: 'newest' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('sorts workflows by updated', () => {
    const results = marketplace.searchWorkflows({ sortBy: 'updated' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('registers plugin', () => {
    const result = marketplace.registerPlugin({ name: 'My Plugin' });
    expect(result.id).toMatch(/^plugin_/);
  });

  it('installs plugin', () => {
    const { id } = marketplace.registerPlugin({ name: 'P' });
    const result = marketplace.installPlugin(id);
    expect(result.success).toBe(true);
  });

  it('returns error for install non-existent plugin', () => {
    expect(marketplace.installPlugin('none').error).toBeDefined();
  });

  it('searches plugins', () => {
    marketplace.registerPlugin({ name: 'Alpha' });
    marketplace.registerPlugin({ name: 'Beta' });
    const results = marketplace.searchPlugins({ keyword: 'Alpha' });
    expect(results).toHaveLength(1);
  });

  it('gets workflow', () => {
    expect(marketplace.getWorkflow(marketplace.WF_ID).name).toBe('Test WF');
  });

  it('gets workflow versions', () => {
    expect(marketplace.getWorkflowVersions(marketplace.WF_ID)).toHaveLength(1);
    marketplace.publishVersion(marketplace.WF_ID, {});
    expect(marketplace.getWorkflowVersions(marketplace.WF_ID)).toHaveLength(2);
  });

  it('gets plugin', () => {
    const { id } = marketplace.registerPlugin({ name: 'P' });
    expect(marketplace.getPlugin(id).name).toBe('P');
  });

  it('gets user downloads', () => {
    marketplace.downloadWorkflow(marketplace.WF_ID, 'user1');
    expect(marketplace.getUserDownloads('user1')).toHaveLength(1);
  });

  it('gets stats', () => {
    const stats = marketplace.getStats();
    expect(stats.workflows.total).toBeGreaterThanOrEqual(1);
    expect(typeof stats.plugins.total).toBe('number');
  });

  it('serializes toJSON', () => {
    const json = marketplace.toJSON();
    expect(json.workflows).toHaveLength(1);
    expect(json.mcpTemplates.length).toBe(4);
  });

  it('gets MCP templates', () => {
    const templates = marketplace.getMCPTemplates();
    expect(templates.length).toBe(4);
  });

  it('filters MCP templates by category', () => {
    const templates = marketplace.getMCPTemplates({ category: 'devops' });
    expect(templates.length).toBeGreaterThanOrEqual(1);
  });

  it('searches MCP templates', () => {
    const templates = marketplace.getMCPTemplates({ search: '日志' });
    expect(templates.length).toBeGreaterThanOrEqual(1);
  });

  it('installMCPTemplate returns error when not found', () => {
    const result = marketplace.installMCPTemplate('nonexistent');
    expect(result.error).toBeDefined();
  });

  it('installAllMCPTemplates runs without crash', () => {
    const result = marketplace.installAllMCPTemplates();
    expect(result.total).toBe(4);
  });

  it('destroy clears all data', () => {
    marketplace.destroy();
    expect(marketplace.workflows.size).toBe(0);
    expect(marketplace.plugins.size).toBe(0);
  });

  it('handles version compare', () => {
    marketplace._parseVersion('1.2.3');
    expect(marketplace._compareVersions('1.0.0', '2.0.0')).toBeLessThan(0);
    expect(marketplace._compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0);
    expect(marketplace._compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('bumps version correctly', () => {
    expect(marketplace._bumpVersion('1.0.0', 'major')).toBe('2.0.0');
    expect(marketplace._bumpVersion('1.0.0', 'minor')).toBe('1.1.0');
    expect(marketplace._bumpVersion('1.0.0', 'patch')).toBe('1.0.1');
  });
});
