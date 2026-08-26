const express = require('express');
const request = require('supertest');

jest.mock('../../server/middleware', () => ({
  authMiddleware: (req, res, next) => next(),
  sensitiveLimiter: (req, res, next) => next()
}));

const skillsRouter = require('../../server/routes/skills');

const app = express();
app.use(express.json());
app.use('/api/skills', skillsRouter);

describe('Skills routes (loadAll fix)', () => {
  it('GET /api/skills returns loaded commands', async () => {
    const res = await request(app).get('/api/skills');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const names = res.body.data.map((c) => c.name);
    expect(names).toContain('help');
    expect(names).toContain('status');
    expect(names).toContain('compact');
  });

  it('GET /api/skills/commands returns commands', async () => {
    const res = await request(app).get('/api/skills/commands');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it('POST /api/skills/execute returns 400 when command missing', async () => {
    const res = await request(app).post('/api/skills/execute').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('缺少命令');
  });

  it('POST /api/skills/execute runs status command', async () => {
    const res = await request(app).post('/api/skills/execute').send({ command: 'status' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('running');
  });

  it('POST /api/skills/execute returns 400 for unknown command', async () => {
    const res = await request(app).post('/api/skills/execute').send({ command: 'nonexistent' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('COMMAND_NOT_FOUND');
  });
});