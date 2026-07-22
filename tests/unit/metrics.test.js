const { createSkillMetricsHandler } = require('../../src/skills/metrics');

describe('createSkillMetricsHandler', () => {
  let req, res, lines;

  beforeEach(() => {
    req = {};
    lines = [];
    res = {
      setHeader: jest.fn(),
      send: jest.fn((body) => { lines.push(body); })
    };
  });

  const makeSkillManager = (skills) => ({
    getAllSkills: () => skills
  });

  const makeMarketplace = (stats, categories) => ({
    getMarketplaceStats: () => stats,
    getCategories: () => categories
  });

  const makeSkillMetrics = (metrics) => ({
    getMetricsForPrometheus: () => metrics
  });

  it('handles null getAllSkills', () => {
    const handler = createSkillMetricsHandler({ getAllSkills: () => null }, null, null);
    expect(() => handler(req, res)).not.toThrow();
    expect(lines[0]).toContain('skills_total 0');
  });

  it('handles marketplace with zero stats and empty categories', () => {
    const skills = [];
    const marketplace = makeMarketplace(
      { totalSkills: 0, publishedSkills: 0, totalDownloads: 0, averageRating: 0 },
      []
    );
    const handler = createSkillMetricsHandler(makeSkillManager(skills), marketplace, null);
    handler(req, res);
    const output = lines[0];
    expect(output).toContain('marketplace_skills_total 0');
    expect(output).toContain('marketplace_published_skills 0');
    expect(output).toContain('marketplace_total_downloads 0');
    expect(output).toContain('marketplace_average_rating 0');
    expect(output).not.toContain('marketplace_skills_by_category');
  });

  it('handles null getCategories', () => {
    const skills = [];
    const marketplace = {
      getMarketplaceStats: () => ({ totalSkills: 5, publishedSkills: 2, totalDownloads: 10, averageRating: 3 }),
      getCategories: () => null
    };
    const handler = createSkillMetricsHandler(makeSkillManager(skills), marketplace, null);
    expect(() => handler(req, res)).not.toThrow();
  });

  it('handles empty bySkill objects', () => {
    const skills = [];
    const metrics = {
      executions: { total: 0, successful: 0, failed: 0, averageTime: 0, bySkill: {} },
      downloads: { total: 0, bySkill: {} },
      views: { total: 0 },
      errors: { total: 0 },
      performance: { cacheHits: 0, cacheMisses: 0, dockerExecutions: 0, localExecutions: 0 }
    };
    const handler = createSkillMetricsHandler(makeSkillManager(skills), null, makeSkillMetrics(metrics));
    handler(req, res);
    const output = lines[0];
    expect(output).not.toContain('skill_executions_by_skill');
    expect(output).not.toContain('skill_downloads_by_skill');
  });

  it('outputs basic skill counts', () => {
    const skills = [
      { name: 's1', enabled: true, riskLevel: 'low', pure: true, type: 'general' },
      { name: 's2', enabled: false, riskLevel: 'high', pure: false, type: 'specialized' }
    ];
    const handler = createSkillMetricsHandler(makeSkillManager(skills), null, null);
    handler(req, res);
    expect(res.send).toHaveBeenCalled();
    const output = lines[0];
    expect(output).toContain('skills_total 2');
    expect(output).toContain('skills_enabled 1');
    expect(output).toContain('skills_high_risk 1');
    expect(output).toContain('skills_pure_functions 1');
  });

  it('outputs marketplace stats when available', () => {
    const skills = [];
    const marketplace = makeMarketplace(
      { totalSkills: 10, publishedSkills: 5, totalDownloads: 100, averageRating: 4.5 },
      [{ name: 'AI', count: 3 }, { name: 'Data', count: 2 }]
    );
    const handler = createSkillMetricsHandler(makeSkillManager(skills), marketplace, null);
    handler(req, res);
    const output = lines[0];
    expect(output).toContain('marketplace_skills_total 10');
    expect(output).toContain('marketplace_published_skills 5');
    expect(output).toContain('marketplace_total_downloads 100');
    expect(output).toContain('marketplace_average_rating 4.5');
    expect(output).toContain('marketplace_skills_by_category{category="ai"} 3');
    expect(output).toContain('marketplace_skills_by_category{category="data"} 2');
  });

  it('handles marketplace stats error gracefully', () => {
    const skills = [];
    const marketplace = {
      getMarketplaceStats: () => { throw new Error('fail'); },
      getCategories: () => []
    };
    const handler = createSkillMetricsHandler(makeSkillManager(skills), marketplace, null);
    expect(() => handler(req, res)).not.toThrow();
  });

  it('outputs skill types breakdown', () => {
    const skills = [
      { name: 's1', type: 'general', riskLevel: 'low' },
      { name: 's2', type: 'specialized', riskLevel: 'low' },
      { name: 's3', type: 'general', riskLevel: 'low' }
    ];
    const handler = createSkillMetricsHandler(makeSkillManager(skills), null, null);
    handler(req, res);
    const output = lines[0];
    expect(output).toContain('skills_by_type{type="general"} 2');
    expect(output).toContain('skills_by_type{type="specialized"} 1');
  });

  it('outputs risk level distribution', () => {
    const skills = [
      { name: 's1', riskLevel: 'low' },
      { name: 's2', riskLevel: 'medium' },
      { name: 's3', riskLevel: 'high' },
      { name: 's4' }
    ];
    const handler = createSkillMetricsHandler(makeSkillManager(skills), null, null);
    handler(req, res);
    const output = lines[0];
    expect(output).toContain('skills_risk_distribution{level="low"} 2');
    expect(output).toContain('skills_risk_distribution{level="medium"} 1');
    expect(output).toContain('skills_risk_distribution{level="high"} 1');
  });

  it('outputs execution metrics when skillMetrics available', () => {
    const skills = [];
    const metrics = {
      executions: { total: 100, successful: 80, failed: 20, averageTime: 500, bySkill: { testSkill: 50 } },
      downloads: { total: 30, bySkill: { testSkill: 30 } },
      views: { total: 200 },
      errors: { total: 15 },
      performance: { cacheHits: 40, cacheMisses: 10, dockerExecutions: 5, localExecutions: 95 }
    };
    const handler = createSkillMetricsHandler(makeSkillManager(skills), null, makeSkillMetrics(metrics));
    handler(req, res);
    const output = lines[0];
    expect(output).toContain('skills_executions_total 100');
    expect(output).toContain('skills_executions_successful 80');
    expect(output).toContain('skills_executions_failed 20');
    expect(output).toContain('skills_execution_duration_ms 500');
    expect(output).toContain('skills_downloads_total 30');
    expect(output).toContain('skills_views_total 200');
    expect(output).toContain('skills_errors_total 15');
    expect(output).toContain('skill_executions_by_skill{skill="testskill"} 50');
    expect(output).toContain('skill_downloads_by_skill{skill="testskill"} 30');
    expect(output).toContain('skills_cache_hits_total 40');
    expect(output).toContain('skills_cache_misses_total 10');
    expect(output).toContain('skills_docker_executions_total 5');
    expect(output).toContain('skills_local_executions_total 95');
  });

  it('sets content type header', () => {
    const handler = createSkillMetricsHandler(makeSkillManager([]), null, null);
    handler(req, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  });
});
