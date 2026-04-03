const crypto = require('crypto');

class FederatedLearning {
  constructor(options = {}) {
    this.nodes = new Map();
    this.globalModel = null;
    this.rounds = [];
    this.currentRound = 0;
    this.aggregationStrategy = options.aggregationStrategy || 'fedavg';
    this.minNodes = options.minNodes || 2;
    this.maxRounds = options.maxRounds || 100;
    this.onRoundComplete = options.onRoundComplete || (() => {});
    this.onConverged = options.onConverged || (() => {});
  }

  registerNode(nodeId, config = {}) {
    const node = {
      id: nodeId,
      name: config.name || nodeId,
      dataSize: config.dataSize || 0,
      capabilities: config.capabilities || [],
      status: 'idle',
      localModel: null,
      gradients: null,
      lastUpdate: null,
      contribution: 0
    };

    this.nodes.set(nodeId, node);
    return node;
  }

  unregisterNode(nodeId) {
    this.nodes.delete(nodeId);
  }

  initializeGlobalModel(modelConfig) {
    this.globalModel = {
      id: `model_${Date.now().toString(36)}`,
      version: 0,
      weights: this._initializeWeights(modelConfig),
      config: modelConfig,
      createdAt: Date.now(),
      metrics: {}
    };

    return this.globalModel;
  }

  _initializeWeights(config) {
    const layers = config.layers || [10, 5, 1];
    const weights = {};

    for (let i = 0; i < layers.length - 1; i++) {
      const inputSize = layers[i];
      const outputSize = layers[i + 1];

      weights[`W${i}`] = this._randomMatrix(inputSize, outputSize);
      weights[`b${i}`] = new Array(outputSize).fill(0);
    }

    return weights;
  }

  _randomMatrix(rows, cols) {
    const matrix = [];
    for (let i = 0; i < rows; i++) {
      const row = [];
      for (let j = 0; j < cols; j++) {
        row.push((Math.random() - 0.5) * 0.1);
      }
      matrix.push(row);
    }
    return matrix;
  }

  async startRound() {
    if (!this.globalModel) {
      throw new Error('Global model not initialized');
    }

    const roundId = `round_${++this.currentRound}`;
    const participatingNodes = Array.from(this.nodes.values())
      .filter(n => n.status === 'idle');

    if (participatingNodes.length < this.minNodes) {
      throw new Error(`Need at least ${this.minNodes} nodes, got ${participatingNodes.length}`);
    }

    const round = {
      id: roundId,
      number: this.currentRound,
      participants: participatingNodes.map(n => n.id),
      status: 'running',
      startedAt: Date.now(),
      localUpdates: {},
      aggregatedModel: null,
      metrics: {}
    };

    this.rounds.push(round);

    for (const node of participatingNodes) {
      node.status = 'training';
      node.localModel = this._cloneModel(this.globalModel);
    }

    return round;
  }

  async submitLocalUpdate(nodeId, update) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error('Node not found');

    const currentRound = this.rounds[this.rounds.length - 1];
    if (!currentRound || currentRound.status !== 'running') {
      throw new Error('No active round');
    }

    node.gradients = update.gradients;
    node.contribution += 1;
    node.lastUpdate = Date.now();
    node.status = 'idle';

    currentRound.localUpdates[nodeId] = {
      gradients: update.gradients,
      metrics: update.metrics || {},
      dataSize: node.dataSize,
      timestamp: Date.now()
    };

    const allSubmitted = currentRound.participants.every(
      pid => currentRound.localUpdates[pid]
    );

    if (allSubmitted) {
      await this._aggregate(currentRound);
    }

    return { submitted: true, allSubmitted };
  }

  async _aggregate(round) {
    const updates = Object.values(round.localUpdates);

    if (this.aggregationStrategy === 'fedavg') {
      round.aggregatedModel = this._fedavg(updates);
    } else if (this.aggregationStrategy === 'fedprox') {
      round.aggregatedModel = this._fedprox(updates);
    } else {
      round.aggregatedModel = this._fedavg(updates);
    }

    this.globalModel = round.aggregatedModel;
    this.globalModel.version += 1;

    round.status = 'completed';
    round.completedAt = Date.now();
    round.duration = round.completedAt - round.startedAt;

    this.onRoundComplete(round);

    if (this.currentRound >= this.maxRounds) {
      this.onConverged(this.globalModel);
    }
  }

  _fedavg(updates) {
    const totalDataSize = updates.reduce((sum, u) => sum + (u.dataSize || 1), 0);
    const aggregatedWeights = {};

    const weightKeys = Object.keys(this.globalModel.weights);

    for (const key of weightKeys) {
      if (key.startsWith('W')) {
        const shape = this.globalModel.weights[key];
        const rows = shape.length;
        const cols = shape[0].length;

        aggregatedWeights[key] = [];
        for (let i = 0; i < rows; i++) {
          const row = [];
          for (let j = 0; j < cols; j++) {
            let sum = 0;
            for (const update of updates) {
              const weight = (update.dataSize || 1) / totalDataSize;
              const grad = update.gradients?.[key]?.[i]?.[j] || 0;
              sum += weight * (this.globalModel.weights[key][i][j] - 0.01 * grad);
            }
            row.push(sum);
          }
          aggregatedWeights[key].push(row);
        }
      } else {
        const size = this.globalModel.weights[key].length;
        aggregatedWeights[key] = [];
        for (let i = 0; i < size; i++) {
          let sum = 0;
          for (const update of updates) {
            const weight = (update.dataSize || 1) / totalDataSize;
            const grad = update.gradients?.[key]?.[i] || 0;
            sum += weight * (this.globalModel.weights[key][i] - 0.01 * grad);
          }
          aggregatedWeights[key].push(sum);
        }
      }
    }

    return {
      ...this.globalModel,
      weights: aggregatedWeights,
      updatedAt: Date.now()
    };
  }

  _fedprox(updates) {
    const mu = 0.01;
    const baseWeights = this.globalModel.weights;
    const aggregated = this._fedavg(updates);

    const weightKeys = Object.keys(aggregated.weights);

    for (const key of weightKeys) {
      if (key.startsWith('W')) {
        for (let i = 0; i < aggregated.weights[key].length; i++) {
          for (let j = 0; j < aggregated.weights[key][i].length; j++) {
            aggregated.weights[key][i][j] += mu * (aggregated.weights[key][i][j] - baseWeights[key][i][j]);
          }
        }
      }
    }

    return aggregated;
  }

  _cloneModel(model) {
    return {
      ...model,
      weights: JSON.parse(JSON.stringify(model.weights))
    };
  }

  getNode(nodeId) {
    return this.nodes.get(nodeId);
  }

  getAllNodes() {
    return Array.from(this.nodes.values());
  }

  getActiveNodes() {
    return Array.from(this.nodes.values()).filter(n => n.status === 'idle');
  }

  getGlobalModel() {
    return this.globalModel;
  }

  getRound(roundNumber) {
    return this.rounds.find(r => r.number === roundNumber);
  }

  getAllRounds() {
    return [...this.rounds];
  }

  getStats() {
    const nodes = Array.from(this.nodes.values());
    return {
      nodes: {
        total: nodes.length,
        active: nodes.filter(n => n.status === 'idle').length,
        training: nodes.filter(n => n.status === 'training').length
      },
      rounds: {
        total: this.rounds.length,
        completed: this.rounds.filter(r => r.status === 'completed').length,
        current: this.currentRound
      },
      model: {
        version: this.globalModel?.version || 0,
        createdAt: this.globalModel?.createdAt
      }
    };
  }

  destroy() {
    this.nodes.clear();
    this.rounds = [];
    this.globalModel = null;
  }
}

module.exports = { FederatedLearning };
