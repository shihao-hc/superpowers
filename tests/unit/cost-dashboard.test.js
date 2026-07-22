const { CostDashboard } = require('../../src/cost/CostDashboard');

describe('CostDashboard', () => {
  let dashboard;

  beforeEach(() => {
    dashboard = new CostDashboard();
  });

  describe('constructor', () => {
    it('initializes dataSources as empty Map', () => {
      expect(dashboard.dataSources).toBeInstanceOf(Map);
      expect(dashboard.dataSources.size).toBe(0);
    });

    it('initializes widgets as empty Map', () => {
      expect(dashboard.widgets).toBeInstanceOf(Map);
      expect(dashboard.widgets.size).toBe(0);
    });

    it('initializes reports as empty Map', () => {
      expect(dashboard.reports).toBeInstanceOf(Map);
      expect(dashboard.reports.size).toBe(0);
    });
  });

  describe('addDataSource', () => {
    it('stores data source by ID', () => {
      const source = { getOverview: jest.fn() };
      dashboard.addDataSource('cost', source);
      expect(dashboard.dataSources.get('cost')).toBe(source);
    });

    it('replaces existing source with same ID', () => {
      dashboard.addDataSource('cost', { getOverview: jest.fn() });
      const newSource = { getOverview: jest.fn().mockResolvedValue({ totalCost: 999 }) };
      dashboard.addDataSource('cost', newSource);
      expect(dashboard.dataSources.get('cost')).toBe(newSource);
    });
  });

  describe('getDashboard', () => {
    it('returns complete dashboard object with all sections', async () => {
      const result = await dashboard.getDashboard('tenant1');
      expect(result).toHaveProperty('overview');
      expect(result).toHaveProperty('trends');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('topConsumers');
      expect(result).toHaveProperty('alerts');
      expect(result).toHaveProperty('forecasts');
      expect(result).toHaveProperty('period');
      expect(result).toHaveProperty('generatedAt');
    });

    it('defaults to monthly period and daily granularity', async () => {
      const result = await dashboard.getDashboard('tenant1');
      expect(result.period).toBe('monthly');
      expect(result.trends.granularity).toBe('daily');
    });

    it('accepts weekly period', async () => {
      const result = await dashboard.getDashboard('tenant1', { period: 'weekly', granularity: 'daily' });
      expect(result.period).toBe('weekly');
    });

    it('accepts daily period', async () => {
      const result = await dashboard.getDashboard('tenant1', { period: 'daily', granularity: 'hourly' });
      expect(result.period).toBe('daily');
    });

    it('generates generatedAt as ISO string', async () => {
      const result = await dashboard.getDashboard('tenant1');
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('_getOverview', () => {
    it('returns overview with totalCost and budget data', async () => {
      const overview = await dashboard._getOverview('tenant1', 'monthly');
      expect(overview).toHaveProperty('totalCost');
      expect(overview).toHaveProperty('currency', 'USD');
      expect(overview).toHaveProperty('previousPeriod');
      expect(overview).toHaveProperty('change');
      expect(overview).toHaveProperty('changePercent');
      expect(overview).toHaveProperty('projection');
      expect(overview).toHaveProperty('budgetUsed');
      expect(overview).toHaveProperty('budgetTotal');
      expect(overview).toHaveProperty('budgetPercent');
    });

    it('calculates change as diff from previous period', async () => {
      const overview = await dashboard._getOverview('tenant1', 'monthly');
      expect(overview.change).toBe(overview.totalCost - overview.previousPeriod);
    });

    it('returns 0 for changePercent when previousPeriod is 0', async () => {
      const mockSource = {
        getOverview: jest.fn().mockResolvedValue({ totalCost: 100, previousPeriod: 0, budgetUsed: 0, budgetTotal: 0 })
      };
      dashboard.addDataSource('cost', mockSource);
      const overview = await dashboard._getOverview('tenant1', 'monthly');
      expect(overview.changePercent).toBe(0);
    });

    it('returns 0 for budgetPercent when budgetTotal is 0', async () => {
      const mockSource = {
        getOverview: jest.fn().mockResolvedValue({ totalCost: 100, previousPeriod: 50, budgetUsed: 100, budgetTotal: 0 })
      };
      dashboard.addDataSource('cost', mockSource);
      const overview = await dashboard._getOverview('tenant1', 'monthly');
      expect(overview.budgetPercent).toBe(0);
    });
  });

  describe('_getTrends', () => {
    it('returns dataPoints array with date, cost, requests, users', async () => {
      const trends = await dashboard._getTrends('tenant1', 'monthly', 'daily');
      expect(trends.dataPoints).toBeInstanceOf(Array);
      expect(trends.dataPoints.length).toBeGreaterThan(0);
      expect(trends.dataPoints[0]).toHaveProperty('date');
      expect(trends.dataPoints[0]).toHaveProperty('cost');
      expect(trends.dataPoints[0]).toHaveProperty('requests');
      expect(trends.dataPoints[0]).toHaveProperty('users');
    });

    it('returns specified granularity', async () => {
      const trends = await dashboard._getTrends('tenant1', 'monthly', 'hourly');
      expect(trends.granularity).toBe('hourly');
    });

    it('generates sparklines', async () => {
      const trends = await dashboard._getTrends('tenant1', 'monthly', 'daily');
      expect(trends.sparklines).toBeDefined();
      expect(trends.sparklines).toHaveProperty('cost');
      expect(trends.sparklines).toHaveProperty('requests');
      expect(trends.sparklines).toHaveProperty('trend');
    });
  });

  describe('_getBreakdown', () => {
    it('returns byCategory with category, cost, percent, trend, color', async () => {
      const breakdown = await dashboard._getBreakdown('tenant1', 'monthly');
      expect(breakdown.byCategory).toBeInstanceOf(Array);
      expect(breakdown.byCategory.length).toBeGreaterThan(0);
      expect(breakdown.byCategory[0]).toHaveProperty('category');
      expect(breakdown.byCategory[0]).toHaveProperty('cost');
      expect(breakdown.byCategory[0]).toHaveProperty('percent');
      expect(breakdown.byCategory[0]).toHaveProperty('trend');
      expect(breakdown.byCategory[0]).toHaveProperty('color');
    });

    it('returns byService array', async () => {
      const breakdown = await dashboard._getBreakdown('tenant1', 'monthly');
      expect(breakdown.byService).toBeInstanceOf(Array);
      expect(breakdown.byService.length).toBeGreaterThan(0);
    });

    it('includes byRegion and byTime as empty arrays by default', async () => {
      const breakdown = await dashboard._getBreakdown('tenant1', 'monthly');
      expect(breakdown.byRegion).toBeInstanceOf(Array);
      expect(breakdown.byTime).toBeInstanceOf(Array);
    });
  });

  describe('_getTopConsumers', () => {
    it('returns bySkill with rank, cost, requests, avgCostPerRequest, trend', async () => {
      const consumers = await dashboard._getTopConsumers('tenant1', 'monthly');
      expect(consumers.bySkill).toBeInstanceOf(Array);
      expect(consumers.bySkill.length).toBeGreaterThan(0);
      expect(consumers.bySkill[0]).toHaveProperty('rank');
      expect(consumers.bySkill[0]).toHaveProperty('skill');
      expect(consumers.bySkill[0]).toHaveProperty('cost');
      expect(consumers.bySkill[0]).toHaveProperty('requests');
      expect(consumers.bySkill[0]).toHaveProperty('avgCostPerRequest');
      expect(consumers.bySkill[0]).toHaveProperty('trend');
    });

    it('limits bySkill to 10 items', async () => {
      const consumers = await dashboard._getTopConsumers('tenant1', 'monthly');
      expect(consumers.bySkill.length).toBeLessThanOrEqual(10);
    });

    it('returns byUser array', async () => {
      const consumers = await dashboard._getTopConsumers('tenant1', 'monthly');
      expect(consumers.byUser).toBeInstanceOf(Array);
      expect(consumers.byUser.length).toBeGreaterThan(0);
      expect(consumers.byUser[0]).toHaveProperty('userId');
      expect(consumers.byUser[0]).toHaveProperty('userName');
      expect(consumers.byUser[0]).toHaveProperty('cost');
      expect(consumers.byUser[0]).toHaveProperty('requests');
    });

    it('returns byProject as array (falls back to empty when no data)', async () => {
      const consumers = await dashboard._getTopConsumers('tenant1', 'monthly');
      expect(consumers.byProject).toBeInstanceOf(Array);
      expect(consumers.byProject).toHaveLength(0);
    });

    it('maps byProject data when provided by data source', async () => {
      const mockSource = {
        getOverview: jest.fn().mockResolvedValue({ totalCost: 5000, previousPeriod: 4000, budgetUsed: 5000, budgetTotal: 10000 }),
        getTrends: jest.fn().mockResolvedValue([]),
        getBreakdown: jest.fn().mockResolvedValue({ byCategory: [], byService: [] }),
        getTopConsumers: jest.fn().mockResolvedValue({
          bySkill: [], byUser: [],
          byProject: [
            { projectId: 'p1', projectName: 'Alpha', cost: 2000, members: 5 },
            { projectId: 'p2', projectName: 'Beta', cost: 1500, members: 3 }
          ]
        })
      };
      dashboard.addDataSource('cost', mockSource);
      const result = await dashboard.getDashboard('tenant1');
      expect(result.topConsumers.byProject).toHaveLength(2);
      expect(result.topConsumers.byProject[0]).toHaveProperty('rank', 1);
      expect(result.topConsumers.byProject[0]).toHaveProperty('projectName', 'Alpha');
      expect(result.topConsumers.byProject[0]).toHaveProperty('members', 5);
    });
  });

  describe('_getAlerts', () => {
    it('returns budgetAlerts array', async () => {
      const alerts = await dashboard._getAlerts('tenant1');
      expect(alerts.budgetAlerts).toBeInstanceOf(Array);
      expect(alerts.budgetAlerts.length).toBeGreaterThan(0);
      expect(alerts.budgetAlerts[0]).toHaveProperty('level');
      expect(alerts.budgetAlerts[0]).toHaveProperty('message');
    });

    it('returns anomalies array', async () => {
      const alerts = await dashboard._getAlerts('tenant1');
      expect(alerts.anomalies).toBeInstanceOf(Array);
      expect(alerts.anomalies[0]).toHaveProperty('type');
      expect(alerts.anomalies[0]).toHaveProperty('skill');
    });

    it('returns recommendations array with priority and category', async () => {
      const alerts = await dashboard._getAlerts('tenant1');
      expect(alerts.recommendations).toBeInstanceOf(Array);
      expect(alerts.recommendations[0]).toHaveProperty('priority');
      expect(alerts.recommendations[0]).toHaveProperty('category');
      expect(alerts.recommendations[0]).toHaveProperty('title');
      expect(alerts.recommendations[0]).toHaveProperty('savings');
      expect(alerts.recommendations[0]).toHaveProperty('effort');
    });
  });

  describe('_getForecast', () => {
    it('returns projectedCost, confidence, onTrack, overage, scenarios', async () => {
      const forecast = await dashboard._getForecast('tenant1', 'monthly');
      expect(forecast).toHaveProperty('projectedCost');
      expect(forecast).toHaveProperty('confidence');
      expect(forecast).toHaveProperty('onTrack');
      expect(forecast).toHaveProperty('overage');
      expect(forecast).toHaveProperty('scenarios');
    });

    it('scenarios include optimistic, expected, pessimistic', async () => {
      const forecast = await dashboard._getForecast('tenant1', 'monthly');
      expect(forecast.scenarios).toHaveProperty('optimistic');
      expect(forecast.scenarios).toHaveProperty('expected');
      expect(forecast.scenarios).toHaveProperty('pessimistic');
      expect(forecast.scenarios.optimistic).toBeLessThan(forecast.scenarios.expected);
      expect(forecast.scenarios.expected).toBeLessThan(forecast.scenarios.pessimistic);
    });

    it('handles zero budgetTotal (budgetOverage false branch)', async () => {
      const mockSource = {
        getOverview: jest.fn().mockResolvedValue({ totalCost: 100, previousPeriod: 50, budgetUsed: 0, budgetTotal: 0 }),
        getTrends: jest.fn().mockResolvedValue([]),
        getBreakdown: jest.fn().mockResolvedValue({ byCategory: [], byService: [] }),
        getTopConsumers: jest.fn().mockResolvedValue({ bySkill: [], byUser: [] })
      };
      dashboard.addDataSource('cost', mockSource);
      const forecast = await dashboard._getForecast('tenant1', 'monthly');
      expect(forecast.overage).toBe(0);
    });

    it('confidence increases with days elapsed', async () => {
      const forecast = await dashboard._getForecast('tenant1', 'monthly');
      expect(forecast.confidence).toBeGreaterThanOrEqual(50);
      expect(forecast.confidence).toBeLessThanOrEqual(95);
    });
  });

  describe('using data source', () => {
    it('uses registered data source for getOverview', async () => {
      const mockSource = {
        getOverview: jest.fn().mockResolvedValue({ totalCost: 5000, previousPeriod: 4000, budgetUsed: 5000, budgetTotal: 10000 }),
        getTrends: jest.fn().mockResolvedValue([]),
        getBreakdown: jest.fn().mockResolvedValue({ byCategory: [], byService: [] }),
        getTopConsumers: jest.fn().mockResolvedValue({ bySkill: [], byUser: [] })
      };
      dashboard.addDataSource('cost', mockSource);
      const result = await dashboard.getDashboard('tenant1');
      expect(mockSource.getOverview).toHaveBeenCalledWith('tenant1', 'monthly');
      expect(result.overview.totalCost).toBe(5000);
    });

    it('uses registered data source for getTrends', async () => {
      const mockSource = {
        getOverview: jest.fn().mockResolvedValue({ totalCost: 5000, previousPeriod: 4000, budgetUsed: 5000, budgetTotal: 10000 }),
        getTrends: jest.fn().mockResolvedValue([{ date: '2026-01-01', cost: 100, requests: 10, users: 5 }]),
        getBreakdown: jest.fn().mockResolvedValue({ byCategory: [], byService: [] }),
        getTopConsumers: jest.fn().mockResolvedValue({ bySkill: [], byUser: [] })
      };
      dashboard.addDataSource('cost', mockSource);
      const result = await dashboard.getDashboard('tenant1');
      expect(mockSource.getTrends).toHaveBeenCalledWith('tenant1', 'monthly', 'daily');
      expect(result.trends.dataPoints).toHaveLength(1);
    });

    it('falls back to mock data when no source', async () => {
      const result = await dashboard.getDashboard('tenant1');
      expect(result.overview.totalCost).toBe(15420.50);
      expect(result.breakdown.byCategory).toHaveLength(5);
    });
  });

  describe('_generateSparklines', () => {
    it('returns null for data with fewer than 2 points', () => {
      expect(dashboard._generateSparklines([{ cost: 100, requests: 10 }])).toBeNull();
    });

    it('returns sparklines object for data with 2+ points', () => {
      const data = [
        { cost: 100, requests: 10, users: 5 },
        { cost: 200, requests: 20, users: 10 }
      ];
      const sparklines = dashboard._generateSparklines(data);
      expect(sparklines).toHaveProperty('cost');
      expect(sparklines).toHaveProperty('requests');
      expect(sparklines).toHaveProperty('trend');
    });

    it('trend is up when last cost > first cost', () => {
      const data = [
        { cost: 100, requests: 10, users: 5 },
        { cost: 200, requests: 20, users: 10 }
      ];
      const sparklines = dashboard._generateSparklines(data);
      expect(sparklines.trend).toBe('up');
    });

    it('trend is down when last cost < first cost', () => {
      const data = [
        { cost: 200, requests: 20, users: 10 },
        { cost: 100, requests: 10, users: 5 }
      ];
      const sparklines = dashboard._generateSparklines(data);
      expect(sparklines.trend).toBe('down');
    });

    it('cost values are percentages between 0-100', () => {
      const data = [
        { cost: 100, requests: 10, users: 5 },
        { cost: 200, requests: 20, users: 10 },
        { cost: 150, requests: 15, users: 8 }
      ];
      const sparklines = dashboard._generateSparklines(data);
      sparklines.cost.forEach(v => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      });
    });

    it('handles zero range (all costs equal, falls back to 1)', () => {
      const data = [
        { cost: 100, requests: 10, users: 5 },
        { cost: 100, requests: 10, users: 5 },
        { cost: 100, requests: 10, users: 5 }
      ];
      const sparklines = dashboard._generateSparklines(data);
      expect(sparklines.cost).toEqual([0, 0, 0]);
      expect(sparklines.trend).toBe('down');
    });
  });

  describe('generateReport', () => {
    it('generates report with rpt_ prefix ID', async () => {
      const report = await dashboard.generateReport('tenant1');
      expect(report.id).toMatch(/^rpt_/);
    });

    it('includes summary with totalCost and budget status', async () => {
      const report = await dashboard.generateReport('tenant1');
      expect(report.summary).toHaveProperty('totalCost');
      expect(report.summary).toHaveProperty('periodOverPeriodChange');
      expect(report.summary).toHaveProperty('budgetStatus');
      expect(report.summary).toHaveProperty('topCategory');
    });

    it('defaults to json format and full type', async () => {
      const report = await dashboard.generateReport('tenant1');
      expect(report.type).toBe('full');
    });

    it('returns PDF format when format=pdf', async () => {
      const report = await dashboard.generateReport('tenant1', { format: 'pdf' });
      expect(report.format).toBe('pdf');
      expect(report.pages).toBeInstanceOf(Array);
      expect(report.pages[0]).toHaveProperty('title');
      expect(report.pages[0]).toHaveProperty('content');
    });

    it('returns report object when format=json', async () => {
      const report = await dashboard.generateReport('tenant1', { format: 'json' });
      expect(report.format).toBeUndefined();
      expect(report.id).toBeDefined();
      expect(report.details).toBeDefined();
    });

    it('includes generatedAt as ISO string', async () => {
      const report = await dashboard.generateReport('tenant1');
      expect(report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('marks budget over_budget when budgetPercent >= 100', async () => {
      const mockSource = {
        getOverview: jest.fn().mockResolvedValue({ totalCost: 20000, previousPeriod: 10000, budgetUsed: 20000, budgetTotal: 10000 }),
        getTrends: jest.fn().mockResolvedValue([{ date: '2026-01-01', cost: 500, requests: 100, users: 10 }]),
        getBreakdown: jest.fn().mockResolvedValue({ byCategory: [], byService: [] }),
        getTopConsumers: jest.fn().mockResolvedValue({ bySkill: [], byUser: [] })
      };
      dashboard.addDataSource('cost', mockSource);
      const report = await dashboard.generateReport('tenant1');
      expect(report.summary.budgetStatus).toBe('over_budget');
    });

    it('falls back to N/A topCategory when byCategory is empty', async () => {
      const mockSource = {
        getOverview: jest.fn().mockResolvedValue({ totalCost: 1000, previousPeriod: 800, budgetUsed: 1000, budgetTotal: 2000 }),
        getTrends: jest.fn().mockResolvedValue([]),
        getBreakdown: jest.fn().mockResolvedValue({ byCategory: [], byService: [] }),
        getTopConsumers: jest.fn().mockResolvedValue({ bySkill: [], byUser: [] })
      };
      dashboard.addDataSource('cost', mockSource);
      const report = await dashboard.generateReport('tenant1');
      expect(report.summary.topCategory).toBe('N/A');
    });
  });

  describe('_getDaysInPeriod', () => {
    it('returns 1 for daily', () => {
      expect(dashboard._getDaysInPeriod('daily')).toBe(1);
    });

    it('returns 7 for weekly', () => {
      expect(dashboard._getDaysInPeriod('weekly')).toBe(7);
    });

    it('returns 30 for monthly', () => {
      expect(dashboard._getDaysInPeriod('monthly')).toBe(30);
    });

    it('returns 90 for quarterly', () => {
      expect(dashboard._getDaysInPeriod('quarterly')).toBe(90);
    });

    it('returns 30 for unknown period', () => {
      expect(dashboard._getDaysInPeriod('yearly')).toBe(30);
    });
  });

  describe('_getDaysElapsed', () => {
    it('returns a number for quarterly period', () => {
      const result = dashboard._getDaysElapsed('quarterly');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(result)).toBe(true);
    });

    it('returns 15 for unknown period', () => {
      expect(dashboard._getDaysElapsed('yearly')).toBe(15);
    });
  });

  describe('_getCategoryColor', () => {
    it('returns purple for model-inference', () => {
      expect(dashboard._getCategoryColor('model-inference')).toBe('#8b5cf6');
    });

    it('returns blue for skill-execution', () => {
      expect(dashboard._getCategoryColor('skill-execution')).toBe('#3b82f6');
    });

    it('returns green for storage', () => {
      expect(dashboard._getCategoryColor('storage')).toBe('#10b981');
    });

    it('returns yellow for network', () => {
      expect(dashboard._getCategoryColor('network')).toBe('#f59e0b');
    });

    it('returns red for compute', () => {
      expect(dashboard._getCategoryColor('compute')).toBe('#ef4444');
    });

    it('returns gray for unknown category', () => {
      expect(dashboard._getCategoryColor('unknown')).toBe('#6b7280');
    });
  });
});
