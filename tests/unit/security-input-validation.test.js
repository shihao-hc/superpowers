const express = require('express');
const request = require('supertest');
const { strictInputValidation } = require('../../server/middleware/security');

function makeApp() {
  const app = express();
  app.use(strictInputValidation);
  app.post('/x', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('strictInputValidation', () => {
  test('rejects POST without Content-Type with 415 (not 500)', async () => {
    const app = makeApp();
    const res = await request(app).post('/x').set('Content-Type', '');
    expect(res.status).toBe(415);
  });

  test('accepts JSON content type', async () => {
    const app = makeApp();
    const res = await request(app).post('/x').set('Content-Type', 'application/json').send({ a: 1 });
    expect(res.status).toBe(200);
  });

  test('accepts multipart/form-data', async () => {
    const app = makeApp();
    const res = await request(app).post('/x').set('Content-Type', 'multipart/form-data');
    expect(res.status).toBe(200);
  });
});