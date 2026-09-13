const express = require('express');
const request = require('supertest');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../../server/middleware', () => ({
  apiVersion: (req, res, next) => next(),
  authMiddleware: (req, res, next) => { req.user = { id: 'test-user', role: 'user' }; next(); },
  authLimiter: (req, res, next) => next(),
  chatLimiter: (req, res, next) => next(),
  sensitiveLimiter: (req, res, next) => next(),
  memoryLimiter: (req, res, next) => next(),
  optionalAuth: (req, res, next) => { req.user = { id: 'test-user', role: 'user' }; next(); }
}));

jest.mock('../../server/services/dataMaskService', () => ({
  maskResponseBody: (req, res, next) => next(),
  maskValue: (v) => v,
  __esModule: true
}));

jest.mock('../../src/security/EnhancedAuthService', () => ({
  authService: {
    findUser: jest.fn(),
    verifyPassword: jest.fn(),
    validateToken: jest.fn()
  },
  __esModule: true
}));

jest.mock('../../server/utils/logger', () => ({
  infoLog: jest.fn(),
  errorLog: jest.fn(),
  warnLog: jest.fn()
}));

const routes = require('../../server/routes/index');
const app = express();
app.use('/api', routes);

describe('GET /api/files (document download)', () => {
  const origCwd = process.cwd();
  let tmpDir;
  let testFile;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'files-route-'));
    process.chdir(tmpDir);
    const dir = path.join(tmpDir, 'uploads', 'skills', 'docx');
    fs.mkdirSync(dir, { recursive: true });
    testFile = path.join(dir, 'test-doc.docx');
    fs.writeFileSync(testFile, 'fake docx content');
  });

  afterEach(() => {
    process.chdir(origCwd);
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* */ }
  });

  it('serves a generated file', async () => {
    const res = await request(app).get('/api/files/docx/test-doc.docx');
    expect(res.status).toBe(200);
    expect(res.text).toBe('fake docx content');
  });

  it('returns 404 for missing file', async () => {
    const res = await request(app).get('/api/files/docx/nope.docx');
    expect(res.status).toBe(404);
  });

  it('rejects invalid skillName (path traversal)', async () => {
    const res = await request(app).get('/api/files/..%2f..%2fetc/test-doc.docx');
    expect(res.status).toBe(400);
  });

  it('rejects invalid filename', async () => {
    const res = await request(app).get('/api/files/docx/..%2f..%2fpasswd');
    expect(res.status).toBe(400);
  });
});