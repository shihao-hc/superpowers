const express = require('express');
const request = require('supertest');
const { validateInput } = require('../../server/middleware');

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(validateInput());
  app.post('/x', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('validateInput (recursive prototype pollution)', () => {
  test('rejects nested __proto__ in body', async () => {
    const app = makeApp();
    // JSON.parse 产生自有属性 __proto__（真实 JSON 攻击形态；对象字面量的 __proto__ 是原型非自有属性）
    const payload = JSON.parse('{"a":{"b":{"__proto__":{"polluted":true}}}}');
    const res = await request(app).post('/x').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_INPUT');
  });

  test('rejects nested constructor key', async () => {
    const app = makeApp();
    const res = await request(app).post('/x').send({ data: { constructor: { prototype: 1 } } });
    expect(res.status).toBe(400);
  });

  test('accepts normal nested body', async () => {
    const app = makeApp();
    const res = await request(app).post('/x').send({ a: { b: { c: 1 } }, name: 'ok' });
    expect(res.status).toBe(200);
  });
});