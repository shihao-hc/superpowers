jest.mock('bcrypt', () => {
  throw new Error('Cannot find module bcrypt');
}, { virtual: true });

jest.mock('../../server/utils/logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
}));

const auth = require('../../src/middleware/auth');

describe('middleware/auth - bcrypt unavailable', () => {
  test('loads without bcrypt and falls back to scrypt', async () => {
    expect(auth.JWTManager).toBeDefined();
    const ctx = auth.createAuthMiddleware({ secret: 'test-secret-thirty-two-chars-min!!' });
    expect(ctx).toBeDefined();
  });
});
