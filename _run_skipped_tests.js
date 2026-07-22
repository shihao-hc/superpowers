process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-key';
process.env.PORT = '3099';

const app = require('./server/index.js');
const http = require('http');

const server = app.listen(3099, '0.0.0.0', async () => {
  console.log('=== Server started on 3099 ===');

  const { fork } = require('child_process');
  const path = require('path');
  const testFiles = [
    'tests/integration/mcp-client.test.js',
    'tests/integration/skill-renderer.test.js',
    'tests/integration/vertical-domains.test.js',
    'tests/security/penetration.test.js'
  ];

  let allPassed = true;
  const testEnv = Object.assign({}, process.env, {
    TEST_BASE_URL: 'http://localhost:3099',
    API_KEY: 'test-key'
  });
  const vitestEntry = path.join(__dirname, 'node_modules', 'vitest', 'vitest.mjs');

  for (const file of testFiles) {
    console.log('\n=== Running: ' + file + ' ===');
    try {
      const out = await new Promise((resolve, reject) => {
        const child = fork(vitestEntry, ['run', file, '--reporter=verbose'], {
          cwd: __dirname,
          env: testEnv,
          stdio: 'pipe',
          execPath: 'node'
        });
        let stdout = '';
        child.stdout.on('data', d => { stdout += d.toString(); process.stdout.write(d); });
        let stderr = '';
        child.stderr.on('data', d => { stderr += d.toString(); process.stderr.write(d); });
        child.on('exit', (code) => {
          if (code === 0) resolve(stdout);
          else reject(new Error(`exit code ${code}\n${stdout}`));
        });
        child.on('error', reject);
      });
    } catch (e) {
      console.log('FAILED:', e.message.substring(0, 500));
      allPassed = false;
    }
  }

  console.log('\n=== All tests ' + (allPassed ? 'PASSED' : 'HAD FAILURES') + ' ===');
  server.close(() => process.exit(allPassed ? 0 : 1));
});
