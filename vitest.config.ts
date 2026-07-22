import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.{ts,js}'],
    exclude: [
      'tests/analytics.test.ts',

      'tests/bootstrap.test.ts',
      'tests/messages.test.ts',
      'tests/platform.test.ts',
      'tests/screen.test.ts',
      'tests/session.test.ts',
      'tests/state.test.ts',
      'tests/tasks.test.ts',
      'tests/brainstorm-server/server.test.js',
      'tests/tools.test.ts',
    ],
    alias: {
      '@': '/src',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,js}', 'server/**/*.js'],
      exclude: ['src/**/*.d.ts', 'src/**/*.test.*'],
    },
    testTimeout: 10000,
  },
})
