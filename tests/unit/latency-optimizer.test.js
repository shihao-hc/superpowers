const LatencyOptimizer = require('../../src/ai/LatencyOptimizer');

describe('LatencyOptimizer', () => {
  let opt;

  beforeEach(() => {
    opt = new LatencyOptimizer({ targetLatency: 50, maxLatency: 100 });
  });

  describe('constructor', () => {
    it('should create instance with defaults', () => {
      const o = new LatencyOptimizer();
      expect(o.options.maxLatency).toBe(50);
      expect(o.options.targetLatency).toBe(30);
      expect(o.options.enablePrecomputation).toBe(true);
      expect(o.latencyHistory).toEqual([]);
    });

    it('should apply custom options', () => {
      expect(opt.options.targetLatency).toBe(50);
      expect(opt.options.maxLatency).toBe(100);
    });
  });

  describe('_classifyInput', () => {
    it('should classify questions', () => {
      expect(opt._classifyInput('这是什么？')).toBe('question');
      expect(opt._classifyInput('如何做')).toBe('question');
    });

    it('should classify commands', () => {
      expect(opt._classifyInput('开始播放')).toBe('command');
      expect(opt._classifyInput('停止')).toBe('command');
    });

    it('should classify greetings', () => {
      expect(opt._classifyInput('你好')).toBe('greeting');
      expect(opt._classifyInput('hello')).toBe('greeting');
    });

    it('should classify chat as default', () => {
      expect(opt._classifyInput('今天天气')).toBe('chat');
    });
  });

  describe('_analyzeEmotion', () => {
    it('should detect positive emotion', async () => {
      const result = await opt._analyzeEmotion('好棒');
      expect(result.sentiment).toBe('positive');
    });

    it('should detect negative emotion', async () => {
      const result = await opt._analyzeEmotion('坏');
      expect(result.sentiment).toBe('negative');
    });

    it('should return neutral by default', async () => {
      const result = await opt._analyzeEmotion('桌子');
      expect(result.sentiment).toBe('neutral');
    });
  });

  describe('_extractEntities', () => {
    it('should extract game topics', async () => {
      const result = await opt._extractEntities('玩Minecraft');
      expect(result.topics).toContain('game');
    });
  });

  describe('_detectIntent', () => {
    it('should map classifications to intents', async () => {
      expect(await opt._detectIntent('你好')).toBe('respond_greeting');
      expect(await opt._detectIntent('开始')).toBe('execute');
      expect(await opt._detectIntent('这是什么')).toBe('answer');
    });
  });

  describe('precomputeResponses', () => {
    it('should cache common responses', () => {
      opt.precomputeResponses(['你好', '嗨']);
      expect(opt.commonResponses.has('你好')).toBe(true);
      expect(opt.commonResponses.has('嗨')).toBe(true);
    });
  });

  describe('processInput', () => {
    it('should return generated response', async () => {
      const result = await opt.processInput('你好');
      expect(result).toHaveProperty('content');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('latency');
    });

    it('should return cached response on repeat', async () => {
      opt.responseCache.set('你好', '预缓存回应');
      const result = await opt.processInput('你好');
      expect(result.source).toBe('cached');
      expect(result.content).toBe('预缓存回应');
    });
  });

  describe('getMetrics', () => {
    it('should return metrics with defaults', () => {
      const metrics = opt.getMetrics();
      expect(metrics).toHaveProperty('average');
      expect(metrics).toHaveProperty('p95');
      expect(metrics).toHaveProperty('cacheHitRate');
    });

    it('should report cache hit rate with populated cache', () => {
      opt._cacheResponse('test', 'value');
      const metrics = opt.getMetrics();
      expect(metrics.cacheHitRate).toBe(0);
    });
  });

  describe('streamResponse', () => {
    it('should yield chunks', async () => {
      const stream = opt.streamResponse('test', {});
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk.type);
        if (chunk.type === 'complete') {break;}
      }
      expect(chunks).toContain('start');
      expect(chunks).toContain('complete');
    });

    it('should reset isStreaming after stream completes', async () => {
      const stream = opt.streamResponse('test', {});
      // eslint-disable-next-line no-empty
      for await (const _ of stream) {}
      expect(opt.isStreaming).toBe(false);
    });
  });

  describe('_getEmpathy', () => {
    it('should return empathy for negative sentiment', async () => {
      const result = await opt.processInput('讨厌');
      expect(result.content).toBe('别难过，我在呢~');
    });
  });

  describe('cache eviction', () => {
    it('should evict oldest entry when cache exceeds 1000', () => {
      for (let i = 0; i < 1002; i++) {
        opt._cacheResponse(`key${i}`, `value${i}`);
      }
      expect(opt.responseCache.size).toBe(1001);
      expect(opt.responseCache.has('key0')).toBe(false);
    });
  });

  describe('latency history limits', () => {
    it('should cap latency history at 100 entries', async () => {
      for (let i = 0; i < 101; i++) {
        await opt.processInput(`test${i}`);
      }
      expect(opt.latencyHistory.length).toBe(100);
    });
  });
});
