const { PricePredictor } = require('../../src/industry/ecommerce/PricePredictor');

describe('PricePredictor', () => {
  let predictor;

  beforeEach(() => {
    predictor = new PricePredictor();
  });

  function addHistoryPoints(count, basePrice = 100, variance = 0) {
    for (let i = 0; i < count; i++) {
      predictor.addPricePoint('prod_1', basePrice + (i * 2) + (Math.random() * variance));
    }
  }

  describe('constructor', () => {
    it('should initialize with default options', () => {
      expect(predictor.history).toBeInstanceOf(Map);
      expect(predictor.predictions).toBeInstanceOf(Map);
      expect(predictor.maxHistory).toBe(1000);
      expect(predictor.predictionHorizon).toBe(7);
    });

    it('should accept custom options', () => {
      const custom = new PricePredictor({ maxHistory: 500, predictionHorizon: 14 });
      expect(custom.maxHistory).toBe(500);
      expect(custom.predictionHorizon).toBe(14);
    });
  });

  describe('addPricePoint', () => {
    it('should add a price point to product history', () => {
      predictor.addPricePoint('prod_1', 100);
      const history = predictor.history.get('prod_1');
      expect(history).toHaveLength(1);
      expect(history[0].price).toBe(100);
    });

    it('should parse float from string input', () => {
      predictor.addPricePoint('prod_1', '99.99');
      const history = predictor.history.get('prod_1');
      expect(history[0].price).toBe(99.99);
    });

    it('should trim history beyond maxHistory', () => {
      const p = new PricePredictor({ maxHistory: 3 });
      for (let i = 0; i < 10; i++) {
        p.addPricePoint('prod_1', 100 + i);
      }
      const history = p.history.get('prod_1');
      expect(history).toHaveLength(3);
    });
  });

  describe('predict', () => {
    it('should return error for insufficient data (< 3 points)', () => {
      predictor.addPricePoint('prod_1', 100);
      predictor.addPricePoint('prod_1', 110);
      const result = predictor.predict('prod_1');
      expect(result.error).toBeTruthy();
      expect(result.predictions).toEqual([]);
    });

    it('should return error for no data', () => {
      const result = predictor.predict('prod_1');
      expect(result.error).toBeTruthy();
    });

    it('should generate predictions with sufficient data', () => {
      addHistoryPoints(20, 100);
      const result = predictor.predict('prod_1', 3);
      expect(result.productId).toBe('prod_1');
      expect(result.predictions).toHaveLength(3);
      expect(result.trend).toBeTruthy();
      expect(result.volatility).toBeGreaterThanOrEqual(0);
      expect(result.recommendation).toBeTruthy();
      expect(result.generatedAt).toBeTruthy();
    });

    it('should store prediction in cache', () => {
      addHistoryPoints(10, 100);
      predictor.predict('prod_1', 2);
      expect(predictor.predictions.has('prod_1')).toBe(true);
    });

    it('should generate confidence values', () => {
      addHistoryPoints(20, 100);
      const result = predictor.predict('prod_1', 5);
      for (const p of result.predictions) {
        expect(p.confidence).toBeGreaterThanOrEqual(0.1);
        expect(p.confidence).toBeLessThanOrEqual(0.99);
      }
    });

    it('should have sources in each prediction', () => {
      addHistoryPoints(20, 100);
      const result = predictor.predict('prod_1', 1);
      expect(result.predictions[0].sources).toBeDefined();
      expect(result.predictions[0].sources.linear).toBeDefined();
      expect(result.predictions[0].sources.movingAvg).toBeDefined();
      expect(result.predictions[0].sources.seasonal).toBeDefined();
    });

    it('should generate correct number of predictions for custom days', () => {
      addHistoryPoints(30, 100);
      const result = predictor.predict('prod_1', 10);
      expect(result.predictions).toHaveLength(10);
    });
  });

  describe('_calculateOverallTrend', () => {
    it('should return rising for moderate increase', () => {
      const predictions = [
        { price: 100 }, { price: 100 }, { price: 100 }, { price: 100 }, { price: 103 }
      ];
      expect(predictor._calculateOverallTrend(predictions)).toBe('rising');
    });

    it('should return falling for moderate decrease', () => {
      const predictions = [
        { price: 100 }, { price: 100 }, { price: 100 }, { price: 100 }, { price: 97 }
      ];
      expect(predictor._calculateOverallTrend(predictions)).toBe('falling');
    });
  });

  describe('predict with different trends', () => {
    it('should detect rising trend', () => {
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        predictor.addPricePoint('rising', 100 + i * 10, now + i * 86400000);
      }
      const result = predictor.predict('rising', 5);
      expect(result.trend).toBe('strong_rising');
    });

    it('should detect falling trend', () => {
      const now = Date.now();
      for (let i = 0; i < 15; i++) {
        predictor.addPricePoint('falling', 200 - i * 10, now + i * 86400000);
      }
      const result = predictor.predict('falling', 5);
      expect(result.trend).toBe('strong_falling');
    });

    it('should detect stable trend with equal prices', () => {
      const now = Date.now();
      for (let i = 0; i < 20; i++) {
        predictor.addPricePoint('stable', 100, now + i * 86400000);
      }
      const result = predictor.predict('stable', 5);
      expect(result.predictions.length).toBe(5);
    });

    it('should detect falling trend with crash scenario', () => {
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        predictor.addPricePoint('crash', 300 + i * 50, now + i * 3600000);
      }
      for (let i = 0; i < 15; i++) {
        predictor.addPricePoint('crash', 30, now + (5 + i) * 3600000);
      }
      const result = predictor.predict('crash', 3);
      for (const p of result.predictions) {
        expect(p.trend).toBe('falling');
      }
    });

    it('should detect stable trend with small dataset', () => {
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        predictor.addPricePoint('flat', 100, now + i * 86400000);
      }
      const result = predictor.predict('flat', 5);
      for (const p of result.predictions) {
        expect(p.trend).toBe('stable');
      }
    });
  });

  describe('_calculateVolatility', () => {
    it('should return 0 for less than 2 prices', () => {
      expect(predictor._calculateVolatility([100])).toBe(0);
    });

    it('should return 0 for constant prices', () => {
      expect(predictor._calculateVolatility([100, 100, 100])).toBe(0);
    });

    it('should return positive value for varying prices', () => {
      const vol = predictor._calculateVolatility([100, 200, 100, 200]);
      expect(vol).toBeGreaterThan(0);
    });
  });

  describe('_generateRecommendation', () => {
    it('should recommend buy_now for >10% increase', () => {
      const rec = predictor._generateRecommendation(100, [
        { price: 100 }, { price: 120 }
      ]);
      expect(rec.action).toBe('buy_now');
    });

    it('should recommend buy_soon for >3% increase', () => {
      const rec = predictor._generateRecommendation(100, [
        { price: 100 }, { price: 106 }
      ]);
      expect(rec.action).toBe('buy_soon');
    });

    it('should recommend wait for >10% decrease', () => {
      const rec = predictor._generateRecommendation(100, [
        { price: 100 }, { price: 80 }
      ]);
      expect(rec.action).toBe('wait');
    });

    it('should recommend wait_briefly for >3% decrease', () => {
      const rec = predictor._generateRecommendation(100, [
        { price: 100 }, { price: 95 }
      ]);
      expect(rec.action).toBe('wait_briefly');
    });

    it('should recommend hold for stable prices', () => {
      const rec = predictor._generateRecommendation(100, [
        { price: 100 }, { price: 101 }
      ]);
      expect(rec.action).toBe('hold');
    });
  });

  describe('_detectSeasonality', () => {
    it('should return last price for insufficient data (< 14 points)', () => {
      const prices = Array(10).fill(100);
      const seasonality = predictor._detectSeasonality(prices, 7);
      expect(seasonality.predict(1)).toBe(100);
    });
  });

  describe('getPrediction', () => {
    it('should return stored prediction', () => {
      addHistoryPoints(10, 100);
      predictor.predict('prod_1', 2);
      const prediction = predictor.getPrediction('prod_1');
      expect(prediction.productId).toBe('prod_1');
    });

    it('should return null for unpredicted product', () => {
      expect(predictor.getPrediction('nonexistent')).toBeNull();
    });
  });

  describe('getAllPredictions', () => {
    it('should return all stored predictions', () => {
      addHistoryPoints(10, 100);
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 10; j++) {
          predictor.addPricePoint(`prod_${i}`, 100 + j);
        }
        predictor.predict(`prod_${i}`, 2);
      }
      expect(predictor.getAllPredictions()).toHaveLength(5);
    });
  });

  describe('getRecommendations', () => {
    it('should return sorted recommendations', () => {
      const prices = Array(15).fill(100).map((v, i) => v + i * 10);
      for (const p of prices) {
        predictor.addPricePoint('falling', 300 - p);
      }
      predictor.addPricePoint('stable', 100);
      predictor.addPricePoint('stable', 101);
      predictor.addPricePoint('stable', 102);
      predictor.predict('falling', 5);
      predictor.predict('stable', 5);
      predictor.predictions.set('no-recs', { currentPrice: 100, predictions: [] });
      const recs = predictor.getRecommendations();
      expect(recs.length).toBe(2);
    });

    it('should handle priority fallback for falsy and unknown actions', () => {
      const p2 = new PricePredictor();
      p2.predictions.set('wait_item', {
        recommendation: { action: 'wait' },
        predictions: [{ price: 100 }],
        currentPrice: 100,
        trend: 'stable'
      });
      p2.predictions.set('buy_now_item', {
        recommendation: { action: 'buy_now' },
        predictions: [{ price: 100 }],
        currentPrice: 100,
        trend: 'stable'
      });
      p2.predictions.set('hold_item', {
        recommendation: { action: 'hold' },
        predictions: [{ price: 100 }],
        currentPrice: 100,
        trend: 'stable'
      });
      const recs = p2.getRecommendations();
      expect(recs).toHaveLength(3);
      expect(recs[0].action).toBe('hold');
      expect(recs[1].action).toBe('wait');
      expect(recs[2].action).toBe('buy_now');
    });

    it('should return empty array when no predictions exist', () => {
      expect(predictor.getRecommendations()).toEqual([]);
    });
  });

  describe('destroy', () => {
    it('should clear all history and predictions', () => {
      addHistoryPoints(10, 100);
      predictor.predict('prod_1', 2);
      predictor.destroy();
      expect(predictor.history.size).toBe(0);
      expect(predictor.predictions.size).toBe(0);
    });
  });
});
