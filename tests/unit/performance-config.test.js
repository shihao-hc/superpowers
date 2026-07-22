const { PerformanceConfig } = require('../../src/performance/PerformanceConfig');

const ENV_VARS = ['REDIS_URL', 'SKILL_MAX_CONCURRENT', 'BATCH_SIZE', 'FLUSH_INTERVAL',
  'MAX_MEMORY_MB', 'MAX_CPU_PERCENT', 'DAILY_BUDGET_USD', 'LLM_TOKEN_LIMIT'];

describe('PerformanceConfig', () => {
  let config;
  let savedEnv;

  beforeEach(() => {
    savedEnv = {};
    for (const v of ENV_VARS) {
      savedEnv[v] = process.env[v];
      delete process.env[v];
    }
    config = new PerformanceConfig();
  });

  afterEach(() => {
    for (const v of ENV_VARS) {
      if (savedEnv[v] !== undefined) {
        process.env[v] = savedEnv[v];
      } else {
        delete process.env[v];
      }
    }
  });

  test('constructor loads default config', () => {
    const all = config.getAll();
    expect(all).toHaveProperty('cache');
    expect(all).toHaveProperty('redis');
    expect(all).toHaveProperty('skillExecution');
    expect(all).toHaveProperty('batchWriter');
    expect(all).toHaveProperty('resources');
    expect(all).toHaveProperty('monitoring');
    expect(all).toHaveProperty('sla');
    expect(all).toHaveProperty('cost');
  });

  test('get returns nested value', () => {
    expect(config.get('cache.ttl.default')).toBe(3600);
    expect(config.get('redis.enabled')).toBe(false);
    expect(config.get('resources.maxMemoryMB')).toBe(512);
  });

  test('get returns undefined for missing path', () => {
    expect(config.get('nonexistent')).toBeUndefined();
    expect(config.get('cache.nonexistent')).toBeUndefined();
  });

  test('set updates nested value', () => {
    config.set('cache.ttl.default', 7200);
    expect(config.get('cache.ttl.default')).toBe(7200);
  });

  test('set creates intermediate objects', () => {
    config.set('custom.nested.key', 'value');
    expect(config.get('custom.nested.key')).toBe('value');
  });

  test('set returns this for chaining', () => {
    const result = config.set('test', 1);
    expect(result).toBe(config);
  });

  test('loadFromEnv reads environment variables', () => {
    process.env.BATCH_SIZE = '200';
    config.loadFromEnv();
    expect(config.get('batchWriter.batchSize')).toBe('200');
  });

  test('get returns undefined for deep missing path', () => {
    expect(config.get('cache.nonexistent.deep')).toBeUndefined();
  });

  test('singleton getInstance works', () => {
    PerformanceConfig._instance = null;
    const inst1 = PerformanceConfig.getInstance();
    const inst2 = PerformanceConfig.getInstance();
    expect(inst1).toBe(inst2);
  });

  test('getAll returns copy of config', () => {
    const all = config.getAll();
    all.cache.ttl.default = 999;
    expect(config.get('cache.ttl.default')).toBe(3600);
  });

  test('getCacheConfig', () => {
    expect(config.getCacheConfig().enabled).toBe(true);
  });

  test('getRedisConfig', () => {
    expect(config.getRedisConfig().keyPrefix).toBe('ultrawork:');
  });

  test('getSkillExecutionConfig', () => {
    expect(config.getSkillExecutionConfig().timeout).toBe(120000);
  });

  test('getBatchWriterConfig', () => {
    expect(config.getBatchWriterConfig().batchSize).toBe(100);
  });

  test('getResourceConfig', () => {
    expect(config.getResourceConfig().heapWarningThreshold).toBe(0.85);
  });

  test('getMonitoringConfig', () => {
    expect(config.getMonitoringConfig().metricsPort).toBe(9090);
  });

  test('getSLAConfig', () => {
    expect(config.getSLAConfig().availabilityTarget).toBe(0.999);
  });

  test('getCostConfig', () => {
    expect(config.getCostConfig().dailyBudgetUSD).toBe(100);
  });

  test('generateRecommendations returns cache recommendation for low hit rate', () => {
    const recs = config.generateRecommendations({
      cacheHitRate: 0.5,
      memoryUsage: 0.5,
      queueLength: 0,
      batchQueueSize: 0
    });
    expect(recs.length).toBeGreaterThanOrEqual(1);
    expect(recs[0].type).toBe('cache');
    expect(recs[0].priority).toBe('high');
  });

  test('generateRecommendations returns memory recommendation for high usage', () => {
    const recs = config.generateRecommendations({
      cacheHitRate: 0.9,
      memoryUsage: 0.9,
      queueLength: 0,
      batchQueueSize: 0
    });
    expect(recs.some((r) => r.type === 'memory')).toBe(true);
  });

  test('generateRecommendations returns concurrency recommendation for long queue', () => {
    const recs = config.generateRecommendations({
      cacheHitRate: 0.9,
      memoryUsage: 0.5,
      queueLength: 15,
      batchQueueSize: 0
    });
    expect(recs.some((r) => r.type === 'concurrency')).toBe(true);
  });

  test('generateRecommendations returns batch recommendation for full queue', () => {
    const recs = config.generateRecommendations({
      cacheHitRate: 0.9,
      memoryUsage: 0.5,
      queueLength: 0,
      batchQueueSize: 90
    });
    expect(recs.some((r) => r.type === 'batch')).toBe(true);
  });

  test('generateRecommendations returns empty for healthy metrics', () => {
    const recs = config.generateRecommendations({
      cacheHitRate: 0.9,
      memoryUsage: 0.5,
      queueLength: 1,
      batchQueueSize: 10
    });
    expect(recs.length).toBe(0);
  });
});
