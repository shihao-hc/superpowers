const crypto = require('crypto');

class ModelMarketplace {
  constructor(options = {}) {
    this.models = new Map();
    this.subscriptions = new Map();
    this.trainingJobs = new Map();
    this.revenue = new Map();
    this.defaultPrice = options.defaultPrice || 100;
    this.platformFee = options.platformFee || 0.1;
  }

  registerModel(modelId, config) {
    const model = {
      id: modelId,
      name: config.name,
      description: config.description,
      industry: config.industry,
      type: config.type || 'federated',
      owner: config.owner,
      version: config.version || '1.0.0',
      metrics: config.metrics || {},
      price: config.price || this.defaultPrice,
      currency: config.currency || 'credits',
      trainingData: {
        nodes: config.trainingNodes || 0,
        samples: config.trainingSamples || 0,
        rounds: config.trainingRounds || 0
      },
      license: config.license || 'commercial',
      status: 'available',
      downloadCount: 0,
      rating: 0,
      reviews: [],
      createdAt: Date.now()
    };

    this.models.set(modelId, model);
    return model;
  }

  async subscribe(modelId, subscriberId, options = {}) {
    const model = this.models.get(modelId);
    if (!model) throw new Error('Model not found');

    if (model.status !== 'available') {
      throw new Error('Model not available');
    }

    const subscriptionId = `sub_${modelId}_${subscriberId}_${Date.now().toString(36)}`;

    const subscription = {
      id: subscriptionId,
      modelId,
      subscriberId,
      plan: options.plan || 'basic',
      price: this._calculatePrice(model, options.plan),
      startDate: Date.now(),
      endDate: options.duration ? Date.now() + options.duration : null,
      status: 'active',
      apiCalls: 0,
      maxApiCalls: options.maxApiCalls || 10000
    };

    this.subscriptions.set(subscriptionId, subscription);

    if (!this.revenue.has(model.owner)) {
      this.revenue.set(model.owner, { total: 0, transactions: [] });
    }

    const ownerRevenue = this.revenue.get(model.owner);
    const earnings = subscription.price * (1 - this.platformFee);
    ownerRevenue.total += earnings;
    ownerRevenue.transactions.push({
      subscriptionId,
      amount: earnings,
      date: Date.now()
    });

    model.downloadCount++;

    return { subscriptionId, subscription };
  }

  _calculatePrice(model, plan) {
    const basePrice = model.price;
    switch (plan) {
      case 'basic': return basePrice;
      case 'pro': return basePrice * 3;
      case 'enterprise': return basePrice * 10;
      default: return basePrice;
    }
  }

  async startFederatedTraining(config) {
    const jobId = `train_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;

    const job = {
      id: jobId,
      name: config.name,
      industry: config.industry,
      participants: config.participants || [],
      aggregation: config.aggregation || 'fedavg',
      maxRounds: config.maxRounds || 10,
      currentRound: 0,
      status: 'initializing',
      startedAt: Date.now(),
      completedAt: null,
      metrics: {
        accuracy: [],
        loss: []
      }
    };

    this.trainingJobs.set(jobId, job);

    this._simulateTraining(job);

    return job;
  }

  async _simulateTraining(job) {
    job.status = 'training';

    for (let round = 1; round <= job.maxRounds; round++) {
      await new Promise(r => setTimeout(r, 500));

      job.currentRound = round;

      const baseAccuracy = 0.6;
      const improvement = (round / job.maxRounds) * 0.35;
      const noise = (Math.random() - 0.5) * 0.05;
      job.metrics.accuracy.push(Math.min(0.98, baseAccuracy + improvement + noise));

      const baseLoss = 0.5;
      const lossReduction = (round / job.maxRounds) * 0.45;
      job.metrics.loss.push(Math.max(0.02, baseLoss - lossReduction + Math.abs(noise)));
    }

    job.status = 'completed';
    job.completedAt = Date.now();

    const finalAccuracy = job.metrics.accuracy[job.metrics.accuracy.length - 1];

    this.registerModel(`model_${job.id}`, {
      name: job.name,
      description: `联邦学习训练的${job.industry}领域模型`,
      industry: job.industry,
      type: 'federated',
      owner: 'collaborative',
      version: '1.0.0',
      metrics: {
        accuracy: finalAccuracy,
        loss: job.metrics.loss[job.metrics.loss.length - 1],
        participants: job.participants.length,
        rounds: job.maxRounds
      },
      price: Math.round(finalAccuracy * 200),
      trainingNodes: job.participants.length,
      trainingSamples: job.participants.reduce((sum, p) => sum + (p.dataSize || 1000), 0),
      trainingRounds: job.maxRounds,
      license: 'collaborative'
    });
  }

  async submitTrainingUpdate(jobId, participantId, update) {
    const job = this.trainingJobs.get(jobId);
    if (!job) throw new Error('Training job not found');

    if (!job.participants.find(p => p.id === participantId)) {
      throw new Error('Not a participant');
    }

    return {
      accepted: true,
      round: job.currentRound,
      nextRoundIn: job.currentRound < job.maxRounds ? 'pending' : 'completed'
    };
  }

  async rateModel(modelId, userId, rating, review = '') {
    const model = this.models.get(modelId);
    if (!model) throw new Error('Model not found');

    const existingReview = model.reviews.findIndex(r => r.userId === userId);
    if (existingReview > -1) {
      model.reviews[existingReview] = { userId, rating, review, date: Date.now() };
    } else {
      model.reviews.push({ userId, rating, review, date: Date.now() });
    }

    model.rating = model.reviews.reduce((sum, r) => sum + r.rating, 0) / model.reviews.length;

    return { rating: model.rating, reviewCount: model.reviews.length };
  }

  searchModels(query = {}) {
    let results = Array.from(this.models.values());

    if (query.industry) {
      results = results.filter(m => m.industry === query.industry);
    }

    if (query.type) {
      results = results.filter(m => m.type === query.type);
    }

    if (query.minRating) {
      results = results.filter(m => m.rating >= query.minRating);
    }

    if (query.maxPrice) {
      results = results.filter(m => m.price <= query.maxPrice);
    }

    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter(m =>
        m.name.toLowerCase().includes(kw) ||
        m.description.toLowerCase().includes(kw)
      );
    }

    if (query.sortBy) {
      switch (query.sortBy) {
        case 'rating':
          results.sort((a, b) => b.rating - a.rating);
          break;
        case 'downloads':
          results.sort((a, b) => b.downloadCount - a.downloadCount);
          break;
        case 'price':
          results.sort((a, b) => a.price - b.price);
          break;
        case 'newest':
          results.sort((a, b) => b.createdAt - a.createdAt);
          break;
      }
    }

    return results;
  }

  getModel(modelId) {
    return this.models.get(modelId);
  }

  getAllModels() {
    return Array.from(this.models.values());
  }

  getSubscription(subscriptionId) {
    return this.subscriptions.get(subscriptionId);
  }

  getTrainingJob(jobId) {
    return this.trainingJobs.get(jobId);
  }

  getAllTrainingJobs() {
    return Array.from(this.trainingJobs.values());
  }

  getOwnerRevenue(ownerId) {
    return this.revenue.get(ownerId) || { total: 0, transactions: [] };
  }

  getStats() {
    const models = Array.from(this.models.values());
    const subscriptions = Array.from(this.subscriptions.values());
    const jobs = Array.from(this.trainingJobs.values());

    return {
      models: {
        total: models.length,
        federated: models.filter(m => m.type === 'federated').length,
        totalDownloads: models.reduce((sum, m) => sum + m.downloadCount, 0)
      },
      subscriptions: {
        total: subscriptions.length,
        active: subscriptions.filter(s => s.status === 'active').length
      },
      training: {
        total: jobs.length,
        running: jobs.filter(j => j.status === 'training').length,
        completed: jobs.filter(j => j.status === 'completed').length
      },
      revenue: {
        total: Array.from(this.revenue.values()).reduce((sum, r) => sum + r.total, 0)
      }
    };
  }

  destroy() {
    this.models.clear();
    this.subscriptions.clear();
    this.trainingJobs.clear();
    this.revenue.clear();
  }
}

module.exports = { ModelMarketplace };
