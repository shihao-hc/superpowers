/**
 * Cost Dashboard
 * 成本可视化仪表盘
 */

class CostDashboard {
  constructor() {
    this.dataSources = new Map();
    this.widgets = new Map();
    this.reports = new Map();
  }

  // 添加数据源
  addDataSource(id, source) {
    this.dataSources.set(id, source);
  }

  // 获取仪表盘数据
  async getDashboard(tenantId, options = {}) {
    const { period = 'monthly', granularity = 'daily' } = options;

    const [
      overview,
      trends,
      breakdown,
      topConsumers,
      alerts,
      forecasts
    ] = await Promise.all([
      this._getOverview(tenantId, period),
      this._getTrends(tenantId, period, granularity),
      this._getBreakdown(tenantId, period),
      this._getTopConsumers(tenantId, period),
      this._getAlerts(tenantId),
      this._getForecast(tenantId, period)
    ]);

    return {
      overview,
      trends,
      breakdown,
      topConsumers,
      alerts,
      forecasts,
      period,
      generatedAt: new Date().toISOString()
    };
  }

  async _getOverview(tenantId, period) {
    // 从数据源获取概览
    const source = this.dataSources.get('cost');
    const data = source ? await source.getOverview(tenantId, period) : this._mockOverview(period);

    return {
      totalCost: data.totalCost,
      currency: 'USD',
      previousPeriod: data.previousPeriod,
      change: data.totalCost - data.previousPeriod,
      changePercent: data.previousPeriod > 0 
        ? ((data.totalCost - data.previousPeriod) / data.previousPeriod * 100).toFixed(1)
        : 0,
      projection: data.totalCost * (this._getDaysInPeriod(period) / this._getDaysElapsed(period)),
      budgetUsed: data.budgetUsed || 0,
      budgetTotal: data.budgetTotal || 0,
      budgetPercent: data.budgetTotal > 0 
        ? (data.budgetUsed / data.budgetTotal * 100).toFixed(1)
        : 0
    };
  }

  async _getTrends(tenantId, period, granularity) {
    const source = this.dataSources.get('cost');
    const data = source ? await source.getTrends(tenantId, period, granularity) : this._mockTrends(period, granularity);

    return {
      granularity,
      dataPoints: data.map(d => ({
        date: d.date,
        cost: d.cost,
        requests: d.requests,
        users: d.users
      })),
      sparklines: this._generateSparklines(data)
    };
  }

  async _getBreakdown(tenantId, period) {
    const source = this.dataSources.get('cost');
    const data = source ? await source.getBreakdown(tenantId, period) : this._mockBreakdown();

    return {
      byCategory: data.byCategory.map(c => ({
        category: c.category,
        cost: c.cost,
        percent: c.percent,
        trend: c.trend,
        color: this._getCategoryColor(c.category)
      })),
      byService: data.byService.map(s => ({
        service: s.service,
        cost: s.cost,
        percent: s.percent,
        category: s.category
      })),
      byRegion: data.byRegion || [],
      byTime: data.byTime || []
    };
  }

  async _getTopConsumers(tenantId, period) {
    const source = this.dataSources.get('cost');
    const data = source ? await source.getTopConsumers(tenantId, period) : this._mockTopConsumers();

    return {
      bySkill: data.bySkill.slice(0, 10).map((s, i) => ({
        rank: i + 1,
        skill: s.skill,
        cost: s.cost,
        requests: s.requests,
        avgCostPerRequest: s.cost / s.requests,
        trend: s.trend
      })),
      byUser: data.byUser.slice(0, 10).map((u, i) => ({
        rank: i + 1,
        userId: u.userId,
        userName: u.userName,
        cost: u.cost,
        requests: u.requests
      })),
      byProject: data.byProject?.slice(0, 10).map((p, i) => ({
        rank: i + 1,
        projectId: p.projectId,
        projectName: p.projectName,
        cost: p.cost,
        members: p.members
      })) || []
    };
  }

  async _getAlerts(tenantId) {
    return {
      budgetAlerts: [
        { level: 'warning', message: '本周成本已达预算的 75%', threshold: 75, current: 72 },
        { level: 'info', message: '模型调用成本较上周增长 15%', threshold: null, current: 15 }
      ],
      anomalies: [
        { type: 'spike', skill: 'medical-image-analysis', message: '检测到异常调用峰值', time: new Date().toISOString() }
      ],
      recommendations: [
        { priority: 'high', category: 'model', title: '考虑使用更小的模型', savings: '40%', effort: 'low' },
        { priority: 'medium', category: 'cache', title: '启用语义缓存', savings: '25%', effort: 'medium' }
      ]
    };
  }

  async _getForecast(tenantId, period) {
    const overview = await this._getOverview(tenantId, period);
    
    const dailyRate = overview.totalCost / this._getDaysElapsed(period);
    const daysRemaining = this._getDaysInPeriod(period) - this._getDaysElapsed(period);
    
    const projectedCost = overview.totalCost + (dailyRate * daysRemaining);
    const budgetOverage = overview.budgetTotal > 0 
      ? Math.max(0, projectedCost - overview.budgetTotal)
      : 0;

    return {
      projectedCost: Math.round(projectedCost * 100) / 100,
      confidence: Math.min(95, 50 + this._getDaysElapsed(period) * 2),
      onTrack: budgetOverage === 0,
      overage: Math.round(budgetOverage * 100) / 100,
      scenarios: {
        optimistic: Math.round(projectedCost * 0.8 * 100) / 100,
        expected: Math.round(projectedCost * 100) / 100,
        pessimistic: Math.round(projectedCost * 1.2 * 100) / 100
      }
    };
  }

  // 生成迷你图
  _generateSparklines(data) {
    if (data.length < 2) return null;

    const maxCost = Math.max(...data.map(d => d.cost));
    const minCost = Math.min(...data.map(d => d.cost));
    const range = maxCost - minCost || 1;

    return {
      cost: data.map(d => Math.round((d.cost - minCost) / range * 100)),
      requests: data.map(d => Math.round(d.requests / Math.max(...data.map(x => x.requests)) * 100)),
      trend: data[data.length - 1].cost > data[0].cost ? 'up' : 'down'
    };
  }

  // 生成报告
  async generateReport(tenantId, options = {}) {
    const { type = 'full', period = 'monthly', format = 'json' } = options;

    const dashboard = await this.getDashboard(tenantId, { period });

    const report = {
      id: `rpt_${Date.now()}`,
      type,
      period,
      generatedAt: new Date().toISOString(),
      summary: {
        totalCost: dashboard.overview.totalCost,
        periodOverPeriodChange: `${dashboard.overview.changePercent}%`,
        budgetStatus: dashboard.overview.budgetPercent < 100 ? 'within_budget' : 'over_budget',
        topCategory: dashboard.breakdown.byCategory[0]?.category || 'N/A'
      },
      details: dashboard
    };

    if (format === 'pdf') {
      return this._formatAsPDF(report);
    }

    return report;
  }

  _formatAsPDF(report) {
    // 简化实现
    return {
      format: 'pdf',
      data: report,
      pages: [
        { title: 'Executive Summary', content: report.summary },
        { title: 'Cost Overview', content: report.details.overview },
        { title: 'Breakdown', content: report.details.breakdown }
      ]
    };
  }

  // 辅助方法
  _getDaysInPeriod(period) {
    switch (period) {
      case 'daily': return 1;
      case 'weekly': return 7;
      case 'monthly': return 30;
      case 'quarterly': return 90;
      default: return 30;
    }
  }

  _getDaysElapsed(period) {
    const now = new Date();
    switch (period) {
      case 'daily': return now.getHours();
      case 'weekly': return now.getDay();
      case 'monthly': return now.getDate();
      case 'quarterly': return Math.floor((now.getMonth() % 3) * 30 + now.getDate());
      default: return 15;
    }
  }

  _getCategoryColor(category) {
    const colors = {
      'model-inference': '#8b5cf6',
      'skill-execution': '#3b82f6',
      'storage': '#10b981',
      'network': '#f59e0b',
      'compute': '#ef4444'
    };
    return colors[category] || '#6b7280';
  }

  // Mock数据
  _mockOverview(period) {
    return {
      totalCost: 15420.50,
      previousPeriod: 12800,
      budgetUsed: 15420.50,
      budgetTotal: 20000
    };
  }

  _mockTrends(period, granularity) {
    const days = granularity === 'daily' ? 30 : 4;
    const data = [];
    
    for (let i = 0; i < days; i++) {
      data.push({
        date: new Date(Date.now() - (days - i) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        cost: 400 + Math.random() * 300,
        requests: 1000 + Math.floor(Math.random() * 500),
        users: 50 + Math.floor(Math.random() * 20)
      });
    }
    
    return data;
  }

  _mockBreakdown() {
    return {
      byCategory: [
        { category: 'model-inference', cost: 8500, percent: 55, trend: 'up' },
        { category: 'skill-execution', cost: 4200, percent: 27, trend: 'stable' },
        { category: 'storage', cost: 1500, percent: 10, trend: 'down' },
        { category: 'network', cost: 720, percent: 5, trend: 'stable' },
        { category: 'compute', cost: 500, percent: 3, trend: 'down' }
      ],
      byService: [
        { service: 'GPT-4', cost: 5200, percent: 34, category: 'model-inference' },
        { service: 'Claude 3', cost: 2800, percent: 18, category: 'model-inference' },
        { service: 'Legal Skills', cost: 1800, percent: 12, category: 'skill-execution' },
        { service: 'Healthcare Skills', cost: 1500, percent: 10, category: 'skill-execution' }
      ]
    };
  }

  _mockTopConsumers() {
    return {
      bySkill: [
        { skill: 'medical-image-analysis', cost: 2800, requests: 1200, trend: 'up' },
        { skill: 'contract-review', cost: 1800, requests: 800, trend: 'stable' },
        { skill: 'stock-analysis', cost: 1200, requests: 600, trend: 'down' }
      ],
      byUser: [
        { userId: 'u1', userName: 'John Doe', cost: 2500, requests: 500 },
        { userId: 'u2', userName: 'Jane Smith', cost: 1800, requests: 400 }
      ]
    };
  }
}

module.exports = { CostDashboard };
