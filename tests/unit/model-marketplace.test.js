const { ModelMarketplace } = require('../../src/agent/ModelMarketplace');

describe('ModelMarketplace', () => {
  let marketplace;

  beforeEach(() => {
    marketplace = new ModelMarketplace({ defaultPrice: 100, platformFee: 0.1 });
  });

  afterEach(() => {
    marketplace.destroy();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const m = new ModelMarketplace();
      expect(m.models).toBeInstanceOf(Map);
      expect(m.subscriptions).toBeInstanceOf(Map);
      expect(m.trainingJobs).toBeInstanceOf(Map);
      expect(m.revenue).toBeInstanceOf(Map);
      expect(m.defaultPrice).toBe(100);
      expect(m.platformFee).toBe(0.1);
      m.destroy();
    });

    it('should accept custom options', () => {
      const m = new ModelMarketplace({ defaultPrice: 200, platformFee: 0.05 });
      expect(m.defaultPrice).toBe(200);
      expect(m.platformFee).toBe(0.05);
      m.destroy();
    });
  });

  describe('registerModel', () => {
    it('should register a model with defaults', () => {
      const model = marketplace.registerModel('model_001', {
        name: 'Test Model',
        description: 'A test model',
        industry: 'finance',
        owner: 'alice'
      });
      expect(model.id).toBe('model_001');
      expect(model.name).toBe('Test Model');
      expect(model.status).toBe('available');
      expect(model.version).toBe('1.0.0');
      expect(model.type).toBe('federated');
      expect(model.price).toBe(100);
      expect(model.currency).toBe('credits');
      expect(model.downloadCount).toBe(0);
      expect(model.rating).toBe(0);
      expect(model.reviews).toEqual([]);
      expect(model.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should allow overriding all fields', () => {
      const model = marketplace.registerModel('model_002', {
        name: 'Custom',
        description: 'Custom model',
        industry: 'healthcare',
        type: 'centralized',
        owner: 'bob',
        version: '2.0.0',
        metrics: { accuracy: 0.95 },
        price: 500,
        currency: 'usd',
        trainingNodes: 10,
        trainingSamples: 10000,
        trainingRounds: 50,
        license: 'mit'
      });
      expect(model.type).toBe('centralized');
      expect(model.version).toBe('2.0.0');
      expect(model.price).toBe(500);
      expect(model.currency).toBe('usd');
      expect(model.license).toBe('mit');
    });

    it('should use default price when not specified', () => {
      const model = marketplace.registerModel('model_003', {
        name: 'No Price', description: '', industry: 'tech', owner: 'carol'
      });
      expect(model.price).toBe(100);
    });
  });

  describe('subscribe', () => {
    beforeEach(() => {
      marketplace.registerModel('model_001', {
        name: 'Premium Model',
        description: 'A premium model',
        industry: 'finance',
        owner: 'alice'
      });
    });

    it('should create a subscription', async () => {
      const { subscriptionId, subscription } = await marketplace.subscribe('model_001', 'user_1');
      expect(subscriptionId).toMatch(/^sub_model_001_user_1_/);
      expect(subscription.modelId).toBe('model_001');
      expect(subscription.subscriberId).toBe('user_1');
      expect(subscription.plan).toBe('basic');
      expect(subscription.price).toBe(100);
      expect(subscription.status).toBe('active');
      expect(subscription.apiCalls).toBe(0);
      expect(subscription.maxApiCalls).toBe(10000);
    });

    it('should calculate revenue for model owner', async () => {
      await marketplace.subscribe('model_001', 'user_1', { plan: 'pro' });
      const revenue = marketplace.getOwnerRevenue('alice');
      expect(revenue.total).toBe(270);
      expect(revenue.transactions).toHaveLength(1);
    });

    it('should increment download count', async () => {
      await marketplace.subscribe('model_001', 'user_1');
      const model = marketplace.getModel('model_001');
      expect(model.downloadCount).toBe(1);
    });

    it('should reuse existing revenue entry for same owner', async () => {
      await marketplace.subscribe('model_001', 'user_1');
      await marketplace.subscribe('model_001', 'user_2');
      const revenue = marketplace.getOwnerRevenue('alice');
      expect(revenue.transactions).toHaveLength(2);
      expect(revenue.total).toBe(180);
    });

    it('should throw for non-existent model', async () => {
      await expect(marketplace.subscribe('nonexistent', 'user_1')).rejects.toThrow('Model not found');
    });

    it('should throw for unavailable model', async () => {
      const model = marketplace.getModel('model_001');
      model.status = 'archived';
      await expect(marketplace.subscribe('model_001', 'user_1')).rejects.toThrow('Model not available');
    });

    it('should support custom plan and duration', async () => {
      const { subscription } = await marketplace.subscribe('model_001', 'user_2', {
        plan: 'enterprise',
        duration: 86400000,
        maxApiCalls: 50000
      });
      expect(subscription.plan).toBe('enterprise');
      expect(subscription.price).toBe(1000);
      expect(subscription.endDate).toBeGreaterThan(Date.now());
      expect(subscription.maxApiCalls).toBe(50000);
    });
  });

  describe('_calculatePrice', () => {
    it('should return base price for basic plan', () => {
      expect(marketplace._calculatePrice({ price: 100 }, 'basic')).toBe(100);
    });

    it('should return 3x for pro plan', () => {
      expect(marketplace._calculatePrice({ price: 100 }, 'pro')).toBe(300);
    });

    it('should return 10x for enterprise plan', () => {
      expect(marketplace._calculatePrice({ price: 100 }, 'enterprise')).toBe(1000);
    });

    it('should return base price for unknown plan', () => {
      expect(marketplace._calculatePrice({ price: 100 }, 'unknown')).toBe(100);
    });
  });

  describe('startFederatedTraining', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should start training with default values', async () => {
      const job = await marketplace.startFederatedTraining({
        name: 'Test Training',
        industry: 'finance'
      });
      expect(job.status).toBe('training');
      expect(job.maxRounds).toBe(10);
      expect(job.aggregation).toBe('fedavg');
      expect(job.metrics.accuracy).toEqual([]);
      expect(job.metrics.loss).toEqual([]);
    });

    it('should accept custom configuration', async () => {
      const job = await marketplace.startFederatedTraining({
        name: 'Custom Training',
        industry: 'healthcare',
        participants: [{ id: 'node1', dataSize: 5000 }],
        aggregation: 'fedprox',
        maxRounds: 5
      });
      expect(job.participants).toHaveLength(1);
      expect(job.aggregation).toBe('fedprox');
      expect(job.maxRounds).toBe(5);
    });

    it('should simulate training rounds', async () => {
      const job = await marketplace.startFederatedTraining({
        name: 'Quick Train',
        industry: 'retail',
        maxRounds: 3
      });

      for (let r = 0; r < 3; r++) {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      }

      const jobResult = marketplace.getTrainingJob(job.id);
      expect(jobResult.status).toBe('completed');
      expect(jobResult.currentRound).toBe(3);
      expect(jobResult.metrics.accuracy).toHaveLength(3);
      expect(jobResult.metrics.loss).toHaveLength(3);
      expect(jobResult.completedAt).toBeGreaterThan(0);
    });

    it('should register a model after training completes', async () => {
      const job = await marketplace.startFederatedTraining({
        name: 'Auto Register',
        industry: 'energy',
        maxRounds: 2
      });

      for (let r = 0; r < 2; r++) {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      }

      expect(marketplace.models.has(`model_${job.id}`)).toBe(true);
    });

    it('should handle participant without dataSize', async () => {
      const job = await marketplace.startFederatedTraining({
        name: 'No Size',
        industry: 'finance',
        participants: [{ id: 'node1' }],
        maxRounds: 1
      });

      jest.advanceTimersByTime(500);
      await Promise.resolve();

      expect(marketplace.models.has(`model_${job.id}`)).toBe(true);
    });
  });

  describe('submitTrainingUpdate', () => {
    beforeEach(() => {
      marketplace.startFederatedTraining({
        name: 'Test Training',
        industry: 'finance',
        participants: [{ id: 'node1', dataSize: 1000 }, { id: 'node2', dataSize: 2000 }],
        maxRounds: 10
      });
    });

    it('should accept update from participant', async () => {
      const jobs = marketplace.getAllTrainingJobs();
      const jobId = jobs[0].id;
      const result = await marketplace.submitTrainingUpdate(jobId, 'node1', { weights: [0.1, 0.2] });
      expect(result.accepted).toBe(true);
    });

    it('should throw for non-existent job', async () => {
      await expect(marketplace.submitTrainingUpdate('invalid_job', 'node1', {}))
        .rejects.toThrow('Training job not found');
    });

    it('should throw for non-participant', async () => {
      const jobs = marketplace.getAllTrainingJobs();
      const jobId = jobs[0].id;
      await expect(marketplace.submitTrainingUpdate(jobId, 'outsider', {}))
        .rejects.toThrow('Not a participant');
    });

    it('should return completed when training is done', async () => {
      const jobs = marketplace.getAllTrainingJobs();
      const jobId = jobs[0].id;
      const job = marketplace.getTrainingJob(jobId);
      job.currentRound = job.maxRounds;
      const result = await marketplace.submitTrainingUpdate(jobId, 'node1', {});
      expect(result.nextRoundIn).toBe('completed');
    });
  });

  describe('rateModel', () => {
    beforeEach(() => {
      marketplace.registerModel('model_001', {
        name: 'Rateable Model', description: 'desc', industry: 'tech', owner: 'alice'
      });
    });

    it('should add a rating and review', async () => {
      const result = await marketplace.rateModel('model_001', 'user_1', 5, 'Excellent!');
      expect(result.rating).toBe(5);
      expect(result.reviewCount).toBe(1);
    });

    it('should update existing review', async () => {
      await marketplace.rateModel('model_001', 'user_1', 3, 'OK');
      const result = await marketplace.rateModel('model_001', 'user_1', 4, 'Better now');
      expect(result.rating).toBe(4);
      expect(result.reviewCount).toBe(1);
    });

    it('should average multiple ratings', async () => {
      await marketplace.rateModel('model_001', 'user_1', 5);
      await marketplace.rateModel('model_001', 'user_2', 3);
      const model = marketplace.getModel('model_001');
      expect(model.rating).toBe(4);
    });

    it('should throw for non-existent model', async () => {
      await expect(marketplace.rateModel('nonexistent', 'user_1', 5))
        .rejects.toThrow('Model not found');
    });
  });

  describe('searchModels', () => {
    beforeEach(() => {
      marketplace.registerModel('m1', { name: 'Finance Model', description: 'For finance', industry: 'finance', type: 'federated', owner: 'a', price: 100 });
      marketplace.registerModel('m2', { name: 'Healthcare AI', description: 'For healthcare', industry: 'healthcare', type: 'centralized', owner: 'b', price: 200 });
      marketplace.registerModel('m3', { name: 'Budget Finance', description: 'Cheap finance', industry: 'finance', type: 'federated', owner: 'c', price: 50 });
      marketplace.registerModel('m4', { name: 'Top Model', description: 'Premium', industry: 'tech', type: 'federated', owner: 'd', price: 500 });
    });

    it('should return all models with empty query', () => {
      expect(marketplace.searchModels({})).toHaveLength(4);
    });

    it('should return all models with no arguments', () => {
      expect(marketplace.searchModels()).toHaveLength(4);
    });

    it('should filter by industry', () => {
      const results = marketplace.searchModels({ industry: 'finance' });
      expect(results).toHaveLength(2);
    });

    it('should filter by type', () => {
      const results = marketplace.searchModels({ type: 'centralized' });
      expect(results).toHaveLength(1);
    });

    it('should filter by maxPrice', () => {
      const results = marketplace.searchModels({ maxPrice: 100 });
      expect(results).toHaveLength(2);
    });

    it('should filter by minRating', () => {
      marketplace.getModel('m1').rating = 4.5;
      marketplace.getModel('m3').rating = 3.0;
      const results = marketplace.searchModels({ minRating: 4 });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('m1');
    });

    it('should filter by keyword in name or description', () => {
      const results = marketplace.searchModels({ keyword: 'finance' });
      expect(results).toHaveLength(2);
    });

    it('should sort by price ascending', () => {
      const results = marketplace.searchModels({ sortBy: 'price' });
      expect(results[0].price).toBe(50);
      expect(results[3].price).toBe(500);
    });

    it('should sort by newest', () => {
      const results = marketplace.searchModels({ sortBy: 'newest' });
      expect(results).toHaveLength(4);
    });

    it('should sort by downloads', () => {
      const results = marketplace.searchModels({ sortBy: 'downloads' });
      expect(results).toHaveLength(4);
    });

    it('should sort by rating', () => {
      const results = marketplace.searchModels({ sortBy: 'rating' });
      expect(results).toHaveLength(4);
    });

    it('should handle combined filters', () => {
      const results = marketplace.searchModels({ industry: 'finance', maxPrice: 75 });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Budget Finance');
    });

    it('should return empty array for no match', () => {
      const results = marketplace.searchModels({ industry: 'gaming' });
      expect(results).toEqual([]);
    });
  });

  describe('getAllModels', () => {
    it('should return all registered models', () => {
      marketplace.registerModel('m1', { name: 'M1', description: 'd1', industry: 'tech', owner: 'a' });
      marketplace.registerModel('m2', { name: 'M2', description: 'd2', industry: 'tech', owner: 'b' });
      expect(marketplace.getAllModels()).toHaveLength(2);
    });
  });

  describe('getOwnerRevenue', () => {
    it('should return zero revenue for unknown owner', () => {
      const rev = marketplace.getOwnerRevenue('nobody');
      expect(rev.total).toBe(0);
      expect(rev.transactions).toEqual([]);
    });
  });

  describe('getSubscription', () => {
    it('should return undefined for unknown subscription', () => {
      expect(marketplace.getSubscription('nonexistent')).toBeUndefined();
    });
  });

  describe('getTrainingJob', () => {
    it('should return undefined for unknown job', () => {
      expect(marketplace.getTrainingJob('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllTrainingJobs', () => {
    it('should return all training jobs', () => {
      marketplace.startFederatedTraining({ name: 'T1', industry: 'tech' });
      marketplace.startFederatedTraining({ name: 'T2', industry: 'finance' });
      expect(marketplace.getAllTrainingJobs()).toHaveLength(2);
    });
  });

  describe('getStats', () => {
    it('should return empty stats for fresh marketplace', () => {
      const stats = marketplace.getStats();
      expect(stats.models.total).toBe(0);
      expect(stats.subscriptions.total).toBe(0);
      expect(stats.training.total).toBe(0);
      expect(stats.revenue.total).toBe(0);
    });

    it('should aggregate stats correctly', async () => {
      marketplace.registerModel('m1', { name: 'M1', description: 'd1', industry: 'finance', type: 'federated', owner: 'a' });
      marketplace.registerModel('m2', { name: 'M2', description: 'd2', industry: 'healthcare', type: 'centralized', owner: 'b' });
      await marketplace.subscribe('m1', 'u1', { plan: 'pro' });

      const stats = marketplace.getStats();
      expect(stats.models.total).toBe(2);
      expect(stats.models.federated).toBe(1);
      expect(stats.subscriptions.total).toBe(1);
      expect(stats.subscriptions.active).toBe(1);
      expect(stats.revenue.total).toBe(270);
    });

    it('should summarize training jobs in stats', () => {
      marketplace.trainingJobs.set('j1', { id: 'j1', status: 'training' });
      marketplace.trainingJobs.set('j2', { id: 'j2', status: 'completed' });
      const stats = marketplace.getStats();
      expect(stats.training.running).toBe(1);
      expect(stats.training.completed).toBe(1);
      expect(stats.training.total).toBe(2);
    });
  });

  describe('destroy', () => {
    it('should clear all internal state', () => {
      marketplace.registerModel('m1', { name: 'M1', description: 'd1', industry: 'tech', owner: 'a' });
      marketplace.destroy();
      expect(marketplace.models.size).toBe(0);
      expect(marketplace.subscriptions.size).toBe(0);
      expect(marketplace.trainingJobs.size).toBe(0);
      expect(marketplace.revenue.size).toBe(0);
    });
  });
});
