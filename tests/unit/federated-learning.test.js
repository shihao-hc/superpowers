const { FederatedLearning } = require('../../src/agent/FederatedLearning');

describe('FederatedLearning', () => {
  let fl;
  let dateNowSpy;

  beforeAll(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => 1000000);
  });

  afterAll(() => {
    dateNowSpy.mockRestore();
  });

  beforeEach(() => {
    fl = new FederatedLearning();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(fl.nodes).toBeInstanceOf(Map);
      expect(fl.nodes.size).toBe(0);
      expect(fl.globalModel).toBeNull();
      expect(fl.rounds).toEqual([]);
      expect(fl.currentRound).toBe(0);
      expect(fl.aggregationStrategy).toBe('fedavg');
      expect(fl.minNodes).toBe(2);
      expect(fl.maxRounds).toBe(100);
      expect(fl.onRoundComplete).toBeInstanceOf(Function);
      expect(fl.onConverged).toBeInstanceOf(Function);
    });

    it('should accept custom options', () => {
      const onRoundComplete = jest.fn();
      const onConverged = jest.fn();

      const custom = new FederatedLearning({
        aggregationStrategy: 'fedprox',
        minNodes: 3,
        maxRounds: 50,
        onRoundComplete,
        onConverged
      });

      expect(custom.aggregationStrategy).toBe('fedprox');
      expect(custom.minNodes).toBe(3);
      expect(custom.maxRounds).toBe(50);
      expect(custom.onRoundComplete).toBe(onRoundComplete);
      expect(custom.onConverged).toBe(onConverged);
    });
  });

  describe('registerNode', () => {
    it('should register a node with default config', () => {
      const node = fl.registerNode('node1');
      expect(node.id).toBe('node1');
      expect(node.name).toBe('node1');
      expect(node.dataSize).toBe(0);
      expect(node.capabilities).toEqual([]);
      expect(node.status).toBe('idle');
      expect(node.localModel).toBeNull();
      expect(node.gradients).toBeNull();
      expect(node.lastUpdate).toBeNull();
      expect(node.contribution).toBe(0);
      expect(fl.nodes.get('node1')).toBe(node);
    });

    it('should register a node with custom config', () => {
      const node = fl.registerNode('node2', {
        name: 'worker-2',
        dataSize: 100,
        capabilities: ['gpu', 'large']
      });
      expect(node.name).toBe('worker-2');
      expect(node.dataSize).toBe(100);
      expect(node.capabilities).toEqual(['gpu', 'large']);
    });

    it('should register multiple nodes', () => {
      fl.registerNode('a');
      fl.registerNode('b');
      fl.registerNode('c');
      expect(fl.nodes.size).toBe(3);
    });
  });

  describe('unregisterNode', () => {
    it('should remove a registered node', () => {
      fl.registerNode('node1');
      expect(fl.nodes.has('node1')).toBe(true);
      fl.unregisterNode('node1');
      expect(fl.nodes.has('node1')).toBe(false);
    });

    it('should not throw when removing non-existent node', () => {
      expect(() => fl.unregisterNode('ghost')).not.toThrow();
    });
  });

  describe('initializeGlobalModel', () => {
    it('should initialize global model with default layer config', () => {
      const model = fl.initializeGlobalModel({});
      expect(model.id).toMatch(/^model_/);
      expect(model.version).toBe(0);
      expect(model.config).toEqual({});
      expect(model.createdAt).toBe(1000000);
      expect(model.metrics).toEqual({});
      expect(model.weights).toBeDefined();
    });

    it('should initialize weights with specified layer sizes', () => {
      const model = fl.initializeGlobalModel({ layers: [3, 4, 2] });
      const weights = model.weights;
      expect(weights.W0).toBeDefined();
      expect(weights.W0.length).toBe(3);
      expect(weights.W0[0].length).toBe(4);
      expect(weights.W1).toBeDefined();
      expect(weights.W1.length).toBe(4);
      expect(weights.W1[0].length).toBe(2);
      expect(weights.b0).toEqual([0, 0, 0, 0]);
      expect(weights.b1).toEqual([0, 0]);
    });

    it('should set weights as random values in range [-0.05, 0.05]', () => {
      const model = fl.initializeGlobalModel({ layers: [5, 5] });
      const w = model.weights.W0;
      for (const row of w) {
        for (const val of row) {
          expect(val).toBeGreaterThanOrEqual(-0.05);
          expect(val).toBeLessThanOrEqual(0.05);
        }
      }
    });

    it('should preserve model reference in instance', () => {
      const model = fl.initializeGlobalModel({ layers: [2, 1] });
      expect(fl.globalModel).toBe(model);
    });
  });

  describe('_randomMatrix', () => {
    it('should create matrix of correct dimensions', () => {
      const matrix = fl._randomMatrix(3, 4);
      expect(matrix.length).toBe(3);
      expect(matrix[0].length).toBe(4);
      expect(matrix[2].length).toBe(4);
    });

    it('should handle 1x1 matrix', () => {
      const matrix = fl._randomMatrix(1, 1);
      expect(matrix.length).toBe(1);
      expect(matrix[0].length).toBe(1);
      expect(typeof matrix[0][0]).toBe('number');
    });
  });

  describe('startRound', () => {
    it('should throw if global model not initialized', async () => {
      await expect(fl.startRound()).rejects.toThrow('Global model not initialized');
    });

    it('should throw if not enough idle nodes', async () => {
      fl.initializeGlobalModel({});
      fl.registerNode('node1');
      fl.minNodes = 2;
      await expect(fl.startRound()).rejects.toThrow('Need at least 2 nodes, got 1');
    });

    it('should start a round successfully', async () => {
      fl.initializeGlobalModel({ layers: [2, 1] });
      fl.registerNode('node1');
      fl.registerNode('node2');

      const round = await fl.startRound();

      expect(round.id).toMatch(/^round_/);
      expect(round.number).toBe(1);
      expect(round.participants).toEqual(['node1', 'node2']);
      expect(round.status).toBe('running');
      expect(round.startedAt).toBe(1000000);
      expect(round.localUpdates).toEqual({});
      expect(round.aggregatedModel).toBeNull();
      expect(round.metrics).toEqual({});
    });

    it('should only include idle nodes as participants', async () => {
      fl.initializeGlobalModel({});
      fl.registerNode('node1');
      fl.registerNode('node2');
      fl.registerNode('node3');

      const round = await fl.startRound();
      expect(round.participants).toEqual(['node1', 'node2', 'node3']);
    });

    it('should set node status to training and clone model', async () => {
      fl.initializeGlobalModel({ layers: [2, 1] });
      fl.registerNode('node1', { dataSize: 50 });
      fl.registerNode('node2', { dataSize: 30 });

      await fl.startRound();

      const node1 = fl.getNode('node1');
      const node2 = fl.getNode('node2');
      expect(node1.status).toBe('training');
      expect(node2.status).toBe('training');
      expect(node1.localModel).not.toBeNull();
      expect(node1.localModel.weights).toEqual(fl.globalModel.weights);
    });
  });

  describe('submitLocalUpdate', () => {
    beforeEach(() => {
      fl.initializeGlobalModel({ layers: [2, 1] });
      fl.registerNode('node1', { dataSize: 50 });
      fl.registerNode('node2', { dataSize: 30 });
    });

    it('should throw for unknown node', async () => {
      await fl.startRound();
      await expect(
        fl.submitLocalUpdate('ghost', { gradients: {} })
      ).rejects.toThrow('Node not found');
    });

    it('should throw if no active round', async () => {
      await expect(
        fl.submitLocalUpdate('node1', { gradients: {} })
      ).rejects.toThrow('No active round');
    });

    it('should record local update and set node idle', async () => {
      await fl.startRound();
      const gradients = { W0: [[0.1]], b0: [0.05] };

      const result = await fl.submitLocalUpdate('node1', {
        gradients,
        metrics: { loss: 0.5 }
      });

      expect(result.submitted).toBe(true);
      expect(result.allSubmitted).toBe(false);

      const node1 = fl.getNode('node1');
      expect(node1.gradients).toBe(gradients);
      expect(node1.contribution).toBe(1);
      expect(node1.status).toBe('idle');
      expect(node1.lastUpdate).toBe(1000000);

      const round = fl.getRound(1);
      expect(round.localUpdates.node1).toBeDefined();
      expect(round.localUpdates.node1.gradients).toBe(gradients);
      expect(round.localUpdates.node1.metrics).toEqual({ loss: 0.5 });
      expect(round.localUpdates.node1.dataSize).toBe(50);
    });

    it('should trigger aggregation when all nodes submit', async () => {
      await fl.startRound();

      await fl.submitLocalUpdate('node1', {
        gradients: { W0: [[0.1]], b0: [0.05] },
        metrics: { loss: 0.5 }
      });

      const result = await fl.submitLocalUpdate('node2', {
        gradients: { W0: [[0.2]], b0: [0.1] },
        metrics: { loss: 0.3 }
      });

      expect(result.allSubmitted).toBe(true);
      const round = fl.getRound(1);
      expect(round.status).toBe('completed');
      expect(round.completedAt).toBe(1000000);
      expect(round.duration).toBe(0);
      expect(fl.globalModel.version).toBe(1);
    });

    it('should call onRoundComplete after aggregation', async () => {
      const onRoundComplete = jest.fn();
      const customFl = new FederatedLearning({ onRoundComplete });
      customFl.initializeGlobalModel({ layers: [2, 1] });
      customFl.registerNode('node1', { dataSize: 50 });
      customFl.registerNode('node2', { dataSize: 30 });

      await customFl.startRound();
      await customFl.submitLocalUpdate('node1', { gradients: { W0: [[0.1]], b0: [0.05] } });
      await customFl.submitLocalUpdate('node2', { gradients: { W0: [[0.2]], b0: [0.1] } });

      expect(onRoundComplete).toHaveBeenCalledTimes(1);
      expect(onRoundComplete.mock.calls[0][0].status).toBe('completed');
    });

    it('should fallback to fedavg for unknown aggregation strategy', async () => {
      const unknownFl = new FederatedLearning({ aggregationStrategy: 'unknown' });
      unknownFl.initializeGlobalModel({ layers: [2, 1] });
      unknownFl.registerNode('node1', { dataSize: 50 });
      unknownFl.registerNode('node2', { dataSize: 30 });

      await unknownFl.startRound();
      await unknownFl.submitLocalUpdate('node1', { gradients: { W0: [[0.1]], b0: [0.05] } });
      await unknownFl.submitLocalUpdate('node2', { gradients: { W0: [[0.2]], b0: [0.1] } });

      const round = unknownFl.getRound(1);
      expect(round.status).toBe('completed');
      expect(unknownFl.globalModel.version).toBe(1);
    });

    it('should use default onConverged when none provided', async () => {
      const customFl = new FederatedLearning({ maxRounds: 1 });
      customFl.initializeGlobalModel({ layers: [2, 1] });
      customFl.registerNode('node1', { dataSize: 50 });
      customFl.registerNode('node2', { dataSize: 30 });

      await customFl.startRound();
      await customFl.submitLocalUpdate('node1', { gradients: { W0: [[0.1]], b0: [0.05] } });
      await customFl.submitLocalUpdate('node2', { gradients: { W0: [[0.2]], b0: [0.1] } });

      const round = customFl.getRound(1);
      expect(round.status).toBe('completed');
    });

    it('should call onConverged when maxRounds reached', async () => {
      const onConverged = jest.fn();
      const customFl = new FederatedLearning({ maxRounds: 1, onConverged });
      customFl.initializeGlobalModel({ layers: [2, 1] });
      customFl.registerNode('node1', { dataSize: 50 });
      customFl.registerNode('node2', { dataSize: 30 });

      await customFl.startRound();
      await customFl.submitLocalUpdate('node1', { gradients: { W0: [[0.1]], b0: [0.05] } });
      await customFl.submitLocalUpdate('node2', { gradients: { W0: [[0.2]], b0: [0.1] } });

      expect(onConverged).toHaveBeenCalledTimes(1);
      expect(onConverged.mock.calls[0][0]).toBe(customFl.globalModel);
    });
  });

  describe('_fedavg', () => {
    it('should aggregate weights using data size weighted average', () => {
      fl.initializeGlobalModel({ layers: [2, 1] });
      fl.globalModel.weights.W0 = [[1, 2]];
      fl.globalModel.weights.b0 = [3];

      const updates = [
        { gradients: { W0: [[0.1, 0.2]], b0: [0.3] }, dataSize: 100 },
        { gradients: { W0: [[0.05, 0.1]], b0: [0.15] }, dataSize: 100 }
      ];

      const result = fl._fedavg(updates);

      // W0[0][0] = 0.5*(1 - 0.01*0.1) + 0.5*(1 - 0.01*0.05) = 0.5*0.999 + 0.5*0.9995 = 0.99925
      const expectedW00 = 0.5 * (1 - 0.01 * 0.1) + 0.5 * (1 - 0.01 * 0.05);
      expect(result.weights.W0[0][0]).toBeCloseTo(expectedW00, 5);

      // b0[0] = 0.5*(3 - 0.01*0.3) + 0.5*(3 - 0.01*0.15)
      const expectedB0 = 0.5 * (3 - 0.01 * 0.3) + 0.5 * (3 - 0.01 * 0.15);
      expect(result.weights.b0[0]).toBeCloseTo(expectedB0, 5);
    });

    it('should handle single update', () => {
      fl.initializeGlobalModel({ layers: [2, 1] });
      fl.globalModel.weights.W0 = [[1, 2]];
      fl.globalModel.weights.b0 = [3];

      const updates = [
        { gradients: { W0: [[0.1, 0.2]], b0: [0.3] }, dataSize: 50 }
      ];

      const result = fl._fedavg(updates);
      expect(result.weights.W0[0][0]).toBeCloseTo(1 - 0.01 * 0.1, 5);
    });

    it('should use default dataSize of 1 when missing', () => {
      fl.initializeGlobalModel({ layers: [1, 1] });
      fl.globalModel.weights.W0 = [[5]];
      fl.globalModel.weights.b0 = [0];

      const updates = [
        { gradients: { W0: [[1]], b0: [1] } },
        { gradients: { W0: [[2]], b0: [2] } }
      ];

      const result = fl._fedavg(updates);
      const expected = 0.5 * (5 - 0.01 * 1) + 0.5 * (5 - 0.01 * 2);
      expect(result.weights.W0[0][0]).toBeCloseTo(expected, 5);
    });

    it('should skip weights with invalid shape', () => {
      fl.initializeGlobalModel({ layers: [1, 1] });
      fl.globalModel.weights.W_EMPTY = [];
      fl.globalModel.weights.W_NULL = null;

      const result = fl._fedavg([
        { gradients: { W0: [[0.1]], b0: [0.05] }, dataSize: 50 }
      ]);

      expect(result.weights.W_EMPTY).toBeUndefined();
      expect(result.weights.W_NULL).toBeUndefined();
      expect(result.weights.W0).toBeDefined();
    });

    it('should handle missing gradient entries gracefully', () => {
      fl.initializeGlobalModel({ layers: [2, 2] });
      const result = fl._fedavg([
        { gradients: {}, dataSize: 10 },
        { gradients: {}, dataSize: 10 }
      ]);
      expect(result.weights.W0[0][0]).toBeCloseTo(fl.globalModel.weights.W0[0][0], 5);
    });
  });

  describe('_fedprox', () => {
    it('should add proximal term to aggregated weights', () => {
      fl.initializeGlobalModel({ layers: [2, 1] });
      const initialW = [[1, 2]];
      fl.globalModel.weights.W0 = initialW;
      fl.globalModel.weights.b0 = [3];

      const updates = [
        { gradients: { W0: [[0.1, 0.2]], b0: [0.3] }, dataSize: 100 },
        { gradients: { W0: [[0.05, 0.1]], b0: [0.15] }, dataSize: 100 }
      ];

      const result = fl._fedprox(updates);
      const fedavgVal = 0.5 * (1 - 0.01 * 0.1) + 0.5 * (1 - 0.01 * 0.05);
      const expectedWithProx = fedavgVal + 0.01 * (fedavgVal - 1);

      expect(result.weights.W0[0][0]).toBeCloseTo(expectedWithProx, 5);
    });
  });

  describe('_cloneModel', () => {
    it('should deep clone model weights', () => {
      const model = {
        version: 1,
        weights: { W0: [[1, 2], [3, 4]] }
      };
      const clone = fl._cloneModel(model);
      expect(clone).toEqual(model);
      expect(clone.weights).not.toBe(model.weights);
      expect(clone.weights.W0).not.toBe(model.weights.W0);
      expect(clone.weights.W0[0]).not.toBe(model.weights.W0[0]);
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      fl.registerNode('alpha', { dataSize: 50 });
      fl.registerNode('beta', { dataSize: 30 });
      fl.initializeGlobalModel({ layers: [2, 1] });
    });

    it('getNode should return node or undefined', () => {
      expect(fl.getNode('alpha').id).toBe('alpha');
      expect(fl.getNode('ghost')).toBeUndefined();
    });

    it('getAllNodes should return all nodes', () => {
      const all = fl.getAllNodes();
      expect(all).toHaveLength(2);
    });

    it('getActiveNodes should return idle nodes', () => {
      expect(fl.getActiveNodes()).toHaveLength(2);
    });

    it('getGlobalModel should return the model', () => {
      expect(fl.getGlobalModel()).toBe(fl.globalModel);
    });

    it('getRound should find by number', async () => {
      await fl.startRound();
      const round = fl.getRound(1);
      expect(round).toBeDefined();
      expect(fl.getRound(99)).toBeUndefined();
    });

    it('getAllRounds should return copy of rounds array', () => {
      const roundsCopy = fl.getAllRounds();
      expect(roundsCopy).toEqual([]);
      roundsCopy.push('dummy');
      expect(fl.rounds.length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return stats with zeros when nothing happened', () => {
      const stats = fl.getStats();
      expect(stats.nodes.total).toBe(0);
      expect(stats.nodes.active).toBe(0);
      expect(stats.nodes.training).toBe(0);
      expect(stats.rounds.total).toBe(0);
      expect(stats.rounds.completed).toBe(0);
      expect(stats.rounds.current).toBe(0);
      expect(stats.model.version).toBe(0);
      expect(stats.model.createdAt).toBeUndefined();
    });

    it('should reflect registered nodes and completed rounds', async () => {
      fl.initializeGlobalModel({ layers: [2, 1] });
      fl.registerNode('n1', { dataSize: 10 });
      fl.registerNode('n2', { dataSize: 10 });

      await fl.startRound();
      await fl.submitLocalUpdate('n1', { gradients: { W0: [[0.1]], b0: [0.05] } });
      await fl.submitLocalUpdate('n2', { gradients: { W0: [[0.2]], b0: [0.1] } });

      const stats = fl.getStats();
      expect(stats.nodes.total).toBe(2);
      expect(stats.nodes.active).toBe(2);
      expect(stats.nodes.training).toBe(0);
      expect(stats.rounds.total).toBe(1);
      expect(stats.rounds.completed).toBe(1);
      expect(stats.rounds.current).toBe(1);
      expect(stats.model.version).toBe(1);
      expect(stats.model.createdAt).toBe(1000000);
    });
  });

  describe('destroy', () => {
    it('should clear all state', () => {
      fl.initializeGlobalModel({ layers: [2, 1] });
      fl.registerNode('n1');
      fl.registerNode('n2');
      fl.destroy();

      expect(fl.nodes.size).toBe(0);
      expect(fl.rounds).toEqual([]);
      expect(fl.globalModel).toBeNull();
    });
  });

  describe('_aggregate with fedprox strategy', () => {
    it('should use fedprox when strategy is fedprox', async () => {
      const customFl = new FederatedLearning({ aggregationStrategy: 'fedprox' });
      customFl.initializeGlobalModel({ layers: [2, 1] });
      customFl.registerNode('n1', { dataSize: 50 });
      customFl.registerNode('n2', { dataSize: 30 });

      const fedproxSpy = jest.spyOn(customFl, '_fedprox');
      await customFl.startRound();
      await customFl.submitLocalUpdate('n1', { gradients: { W0: [[0.1]], b0: [0.05] } });
      await customFl.submitLocalUpdate('n2', { gradients: { W0: [[0.2]], b0: [0.1] } });

      expect(fedproxSpy).toHaveBeenCalled();
      fedproxSpy.mockRestore();
    });
  });
});
