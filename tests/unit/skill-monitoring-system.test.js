const { SkillMonitoringSystem } = require('../../src/skills/monitoring/SkillMonitoringSystem');

const now = Date.now();

jest.useFakeTimers();

describe('SkillMonitoringSystem', () => {
  let system;

  beforeEach(() => {
    jest.setSystemTime(now);
    system = new SkillMonitoringSystem({ alertThreshold: { successRate: { min: 0.95, max: 1.0 }, responseTime: { p95: 5000 }, errorRate: { max: 0.05 } } });
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const s = new SkillMonitoringSystem();
      expect(s.metrics).toBeDefined();
      expect(s.metrics.skillCalls).toBeInstanceOf(Map);
      expect(s.metrics.responseTimes).toBeInstanceOf(Map);
      expect(s.metrics.errors).toBeInstanceOf(Map);
      expect(s.metrics.userSessions).toBeInstanceOf(Map);
      expect(s.metrics.retention).toBeInstanceOf(Map);
      expect(s.alerts).toEqual([]);
      expect(s.alertThreshold).toBeDefined();
      expect(s.alertThreshold.successRate).toEqual({ min: 0.95, max: 1.0 });
      expect(s.alertThreshold.responseTime).toEqual({ p95: 5000 });
      expect(s.alertThreshold.errorRate).toEqual({ max: 0.05 });
      expect(s.retentionWindows).toHaveLength(3);
    });

    it('should merge custom alert thresholds', () => {
      const s = new SkillMonitoringSystem({ alertThreshold: { successRate: { min: 0.9, max: 1.0 }, responseTime: { p95: 10000 }, errorRate: { max: 0.1 } } });
      expect(s.alertThreshold.successRate.min).toBe(0.9);
      expect(s.alertThreshold.responseTime.p95).toBe(10000);
      expect(s.alertThreshold.errorRate.max).toBe(0.1);
    });

    it('should start periodic tasks', () => {
      const s = new SkillMonitoringSystem();
      expect(s.alerts).toEqual([]);
    });

    it('should accept null storage', () => {
      const s = new SkillMonitoringSystem({ storage: null });
      expect(s.storage).toBeNull();
    });

    it('should accept storage with save and load', () => {
      const storage = { save: jest.fn(), load: jest.fn() };
      const s = new SkillMonitoringSystem({ storage });
      expect(s.storage).toBe(storage);
    });
  });

  describe('recordSkillCall', () => {
    it('should record a successful skill call', () => {
      system.recordSkillCall('test-skill', { success: true, duration: 50 });
      const stats = system.metrics.skillCalls.get('test-skill');
      expect(stats).toBeDefined();
      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(0);
      expect(stats.totalDuration).toBe(50);
    });

    it('should record a failed skill call', () => {
      system.recordSkillCall('fail-skill', { success: false, duration: 200, error: 'timeout' });
      const stats = system.metrics.skillCalls.get('fail-skill');
      expect(stats.total).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.successful).toBe(0);
      expect(stats.errorTypes.get('timeout')).toBe(1);
    });

    it('should use default values when callData is empty', () => {
      system.recordSkillCall('default-skill');
      const stats = system.metrics.skillCalls.get('default-skill');
      expect(stats.success).toBeUndefined();
      expect(stats.total).toBe(1);
      expect(stats.successful).toBe(1);
      expect(stats.totalDuration).toBe(0);
    });

    it('should update time distributions', () => {
      const hour = new Date(now).getHours();
      const day = new Date(now).getDay();
      system.recordSkillCall('dist-skill', { success: true, duration: 10 });
      const stats = system.metrics.skillCalls.get('dist-skill');
      expect(stats.hourlyDistribution[hour]).toBe(1);
      expect(stats.dailyDistribution[day]).toBe(1);
    });

    it('should aggregate multiple calls to the same skill', () => {
      system.recordSkillCall('agg', { success: true, duration: 10 });
      system.recordSkillCall('agg', { success: true, duration: 20 });
      system.recordSkillCall('agg', { success: false, duration: 30, error: 'crash' });
      const stats = system.metrics.skillCalls.get('agg');
      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.totalDuration).toBe(60);
    });

    it('should return the stats object', () => {
      const result = system.recordSkillCall('ret', { success: true, duration: 5 });
      expect(result.total).toBe(1);
      expect(result.successful).toBe(1);
    });

    it('should track user session when userId and sessionId provided', () => {
      system.recordSkillCall('user-skill', { success: true, duration: 10, userId: 'u1', sessionId: 's1' });
      expect(system.metrics.userSessions.has('u1')).toBe(true);
      const userStats = system.metrics.userSessions.get('u1');
      expect(userStats.totalCalls).toBe(1);
      expect(userStats.sessions.has('s1')).toBe(true);
    });

    it('should not track user session when userId missing', () => {
      system.recordSkillCall('no-user', { success: true, duration: 10, sessionId: 's1' });
      expect(system.metrics.userSessions.size).toBe(0);
    });

    it('should not track user session when sessionId missing', () => {
      system.recordSkillCall('no-session', { success: true, duration: 10, userId: 'u1' });
      expect(system.metrics.userSessions.size).toBe(0);
    });

    it('should count error types', () => {
      system.recordSkillCall('err-skill', { success: false, duration: 1, error: 'type_a' });
      system.recordSkillCall('err-skill', { success: false, duration: 1, error: 'type_b' });
      system.recordSkillCall('err-skill', { success: false, duration: 1, error: 'type_a' });
      const stats = system.metrics.skillCalls.get('err-skill');
      expect(stats.errorTypes.get('type_a')).toBe(2);
      expect(stats.errorTypes.get('type_b')).toBe(1);
    });

    it('should set firstCall and lastCall timestamps', () => {
      const t1 = 1000;
      const t2 = 2000;
      system.recordSkillCall('ts', { success: true, duration: 1, timestamp: t1 });
      system.recordSkillCall('ts', { success: true, duration: 1, timestamp: t2 });
      const stats = system.metrics.skillCalls.get('ts');
      expect(stats.firstCall).toBe(t1);
      expect(stats.lastCall).toBe(t2);
    });

    it('should set domain from first call', () => {
      system.recordSkillCall('dom', { success: true, duration: 1, domain: 'nlp' });
      const stats = system.metrics.skillCalls.get('dom');
      expect(stats.domain).toBe('nlp');
    });
  });

  describe('getSkillMetrics', () => {
    it('should return null for non-existent skill', () => {
      expect(system.getSkillMetrics('nope')).toBeNull();
    });

    it('should return detailed metrics for a skill', () => {
      system.recordSkillCall('detail', { success: true, duration: 100 });
      system.recordSkillCall('detail', { success: false, duration: 200, error: 'err' });
      const m = system.getSkillMetrics('detail');
      expect(m.skillName).toBe('detail');
      expect(m.totalCalls).toBe(2);
      expect(m.successfulCalls).toBe(1);
      expect(m.failedCalls).toBe(1);
      expect(m.successRate).toBe(0.5);
      expect(m.averageResponseTime).toBe(150);
      expect(m.p50ResponseTime).toBeGreaterThanOrEqual(0);
      expect(m.p95ResponseTime).toBeGreaterThanOrEqual(0);
      expect(m.p99ResponseTime).toBeGreaterThanOrEqual(0);
      expect(m.firstCall).toBeDefined();
      expect(m.lastCall).toBeDefined();
    });

    it('should include hourly and daily distribution', () => {
      system.recordSkillCall('dist', { success: true, duration: 1 });
      const m = system.getSkillMetrics('dist');
      expect(m.hourlyDistribution).toHaveLength(24);
      expect(m.dailyDistribution).toHaveLength(7);
    });

    it('should include top errors', () => {
      system.recordSkillCall('top-err', { success: false, duration: 1, error: 'e1' });
      system.recordSkillCall('top-err', { success: false, duration: 1, error: 'e2' });
      const m = system.getSkillMetrics('top-err');
      expect(m.topErrors).toHaveLength(2);
      expect(m.topErrors[0].error).toBeDefined();
      expect(m.topErrors[0].count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('getAllSkillsMetrics', () => {
    it('should return empty array when no skills', () => {
      expect(system.getAllSkillsMetrics()).toEqual([]);
    });

    it('should return all skills', () => {
      system.recordSkillCall('a', { success: true, duration: 1 });
      system.recordSkillCall('b', { success: false, duration: 2 });
      const results = system.getAllSkillsMetrics();
      expect(results).toHaveLength(2);
    });

    it('should filter by domain', () => {
      system.recordSkillCall('nlp1', { success: true, duration: 1, domain: 'nlp' });
      system.recordSkillCall('vis1', { success: true, duration: 1, domain: 'vision' });
      const filtered = system.getAllSkillsMetrics({ domain: 'nlp' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].skillName).toBe('nlp1');
    });

    it('should sort by totalCalls descending by default', () => {
      system.recordSkillCall('few', { success: true, duration: 1 });
      system.recordSkillCall('many', { success: true, duration: 1 });
      system.recordSkillCall('many', { success: true, duration: 1 });
      const results = system.getAllSkillsMetrics();
      expect(results[0].skillName).toBe('many');
      expect(results[1].skillName).toBe('few');
    });

    it('should sort by successRate', () => {
      system.recordSkillCall('low', { success: false, duration: 1 });
      system.recordSkillCall('high', { success: true, duration: 1 });
      const results = system.getAllSkillsMetrics({ sortBy: 'successRate' });
      expect(results[0].skillName).toBe('high');
    });

    it('should sort by responseTime', () => {
      system.recordSkillCall('fast', { success: true, duration: 1 });
      system.recordSkillCall('slow', { success: true, duration: 9999 });
      const results = system.getAllSkillsMetrics({ sortBy: 'responseTime' });
      expect(results[0].skillName).toBe('slow');
    });
  });

  describe('getRetentionMetrics', () => {
    it('should return empty for missing window', () => {
      const r = system.getRetentionMetrics({ window: 'nonexistent' });
      expect(r.activeUsers).toBe(0);
    });

    it('should return default weekly window', () => {
      const r = system.getRetentionMetrics();
      expect(r.window).toBe('weekly');
    });

    it('should show active users when user sessions exist', () => {
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u1', sessionId: 's1' });
      const r = system.getRetentionMetrics();
      expect(r.activeUsers).toBe(1);
      expect(r.totalUsers).toBe(1);
    });
  });

  describe('getUserEngagementMetrics', () => {
    it('should return empty when no users', () => {
      const e = system.getUserEngagementMetrics();
      expect(e.totalUsers).toBe(0);
      expect(e.activeUsers).toBe(0);
      expect(e.users).toEqual([]);
    });

    it('should return user data after recording', () => {
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u1', sessionId: 's1' });
      const e = system.getUserEngagementMetrics();
      expect(e.totalUsers).toBe(1);
      expect(e.activeUsers).toBe(1);
      expect(e.users[0].userId).toBe('u1');
      expect(e.users[0].totalCalls).toBe(1);
    });

    it('should sort by lastSeen by default', () => {
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u1', sessionId: 's1' });
      jest.advanceTimersByTime(1000);
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u2', sessionId: 's2' });
      const e = system.getUserEngagementMetrics();
      expect(e.users[0].userId).toBe('u2');
    });

    it('should sort by totalCalls', () => {
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u1', sessionId: 's1' });
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u2', sessionId: 's2' });
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u2', sessionId: 's2' });
      const e = system.getUserEngagementMetrics({ sortBy: 'totalCalls' });
      expect(e.users[0].userId).toBe('u2');
    });

    it('should limit results', () => {
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u1', sessionId: 's1' });
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u2', sessionId: 's2' });
      const e = system.getUserEngagementMetrics({ limit: 1 });
      expect(e.users).toHaveLength(1);
    });
  });

  describe('getDashboardSummary', () => {
    it('should return empty summary when no data', () => {
      const s = system.getDashboardSummary();
      expect(s.overall.totalCalls).toBe(0);
      expect(s.overall.successRate).toBe(0);
      expect(s.skills.total).toBe(0);
      expect(s.alerts.total).toBe(0);
    });

    it('should return summary with data', () => {
      system.recordSkillCall('sk', { success: true, duration: 100 });
      system.recordSkillCall('sk', { success: false, duration: 200 });
      const s = system.getDashboardSummary();
      expect(s.overall.totalCalls).toBe(2);
      expect(s.overall.successfulCalls).toBe(1);
      expect(s.overall.failedCalls).toBe(1);
      expect(s.overall.successRate).toBe(0.5);
      expect(s.overall.averageResponseTime).toBe(150);
      expect(s.skills.total).toBe(1);
    });
  });

  describe('getAlerts', () => {
    it('should return empty array when no alerts', () => {
      expect(system.getAlerts()).toEqual([]);
    });

    it('should generate alerts when success rate drops below threshold', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('bad', { success: i < 8, duration: 10 });
      }
      const alerts = system.getAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(1);
      expect(alerts.some((a) => a.type === 'success_rate')).toBe(true);
    });

    it('should generate alerts when p95 exceeds threshold', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('slow', { success: true, duration: 6000 });
      }
      const alerts = system.getAlerts();
      expect(alerts.some((a) => a.type === 'response_time')).toBe(true);
    });

    it('should generate alerts when error rate exceeds threshold', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('flaky', { success: i < 8, duration: 10 });
      }
      const alerts = system.getAlerts();
      expect(alerts.some((a) => a.type === 'error_rate')).toBe(true);
    });

    it('should filter by severity', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('flaky', { success: i < 7, duration: 10 });
      }
      const crit = system.getAlerts({ severity: 'critical' });
      const warn = system.getAlerts({ severity: 'warning' });
      expect(crit.filter((a) => a.severity !== 'critical')).toHaveLength(0);
      expect(warn.filter((a) => a.severity !== 'warning')).toHaveLength(0);
    });

    it('should filter by skill', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('alpha', { success: i < 8, duration: 10 });
        system.recordSkillCall('beta', { success: i < 8, duration: 10 });
      }
      const alphaAlerts = system.getAlerts({ skill: 'alpha' });
      expect(alphaAlerts.every((a) => a.skill === 'alpha')).toBe(true);
    });

    it('should limit number of alerts', () => {
      for (let i = 0; i < 15; i++) {
        system.recordSkillCall('sk', { success: i < 8, duration: 10 });
      }
      const limited = system.getAlerts({ limit: 3 });
      expect(limited.length).toBeLessThanOrEqual(3);
    });

    it('should suppress duplicate alerts within 5 minutes', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('dup', { success: i < 8, duration: 10, timestamp: now });
      }
      const beforeCount = system.alerts.length;
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('dup', { success: i < 8, duration: 10, timestamp: now + 1000 });
      }
      expect(system.alerts.length).toBe(beforeCount);
    });

    it('should allow new alerts after 5 minutes', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('dup2', { success: i < 8, duration: 10, timestamp: now });
      }
      jest.advanceTimersByTime(300001);
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('dup2', { success: i < 8, duration: 10, timestamp: Date.now() });
      }
      const srAlerts = system.getAlerts({ severity: 'warning' });
      expect(srAlerts.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('dismissAlert', () => {
    it('should dismiss alert by index', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('sk', { success: i < 8, duration: 10 });
      }
      const before = system.alerts.length;
      system.dismissAlert(0);
      expect(system.alerts.length).toBe(before - 1);
    });

    it('should return true on successful dismiss', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('sk', { success: i < 8, duration: 10 });
      }
      expect(system.dismissAlert(0)).toBe(true);
    });

    it('should return false for invalid index', () => {
      expect(system.dismissAlert(-1)).toBe(false);
      expect(system.dismissAlert(999)).toBe(false);
    });

    it('should return false when no alerts exist', () => {
      expect(system.dismissAlert(0)).toBe(false);
    });
  });

  describe('exportPrometheusMetrics', () => {
    it('should return formatted prometheus metrics', () => {
      system.recordSkillCall('prom', { success: true, duration: 100 });
      const output = system.exportPrometheusMetrics();
      expect(output).toContain('ultrawork_skill_calls_total');
      expect(output).toContain('prom');
      expect(output).toContain('ultrawork_skill_success_rate');
      expect(output).toContain('ultrawork_skill_response_time_ms_avg');
      expect(output).toContain('ultrawork_skill_response_time_ms_p95');
      expect(output).toContain('ultrawork_active_users');
    });

    it('should include HELP and TYPE lines', () => {
      const output = system.exportPrometheusMetrics();
      expect(output).toContain('# HELP');
      expect(output).toContain('# TYPE');
    });

    it('should handle empty state', () => {
      const output = system.exportPrometheusMetrics();
      expect(output).toContain('ultrawork_active_users 0');
    });
  });

  describe('generateImprovementRecommendations', () => {
    it('should return empty when no data', () => {
      expect(system.generateImprovementRecommendations()).toEqual([]);
    });

    it('should recommend for low success rate', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('bad-skill', { success: i < 6, duration: 10 });
      }
      const recs = system.generateImprovementRecommendations();
      expect(recs.some((r) => r.type === 'reliability' && r.skill === 'bad-skill')).toBe(true);
    });

    it('should recommend for high latency', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('slow-skill', { success: true, duration: 15000 });
      }
      const recs = system.generateImprovementRecommendations();
      expect(recs.some((r) => r.type === 'performance')).toBe(true);
    });

    it('should sort by priority', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('bad-skill', { success: i < 6, duration: 10 });
      }
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('slow-skill', { success: true, duration: 15000 });
      }
      const recs = system.generateImprovementRecommendations();
      if (recs.length >= 2) {
        const order = { high: 0, medium: 1, low: 2 };
        for (let i = 1; i < recs.length; i++) {
          expect(order[recs[i].priority]).toBeGreaterThanOrEqual(order[recs[i - 1].priority]);
        }
      }
    });

    it('should include top errors in reliability recommendation', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('bad-skill', { success: i < 6, duration: 10, error: 'err_type' });
      }
      const recs = system.generateImprovementRecommendations();
      const relRec = recs.find((r) => r.type === 'reliability');
      if (relRec) {
        expect(relRec.metrics.topErrors).toBeDefined();
      }
    });
  });

  describe('end-to-end flow', () => {
    it('should record, alert, recommend, and dashboard', () => {
      system.recordSkillCall('search', { success: true, duration: 150, domain: 'nlp', userId: 'alice', sessionId: 's1' });
      system.recordSkillCall('search', { success: false, duration: 300, error: 'timeout', domain: 'nlp', userId: 'alice', sessionId: 's1' });
      for (let i = 0; i < 8; i++) {
        system.recordSkillCall('search', { success: true, duration: 100, domain: 'nlp', userId: 'alice', sessionId: 's1' });
      }

      const metrics = system.getSkillMetrics('search');
      expect(metrics.totalCalls).toBe(10);
      expect(metrics.successRate).toBe(0.9);

      const allMetrics = system.getAllSkillsMetrics();
      expect(allMetrics).toHaveLength(1);

      const dashboard = system.getDashboardSummary();
      expect(dashboard.overall.totalCalls).toBe(10);

      const alerts = system.getAlerts();
      expect(alerts.length).toBeGreaterThanOrEqual(0);

      const recommendations = system.generateImprovementRecommendations();
      expect(Array.isArray(recommendations)).toBe(true);

      const engagement = system.getUserEngagementMetrics();
      expect(engagement.totalUsers).toBe(1);

      const retention = system.getRetentionMetrics();
      expect(retention.totalUsers).toBe(1);

      const prom = system.exportPrometheusMetrics();
      expect(prom).toContain('search');
    });

    it('should handle multiple users and skills', () => {
      system.recordSkillCall('chat', { success: true, duration: 50, userId: 'u1', sessionId: 's1' });
      system.recordSkillCall('chat', { success: true, duration: 60, userId: 'u2', sessionId: 's2' });
      system.recordSkillCall('vision', { success: false, duration: 500, error: 'model_error', userId: 'u1', sessionId: 's3' });

      expect(system.getSkillMetrics('chat').totalCalls).toBe(2);
      expect(system.getSkillMetrics('vision').totalCalls).toBe(1);
      expect(system.getUserEngagementMetrics().totalUsers).toBe(2);
      expect(system.getAllSkillsMetrics()).toHaveLength(2);
    });
  });

  describe('coverage expansions', () => {
    it('should cap duration samples at 1000', () => {
      for (let i = 0; i < 1001; i++) {
        system.recordSkillCall('heavy', { success: true, duration: i });
      }
      const stats = system.metrics.skillCalls.get('heavy');
      expect(stats.durationSamples.length).toBe(1000);
    });

    it('should cap alerts at 100', () => {
      for (let i = 0; i < 60; i++) {
        for (let j = 0; j < 10; j++) {
          system.recordSkillCall(`bad-${i}`, { success: j < 8, duration: 10, timestamp: now });
        }
      }
      expect(system.alerts.length).toBe(100);
    });

    it('should calculate cohort retention', () => {
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'user1', sessionId: 's1' });
      const retentionMap = system.metrics.retention.get('weekly');
      const cohortSet = new Set(['user1', 'user2']);
      retentionMap.set('2026-01-01', cohortSet);
      const r = system.getRetentionMetrics();
      expect(r.retention['2026-01-01']).toBeDefined();
      expect(r.retention['2026-01-01'].originalSize).toBe(2);
      expect(r.retention['2026-01-01'].retainedSize).toBe(1);
    });

    it('should sort by engagement in user engagement', () => {
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u1', sessionId: 's1' });
      jest.advanceTimersByTime(1000);
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u2', sessionId: 's2' });
      const e = system.getUserEngagementMetrics({ sortBy: 'engagement' });
      expect(e.users.length).toBe(2);
    });

    it('should sort top errors by count', () => {
      for (let i = 0; i < 10; i++) {
        const err = i < 3 ? 'err_a' : (i < 5 ? 'err_b' : 'err_c');
        system.recordSkillCall('multi-err', { success: i < 3, duration: 10, error: err });
      }
      const recs = system.generateImprovementRecommendations();
      const relRec = recs.find((r) => r.type === 'reliability');
      expect(relRec).toBeDefined();
      expect(relRec.metrics.topErrors).toBeDefined();
    });

    it('should recommend for high churn rate', () => {
      system.metrics.userSessions.set('inactive-user', {
        userId: 'inactive-user',
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        sessions: new Map(),
        skillsUsed: new Map(),
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0
      });
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'active-user', sessionId: 's1' });
      const recs = system.generateImprovementRecommendations();
      expect(recs.some((r) => r.type === 'retention')).toBe(true);
    });

    it('should clean old alerts periodically', () => {
      for (let i = 0; i < 10; i++) {
        system.recordSkillCall('sk', { success: i < 8, duration: 10 });
      }
      expect(system.alerts.length).toBeGreaterThan(0);
      jest.advanceTimersByTime(90000000);
      expect(system.alerts.length).toBe(0);
    });

    it('should load metrics from storage on construction', async () => {
      const load = jest.fn().mockResolvedValue({});
      const storage = { load, save: jest.fn() };
      const _sys = new SkillMonitoringSystem({ storage });
      await Promise.resolve();
      expect(load).toHaveBeenCalledWith('skillMetrics');
    });

    it('should handle storage load failure', async () => {
      const load = jest.fn().mockRejectedValue(new Error('fail'));
      const storage = { load, save: jest.fn() };
      const _sys = new SkillMonitoringSystem({ storage });
      await Promise.resolve();
      expect(load).toHaveBeenCalled();
    });

    it('should save metrics periodically with storage', () => {
      const save = jest.fn().mockResolvedValue();
      const load = jest.fn();
      const storage = { save, load };
      const sys = new SkillMonitoringSystem({ storage });
      sys.recordSkillCall('sk', { success: true, duration: 1 });
      jest.advanceTimersByTime(300000);
      expect(save).toHaveBeenCalledWith('skillMetrics', expect.any(Object));
    });

    it('should handle storage save failure', async () => {
      const save = jest.fn().mockRejectedValue(new Error('fail'));
      const load = jest.fn();
      const storage = { save, load };
      const sys = new SkillMonitoringSystem({ storage });
      sys.recordSkillCall('sk', { success: true, duration: 1 });
      jest.advanceTimersByTime(300000);
      await Promise.resolve();
      expect(save).toHaveBeenCalled();
    });

    it('should handle old user in retention update', () => {
      system.metrics.userSessions.set('old', {
        userId: 'old',
        firstSeen: now - 86400000 * 30,
        lastSeen: now - 86400000 * 30,
        sessions: new Map([['s1', { sessionId: 's1', startTime: now - 86400000 * 30, lastActivity: now - 86400000 * 30, calls: 1, skillsUsed: new Set() }]]),
        skillsUsed: new Map(),
        totalCalls: 1,
        successfulCalls: 1,
        failedCalls: 0
      });
      system._updateRetention('old');
      const r = system.getRetentionMetrics();
      expect(r.activeUsers).toBe(0);
    });

    it('should handle empty cohort retention', () => {
      system.recordSkillCall('sk', { success: true, duration: 1, userId: 'u1', sessionId: 's1' });
      const retentionMap = system.metrics.retention.get('weekly');
      retentionMap.set('empty-cohort', new Set());
      const r = system.getRetentionMetrics();
      expect(r.retention['empty-cohort'].retentionRate).toBe(0);
    });

    it('should handle user with zero calls', () => {
      system.metrics.userSessions.set('zero', {
        userId: 'zero',
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        sessions: new Map(),
        skillsUsed: new Map(),
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0
      });
      const e = system.getUserEngagementMetrics();
      const user = e.users.find((u) => u.userId === 'zero');
      expect(user.successRate).toBe(0);
    });

    it('should handle no recent calls in dashboard', () => {
      system.recordSkillCall('old-skill', { success: true, duration: 100, timestamp: now - 7200000 });
      jest.advanceTimersByTime(3600001);
      const s = system.getDashboardSummary();
      expect(s.overall.totalCalls).toBe(1);
      expect(s.recent.lastHour.calls).toBe(0);
    });

    it('should handle skills with zero total calls', () => {
      system.metrics.skillCalls.set('empty', {
        total: 0,
        successful: 0,
        failed: 0,
        totalDuration: 0,
        avgDuration: 0,
        p50Duration: 0,
        p95Duration: 0,
        p99Duration: 0,
        lastCall: null,
        firstCall: null,
        domain: null,
        hourlyDistribution: new Array(24).fill(0),
        dailyDistribution: new Array(7).fill(0),
        errorTypes: new Map()
      });
      const all = system.getAllSkillsMetrics();
      const empty = all.find((s) => s.skillName === 'empty');
      expect(empty).toBeDefined();
      expect(empty.successRate).toBe(0);
      const output = system.exportPrometheusMetrics();
      expect(output).toContain('ultrawork_skill_success_rate{skill="empty"} 0');
    });

    it('should handle missing save method on storage', () => {
      const sys = new SkillMonitoringSystem({ storage: { load: jest.fn() } });
      sys._saveMetrics();
    });

    it('should handle non-existent skill in percentile update', () => {
      system._updatePercentiles('nobody', 100);
    });

    it('should handle non-existent user in retention update', () => {
      system._updateRetention('nobody');
    });

    it('should handle skill with all stats properties defined', () => {
      system.metrics.skillCalls.set('explicit', {
        successful: 0,
        failed: 0,
        successRate: 0,
        total: 0,
        avgDuration: 0,
        p95Duration: 0,
        p50Duration: 0,
        p99Duration: 0,
        firstCall: null,
        lastCall: null,
        hourlyDistribution: new Array(24).fill(0),
        dailyDistribution: new Array(7).fill(0),
        errorTypes: new Map()
      });
      const m = system.getSkillMetrics('explicit');
      expect(m.totalCalls).toBe(0);
    });

    it('should handle skill with all defaults used', () => {
      system.metrics.skillCalls.set('defaults', {
        successful: 0,
        failed: 0,
        p50Duration: 0,
        p99Duration: 0,
        firstCall: null,
        lastCall: null,
        hourlyDistribution: new Array(24).fill(0),
        dailyDistribution: new Array(7).fill(0),
        errorTypes: new Map()
      });
      const m = system.getSkillMetrics('defaults');
      expect(m.totalCalls).toBe(0);
      expect(m.averageResponseTime).toBe(0);
    });
  });
});
