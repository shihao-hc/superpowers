const {
  escapeHtml,
  safeJsonParse,
  escapeRegex,
  createSafeRegex,
  InputValidator,
  TimerManager,
  EnhancedEventBus,
  ErrorHandler,
  RetryHandler,
  ConfigManager,
  splitLines,
  readFileLines
} = require('../../src/utils/UltraWorkUtils');

describe('UltraWorkUtils', () => {
  describe('escapeHtml', () => {
    test('escapes HTML special chars', () => {
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    test('escapes &, <, >, ", \'', () => {
      expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#x27;');
    });

    test('returns empty string for falsy input', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml('')).toBe('');
    });

    test('converts non-string to string', () => {
      expect(escapeHtml(42)).toBe('42');
    });
  });

  describe('safeJsonParse', () => {
    test('parses valid JSON', () => {
      const result = safeJsonParse('{"a":1,"b":"test"}');
      expect(result).toEqual({ a: 1, b: 'test' });
    });

    test('returns default for invalid JSON', () => {
      const result = safeJsonParse('not json', { fallback: true });
      expect(result).toEqual({ fallback: true });
    });

    test('returns null default for invalid JSON when no default given', () => {
      const result = safeJsonParse('not json');
      expect(result).toBeNull();
    });

    test('parses array JSON', () => {
      const result = safeJsonParse('[1,2,3]');
      expect(result).toEqual([1, 2, 3]);
    });

    test('prevents prototype pollution', () => {
      const result = safeJsonParse('{"__proto__":{"polluted":true}}');
      expect(result.polluted).toBeUndefined();
      expect(Object.getPrototypeOf(result)).toBeNull();
    });

    test('parses JSON primitive', () => {
      expect(safeJsonParse('42')).toBe(42);
      expect(safeJsonParse('"hello"')).toBe('hello');
      expect(safeJsonParse('true')).toBe(true);
      expect(safeJsonParse('null')).toBeNull();
    });
  });

  describe('escapeRegex', () => {
    test('escapes special regex chars', () => {
      expect(escapeRegex('.*+?^${}()|[]\\')).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
    });

    test('returns empty for falsy', () => {
      expect(escapeRegex(null)).toBe('');
      expect(escapeRegex('')).toBe('');
    });
  });

  describe('createSafeRegex', () => {
    test('creates regex from pattern with wildcard', () => {
      const re = createSafeRegex('hello*world');
      expect(re.test('helloXworld')).toBe(true);
      expect(re.test('helloworld')).toBe(true);
      expect(re.test('hello-world')).toBe(true);
    });

    test('escapes special chars in pattern', () => {
      const re = createSafeRegex('test.com');
      expect(re.test('testXcom')).toBe(false);
      expect(re.test('test.com')).toBe(true);
    });
  });

  describe('InputValidator', () => {
    describe('validateEmail', () => {
      test('validates correct emails', () => {
        expect(InputValidator.validateEmail('user@example.com')).toBe(true);
        expect(InputValidator.validateEmail('a.b@c.co')).toBe(true);
      });

      test('rejects invalid emails', () => {
        expect(InputValidator.validateEmail('notanemail')).toBe(false);
        expect(InputValidator.validateEmail('@example.com')).toBe(false);
        expect(InputValidator.validateEmail('user@')).toBe(false);
      });
    });

    describe('validateUrl', () => {
      test('validates correct URLs', () => {
        expect(InputValidator.validateUrl('https://example.com')).toBe(true);
        expect(InputValidator.validateUrl('http://localhost:3000')).toBe(true);
      });

      test('rejects invalid URLs', () => {
        expect(InputValidator.validateUrl('not a url')).toBe(false);
        expect(InputValidator.validateUrl('')).toBe(false);
      });
    });

    describe('validateStringLength', () => {
      test('validates within range', () => {
        expect(InputValidator.validateStringLength('hello', 1, 10)).toBe(true);
        expect(InputValidator.validateStringLength('hi', 0, 5)).toBe(true);
      });

      test('rejects out of range', () => {
        expect(InputValidator.validateStringLength('', 1, 10)).toBe(false);
        expect(InputValidator.validateStringLength('toolong', 0, 3)).toBe(false);
      });

      test('rejects non-string', () => {
        expect(InputValidator.validateStringLength(123, 0, 10)).toBe(false);
      });

      test('uses default min/max', () => {
        expect(InputValidator.validateStringLength('hello')).toBe(true);
        expect(InputValidator.validateStringLength('')).toBe(true);
      });
    });

    describe('sanitizeHtml', () => {
      test('delegates to escapeHtml', () => {
        expect(InputValidator.sanitizeHtml('<tag>')).toBe('&lt;tag&gt;');
      });
    });
  });

  describe('TimerManager', () => {
    let tm;

    beforeEach(() => {
      tm = new TimerManager();
    });

    afterEach(() => {
      tm.cleanup();
    });

    test('setTimeout creates and tracks timer', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      tm.setTimeout(fn, 100);
      expect(tm.timers.size).toBe(1);
      jest.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalled();
      jest.useRealTimers();
    });

    test('setTimeout removes timer from set after execution', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      tm.setTimeout(fn, 100);
      jest.advanceTimersByTime(100);
      expect(tm.timers.size).toBe(0);
      jest.useRealTimers();
    });

    test('setTimeout callback error does not throw', () => {
      jest.useFakeTimers();
      const fn = jest.fn().mockImplementation(() => { throw new Error('fail'); });
      expect(() => {
        tm.setTimeout(fn, 100);
        jest.advanceTimersByTime(100);
      }).not.toThrow();
      jest.useRealTimers();
    });

    test('setInterval creates and tracks interval', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      tm.setInterval(fn, 100);
      expect(tm.intervals.size).toBe(1);
      jest.advanceTimersByTime(300);
      expect(fn).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });

    test('setInterval callback error does not throw', () => {
      jest.useFakeTimers();
      const fn = jest.fn().mockImplementation(() => { throw new Error('fail'); });
      expect(() => {
        tm.setInterval(fn, 100);
        jest.advanceTimersByTime(100);
      }).not.toThrow();
      jest.useRealTimers();
    });

    test('clearTimeout removes timer', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      const id = tm.setTimeout(fn, 100);
      tm.clearTimeout(id);
      expect(tm.timers.size).toBe(0);
      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    test('clearInterval removes interval', () => {
      jest.useFakeTimers();
      const fn = jest.fn();
      const id = tm.setInterval(fn, 100);
      tm.clearInterval(id);
      jest.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    test('cleanup removes all timers and intervals', () => {
      jest.useFakeTimers();
      tm.setTimeout(() => {}, 100);
      tm.setInterval(() => {}, 100);
      tm.cleanup();
      expect(tm.timers.size).toBe(0);
      expect(tm.intervals.size).toBe(0);
      jest.useRealTimers();
    });

    test('getStats returns counts', () => {
      jest.useFakeTimers();
      tm.setTimeout(() => {}, 100);
      tm.setInterval(() => {}, 100);
      const stats = tm.getStats();
      expect(stats.activeTimers).toBe(1);
      expect(stats.activeIntervals).toBe(1);
      expect(stats.total).toBe(2);
      jest.useRealTimers();
    });
  });

  describe('EnhancedEventBus', () => {
    let bus;

    beforeEach(() => {
      bus = new EnhancedEventBus();
    });

    test('on registers listener', () => {
      const fn = jest.fn();
      bus.on('test', fn);
      bus.emit('test', 'data');
      expect(fn).toHaveBeenCalledWith('data');
    });

    test('on returns unsubscribe function', () => {
      const fn = jest.fn();
      const unsubscribe = bus.on('test', fn);
      unsubscribe();
      bus.emit('test', 'data');
      expect(fn).not.toHaveBeenCalled();
    });

    test('once only fires once', () => {
      const fn = jest.fn();
      bus.once('test', fn);
      bus.emit('test', 'first');
      bus.emit('test', 'second');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('once works with multiple listeners on same event', () => {
      const fn1 = jest.fn();
      const fn2 = jest.fn();
      bus.once('test', fn1);
      bus.once('test', fn2);
      bus.emit('test', 'data');
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    test('off removes listener', () => {
      const fn = jest.fn();
      bus.on('test', fn);
      bus.off('test', fn);
      bus.emit('test', 'data');
      expect(fn).not.toHaveBeenCalled();
    });

    test('off removes once listener', () => {
      const fn = jest.fn();
      bus.once('test', fn);
      bus.off('test', fn);
      bus.emit('test', 'data');
      expect(fn).not.toHaveBeenCalled();
    });

    test('emit stores history', () => {
      bus.emit('evt', { x: 1 });
      expect(bus.history.length).toBe(1);
      expect(bus.history[0].event).toBe('evt');
      expect(bus.history[0].data).toEqual({ x: 1 });
    });

    test('history is bounded', () => {
      bus.maxHistory = 3;
      bus.emit('e1', 1);
      bus.emit('e2', 2);
      bus.emit('e3', 3);
      bus.emit('e4', 4);
      expect(bus.history.length).toBe(3);
      expect(bus.history[0].event).toBe('e2');
    });

    test('getHistory returns copy', () => {
      bus.emit('evt', 'data');
      const hist = bus.getHistory();
      hist.push('fake');
      expect(bus.history.length).toBe(1);
    });

    test('listener errors do not crash emit', () => {
      const fn1 = jest.fn().mockImplementation(() => { throw new Error('fail'); });
      const fn2 = jest.fn();
      bus.on('test', fn1);
      bus.on('test', fn2);
      expect(() => bus.emit('test', 'data')).not.toThrow();
      expect(fn2).toHaveBeenCalled();
    });

    test('once listener errors do not crash emit', () => {
      const fn = jest.fn().mockImplementation(() => { throw new Error('fail'); });
      bus.once('test', fn);
      expect(() => bus.emit('test', 'data')).not.toThrow();
      expect(bus.onceListeners.size).toBe(0);
    });

    test('removeAllListeners removes all', () => {
      bus.on('a', jest.fn());
      bus.once('b', jest.fn());
      bus.removeAllListeners();
      expect(bus.listeners.size).toBe(0);
      expect(bus.onceListeners.size).toBe(0);
    });

    test('removeAllListeners with event name', () => {
      bus.on('a', jest.fn());
      bus.on('b', jest.fn());
      bus.removeAllListeners('a');
      expect(bus.listeners.has('a')).toBe(false);
      expect(bus.listeners.has('b')).toBe(true);
    });

    test('getListenerCount returns correct count', () => {
      bus.on('a', jest.fn());
      bus.on('a', jest.fn());
      bus.once('a', jest.fn());
      expect(bus.getListenerCount('a')).toBe(3);
      expect(bus.getListenerCount('nonexistent')).toBe(0);
    });
  });

  describe('ErrorHandler', () => {
    test('can be instantiated', () => {
      const instance = new ErrorHandler();
      expect(instance).toBeInstanceOf(ErrorHandler);
    });

    test('handle returns error info', () => {
      const error = new Error('test error');
      const info = ErrorHandler.handle(error, 'test-context');
      expect(info.message).toBe('test error');
      expect(info.context).toBe('test-context');
      expect(info.stack).toBeTruthy();
    });

    test('handle works without context', () => {
      const info = ErrorHandler.handle(new Error('bare'));
      expect(info.message).toBe('bare');
      expect(info.context).toBe('');
    });

    test('wrapAsync works without context', async () => {
      const fn = async () => 'ok';
      const wrapped = ErrorHandler.wrapAsync(fn);
      await expect(wrapped()).resolves.toBe('ok');
    });

    test('wrapAsync wraps async function with error handling', async () => {
      const fn = async () => 'ok';
      const wrapped = ErrorHandler.wrapAsync(fn, 'ctx');
      await expect(wrapped()).resolves.toBe('ok');
    });

    test('wrapAsync rethrows errors', async () => {
      const fn = async () => { throw new Error('fail'); };
      const wrapped = ErrorHandler.wrapAsync(fn, 'ctx');
      await expect(wrapped()).rejects.toThrow('fail');
    });

    test('wrapSync works without context', () => {
      const fn = () => 'ok';
      const wrapped = ErrorHandler.wrapSync(fn);
      expect(wrapped()).toBe('ok');
    });

    test('wrapSync wraps sync function', () => {
      const fn = () => 'ok';
      const wrapped = ErrorHandler.wrapSync(fn, 'ctx');
      expect(wrapped()).toBe('ok');
    });

    test('wrapSync rethrows errors', () => {
      const fn = () => { throw new Error('fail'); };
      const wrapped = ErrorHandler.wrapSync(fn, 'ctx');
      expect(() => wrapped()).toThrow('fail');
    });

    test('handle uses production format in production', () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      const error = new Error('prod error');
      const info = ErrorHandler.handle(error, 'prod-ctx');
      expect(info.message).toBe('prod error');
      process.env.NODE_ENV = origEnv;
    });
  });

  describe('RetryHandler', () => {
    test('retry succeeds on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await RetryHandler.retry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    test('retry retries on failure', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');
      const result = await RetryHandler.retry(fn, { maxAttempts: 3, delay: 10 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    test('retry throws after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('always fails'));
      await expect(RetryHandler.retry(fn, { maxAttempts: 2, delay: 10 })).rejects.toThrow('always fails');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    test('retry calls onRetry callback', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('ok');
      const onRetry = jest.fn();
      await RetryHandler.retry(fn, { maxAttempts: 2, delay: 10, onRetry });
      expect(onRetry).toHaveBeenCalledWith({
        attempt: 1,
        error: new Error('fail'),
        nextDelay: 10
      });
    });

    test('retry uses default options', async () => {
      const fn = jest.fn().mockResolvedValue('ok');
      await RetryHandler.retry(fn);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('ConfigManager', () => {
    let cm;

    beforeEach(() => {
      cm = new ConfigManager({ host: 'localhost', port: 8080 });
    });

    test('constructor stores defaults', () => {
      expect(cm.get('host')).toBe('localhost');
      expect(cm.get('port')).toBe(8080);
    });

    test('constructor works without defaults', () => {
      const empty = new ConfigManager();
      expect(empty.getAll()).toEqual({});
    });

    test('get returns default for missing key', () => {
      expect(cm.get('missing', 'fallback')).toBe('fallback');
    });

    test('get returns null default for missing key without default', () => {
      expect(cm.get('missing')).toBeNull();
    });

    test('set updates value', () => {
      cm.set('host', 'example.com');
      expect(cm.get('host')).toBe('example.com');
    });

    test('set notifies watchers', () => {
      const watcher = jest.fn();
      cm.watch('host', watcher);
      cm.set('host', 'new');
      expect(watcher).toHaveBeenCalledWith('new', 'localhost');
    });

    test('update sets multiple values', () => {
      cm.update({ host: 'new', port: 9090 });
      expect(cm.get('host')).toBe('new');
      expect(cm.get('port')).toBe(9090);
    });

    test('watch returns unsubscribe function', () => {
      const watcher = jest.fn();
      const unsub = cm.watch('host', watcher);
      unsub();
      cm.set('host', 'new');
      expect(watcher).not.toHaveBeenCalled();
    });

    test('watch unsubscribe is idempotent', () => {
      const watcher = jest.fn();
      const unsub = cm.watch('host', watcher);
      unsub();
      unsub();
      expect(true).toBe(true);
    });

    test('watch unsubscribe after reset', () => {
      const watcher = jest.fn();
      const unsub = cm.watch('host', watcher);
      cm.reset();
      unsub();
      expect(true).toBe(true);
    });

    test('watcher errors do not crash', () => {
      const watcher = jest.fn().mockImplementation(() => { throw new Error('fail'); });
      cm.watch('host', watcher);
      expect(() => cm.set('host', 'new')).not.toThrow();
    });

    test('watch supports multiple watchers on same key', () => {
      const a = jest.fn();
      const b = jest.fn();
      cm.watch('shared', a);
      cm.watch('shared', b);
      cm.set('shared', 'val');
      expect(a).toHaveBeenCalledWith('val', undefined);
      expect(b).toHaveBeenCalledWith('val', undefined);
    });

    test('getAll returns copy', () => {
      const all = cm.getAll();
      all.host = 'changed';
      expect(cm.get('host')).toBe('localhost');
    });

    test('reset clears config and listeners', () => {
      cm.set('key', 'val');
      cm.watch('key', jest.fn());
      cm.reset();
      expect(cm.get('key')).toBeNull();
      expect(cm.listeners.size).toBe(0);
    });
  });

  describe('splitLines', () => {
    test('splits by \\n', () => {
      expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
    });

    test('handles CRLF', () => {
      expect(splitLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c']);
    });

    test('handles empty string', () => {
      expect(splitLines('')).toEqual(['']);
    });
  });

  describe('readFileLines', () => {
    test('reads file and splits lines', () => {
      const fs = require('fs');
      const tmpFile = __dirname + '/_tmp_readfilelines_test.txt';
      fs.writeFileSync(tmpFile, 'hello\r\nworld\n!');
      const lines = readFileLines(tmpFile);
      expect(lines).toEqual(['hello', 'world', '!']);
      fs.unlinkSync(tmpFile);
    });
  });
});
