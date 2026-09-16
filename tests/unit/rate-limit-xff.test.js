const express = require('express');
const request = require('supertest');
const { createRateLimiter } = require('../../server/middleware');

function makeServer() {
  const app = express();
  app.use(createRateLimiter({ max: 3, windowMs: 60000 }));
  app.get('/', (_req, res) => res.json({ ok: true }));
  return app.listen(0);
}

describe('rate limiter XFF bypass protection', () => {
  let srv;
  afterEach(() => { if (srv) { srv.close(); srv = null; } });

  test('blocks after max requests from same client', async () => {
    srv = makeServer();
    for (let i = 0; i < 3; i++) {
      const r = await request(srv).get('/');
      expect(r.status).toBe(200);
    }
    const r4 = await request(srv).get('/');
    expect(r4.status).toBe(429);
  });

  test('changing X-Forwarded-For cannot bypass the limit', async () => {
    srv = makeServer();
    for (let i = 0; i < 3; i++) {
      const r = await request(srv).get('/').set('X-Forwarded-For', `1.2.3.${i}`);
      expect(r.status).toBe(200);
    }
    // 攻击者每次换 XFF → 若 key 用 XFF 则逃逸；key 只认真实 TCP IP → 仍 429
    const r4 = await request(srv).get('/').set('X-Forwarded-For', '9.9.9.9');
    expect(r4.status).toBe(429);
  });
});