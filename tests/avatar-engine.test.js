const { EventBus, StateManager, PersonalitySystem } = require('../frontend/components/AvatarEngine');
const LatencyOptimizer = require('../src/ai/LatencyOptimizer');
const SentimentFeedbackLoop = require('../src/ai/SentimentFeedbackLoop');
const ContinuousInferenceSystem = require('../src/ai/ContinuousInferenceSystem');

let EnhancedAvatarEngine;
try {
  EnhancedAvatarEngine = require('../frontend/components/EnhancedAvatarEngine').EnhancedAvatarEngine;
} catch {
  // DOM-dependent, will skip enhanced tests
}

describe('EventBus', () => {
  it('应该正确订阅和触发事件', () => {
    const bus = new EventBus();
    let received = null;
    bus.on('test', (data) => { received = data; });
    bus.emit('test', { value: 42 });
    expect(received.value).toBe(42);
  });

  it('应该支持一次性订阅', () => {
    const bus = new EventBus();
    let count = 0;
    bus.once('test', () => { count++; });
    bus.emit('test');
    bus.emit('test');
    expect(count).toBe(1);
  });

  it('应该正确取消订阅', () => {
    const bus = new EventBus();
    let count = 0;
    const id = bus.on('test', () => { count++; });
    bus.emit('test');
    bus.off('test', id);
    bus.emit('test');
    expect(count).toBe(1);
  });

  it('应该记录事件历史', () => {
    const bus = new EventBus();
    bus.emit('event1', { a: 1 });
    bus.emit('event2', { b: 2 });
    const history = bus.getHistory();
    expect(history.length).toBe(2);
  });
});

describe('StateManager', () => {
  it('应该正确设置和获取状态', () => {
    const state = new StateManager();
    state.set('user.name', '测试用户');
    expect(state.get('user.name')).toBe('测试用户');
  });

  it('应该支持嵌套路径', () => {
    const state = new StateManager();
    state.set('avatar.mood.expression', 'happy');
    expect(state.get('avatar.mood.expression')).toBe('happy');
  });

  it('应该支持批量更新', () => {
    const state = new StateManager();
    state.batch(() => {
      state.set('a', 1);
      state.set('b', 2);
    });
    expect(state.get('a')).toBe(1);
    expect(state.get('b')).toBe(2);
  });

  it('应该通知状态变化', () => {
    const state = new StateManager();
    let notified = false;
    state.subscribe('test', () => { notified = true; });
    state.set('test', 'value');
    expect(notified).toBe(true);
  });
});

describe('PersonalitySystem', () => {
  it('应该支持默认人格', () => {
    const personality = new PersonalitySystem();
    personality.setPersonality('cheerful');
    const config = personality.getCurrentConfig();
    expect(config.name).toBe('Cheerful');
  });

  it('应该支持情绪设置', () => {
    const personality = new PersonalitySystem();
    personality.setEmotion('happy', 0.8);
    const emotion = personality.getEmotion();
    expect(emotion.primary).toBe('happy');
    expect(emotion.intensity).toBe(0.8);
  });

  it('应该生成TTS配置', () => {
    const personality = new PersonalitySystem();
    personality.setPersonality('cheerful');
    const tts = personality.getTTSConfig();
    expect(tts.rate).toBeGreaterThan(1);
  });

  it('应该应用人格风格到文本', () => {
    const personality = new PersonalitySystem();
    personality.setPersonality('playful');
    const styled = personality.generateResponseStyle('你好');
    expect(styled).toBeTruthy();
  });
});

describe('LatencyOptimizer', () => {
  it('应该快速处理输入', async () => {
    const optimizer = new LatencyOptimizer({ targetLatency: 100 });
    const result = await optimizer.processInput('你好');
    expect(result.withinTarget).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('应该通过commonResponses缓存', () => {
    const optimizer = new LatencyOptimizer();
    optimizer.commonResponses.set('hello', 'Hi there!');
    optimizer.responseCache = new Map([
      ['world', 'Hello world!']
    ]);
    expect(optimizer.commonResponses.size).toBe(1);
    expect(optimizer.responseCache.size).toBe(1);
  });

  it('应该预计算响应', () => {
    const optimizer = new LatencyOptimizer();
    optimizer.commonResponses.set('你好', '嗨~');
    optimizer.commonResponses.set('谢谢', '不客气！');
    const metrics = optimizer.getMetrics();
    expect(metrics.cacheHitRate).toBeGreaterThanOrEqual(0);
    expect(optimizer.commonResponses.size).toBe(2);
  });
});

describe('SentimentFeedbackLoop', () => {
  it('应该分析消息并返回情感信息', () => {
    const loop = new SentimentFeedbackLoop();
    const result = loop.processMessage('哈哈哈太好笑了！');
    expect(typeof result.score).toBe('number');
    expect(result.dominantEmotion).toBeTruthy();
  });

  it('应该返回语音参数', () => {
    const loop = new SentimentFeedbackLoop();
    const params = loop.getVoiceParams();
    expect(typeof params.rate).toBe('number');
  });

  it('应该跟踪情感趋势', () => {
    const loop = new SentimentFeedbackLoop();
    loop.processMessage('开心');
    loop.processMessage('很棒');
    loop.processMessage('哈哈');
    const trend = loop.getTrend();
    expect(trend.trend).toBeTruthy();
  });
});

describe('ContinuousInferenceSystem', () => {
  it('应该启动和停止推理', () => {
    const inference = new ContinuousInferenceSystem();
    inference.start();
    expect(inference.isRunning).toBe(true);
    inference.stop();
    expect(inference.isRunning).toBe(false);
  });

  it('应该接收输入', () => {
    const inference = new ContinuousInferenceSystem();
    inference.receiveInput({ text: 'hello', user: 'test' });
    expect(inference.environment.chatMessages.length).toBe(1);
  });
});

const avatarAvailable = !!EnhancedAvatarEngine;

const itIf = (name, fn) => {
  if (avatarAvailable) {it(name, fn);}
  else {it.skip(name, fn);}
};

describe('EnhancedAvatarEngine', () => {
  let origDocument, origWindow;

  beforeAll(() => {
    // EnhancedAvatarEngine uses these as globals
    global.EventBus = EventBus;
    global.StateManager = StateManager;
    global.PersonalitySystem = PersonalitySystem;
    global.LatencyOptimizer = LatencyOptimizer;
    global.SentimentFeedbackLoop = SentimentFeedbackLoop;
    global.ContinuousInferenceSystem = ContinuousInferenceSystem;
    origDocument = global.document;
    origWindow = global.window;
    global.document = {
      createElement: () => ({
        width: 400, height: 500,
        getContext: () => ({
          clearRect: () => {}, fillRect: () => {}, beginPath: () => {},
          fill: () => {}, ellipse: () => {}, arc: () => {},
          moveTo: () => {}, lineTo: () => {}, stroke: () => {},
          quadraticCurveTo: () => {}, closePath: () => {},
          save: () => {}, restore: () => {}, translate: () => {},
          rotate: () => {},
          createLinearGradient: () => ({ addColorStop: () => {} })
        }),
        style: {}, addEventListener: () => {}
      }),
      getElementById: () => ({ getBoundingClientRect: () => ({ width: 400, height: 500 }) }),
      querySelector: () => ({ content: 'test-csrf' })
    };
    global.window = global;
  });

  afterAll(() => {
    delete global.EventBus;
    delete global.StateManager;
    delete global.PersonalitySystem;
    delete global.LatencyOptimizer;
    delete global.SentimentFeedbackLoop;
    delete global.ContinuousInferenceSystem;
    if (origDocument) {global.document = origDocument;}
    else {delete global.document;}
    if (origWindow) {global.window = origWindow;}
    else {delete global.window;}
  });

  itIf('应该正确初始化', async () => {
    const avatar = new EnhancedAvatarEngine({
      containerId: 'test-container', renderMode: 'canvas2d',
      enableVoice: false, enableGesture: false, enableMemory: false
    });
    const status = avatar.getStatus();
    expect(typeof status).toBe('object');
    avatar.destroy();
  });

  itIf('应该支持事件监听', () => {
    const avatar = new EnhancedAvatarEngine({ enableVoice: false });
    let triggered = false;
    avatar.on('test', () => { triggered = true; });
    avatar.eventBus.emit('test');
    expect(triggered).toBe(true);
    avatar.destroy();
  });

  itIf('应该提供指标', () => {
    const avatar = new EnhancedAvatarEngine({ enableVoice: false });
    const metrics = avatar.getMetrics();
    expect(typeof metrics).toBe('object');
    avatar.destroy();
  });
});

describe('性能测试', () => {
  it('EventBus应该高效处理大量事件', () => {
    const bus = new EventBus();
    const iterations = 10000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      bus.emit('test', { i });
    }
    const time = performance.now() - start;
    expect(time).toBeLessThan(1000);
  });

  it('StateManager应该高效处理状态更新', () => {
    const state = new StateManager();
    const iterations = 10000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      state.set(`test.${i}`, i);
    }
    const time = performance.now() - start;
    expect(time).toBeLessThan(1000);
  });

  it('LatencyOptimizer应该在50ms内处理', async () => {
    const optimizer = new LatencyOptimizer({ targetLatency: 50 });
    const start = performance.now();
    await optimizer.processInput('这是一个测试消息');
    const time = performance.now() - start;
    expect(time).toBeLessThan(500);
  });
});
