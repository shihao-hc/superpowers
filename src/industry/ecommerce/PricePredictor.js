class PricePredictor {
  constructor(options = {}) {
    this.history = new Map();
    this.predictions = new Map();
    this.maxHistory = options.maxHistory || 1000;
    this.predictionHorizon = options.predictionHorizon || 7;
  }

  addPricePoint(productId, price, timestamp = Date.now()) {
    if (!this.history.has(productId)) {
      this.history.set(productId, []);
    }

    const points = this.history.get(productId);
    points.push({ price: parseFloat(price), timestamp });

    if (points.length > this.maxHistory) {
      this.history.set(productId, points.slice(-this.maxHistory));
    }
  }

  predict(productId, days = 7) {
    const points = this.history.get(productId);
    if (!points || points.length < 3) {
      return { error: '数据不足，至少需要3个数据点', predictions: [] };
    }

    const prices = points.map(p => p.price);
    const timestamps = points.map(p => p.timestamp);

    const linearPrediction = this._linearRegression(prices, timestamps, days);
    const movingAvgPrediction = this._movingAverage(prices, days);
    const seasonalPrediction = this._detectSeasonality(prices, days);

    const predictions = [];
    const lastPrice = prices[prices.length - 1];

    for (let i = 1; i <= days; i++) {
      const futureTimestamp = Date.now() + i * 86400000;

      const linearPrice = linearPrediction.predict(i);
      const movingAvgPrice = movingAvgPrediction;
      const seasonalPrice = seasonalPrediction.predict(i);

      const weightedPrice = (
        linearPrice * 0.4 +
        movingAvgPrice * 0.3 +
        seasonalPrice * 0.3
      );

      const confidence = this._calculateConfidence(prices, i);

      predictions.push({
        day: i,
        date: new Date(futureTimestamp).toISOString().split('T')[0],
        price: parseFloat(weightedPrice.toFixed(2)),
        confidence,
        trend: weightedPrice > lastPrice ? 'rising' : weightedPrice < lastPrice ? 'falling' : 'stable',
        sources: {
          linear: parseFloat(linearPrice.toFixed(2)),
          movingAvg: parseFloat(movingAvgPrice.toFixed(2)),
          seasonal: parseFloat(seasonalPrice.toFixed(2))
        }
      });
    }

    const prediction = {
      productId,
      currentPrice: lastPrice,
      predictions,
      trend: this._calculateOverallTrend(predictions),
      volatility: this._calculateVolatility(prices),
      recommendation: this._generateRecommendation(lastPrice, predictions),
      generatedAt: Date.now()
    };

    this.predictions.set(productId, prediction);

    return prediction;
  }

  _linearRegression(prices, timestamps, days) {
    const n = prices.length;

    const xMean = timestamps.reduce((a, b) => a + b, 0) / n;
    const yMean = prices.reduce((a, b) => a + b, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (timestamps[i] - xMean) * (prices[i] - yMean);
      denominator += (timestamps[i] - xMean) ** 2;
    }

    const slope = denominator !== 0 ? numerator / denominator : 0;
    const intercept = yMean - slope * xMean;

    return {
      slope,
      intercept,
      predict: (dayOffset) => {
        const futureTime = Date.now() + dayOffset * 86400000;
        return slope * futureTime + intercept;
      }
    };
  }

  _movingAverage(prices, days) {
    const windowSize = Math.min(7, prices.length);
    const recentPrices = prices.slice(-windowSize);
    return recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length;
  }

  _detectSeasonality(prices, days) {
    if (prices.length < 14) {
      return { predict: () => prices[prices.length - 1] };
    }

    const weeklyAvg = [];
    for (let i = 0; i < Math.min(4, Math.floor(prices.length / 7)); i++) {
      const weekStart = prices.length - (i + 1) * 7;
      const weekEnd = prices.length - i * 7;
      const weekPrices = prices.slice(Math.max(0, weekStart), weekEnd);
      weeklyAvg.push(weekPrices.reduce((a, b) => a + b, 0) / weekPrices.length);
    }

    const avgWeekly = weeklyAvg.reduce((a, b) => a + b, 0) / weeklyAvg.length;
    const lastPrice = prices[prices.length - 1];

    return {
      predict: (dayOffset) => {
        const weekDay = (new Date().getDay() + dayOffset) % 7;
        const seasonalFactor = weekDay >= 5 ? 1.02 : 0.99;
        return lastPrice * seasonalFactor;
      }
    };
  }

  _calculateConfidence(prices, dayOffset) {
    const volatility = this._calculateVolatility(prices);
    const dataPoints = prices.length;

    let confidence = 0.9;

    confidence -= volatility * 0.3;
    confidence -= dayOffset * 0.02;
    confidence += Math.min(dataPoints / 100, 0.2);

    return Math.max(0.1, Math.min(0.99, confidence));
  }

  _calculateVolatility(prices) {
    if (prices.length < 2) return 0;

    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;

    return Math.sqrt(variance);
  }

  _calculateOverallTrend(predictions) {
    const firstPrice = predictions[0].price;
    const lastPrice = predictions[predictions.length - 1].price;
    const change = ((lastPrice - firstPrice) / firstPrice) * 100;

    if (change > 5) return 'strong_rising';
    if (change > 1) return 'rising';
    if (change < -5) return 'strong_falling';
    if (change < -1) return 'falling';
    return 'stable';
  }

  _generateRecommendation(currentPrice, predictions) {
    const lastPrediction = predictions[predictions.length - 1];
    const change = ((lastPrediction.price - currentPrice) / currentPrice) * 100;

    if (change > 10) {
      return { action: 'buy_now', reason: '预计大幅上涨，建议立即采购' };
    }
    if (change > 3) {
      return { action: 'buy_soon', reason: '预计小幅上涨，建议尽快采购' };
    }
    if (change < -10) {
      return { action: 'wait', reason: '预计大幅下跌，建议等待' };
    }
    if (change < -3) {
      return { action: 'wait_briefly', reason: '预计小幅下跌，可稍等' };
    }
    return { action: 'hold', reason: '价格稳定，可正常操作' };
  }

  getPrediction(productId) {
    return this.predictions.get(productId) || null;
  }

  getAllPredictions() {
    return Array.from(this.predictions.values());
  }

  getRecommendations() {
    const recommendations = [];

    for (const [productId, prediction] of this.predictions) {
      if (prediction.recommendation) {
        recommendations.push({
          productId,
          currentPrice: prediction.currentPrice,
          predictedPrice: prediction.predictions[prediction.predictions.length - 1]?.price,
          trend: prediction.trend,
          ...prediction.recommendation
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priority = { buy_now: 0, buy_soon: 1, hold: 2, wait_briefly: 3, wait: 4 };
      return (priority[a.action] || 5) - (priority[b.action] || 5);
    });
  }

  destroy() {
    this.history.clear();
    this.predictions.clear();
  }
}

module.exports = { PricePredictor };
