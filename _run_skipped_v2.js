// Start server and run integration tests in the same process
process.env.NODE_ENV = 'test';
process.env.API_KEY = 'test-key';
process.env.PORT = '3097';

const app = require('./server/index.js');

const server = app.listen(3097, '0.0.0.0', async () => {
  // First verify health endpoint from within this process
  const http = require('http');
  
  function httpGet(url) {
    return new Promise((resolve, reject) => {
      http.get(url, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }).on('error', reject);
    });
  }

  const health = await httpGet('http://localhost:3097/api/health');
  console.log('Health check:', health.status, health.body);

  // Now run the integration test files via vitest (using fork instead of execSync + npx to avoid Windows cmd.exe hanging)
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
    TEST_BASE_URL: 'http://localhost:3097',
    API_KEY: 'test-key'
  });
  const vitestEntry = path.join(__dirname, 'node_modules', 'vitest', 'vitest.mjs');

  for (const file of testFiles) {
    console.log('\n=== ' + file + ' ===');
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
      console.log(out);
    } catch (e) {
      console.log('FAILED:', e.message.substring(0, 500));
      allPassed = false;
    }
  }

  console.log('\n=== All tests ' + (allPassed ? 'PASSED' : 'HAD FAILURES') + ' ===');
  server.close(() => process.exit(allPassed ? 0 : 1));
});
