const http = require('http');
const { VisionExecutor } = require('../../src/skills/executors/VisionExecutor');

describe('VisionExecutor ("eyes" - local vision model)', () => {
  let origRequest;

  beforeEach(() => {
    origRequest = http.request;
  });

  afterEach(() => {
    http.request = origRequest;
  });

  it('returns honest error when image missing', async () => {
    const r = await VisionExecutor.execute({});
    expect(r.ok).toBe(false);
    expect(r.error).toContain('image');
  });

  it('understands an image via vision model (mock Ollama response)', async () => {
    http.request = jest.fn((opts, cb) => {
      const mockRes = {
        on: (ev, handler) => {
          if (ev === 'data') { handler(JSON.stringify({ response: '这是 example.com 的网页截图' })); }
          if (ev === 'end') { handler(); }
        }
      };
      cb(mockRes);
      return { on: jest.fn(), write: jest.fn(), end: jest.fn(), setHeader: jest.fn(), setTimeout: jest.fn(), destroy: jest.fn() };
    });
    const r = await VisionExecutor.execute({ image: 'aGVsbG8=', prompt: '描述' });
    expect(r.ok).toBe(true);
    expect(r.result.type).toBe('vision');
    expect(r.result.description).toContain('example.com');
  });

  it('reads image from file path', async () => {
    http.request = jest.fn((opts, cb) => {
      const mockRes = {
        on: (ev, handler) => {
          if (ev === 'data') { handler(JSON.stringify({ response: '图片内容描述' })); }
          if (ev === 'end') { handler(); }
        }
      };
      cb(mockRes);
      return { on: jest.fn(), write: jest.fn(), end: jest.fn(), setHeader: jest.fn(), setTimeout: jest.fn(), destroy: jest.fn() };
    });
    // 用临时文件（1x1 PNG base64）
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const tmp = path.join(os.tmpdir(), 'vision-test.png');
    fs.writeFileSync(tmp, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    const r = await VisionExecutor.execute({ image: tmp, prompt: '描述' });
    fs.unlinkSync(tmp);
    expect(r.ok).toBe(true);
    expect(r.result.description).toContain('图片内容描述');
  });
});