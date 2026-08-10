describe('src/localInferencing/LocalEngine', () => {
  let LocalEngine;
  let engine;

  beforeEach(() => {
    LocalEngine = require('../../src/localInferencing/LocalEngine');
    engine = new LocalEngine();
  });

  test('starts with model not loaded', () => {
    expect(engine.modelLoaded).toBe(false);
  });

  test('loadModel sets flag and resolves true', async () => {
    await expect(engine.loadModel()).resolves.toBe(true);
    expect(engine.modelLoaded).toBe(true);
  });

  test('infer returns not-loaded before loadModel', () => {
    expect(engine.infer('hello')).toEqual({ ok: false, text: 'model-not-loaded' });
  });

  test('infer returns deterministic response after load', async () => {
    await engine.loadModel();
    expect(engine.infer('hello')).toEqual({ ok: true, text: 'LocalEngine response: hello' });
  });

  test('infer trims input', async () => {
    await engine.loadModel();
    expect(engine.infer('  padded  ')).toEqual({ ok: true, text: 'LocalEngine response: padded' });
  });

  test('infer handles undefined and empty input', async () => {
    await engine.loadModel();
    expect(engine.infer(undefined)).toEqual({ ok: true, text: 'LocalEngine response: ' });
    expect(engine.infer('')).toEqual({ ok: true, text: 'LocalEngine response: ' });
  });

  test('status reflects load state', async () => {
    expect(engine.status()).toEqual({ loaded: false });
    await engine.loadModel();
    expect(engine.status()).toEqual({ loaded: true });
  });
});
