/**
 * ResponseCache 单元测试
 */

const { ResponseCache } = require('../../../src/integrations/openclaw/ResponseCache');

describe('ResponseCache', () => {
  let cache;

  beforeEach(() => {
    cache = new ResponseCache({
      maxSize: 10,
      defaultTTL: 60000,
      enabled: true
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('基本操作', () => {
    test('应该正确设置和获取缓存', () => {
      const params = {
        model: 'deepseek-web/deepseek-chat',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7
      };
      const data = { choices: [{ message: { content: 'Hi!' } }] };

      const result = cache.get(params);
      expect(result).toBeNull();

      cache.set(params, data);
      const cached = cache.get(params);
      expect(cached).toEqual(data);
    });

    test('相同的参数应该命中缓存', () => {
      const params = {
        model: 'claude-web/claude-sonnet-4-6',
        messages: [{ role: 'user', content: 'Test message' }],
        temperature: 0.5
      };

      cache.set(params, { result: 'first' });
      cache.set(params, { result: 'second' });

      const cached = cache.get(params);
      expect(cached.result).toBe('second');
    });

    test('不同的参数应该命中不同的缓存', () => {
      const params1 = { model: 'deepseek', messages: [{ role: 'user', content: 'Hello' }] };
      const params2 = { model: 'claude', messages: [{ role: 'user', content: 'Hello' }] };

      cache.set(params1, { result: 'from deepseek' });
      cache.set(params2, { result: 'from claude' });

      expect(cache.get(params1).result).toBe('from deepseek');
      expect(cache.get(params2).result).toBe('from claude');
    });
  });

  describe('TTL 过期', () => {
    test('缓存应该在 TTL 后过期', async () => {
      const shortCache = new ResponseCache({
        maxSize: 10,
        defaultTTL: 100,
        enabled: true
      });

      const params = { model: 'test', messages: [{ role: 'user', content: 'Hi' }] };
      shortCache.set(params, { result: 'test' });

      expect(shortCache.get(params)).toEqual({ result: 'test' });

      await new Promise(resolve => setTimeout(resolve, 150));
      expect(shortCache.get(params)).toBeNull();

      shortCache.destroy();
    });

    test('自定义 TTL 应该生效', async () => {
      const params = { model: 'test', messages: [{ role: 'user', content: 'Hi' }] };
      cache.set(params, { result: 'test' }, 50);

      await new Promise(resolve => setTimeout(resolve, 30));
      expect(cache.get(params)).toEqual({ result: 'test' });

      await new Promise(resolve => setTimeout(resolve, 30));
      expect(cache.get(params)).toBeNull();
    });
  });

  describe('LRU 驱逐', () => {
    test('超出最大大小时应该驱逐最旧的条目', () => {
      const smallCache = new ResponseCache({
        maxSize: 3,
        defaultTTL: 60000,
        enabled: true
      });

      for (let i = 0; i < 5; i++) {
        smallCache.set(
          { model: `model-${i}`, messages: [{ role: 'user', content: `msg-${i}` }] },
          { result: `result-${i}` }
        );
      }

      expect(smallCache.get({ model: 'model-0', messages: [{ role: 'user', content: 'msg-0' }] })).toBeNull();
      expect(smallCache.get({ model: 'model-4', messages: [{ role: 'user', content: 'msg-4' }] })).toEqual({ result: 'result-4' });

      smallCache.destroy();
    });

    test('访问应该更新 LRU 顺序', () => {
      const smallCache = new ResponseCache({
        maxSize: 3,
        defaultTTL: 60000,
        enabled: true
      });

      smallCache.set({ model: 'a' }, { v: 1 });
      smallCache.set({ model: 'b' }, { v: 2 });
      smallCache.set({ model: 'c' }, { v: 3 });

      smallCache.get({ model: 'a' });

      smallCache.set({ model: 'd' }, { v: 4 });

      expect(smallCache.get({ model: 'a' })).toEqual({ v: 1 });
      expect(smallCache.get({ model: 'b' })).toBeNull();

      smallCache.destroy();
    });
  });

  describe('统计', () => {
    test('应该正确追踪命中和未命中', () => {
      cache.set({ model: 'test', messages: [] }, { data: 'test' });

      cache.get({ model: 'test', messages: [] });
      cache.get({ model: 'test', messages: [] });
      cache.get({ model: 'nonexistent', messages: [] });

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    test('应该正确计算命中率', () => {
      cache.set({ model: 'test', messages: [] }, { data: 'test' });
      
      for (let i = 0; i < 3; i++) {
        cache.get({ model: 'test', messages: [] });
      }
      cache.get({ model: 'miss', messages: [] });

      const stats = cache.getStats();
      expect(stats.hitRate).toBe('0.7500');
    });
  });

  describe('失效', () => {
    test('应该按模型失效', () => {
      cache.set({ model: 'deepseek', messages: [] }, { r: 1 });
      cache.set({ model: 'claude', messages: [] }, { r: 2 });
      cache.set({ model: 'deepseek', messages: [{ role: 'user', content: 'other' }] }, { r: 3 });

      const count = cache.invalidate('deepseek');

      expect(count).toBe(2);
      expect(cache.get({ model: 'deepseek', messages: [] })).toBeNull();
      expect(cache.get({ model: 'claude', messages: [] })).toEqual({ r: 2 });
    });

    test('应该清除所有缓存', () => {
      cache.set({ model: 'a' }, { v: 1 });
      cache.set({ model: 'b' }, { v: 2 });

      const count = cache.clear();

      expect(count).toBe(2);
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('禁用缓存', () => {
    test('禁用时 get 应该返回 null', () => {
      const disabledCache = new ResponseCache({ enabled: false });

      disabledCache.set({ model: 'test', messages: [] }, { data: 'test' });
      expect(disabledCache.get({ model: 'test', messages: [] })).toBeNull();

      disabledCache.destroy();
    });

    test('禁用时 set 应该不存储', () => {
      const disabledCache = new ResponseCache({ enabled: false });

      disabledCache.set({ model: 'test', messages: [] }, { data: 'test' });
      expect(disabledCache.getStats().size).toBe(0);

      disabledCache.destroy();
    });
  });

  describe('安全性', () => {
    test('应该处理大量消息', () => {
      const messages = [];
      for (let i = 0; i < 50; i++) {
        messages.push({ role: 'user', content: `Message ${i}: ${'x'.repeat(100)}` });
      }

      const params = { model: 'test', messages };
      cache.set(params, { result: 'success' });

      const cached = cache.get(params);
      expect(cached.result).toBe('success');
    });

    test('应该处理特殊字符', () => {
      const params = {
        model: 'test-model',
        messages: [{ role: 'user', content: '你好世界! 🎉 <script>alert(1)</script>' }]
      };

      cache.set(params, { result: '特殊字符测试' });
      expect(cache.get(params)).toEqual({ result: '特殊字符测试' });
    });
  });
});
